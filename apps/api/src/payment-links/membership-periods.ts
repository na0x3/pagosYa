import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeMembershipPeriods, type MembershipPeriodInput } from "../memberships/membership-rules";

/** Fields a membership product always has: nothing to ship, no stock, no options (spec 2026-10-09 §1). */
export const MEMBERSHIP_PRODUCT_FIELDS = {
  fulfillmentType: "MEMBERSHIP", stock: null, shippingWeightGrams: 0,
  variants: [] as unknown as Prisma.InputJsonValue, extras: [] as unknown as Prisma.InputJsonValue,
};

/** Validates the request side of a membership edit; returns the periods to save, or null when none were sent. */
export function membershipRequest(dto: { membershipPeriods?: unknown; variants?: unknown[]; extras?: unknown[] }, required: boolean): MembershipPeriodInput[] | null {
  if (dto.variants?.length || dto.extras?.length) throw new BadRequestException("Las membresías no tienen opciones ni extras.");
  if (dto.membershipPeriods === undefined && !required) return null;
  return normalizeMembershipPeriods(dto.membershipPeriods);
}

export const cheapestPeriod = (periods: Array<{ amount: number }>) => Math.min(...periods.map(p => p.amount));

/** Call inside a transaction. Prices change for new members only; a removed length that any member used is archived. */
export async function syncMembershipPeriods(tx: Prisma.TransactionClient, paymentLinkId: string, periods: MembershipPeriodInput[]): Promise<void> {
  const existing = await tx.membershipPeriod.findMany({ where: { paymentLinkId } });
  for (const [position, period] of periods.entries()) {
    const row = existing.find(entry => entry.months === period.months);
    if (row) await tx.membershipPeriod.update({ where: { id: row.id }, data: { amount: period.amount, position, archivedAt: null } });
    else await tx.membershipPeriod.create({ data: { paymentLinkId, months: period.months, amount: period.amount, position } });
  }
  for (const row of existing) {
    if (row.archivedAt || periods.some(period => period.months === row.months)) continue;
    const used = await tx.customerSubscription.count({ where: { OR: [{ membershipPeriodId: row.id }, { pendingPeriodId: row.id }] } });
    if (used) await tx.membershipPeriod.update({ where: { id: row.id }, data: { archivedAt: new Date() } });
    else await tx.membershipPeriod.delete({ where: { id: row.id } });
  }
}
