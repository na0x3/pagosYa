/** Bolivia keeps UTC−4 all year (no DST), so a Bolivia calendar day is a fixed UTC window. */
const OFFSET_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;

/** The Bolivia calendar day (YYYY-MM-DD) an instant falls on. */
export const boliviaDay = (at: Date): string => new Date(at.getTime() - OFFSET_MS).toISOString().slice(0, 10);
/** A YYYY-MM-DD day moved by whole days. */
export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** The UTC instant a Bolivia day starts (04:00Z). */
export const boliviaDayStart = (day: string): Date => new Date(Date.parse(`${day}T00:00:00Z`) + OFFSET_MS);
/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}
