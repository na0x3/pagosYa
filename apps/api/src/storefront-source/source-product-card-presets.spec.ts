import { PRESET_IDS, PRODUCT_CARD_PRESETS, presetFor, productCommerceRecipe } from './source-product-card-presets';
import { defaultDna, normalizeDna, sourceRuntimeDna, SOURCE_DNA_ENUMS, SOURCE_DNA_RUNTIME_ENUMS, SOURCE_DNA_SCHEMA } from './source-dna';
import { validDna } from './fixtures/dna';
import { sanitizeProductThemeCss } from './product-theme-css';

const DEFAULTS = { swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none' };

describe('product card presets', () => {
  it('ships the eight documented presets', () => {
    expect([...PRESET_IDS].sort()).toEqual(['atelier', 'boutique', 'catalogue', 'craft', 'gallery', 'plain', 'playful', 'workshop']);
  });

  it('every preset uses only values the DNA accepts', () => {
    for (const id of PRESET_IDS) {
      const { params } = presetFor(id);
      for (const [key, value] of Object.entries(params)) expect((SOURCE_DNA_ENUMS.productCard as Record<string, readonly string[]>)[key]).toContain(value);
      expect(Object.keys(params).sort()).toEqual(Object.keys(DEFAULTS).sort());
      expect(PRODUCT_CARD_PRESETS[id].when.length).toBeGreaterThan(10);
    }
  });

  it('every preset\'s starter CSS passes the guarded sanitizer untouched (plain has none)', () => {
    for (const id of PRESET_IDS) {
      const { css } = presetFor(id);
      const result = sanitizeProductThemeCss(css);
      expect(result.dropped).toEqual([]);
      if (id === 'plain') expect(css).toBe('');
      else { expect(css.length).toBeGreaterThan(60); expect(result.css.length).toBeGreaterThan(60); }
    }
  });

  it('the plain preset equals today\'s behaviour', () => {
    expect(presetFor('plain').params).toEqual(DEFAULTS);
  });

  it('rejects an unknown preset id', () => {
    expect(() => presetFor('hexagon' as never)).toThrow('unknown preset');
  });
});

describe('product card DNA', () => {
  it('seeds the defaults for every store, whatever its seed, so old stores never restyle', () => {
    for (const seed of ['a', 'b', 'store-1', 'store-42']) expect((defaultDna(seed) as any).productCard).toEqual(DEFAULTS);
    expect((defaultDna('a') as any).productCss).toBe('');
  });

  it('lets the planner choose any value, not just the default', () => {
    const props = (SOURCE_DNA_SCHEMA.properties as any).productCard.properties;
    expect(props.swatch.enum).toEqual([...SOURCE_DNA_ENUMS.productCard.swatch]);
    expect(props.gallery.enum).toEqual([...SOURCE_DNA_ENUMS.productCard.gallery]);
    // Three concepts share the planner's output budget, so a concept's own CSS is capped lower than the 3000 the agent may write.
    expect((SOURCE_DNA_SCHEMA.properties as any).productCss.maxLength).toBe(1200);
  });

  it('normalizes an older design without the new fields to the defaults and reports nothing', () => {
    const raw = validDna() as any;
    delete raw.productCard; delete raw.productCss;
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCard).toEqual(DEFAULTS);
    expect(dna.productCss).toBe('');
    expect(repairs).toEqual([]);
  });

  it('repairs an invalid productCard value and names the field', () => {
    const raw = validDna() as any;
    raw.productCard = { ...DEFAULTS, swatch: 'hexagon' };
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCard.swatch).toBe('pill');
    expect(repairs).toEqual([expect.stringContaining('dna.productCard.swatch')]);
  });

  it('fails closed on an oversized or non-text productCss', () => {
    const big = validDna() as any; big.productCss = 'a'.repeat(3001);
    expect((normalizeDna(big, 's') as any).dna.productCss).toBe('');
    expect(normalizeDna(big, 's').repairs).toEqual([expect.stringContaining('dna.productCss')]);
    const junk = validDna() as any; junk.productCss = { x: 1 };
    expect((normalizeDna(junk, 's') as any).dna.productCss).toBe('');
  });

  it('sanitizes the model\'s productCss, keeps the safe part and reports what it dropped', () => {
    const raw = validDna() as any;
    raw.productCss = '[data-part="gallery"]{border:1px solid #111}[data-part="price"]{color:red}';
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCss.replace(/\s+/g, '')).toBe('[data-pagosya-product][data-style][data-part="gallery"]{border:1pxsolid#111}');
    expect(repairs).toEqual([expect.stringMatching(/dna\.productCss.*price/)]);
  });

  it('refuses hostile productCss entirely and says why', () => {
    const raw = validDna() as any;
    raw.productCss = '[data-part="gallery"]{background:url(https://evil.test/x.png)}';
    const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
    expect(dna.productCss).toBe('');
    expect(repairs).toEqual([expect.stringMatching(/dna\.productCss.*url/i)]);
  });

  it('keeps an already sanitized productCss stable when a stored design is normalized again', () => {
    const raw = validDna() as any;
    raw.productCss = '@keyframes bob{from{transform:translateY(0)}to{transform:translateY(6px)}}@media (prefers-reduced-motion: no-preference){[data-part="gallery"]{animation:bob 1.2s ease infinite}}[data-part="title"]{letter-spacing:.05em}';
    const first = normalizeDna(raw, 'store-1') as any;
    expect(first.repairs).toEqual([]);
    const second = normalizeDna(first.dna, 'store-1') as any;
    expect(second.repairs).toEqual([]);
    expect(second.dna.productCss).toBe(first.dna.productCss);
    expect(first.dna.productCss).toContain('pt-bob');
  });

  it('puts the five runtime names in config.dna and productCss only when present', () => {
    for (const name of ['swatch', 'gallery', 'blocks', 'divider', 'enter']) expect(SOURCE_DNA_RUNTIME_ENUMS[name]).toBeDefined();
    const plain = sourceRuntimeDna(validDna(), 's') as any;
    expect(plain).toMatchObject(DEFAULTS);
    expect(plain.productCss).toBeUndefined();
    const themed = sourceRuntimeDna({ ...validDna(), productCard: { ...DEFAULTS, swatch: 'square' }, productCss: 'x{}' } as any, 's') as any;
    expect(themed.swatch).toBe('square');
    expect(themed.productCss).toBe('x{}');
  });
});

describe('product-led commerce recipes', () => {
  it('maps concrete product needs through the existing runtime controls without inventing content', () => {
    const apparel = productCommerceRecipe('atelier');
    const technical = productCommerceRecipe('catalogue');
    const craft = productCommerceRecipe('craft');
    expect(apparel.surfaces).toMatchObject({ product: 'image-led', cart: 'drawer', review: 'split', card: 'swatch-swap' });
    expect(technical.surfaces).toMatchObject({ product: 'dense', cart: 'page', review: 'split', card: 'quick-look' });
    expect(craft.surfaces.product).toBe('story-led');
    for (const id of PRESET_IDS) {
      const recipe = productCommerceRecipe(id);
      const dna = { ...validDna(), surfaces: { ...validDna().surfaces, ...recipe.surfaces }, productCard: recipe.productCard };
      expect(normalizeDna(dna, 'same-store').repairs).toEqual([]);
      const runtime = sourceRuntimeDna(dna, 'same-store');
      expect(runtime).toMatchObject(recipe.surfaces);
      expect(runtime).toMatchObject(recipe.productCard);
    }
    apparel.productCard.swatch = 'circle';
    expect(productCommerceRecipe('atelier').productCard.swatch).toBe('label');
  });
});
