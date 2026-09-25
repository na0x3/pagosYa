import { contrastRatio, MIN_DEFAULT_DISTANCE, MIN_PAIR_DISTANCE, qualityFailures, relativeLuminance, scorecardMarkdown, scoreStores, surfaceDistance, type QualityFacts, type StoreSample } from './source-scorecard';

const clean: QualityFacts = { shopping: 'passed', overflow: { desktop: false, mobile: false }, fontsLoaded: true, missingImages: 0, buyContrast: 7 };
const store = (id: string, surfaces: StoreSample['surfaces'], quality: Partial<QualityFacts> = {}): StoreSample => ({ id, name: id.toUpperCase(), surfaces, quality: { ...clean, ...quality }, errors: [] });

describe('surfaceDistance', () => {
  it('is 0 for identical samples', () => expect(surfaceDistance({ radius: 8, case: 'upper' }, { radius: 8, case: 'upper' })).toBe(0));
  it('is 1 for fully different samples', () => expect(surfaceDistance({ radius: 0, case: 'upper' }, { radius: 10, case: 'none' })).toBe(1));
  it('uses relative numeric difference, capped at 1, over shared keys only', () => {
    expect(surfaceDistance({ h: 40 }, { h: 50 })).toBeCloseTo(0.2);
    expect(surfaceDistance({ x: -4 }, { x: 4 })).toBe(1);
    expect(surfaceDistance({ x: 0, only: 'a' }, { x: 0, other: 'b' })).toBe(0);
    expect(surfaceDistance({ a: 1 }, { b: 1 })).toBe(1);
  });
});

describe('scoreStores', () => {
  const kit = store('kit', { button: { radius: 0, case: 'none' }, cart: { position: 'right', width: 0.3 } });
  it('finds the closest pair and flags stores too close to each other and to the default', () => {
    const card = scoreStores([
      store('a', { button: { radius: 20, case: 'upper' }, cart: { position: 'right', width: 0.3 } }),
      store('b', { button: { radius: 20, case: 'upper' }, cart: { position: 'bottom', width: 1 } }),
      store('c', { button: { radius: 0, case: 'none' }, cart: { position: 'left', width: 0.5 } }),
    ], kit);
    expect(card.surfaces.button.closest).toEqual({ a: 'a', b: 'b', distance: 0 });
    expect(card.surfaces.button.tooCloseToStore).toEqual(['a', 'b']);
    expect(card.surfaces.button.tooCloseToDefault).toEqual(['c']);
    expect(card.surfaces.cart.tooCloseToDefault).toEqual(['a']);
    expect(card.surfaces.cart.fromDefault.a).toBe(0);
    expect(card.stores.find(s => s.id === 'a')).toEqual(expect.objectContaining({ tooCloseToStore: ['button'], tooCloseToDefault: ['cart'] }));
    expect(card.thresholds).toEqual({ minPairDistance: MIN_PAIR_DISTANCE, minDefaultDistance: MIN_DEFAULT_DISTANCE, minBuyContrast: 4.5 });
  });
  it('reports missing surfaces instead of crashing or scoring them', () => {
    const card = scoreStores([store('a', { button: { radius: 20 } }), store('b', { button: { radius: 4 }, cart: {} })], store('kit', {}));
    expect(card.surfaces.cart).toEqual(expect.objectContaining({ measured: 0, closest: null, mean: null, missing: ['a', 'b'], tooCloseToDefault: [] }));
    expect(card.surfaces.button.fromDefault).toEqual({});
    expect(card.surfaces.review.missing).toEqual(['a', 'b']);
  });
  it('counts quality failures per store', () => {
    const card = scoreStores([store('a', {}, { overflow: { desktop: false, mobile: true }, buyContrast: 3.1 }), store('b', {})], store('kit', {}));
    expect(card.stores[0].failures).toEqual(['overflow at 390', 'buy button contrast 3.10 < 4.5']);
    expect(card.qualityFailures).toBe(1);
  });
});

describe('quality', () => {
  it('lists every failure and ignores unsupported shopping', () => {
    expect(qualityFailures({ shopping: 'failed', shoppingError: 'no cart', overflow: { desktop: true, mobile: null }, fontsLoaded: false, missingImages: 2, buyContrast: null }))
      .toEqual(['shopping failed: no cart', 'overflow at 1280', 'fonts not loaded', '2 missing images', 'buy button not measured']);
    expect(qualityFailures({ ...clean, shopping: 'unsupported' })).toEqual([]);
  });
  it('computes WCAG contrast', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 1);
  });
});

it('renders a Markdown report with thresholds, one row per surface and the quality table', () => {
  const card = scoreStores([store('a', { button: { radius: 20 } }), store('b', { button: { radius: 4 } }, { fontsLoaded: false })], store('kit', { button: { radius: 0 } }));
  const md = scorecardMarkdown(card, { title: 'Baseline', source: 'local database', createdAt: '2026-09-24' });
  expect(md).toContain('MIN_PAIR_DISTANCE = 0.25');
  expect(md).toMatch(/\| button \| 2 \| A ↔ B \| 0\.80 \|/);
  expect(md).toMatch(/\| B \| passed \| fonts not loaded \|/);
  for (const surface of ['cart', 'added', 'product', 'review', 'card', 'type', 'page']) expect(md).toContain(`| ${surface} |`);
});
