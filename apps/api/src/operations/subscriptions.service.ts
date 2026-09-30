import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerSubscription, MerchantStatus, OrderFulfillmentStatus, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import {
  CreateSubscriptionDto,
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
  UpdateSubscriptionStatusDto
} from "./dto/operations.dto";
import { ownedStore, clean, paymentCheckoutUrl, subscriptionIdentityKey, readStockVariants, DAY_MS } from "./operations-helpers";
import { advanceBillingDate, LAST_REMINDER_AFTER_DAYS, MISSED_AFTER_DAYS, subscriptionTerms, type SubscriptionTerms } from "./subscription-pricing";
import { subscriptionManageUrl } from "./subscription-manage-token";
import { originLivemodes, originMatchesStore } from "./subscription-origin";

/** A QR lives about 24 h; past this an untouched REQUIRES_ACTION intent is dead and may be replaced. */
export const STALE_QR_HOURS = 25;
/** Baneco sends a date-only dueDate, so its QR can stay payable for up to ~48 h. */
export const STALE_BANECO_QR_HOURS = 49;
/** Bank verdict on an old Baneco QR, resolved BEFORE any transaction opens; "not-applicable" = nothing to ask (other rail, test mode, not stale). */
export type StaleQrOutcome = "paid" | "unknown" | "unpaid" | "not-applicable";
export type OpenRenewalPrecheck = { invoiceId: string | null; outcome: StaleQrOutcome };
const needsBankCheck = (intent: { railId?: string | null; livemode?: boolean }) => intent.railId === "baneco_qr" && intent.livemode !== false;
const staleQrCutoff = (railId?: string | null, now = Date.now()) => new Date(now - (railId === "baneco_qr" ? STALE_BANECO_QR_HOURS : STALE_QR_HOURS) * 3_600_000);

export const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";

type RenewalFulfillment = { method?: string; locationId?: string; locationName?: string; zoneId?: string; zoneName?: string; fee?: number; address?: string };
const renewalFulfillment = (subscription: { fulfillment: Prisma.JsonValue }) => (subscription.fulfillment ?? {}) as RenewalFulfillment;
function renewalFulfillmentMetadata(f: RenewalFulfillment) {
  if (f.zoneId) return { shipping: { id: f.zoneId, name: f.zoneName, amount: f.fee ?? 0, address: f.address } };
  if (f.locationId) return { fulfillment: { locationId: f.locationId, locationName: f.locationName, method: f.method, ...(f.address ? { address: f.address } : {}) } };
  return {};
}


/** Recurring subscriptions: plans, customer subscriptions, invoice generation, payment links, and reminder emails. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly loggedOriginSkips = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  async createSubscriptionPlan(merchantId: string, storeId: string, dto: CreateSubscriptionPlanDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.subscriptionPlan.create({ data: { merchantId, storeId, name: dto.name.trim(), amount: dto.amount, currency: dto.currency ?? "BOB", interval: dto.interval ?? "MONTHLY", intervalCount: dto.intervalCount ?? 1, reminderHoursBefore: dto.reminderHoursBefore ?? 24 } });
  }
  async updateSubscriptionPlan(merchantId: string, storeId: string, planId: string, dto: UpdateSubscriptionPlanDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: planId, merchantId, storeId, isActive: true } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    if (dto.scope === "NEXT_ONLY") {
      if (!dto.amount) throw new BadRequestException("Indica el monto que se aplicará solo al próximo cobro");
      if (dto.name || dto.interval || dto.intervalCount || dto.reminderHoursBefore !== undefined) {
        throw new BadRequestException("El alcance 'solo el próximo cobro' admite únicamente un cambio de monto");
      }
      const result = await this.prisma.customerSubscription.updateMany({
        where: { merchantId, storeId, planId, status: { in: ["ACTIVE", "PAUSED"] } },
        data: { nextAmountOverride: dto.amount },
      });
      return { plan, scope: dto.scope, affectedSubscriptions: result.count, nextAmount: dto.amount };
    }
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.amount ? { amount: dto.amount } : {}),
        ...(dto.interval ? { interval: dto.interval } : {}),
        ...(dto.intervalCount ? { intervalCount: dto.intervalCount } : {}),
        ...(dto.reminderHoursBefore !== undefined ? { reminderHoursBefore: dto.reminderHoursBefore } : {}),
      },
    });
    return { plan: updated, scope: dto.scope, affectedSubscriptions: await this.prisma.customerSubscription.count({ where: { merchantId, storeId, planId, status: { in: ["ACTIVE", "PAUSED"] } } }) };
  }
  async createSubscription(merchantId: string, storeId: string, dto: CreateSubscriptionDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: dto.planId, storeId, isActive: true } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    const customer = dto.customerId ? await this.prisma.businessCustomer.findFirst({ where: { id: dto.customerId, storeId } }) : null;
    if (dto.customerId && !customer) throw new BadRequestException("El cliente no pertenece a esta tienda");
    const customerName = customer?.name ?? dto.customerName.trim();
    const customerEmail = customer?.email ?? clean(dto.customerEmail)?.toLowerCase() ?? null;
    const customerPhone = customer?.phone ?? clean(dto.customerPhone);
    const identityCustomerId = customer?.id ?? dto.customerId;
    const activeKey = subscriptionIdentityKey(storeId, plan.id, { id: identityCustomerId, email: customerEmail, phone: customerPhone, name: customerName });
    let duplicate = await this.prisma.customerSubscription.findUnique({ where: { activeKey } });
    if (!duplicate) {
      const identities: Array<{ customerId: string } | { customerEmail: string } | { customerPhone: string }> = [];
      if (identityCustomerId) identities.push({ customerId: identityCustomerId });
      if (customerEmail) identities.push({ customerEmail });
      if (customerPhone) identities.push({ customerPhone });
      duplicate = await this.prisma.customerSubscription.findFirst({
        where: {
          storeId,
          planId: plan.id,
          status: { in: ["ACTIVE", "PAUSED"] },
          ...(identities.length > 0 ? { OR: identities } : { customerName: { equals: customerName, mode: "insensitive" } }),
        },
      });
    }
    if (duplicate) throw new ConflictException("Este cliente ya tiene una suscripción activa o pausada para el mismo plan");
    const nextBillingAt = new Date(dto.nextBillingAt);
    if (nextBillingAt.getTime() < Date.now() - DAY_MS) throw new BadRequestException("La primera fecha de cobro no puede estar en el pasado");
    return this.prisma.customerSubscription.create({ data: { merchantId, storeId, planId: plan.id, customerId: customer?.id ?? dto.customerId, customerName, customerEmail, customerPhone, amountOverride: dto.amountOverride, nextBillingAt, activeKey } });
  }
  async updateSubscriptionStatus(merchantId: string, storeId: string, subscriptionId: string, dto: UpdateSubscriptionStatusDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: subscriptionId, merchantId, storeId } });
    if (!subscription) throw new NotFoundException("Subscription not found");
    if (subscription.paymentLinkId) throw new BadRequestException("Gestiona esta suscripción desde Suscripciones");
    if (subscription.status === "CANCELED" && dto.status !== "CANCELED") throw new BadRequestException("Una suscripción cancelada no puede reactivarse; crea una nueva");
    const activeKey = dto.status === "CANCELED" || !subscription.planId ? null : subscriptionIdentityKey(storeId, subscription.planId, {
      id: subscription.customerId,
      email: subscription.customerEmail,
      phone: subscription.customerPhone,
      name: subscription.customerName,
    });
    const conflict = activeKey ? await this.prisma.customerSubscription.findFirst({ where: { activeKey, id: { not: subscription.id } } }) : null;
    if (conflict) throw new ConflictException("Ya existe otra suscripción para este cliente y plan");
    return this.prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { status: dto.status, activeKey, canceledAt: dto.status === "CANCELED" ? new Date() : null },
    });
  }
  manageUrl(subscriptionId: string): string {
    return subscriptionManageUrl(this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174", subscriptionId, this.config.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET);
  }

  async sendSubscriptionNotice(to: string | null, subject: string, body: string): Promise<boolean> {
    if (!to) return false;
    try { await this.email.send({ to, subject, body }); return true; }
    catch (error) { this.logger.warn(`Subscription notice failed for ${to}: ${(error as Error).message}`); return false; }
  }

  /** True when the intent is (now) CANCELED; false when it is in another live state (e.g. PROCESSING) and must be left alone. */
  private async cancelUnpaidIntent(tx: Prisma.TransactionClient, paymentIntentId: string, outcome?: StaleQrOutcome): Promise<boolean> {
    const canceled = await tx.paymentIntent.updateMany({ where: { id: paymentIntentId, status: { in: [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.FAILED] } }, data: { status: PaymentIntentStatus.CANCELED } });
    if (canceled?.count) return true;
    const current = await tx.paymentIntent.findUnique({ where: { id: paymentIntentId }, select: { status: true, railId: true, livemode: true, updatedAt: true } });
    if (current?.status !== PaymentIntentStatus.REQUIRES_ACTION) return current?.status === PaymentIntentStatus.CANCELED;
    // An abandoned QR never expires on our side: once it is dead (25 h, 49 h for Baneco) the renewal must not stay stuck on it.
    const cutoff = staleQrCutoff(current.railId);
    if (!current.updatedAt || current.updatedAt >= cutoff) return false;
    if (needsBankCheck(current) && outcome !== "unpaid") return false; // the bank was not asked, or said paid/unknown: never cancel it here
    const stale = await tx.paymentIntent.updateMany({ where: { id: paymentIntentId, status: PaymentIntentStatus.REQUIRES_ACTION, updatedAt: { lt: cutoff } }, data: { status: PaymentIntentStatus.CANCELED } });
    return !!stale?.count;
  }

  /**
   * Asks the bank about an old Baneco QR. Must run OUTSIDE any transaction (it makes several HTTP calls and a "paid" answer
   * settles the payment in its own transaction). Anything that is not a stale live Baneco QR is "not-applicable".
   */
  async staleQrOutcome(paymentIntentId: string | null | undefined): Promise<StaleQrOutcome> {
    if (!paymentIntentId) return "not-applicable";
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, select: { id: true, status: true, railId: true, livemode: true, updatedAt: true } });
    if (!intent || intent.status !== PaymentIntentStatus.REQUIRES_ACTION || !needsBankCheck(intent)) return "not-applicable";
    if (!intent.updatedAt || intent.updatedAt >= staleQrCutoff(intent.railId)) return "not-applicable";
    try { return await this.paymentIntents.resolveStaleBanecoQr({ id: intent.id, railId: intent.railId, livemode: intent.livemode }); }
    catch (error) { this.logger.warn(`Baneco check failed for ${intent.id}: ${(error as Error).message}`); return "unknown"; }
  }

  /** Pre-transaction step for cancelOpenRenewal: the bank verdict for the subscription's open renewal. */
  async precheckOpenRenewal(subscriptionId: string, exceptInvoiceId?: string): Promise<OpenRenewalPrecheck> {
    const open = await this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId, status: "DUE", ...(exceptInvoiceId ? { id: { not: exceptInvoiceId } } : {}) }, orderBy: { periodStart: "desc" } });
    return { invoiceId: open?.id ?? null, outcome: await this.staleQrOutcome(open?.paymentIntentId) };
  }

  /** Cancels the open (unpaid) renewal of a subscription; paid orders are never touched. */
  async cancelOpenRenewal(tx: Prisma.TransactionClient, subscriptionId: string, precheck?: OpenRenewalPrecheck): Promise<boolean> {
    const open = await tx.subscriptionInvoice.findFirst({ where: { subscriptionId, status: "DUE" }, orderBy: { periodStart: "desc" } });
    if (!open) return false;
    if (open.paymentIntentId && !(await this.cancelUnpaidIntent(tx, open.paymentIntentId, precheck?.invoiceId === open.id ? precheck.outcome : undefined))) return false;
    if (open.orderId) {
      const order = await tx.storeOrder.updateMany({ where: { id: open.orderId, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
      if (order.count) await tx.storeOrderStatusEvent.create({ data: { orderId: open.orderId, status: OrderFulfillmentStatus.CANCELED } });
    }
    return (await tx.subscriptionInvoice.updateMany({ where: { id: open.id, status: "DUE" }, data: { status: "SKIPPED" } })).count === 1;
  }

  private async ensureSubscriptionPaymentIntent(
    tx: Prisma.TransactionClient,
    livemode: boolean,
    storeName: string,
    subscription: CustomerSubscription,
    terms: SubscriptionTerms,
    invoice: { id: string; periodStart: Date; amount: number; currency: string },
    merchantId: string,
    storeId: string,
    forceNew = false,
    staleOutcome: StaleQrOutcome = "not-applicable",
  ): Promise<{ intent: { id: string; clientSecret: string }; created: boolean; blocked?: "paid" | "unknown" }> {
    const rows = await tx.$queryRaw<Array<{ paymentIntentId: string | null; orderId: string | null }>>`
      SELECT "paymentIntentId", "orderId" FROM "SubscriptionInvoice" WHERE id = ${invoice.id} FOR UPDATE
    `;
    const existingIntentId = rows[0]?.paymentIntentId;
    if (existingIntentId) {
      const existingIntent = await tx.paymentIntent.findUnique({ where: { id: existingIntentId } });
      const staleQr = existingIntent?.status === PaymentIntentStatus.REQUIRES_ACTION && existingIntent.updatedAt < staleQrCutoff(existingIntent.railId);
      // Paid at the bank, bank unreachable, or the bank was never asked: do nothing this run; the caller must not send a pay link.
      if (staleQr && needsBankCheck(existingIntent!) && staleOutcome !== "unpaid") return { intent: existingIntent!, created: false, blocked: staleOutcome === "paid" ? "paid" : "unknown" };
      if (existingIntent && !staleQr && (!forceNew || (existingIntent.status !== PaymentIntentStatus.FAILED && existingIntent.status !== PaymentIntentStatus.CANCELED))) return { intent: existingIntent, created: false };
      if (existingIntent?.status === PaymentIntentStatus.FAILED) {
        await tx.paymentIntent.update({ where: { id: existingIntent.id }, data: { status: PaymentIntentStatus.CANCELED } });
      }
      if (staleQr) {
        const canceled = await tx.paymentIntent.updateMany({ where: { id: existingIntent!.id, status: PaymentIntentStatus.REQUIRES_ACTION, updatedAt: { lt: staleQrCutoff(existingIntent!.railId) } }, data: { status: PaymentIntentStatus.CANCELED } });
        if (!canceled.count) return { intent: existingIntent!, created: false }; // it moved on (paid or processing) while we looked
      }
      if (rows[0]?.orderId) await tx.storeOrder.updateMany({ where: { id: rows[0].orderId, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
    }
    const f = renewalFulfillment(subscription);
    const productLine = subscription.paymentLinkId && subscription.quantity ? {
      paymentLinkId: subscription.paymentLinkId,
      ...(subscription.variantId ? { variantId: subscription.variantId } : {}),
      ...(subscription.extraIds.length ? { extraIds: subscription.extraIds } : {}),
      name: subscription.itemName ?? terms.name,
      quantity: subscription.quantity,
      unitAmount: Math.round((invoice.amount - (f.fee ?? 0)) / subscription.quantity),
    } : null;
    const intent = await this.paymentIntents.createInTransaction(tx, merchantId, livemode, {
      amount: invoice.amount,
      currency: invoice.currency,
      description: `${terms.name} · ${subscription.customerName} · ${storeName}`,
      customerName: subscription.customerName,
      customerEmail: subscription.customerEmail ?? undefined,
      customerPhone: subscription.customerPhone ?? undefined,
      metadata: {
        storeId,
        ...(productLine ? { cart: [productLine], ...renewalFulfillmentMetadata(f) } : {}),
        subscription: {
          invoiceId: invoice.id, subscriptionId: subscription.id, planId: subscription.planId, planName: terms.name,
          periodStart: invoice.periodStart.toISOString(), customerName: subscription.customerName,
          customerEmail: subscription.customerEmail, customerPhone: subscription.customerPhone,
        },
      },
    });
    await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { paymentIntentId: intent.id } });
    if (productLine) {
      const order = await tx.storeOrder.create({ data: {
        paymentIntentId: intent.id, merchantId, storeId, storeName,
        ...(f.method ? { fulfillmentMethod: f.method } : {}),
        ...(f.locationId ? { fulfillmentLocationId: f.locationId, fulfillmentLocationName: f.locationName ?? null } : {}),
        items: [productLine] as Prisma.InputJsonValue, amount: invoice.amount, currency: invoice.currency,
        status: OrderFulfillmentStatus.AWAITING_PAYMENT,
        statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
      } });
      if (f.zoneId && f.address) await tx.deliveryAssignment.create({ data: { merchantId, storeId, orderId: order.id, zoneId: f.zoneId, fee: f.fee ?? 0, address: f.address } });
      await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { orderId: order.id } });
    }
    return { intent, created: true };
  }

  private async sendChargeNotice(storeName: string, subscription: CustomerSubscription, terms: SubscriptionTerms, invoice: { amount: number; currency: string; dueAt?: Date; periodStart?: Date }, checkoutUrl: string, kind: "first" | "reminder" | "last"): Promise<boolean> {
    const amount = `${(invoice.amount / 100).toFixed(2)} ${invoice.currency}`;
    if (!terms.product) {
      return this.sendSubscriptionNotice(subscription.customerEmail,
        kind === "first" ? `Tu cobro de ${terms.name} en ${storeName}` : `Recordatorio: ${terms.name} en ${storeName}`,
        kind === "first"
          ? `Hola ${subscription.customerName}, tu cobro de ${amount} por ${terms.name} está listo. Págalo de forma segura aquí: ${checkoutUrl}`
          : `Hola ${subscription.customerName}, tu cobro de ${amount} por ${terms.name} sigue pendiente. Puedes pagarlo aquí: ${checkoutUrl}`);
    }
    const date = (invoice.dueAt ?? invoice.periodStart)?.toISOString().slice(0, 10) ?? "";
    const subject = kind === "first" ? `Tu pedido de ${terms.name} está listo · ${storeName}`
      : kind === "reminder" ? `Recordatorio: tu pedido de ${terms.name} · ${storeName}`
      : `Último recordatorio: tu pedido de ${terms.name} · ${storeName}`;
    const lead = kind === "first" ? `tu próxima entrega de ${terms.name} (${date}) está lista.`
      : kind === "reminder" ? `tu entrega de ${terms.name} sigue pendiente de pago.`
      : `si no pagas en los próximos 4 días, saltaremos esta entrega de ${terms.name}.`;
    return this.sendSubscriptionNotice(subscription.customerEmail, subject,
      `Hola ${subscription.customerName}, ${lead}\nTotal: ${amount}\nPágalo con un toque: ${checkoutUrl}\n\nNo se cobra nada automáticamente. Puedes saltar, pausar o cancelar aquí: ${this.manageUrl(subscription.id)}`);
  }

  private async termsFor(subscription: CustomerSubscription, storeId: string, now = new Date()) {
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } }) : null;
    return subscriptionTerms(subscription, plan, now);
  }

  /** Once per subscription and mode: the engine only bills a product subscription in the mode it was born in. */
  private logOriginSkip(subscriptionId: string, storeLivemode: boolean) {
    const key = `${subscriptionId}:${storeLivemode}`;
    if (this.loggedOriginSkips.has(key)) return;
    this.loggedOriginSkips.add(key);
    this.logger.debug(`Skipping renewals of ${subscriptionId}: it was created ${storeLivemode ? "in test mode" : "in live mode"} but the store is ${storeLivemode ? "live" : "not live"}`);
  }

  private async storeLivemode(merchantId: string, store: { status: string }) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } });
    return merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
  }

  async generateSubscriptionInvoices(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } });
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const now = new Date();
    const generationHorizon = new Date(now.getTime() + 720 * 3_600_000);
    const candidates = await this.prisma.customerSubscription.findMany({ where: { merchantId, storeId, status: "ACTIVE", nextBillingAt: { lte: generationHorizon } } });
    const origins = await originLivemodes(this.prisma, candidates, this.logger);
    let created = 0;
    let paymentLinksCreated = 0;
    let emailsSent = 0;
    const charges: Array<{ invoiceId: string; paymentIntentId: string; checkoutUrl: string; amount: number; currency: string }> = [];
    for (const subscription of candidates) {
      try {
        const terms = await this.termsFor(subscription, storeId, now);
        if (!terms) continue;
        if (!originMatchesStore(subscription, origins, livemode)) { this.logOriginSkip(subscription.id, livemode); continue; }
        if (subscription.paymentLinkId && advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) <= now) {
          // More than a whole period overdue (e.g. after a suspension): skip the missed periods instead of billing one per run.
          const earliest = new Date(now.getTime() + terms.noticeHours * 3_600_000);
          let next = subscription.nextBillingAt;
          while (next <= earliest) next = advanceBillingDate(next, terms.interval, terms.count);
          await this.prisma.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt }, data: { nextBillingAt: next } });
          continue;
        }
        const generationAt = new Date(subscription.nextBillingAt.getTime() - terms.noticeHours * 3_600_000);
        if (generationAt > now) continue;
        if (terms.product) {
          const availability = await this.renewalAvailability(subscription);
          if (availability === "gone") { await this.endGoneSubscription(store.name, subscription); continue; }
          if (availability === "out_of_stock") { await this.skipOutOfStockPeriod(store.name, subscription, terms); continue; }
        }
        const existingInvoice = await this.prisma.subscriptionInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } } });
        const staleOutcome = await this.staleQrOutcome(existingInvoice?.paymentIntentId); // bank call, before the transaction
        const pendingApplies = !!subscription.pendingFrom && subscription.pendingFrom <= now && !!subscription.pendingUnitAmount;
        const outcome = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.subscriptionInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } } });
          const invoice = existing ?? await tx.subscriptionInvoice.upsert({
            where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
            create: { subscriptionId: subscription.id, merchantId, storeId, periodStart: subscription.nextBillingAt, amount: terms.amount, currency: terms.currency, dueAt: subscription.nextBillingAt },
            update: {},
          });
          const ensured = await this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, terms, invoice, merchantId, storeId, false, staleOutcome);
          await tx.customerSubscription.updateMany({
            where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
            data: {
              nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count), nextAmountOverride: null,
              ...(pendingApplies ? { unitAmount: subscription.pendingUnitAmount, pendingUnitAmount: null, pendingFrom: null } : {}),
            },
          });
          return { invoice, intent: ensured.intent, invoiceCreated: !existing, paymentLinkCreated: ensured.created, blocked: ensured.blocked };
        });
        if (outcome.invoiceCreated) created += 1;
        if (outcome.paymentLinkCreated) paymentLinksCreated += 1;
        if (outcome.blocked) continue; // paid at the bank or unconfirmed: no pay link for this invoice
        const checkoutUrl = paymentCheckoutUrl(this.config, outcome.intent.clientSecret);
        charges.push({ invoiceId: outcome.invoice.id, paymentIntentId: outcome.intent.id, checkoutUrl, amount: outcome.invoice.amount, currency: outcome.invoice.currency });
        if (outcome.paymentLinkCreated && await this.sendChargeNotice(store.name, subscription, terms, outcome.invoice, checkoutUrl, "first")) {
          emailsSent += 1;
          await this.prisma.subscriptionInvoice.update({ where: { id: outcome.invoice.id }, data: { initialNoticeAt: new Date() } });
        }
      } catch (error) {
        this.logger.error(`Renewal generation failed for subscription ${subscription.id}: ${(error as Error).message}`);
      }
    }

    const invoicesWithoutLinks = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", paymentIntentId: null }, take: 200 });
    for (const invoice of invoicesWithoutLinks) {
      try {
        const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
        if (!subscription || subscription.status !== "ACTIVE") continue;
        const terms = await this.termsFor(subscription, storeId, now);
        if (!terms) continue;
        const invoiceOrigins = await originLivemodes(this.prisma, [subscription], this.logger);
        if (!originMatchesStore(subscription, invoiceOrigins, livemode)) { this.logOriginSkip(subscription.id, livemode); continue; }
        const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, terms, invoice, merchantId, storeId));
        if (!ensured.created) continue;
        paymentLinksCreated += 1;
        const checkoutUrl = paymentCheckoutUrl(this.config, ensured.intent.clientSecret);
        charges.push({ invoiceId: invoice.id, paymentIntentId: ensured.intent.id, checkoutUrl, amount: invoice.amount, currency: invoice.currency });
        if (await this.sendChargeNotice(store.name, subscription, terms, invoice, checkoutUrl, "first")) {
          emailsSent += 1;
          await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { initialNoticeAt: new Date() } });
        }
      } catch (error) {
        this.logger.error(`Renewal link generation failed for invoice ${invoice.id}: ${(error as Error).message}`);
      }
    }
    return { created, paymentLinksCreated, emailsSent, charges };
  }
  async sendDueSubscriptionReminders(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const initialCutoff = new Date(now.getTime() - 12 * 3_600_000);
    const lastCutoff = new Date(now.getTime() - LAST_REMINDER_AFTER_DAYS * DAY_MS);
    const livemode = await this.storeLivemode(merchantId, store);
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        merchantId, storeId, status: "DUE",
        OR: [
          { dueAt: { lte: now }, lastReminderAt: null, AND: [{ OR: [{ initialNoticeAt: null }, { initialNoticeAt: { lte: initialCutoff } }] }] },
          { orderId: { not: null }, reminderCount: 1, dueAt: { lte: lastCutoff } },
        ],
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    });
    let delivered = 0;
    let skipped = 0;
    for (const invoice of invoices) {
      try {
        const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
        if (!subscription || subscription.status !== "ACTIVE" || !subscription.customerEmail || !invoice.paymentIntentId) { skipped += 1; continue; }
        const [terms, intent, origins] = await Promise.all([
          this.termsFor(subscription, storeId, now),
          this.prisma.paymentIntent.findUnique({ where: { id: invoice.paymentIntentId } }),
          originLivemodes(this.prisma, [subscription], this.logger),
        ]);
        if (!terms || !intent || intent.status === PaymentIntentStatus.SUCCEEDED || intent.status === PaymentIntentStatus.CANCELED) { skipped += 1; continue; }
        if (!originMatchesStore(subscription, origins, livemode)) { this.logOriginSkip(subscription.id, livemode); skipped += 1; continue; }
        let clientSecret = intent.clientSecret;
        if (intent.status === PaymentIntentStatus.REQUIRES_ACTION && intent.updatedAt < staleQrCutoff(intent.railId, now.getTime())) {
          // The abandoned QR is dead; the reminder must carry a working link. The bank is asked first, outside the transaction.
          const staleOutcome = await this.staleQrOutcome(intent.id);
          if (staleOutcome === "paid" || staleOutcome === "unknown") { skipped += 1; continue; } // no pay-now email for a paid or unconfirmed invoice
          const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, terms, invoice, merchantId, storeId, false, staleOutcome));
          if (ensured.blocked) { skipped += 1; continue; }
          clientSecret = ensured.intent.clientSecret;
        }
        const sent = await this.sendChargeNotice(store.name, subscription, terms, invoice, paymentCheckoutUrl(this.config, clientSecret), invoice.reminderCount >= 1 ? "last" : "reminder");
        if (!sent) { skipped += 1; continue; }
        await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
        delivered += 1;
      } catch (error) {
        skipped += 1;
        this.logger.error(`Renewal reminder failed for invoice ${invoice.id}: ${(error as Error).message}`);
      }
    }
    return { delivered, skipped };
  }
  async remindSubscriptionInvoice(merchantId: string, storeId: string, invoiceId: string, regenerate: boolean) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const invoice = await this.prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, merchantId, storeId } });
    if (!invoice) throw new NotFoundException("Subscription invoice not found");
    if (invoice.status === "PAID") throw new BadRequestException("Este cobro ya fue pagado");
    if (invoice.status === "CANCELED") throw new BadRequestException("Este cobro fue cancelado");
    if (invoice.status === "MISSED" || invoice.status === "SKIPPED") throw new BadRequestException("Esta entrega ya no está pendiente de pago");
    const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
    if (!subscription) throw new NotFoundException("Subscription not found");
    const terms = await this.termsFor(subscription, storeId);
    if (!terms) throw new NotFoundException("Subscription plan not found");
    const livemode = await this.storeLivemode(merchantId, store);
    if (!originMatchesStore(subscription, await originLivemodes(this.prisma, [subscription], this.logger), livemode)) throw new BadRequestException("Esta suscripción se creó en otro modo (prueba o producción) y no se puede cobrar desde el modo actual de la tienda");
    const staleOutcome = await this.staleQrOutcome(invoice.paymentIntentId); // bank call, before the transaction
    if (staleOutcome === "paid" || staleOutcome === "unknown") return { checkoutUrl: null, regenerated: false, sent: false, recipient: subscription.customerEmail, blocked: staleOutcome };
    const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, terms, invoice, merchantId, storeId, regenerate, staleOutcome));
    if (ensured.blocked) return { checkoutUrl: null, regenerated: false, sent: false, recipient: subscription.customerEmail, blocked: ensured.blocked };
    const checkoutUrl = paymentCheckoutUrl(this.config, ensured.intent.clientSecret);
    const sent = await this.sendChargeNotice(store.name, subscription, terms, invoice, checkoutUrl, "reminder");
    if (sent) await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
    return { checkoutUrl, regenerated: ensured.created, sent, recipient: subscription.customerEmail };
  }

  private async renewalAvailability(subscription: CustomerSubscription): Promise<"ok" | "gone" | "out_of_stock"> {
    const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, storeId: subscription.storeId, status: "ACTIVE" } });
    if (!product || product.fulfillmentType === "DIGITAL") return "gone";
    const variant = subscription.variantId ? readStockVariants(product.variants).find(entry => entry.id === subscription.variantId) : undefined;
    if (subscription.variantId && !variant) return "gone";
    const quantity = subscription.quantity ?? 1;
    if (product.stock !== null && product.stock < quantity) return "out_of_stock";
    if (variant && typeof variant.stock === "number" && variant.stock < quantity) return "out_of_stock";
    return "ok";
  }

  private async endGoneSubscription(storeName: string, subscription: CustomerSubscription) {
    const ended = await this.prisma.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
    if (ended.count) await this.sendSubscriptionNotice(subscription.customerEmail, `Tu suscripción terminó · ${storeName}`,
      `Hola ${subscription.customerName}, ${subscription.itemName ?? "este producto"} ya no está disponible en ${storeName}, así que tu suscripción terminó. No se hizo ningún cobro.`);
  }

  private async skipOutOfStockPeriod(storeName: string, subscription: CustomerSubscription, terms: SubscriptionTerms) {
    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.upsert({
        where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
        create: { subscriptionId: subscription.id, merchantId: subscription.merchantId, storeId: subscription.storeId, periodStart: subscription.nextBillingAt, amount: terms.amount, currency: terms.currency, dueAt: subscription.nextBillingAt, status: "SKIPPED" },
        update: {},
      });
      await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt }, data: { nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) } });
    });
    await this.sendSubscriptionNotice(subscription.customerEmail, `Tu entrega de ${terms.name} no está disponible · ${storeName}`,
      `Hola ${subscription.customerName}, esta vez no hay stock de ${terms.name}, así que saltamos esta entrega sin cobrarte nada. Tu suscripción sigue activa: ${this.manageUrl(subscription.id)}`);
  }

  async expireMissedRenewals(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const cutoff = new Date(Date.now() - MISSED_AFTER_DAYS * DAY_MS);
    const invoices = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", orderId: { not: null }, dueAt: { lte: cutoff } }, orderBy: { dueAt: "asc" }, take: 200 });
    const owners = invoices.length ? await this.prisma.customerSubscription.findMany({ where: { id: { in: [...new Set(invoices.map(invoice => invoice.subscriptionId))] } } }) : [];
    const ownerById = new Map(owners.map(owner => [owner.id, owner]));
    const origins = await originLivemodes(this.prisma, owners, this.logger);
    const livemode = await this.storeLivemode(merchantId, store);
    let missed = 0;
    let paused = 0;
    for (const invoice of invoices) {
      try {
        const owner = ownerById.get(invoice.subscriptionId);
        if (owner && !originMatchesStore(owner, origins, livemode)) { this.logOriginSkip(owner.id, livemode); continue; }
        // Bank calls first, outside any transaction: paid or unconfirmed QRs are left for the next run (paid ones are settled by the check itself).
        const outcome = await this.staleQrOutcome(invoice.paymentIntentId);
        if (outcome === "paid" || outcome === "unknown") continue;
        const otherOpen = await this.precheckOpenRenewal(invoice.subscriptionId, invoice.id);
        const result = await this.prisma.$transaction(async (tx) => {
          if (invoice.paymentIntentId && !(await this.cancelUnpaidIntent(tx, invoice.paymentIntentId, outcome))) return null;
          const marked = await tx.subscriptionInvoice.updateMany({ where: { id: invoice.id, status: "DUE" }, data: { status: "MISSED" } });
          if (!marked.count) return null;
          const order = await tx.storeOrder.updateMany({ where: { id: invoice.orderId!, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
          if (order.count) await tx.storeOrderStatusEvent.create({ data: { orderId: invoice.orderId!, status: OrderFulfillmentStatus.CANCELED } });
          const subscription = await tx.customerSubscription.update({ where: { id: invoice.subscriptionId }, data: { missedCount: { increment: 1 } } });
          const pause = subscription.missedCount >= 2
            && (await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: new Date() } })).count === 1;
          if (pause) await this.cancelOpenRenewal(tx, subscription.id, otherOpen); // a paused subscription must not keep a payable renewal open
          return { subscription, pause };
        });
        if (!result) continue;
        missed += 1;
        if (!result.pause) continue;
        paused += 1;
        const name = result.subscription.itemName ?? "tu suscripción";
        await this.sendSubscriptionNotice(result.subscription.customerEmail, `Pausamos tu suscripción · ${store.name}`,
          `Hola ${result.subscription.customerName}, no recibimos el pago de las dos últimas entregas de ${name}, así que pausamos la suscripción. Puedes reanudarla cuando quieras: ${this.manageUrl(result.subscription.id)}`);
        await this.sendSubscriptionNotice(store.contactEmail, `Suscripción pausada: ${result.subscription.customerName}`,
          `La suscripción de ${result.subscription.customerName} a ${name} se pausó tras dos entregas sin pagar. Revísala en Suscripciones.`);
      } catch (error) {
        this.logger.error(`Missed-renewal expiry failed for invoice ${invoice.id}: ${(error as Error).message}`);
      }
    }
    return { missed, paused };
  }
}
