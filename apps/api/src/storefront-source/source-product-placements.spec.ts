import { findProducts, productPlacementFindings } from './source-product-placements';

/** Showcase commerce §3 (spec 2026-10-19): blocks that place products name the store's real products, categories and collections. */
const data = { items: [{ id: 'p1', name: 'Caja degustación', categoryId: 'k', amount: 16000, currency: 'BOB' }, { id: 'p2', name: 'Taza Antojo roja', amount: 6000, currency: 'BOB' }], categories: [{ id: 'k', name: 'Café' }], collections: [{ slug: 'verano' }] };
const page = (content: string, path = 'regalos.html') => [{ path, content }];

it('accepts placements of real products, categories and collections', () => {
  expect(productPlacementFindings(page('<div data-pagosya-catalog data-products="p1, p2"></div><div data-pagosya-spotlight="p2"></div><div data-pagosya-catalog data-category="k"></div><div data-pagosya-catalog data-collection="verano"></div>'), data)).toEqual([]);
});

it('refuses an unknown product, category or collection, naming it', () => {
  const findings = productPlacementFindings(page('<div data-pagosya-catalog data-products="p1,fake"></div><div data-pagosya-spotlight="ghost"></div><div data-pagosya-catalog data-category="nope"></div><div data-pagosya-catalog data-collection="otono"></div>'), data).join(' ');
  for (const name of ['fake', 'ghost', 'nope', 'otono']) expect(findings).toContain(name);
});

it('reads placements in TSX sources too, and ignores files that are not pages', () => {
  expect(productPlacementFindings(page('<section data-pagosya-catalog data-products="zzz" />', 'components/page-regalos.tsx'), data)).toHaveLength(1);
  expect(productPlacementFindings(page('/* data-products="zzz" */', 'styles/globals.css'), data)).toEqual([]);
});

it('a page without placements passes', () => {
  expect(productPlacementFindings(page('<section data-pagosya-catalog></section>'), data)).toEqual([]);
});

it('finds products by a loose name or category', () => {
  expect(findProducts(data, 'taza roja').map(p => p.id)).toEqual(['p2']);
  expect(findProducts(data, 'café')).toEqual([expect.objectContaining({ id: 'p1', category: 'Café', price: 'BOB 160.00' })]);
  expect(findProducts(data, 'zapatos')).toEqual([]);
});
