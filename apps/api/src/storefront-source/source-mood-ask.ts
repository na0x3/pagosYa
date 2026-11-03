/** Lively one-product stores (spec 2026-11-03): «hazla más tranquila» / «más colorida» on a Único store switch its mood, never a
 *  specific colour (that stays a design edit). Only when the mood is the whole request (review 2026-11-03): «un título más divertido»
 *  or «más colorida y cambia el precio» are other edits and go the usual way. */
const CALM = /\bm[aá]s\s+(tranquil[ao]|sobri[ao]|seri[ao]|calmad[ao])\b|\bmenos\s+colou?r(es)?\b/gi;
const COLOURFUL = /\bm[aá]s\s+(colorid[ao]|divertid[ao]|alegre|juguet[oó]n[ao]?)\b|\bm[aá]s\s+colou?r(es)?\b|\bdale\s+m[aá]s\s+color\b/gi;
const FILLER = new Set(['hazla', 'haz', 'hace', 'ponla', 'pon', 'dejala', 'que', 'se', 'vea', 'sea', 'la', 'el', 'mi', 'tu', 'su', 'tienda', 'pagina', 'web',
  'quiero', 'quisiera', 'algo', 'un', 'una', 'poco', 'por', 'favor', 'porfa', 'y', 'con', 'todo', 'toda', 'mas', 'look', 'estilo', 'ahora', 'mejor', 'dale']);
export function readMoodAsk(text: string): 'colourful' | 'calm' | null {
  const calm = CALM.test(text); CALM.lastIndex = 0;
  const colourful = COLOURFUL.test(text); COLOURFUL.lastIndex = 0;
  if (!calm && !colourful) return null;
  const rest = text.replace(CALM, ' ').replace(COLOURFUL, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (rest.some(word => !FILLER.has(word))) return null;
  return calm ? 'calm' : 'colourful';
}
