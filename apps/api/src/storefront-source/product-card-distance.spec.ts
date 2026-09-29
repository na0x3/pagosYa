import { productCardDistance, PRODUCT_CARD_MIN_DISTANCE } from './product-card-distance';
import { presetFor } from './source-product-card-presets';

const theme = (preset: Parameters<typeof presetFor>[0], productCss = '') => ({ productCard: presetFor(preset).params, productCss });

describe('productCardDistance', () => {
  it('is 0 for the same theme', () => {
    expect(productCardDistance(theme('workshop'), theme('workshop'))).toBe(0);
    expect(productCardDistance(theme('workshop', 'a'), theme('workshop', 'b'))).toBe(0);
  });

  it('counts the dimensions that differ', () => {
    expect(productCardDistance(theme('plain'), { productCard: { ...presetFor('plain').params, swatch: 'square' }, productCss: '' })).toBe(1);
    expect(productCardDistance(theme('plain'), { productCard: { ...presetFor('plain').params, swatch: 'square', gallery: 'stack', enter: 'pop' }, productCss: '' })).toBe(3);
  });

  it('puts contrasting businesses well apart', () => {
    expect(productCardDistance(theme('workshop'), theme('boutique'))).toBeGreaterThanOrEqual(PRODUCT_CARD_MIN_DISTANCE);
    expect(productCardDistance(theme('gallery'), theme('catalogue'))).toBeGreaterThanOrEqual(PRODUCT_CARD_MIN_DISTANCE);
  });

  it('adds one when exactly one of the two has guarded CSS', () => {
    expect(productCardDistance(theme('plain'), theme('plain', 'x{}'))).toBe(1);
    expect(productCardDistance(theme('plain', 'x{}'), theme('plain'))).toBe(1);
  });

  it('is symmetric and never above 6', () => {
    for (const a of ['atelier', 'workshop', 'gallery', 'plain'] as const) for (const b of ['boutique', 'playful', 'craft', 'catalogue'] as const) {
      const d = productCardDistance(theme(a, 'x'), theme(b));
      expect(d).toBe(productCardDistance(theme(b), theme(a, 'x')));
      expect(d).toBeLessThanOrEqual(6);
    }
  });
});
