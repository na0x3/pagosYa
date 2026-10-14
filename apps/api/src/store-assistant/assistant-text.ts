/** Pure text helpers for the store assistant (spec 2026-10-13-store-assistant-design). */

export const foldText = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();

const EMAIL = /[^\s@,;:()<>]+@[^\s@,;:()<>]+\.[a-z]{2,}/gi;
const PHONE = /\+?\d[\d\s-]{6,}\d/g;

/** Replaces e-mail addresses and phone numbers, so a stored question never keeps who asked it. */
export const stripContact = (value: string) => value.replace(EMAIL, '[contacto]').replace(PHONE, '[contacto]');

/** For list views: "a***@mail.com" and "•••45". The detail view shows the original. */
export const maskContact = (value: string) => value
  .replace(EMAIL, (email) => `${email.slice(0, 1)}***${email.slice(email.indexOf('@'))}`)
  .replace(PHONE, (phone) => `•••${phone.replace(/\D/g, '').slice(-2)}`);

export const normaliseQuestion = (value: string) =>
  foldText(stripContact(value)).replace(/[¿?¡!.,;:"]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);

/** "125" | "125,00" | "1.250,50" | "1,250.50" | "1.250" → cents. */
export function parseMoney(raw: string): number | null {
  const value = raw.replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const lastDot = value.lastIndexOf('.'), lastComma = value.lastIndexOf(',');
  let plain: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    plain = value.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const parts = value.split(lastDot >= 0 ? '.' : ',');
    const tail = parts[parts.length - 1];
    plain = parts.length > 2 || tail.length === 3 ? parts.join('') : `${parts.slice(0, -1).join('')}.${tail}`;
  } else plain = value;
  const number = Number(plain);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

const NUMBER = String.raw`(\d[\d.,]*\d|\d)`;
const AMOUNT_BEFORE = new RegExp(String.raw`(?:\bbs\.?|\bbob\b|\$us|\bus\$|\busd\b|\$)\s*` + NUMBER, 'gi');
const AMOUNT_AFTER = new RegExp(NUMBER + String.raw`\s*(?:bs\b\.?|bolivianos\b|bob\b|d[oó]lares\b|usd\b)`, 'gi');
const PERCENT = /(\d+(?:[.,]\d+)?)\s*(?:%|por\s*ciento)/gi;

/** Money and percentages a reply states. Quantities, dates, times and phone numbers carry no currency, so they are not read. */
export function readReplyNumbers(text: string): { amounts: number[]; percents: number[] } {
  const amounts: number[] = [];
  for (const pattern of [AMOUNT_BEFORE, AMOUNT_AFTER]) {
    for (const match of text.matchAll(pattern)) {
      const cents = parseMoney(match[1]);
      if (cents !== null && !amounts.includes(cents)) amounts.push(cents);
    }
  }
  const percents: number[] = [];
  for (const match of text.matchAll(PERCENT)) {
    const value = Number(match[1].replace(',', '.'));
    if (Number.isFinite(value) && !percents.includes(value)) percents.push(value);
  }
  return { amounts, percents };
}

/** Bolivia is UTC−4 all year, so a La Paz calendar month starts at 04:00 UTC on the 1st. */
export function laPazMonthStart(now: Date): Date {
  const local = new Date(now.getTime() - 4 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 4));
}
