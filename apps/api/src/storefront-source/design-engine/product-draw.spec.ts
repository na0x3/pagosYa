import { PRODUCT_CARD_PRESETS } from '../source-product-card-presets';
import { CATALOG_CARDS, PRESET_FIT, PRODUCT_PAGE_FIT, cardOptions, drawProduct, parseProductDraw, productDirection, productOverrides, productRuntimeDna } from './product-draw';

const seeded = (start: number) => { let seed = (start * 7919 + 104729) % 2147483647; return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; };

describe('product surfaces draw (sub-project 2, 2026-10-15)', () => {
  it('spreads a kind across its fitting styles and presets instead of one per business type', () => {
    const recent: Array<ReturnType<typeof drawProduct>> = [];
    for (let i = 0; i < 8; i++) recent.unshift(drawProduct(seeded(i + 1), recent, 'cafe-food', {}));
    expect(new Set(recent.map(d => d.productPage)).size).toBe(PRODUCT_PAGE_FIT['cafe-food'].length);
    expect(new Set(recent.map(d => d.preset)).size).toBe(PRESET_FIT['cafe-food'].length);
    for (const d of recent) {
      expect(PRODUCT_PAGE_FIT['cafe-food']).toContain(d.productPage);
      expect(PRESET_FIT['cafe-food']).toContain(d.preset);
    }
  });

  it('never draws a style outside the kind, and an unknown kind may draw any', () => {
    for (let seed = 1; seed <= 30; seed++) expect(PRODUCT_PAGE_FIT.clothing).toContain(drawProduct(seeded(seed), [], 'clothing', {}).productPage);
    const any = new Set(Array.from({ length: 60 }, (_, seed) => drawProduct(seeded(seed + 1), [], 'unknown-kind', {}).productPage));
    expect(any.size).toBe(5);
  });

  it('draws only catalog cards the products can support', () => {
    expect(cardOptions({})).toEqual(['still', 'zoom', 'quick-look', 'tilt']);
    expect(cardOptions({ variants: true, altPhotos: true })).toEqual([...CATALOG_CARDS]);
    for (let seed = 1; seed <= 30; seed++) expect(['swatch-swap', 'second-photo']).not.toContain(drawProduct(seeded(seed), [], 'clothing', {}).card);
    // The least-used card wins: after still, zoom and quick-look, tilt comes next.
    expect(drawProduct(seeded(3), [{ card: 'still' }, { card: 'zoom' }, { card: 'quick-look' }], 'general', {}).card).toBe('tilt');
  });

  it('leaves the product page or the cards to the planner when the merchant names them', () => {
    expect(productOverrides('Quiero la página de producto tipo historia')).toEqual({ productPage: true, card: false });
    expect(productOverrides('cambia las tarjetas de producto')).toEqual({ productPage: false, card: true });
    expect(productOverrides('Crea mi florería')).toEqual({ productPage: false, card: false });
  });

  it('becomes runtime DNA with the preset params, reads back from a saved draw and tells the planner', () => {
    expect(productRuntimeDna({ productPage: 'story-led', card: 'zoom', preset: 'craft' })).toEqual({ product: 'story-led', card: 'zoom', ...PRODUCT_CARD_PRESETS.craft.params });
    expect(parseProductDraw({ productPage: 'story-led', card: 'nope', preset: 'craft', header: 'x' })).toEqual({ productPage: 'story-led', preset: 'craft' });
    expect(productDirection({ productPage: 'image-led', card: 'tilt', preset: 'boutique' })).toContain('«image-led»');
    expect(productDirection({})).toBe('');
  });
});
