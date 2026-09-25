/**
 * D2: money the way Bolivian merchants write it — "Bs 1.500", "Bs.- 1500", "$us 200", "Sus 200",
 * "1.500 bolivianos", "3 mil", "1,5 mil Bs", "mil quinientos bolivianos", "Bs 1.500 a 2.000" — and
 * the numbers that are not money: "50 personas", "15 de octubre", "2026", "70012345", "50%".
 *
 * Two readers use the same scan: the merchant's brief (which numbers may become a price) and the
 * AI's text (which money mentions nobody wrote and must become {{precio}}).
 */

export type MoneyCurrency = "BOB" | "USD" | "OTHER";

export type MoneyMention = {
  /** The whole mention, currency and range included (what the text guard replaces). */
  start: number;
  end: number;
  /** The first number's own span (what a merchant quote must cover). */
  numberStart: number;
  numberEnd: number;
  /** Centavos, one per number ("1.500 a 2.000" has two). */
  values: number[];
  /** The currency written next to it; null when none was written. */
  currency: MoneyCurrency | null;
  range: boolean;
  /** Up to three words right before and right after, lowercased. */
  before: string[];
  after: string[];
  /** Why a number with no currency is not money: a count, a percentage, a date or a time. */
  notMoney: null | "unit" | "percent" | "date" | "time";
  /** A lone 19xx/20xx with no separators. */
  yearLike: boolean;
  /** In a date context ("octubre de 2026", "en 2026", "del 2027"). */
  yearInContext: boolean;
  /** Longest run of digits with no separator (a phone number is 7 or more). */
  digitRun: number;
};

const NUMBER = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const NUMBER_RE = new RegExp(String.raw`(?<![\d.,])(?:${NUMBER})(?!\d|[.,]\d)`, "gu");
const MULTIPLIER_RE = /^[ \u00a0]*(mil|k)(?![\p{L}\d])/iu;

// Currency written before the number: Bs, Bs., Bs.-, BOB, $us, Sus, US$, USD, $.
const PREFIX_RE = /(?<![\p{L}\d$])(US\$|USD|BOB|\$us\.?|Bs\.?-?|\$)[ \u00a0]*$/iu;
const SUS_PREFIX_RE = /(?<![\p{L}\d$])(S[uU][sS]\.?)[ \u00a0]*$/u; // "Sus", never the word "sus"
// Currency written after it. A trailing "Bs." keeps its period (it may end the sentence).
const SUFFIX_RE = /^[ \u00a0]*(Bs(?![\p{L}])|BOB(?![\p{L}])|USD(?![\p{L}])|\$us(?![\p{L}])|bolivianos?(?![\p{L}])|d[oó]lar(?:es)?(?:[ \u00a0]+(?:americanos|estadounidenses))?(?![\p{L}])|pesos?(?![\p{L}]))/iu;
const SUS_SUFFIX_RE = /^[ \u00a0]*(S[uU][sS])(?![\p{L}])/u;
const RANGE_GAP_RE = /^[ \u00a0]*(-|–|—|a|y|hasta)[ \u00a0]*$/iu;

const MONTHS = new Set(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre"]);
const YEAR_WORDS = new Set(["año", "años", "en", "del", "gestión", "gestion", "hasta", "desde"]);

/** Words that may follow an amount; any other word right after a bare number makes it a count ("3 cocineros"). */
const CONNECTORS = new Set([
  "y", "o", "e", "u", "por", "para", "en", "con", "más", "mas", "menos", "el", "la", "los", "las", "al", "del", "de", "cada", "que", "sin",
  "incluye", "incluido", "incluidos", "incluidas", "total", "totales", "aprox", "aproximadamente", "finales", "final", "neto", "netos",
  "mensuales", "mensual", "fijo", "fijos", "se", "es", "son", "iva", "facturados", "facturado", "como", "a", "hasta", "entre",
]);

const WORD_VALUES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiún: 21, veintiun: 21, veintiuno: 21, veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiséis: 26, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900, mil: 1000, millón: 1_000_000, millon: 1_000_000, millones: 1_000_000,
};
const WORD = Object.keys(WORD_VALUES).sort((a, b) => b.length - a.length).join("|");
const WORDS_RE = new RegExp(String.raw`(?<![\p{L}\d])(?:${WORD})(?:[ \u00a0]+(?:y[ \u00a0]+)?(?:${WORD}))*(?![\p{L}])`, "giu");

/** Centavos from a written number: "1.500", "1,500.50", "1500,00", "1 500", "3" (× 1000 with "mil"/"k"). */
export function numberToCents(token: string, thousands: boolean): number | null {
  const decimal = /[.,](\d{1,2})$/.exec(token);
  const integerPart = decimal ? token.slice(0, decimal.index) : token;
  if (/[., \u00a0]/.test(integerPart) && !/^\d{1,3}([., \u00a0]\d{3})+$/.test(integerPart)) return null;
  const units = Number(integerPart.replace(/[., \u00a0]/g, "") || "0");
  const cents = units * 100 + (decimal ? Number(decimal[1].padEnd(2, "0")) : 0);
  const value = thousands ? cents * 1000 : cents;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** "mil quinientos" → 1500; "ciento cincuenta" → 150; null when it does not read as one number. */
function wordsToUnits(phrase: string): number | null {
  let total = 0;
  let current = 0;
  for (const word of phrase.toLowerCase().split(/[ \u00a0]+/)) {
    if (word === "y") continue;
    const value = WORD_VALUES[word];
    if (value === undefined) return null;
    if (value === 1000) { current = (current || 1) * 1000; total += current; current = 0; }
    else if (value === 1_000_000) { total = (total + (current || 1)) * 1_000_000; current = 0; }
    else current += value;
  }
  const units = total + current;
  return units > 0 ? units : null;
}

const currencyOf = (symbol: string): MoneyCurrency => {
  const lower = symbol.toLowerCase();
  if (lower.startsWith("bs") || lower === "bob" || lower.startsWith("bolivian")) return "BOB";
  if (lower.startsWith("peso")) return "OTHER";
  return "USD";
};

const wordsBefore = (text: string, at: number) => {
  // The same clause only: a sentence end cuts the look-back ("Bs." as a currency is part of the mention).
  const clause = text.slice(Math.max(0, at - 80), at).split(/[.;!?\n](?=\s|$)/).pop() ?? "";
  return (clause.toLowerCase().match(/[\p{L}]+|\d+/gu) ?? []).slice(-3);
};
const wordsAfter = (text: string, at: number) => {
  const clause = text.slice(at, at + 80).split(/[.;!?\n](?=\s|$)/)[0] ?? "";
  return (clause.toLowerCase().match(/[\p{L}]+|\d+/gu) ?? []).slice(0, 3);
};

type Candidate = { start: number; end: number; numberStart: number; numberEnd: number; cents: number; token: string; words: boolean; prefix: MoneyCurrency | null; prefixStart: number; suffix: MoneyCurrency | null; suffixEnd: number };

function candidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const start = match.index ?? 0;
    // Glued to a word it is part of it ("m2", "PRO-0001" is fine), unless the word is a currency ("Bs150").
    if (/\p{L}$/u.test(text.slice(0, start)) && !/(?:Bs|BOB|USD|\$us|S[uU][sS])$/i.test(text.slice(Math.max(0, start - 4), start))) continue;
    let end = start + match[0].length;
    const multiplier = MULTIPLIER_RE.exec(text.slice(end));
    if (multiplier) end += multiplier[0].length;
    const cents = numberToCents(match[0], Boolean(multiplier));
    if (cents) found.push(withCurrency(text, { start, end, numberStart: start, numberEnd: end, cents, token: match[0], words: false }));
  }
  // Written in words: money only with a currency next to it ("mil quinientos bolivianos").
  for (const match of text.matchAll(WORDS_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (found.some((other) => start < other.end && end > other.start)) continue;
    const units = wordsToUnits(match[0]);
    if (!units) continue;
    const candidate = withCurrency(text, { start, end, numberStart: start, numberEnd: end, cents: units * 100, token: match[0], words: true });
    if (candidate.prefix || candidate.suffix) found.push(candidate);
  }
  return found.sort((a, b) => a.start - b.start);
}

function withCurrency(text: string, base: Omit<Candidate, "prefix" | "prefixStart" | "suffix" | "suffixEnd">): Candidate {
  const head = text.slice(Math.max(0, base.start - 12), base.start);
  const prefix = PREFIX_RE.exec(head) ?? SUS_PREFIX_RE.exec(head);
  const tail = text.slice(base.end);
  const suffix = SUFFIX_RE.exec(tail) ?? SUS_SUFFIX_RE.exec(tail);
  return {
    ...base,
    prefix: prefix ? currencyOf(prefix[1]) : null,
    prefixStart: prefix ? base.start - head.length + (prefix.index ?? 0) : base.start,
    suffix: suffix ? currencyOf(suffix[1]) : null,
    suffixEnd: suffix ? base.end + suffix[0].length : base.end,
  };
}

/** Every number in the text with what surrounds it; the callers decide which ones are money. */
export function scanMoney(text: string): MoneyMention[] {
  const list = candidates(text);
  const mentions: MoneyMention[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const first = list[index];
    const parts = [first];
    // A range is one mention: "Bs 1.500-2.000", "entre Bs 1.500 y 2.000", "1.500 hasta 2.000 Bs".
    const next = list[index + 1];
    if (next) {
      const gap = RANGE_GAP_RE.exec(text.slice(first.suffix ? first.suffixEnd : first.end, next.prefixStart));
      const joiner = gap?.[1].toLowerCase();
      const currencies = [first.prefix ?? first.suffix, next.prefix ?? next.suffix].filter(Boolean);
      if (gap && (joiner === "-" || joiner === "–" || joiner === "—" || joiner === "hasta" || next.cents > first.cents) && new Set(currencies).size <= 1) {
        parts.push(next);
        index += 1;
      }
    }
    const last = parts[parts.length - 1];
    const start = first.prefix ? first.prefixStart : first.start;
    const end = last.suffix ? last.suffixEnd : last.end;
    const currency = first.prefix ?? first.suffix ?? last.prefix ?? last.suffix ?? null;
    const before = wordsBefore(text, start);
    const after = wordsAfter(text, end);
    const tail = text.slice(end);
    let notMoney: MoneyMention["notMoney"] = null;
    const nextWord = /^[ \u00a0]*([\p{L}][\p{L}²³\d]*)/u.exec(tail)?.[1]?.toLowerCase();
    if (/^[ \u00a0]*%/.test(tail)) notMoney = "percent";
    else if (/^[:/hH]\d/.test(tail) || /\d[:/]$/.test(text.slice(0, start))) notMoney = "time";
    else if (nextWord === "de" && MONTHS.has(after[1] ?? "")) notMoney = "date";
    else if (MONTHS.has(before[before.length - 1] ?? "")) notMoney = "date";
    else if (nextWord && !CONNECTORS.has(nextWord)) notMoney = "unit";
    const plain = /^\d{4}$/.test(first.token) && parts.length === 1 && first.end === first.numberEnd;
    const yearLike = plain && Number(first.token) >= 1900 && Number(first.token) <= 2099;
    const previous = before[before.length - 1] ?? "";
    const yearInContext = yearLike && (YEAR_WORDS.has(previous) || (previous === "de" && MONTHS.has(before[before.length - 2] ?? "")));
    const digitRun = Math.max(...parts.map((part) => (part.words ? 0 : /[ \u00a0]/.test(part.token) ? part.token.replace(/\D/g, "").length : Math.max(...(part.token.match(/\d+/g) ?? [""]).map((run) => run.length)))));
    mentions.push({
      start, end, numberStart: first.numberStart, numberEnd: first.numberEnd,
      values: parts.map((part) => part.cents), currency, range: parts.length > 1,
      before, after, notMoney, yearLike, yearInContext, digitRun,
    });
  }
  return mentions;
}

/** Words that make a bare number a price the merchant stated. */
const PRICE_CUES = new Set(["presupuesto", "precio", "precios", "cuesta", "cuestan", "costo", "costos", "cobro", "cobra", "cobramos", "tarifa", "total", "valor", "vale", "monto"]);
/** Words that make it a price for the whole job, not for one line. */
const TOTAL_CUES = new Set(["presupuesto", "total", "todo"]);
/** "a" and "por" count only right before the number ("por 800"). */
const ADJACENT_CUES = new Set(["a", "por"]);

export type MerchantAmount = {
  cents: number;
  currency: MoneyCurrency | null;
  field: "brief" | "budget";
  /** The number's span in that field's text. */
  start: number;
  end: number;
  /** A budget for the whole job ("presupuesto total Bs 3.000"). */
  total: boolean;
};

const hasCue = (mention: MoneyMention) =>
  mention.before.some((word) => PRICE_CUES.has(word)) || ADJACENT_CUES.has(mention.before[mention.before.length - 1] ?? "");

/**
 * The amounts a merchant stated, the only non-catalog prices a draft may use. In the brief a number
 * is money only with a currency next to it or a price word right before it; in the budget field every
 * number is. Never a count ("50 personas"), a date, a percentage, a year with no currency, a phone
 * number (7+ digits in a row) or a range.
 */
export function merchantAmounts(brief: string | null | undefined, budgetHint?: string | null): MerchantAmount[] {
  const amounts: MerchantAmount[] = [];
  for (const [field, text] of [["brief", brief ?? ""], ["budget", budgetHint ?? ""]] as const) {
    const accepted = scanMoney(text).filter((mention) => {
      if (mention.range || mention.currency === "OTHER" || mention.digitRun >= 7 || mention.values[0] > 100_000_000_000) return false;
      if (mention.currency) return true;
      if (mention.notMoney || mention.yearLike) return false;
      return field === "budget" || hasCue(mention);
    });
    for (const mention of accepted) {
      const itemCue = mention.before.some((word) => PRICE_CUES.has(word) && !TOTAL_CUES.has(word)) || ADJACENT_CUES.has(mention.before[mention.before.length - 1] ?? "");
      const total = mention.before.some((word) => TOTAL_CUES.has(word)) || (field === "budget" && accepted.length === 1 && !itemCue);
      amounts.push({ cents: mention.values[0], currency: mention.currency, field, start: mention.numberStart, end: mention.numberEnd, total });
    }
  }
  return amounts;
}

/** In the AI's text a bare number is money near these words ("Anticipo de 1500", "total: 1.500", "1.500 de inversión"). */
const TEXT_CUES = new Set([...PRICE_CUES, "inversión", "inversion", "anticipo", "adelanto", "saldo", "pago", "pagos", "importe", "cuota", "presupuestos"]);

/**
 * The money mentions of a text the AI wrote: anything with a currency, and a bare number of 100 or
 * more within three words of a price word (or right after "a"/"por") that is not a count, date,
 * time, percentage or year.
 */
export function moneyInText(text: string): MoneyMention[] {
  return scanMoney(text).filter((mention) => {
    if (mention.currency) return true;
    if (mention.notMoney || mention.yearInContext) return false;
    if (mention.values.some((value) => value < 10_000)) return false;
    return mention.before.some((word) => TEXT_CUES.has(word)) || mention.after.some((word) => TEXT_CUES.has(word)) || ADJACENT_CUES.has(mention.before[mention.before.length - 1] ?? "");
  });
}
