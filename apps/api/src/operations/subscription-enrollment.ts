import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { advanceBillingDate, cadenceInterval, cadenceLabel, isCadence, productSubscriptionKey, type Cadence } from "./subscription-pricing";
import { subscriptionManageUrl } from "./subscription-manage-token";
import { lineCurrencyFor } from "../international/fx";

/**
 * Runs inside the payment's success transaction (applyRailResult). It must never throw on the data it reads:
 * a failed statement would abort the payment. Unknown or changed lines are skipped and logged, duplicates are
 * skipped by activeKey. The order itself always stays a normal paid order.
 */
const logger = new Logger("SubscriptionEnrollment");

type CartLine = { paymentLinkId?: unknown; variantId?: unknown; extraIds?: unknown; name?: unknown; variantName?: unknown; quantity?: unknown;
  subscription?: { cadence?: unknown; discountPercent?: unknown; lockedUnitAmount?: unknown } };
export type EnrollmentInput = {
  intent: { id: string; livemode: boolean; currency: string; customerName: string | null; customerEmail: string | null; customerPhone: string | null; consumerUserId: string | null; metadata: Prisma.JsonValue };
  order: { id: string; storeId: string; merchantId: string; fulfillmentMethod: string | null; fulfillmentLocationId: string | null; fulfillmentLocationName: string | null };
  manage: { checkoutOrigin: string; secret: string };
  now?: Date;
};
export type EnrollmentResult = { created: number; duplicates: string[]; emailBlock: string };
const NONE: EnrollmentResult = { created: 0, duplicates: [], emailBlock: "" };

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function createSubscriptionsFromOrder(tx: Prisma.TransactionClient, input: EnrollmentInput): Promise<EnrollmentResult> {
  const now = input.now ?? new Date();
  // Cart amounts are BOB even when dLocal rewrote the intent to USD for the charge.
  const currency = lineCurrencyFor(input.intent);
  const metadata = objectOf(input.intent.metadata);
  if (metadata.subscription) return NONE; // a renewal payment, not a first order
  const lines = (Array.isArray(metadata.cart) ? metadata.cart : []).filter(line => !!objectOf(line).subscription) as CartLine[];
  const email = input.intent.customerEmail?.trim().toLowerCase();
  if (!lines.length || !email) return NONE;

  const productIds = [...new Set(lines.map(line => String(line.paymentLinkId)))];
  const [products, offers] = await Promise.all([
    tx.paymentLink.findMany({ where: { id: { in: productIds }, storeId: input.order.storeId, status: "ACTIVE" }, select: { id: true, fulfillmentType: true, variants: true, name: true } }),
    tx.productSubscriptionOption.findMany({ where: { paymentLinkId: { in: productIds } } }),
  ]);
  const shipping = objectOf(metadata.shipping);
  const fulfillmentMeta = objectOf(metadata.fulfillment);
  const consent = objectOf(metadata.subscriptionConsent);
  const consentAt = typeof consent.at === "string" && !Number.isNaN(new Date(consent.at).getTime()) ? new Date(consent.at) : now;
  const fulfillment = {
    method: input.order.fulfillmentMethod ?? (typeof fulfillmentMeta.method === "string" ? fulfillmentMeta.method : null),
    locationId: input.order.fulfillmentLocationId, locationName: input.order.fulfillmentLocationName,
    zoneId: typeof shipping.id === "string" ? shipping.id : null, zoneName: typeof shipping.name === "string" ? shipping.name : null,
    fee: Number.isSafeInteger(shipping.amount) ? shipping.amount as number : 0,
    address: typeof shipping.address === "string" ? shipping.address : typeof fulfillmentMeta.address === "string" ? fulfillmentMeta.address : null,
  };

  const rows: Prisma.CustomerSubscriptionCreateManyInput[] = [];
  const info = new Map<string, { name: string; cadence: Cadence; amount: number; next: Date }>();
  for (const line of lines) {
    const cadence = line.subscription?.cadence;
    const product = products.find(candidate => candidate.id === line.paymentLinkId);
    const lockedUnitAmount = Number(line.subscription?.lockedUnitAmount);
    const quantity = Number(line.quantity);
    if (!isCadence(cadence) || !product || product.fulfillmentType === "DIGITAL" || !offers.some(offer => offer.paymentLinkId === product.id && offer.cadence === cadence)
      || !Number.isSafeInteger(lockedUnitAmount) || lockedUnitAmount <= 0 || !Number.isInteger(quantity) || quantity < 1) {
      logger.warn(`Skipped subscription line ${String(line.paymentLinkId)} on ${input.intent.id}`);
      continue;
    }
    const variantId = typeof line.variantId === "string" ? line.variantId : null;
    const extraIds = Array.isArray(line.extraIds) ? line.extraIds.filter((id): id is string => typeof id === "string") : [];
    const itemName = [String(line.name ?? product.name), typeof line.variantName === "string" ? line.variantName : null].filter(Boolean).join(" · ");
    const { interval, count } = cadenceInterval(cadence);
    const activeKey = productSubscriptionKey(input.order.storeId, { paymentLinkId: product.id, variantId, extraIds }, email);
    if (info.has(activeKey)) continue; // two identical subscription lines collapse into one subscription
    const nextBillingAt = advanceBillingDate(now, interval, count);
    info.set(activeKey, { name: itemName, cadence, amount: lockedUnitAmount * quantity + fulfillment.fee, next: nextBillingAt });
    rows.push({
      merchantId: input.order.merchantId, storeId: input.order.storeId, paymentLinkId: product.id, variantId, extraIds, itemName, quantity, cadence,
      discountPercent: Number(line.subscription?.discountPercent) || 0, unitAmount: lockedUnitAmount, currency,
      customerName: input.intent.customerName?.trim() || "Cliente", customerEmail: email, customerPhone: input.intent.customerPhone,
      consumerUserId: input.intent.consumerUserId, activeKey, status: "ACTIVE", startedAt: now, nextBillingAt,
      fulfillment, sourceOrderId: input.order.id,
      consentText: typeof consent.text === "string" ? consent.text : null, consentAt,
    });
  }
  if (!rows.length) return NONE;

  const keys = rows.map(row => row.activeKey!);
  const existing = new Set((await tx.customerSubscription.findMany({ where: { activeKey: { in: keys } }, select: { activeKey: true } })).map(row => row.activeKey));
  const fresh = rows.filter(row => !existing.has(row.activeKey!));
  const duplicates = rows.filter(row => existing.has(row.activeKey!)).map(row => info.get(row.activeKey!)!.name);
  const created = fresh.length ? (await tx.customerSubscription.createMany({ data: fresh, skipDuplicates: true })).count : 0;
  const createdRows = fresh.length
    ? await tx.customerSubscription.findMany({ where: { sourceOrderId: input.order.id, activeKey: { in: fresh.map(row => row.activeKey!) } }, select: { id: true, activeKey: true } })
    : [];

  const money = (amount: number) => `${(amount / 100).toFixed(2)} ${currency}`;
  const blocks = createdRows.map(row => {
    const entry = info.get(row.activeKey!)!;
    return `Suscripción: ${entry.name} · ${cadenceLabel(entry.cadence)}\nPróxima entrega: ${entry.next.toISOString().slice(0, 10)} · ${money(entry.amount)}\nTe enviaremos un enlace para pagar antes de cada entrega; no se cobra nada automáticamente.\nAdministra tu suscripción: ${subscriptionManageUrl(input.manage.checkoutOrigin, row.id, input.manage.secret)}`;
  });
  for (const name of duplicates) blocks.push(`Ya tenías una suscripción a ${name}; este pedido se registró como compra única.`);
  return { created, duplicates, emailBlock: blocks.join("\n\n") };
}

/** A renewal was paid: the next miss starts counting from zero. Never throws. */
export async function applyRenewalPaid(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  const invoice = await tx.subscriptionInvoice.findFirst({ where: { paymentIntentId, status: "PAID" }, select: { subscriptionId: true } });
  if (invoice) await tx.customerSubscription.updateMany({ where: { id: invoice.subscriptionId }, data: { missedCount: 0 } });
}
