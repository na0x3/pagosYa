import type { MasterVariants } from './source-master';

/** Owner 2026-10-27 («i feel like they are still the same way too much»): template families — one template, different
 *  skeletons (packages/store-templates/templates/esencial/components/families.tsx). The family comes from the merchant's words
 *  and the business, with a store-seeded pick among the families that fit; the dice stay free inside what the family allows. */
export const FAMILIES = ['esencial', 'pop', 'revista', 'heroe', 'boutique', 'menu'] as const;
export type Family = typeof FAMILIES[number];

const fold = (text: string) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const NAMED: Array<[Family, RegExp]> = [
  // «Un menú desplegable» is the header's menu, not a price list (Oh Belly 2026-10-27).
  ['revista', /\b(?:revista|editorial|vogue|magazine)\b/], ['menu', /\b(?:carta de precios|como (?:un|una) (?:menu|carta)|estilo (?:menu|carta))\b/], ['pop', /\b(?:pop|chunky|stickers?|comic)\b/],
];
const FOOD = /\b(?:cafe|cafeteria|coffee|panader\w*|pasteler\w*|reposter\w*|cookies?|galletas?|postres?|helad\w*|restaurante?|comida|brunch|desayunos?|tortas?|pizza\w*)\b/;
const RANGE = /\b(?:sodas?|bebidas?|kombucha|salsas?|aceites?|mermeladas?|cervez\w*|jugos?|cosmetic\w*|skincare|serums?|velas?|snacks?)\b/;

const hash = (seed: string) => Array.from(seed).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

export function familyFor(input: { words: string; business: string; animated: boolean; fashion: boolean; productCount: number; seed: string }): Family {
  const words = fold(input.words);
  const named = NAMED.find(([, pattern]) => pattern.test(words));
  if (named) return named[0];
  const business = fold(`${input.words}\n${input.business}`);
  const fits: Family[] = input.fashion ? ['boutique', 'revista']
    : FOOD.test(business) ? (input.animated ? ['pop', 'menu'] : ['menu', 'esencial'])
    : RANGE.test(business) && input.productCount <= 8 ? (input.animated ? ['heroe', 'pop'] : ['heroe', 'esencial'])
    : input.animated ? ['pop', 'heroe'] : ['esencial', 'revista'];
  return fits[hash(input.seed) % fits.length];
}

/** What each family fixes, and which ids of a part it allows (the roll keeps its pick when it is allowed). */
const RULES: Record<Family, { fixed?: Record<string, string>; allowed?: Record<string, readonly string[]>; fonts?: readonly string[]; light?: boolean }> = {
  esencial: {},
  // Owner 2026-10-27 (PEPPA please · pop, «i dont really like it»): the colour lives on the hero box, the cards and the steps — a calm
  // page, never full-width colour bands (the original PEPPA's cream page).
  pop: { fixed: { outline: 'chunky', bands: 'calm', button: 'pill', corners: 'round' }, allowed: { grid: ['grid3', 'grid4'], closing: ['accent', 'newsletter'] }, fonts: ['alegre'] },
  revista: { fixed: { outline: 'none', bands: 'calm', button: 'underline', header: 'centered' }, allowed: { grid: ['feature', 'grid3', 'masonry'], story: ['split', 'quote', 'note'], closing: ['photo', 'dark', 'accent'] },
    fonts: ['editorial', 'luxury', 'gallery', 'classic', 'literary'], light: true },
  heroe: { allowed: { hero: ['split-left', 'split-right', 'arch', 'framed', 'full'], bands: ['blocks', 'alternate'] } },
  boutique: { fixed: { bands: 'calm' }, allowed: { hero: ['split-left', 'split-right', 'stack', 'framed'], grid: ['grid3', 'masonry', 'side-title'], story: ['quote', 'overlay', 'split'], header: ['centered', 'minimal', 'classic'],
    // BOXY · boutique 2026-10-27: split cards in three columns came out as thumbnails.
    cards: ['compact', 'fashion'] } },
  menu: { fixed: { grid: 'list' }, allowed: { hero: ['split-left', 'split-right', 'type', 'arch'], bands: ['alternate', 'blocks'] } },
};

/** The family's parts over the roll: fixed ids, and an allowed id (store-seeded) where the roll picked one the family does not allow. */
export function familyVariants(family: Family, rolled: Partial<Record<string, unknown>>, seed: string, catalogue: Record<string, readonly string[]> = {}): Partial<MasterVariants> {
  const rule = RULES[family] ?? {};
  const parts: Record<string, string> = { family };
  for (const [part, id] of Object.entries(rule.fixed ?? {})) parts[part] = id;
  for (const [part, ids] of Object.entries(rule.allowed ?? {})) {
    const pickable = ids.filter(id => (catalogue[part] ?? []).includes(id));
    if (pickable.length && !pickable.includes(String(rolled[part]))) parts[part] = pickable[hash(`${seed}:${part}`) % pickable.length];
  }
  return Object.fromEntries(Object.entries(parts).filter(([part, id]) => (catalogue[part] ?? []).includes(id))) as Partial<MasterVariants>;
}

const luminance = (hex: string) => {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return 1;
  const [r, g, b] = [0, 2, 4].map(at => parseInt(value.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The family's fonts and, for a magazine, a light page: the rolled look stays when it fits. */
export function familyLook(family: Family, look: { palette?: string; fonts?: string }, seed: string, settings: { palettes: ReadonlyArray<{ id: string; paper?: string }>; fonts: ReadonlyArray<{ id: string }> }): { palette?: string; fonts?: string } {
  const rule = RULES[family] ?? {};
  const fonts = (rule.fonts ?? []).filter(id => settings.fonts.some(font => font.id === id));
  const light = rule.light ? settings.palettes.filter(palette => luminance(palette.paper ?? '') > 0.75).map(palette => palette.id) : [];
  return {
    ...(fonts.length && !fonts.includes(look.fonts ?? '') ? { fonts: fonts[hash(`${seed}:fonts`) % fonts.length] } : {}),
    ...(light.length && !light.includes(look.palette ?? '') ? { palette: light[hash(`${seed}:palette`) % light.length] } : {}),
  };
}
