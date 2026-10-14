import { readReplyNumbers } from './assistant-text';

export type AllowedNumbers = { amounts: Set<number>; percents: Set<number> };

/** Every amount and percentage found in this turn's evidence (summary, buyer message, tool outputs). */
export function allowedFrom(texts: string[]): AllowedNumbers {
  const allowed: AllowedNumbers = { amounts: new Set(), percents: new Set() };
  for (const text of texts) {
    const found = readReplyNumbers(text);
    found.amounts.forEach((cents) => allowed.amounts.add(cents));
    found.percents.forEach((percent) => allowed.percents.add(percent));
  }
  return allowed;
}

/** A reply may only state money and percentages present in the evidence; anything else was invented. */
export function checkReply(text: string, allowed: AllowedNumbers): { ok: true } | { ok: false; offending: string[] } {
  const { amounts, percents } = readReplyNumbers(text);
  const offending = [
    ...amounts.filter((cents) => !allowed.amounts.has(cents)).map((cents) => `Bs ${cents / 100}`),
    ...percents.filter((percent) => !allowed.percents.has(percent)).map((percent) => `${percent}%`),
  ];
  return offending.length ? { ok: false, offending } : { ok: true };
}
