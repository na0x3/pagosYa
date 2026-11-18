import { checkStoreMenu, instructionAsksStoreMenu, instructionTouchesStoreMenu, readStoreMenu, storeMenuContext, storeMenuTargetList, withStoreMenuConfig, STORE_MENU_LIMITS, withAboutLink, withExtraPageLinks } from './source-store-menu';

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
    // Owner 2026-10-22 (goodProtein): what the menu holds is still the menu; it went to a full edit and failed twice.
    ['Quiero un menú desplegable arriba: que al pasar el mouse por «Tienda» se abra con las categorías (Proteínas, Recuperación y energía, Snacks proteicos) y las marcas, cada una con su enlace.', true],
    ['quiero un menú desplegable con las categorías y cambia el logo', false],
    ['un menú desplegable y además fotos más grandes', false],
  ])('%s → %s', (text, expected) => expect(instructionOnlyAboutStoreMenu(text)).toBe(expected));
});


// YAPI creates anything (spec 2026-11-05): the menu follows the pages YAPI made.
describe('extra page links', () => {
  const novias = { slug: 'novias', name: 'Novias', menu: '', layout: [] };
  it('puts an extra page in the bar, inside a named dropdown, and drops links of removed pages', () => {
    const menu = { style: 'dropdowns' as const, groups: [{ label: 'Colecciones', links: [{ to: 'all' }] }] };
    expect(withExtraPageLinks(menu, [novias]).menu.groups!.at(-1)).toEqual({ label: 'Novias', links: [{ label: 'Novias', to: 'extra:novias' }], direct: true });
    expect(withExtraPageLinks(menu, [{ ...novias, menu: 'Colecciones' }]).menu.groups![0].links).toContainEqual({ label: 'Novias', to: 'extra:novias' });
    expect(withExtraPageLinks(menu, [{ ...novias, menu: 'Colecciones' }]).menu.groups).toHaveLength(1);
    const linked = withExtraPageLinks(menu, [novias]).menu;
    expect(withExtraPageLinks(linked, []).menu.groups!.some(group => group.links.some(link => link.to.startsWith('extra:')))).toBe(false);
    expect(withExtraPageLinks(linked, [{ ...novias, name: 'Novias 2027' }]).menu.groups!.at(-1)!.label).toBe('Novias 2027');
    expect(withExtraPageLinks(undefined, [novias]).menu).toEqual({ style: 'dropdowns', groups: [{ label: 'Novias', links: [{ label: 'Novias', to: 'extra:novias' }], direct: true }] });
  });
  // Live NOA 2026-11-05: the «Novias» dropdown already linked the «Novias» category; the kit shows one link per name.
  it('names the page link apart when its dropdown already has a link with that name', () => {
    const menu = { style: 'panel' as const, groups: [{ label: 'Novias', links: [{ label: 'Novias', to: 'category:c1' }] }] };
    expect(withExtraPageLinks(menu, [{ ...novias, menu: 'Novias' }]).menu.groups![0].links).toEqual([{ label: 'Novias', to: 'category:c1' }, { label: 'Página Novias', to: 'extra:novias' }]);
  });
  it('refuses a fifth entry in the bar', () => {
    const full = { style: 'dropdowns' as const, groups: ['a', 'b', 'c', 'd'].map(label => ({ label, links: [{ to: 'all' }] })) };
    expect(withExtraPageLinks(full, [novias]).refused[0]).toMatch(/menú ya tiene 4/);
  });
  it('lets the menu link an extra page and keeps a direct one-link group', () => {
    const files = [{ path: 'components/store-data.tsx', content: 'export const extraPages: any[] = [{"slug":"novias","name":"Novias","menu":"","layout":[]}];\n' }];
    const ctx = storeMenuContext({}, files);
    expect(ctx.targets.get('extra:novias')).toBe('Novias');
    expect(checkStoreMenu({ style: 'dropdowns', groups: [{ label: 'Novias', direct: true, links: [{ to: 'extra:novias' }] }] }, ctx)).toEqual({ style: 'dropdowns', groups: [{ label: 'Novias', direct: true, links: [{ label: 'Novias', to: 'extra:novias' }] }] });
  });
});

describe('withAboutLink (owner 2026-11-12 «the entire stores are only product pages»)', () => {
  const shop = { label: 'Sodas', links: [{ label: 'Todas', to: 'all' }] };
  it('adds «Nosotros» as a plain link to a menu with room, once', () => {
    const menu = withAboutLink({ style: 'dropdowns', groups: [shop] })!;
    expect(menu.groups).toEqual([shop, { label: 'Nosotros', links: [{ label: 'Nosotros', to: 'page:about' }], direct: true }]);
    expect(withAboutLink(menu)).toBe(menu);
  });
  it('leaves a full menu, a menu without groups and no menu as they are', () => {
    const full = { style: 'dropdowns' as const, groups: Array.from({ length: STORE_MENU_LIMITS.groups }, (_, i) => ({ ...shop, label: `G${i}` })) };
    expect(withAboutLink(full)).toBe(full);
    const empty = { style: 'panel' as const };
    expect(withAboutLink(empty)).toBe(empty);
    expect(withAboutLink(undefined)).toBeUndefined();
  });
});
