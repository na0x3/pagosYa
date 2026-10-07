import { LedgerAccount, SettlementHoldStatus } from "@prisma/client";

const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;

export interface OpenHold {
  id: string;
  paymentIntentId: string;
  status: SettlementHoldStatus;
  pendingAmount: number;
  reserveAmount: number;
  createdAt: Date;
}

export interface HoldUpdate {
  id: string;
  pendingAmount: number;
  reserveAmount: number;
  status: SettlementHoldStatus;
}

export interface DrawdownPlan {
  debits: { account: LedgerAccount; amount: number }[];
  holdUpdates: HoldUpdate[];
}

const byAge = (a: OpenHold, b: OpenHold) => a.createdAt.getTime() - b.createdAt.getTime();

/** Oldest-first out of RESERVE_HELD holds; a hold emptied of reserve is CLOSED. */
export function takeFromReserve(amount: number, holds: OpenHold[]): HoldUpdate[] {
  let remaining = amount;
  const updates: HoldUpdate[] = [];
  for (const hold of holds.filter((h) => h.status === RESERVE_HELD && h.reserveAmount > 0).sort(byAge)) {
    if (remaining === 0) break;
    const take = Math.min(remaining, hold.reserveAmount);
    remaining -= take;
    const left = hold.reserveAmount - take;
    updates.push({ id: hold.id, pendingAmount: 0, reserveAmount: left, status: left === 0 ? CLOSED : RESERVE_HELD });
  }
  return updates;
}

/**
 * Where a refund's merchant net comes from (spec: automatic drawdown):
 * available → pending (the refunded payment's own hold first, then oldest) →
 * reserve (oldest first) → available again, driving it negative.
 */
export function planRefundDrawdown(params: { net: number; available: number; paymentIntentId: string; holds: OpenHold[] }): DrawdownPlan {
  let remaining = params.net;
  const fromAvailable = Math.min(remaining, Math.max(params.available, 0));
  remaining -= fromAvailable;

  const updates: HoldUpdate[] = [];
  const own = (h: OpenHold) => (h.paymentIntentId === params.paymentIntentId ? 0 : 1);
  let fromPending = 0;
  for (const hold of params.holds.filter((h) => h.status === PENDING && h.pendingAmount > 0).sort((a, b) => own(a) - own(b) || byAge(a, b))) {
    if (remaining === 0) break;
    const take = Math.min(remaining, hold.pendingAmount);
    remaining -= take;
    fromPending += take;
    const left = hold.pendingAmount - take;
    // A PENDING hold's reserveAmount is only planned; with nothing pending there is nothing left to reserve.
    updates.push({ id: hold.id, pendingAmount: left, reserveAmount: left === 0 ? 0 : hold.reserveAmount, status: left === 0 ? CLOSED : PENDING });
  }

  const reserveUpdates = remaining > 0 ? takeFromReserve(remaining, params.holds) : [];
  const fromReserve = reserveUpdates.reduce((sum, u) => {
    const before = params.holds.find((h) => h.id === u.id)!.reserveAmount;
    return sum + (before - u.reserveAmount);
  }, 0);
  remaining -= fromReserve;

  const fromPayable = fromAvailable + remaining;
  const debits = [
    ...(fromPayable > 0 ? [{ account: LedgerAccount.MERCHANT_PAYABLE, amount: fromPayable }] : []),
    ...(fromPending > 0 ? [{ account: LedgerAccount.MERCHANT_PENDING, amount: fromPending }] : []),
    ...(fromReserve > 0 ? [{ account: LedgerAccount.RESERVE, amount: fromReserve }] : []),
  ];
  return { debits, holdUpdates: [...updates, ...reserveUpdates] };
}
