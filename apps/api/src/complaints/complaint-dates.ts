import { laPazDateKey, laPazDayStart } from "../settlement/settlement-dates";

/** ASFI first-instance deadlines (⚖ lawyer to confirm). Business days are Mon–Fri; holidays are not skipped, so a
 * deadline can only fall earlier than the regulator's, never later. */
export const ANSWER_BUSINESS_DAYS = 5;
export const MERCHANT_BUSINESS_DAYS = 2;
export const EXTENSION_BUSINESS_DAYS = 5;

function isWeekday(dayStart: Date): boolean {
  const weekday = new Date(`${laPazDateKey(dayStart)}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** 23:59:59.999 La Paz on the n-th weekday after `at`'s La Paz date. */
export function addBusinessDays(at: Date, n: number): Date {
  let day = 0;
  let counted = 0;
  while (counted < n) {
    day += 1;
    if (isWeekday(laPazDayStart(at, day))) counted += 1;
  }
  return new Date(laPazDayStart(at, day + 1).getTime() - 1);
}

/** Weekdays after `from`'s La Paz date, up to and including `to`'s. */
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  for (let day = 1; laPazDayStart(from, day).getTime() <= to.getTime(); day += 1) {
    if (isWeekday(laPazDayStart(from, day))) count += 1;
  }
  return count;
}

export function complaintYear(at: Date): number {
  return Number(laPazDateKey(at).slice(0, 4));
}
