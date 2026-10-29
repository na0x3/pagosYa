import { carriedStoreConfig } from './source-save-assembly';

// Hoodies y6rhsb5q and Atelier 3dsebvvh, 2026-10-29: the first design rebuilt config.js and lost the template's dropdown menu
// (header.menu with Mujer / Hombre) and its card design (showcase), so the header fell back to plain links.
describe('a YAPI save keeps the store menu and card design (2026-10-29)', () => {
  it('carries header and showcase from the previous config', () => {
    const header = { menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'collection:mujer' }] }] } };
    expect(carriedStoreConfig({ header, showcase: { cards: 'fashion' }, data: { products: [] }, slug: 'x' })).toEqual({ header, showcase: { cards: 'fashion' } });
  });
  it('carries nothing a store never had, and ignores values that are not records', () => {
    expect(carriedStoreConfig({})).toEqual({});
    expect(carriedStoreConfig({ header: 'menu', showcase: ['fashion'] })).toEqual({});
  });
});
