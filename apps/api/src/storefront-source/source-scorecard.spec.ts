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

describe('perceptual quantization (sub-project 5 review)', () => {
  it('treats deltas below a visible step as the same', () => {
    expect(surfaceDistance({ titleTracking: 0.01 }, { titleTracking: 0.03 })).toBe(0); // 0.02em
    expect(surfaceDistance({ addTracking: 0 }, { addTracking: 0.01 })).toBe(0); // a small number no longer jumps to 1
    expect(surfaceDistance({ pad: 18 }, { pad: 21 })).toBe(0); // 3px
    expect(surfaceDistance({ 'm.pad': 0 }, { 'm.pad': 2 })).toBe(0);
    expect(surfaceDistance({ bgDelta: 1 }, { bgDelta: 3.5 })).toBe(0); // ΔL* 2.5
    expect(surfaceDistance({ bgLum: 0.9 }, { bgLum: 0.93 })).toBe(0); // ΔL* ≈ 1.2
    expect(surfaceDistance({ btnBgLum: 0.01 }, { btnBgLum: 0.012 })).toBe(0);
    expect(surfaceDistance({ radius: 2 }, { radius: 3 })).toBe(0);
    expect(surfaceDistance({ border: 1 }, { border: 1.25 })).toBe(0);
  });
  it('scores visible deltas on a perceptual range, not relative to a tiny value', () => {
    expect(surfaceDistance({ titleTracking: 0 }, { titleTracking: 0.06 })).toBeCloseTo(0.4);
    expect(surfaceDistance({ titleTracking: -0.01 }, { titleTracking: 0.2 })).toBe(1);
    expect(surfaceDistance({ pad: 0 }, { pad: 12 })).toBeCloseTo(0.5);
    expect(surfaceDistance({ bgDelta: 0 }, { bgDelta: 30 })).toBe(1);
    expect(surfaceDistance({ bgLum: 0.01 }, { bgLum: 0.03 })).toBeLessThan(0.4); // near-black to dark grey: ΔL* ≈ 11
    expect(surfaceDistance({ radius: 0 }, { radius: 10 })).toBe(1);
    expect(surfaceDistance({ addRadius: -1 }, { addRadius: 0 })).toBe(1); // -1 = not present
  });
});

describe('kit DNA only', () => {
  const dna = (button: string, cart: string, added: string, review: string, card: string, frame: string): StoreSample['surfaces'] => ({ page: { 'dna.button': button, 'dna.cart': cart, 'dna.added': added, 'dna.review': review, 'dna.card': card, 'dna.frame': frame, 'dna.hover': 'lift', motionHooks: 3 } });
  it('reports the distance over the DNA-driven variants and which pairs still share a kit surface', () => {
    const card = scoreStores([
      store('a', dna('pill', 'sheet', 'toast', 'split', 'zoom', 'bleed')),
      store('b', dna('pill', 'drawer', 'ribbon', 'split', 'tilt', 'arch')),
      store('c', dna('stamp', 'page', 'bubble', 'ticket', 'zoom', 'inset')),
      store('d', { button: { radius: 1 } }),
    ], store('kit', {}));
    expect(card.kitDna.fields).toEqual(['button', 'cart', 'added', 'review', 'card', 'frame']);
    expect(card.kitDna.measured).toBe(3);
    expect(card.kitDna.closest).toEqual({ a: 'a', b: 'b', distance: expect.closeTo(4 / 6) });
    expect(card.kitDna.mean).toBeCloseTo((4 / 6 + 5 / 6 + 1) / 3);
    expect(card.kitDna.shared).toEqual({ button: [['a', 'b']], cart: [], added: [], review: [['a', 'b']], card: [['a', 'c']], frame: [] });
    expect(card.kitDna.missing).toEqual(['d']);
    const markdown = scorecardMarkdown(card, { title: 'T', source: 's', createdAt: 'now' });
    expect(markdown).toContain('## Kit DNA only');
    expect(markdown).toContain('| review | 1: A ↔ B |');
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
  it('does not ask for a buy button in a store with nothing to sell', () => {
    expect(qualityFailures({ ...clean, shopping: 'unsupported', buyContrast: null })).toEqual([]);
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
