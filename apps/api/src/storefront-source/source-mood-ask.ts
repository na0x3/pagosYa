/** Lively one-product stores (spec 2026-11-03): «hazla más tranquila» / «más colorida» on a Único store switch its mood, never a
 *  specific colour (that stays a design edit). */
const CALM = /\bm[aá]s\s+(tranquil[ao]|sobri[ao]|seri[ao]|calmad[ao])\b|\bmenos\s+colou?r(es)?\b/i;
const COLOURFUL = /\bm[aá]s\s+(colorid[ao]|divertid[ao]|alegre|juguet[oó]n[ao]?)\b|\bm[aá]s\s+colou?r(es)?\b|\bdale\s+m[aá]s\s+color\b/i;
export function readMoodAsk(text: string): 'colourful' | 'calm' | null {
  if (CALM.test(text)) return 'calm';
  if (COLOURFUL.test(text)) return 'colourful';
  return null;
}
