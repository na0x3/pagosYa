import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { accessAfterPayment, blocksRejoin, membershipKey, periodLabel } from "./membership-rules";

/**
 * Runs inside the payment's success transaction, like createSubscriptionsFromOrder: it validates instead of throwing,
 * because a failed statement would abort the payment. The buyer's StoreCustomer row is locked first, so two payments
 * for the same account are serialized and the second one becomes a recorded duplicate.
 */
const logger = new Logger("MembershipEnrollment");
const NONE = { emailBlock: "", duplicate: false };
const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === "string" && value.length <= 200 ? value : "");
const dayEs = (date: Date) => date.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" });

export type MembershipJoinInput = {
  intent: { id: string; currency: string; metadata: Prisma.JsonValue };
  order: { id: string; storeId: string; merchantId: string };
  checkoutOrigin: string;
  now?: Date;
};

export async function applyMembershipJoin(tx: Prisma.TransactionClient, input: MembershipJoinInput): Promise<{ emailBlock: string; duplicate: boolean }> {
  const metadata = objectOf(input.intent.metadata);
  const membership = objectOf(metadata.membership);
  const productId = text(membership.productId), periodId = text(membership.periodId), storeCustomerId = text(membership.storeCustomerId);
  if (!productId || !periodId || !storeCustomerId) return NONE;
  const now = input.now ?? new Date();
  await tx.$queryRaw`SELECT id FROM "StoreCustomer" WHERE id = ${storeCustomerId} FOR UPDATE`;
  const [customer, store, product, period] = await Promise.all([
    tx.storeCustomer.findUnique({ where: { id: storeCustomerId } }),
    tx.store.findUnique({ where: { id: input.order.storeId }, select: { id: true, slug: true, name: true, membershipGraceDays: true } }),
    tx.paymentLink.findFirst({ where: { id: productId, storeId: input.order.storeId }, select: { id: true, name: true } }),
    tx.membershipPeriod.findUnique({ where: { id: periodId } }),
  ]);
  const line = objectOf((Array.isArray(metadata.cart) ? metadata.cart : [])[0]);
  const unitAmount = Number(line.unitAmount);
  if (!customer || customer.deletedAt || customer.storeId !== input.order.storeId || !store || !product || !period || period.paymentLinkId !== product.id
    || !Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
    logger.warn(`Skipped membership enrollment on ${input.intent.id}`);
    return NONE;
  }
  const accountUrl = `${input.checkoutOrigin.replace(/\/$/, "")}/cuenta/${encodeURIComponent(store.slug)}/membresias`;
  const existing = await tx.customerSubscription.findFirst({ where: { storeId: store.id, paymentLinkId: product.id, storeCustomerId, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" } });
  if (existing && blocksRejoin(existing, store.membershipGraceDays, now)) {
    const placed = await tx.storeOrder.findUnique({ where: { id: input.order.id }, select: { items: true } });
    const items = Array.isArray(placed?.items) ? (placed!.items as unknown[]).map(item => ({ ...objectOf(item), name: `${String(objectOf(item).name ?? product.name)} · pago duplicado (ya era miembro)` })) : [];
    if (items.length) await tx.storeOrder.update({ where: { id: input.order.id }, data: { items: items as Prisma.InputJsonValue } });
    logger.warn(`Duplicate membership payment ${input.intent.id} for ${existing.id}`);
    return { duplicate: true, emailBlock: `Ya eras miembro de ${product.name} hasta el ${dayEs(existing.accessUntil!)}. Este pago quedó registrado y ${store.name} puede devolvértelo.` };
  }
  const accessUntil = accessAfterPayment(now, period.months, null);
  const data = {
    status: "ACTIVE", activeKey: membershipKey(store.id, product.id, storeCustomerId), membershipPeriodId: period.id, pendingPeriodId: null,
    unitAmount, quantity: 1, currency: input.intent.currency, itemName: product.name, accessUntil, nextBillingAt: accessUntil,
    canceledAt: null, pausedAt: null, missedCount: 0, sourceOrderId: input.order.id,
    customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
    consentText: text(membership.consentText) || null, consentAt: now,
  };
  if (existing) await tx.customerSubscription.update({ where: { id: existing.id }, data });
  else await tx.customerSubscription.create({ data: { ...data, merchantId: input.order.merchantId, storeId: store.id, paymentLinkId: product.id, storeCustomerId, startedAt: now } });
  return {
    duplicate: false,
    emailBlock: `Membresía: ${product.name} · ${periodLabel(period.months)}\nActiva hasta: ${dayEs(accessUntil)}\nAntes de cada vencimiento te enviaremos un enlace para renovar; no se cobra nada automáticamente.\nAdministra tu membresía en tu cuenta: ${accountUrl}`,
  };
}

/** A membership renewal was paid: access runs one more period from where the paid period started. Never throws. */
export async function applyMembershipRenewalPaid(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  const invoice = await tx.subscriptionInvoice.findFirst({ where: { paymentIntentId, status: "PAID" }, select: { subscriptionId: true, periodStart: true } });
  if (!invoice) return;
  const subscription = await tx.customerSubscription.findUnique({ where: { id: invoice.subscriptionId }, select: { id: true, membershipPeriodId: true, accessUntil: true } });
  if (!subscription?.membershipPeriodId) return;
  const period = await tx.membershipPeriod.findUnique({ where: { id: subscription.membershipPeriodId }, select: { months: true } });
  if (!period) return;
  await tx.customerSubscription.update({ where: { id: subscription.id }, data: { accessUntil: accessAfterPayment(invoice.periodStart, period.months, subscription.accessUntil), missedCount: 0 } });
}
