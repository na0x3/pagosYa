import { readCatalogLayout, CATALOG_LAYOUTS } from './catalog-layout';

describe('readCatalogLayout', () => {
  it('keeps the four known values', () => {
    for (const layout of CATALOG_LAYOUTS) expect(readCatalogLayout(layout)).toBe(layout);
  });

  it('falls back to the single grid for anything else', () => {
    for (const value of [undefined, null, '', 'grid', 7, {}]) expect(readCatalogLayout(value)).toBe('all');
  });
});
