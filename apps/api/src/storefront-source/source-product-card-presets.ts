import type { SourceDesignDna } from './source-dna';

/** The named "skins" of the product page: DNA parameters plus an optional starter of guarded CSS
 * (filled in once the sanitizer exists; empty CSS is always valid). `plain` equals the pre-theme behaviour. */
export type ProductCardParams = SourceDesignDna['productCard'];
export const PRESET_IDS = ['atelier', 'workshop', 'gallery', 'catalogue', 'boutique', 'playful', 'craft', 'plain'] as const;
export type PresetId = typeof PRESET_IDS[number];
export type ProductCardPreset = { label: string; when: string; params: ProductCardParams; css: string };

export const PRODUCT_CARD_PRESETS: Record<PresetId, ProductCardPreset> = {
  atelier: { label: 'Atelier', when: 'fashion, textiles, clothing', params: { swatch: 'label', gallery: 'strip', blocks: 'plain', divider: 'hairline', enter: 'fade-up' }, css: '' },
  workshop: { label: 'Taller', when: 'furniture, tools, hardware, chairs', params: { swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'slide' }, css: '' },
  gallery: { label: 'Galería', when: 'art, photography, decor', params: { swatch: 'circle', gallery: 'mosaic', blocks: 'outline', divider: 'none', enter: 'fade-up' }, css: '' },
  catalogue: { label: 'Catálogo', when: 'electronics, products with many specs', params: { swatch: 'pill', gallery: 'rail', blocks: 'card', divider: 'hairline', enter: 'none' }, css: '' },
  boutique: { label: 'Boutique', when: 'jewellery, cosmetics, small luxuries', params: { swatch: 'circle', gallery: 'strip', blocks: 'plain', divider: 'none', enter: 'fade-up' }, css: '' },
  playful: { label: 'Juguetón', when: 'kids, toys, gifts', params: { swatch: 'photo', gallery: 'mosaic', blocks: 'tape', divider: 'dashed', enter: 'pop' }, css: '' },
  craft: { label: 'Artesanal', when: 'food, ceramics, handmade goods', params: { swatch: 'photo', gallery: 'rail', blocks: 'tape', divider: 'dashed', enter: 'fade-up' }, css: '' },
  plain: { label: 'Sencillo', when: 'everything else; identical to the default product page', params: { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none' }, css: '' },
};

export function presetFor(id: PresetId): { params: ProductCardParams; css: string } {
  const preset = PRODUCT_CARD_PRESETS[id];
  if (!preset) throw new Error('unknown preset');
  return { params: { ...preset.params }, css: preset.css };
}
