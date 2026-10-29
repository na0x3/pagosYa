/** Owner 2026-10-27 («things that have to do with each store… a medidas thing for an atelier, the cookie box filler»): the one
 *  working module a store gets for its business — measurements for a dressmaker, a table booking for a restaurant, a side-by-side
 *  comparison for electronics, a frame picker for art prints, a bouquet builder for a florist. Words first (what the store sells),
 *  so a store gets a module only when it plainly fits; none otherwise. Every module ends in a WhatsApp message to the store. */

export const STORE_MODULES = ['none', 'measure', 'reserve', 'compare', 'frame', 'bouquet'] as const;
export type StoreModule = typeof STORE_MODULES[number];

const fold = (text: string) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Strongest signal first (live check 2026-10-27: «flores esculpidas» on a couture house and a print called «Flores en azul» both
// read as a florist): couture and prints win over flowers, and a florist is named by its bouquets, not by the word «flores».
const RULES: Array<[StoreModule, RegExp]> = [
  ['measure', /\b(?:alta costura|a medida|hecho a medida|vestidos? de novia|novias?|trajes? a medida|modista|confeccion a medida)\b/],
  ['frame', /\b(?:laminas?|cuadros?|enmarcad[ao]s?|obras? de arte|arte para colgar|posters?|prints?)\b/],
  ['bouquet', /\b(?:ramos?|florer[ia]a|floristeria|arreglos florales)\b/],
  ['compare', /\b(?:licuadoras?|electrodomesticos?|celulares?|smartphones?|laptops?|computadoras?|notebooks?|audifonos|parlantes?|televisores?|smart tv|camaras?|tablets?|consolas?|electronica)\b/],
  ['reserve', /\b(?:restaurante|restaurant|cafeteria|bistro|parrilla|pizzeria|cevicheria|bar|almuerzos?|cenas?|brunch)\b/],
];

/** The module the business's own words point to, or none. `business` is what the store is (its name, what it does, its story) —
 *  never its product names: one «Póster Oh Belly» made a soda brand a print shop (live check 2026-10-27). */
export function moduleFor(input: { words: string; business: string }): StoreModule {
  const text = fold(`${input.words}\n${input.business}`);
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'none';
}









