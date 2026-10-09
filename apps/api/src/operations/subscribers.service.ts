import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerSubscription, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readProductExtras, readProductVariants, selectedExtrasAmount } from "../stores/product-pricing";
import { ownedStore, paymentCheckoutUrl, DAY_MS } from "./operations-helpers";
import { DEVELOPMENT_ORDER_TRACKING_SECRET, SubscriptionsService } from "./subscriptions.service";
import { isLiveOrigin, originLivemodes } from "./subscription-origin";
import { readSubscriptionManageToken } from "./subscription-manage-token";
import { advanceBillingDate, cadenceLabel, isCadence, monthlyFactor, REPRICE_NOTICE_DAYS, subscriptionConsentText, subscriptionPrices, subscriptionTerms } from "./subscription-pricing";
import { membershipState, membershipTermsPeriod, MEMBERSHIP_STATE_LABEL, periodLabel } from "../memberships/membership-rules";
import type { ListSubscribersQuery, PublicSubscriptionActionDto } from "./dto/subscribers.dto";

const STATE_CHANGED = "El estado de la suscripción cambió; actualiza la página e inténtalo de nuevo.";
type Action = "skip" | "pause" | "resume" | "cancel";

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService, private readonly subscriptions: SubscriptionsService, private readonly config: ConfigService) {}

  private secret() { return this.config.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET; }

  private async owned(merchantId: string, storeId: string, id: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const subscription = await this.prisma.customerSubscription.findFirst({ where: { id, merchantId, storeId } });
    if (!subscription) throw new NotFoundException("Suscripción no encontrada");
    return subscription;
  }

  private async fromToken(token: string) {
    const id = readSubscriptionManageToken(token, this.secret());
    const subscription = id ? await this.prisma.customerSubscription.findUnique({ where: { id } }) : null;
    if (!subscription || !subscription.paymentLinkId) throw new NotFoundException("Suscripción no encontrada");
    return subscription;
  }

  private async terms(subscription: CustomerSubscription) {
    if (subscription.membershipPeriodId) return subscriptionTerms(subscription, null, new Date(), membershipTermsPeriod(subscription, await this.subscriptions.membershipPeriodsFor([subscription])));
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId: subscription.storeId } }) : null;
    return subscriptionTerms(subscription, plan);
  }

  /** One state machine for the dashboard and the public page. */
  private async apply(subscription: CustomerSubscription, action: Action): Promise<CustomerSubscription> {
    if (subscription.membershipPeriodId && action !== "cancel") throw new BadRequestException("Las membresías solo se pueden cancelar desde aquí.");
    const terms = await this.terms(subscription);
    if (!terms) throw new BadRequestException("Esta suscripción no se puede modificar");
    if (subscription.status === "CANCELED") throw new BadRequestException("Esta suscripción ya fue cancelada");
    if (action === "cancel") {
      const precheck = await this.subscriptions.precheckOpenRenewal(subscription.id); // bank call, before the transaction
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id, precheck);
        return tx.customerSubscription.update({ where: { id: subscription.id }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
      });
    }
    if (action === "pause") {
      if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes pausar una suscripción activa");
      const precheck = await this.subscriptions.precheckOpenRenewal(subscription.id); // bank call, before the transaction
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id, precheck);
        const paused = await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: new Date() } });
        if (!paused.count) throw new ConflictException(STATE_CHANGED);
        return tx.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
      });
    }
    if (action === "resume") {
      if (subscription.status !== "PAUSED") throw new BadRequestException("Esta suscripción no está pausada");
      const earliest = new Date(Date.now() + (terms.noticeHours + 1) * 3_600_000);
      let next = subscription.nextBillingAt;
      while (next < earliest) next = advanceBillingDate(next, terms.interval, terms.count);
      return this.prisma.$transaction(async (tx) => {
        const resumed = await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "PAUSED" }, data: { status: "ACTIVE", pausedAt: null, missedCount: 0, nextBillingAt: next } });
        if (!resumed.count) throw new ConflictException(STATE_CHANGED);
        return tx.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
      });
    }
    if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes saltar entregas de una suscripción activa");
    const precheck = await this.subscriptions.precheckOpenRenewal(subscription.id); // bank call, before the transaction
    return this.prisma.$transaction(async (tx) => {
      if (await this.subscriptions.cancelOpenRenewal(tx, subscription.id, precheck)) return tx.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
      // cancelOpenRenewal also declines when the payment is in flight; that renewal stays payable, so the date must not move.
      const stillOpen = await tx.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, select: { id: true } });
      if (stillOpen) throw new ConflictException("Tu pago está en proceso; espera a que termine");
      const moved = await tx.customerSubscription.updateMany({
        where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
        data: { nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) },
      });
      if (!moved.count) throw new ConflictException("Tu renovación ya se generó; puedes pagarla o saltarla");
      return tx.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
    });
  }

  async act(merchantId: string, storeId: string, id: string, action: Action) {
    const updated = await this.apply(await this.owned(merchantId, storeId, id), action);
    return (await this.rows([updated]))[0];
  }

  async setEnabled(merchantId: string, storeId: string, enabled: boolean, membershipGraceDays?: number) {
    await ownedStore(this.prisma, merchantId, storeId);
    await this.prisma.store.update({ where: { id: storeId }, data: { subscriptionsEnabled: enabled, ...(membershipGraceDays !== undefined ? { membershipGraceDays } : {}) } });
    const activeSubscribers = await this.prisma.customerSubscription.count({ where: { storeId, paymentLinkId: { not: null }, membershipPeriodId: null, status: { in: ["ACTIVE", "PAUSED"] } } });
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { membershipGraceDays: true } });
    return { enabled, activeSubscribers, membershipGraceDays: store.membershipGraceDays };
  }

  async reprice(merchantId: string, storeId: string, productId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const product = await this.prisma.paymentLink.findFirst({ where: { id: productId, storeId } });
    if (!product) throw new NotFoundException("Producto no encontrado");
    const effectiveFrom = new Date(Date.now() + REPRICE_NOTICE_DAYS * DAY_MS);
    const subscribers = await this.prisma.customerSubscription.findMany({ where: { storeId, paymentLinkId: productId, status: { in: ["ACTIVE", "PAUSED"] } } });
    let affected = 0;
    for (const subscription of subscribers) {
      const unit = this.lockedUnit(product, subscription, subscription.discountPercent ?? 0);
      if (unit === null) continue;
      if (unit === subscription.unitAmount) {
        if (subscription.pendingUnitAmount !== null || subscription.pendingFrom) {
          await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { pendingUnitAmount: null, pendingFrom: null } });
        }
        continue;
      }
      if (subscription.pendingUnitAmount === unit && subscription.pendingFrom) continue;
      await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { pendingUnitAmount: unit, pendingFrom: effectiveFrom } });
      affected += 1;
      const money = `${((unit * (subscription.quantity ?? 1)) / 100).toFixed(2)} ${subscription.currency ?? "BOB"}`;
      await this.subscriptions.sendSubscriptionNotice(subscription.customerEmail, `Nuevo precio de tu suscripción · ${store.name}`,
        `Hola ${subscription.customerName}, desde el ${effectiveFrom.toISOString().slice(0, 10)} tu entrega de ${subscription.itemName ?? product.name} costará ${money}. Si no estás de acuerdo, puedes cancelar aquí: ${this.subscriptions.manageUrl(subscription.id)}`);
    }
    return { affected, effectiveFrom: effectiveFrom.toISOString() };
  }

  private lockedUnit(product: { amount: number; variants: Prisma.JsonValue; extras: Prisma.JsonValue }, subscription: CustomerSubscription, discountPercent: number): number | null {
    const variant = subscription.variantId ? readProductVariants(product.variants).find(entry => entry.id === subscription.variantId) : undefined;
    if (subscription.variantId && !variant) return null;
    const extras = readProductExtras(product.extras);
    const picked = subscription.extraIds.flatMap(id => extras.filter(extra => extra.id === id));
    const base = variant?.amount ?? product.amount;
    return subscriptionPrices({ baseAmount: base, oneTimeAmount: base, extrasAmount: selectedExtrasAmount(picked), discountPercent }).lockedUnitAmount;
  }

  async publicView(token: string) {
    return this.view(await this.fromToken(token));
  }

  async publicAct(token: string, dto: PublicSubscriptionActionDto) {
    const subscription = await this.fromToken(token);
    if (dto.action !== "change_cadence") return this.view(await this.apply(subscription, dto.action));
    if (subscription.status === "CANCELED") throw new BadRequestException("Esta suscripción ya fue cancelada");
    const offers = await this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: subscription.paymentLinkId! } });
    const offer = offers.find(option => option.cadence === dto.cadence);
    if (!dto.cadence || !offer) throw new BadRequestException("Esa frecuencia ya no está disponible.");
    if (dto.cadence === subscription.cadence) throw new BadRequestException("Ya tienes esa frecuencia.");
    const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, status: "ACTIVE" } });
    if (!product) throw new BadRequestException("Este producto ya no está disponible.");
    const unitAmount = this.lockedUnit(product, subscription, offer.discountPercent);
    if (unitAmount === null) throw new BadRequestException("La presentación que elegiste ya no está disponible.");
    const updated = await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: {
      cadence: dto.cadence, discountPercent: offer.discountPercent, unitAmount, pendingUnitAmount: null, pendingFrom: null,
      // The buyer agreed to a different cadence: the record of what they accepted must say so.
      consentText: subscriptionConsentText(dto.cadence), consentAt: new Date(),
    } });
    return this.view(updated);
  }

  private async view(subscription: CustomerSubscription) {
    const [store, offers, open, history, product] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: subscription.storeId }, select: { name: true } }),
      this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: subscription.paymentLinkId! } }),
      this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } }),
      this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: subscription.id }, orderBy: { periodStart: "desc" }, take: 5 }),
      this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, status: "ACTIVE" } }),
    ]);
    const fee = Number((subscription.fulfillment as { fee?: unknown } | null)?.fee) || 0;
    // What one delivery would cost under each cadence, with the same helper the change itself uses.
    const optionAmount = (discountPercent: number) => {
      const unit = product ? this.lockedUnit(product, subscription, discountPercent) : null;
      return unit === null ? null : unit * (subscription.quantity ?? 1) + fee;
    };
    const intent = open?.paymentIntentId ? await this.prisma.paymentIntent.findUnique({ where: { id: open.paymentIntentId } }) : null;
    const terms = subscriptionTerms(subscription, null);
    const cadence = isCadence(subscription.cadence) ? subscription.cadence : "MONTHLY";
    return {
      storeName: store?.name ?? "",
      itemName: subscription.itemName ?? "",
      cadence, cadenceLabel: cadenceLabel(cadence),
      amount: terms?.amount ?? 0, currency: terms?.currency ?? "BOB",
      nextBillingAt: subscription.nextBillingAt.toISOString(),
      status: subscription.status,
      openPayment: open && intent?.status === PaymentIntentStatus.REQUIRES_PAYMENT_METHOD
        ? { checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret), amount: open.amount, dueAt: open.dueAt.toISOString() } : null,
      history: history.map(entry => ({ periodStart: entry.periodStart.toISOString(), status: entry.status, amount: entry.amount })),
      cadenceOptions: offers.filter(offer => isCadence(offer.cadence)).map(offer => ({ cadence: offer.cadence, label: cadenceLabel(offer.cadence as never), discountPercent: offer.discountPercent, amount: offer.cadence === subscription.cadence ? (terms?.amount ?? optionAmount(offer.discountPercent)) : optionAmount(offer.discountPercent) })),
    };
  }

  async list(merchantId: string, storeId: string, query: ListSubscribersQuery) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const where: Prisma.CustomerSubscriptionWhereInput = {
      storeId,
      ...(query.kind === "membership" ? { membershipPeriodId: { not: null } } : { membershipPeriodId: null }),
      ...(query.status === "PENDING" ? { status: "ACTIVE", id: { in: (await this.prisma.subscriptionInvoice.findMany({ where: { storeId, status: "DUE", dueAt: { lte: now } }, select: { subscriptionId: true } })).map(row => row.subscriptionId) } }
        : query.status ? { status: query.status } : {}),
      ...(query.productId ? { paymentLinkId: query.productId } : {}),
      ...(query.q ? { OR: [{ customerName: { contains: query.q, mode: "insensitive" } }, { customerEmail: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const page = await this.prisma.customerSubscription.findMany({ where, orderBy: [{ nextBillingAt: "asc" }, { id: "asc" }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
    const items = await this.rows(page.slice(0, 50), store.membershipGraceDays);
    return { items, nextCursor: page.length > 50 ? page[49].id : null };
  }

  async summary(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const active = await this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE", membershipPeriodId: null } });
    const live = await this.liveIds(active);
    const liveActive = active.filter(subscription => live.has(subscription.id));
    let monthlyRecurring = 0;
    let currency = "BOB";
    for (const subscription of liveActive) {
      const terms = await this.terms(subscription);
      if (!terms) continue;
      currency = terms.currency;
      monthlyRecurring += Math.round(terms.amount * monthlyFactor(terms.interval, terms.count));
    }
    const memberRows = await this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE", membershipPeriodId: { not: null } } });
    const liveMembers = await this.liveIds(memberRows);
    const memberPeriods = await this.subscriptions.membershipPeriodsFor(memberRows);
    let memberMonthly = 0;
    for (const row of memberRows) {
      if (!liveMembers.has(row.id)) continue;
      const months = memberPeriods.get(row.membershipPeriodId!)?.months;
      if (months && row.unitAmount) memberMonthly += Math.round(row.unitAmount / months);
    }
    const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [paid, missed] = await Promise.all([
      this.prisma.subscriptionInvoice.count({ where: { storeId, orderId: { not: null }, status: "PAID", dueAt: { gte: since } } }),
      this.prisma.subscriptionInvoice.count({ where: { storeId, orderId: { not: null }, status: "MISSED", dueAt: { gte: since } } }),
    ]);
    return {
      active: liveActive.length, monthlyRecurring, currency,
      renewalsThisWeek: liveActive.filter(subscription => subscription.nextBillingAt >= now && subscription.nextBillingAt <= weekAhead).length,
      renewalPayRate: paid + missed ? paid / (paid + missed) : null,
      enabled: store.subscriptionsEnabled,
      members: { active: memberRows.filter(row => liveMembers.has(row.id)).length, monthlyRecurring: memberMonthly, currency },
      membershipGraceDays: store.membershipGraceDays,
    };
  }

  /** Plan subscriptions count as live; product subscriptions are live when their first order was paid in live mode. */
  private async liveIds(subscriptions: CustomerSubscription[]) {
    const origins = await originLivemodes(this.prisma, subscriptions);
    return new Set(subscriptions.filter(subscription => isLiveOrigin(subscription, origins)).map(subscription => subscription.id));
  }

  private async rows(subscriptions: CustomerSubscription[], graceDays = 7) {
    const now = new Date();
    const periods = await this.subscriptions.membershipPeriodsFor(subscriptions);
    const live = await this.liveIds(subscriptions);
    const planIds = [...new Set(subscriptions.map(subscription => subscription.planId).filter((id): id is string => !!id))];
    const plans = planIds.length ? await this.prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } }) : [];
    const ids = subscriptions.map(subscription => subscription.id);
    const invoices = ids.length ? await this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: ids }, status: { in: ["DUE", "PAID"] } }, orderBy: { periodStart: "desc" } }) : [];
    return subscriptions.map(subscription => {
      const plan = plans.find(entry => entry.id === subscription.planId) ?? null;
      const terms = subscription.membershipPeriodId ? subscriptionTerms(subscription, null, now, membershipTermsPeriod(subscription, periods)) : subscriptionTerms(subscription, plan, now);
      const pending = invoices.some(invoice => invoice.subscriptionId === subscription.id && invoice.status === "DUE" && invoice.dueAt <= now);
      const lastPaid = invoices.find(invoice => invoice.subscriptionId === subscription.id && invoice.status === "PAID");
      const cadence = isCadence(subscription.cadence) ? subscription.cadence : null;
      return {
        id: subscription.id, kind: subscription.paymentLinkId ? "product" as const : "plan" as const,
        customerName: subscription.customerName, customerEmail: subscription.customerEmail, customerPhone: subscription.customerPhone,
        itemName: subscription.itemName ?? plan?.name ?? "", productId: subscription.paymentLinkId,
        cadence, cadenceLabel: cadence ? cadenceLabel(cadence) : plan?.interval === "WEEKLY" ? "cada semana" : plan?.interval === "YEARLY" ? "cada año" : "cada mes",
        amount: terms?.amount ?? 0, currency: terms?.currency ?? "BOB",
        nextBillingAt: subscription.nextBillingAt.toISOString(), status: subscription.status,
        displayStatus: (subscription.status === "ACTIVE" && pending ? "PENDING_PAYMENT" : subscription.status) as "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING_PAYMENT",
        lastPaidAt: lastPaid?.paidAt?.toISOString() ?? null,
        livemode: live.has(subscription.id),
        ...(subscription.membershipPeriodId ? (() => {
          const state = membershipState(subscription, graceDays, now);
          const months = periods.get(subscription.membershipPeriodId!)?.months ?? 1;
          return { kind: "membership" as const, periodLabel: periodLabel(months), cadenceLabel: periodLabel(months), accessUntil: subscription.accessUntil?.toISOString() ?? null, membershipState: state, membershipStateLabel: MEMBERSHIP_STATE_LABEL[state] };
        })() : {}),
      };
    });
  }

  async resend(merchantId: string, storeId: string, id: string) {
    const subscription = await this.owned(merchantId, storeId, id);
    if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes reenviar el enlace de una suscripción activa");
    const open = await this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } });
    if (!open) throw new NotFoundException("No hay una entrega pendiente de pago");
    const result = await this.subscriptions.remindSubscriptionInvoice(merchantId, storeId, open.id, false);
    if (result.blocked || !result.checkoutUrl) throw new ConflictException(result.blocked === "paid" ? "El pago ya se recibió en el banco; actualiza la lista en unos minutos." : "No pudimos confirmar el estado del QR con el banco; intenta de nuevo más tarde.");
    const item = subscription.itemName ?? "tu suscripción";
    return { checkoutUrl: result.checkoutUrl, sent: result.sent, whatsappText: `Hola ${subscription.customerName}, tu pedido de ${item} está listo. Págalo con un toque: ${result.checkoutUrl}` };
  }
}
