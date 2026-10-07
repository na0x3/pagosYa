// America/La_Paz is UTC-4 all year (Bolivia has no daylight saving time).
const LA_PAZ_OFFSET_MS = 4 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export const PAYOUT_BATCH_HOUR_LA_PAZ = 10;

/** 00:00 La Paz on the calendar day `days` after `at`'s La Paz date. */
export function laPazDayStart(at: Date, days: number): Date {
  const localMidnight = Math.floor((at.getTime() - LA_PAZ_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(localMidnight + days * DAY_MS + LA_PAZ_OFFSET_MS);
}

/** The next daily payout batch (10:00 La Paz) strictly after `now`. */
export function nextPayoutBatch(now: Date): Date {
  const today = laPazDayStart(now, 0).getTime() + PAYOUT_BATCH_HOUR_LA_PAZ * 60 * 60_000;
  return new Date(today > now.getTime() ? today : today + DAY_MS);
}

/** "YYYY-MM-DD" of `at` in La Paz. */
export function laPazDateKey(at: Date): string {
  return new Date(at.getTime() - LA_PAZ_OFFSET_MS).toISOString().slice(0, 10);
}
