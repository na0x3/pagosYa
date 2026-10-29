import type { MasterVariants } from './source-master';

/** Owner 2026-10-27 («still no motion bubbles like we had before»): the template's ready-made motion effects, chosen from the
 *  merchant's words and what the store sells. Words that name an effect always count; an animated store also takes the one its
 *  products suggest (drinks bubble, coffee and bakeries steam, beauty sparkles), none otherwise. */
const fold = (text: string) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NAMED: Array<[string, RegExp]> = [
  ['bubbles', /\bburbuj\w*/], ['petals', /\bpetalo\w*/], ['steam', /\b(?:vapor|humeante)\w*/],
  ['sparkles', /\b(?:brillos?|brillitos?|destellos?|chispas?)\b/], ['shapes', /\b(?:figuras|formas|stickers?)\b[^.!?]{0,20}\b(?:flot|mov|baila)\w*/],
];
const SOLD: Array<[string, RegExp]> = [
  ['bubbles', /\b(?:sodas?|gaseosas?|refrescos?|bebidas?|kombucha|sparkling|espumos\w*|cervez\w*|prebiotic\w*|limonadas?)\b/],
  ['steam', /\b(?:cafe|cafeteria|coffee|infusion\w*|panader\w*|pasteler\w*|reposter\w*|horno|horneado\w*|sopas?|caldos?)\b/],
  ['sparkles', /\b(?:belleza|cosmetic\w*|maquillaje|skincare|joyas?|joyeria|perfum\w*|glitter)\b/],
];
const UNSAID = /(?:\bno\b|\bsin\b|\bquita\w*|\bsaca\w*|\bnada de)\s+(?:\w+\s+){0,3}$/;

const named = (text: string) => {
  const folded = fold(text);
  for (const [effect, pattern] of NAMED) {
    const match = folded.match(pattern);
    if (match) return UNSAID.test(folded.slice(0, match.index)) ? 'none' : effect;
  }
  return undefined;
};

export function effectsFor(input: { words: string; business: string; animated: boolean }): Partial<Record<'effect' | 'confetti', string>> {
  const asked = named(input.words);
  const confetti = /\bconfeti\w*/.test(fold(input.words)) ? 'on' : input.animated ? 'on' : undefined;
  // Owner 2026-10-28 («the floating dot and flower look unprofessional»): floating shapes and petals come only when the merchant
  // names them, never on their own; a store whose products suggest no effect gets none.
  const sold = input.animated && !asked ? SOLD.find(([, pattern]) => pattern.test(fold(input.business)))?.[0] : undefined;
  const effect = asked ?? sold;
  return { ...(effect ? { effect } : {}), ...(confetti ? { confetti } : {}) };
}

/** Only ids the template's catalogue has. */
export function effectVariants(effects: Partial<Record<string, string>> | undefined, catalogue: Record<string, readonly string[]> = {}): Partial<MasterVariants> {
  return Object.fromEntries(Object.entries(effects ?? {}).filter(([part, id]) => typeof id === 'string' && (catalogue[part] ?? []).includes(id))) as Partial<MasterVariants>;
}
