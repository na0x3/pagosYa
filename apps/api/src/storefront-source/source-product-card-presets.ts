import type { SourceDesignDna } from './source-dna';

/** The named "skins" of the product page: DNA parameters plus an optional starter of guarded CSS
 * (filled in once the sanitizer exists; empty CSS is always valid). `plain` equals the pre-theme behaviour. */
export type ProductCardParams = SourceDesignDna['productCard'];
export const PRESET_IDS = ['atelier', 'workshop', 'gallery', 'catalogue', 'boutique', 'playful', 'craft', 'plain'] as const;
export type PresetId = typeof PRESET_IDS[number];
export type ProductCardPreset = { label: string; when: string; params: ProductCardParams; css: string };

export const PRODUCT_CARD_PRESETS: Record<PresetId, ProductCardPreset> = {
  atelier: { label: 'Atelier', when: 'fashion, textiles, clothing', params: { swatch: 'label', gallery: 'strip', blocks: 'plain', divider: 'hairline', enter: 'fade-up' }, css: '[data-part="title"]{letter-spacing:.08em;text-transform:uppercase}[data-part="thumb"]{border-radius:0}[data-part="swatch"]:hover{transform:translateY(-2px)}[data-part="stage"]{background-color:var(--pd-tint)}' },
  workshop: { label: 'Taller', when: 'furniture, tools, hardware, chairs', params: { swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'slide' }, css: '[data-part="gallery"]{border:2px solid var(--pd-ink)}[data-part="thumb"]{border-radius:0;border:1px solid var(--pd-ink)}[data-part="block"][data-part-type="compare"]{clip-path:polygon(0 0,100% 0,100% 94%,94% 100%,0 100%)}[data-part="title"]{text-transform:uppercase;letter-spacing:.04em}' },
  gallery: { label: 'Galería', when: 'art, photography, decor', params: { swatch: 'circle', gallery: 'mosaic', blocks: 'outline', divider: 'none', enter: 'fade-up' }, css: '[data-part="stage"]{box-shadow:0 18px 40px -22px rgba(0,0,0,.35)}[data-part="title"]{font-weight:600;letter-spacing:.02em}[data-part="block"]{padding:14px}' },
  catalogue: { label: 'Catálogo', when: 'electronics, products with many specs', params: { swatch: 'pill', gallery: 'rail', blocks: 'card', divider: 'hairline', enter: 'none' }, css: '[data-part="highlights"]{border-top:1px solid var(--pd-line);padding-top:12px}[data-part="block"]{border-radius:6px}[data-part="thumb"]{border-radius:6px}' },
  boutique: { label: 'Boutique', when: 'jewellery, cosmetics, small luxuries', params: { swatch: 'circle', gallery: 'strip', blocks: 'plain', divider: 'none', enter: 'fade-up' }, css: '[data-part="title"]{letter-spacing:.12em;text-transform:uppercase;font-weight:400}[data-part="stage"]{border-radius:999px 999px 0 0;overflow:hidden}[data-part="eyebrow"]{letter-spacing:.2em}' },
  playful: { label: 'Juguetón', when: 'kids, toys, gifts', params: { swatch: 'photo', gallery: 'mosaic', blocks: 'tape', divider: 'dashed', enter: 'pop' }, css: '[data-part="stage"]{border-radius:24px;overflow:hidden;box-shadow:6px 6px 0 var(--pd-ink)}[data-part="swatch"]:hover{transform:rotate(-4deg)}[data-part="title"]{transform:rotate(-1deg)}' },
  craft: { label: 'Artesanal', when: 'food, ceramics, handmade goods', params: { swatch: 'photo', gallery: 'rail', blocks: 'tape', divider: 'dashed', enter: 'fade-up' }, css: '[data-part="stage"]{border:1px solid var(--pd-line);padding:8px;background-color:var(--pd-tint)}[data-part="title"]{font-style:italic}[data-part="block"]{border-radius:4px}' },
  plain: { label: 'Sencillo', when: 'everything else; identical to the default product page', params: { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none' }, css: '' },
};

export function presetFor(id: PresetId): { params: ProductCardParams; css: string } {
  const preset = PRODUCT_CARD_PRESETS[id];
  if (!preset) throw new Error('unknown preset');
  return { params: { ...preset.params }, css: preset.css };
}
