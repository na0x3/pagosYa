import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus, OrderFulfillmentStatus, PaymentIntentStatus, PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StoreCustomersService } from "../store-customers/store-customers.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { findActiveStoreBySlug } from "../stores/active-store";
import { paymentCheckoutUrl } from "../operations/operations-helpers";
import { blocksRejoin, MEMBERSHIP_CONSENT_TEXT, MEMBERSHIP_STATE_LABEL, membershipKey, membershipState, periodLabel, type MembershipState } from "./membership-rules";
import { SubscriptionsService } from "../operations/subscriptions.service";
import type { JoinMembershipDto } from "./dto/join-membership.dto";

export type MemberView = {
  id: string; productId: string; name: string; state: MembershipState; stateLabel: string;
  accessUntil: string | null; nextBillingAt: string | null; amount: number; currency: string;
  period: { id: string; months: number; label: string } | null; pendingPeriod: { id: string; months: number; label: string } | null;
  periods: Array<{ id: string; months: number; amount: number; label: string }>; renewalUrl: string | null;
};
const dayEs = (date: Date) => date.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });

/** A shopper joining and managing memberships from their store account (spec 2026-10-09 §2). */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: StoreCustomersService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async startJoin(slug: string, token: string, dto: JoinMembershipDto): Promise<{ checkoutUrl: string }> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (store.checkoutMode !== "payment") throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    if (dto.consent !== true) throw new BadRequestException("Acepta las condiciones de la membresía para continuar.");
    const product = await this.prisma.paymentLink.findFirst({ where: { id: dto.productId, storeId: store.id, status: PaymentLinkStatus.ACTIVE, fulfillmentType: "MEMBERSHIP" } });
    if (!product) throw new NotFoundException("Esta membresía ya no está disponible");
    const period = await this.prisma.membershipPeriod.findFirst({ where: { id: dto.periodId, paymentLinkId: product.id, archivedAt: null } });
    if (!period) throw new BadRequestException("Elige un período disponible.");
    const now = new Date();
    const current = await this.prisma.customerSubscription.findFirst({ where: { storeId: store.id, paymentLinkId: product.id, storeCustomerId: me.id, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" } });
    if (current && blocksRejoin(current, store.membershipGraceDays, now)) {
      throw new ConflictException({ code: "ALREADY_MEMBER", message: `Ya eres miembro hasta el ${dayEs(current.accessUntil!)}.`, accessUntil: current.accessUntil!.toISOString() });
    }
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } });
    const name = `${product.name} · ${periodLabel(period.months)}`;
    const line = { paymentLinkId: product.id, name, quantity: 1, unitAmount: period.amount };
    const intent = await this.prisma.$transaction(async (tx) => {
      const created = await this.paymentIntents.createInTransaction(tx, store.merchantId, merchant.status === MerchantStatus.ACTIVE, {
        amount: period.amount, currency: product.currency, description: `${name} · ${store.name}`.slice(0, 480),
        customerName: me.name, customerEmail: me.email, ...(me.phone ? { customerPhone: me.phone } : {}),
        metadata: { storeId: store.id, cart: [line], membership: { productId: product.id, periodId: period.id, storeCustomerId: me.id, consentText: MEMBERSHIP_CONSENT_TEXT, consentAt: now.toISOString() } },
      });
      await tx.storeOrder.create({ data: {
        paymentIntentId: created.id, merchantId: store.merchantId, storeId: store.id, storeName: store.name,
        items: [line], amount: period.amount, currency: product.currency,
        status: OrderFulfillmentStatus.AWAITING_PAYMENT, statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
      } });
      return created;
    });
    return { checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret) };
  }

  async list(slug: string, token: string): Promise<MemberView[]> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const rows = await this.prisma.customerSubscription.findMany({ where: { storeId: store.id, storeCustomerId: me.id, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" }, take: 50 });
    if (!rows.length) return [];
    const productIds = [...new Set(rows.map(row => row.paymentLinkId!))];
    const periods = await this.prisma.membershipPeriod.findMany({ where: { paymentLinkId: { in: productIds } }, orderBy: { position: "asc" } });
    const open = await this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: rows.map(row => row.id) }, status: "DUE", paymentIntentId: { not: null } } });
    const intents = open.length ? await this.prisma.paymentIntent.findMany({ where: { id: { in: open.map(invoice => invoice.paymentIntentId!) } }, select: { id: true, clientSecret: true, status: true } }) : [];
    const now = new Date();
    const view = (id: string | null) => { const p = periods.find(entry => entry.id === id); return p ? { id: p.id, months: p.months, label: periodLabel(p.months) } : null; };
    return rows.map(row => {
      const state = membershipState(row, store.membershipGraceDays, now);
      const invoice = open.find(entry => entry.subscriptionId === row.id);
      const intent = invoice && intents.find(entry => entry.id === invoice.paymentIntentId);
      const payable = !!intent && intent.status !== PaymentIntentStatus.SUCCEEDED && intent.status !== PaymentIntentStatus.CANCELED;
      return {
        id: row.id, productId: row.paymentLinkId!, name: row.itemName ?? "Membresía", state, stateLabel: MEMBERSHIP_STATE_LABEL[state],
        accessUntil: row.accessUntil?.toISOString() ?? null, nextBillingAt: row.status === "ACTIVE" ? row.nextBillingAt.toISOString() : null,
        amount: row.unitAmount ?? 0, currency: row.currency ?? "BOB",
        period: view(row.membershipPeriodId), pendingPeriod: view(row.pendingPeriodId),
        periods: periods.filter(p => p.paymentLinkId === row.paymentLinkId && !p.archivedAt).map(p => ({ id: p.id, months: p.months, amount: p.amount, label: periodLabel(p.months) })),
        renewalUrl: payable ? paymentCheckoutUrl(this.config, intent!.clientSecret) : null,
      };
    });
  }

  async act(slug: string, token: string, id: string, action: "cancel" | "resume" | "period", periodId?: string): Promise<MemberView> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const row = await this.prisma.customerSubscription.findFirst({ where: { id, storeId: store.id, storeCustomerId: me.id, membershipPeriodId: { not: null } } });
    if (!row) throw new NotFoundException("Membresía no encontrada");
    const now = new Date();
    if (action === "cancel") {
      if (row.status !== "ACTIVE") throw new BadRequestException("Esta membresía ya no se renueva.");
      const precheck = await this.subscriptions.precheckOpenRenewal(row.id); // bank call, before the transaction
      await this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, row.id, precheck);
        await tx.customerSubscription.update({ where: { id: row.id }, data: { status: "CANCELED", activeKey: null, canceledAt: now } });
      });
    } else if (action === "resume") {
      if (row.status !== "CANCELED") throw new BadRequestException("Solo puedes reanudar una membresía cancelada.");
      if (!row.accessUntil || row.accessUntil <= now) throw new BadRequestException("Tu acceso ya terminó; vuelve a hacerte miembro.");
      const key = membershipKey(store.id, row.paymentLinkId!, me.id);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "StoreCustomer" WHERE id = ${me.id} FOR UPDATE`;
        if (await tx.customerSubscription.findFirst({ where: { activeKey: key, id: { not: row.id } } })) throw new ConflictException("Ya tienes esta membresía activa.");
        await tx.subscriptionInvoice.updateMany({ where: { subscriptionId: row.id, periodStart: row.accessUntil!, status: "SKIPPED" }, data: { status: "DUE", paymentIntentId: null, orderId: null } });
        await tx.customerSubscription.update({ where: { id: row.id }, data: { status: "ACTIVE", activeKey: key, canceledAt: null, nextBillingAt: row.accessUntil! } });
      });
    } else {
      if (row.status !== "ACTIVE") throw new BadRequestException("Solo puedes cambiar el período de una membresía activa.");
      const period = periodId ? await this.prisma.membershipPeriod.findFirst({ where: { id: periodId, paymentLinkId: row.paymentLinkId!, archivedAt: null } }) : null;
      if (!period) throw new BadRequestException("Elige un período disponible.");
      await this.prisma.customerSubscription.update({ where: { id: row.id }, data: { pendingPeriodId: period.id === row.membershipPeriodId ? null : period.id } });
    }
    return (await this.list(slug, token)).find(view => view.id === row.id)!;
  }
}
