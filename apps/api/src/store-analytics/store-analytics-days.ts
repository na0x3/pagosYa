/** Bolivia keeps UTC−4 all year (no DST), so a Bolivia calendar day is a fixed UTC window. */
const OFFSET_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;

/** The Bolivia calendar day (YYYY-MM-DD) an instant falls on. */
export const boliviaDay = (at: Date): string => new Date(at.getTime() - OFFSET_MS).toISOString().slice(0, 10);
/** A YYYY-MM-DD day moved by whole days. */
export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** The UTC instant a Bolivia day starts (04:00Z). */
export const boliviaDayStart = (day: string): Date => new Date(Date.parse(`${day}T00:00:00Z`) + OFFSET_MS);
/**
 * How many days `from`..`to` spans, both included (≤ 0 when `from` is after `to`), by arithmetic: callers must check a
 * range with this before listing it. Comparing the strings is not enough: past year 9999 `toISOString` writes
 * `+010000-01-01`, which sorts before `9999-12-31`.
 */
export const dayCount = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
/** The most days any list may hold: a report is at most 400 days; this only stops a caller that skipped the check. */
const MAX_LISTED_DAYS = 1000;
/** Every day from `from` to `to`, both included, counted by index (never by comparing day strings). */
export function daysBetween(from: string, to: string): string[] {
  const count = dayCount(from, to);
  if (!(count <= MAX_LISTED_DAYS)) throw new RangeError(`A day range may hold at most ${MAX_LISTED_DAYS} days`);
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(from, index));
}
