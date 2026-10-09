import { BadRequestException } from "@nestjs/common";
import { createHash } from "crypto";
import { advanceBillingDate } from "../operations/subscription-pricing";

/** Membership arithmetic shared by the owner API, checkout, enrollment and the renewal engine (spec 2026-10-09). */
export const MEMBERSHIP_MONTHS = [1, 3, 6, 12] as const;
export { MEMBERSHIP_NOTICE_HOURS } from "../operations/subscription-pricing";
export const MAX_MEMBERSHIP_PERIODS = 4;
export const MEMBERSHIP_CONSENT_TEXT = "Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.";
const MAX_AMOUNT = 2_147_483_647;
const DAY_MS = 86_400_000;

export type MembershipPeriodInput = { months: number; amount: number };

export function normalizeMembershipPeriods(value: unknown): MembershipPeriodInput[] {
  const problem = "Indica de uno a cuatro períodos distintos (1, 3, 6 o 12 meses), cada uno con un precio mayor que cero.";
  if (!Array.isArray(value) || !value.length || value.length > MAX_MEMBERSHIP_PERIODS) throw new BadRequestException(problem);
  const periods = value.map(entry => ({ months: Number((entry as MembershipPeriodInput)?.months), amount: Number((entry as MembershipPeriodInput)?.amount) }));
  if (periods.some(p => !(MEMBERSHIP_MONTHS as readonly number[]).includes(p.months) || !Number.isSafeInteger(p.amount) || p.amount <= 0 || p.amount > MAX_AMOUNT)
    || new Set(periods.map(p => p.months)).size !== periods.length) throw new BadRequestException(problem);
  return periods;
}

const LABEL: Record<number, string> = { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const SUFFIX: Record<number, string> = { 1: "/ mes", 3: "/ 3 meses", 6: "/ 6 meses", 12: "/ año" };
export const periodLabel = (months: number) => LABEL[months] ?? `Cada ${months} meses`;
export const periodSuffix = (months: number) => SUFFIX[months] ?? `/ ${months} meses`;

export function membershipKey(storeId: string, paymentLinkId: string, storeCustomerId: string): string {
  return createHash("sha256").update(`${storeId}:membership:${paymentLinkId}:${storeCustomerId}`).digest("hex");
}

/** A paid period starts where the previous one ended; paying early or late never moves the end date. */
export function accessAfterPayment(periodStart: Date, months: number, current: Date | null): Date {
  const next = advanceBillingDate(periodStart, "MONTHLY", months);
  return current && current > next ? current : next;
}

export type MembershipState = "ACTIVE" | "GRACE" | "LAPSED" | "CANCELED_ACTIVE" | "CANCELED";
export const MEMBERSHIP_STATE_LABEL: Record<MembershipState, string> = { ACTIVE: "Activa", GRACE: "En gracia", LAPSED: "Vencida", CANCELED_ACTIVE: "Cancelada", CANCELED: "Cancelada" };
type Row = { status: string; accessUntil: Date | null };

export function membershipState(row: Row, graceDays: number, now = new Date()): MembershipState {
  const until = row.accessUntil?.getTime() ?? 0;
  if (row.status === "LAPSED") return "LAPSED";
  if (row.status !== "ACTIVE") return now.getTime() < until ? "CANCELED_ACTIVE" : "CANCELED";
  if (now.getTime() < until) return "ACTIVE";
  return now.getTime() < until + graceDays * DAY_MS ? "GRACE" : "LAPSED";
}
export const hasMembershipAccess = (row: Row, graceDays: number, now = new Date()) => ["ACTIVE", "GRACE", "CANCELED_ACTIVE"].includes(membershipState(row, graceDays, now));
export const blocksRejoin = hasMembershipAccess;

/** What the next renewal bills: the member's locked price, or the pending period's current price when a switch is due. */
export function membershipTermsPeriod(
  subscription: { membershipPeriodId: string | null; pendingPeriodId: string | null; unitAmount: number | null },
  periods: Map<string, { months: number; amount: number }>,
): { months: number; amount: number; switching: boolean } | null {
  const pending = subscription.pendingPeriodId ? periods.get(subscription.pendingPeriodId) : undefined;
  if (pending) return { months: pending.months, amount: pending.amount, switching: true };
  const current = subscription.membershipPeriodId ? periods.get(subscription.membershipPeriodId) : undefined;
  if (!current || !subscription.unitAmount) return null;
  return { months: current.months, amount: subscription.unitAmount, switching: false };
}
