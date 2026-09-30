import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerSubscription, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readProductExtras, readProductVariants, selectedExtrasAmount } from "../stores/product-pricing";
import { ownedStore, paymentCheckoutUrl, DAY_MS } from "./operations-helpers";
import { DEVELOPMENT_ORDER_TRACKING_SECRET, SubscriptionsService } from "./subscriptions.service";
import { readSubscriptionManageToken } from "./subscription-manage-token";
import { advanceBillingDate, cadenceLabel, isCadence, monthlyFactor, REPRICE_NOTICE_DAYS, subscriptionPrices, subscriptionTerms } from "./subscription-pricing";
import type { ListSubscribersQuery, PublicSubscriptionActionDto } from "./dto/subscribers.dto";

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
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId: subscription.storeId } }) : null;
    return subscriptionTerms(subscription, plan);
  }

  /** One state machine for the dashboard and the public page. */
  private async apply(subscription: CustomerSubscription, action: Action): Promise<CustomerSubscription> {
    const terms = await this.terms(subscription);
    if (!terms) throw new BadRequestException("Esta suscripción no se puede modificar");
    if (subscription.status === "CANCELED") throw new BadRequestException("Esta suscripción ya fue cancelada");
    if (action === "cancel") {
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id);
        return tx.customerSubscription.update({ where: { id: subscription.id }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
      });
    }
    if (action === "pause") {
      if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes pausar una suscripción activa");
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id);
        return tx.customerSubscription.update({ where: { id: subscription.id }, data: { status: "PAUSED", pausedAt: new Date() } });
      });
    }
    if (action === "resume") {
      if (subscription.status !== "PAUSED") throw new BadRequestException("Esta suscripción no está pausada");
      const earliest = new Date(Date.now() + (terms.noticeHours + 1) * 3_600_000);
      let next = subscription.nextBillingAt;
      while (next < earliest) next = advanceBillingDate(next, terms.interval, terms.count);
      return this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", pausedAt: null, missedCount: 0, nextBillingAt: next } });
    }
    if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes saltar entregas de una suscripción activa");
    return this.prisma.$transaction(async (tx) => {
      if (await this.subscriptions.cancelOpenRenewal(tx, subscription.id)) return tx.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
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

  async setEnabled(merchantId: string, storeId: string, enabled: boolean) {
    await ownedStore(this.prisma, merchantId, storeId);
    await this.prisma.store.update({ where: { id: storeId }, data: { subscriptionsEnabled: enabled } });
    const activeSubscribers = await this.prisma.customerSubscription.count({ where: { storeId, paymentLinkId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } } });
    return { enabled, activeSubscribers };
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
      if (unit === subscription.unitAmount) continue;
      await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { pendingUnitAmount: unit, pendingFrom: effectiveFrom } });
      affected += 1;
      const money = `${((unit * (subscription.quantity ?? 1)) / 100).toFixed(2)} ${subscription.currency ?? "BOB"}`;
      await this.subscriptions.sendSubscriptionNotice(subscription.customerEmail, `Nuevo precio de tu suscripción · ${store.name}`,
        `Hola ${subscription.customerName}, desde el ${effectiveFrom.toISOString().slice(0, 10)} tu entrega de ${subscription.itemName ?? product.name} costará ${money}. Si no estás de acuerdo, puedes cancelar aquí: ${this.subscriptions.manageUrl(subscription.id)}`);
    }
    return { affected, effectiveFrom: effectiveFrom.toISOString() };
  }

  private lockedUnit(product: { amount: number; variants: Prisma.JsonValue; extras: Prisma.JsonValue }, subscription: CustomerSubscription, discountPercent: number) {
    const variant = readProductVariants(product.variants).find(entry => entry.id === subscription.variantId);
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
    const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, status: "ACTIVE" } });
    if (!product) throw new BadRequestException("Este producto ya no está disponible.");
    const updated = await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: {
      cadence: dto.cadence, discountPercent: offer.discountPercent, unitAmount: this.lockedUnit(product, subscription, offer.discountPercent), pendingUnitAmount: null, pendingFrom: null,
    } });
    return this.view(updated);
  }

  private async view(subscription: CustomerSubscription) {
    const [store, offers, open, history] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: subscription.storeId }, select: { name: true } }),
      this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: subscription.paymentLinkId! } }),
      this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } }),
      this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: subscription.id }, orderBy: { periodStart: "desc" }, take: 5 }),
    ]);
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
      cadenceOptions: offers.filter(offer => isCadence(offer.cadence)).map(offer => ({ cadence: offer.cadence, label: cadenceLabel(offer.cadence as never), discountPercent: offer.discountPercent })),
    };
  }

  async list(merchantId: string, storeId: string, query: ListSubscribersQuery) {
    await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const where: Prisma.CustomerSubscriptionWhereInput = {
      storeId,
      ...(query.status === "PENDING" ? { status: "ACTIVE", id: { in: (await this.prisma.subscriptionInvoice.findMany({ where: { storeId, status: "DUE", dueAt: { lte: now } }, select: { subscriptionId: true } })).map(row => row.subscriptionId) } }
        : query.status ? { status: query.status } : {}),
      ...(query.productId ? { paymentLinkId: query.productId } : {}),
      ...(query.q ? { OR: [{ customerName: { contains: query.q, mode: "insensitive" } }, { customerEmail: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const page = await this.prisma.customerSubscription.findMany({ where, orderBy: [{ nextBillingAt: "asc" }, { id: "asc" }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
    const items = await this.rows(page.slice(0, 50));
    return { items, nextCursor: page.length > 50 ? page[49].id : null };
  }

  async summary(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const active = await this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE" } });
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
    };
  }

  /** Plan subscriptions count as live; product subscriptions are live when their first order was paid in live mode. */
  private async liveIds(subscriptions: CustomerSubscription[]) {
    const orderIds = [...new Set(subscriptions.map(subscription => subscription.sourceOrderId).filter((id): id is string => !!id))];
    const orders = orderIds.length ? await this.prisma.storeOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, paymentIntent: { select: { livemode: true } } } }) : [];
    const liveOrders = new Set(orders.filter(order => order.paymentIntent.livemode).map(order => order.id));
    return new Set(subscriptions.filter(subscription => !subscription.sourceOrderId || liveOrders.has(subscription.sourceOrderId)).map(subscription => subscription.id));
  }

  private async rows(subscriptions: CustomerSubscription[]) {
    const now = new Date();
    const live = await this.liveIds(subscriptions);
    const planIds = [...new Set(subscriptions.map(subscription => subscription.planId).filter((id): id is string => !!id))];
    const plans = planIds.length ? await this.prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } }) : [];
    const ids = subscriptions.map(subscription => subscription.id);
    const invoices = ids.length ? await this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: ids }, status: { in: ["DUE", "PAID"] } }, orderBy: { periodStart: "desc" } }) : [];
    return subscriptions.map(subscription => {
      const plan = plans.find(entry => entry.id === subscription.planId) ?? null;
      const terms = subscriptionTerms(subscription, plan, now);
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
      };
    });
  }

  async resend(merchantId: string, storeId: string, id: string) {
    const subscription = await this.owned(merchantId, storeId, id);
    const open = await this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } });
    if (!open) throw new NotFoundException("No hay una entrega pendiente de pago");
    const result = await this.subscriptions.remindSubscriptionInvoice(merchantId, storeId, open.id, false);
    const item = subscription.itemName ?? "tu suscripción";
    return { checkoutUrl: result.checkoutUrl, sent: result.sent, whatsappText: `Hola ${subscription.customerName}, tu pedido de ${item} está listo. Págalo con un toque: ${result.checkoutUrl}` };
  }
}
