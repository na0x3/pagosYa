import type { MasterVariants } from './source-master';

/** Owner 2026-10-27 («la tienda de PEPPA please me gustaba más porque era un estilo animado»): a store the merchant asks to be
 *  animated, fun or bold gets the template's lively look in the build itself — no agent redesign, no extra call. */
const ANIMATED = /\b(?:animad[ao]s?|animacion(?:es)?|con (?:mucho )?movimiento|que se mueva|en movimiento|dinamic[ao]s?|divertid[ao]s?|jugueton(?:a)?|atrevid[ao]s?|animated|playful)\b/g;

/** The merchant's words ask for an animated store («nada animada» and «sin movimiento» do not). */
export function asksForAnimatedStore(text: string): boolean {
  const folded = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return Array.from(folded.matchAll(ANIMATED)).some(match => !/(?:\bno|\bsin|\bnada|\bpoco|without)\b[^.!?]{0,16}$/.test(folded.slice(0, match.index)));
}

/** The kit's motion personality for an animated store: playful easing, cards that lift, buttons that pop. */
export const ANIMATED_DNA = { motion: 'playful', hover: 'lift', press: 'pop' } as const;

/** Esencial's lively parts: a moving announcement bar, colour bands, cards that show their second photo on hover and, with two
 *  photos or more, a hero whose photos pass into one another. Only ids the template's catalogue has. */
export function animatedVariants(photoCount: number, catalogue: Record<string, readonly string[]> = {}): Partial<MasterVariants> {
  const wanted: Record<string, string> = { announce: 'ticker', bands: 'blocks', card: 'hover2', ...(photoCount >= 2 ? { heroFade: 'fade' } : {}) };
  return Object.fromEntries(Object.entries(wanted).filter(([part, id]) => (catalogue[part] ?? []).includes(id))) as Partial<MasterVariants>;
}
