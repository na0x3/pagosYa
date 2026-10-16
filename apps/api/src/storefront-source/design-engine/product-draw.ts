/**
 * The product page style, the catalog card and the product page preset, drawn per store (sub-project 2, 2026-10-15).
 * The planner used to map one business type to one style ("conversion for food & drink…"), so 14 of 26 dev stores had the
 * conversion page and 19 the still card. Now each kind has 2–4 fitting styles and presets, history spreads them, and the
 * catalog card is drawn only from what the products can support. Presentation only: price, stock and the buy button stay
 * the runtime's.
 */
import { SOURCE_PRODUCT_PAGE_STYLES, type SourceProductPageStyle } from '../source-dna';
import { PRESET_IDS, PRODUCT_CARD_PRESETS, type PresetId, type ProductCardParams } from '../source-product-card-presets';
import type { PlaybookKind } from './playbook';

export const CATALOG_CARDS = ['still', 'second-photo', 'swatch-swap', 'zoom', 'quick-look', 'tilt'] as const;
export type CatalogCard = typeof CATALOG_CARDS[number];
export type ProductDraw = { productPage: SourceProductPageStyle; card: CatalogCard; preset: PresetId };
/** What the products can support: swatch-swap needs real variants, second-photo a second photo on every product. */
export type ProductFacts = { variants?: boolean; altPhotos?: boolean };

/** Fitting product page styles per kind of business, the owner's choice: variety inside what suits the business. */
export const PRODUCT_PAGE_FIT: Record<PlaybookKind, readonly SourceProductPageStyle[]> = {
  'cafe-food': ['conversion', 'story-led', 'editorial', 'image-led'],
  'bakery-sweets': ['story-led', 'conversion', 'image-led', 'editorial'],
  clothing: ['image-led', 'editorial', 'story-led'],
  beauty: ['conversion', 'editorial', 'image-led', 'story-led'],
  services: ['editorial', 'dense', 'story-led'],
  'fitness-wellness': ['conversion', 'editorial', 'dense', 'story-led'],
  'crafts-home': ['story-led', 'image-led', 'dense', 'editorial'],
  'flowers-gifts': ['image-led', 'story-led', 'editorial', 'conversion'],
  general: SOURCE_PRODUCT_PAGE_STYLES,
};
/** Fitting product page presets (swatch, gallery, blocks, divider, entrance, media side) per kind. */
export const PRESET_FIT: Record<PlaybookKind, readonly PresetId[]> = {
  'cafe-food': ['craft', 'plain', 'playful', 'boutique'],
  'bakery-sweets': ['craft', 'playful', 'boutique', 'plain'],
  clothing: ['atelier', 'boutique', 'gallery'],
  beauty: ['boutique', 'atelier', 'plain', 'gallery'],
  services: ['plain', 'catalogue', 'workshop'],
  'fitness-wellness': ['catalogue', 'plain', 'playful', 'boutique'],
  'crafts-home': ['craft', 'workshop', 'gallery', 'atelier'],
  'flowers-gifts': ['boutique', 'gallery', 'playful', 'craft'],
  general: PRESET_IDS,
};
const fitKind = (kind: string | undefined): PlaybookKind => (kind && kind in PRODUCT_PAGE_FIT ? kind : 'general') as PlaybookKind;

export function cardOptions(facts: ProductFacts): CatalogCard[] {
  return CATALOG_CARDS.filter(card => (card !== 'swatch-swap' || facts.variants) && (card !== 'second-photo' || facts.altPhotos));
}

/** Least used among the fitting options in `recent` (same-kind history), then uniform: as the frame and commerce draws. */
export function drawProduct(random: () => number, recent: Array<Partial<ProductDraw>>, kind: string | undefined, facts: ProductFacts): ProductDraw {
  const pickLeast = <T extends string>(options: readonly T[], part: keyof ProductDraw): T => {
    const counts = options.map(id => recent.filter(item => item[part] === id).length);
    const pool = options.filter((_, i) => counts[i] === Math.min(...counts));
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  };
  const fit = fitKind(kind);
  return { productPage: pickLeast(PRODUCT_PAGE_FIT[fit], 'productPage'), card: pickLeast(cardOptions(facts), 'card'), preset: pickLeast(PRESET_FIT[fit], 'preset') };
}

export function parseProductDraw(value: unknown): Partial<ProductDraw> {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  return {
    ...(SOURCE_PRODUCT_PAGE_STYLES.includes(v.productPage as SourceProductPageStyle) ? { productPage: v.productPage as SourceProductPageStyle } : {}),
    ...(CATALOG_CARDS.includes(v.card as CatalogCard) ? { card: v.card as CatalogCard } : {}),
    ...(PRESET_IDS.includes(v.preset as PresetId) ? { preset: v.preset as PresetId } : {}),
  };
}

/** The merchant's own words decide: naming the product page or the catalog cards leaves that part to the planner. */
export function productOverrides(text: string): { productPage: boolean; card: boolean } {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return {
    productPage: /pagina de(l)? producto|ficha de(l)? producto|product page/.test(t),
    card: /tarjetas? de(l)? (producto|catalogo)|product cards?|catalog cards?/.test(t),
  };
}

/** The runtime DNA keys a fresh draw sets in config.js (sourceRuntimeDna names: product, card and the preset's params). */
export function productRuntimeDna(draw: Partial<ProductDraw>): Record<string, string> {
  const params: Partial<ProductCardParams> = draw.preset ? PRODUCT_CARD_PRESETS[draw.preset].params : {};
  return { ...(draw.productPage ? { product: draw.productPage } : {}), ...(draw.card ? { card: draw.card } : {}), ...params };
}

/** What the planner and the builder are told, so the copy fits the page the store gets. */
export function productDirection(draw: Partial<ProductDraw>): string {
  const parts = [
    draw.productPage ? `product page style «${draw.productPage}» (layout.productPage and dna.surfaces.product)` : '',
    draw.card ? `catalog card «${draw.card}» (dna.surfaces.card)` : '',
    draw.preset ? `product page preset «${draw.preset}» (copy its values into dna.productCard)` : '',
  ].filter(Boolean);
  return parts.length ? `- Product surfaces drawn for this store, use exactly: ${parts.join('; ')}.` : '';
}
