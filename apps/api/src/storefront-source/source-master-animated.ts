import type { MasterVariants } from './source-master';

/** Owner 2026-10-27 («la tienda de PEPPA please me gustaba más porque era un estilo animado»): a store the merchant asks to be
 *  animated, fun or bold gets the template's lively look in the build itself — no agent redesign, no extra call. */
const ANIMATED = /\b(?:animad[ao]s?|animacion(?:es)?|con (?:mucho )?movimiento|que se mueva|en movimiento|dinamic[ao]s?|divertid[ao]s?|jugueton(?:a)?|atrevid[ao]s?|animated|playful)\b/g;

/** Owner 2026-10-27 («sometimes stores will not want to have animated look, so lets do by asking instead»): a first build turns
 *  animated only on the word itself — «animada», «estilo animado». «Alegre y con movimiento», «dinámica» or «divertida» get the calm
 *  look, and the reply offers the animated one. */
const ANIMATED_WORD = /\b(?:animad[ao]s?|animacion(?:es)?|animated)\b/g;

const asks = (text: string, words: RegExp) => {
  const folded = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return Array.from(folded.matchAll(words)).some(match => !/(?:\bno|\bsin|\bnada|\bpoco|without)\b[^.!?]{0,16}$/.test(folded.slice(0, match.index)));
};

/** The merchant's words ask for an animated store («nada animada» and «sin movimiento» do not). For edits to a store that exists. */
export function asksForAnimatedStore(text: string): boolean {
  return asks(text, ANIMATED);
}

/** A first build's words name the animated look itself; anything softer is answered with the offer, not the look. */
export function namesAnimatedLook(text: string): boolean {
  return asks(text, ANIMATED_WORD);
}

/** Owner 2026-10-27 («for bakeries, candy and stores like those, I want warm decoration, chunky, really animated»): a sweets or
 *  bakery business is animated by default; the merchant's own calm words («sobria», «minimalista», «elegante») still win. */
const TREATS = /\b(?:panader[ia]as?|pasteler[ia]as?|reposter[ia]as?|bakery|bakehouse|dulces?|dulceria|golosinas?|caramelos?|candy|chocolates?|chocolateria|galletas?|cookies?|cupcakes?|donas?|donuts?|tortas?|pasteles?|postres?|helados?|heladeria|brownies?|alfajores?|churros?|macarons?|confiteria|gomitas?)\b/;
const CALM_WORDS = /\b(?:sobri[ao]|minimalista|minimal|seri[ao]|elegante|lujo|calmad[ao]|tranquil[ao]|nada animad[ao]|sin animaciones)\b/;
const foldText = (text: string) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function isTreatBusiness(text: string): boolean { return TREATS.test(foldText(text)); }
export function asksForCalmStore(text: string): boolean { return CALM_WORDS.test(foldText(text)); }

/** The reply's offer when a new store came out calm. */
export const ANIMATED_OFFER = 'Si la quieres animada —colores en bloques, letras redondas y botones que rebotan—, dime «hazla animada».';

/** The kit's motion personality for an animated store: playful easing, cards that lift, buttons that pop. */
export const ANIMATED_DNA = { motion: 'playful', hover: 'lift', press: 'pop' } as const;

/** Esencial's lively parts: a moving announcement bar, colour bands, cards that show their second photo on hover and, with two
 *  photos or more, a hero whose photos pass into one another. Only ids the template's catalogue has. */
export function animatedVariants(photoCount: number, catalogue: Record<string, readonly string[]> = {}): Partial<MasterVariants> {
  const wanted: Record<string, string> = { outline: 'chunky', announce: 'ticker', bands: 'blocks', card: 'hover2', ...(photoCount >= 2 ? { heroFade: 'fade' } : {}) };
  return Object.fromEntries(Object.entries(wanted).filter(([part, id]) => (catalogue[part] ?? []).includes(id))) as Partial<MasterVariants>;
}

/** Owner 2026-10-27 («Dulce Horno and BAEK are exactly the same»): an animated store on a skeleton takes one of the playful pairs,
 *  picked by the store, not always the same rounded one. */
export const ANIMATED_FONT_POOL = ['alegre', 'poster', 'soft', 'condensed'] as const;
export function animatedFontFor(seed: string, available: readonly string[]): string | undefined {
  const pool = ANIMATED_FONT_POOL.filter(id => available.includes(id));
  if (!pool.length) return undefined;
  let hash = 0; for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length];
}

/** The rounded heavy pairing of an animated store (Fredoka over DM Sans), when the template has it. */
export const ANIMATED_FONTS = 'alegre';
