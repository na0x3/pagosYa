import { checkStoreMenu, instructionAsksStoreMenu, instructionTouchesStoreMenu, readStoreMenu, storeMenuContext, storeMenuTargetList, withStoreMenuConfig, STORE_MENU_LIMITS } from './source-store-menu';

/** Dropdown menu (spec 2026-10-21): the menu config, its save checks and the chat words that switch it on or off. */
const data = {
  categories: [{ id: 'c1', name: 'Vestidos', bannerUrl: 'https://api.test/v1/uploads/b1.jpg' }, { id: 'c2', name: 'Sastrería', bannerUrl: '/v1/uploads/b2.jpg' }, { id: 'c3', name: 'Vacía' }],
  items: [{ categoryId: 'c1', imageUrls: ['https://api.test/v1/uploads/p1.jpg'] }, { categoryId: 'c2', imageUrls: ['https://api.test/v1/uploads/p2.jpg'] }],
};
const files = [{ path: 'index.html', content: '<main><section id="historia"></section><section id="sizes"></section></main>' }];
const ctx = storeMenuContext(data, files);
const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};\n` });

describe('store menu targets', () => {
  it('lists only categories with products, the info pages and the home sections', () => {
    const list = storeMenuTargetList(ctx).map(entry => entry.target);
    expect(list).toEqual(expect.arrayContaining(['all', 'new', 'category:c1', 'category:c2', 'page:about', 'page:contact', 'page:shipping', 'page:refund', 'page:faq', 'section:historia', 'section:sizes']));
    expect(list).not.toContain('category:c3');
  });
  it('counts product photos and absolute banners as store photos, never a relative banner', () => {
    expect(ctx.photos.has('https://api.test/v1/uploads/p1.jpg')).toBe(true);
    expect(ctx.photos.has('https://api.test/v1/uploads/b1.jpg')).toBe(true);
    expect(ctx.photos.has('/v1/uploads/b2.jpg')).toBe(false);
  });
});

describe('checkStoreMenu', () => {
  it('needs a known style', () => {
    expect(checkStoreMenu({ style: 'mega' }, ctx)).toBeNull();
    expect(checkStoreMenu(null, ctx)).toBeNull();
    expect(checkStoreMenu({ style: 'panel' }, ctx)).toEqual({ style: 'panel' });
  });
  it('drops unknown targets, tiles without a store photo and empty groups, and clips labels', () => {
    const menu = checkStoreMenu({ style: 'dropdowns', groups: [
      { label: 'Mujer', links: [{ to: 'category:c1' }, { label: 'Inventada', to: 'category:zz' }, { label: 'x'.repeat(40), to: 'all' }],
        tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }, { title: 'Robada', image: 'https://other.test/x.jpg', to: 'category:c1' }],
        footer: { label: 'Ver toda la tienda', to: 'all' } },
      { label: 'Nada', links: [{ to: 'category:zz' }] },
      { label: '', links: [{ to: 'all' }] },
    ] }, ctx)!;
    expect(menu.groups).toHaveLength(1);
    expect(menu.groups![0].links).toEqual([{ label: 'Vestidos', to: 'category:c1' }, { label: 'x'.repeat(STORE_MENU_LIMITS.label), to: 'all' }]);
    expect(menu.groups![0].tiles).toEqual([{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }]);
    expect(menu.groups![0].tilesTitle).toBe('Por estilo');
    expect(menu.groups![0].footer).toEqual({ label: 'Ver toda la tienda', to: 'all' });
  });
  it('a section link needs its own label', () => {
    const menu = checkStoreMenu({ style: 'panel', groups: [{ label: 'Descubre', links: [{ to: 'section:historia' }, { label: 'Guía de tallas', to: 'section:sizes' }] }] }, ctx)!;
    expect(menu.groups![0].links).toEqual([{ label: 'Guía de tallas', to: 'section:sizes' }]);
  });
  it('keeps at most 4 groups, 12 links and 3 tiles', () => {
    const links = Array.from({ length: 20 }, () => ({ to: 'all' }));
    const tiles = Array.from({ length: 5 }, () => ({ title: 'T', image: 'https://api.test/v1/uploads/p1.jpg', to: 'all' }));
    const menu = checkStoreMenu({ style: 'panel', groups: Array.from({ length: 6 }, (_, i) => ({ label: `G${i}`, links, tiles })) }, ctx)!;
    expect(menu.groups).toHaveLength(4);
    expect(menu.groups![0].links).toHaveLength(12);
    expect(menu.groups![0].tiles).toHaveLength(3);
  });
  it('a menu left with no links falls back to the default (no groups)', () => {
    expect(checkStoreMenu({ style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:zz' }] }] }, ctx)).toEqual({ style: 'panel' });
  });
});

describe('config.js header.menu', () => {
  it('writes, reads and removes the menu, keeping the rest of the header', () => {
    const saved = [config({ header: { account: true }, dna: {} })];
    const on = withStoreMenuConfig(saved, [], { style: 'panel' });
    expect(readStoreMenu(on)).toEqual({ style: 'panel' });
    expect(JSON.parse(on[0].content.match(/= (.*);/)![1]).header.account).toBe(true);
    expect(readStoreMenu(withStoreMenuConfig(on, [], null))).toBeUndefined();
  });
  it('a save without config.js takes the saved one first', () => {
    const out = withStoreMenuConfig([{ path: 'index.html', content: '' }], [config({ dna: {} })], { style: 'dropdowns' });
    expect(readStoreMenu(out)).toEqual({ style: 'dropdowns' });
  });
});

describe('chat words', () => {
  it.each([
    ['quiero un menú desplegable', true], ['pon menús desplegables arriba', true], ['un menú con categorías como John Smedley', true],
    ['agrega un mega menú', true], ['quita el menú desplegable', false], ['sin menú desplegable por favor', false],
    ['agrega postres al menú', undefined], ['cambia el menú del día', undefined], ['cambia el color del botón', undefined],
    // Final review 2026-10-21: «no» removes, and only the clause that holds the ask counts.
    ['no quiero menú desplegable', false], ['ya no quiero el menú desplegable', false], ['nunca pedí un menú desplegable, quítalo', false],
    ['elimina el banner y pon un menú desplegable', true], ['sin cambiar nada más, agrega un menú desplegable', true],
    ['cambia el dropdown de tallas por botones', undefined], ['quiero un dropdown en el menú', true],
  ])('%s → %s', (text, expected) => expect(instructionAsksStoreMenu(text)).toBe(expected));
  it('«al menú» only touches a menu that exists', () => {
    expect(instructionTouchesStoreMenu('agrega Accesorios al menú')).toBe(true);
    expect(instructionTouchesStoreMenu('cambia el titular')).toBe(false);
  });
});

import { instructionOnlyAboutStoreMenu, menuFromVariant } from './source-store-menu';
describe('menuFromVariant', () => {
  it('none or no variant means no menu; a style keeps the checked groups', () => {
    expect(menuFromVariant('none', [], ctx)).toBeUndefined();
    expect(menuFromVariant(undefined, [], ctx)).toBeUndefined();
    expect(menuFromVariant('panel', [], ctx)).toEqual({ style: 'panel' });
    expect(menuFromVariant('dropdowns', [{ label: 'Mujer', links: [{ to: 'category:c1' }] }], ctx)).toEqual({ style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:c1' }] }] });
  });
});

describe('instructionOnlyAboutStoreMenu (final review 2026-10-21)', () => {
  it.each([
    ['quiero un menú desplegable con mis categorías', true], ['agrega Accesorios al menú', true], ['quita el menú desplegable, por favor', true],
    ['agrega una sección de reseñas y un menú desplegable', false], ['rediseña todo y ponle un menú desplegable', false],
    ['Crea la página NOVIAS con Vestido Cala, y ponla en el menú', false],
  ])('%s → %s', (text, expected) => expect(instructionOnlyAboutStoreMenu(text)).toBe(expected));
});

