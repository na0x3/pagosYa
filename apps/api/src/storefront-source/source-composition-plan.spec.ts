import { compositionDistance, compositionFingerprint, validateSourceCompositionPlan } from './source-composition-plan';

export const compositionFixture = () => ({ family: 'catalog-led', rationale: 'The broad parts catalog needs direct category browsing.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Find parts by category and buy them.', sections: [{ id: 'menu', intent: 'Compare the available parts and prices.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'View product' }] }] });
it('accepts purposeful commerce grids and preserves the compact plan', () => {
  expect(validateSourceCompositionPlan(compositionFixture(), ['menu'])).toEqual(compositionFixture());
});
it.each(['../story.html', 'stories/craft.html', '/story.html', 'https://x.com/story.html', 'story.html?x', 'product.html'])('rejects unsafe or reserved custom page %s', page => {
  const plan = compositionFixture(); plan.pages.push({ ...plan.pages[0], page });
  expect(() => validateSourceCompositionPlan(plan, ['menu'])).toThrow();
});
it('rejects image disposal, missing purpose, unknown properties and mismatched section order', () => {
  for (const edit of [
    (p: any) => { p.pages[0].rationale = 'Use all uploaded images'; },
    (p: any) => { p.pages[0].purpose = ''; },
    (p: any) => { p.pages[0].sections[0].extra = true; },
    (p: any) => { p.pages[0].sections.push(p.pages[0].sections[0]); },
    (p: any) => { p.pages.push(p.pages[0]); },
  ]) { const plan = compositionFixture(); edit(plan); expect(() => validateSourceCompositionPlan(plan, ['menu'])).toThrow(); }
  expect(() => validateSourceCompositionPlan(compositionFixture(), ['opening', 'menu'])).toThrow();
});
it('measures composition rather than prose or font choices', () => {
  const a = { composition: validateSourceCompositionPlan(compositionFixture(), ['menu']) };
  const b = structuredClone(a); b.composition.rationale = 'Different prose';
  expect(compositionFingerprint(a)).toBe(compositionFingerprint(b));
  expect(compositionDistance(a, b)).toBe(0);
  b.composition.pages[0].sections[0].geometry = 'split';
  b.composition.pages[0].sections[0].media = [{ asset: 'assets/part.jpg', role: 'lead' }];
  expect(compositionDistance(a, b)).toBeGreaterThan(0);
  expect(compositionFingerprint(a)).not.toBe(compositionFingerprint(b));
});

it('includes commerce structure in diversity without including cosmetic DNA', () => {
  const a = { composition: validateSourceCompositionPlan(compositionFixture(), ['menu']), dna: { surfaces: { product: 'dense', cart: 'page', review: 'split', card: 'quick-look' } } };
  for (const key of ['product', 'cart', 'review', 'card'] as const) {
    const b = structuredClone(a); b.dna.surfaces[key] = 'different';
    expect(compositionFingerprint(b)).not.toBe(compositionFingerprint(a));
    expect(compositionDistance(a, b)).toBeGreaterThan(0);
  }
  expect(compositionFingerprint({ ...a, dna: { ...a.dna, type: { display: 'other-font' } } } as any)).toBe(compositionFingerprint(a));
});
