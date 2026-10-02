import { preferFreshComposition } from './source-composition-selection';
import { compositionFingerprint } from './source-composition-plan';
import type { SourceDesign } from './source-design';

const design = () => ({ selected: 0, selection: { source: 'planner', rationale: 'Both fit the catalog.' }, concepts: ['split', 'grid'].map(geometry => ({ composition: { family: 'catalog-led', rationale: 'Browse', pages: [{ page: 'index.html', purpose: 'shopping', sections: [{ layout: 'product-grid', geometry, mobile: 'grid', media: [] }] }] } })) } as unknown as SourceDesign);
it('chooses a fresh viable structure without another generation call', () => {
  const value = design();
  expect(preferFreshComposition(value, [compositionFingerprint(value.concepts[0])]).selected).toBe(1);
  expect(value.selected).toBe(0);
});
it('preserves explicit selection and handles exhausted alternatives without a retry loop', () => {
  const value = design(); const all = value.concepts.map(compositionFingerprint);
  expect(preferFreshComposition(value, all)).toBe(value);
  value.selection!.source = 'forced';
  expect(preferFreshComposition(value, [all[0]])).toBe(value);
});
