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

/** One number: space-grouped thousands ("1 250", no-break spaces too) or dot/comma grouped. */
const NUM = String.raw`(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d[\d.,]*\d|\d)`;
/**
 * A number plus any numbers joined to it by a range or list connector ("200 y 300", "100 - 150", "255, 199 o 99").
 * A list comma must be followed by whitespace, so the decimal comma in "1.250,50" never splits an amount.
 */
const CONNECTOR = String.raw`(?:\s*(?:y|o|al?|hasta|-|\u2013|\/)\s*|,\s+|\s*;\s*)`;
const CHAIN = String.raw`${NUM}(?:${CONNECTOR}${NUM})*`;
/** What follows a number that is a percentage or a time of day, not money (used after a whole-number lookahead, so no backtracking into "15" of "15%"). */
const NOT_MONEY_AFTER = String.raw`(?!\s*(?:%|por\s*ciento|h\b|hs\b|hrs?\b|horas\b|am\b|pm\b|a\.\s?m|p\.\s?m))`;
const AMOUNT_BEFORE = new RegExp(String.raw`(?:\bbs\.?|\bbob\b|\$us|\bus\$|\busd\b|\$)\s*(${CHAIN})`, 'gi');
const AMOUNT_AFTER = new RegExp(`(${CHAIN})` + String.raw`\s*(?:bs\b\.?|bolivianos\b|bob\b|d[oó]lares\b|usd\b)`, 'gi');
/** Explicit price words make a bare number money: "cuesta 200", "a sólo 99,90", "(antes 300)", "Oferta: 120". Not "por" or "desde". */
const AMOUNT_AFTER_PRICE_WORD = new RegExp(String.raw`\b(?:cuestan?|precios?|valen?|a\s+s[oó]lo|antes|ofertas?|rebajas?)\s*[:=(]?\s*(${CHAIN})(?![.,]?\d)${NOT_MONEY_AFTER}`, 'gi');
/** A number with exactly two decimals ("99.90", "1.250,50") reads as money, unless it is a percentage or a time ("a las 9.30", "18.30 hrs"). */
const TWO_DECIMALS = new RegExp(String.raw`(?<![\d.,]|\d[ \u00a0\u202f]|\blas\s)(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?![.,]?\d)${NOT_MONEY_AFTER}`, 'gi');
const EACH_NUMBER = new RegExp(NUM, 'g');
const PERCENT = /(\d+(?:[.,]\d+)?)\s*(?:%|por\s*ciento)/gi;

/** Money and percentages a reply states. Quantities, dates, times and phone numbers carry no currency, so they are not read. */
export function readReplyNumbers(text: string): { amounts: number[]; percents: number[] } {
  const amounts: number[] = [];
  for (const pattern of [AMOUNT_BEFORE, AMOUNT_AFTER, AMOUNT_AFTER_PRICE_WORD, TWO_DECIMALS]) {
    for (const match of text.matchAll(pattern)) {
      for (const number of match[1].matchAll(EACH_NUMBER)) {
        const cents = parseMoney(number[0]);
        if (cents !== null && !amounts.includes(cents)) amounts.push(cents);
      }
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
