/* Fix 4 (2026-11-02, goodProtein #12 request 7: «envío gratis desde Bs 300» got «Listo» and an FAQ nobody sees, the delivery zone
 * unchanged): a shipping price in the merchant's words is a store setting, not a design. This pure module reads it — the fee, the
 * amount from which delivery is free — and leaves the rest of the message for the usual edit. Amounts come back in cents. */

export type ShippingAsk = { fee?: number; freeAbove?: number; freeAlways?: boolean; unclearFree?: boolean; rest: string };

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SHIPPING = /\b(envios?|delivery|despachos?)\b/;
// The merchant wants the words on the page (a banner, a strip): that is a design request, left to the usual edit.
const ON_PAGE = /\b(seccion|banner|franja|aviso|anuncio|cinta|titulo|titular|frase|barra|cartel|letrero|preguntas?|faq|que diga)\b/;
const NUMBER = '(\\d{1,3}(?:\\.\\d{3})+|\\d+(?:,\\d{1,2})?)';
const FREE_FROM = new RegExp(`gratis\\b[^0-9]{0,60}?(?:desde|a partir de|mayou?res? a|mas de|sobre|arriba de|encima de|superiores? a|de)\\s*(?:bs\\.?|bob)?\\s*${NUMBER}`);
const FEE = new RegExp(`(?:cuesta|costo|cobra|cobro|cobrar|cobramos|vale|precio|tarifa|sale|a|de|en)\\s*(?:bs\\.?|bob)?\\s*${NUMBER}\\s*(?:bs\\b\\.?|bob\\b|bolivianos\\b)?`);

// «1.500» is a thousand five hundred; «12,50» is twelve and a half.
const cents = (raw: string) => {
  const value = Number(/\.\d{3}$/.test(raw) ? raw.replace(/\./g, '') : raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= 100_000 ? Math.round(value * 100) : undefined;
};

/** The shipping price a message sets, or null when it sets none (a question, words for the page, no shipping at all). */
export function readShippingAsk(message: string): ShippingAsk | null {
  const text = message.trim();
  const folded = fold(text);
  if (!SHIPPING.test(folded) || /[?¿]/.test(text) || /^(cuanto|cual|como|que|tengo|hay)\b/.test(folded)) return null;
  // Sentences, then the parts joined by «y», commas or «también»; a part about shipping is read, the others are the rest.
  // The merchant's quoted words («Proteína buena, todos los días») are never split: they are kept aside while the message is cut.
  const quotes: string[] = [];
  const kept = text.replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, quote => `\u0000${quotes.push(quote) - 1}\u0000`);
  const parts = kept.split(/(?<=[.;!])\s+|\n+|,\s+|\s+(?:y|e|tambi[eé]n|adem[aá]s)\s+/i).map(part => part?.trim()).filter(Boolean)
    .map(part => part.replace(/\u0000(\d+)\u0000/g, (_, at) => quotes[Number(at)]));
  const ask: ShippingAsk = { rest: '' };
  const rest: string[] = [];
  let previousShipping = false;
  for (const part of parts) {
    const words = fold(part);
    // Words for the page («una franja que diga envío gratis») are a design request: they stay in the rest.
    const about: boolean = !ON_PAGE.test(words) && (SHIPPING.test(words) || (previousShipping && /\bgratis\b/.test(words)));
    previousShipping = about;
    if (!about) { rest.push(part); continue; }
    const free = FREE_FROM.exec(words);
    if (free) { const amount = cents(free[1]); if (amount) ask.freeAbove = amount; }
    const beforeFree = free ? words.slice(0, free.index) : words;
    const fee = /\bgratis\b/.test(beforeFree) ? null : FEE.exec(beforeFree);
    if (fee) { const amount = cents(fee[1]); if (amount) ask.fee = amount; }
    if (!free && /\bgratis\b/.test(words)) {
      if (/\b(todo|todos|todas|siempre|cualquier)\b/.test(words)) ask.freeAlways = true;
      else if (ask.fee === undefined) ask.unclearFree = true;
    }
  }
  if (ask.fee === undefined && ask.freeAbove === undefined && !ask.freeAlways && !ask.unclearFree) return null;
  ask.rest = rest.join(', ').replace(/^[,.;\s]+|[,;\s]+$/g, '').trim();
  // A leftover of a word or two («porfa», «gracias») is not a request.
  if (ask.rest.split(/\s+/).filter(word => word.length > 2).length < 2) ask.rest = '';
  return ask;
}

/** «Bs 300», «Bs 12,50». */
export const bolivianos = (amount: number) => `Bs ${Number.isInteger(amount / 100) ? amount / 100 : (amount / 100).toFixed(2).replace('.', ',')}`;
