import type { SourceDesignDna } from './source-dna';
import { COSMETIC_PARTS } from './product-theme-css';

/** The named "skins" of the product page: DNA parameters plus an optional starter of guarded CSS
 * (filled in once the sanitizer exists; empty CSS is always valid). `plain` equals the pre-theme behaviour. */
export type ProductCardParams = SourceDesignDna['productCard'];
export const PRESET_IDS = ['atelier', 'workshop', 'gallery', 'catalogue', 'boutique', 'playful', 'craft', 'plain'] as const;
export type PresetId = typeof PRESET_IDS[number];
export type ProductCardPreset = { label: string; when: string; params: ProductCardParams; css: string };

export const PRODUCT_CARD_PRESETS: Record<PresetId, ProductCardPreset> = {
  atelier: { label: 'Atelier', when: 'fashion, textiles, clothing', params: { swatch: 'label', gallery: 'strip', blocks: 'plain', divider: 'hairline', enter: 'fade-up', media: 'right' }, css: '[data-part="title"]{letter-spacing:.08em;text-transform:uppercase}[data-part="thumb"]{border-radius:0}[data-part="swatch"]:hover{transform:translateY(-2px)}[data-part="stage"]{background-color:var(--pd-tint)}' },
  workshop: { label: 'Taller', when: 'furniture, tools, hardware, chairs', params: { swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'slide', media: 'left' }, css: '[data-part="gallery"]{border:2px solid var(--pd-ink)}[data-part="thumb"]{border-radius:0;border:1px solid var(--pd-ink)}[data-part="block"][data-part-type="compare"]{clip-path:polygon(0 0,100% 0,100% 94%,94% 100%,0 100%)}[data-part="title"]{text-transform:uppercase;letter-spacing:.04em}' },
  gallery: { label: 'Galería', when: 'art, photography, decor', params: { swatch: 'circle', gallery: 'mosaic', blocks: 'outline', divider: 'none', enter: 'fade-up', media: 'left' }, css: '[data-part="stage"]{box-shadow:0 18px 40px -22px rgba(0,0,0,.35)}[data-part="title"]{font-weight:600;letter-spacing:.02em}[data-part="block"]{padding:14px}' },
  catalogue: { label: 'Catálogo', when: 'electronics, products with many specs', params: { swatch: 'pill', gallery: 'rail', blocks: 'card', divider: 'hairline', enter: 'none', media: 'left' }, css: '[data-part="highlights"]{border-top:1px solid var(--pd-line);padding-top:12px}[data-part="block"]{border-radius:6px}[data-part="thumb"]{border-radius:6px}' },
  boutique: { label: 'Boutique', when: 'jewellery, cosmetics, small luxuries', params: { swatch: 'circle', gallery: 'strip', blocks: 'plain', divider: 'none', enter: 'fade-up', media: 'right' }, css: '[data-part="title"]{letter-spacing:.12em;text-transform:uppercase;font-weight:400}[data-part="stage"]{border-radius:999px 999px 0 0;overflow:hidden}[data-part="eyebrow"]{letter-spacing:.2em}' },
  playful: { label: 'Juguetón', when: 'kids, toys, gifts', params: { swatch: 'photo', gallery: 'mosaic', blocks: 'tape', divider: 'dashed', enter: 'pop', media: 'right' }, css: '[data-part="stage"]{border-radius:24px;overflow:hidden;box-shadow:6px 6px 0 var(--pd-ink)}[data-part="swatch"]:hover{transform:rotate(-4deg)}[data-part="title"]{transform:rotate(-1deg)}' },
  craft: { label: 'Artesanal', when: 'food, ceramics, handmade goods', params: { swatch: 'photo', gallery: 'rail', blocks: 'tape', divider: 'dashed', enter: 'fade-up', media: 'left' }, css: '[data-part="stage"]{border:1px solid var(--pd-line);padding:8px;background-color:var(--pd-tint)}[data-part="title"]{font-style:italic}[data-part="block"]{border-radius:4px}' },
  plain: { label: 'Sencillo', when: 'everything else; identical to the default product page', params: { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none', media: 'left' }, css: '' },
};

type CommerceRecipe = { surfaces: Pick<SourceDesignDna['surfaces'], 'product' | 'cart' | 'review' | 'card'>; motion: { personality: SourceDesignDna['motion']['personality']; hover: SourceDesignDna['buttons']['hover']; press: SourceDesignDna['buttons']['press'] }; decision: string };
/** Coherent starting points for real buying tasks, never per-card randomization. */
export const PRODUCT_COMMERCE_RECIPES: Record<PresetId, CommerceRecipe> = {
  atelier: { motion: { personality: 'cinematic', hover: 'shine', press: 'none' }, surfaces: { product: 'image-led', cart: 'drawer', review: 'split', card: 'swatch-swap' }, decision: 'Actual fit, sizes and colors; compare variants before adding.' },
  workshop: { motion: { personality: 'snappy', hover: 'invert', press: 'sink' }, surfaces: { product: 'dense', cart: 'page', review: 'split', card: 'quick-look' }, decision: 'Actual dimensions, materials and compatibility before purchase.' },
  gallery: { motion: { personality: 'calm', hover: 'lift', press: 'none' }, surfaces: { product: 'image-led', cart: 'drawer', review: 'stacked', card: 'second-photo' }, decision: 'Actual scale, medium and available views of each piece.' },
  catalogue: { motion: { personality: 'snappy', hover: 'underline-grow', press: 'squash' }, surfaces: { product: 'dense', cart: 'page', review: 'split', card: 'quick-look' }, decision: 'Real specifications, compatibility and comparing a larger basket.' },
  boutique: { motion: { personality: 'calm', hover: 'shine', press: 'none' }, surfaces: { product: 'editorial', cart: 'drawer', review: 'stacked', card: 'second-photo' }, decision: 'Actual finish, size and supplied care or ingredient information.' },
  playful: { motion: { personality: 'playful', hover: 'tilt', press: 'pop' }, surfaces: { product: 'editorial', cart: 'sheet', review: 'ticket', card: 'quick-look' }, decision: 'Actual options and gift details with a clear order summary.' },
  craft: { motion: { personality: 'calm', hover: 'lift', press: 'squash' }, surfaces: { product: 'story-led', cart: 'drawer', review: 'notebook', card: 'still' }, decision: 'Evidenced material and making story; for quick food orders prefer editorial, sheet, ticket.' },
  plain: { motion: { personality: 'calm', hover: 'lift', press: 'squash' }, surfaces: { product: 'editorial', cart: 'drawer', review: 'stacked', card: 'still' }, decision: 'Direct name, price, available options and purchase action.' },
};
export function productCommerceRecipe(id: PresetId) {
  const recipe = PRODUCT_COMMERCE_RECIPES[id];
  if (!recipe) throw new Error('unknown preset');
  return { ...recipe, surfaces: { ...recipe.surfaces }, productCard: { ...PRODUCT_CARD_PRESETS[id].params } };
}
export function productCommerceDirection(): string {
  const recipes = PRESET_IDS.map(id => {
    const { surfaces, productCard, decision } = productCommerceRecipe(id);
    return `${id}: ${Object.values(surfaces).join('/')} ; ${Object.values(productCard).join('/')} — ${decision}`;
  }).join('\n');
  return `COMMERCE RECIPES: fields before semicolon are dna.surfaces product/cart/review/card; after it dna.productCard swatch/gallery/blocks/divider/enter/media. Set layout.productPage equal to surfaces.product. These are starting points selected by the store's products and buying task, not compulsory sector templates.\n${recipes}\nUse one coherent card family per store. swatch-swap requires real variants; second-photo requires actual alternate images; otherwise use still or quick-look. Keep image roles and factual decision information consistent between catalog cards, product detail and order summary. Cart and checkout inherit shared brand tokens and shell, while keeping visible totals, accessible inputs and familiar payment steps. Never invent specifications, reviews, guarantees or urgency, or promise conversion gains. Preserve approved choices on local edits.`;
}

/** What the design model is told about the product page's identity, generated from the presets and the part list so it
 * cannot drift from them (spec: docs/superpowers/plans/2026-09-29-yapi-product-card-theming.md, Design §3). */
export function productCardDirection(): string {
  const presets = PRESET_IDS.map(id => `${id} (${PRODUCT_CARD_PRESETS[id].when})`).join('; ');
  return `PRODUCT CARD: each concept's dna also carries productCard (swatch, gallery, blocks, divider, enter, media: the identity of the product page; media sets the gallery's desktop side) and productCss. Set surfaces.product and layout.productPage together: image-led for fashion/art, dense for specification-led furniture/electronics, story-led for craft, editorial for quick food ordering. These change structure; swatches and borders alone do not create a distinct page. Pick the preset that fits what this business sells, copy its values into productCard and change at most three of them: ${presets}. `
    + `productCss is guarded CSS for the page's cosmetic parts only, at most 20 rules and 3000 characters (inside a concept keep it under 1200), written as [data-part="gallery"]{...}. Parts: ${COSMETIC_PARTS.join(', ')}; a block may be narrowed with [data-part-type="media"] or [data-part-type="compare"], and :hover, :focus-visible and ::before/::after are allowed. `
    + `Use var(--pd-ink), var(--pd-line), var(--pd-tint) and var(--brand-…) so the theme follows the store's colours; no urls, calc(), !important or fixed positioning; opacity never below 0.6; never hide, shrink or cover anything. `
    + `Price, stock, option state, quantity, the buy button and the pagosYa seal are protected: they cannot be selected and a real browser checks them, and a theme that breaks them loses its CSS. Content blocks (photo with text, before/after) are supplied by the merchant: frame them, never invent their content. Leave productCss empty when the preset is enough. Product structure should serve the actual buying decision; related stores may share familiar purchase controls.`;
}

export function presetFor(id: PresetId): { params: ProductCardParams; css: string } {
  const preset = PRODUCT_CARD_PRESETS[id];
  if (!preset) throw new Error('unknown preset');
  return { params: { ...preset.params }, css: preset.css };
}
