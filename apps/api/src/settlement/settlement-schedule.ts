import { SettlementHoldStatus } from "@prisma/client";
import { laPazDateKey } from "./settlement-dates";

export interface ScheduledRelease {
  date: string;
  currency: string;
  toAvailable: number;
  fromReserve: number;
}

type ScheduleHold = { status: SettlementHoldStatus; currency: string; pendingAmount: number; reserveAmount: number; availableAt: Date; reserveReleaseAt: Date };

/** What becomes available on which La Paz day, per currency, up to `until`. Zero rows are dropped. */
export function buildReleaseSchedule(holds: ScheduleHold[], until: Date): ScheduledRelease[] {
  const rows = new Map<string, ScheduledRelease>();
  const add = (at: Date, currency: string, toAvailable: number, fromReserve: number) => {
    if (at > until || (toAvailable === 0 && fromReserve === 0)) return;
    const date = laPazDateKey(at);
    const key = `${date}|${currency}`;
    const row = rows.get(key) ?? { date, currency, toAvailable: 0, fromReserve: 0 };
    row.toAvailable += toAvailable;
    row.fromReserve += fromReserve;
    rows.set(key, row);
  };
  for (const hold of holds) {
    if (hold.status === SettlementHoldStatus.PENDING) {
      const reserve = Math.min(hold.reserveAmount, hold.pendingAmount);
      add(hold.availableAt, hold.currency, hold.pendingAmount - reserve, 0);
      add(hold.reserveReleaseAt, hold.currency, 0, reserve);
    } else if (hold.status === SettlementHoldStatus.RESERVE_HELD) {
      add(hold.reserveReleaseAt, hold.currency, 0, hold.reserveAmount);
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
}
