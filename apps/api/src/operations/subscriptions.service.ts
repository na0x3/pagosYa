import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus, PaymentIntentStatus, Prisma } from "@prisma/client";
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
import { ownedStore, clean, paymentCheckoutUrl, subscriptionIdentityKey, DAY_MS } from "./operations-helpers";

/** Recurring subscriptions: plans, customer subscriptions, invoice generation, payment links, and reminder emails. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

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
  private advanceBilling(date: Date, interval: string, count: number): Date {
    const next = new Date(date);
    if (interval === "WEEKLY") next.setUTCDate(next.getUTCDate() + count * 7);
    else if (interval === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + count);
    else next.setUTCMonth(next.getUTCMonth() + count);
    return next;
  }
  private async ensureSubscriptionPaymentIntent(
    tx: Prisma.TransactionClient,
    livemode: boolean,
    storeName: string,
    subscription: { id: string; customerName: string; customerEmail: string | null; customerPhone: string | null },
    plan: { id: string; name: string },
    invoice: { id: string; periodStart: Date; amount: number; currency: string },
    merchantId: string,
    storeId: string,
    forceNew = false,
  ) {
    const rows = await tx.$queryRaw<Array<{ paymentIntentId: string | null }>>`
      SELECT "paymentIntentId" FROM "SubscriptionInvoice" WHERE id = ${invoice.id} FOR UPDATE
    `;
    const existingIntentId = rows[0]?.paymentIntentId;
    if (existingIntentId) {
      const existingIntent = await tx.paymentIntent.findUnique({ where: { id: existingIntentId } });
      if (existingIntent && (!forceNew || (existingIntent.status !== PaymentIntentStatus.FAILED && existingIntent.status !== PaymentIntentStatus.CANCELED))) return { intent: existingIntent, created: false };
      if (existingIntent?.status === PaymentIntentStatus.FAILED) {
        await tx.paymentIntent.update({ where: { id: existingIntent.id }, data: { status: PaymentIntentStatus.CANCELED } });
      }
    }
    const intent = await this.paymentIntents.createInTransaction(tx, merchantId, livemode, {
      amount: invoice.amount,
      currency: invoice.currency,
      description: `${plan.name} · ${subscription.customerName} · ${storeName}`,
      metadata: {
        storeId,
        subscription: {
          invoiceId: invoice.id,
          subscriptionId: subscription.id,
          planId: plan.id,
          planName: plan.name,
          periodStart: invoice.periodStart.toISOString(),
          customerName: subscription.customerName,
          customerEmail: subscription.customerEmail,
          customerPhone: subscription.customerPhone,
        },
      },
    });
    await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { paymentIntentId: intent.id } });
    return { intent, created: true };
  }
  private async sendSubscriptionChargeEmail(
    storeName: string,
    planName: string,
    customer: { name: string; email: string | null },
    amount: number,
    currency: string,
    checkoutUrl: string,
    reminder = false,
  ): Promise<boolean> {
    if (!customer.email) return false;
    try {
      await this.email.send({
        to: customer.email,
        subject: reminder ? `Recordatorio: ${planName} en ${storeName}` : `Tu cobro de ${planName} en ${storeName}`,
        body: reminder
          ? `Hola ${customer.name}, tu cobro de ${(amount / 100).toFixed(2)} ${currency} por ${planName} sigue pendiente. Puedes pagarlo aquí: ${checkoutUrl}`
          : `Hola ${customer.name}, tu cobro de ${(amount / 100).toFixed(2)} ${currency} por ${planName} está listo. Págalo de forma segura aquí: ${checkoutUrl}`,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Subscription charge email failed for ${customer.email}: ${(error as Error).message}`);
      return false;
    }
  }
  async generateSubscriptionInvoices(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } });
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const now = new Date();
    const generationHorizon = new Date(now.getTime() + 720 * 3_600_000);
    const candidates = await this.prisma.customerSubscription.findMany({ where: { merchantId, storeId, status: "ACTIVE", nextBillingAt: { lte: generationHorizon } } });
    let created = 0;
    let paymentLinksCreated = 0;
    let emailsSent = 0;
    const charges: Array<{ invoiceId: string; paymentIntentId: string; checkoutUrl: string; amount: number; currency: string }> = [];
    for (const subscription of candidates) {
      if (!subscription.planId) continue;
      const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
      if (!plan) continue;
      const generationAt = new Date(subscription.nextBillingAt.getTime() - plan.reminderHoursBefore * 3_600_000);
      if (generationAt > now) continue;
      const amount = subscription.nextAmountOverride ?? subscription.amountOverride ?? plan.amount;
      const outcome = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.subscriptionInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } } });
        const invoice = existing ?? await tx.subscriptionInvoice.upsert({
          where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
          create: { subscriptionId: subscription.id, merchantId, storeId, periodStart: subscription.nextBillingAt, amount, currency: plan.currency, dueAt: subscription.nextBillingAt },
          update: {},
        });
        const ensured = await this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId);
        await tx.customerSubscription.updateMany({
          where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
          data: { nextBillingAt: this.advanceBilling(subscription.nextBillingAt, plan.interval, plan.intervalCount), nextAmountOverride: null },
        });
        return { invoice, intent: ensured.intent, invoiceCreated: !existing, paymentLinkCreated: ensured.created };
      });
      if (outcome.invoiceCreated) created += 1;
      if (outcome.paymentLinkCreated) paymentLinksCreated += 1;
      const checkoutUrl = paymentCheckoutUrl(this.config, outcome.intent.clientSecret);
      charges.push({ invoiceId: outcome.invoice.id, paymentIntentId: outcome.intent.id, checkoutUrl, amount: outcome.invoice.amount, currency: outcome.invoice.currency });
      if (outcome.paymentLinkCreated && await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, outcome.invoice.amount, outcome.invoice.currency, checkoutUrl)) {
        emailsSent += 1;
        await this.prisma.subscriptionInvoice.update({ where: { id: outcome.invoice.id }, data: { initialNoticeAt: new Date() } });
      }
    }

    const invoicesWithoutLinks = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", paymentIntentId: null }, take: 200 });
    for (const invoice of invoicesWithoutLinks) {
      const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
      if (!subscription) continue;
      if (!subscription.planId) continue;
      const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
      if (!plan) continue;
      const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId));
      if (!ensured.created) continue;
      paymentLinksCreated += 1;
      const checkoutUrl = paymentCheckoutUrl(this.config, ensured.intent.clientSecret);
      charges.push({ invoiceId: invoice.id, paymentIntentId: ensured.intent.id, checkoutUrl, amount: invoice.amount, currency: invoice.currency });
      if (await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, checkoutUrl)) {
        emailsSent += 1;
        await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { initialNoticeAt: new Date() } });
      }
    }
    return { created, paymentLinksCreated, emailsSent, charges };
  }
  async sendDueSubscriptionReminders(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const initialCutoff = new Date(now.getTime() - 12 * 3_600_000);
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        merchantId,
        storeId,
        status: "DUE",
        dueAt: { lte: now },
        lastReminderAt: null,
        OR: [{ initialNoticeAt: null }, { initialNoticeAt: { lte: initialCutoff } }],
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    });
    let delivered = 0;
    let skipped = 0;
    for (const invoice of invoices) {
      const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
      if (!subscription || !subscription.planId || !subscription.customerEmail || !invoice.paymentIntentId) { skipped += 1; continue; }
      const [plan, intent] = await Promise.all([
        this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } }),
        this.prisma.paymentIntent.findUnique({ where: { id: invoice.paymentIntentId } }),
      ]);
      if (!plan || !intent || intent.status === PaymentIntentStatus.SUCCEEDED || intent.status === PaymentIntentStatus.CANCELED) { skipped += 1; continue; }
      const sent = await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, paymentCheckoutUrl(this.config, intent.clientSecret), true);
      if (!sent) { skipped += 1; continue; }
      await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
      delivered += 1;
    }
    return { delivered, skipped };
  }
  async remindSubscriptionInvoice(merchantId: string, storeId: string, invoiceId: string, regenerate: boolean) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const invoice = await this.prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, merchantId, storeId } });
    if (!invoice) throw new NotFoundException("Subscription invoice not found");
    if (invoice.status === "PAID") throw new BadRequestException("Este cobro ya fue pagado");
    if (invoice.status === "CANCELED") throw new BadRequestException("Este cobro fue cancelado");
    const [subscription, merchant] = await Promise.all([
      this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } }),
      this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } }),
    ]);
    if (!subscription) throw new NotFoundException("Subscription not found");
    if (!subscription.planId) throw new NotFoundException("Subscription plan not found");
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId, regenerate));
    const checkoutUrl = paymentCheckoutUrl(this.config, ensured.intent.clientSecret);
    const sent = await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, checkoutUrl, true);
    if (sent) await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
    return { checkoutUrl, regenerated: ensured.created, sent, recipient: subscription.customerEmail };
  }
}
