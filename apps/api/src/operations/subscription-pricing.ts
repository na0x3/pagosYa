import { createHash } from "crypto";

/** Product-subscription arithmetic shared by checkout, enrollment and the renewal engine (spec 2026-09-28). */
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Cadence = typeof CADENCES[number];
export const PRODUCT_NOTICE_HOURS = 72;
export const LAST_REMINDER_AFTER_DAYS = 3;
export const MISSED_AFTER_DAYS = 7;
export const REPRICE_NOTICE_DAYS = 7;

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}

export function cadenceLabel(cadence: Cadence): string {
  return cadence === "WEEKLY" ? "cada semana" : cadence === "BIWEEKLY" ? "cada dos semanas" : "cada mes";
}

export function cadenceInterval(cadence: Cadence): { interval: "WEEKLY" | "MONTHLY"; count: number } {
  return cadence === "MONTHLY" ? { interval: "MONTHLY", count: 1 } : { interval: "WEEKLY", count: cadence === "BIWEEKLY" ? 2 : 1 };
}

export function advanceBillingDate(date: Date, interval: string, count: number): Date {
  const next = new Date(date);
  if (interval === "WEEKLY") { next.setUTCDate(next.getUTCDate() + count * 7); return next; }
  const months = interval === "YEARLY" ? count * 12 : count;
  // 31 January + 1 month is the last day of February, never 3 March.
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function monthlyFactor(interval: string, count: number): number {
  if (interval === "WEEKLY") return 30 / (7 * count);
  if (interval === "YEARLY") return 1 / (12 * count);
  return 1 / count;
}

export function subscriptionPrices(input: { baseAmount: number; oneTimeAmount: number; extrasAmount: number; discountPercent: number }) {
  const discounted = Math.round(input.baseAmount * (100 - input.discountPercent) / 100);
  return {
    firstUnitAmount: Math.min(input.oneTimeAmount, discounted) + input.extrasAmount,
    lockedUnitAmount: discounted + input.extrasAmount,
  };
}

export function subscriptionConsentText(cadence: Cadence): string {
  return `Acepto que este pedido se repita ${cadenceLabel(cadence)}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
}

export function productSubscriptionKey(storeId: string, line: { paymentLinkId: string; variantId?: string | null; extraIds?: string[] }, email: string): string {
  const extras = [...(line.extraIds ?? [])].sort().join(",");
  return createHash("sha256").update(`${storeId}:product:${line.paymentLinkId}:${line.variantId ?? ""}:${extras}:${email.trim().toLowerCase()}`).digest("hex");
}

export type SubscriptionTerms = { name: string; interval: string; count: number; amount: number; currency: string; noticeHours: number; product: boolean };
export type TermsPlan = { id: string; name: string; amount: number; currency: string; interval: string; intervalCount: number; reminderHoursBefore: number };
export type TermsSubscription = {
  planId: string | null; paymentLinkId: string | null; amountOverride?: number | null; nextAmountOverride?: number | null;
  itemName?: string | null; cadence?: string | null; unitAmount?: number | null; quantity?: number | null; currency?: string | null;
  pendingUnitAmount?: number | null; pendingFrom?: Date | null; fulfillment?: unknown;
};

/** What one period of this subscription costs and when its notice goes out; null when it cannot be billed. */
export function subscriptionTerms(subscription: TermsSubscription, plan: TermsPlan | null, now = new Date()): SubscriptionTerms | null {
  if (subscription.paymentLinkId) {
    if (!isCadence(subscription.cadence) || !subscription.unitAmount || !subscription.quantity) return null;
    const { interval, count } = cadenceInterval(subscription.cadence);
    const unit = subscription.pendingUnitAmount && subscription.pendingFrom && subscription.pendingFrom <= now ? subscription.pendingUnitAmount : subscription.unitAmount;
    const fee = Number((subscription.fulfillment as { fee?: unknown } | null)?.fee) || 0;
    return { name: subscription.itemName ?? "Suscripción", interval, count, amount: unit * subscription.quantity + fee, currency: subscription.currency ?? "BOB", noticeHours: PRODUCT_NOTICE_HOURS, product: true };
  }
  if (!plan || subscription.planId !== plan.id) return null;
  return {
    name: plan.name, interval: plan.interval, count: plan.intervalCount,
    amount: subscription.nextAmountOverride ?? subscription.amountOverride ?? plan.amount,
    currency: plan.currency, noticeHours: plan.reminderHoursBefore, product: false,
  };
}
