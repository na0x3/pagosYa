import { sameAsBundled } from './source-templates';
import type { MasterSettings, TemplateManifest } from '@pagosya/store-templates';
import { fillTemplatePhotos, readMasterState, refillMasterFiles, templateStoreDataFile, TEMPLATE_STORE_DATA_PATH } from './source-templates';
import { MASTER_THEME_START, MASTER_THEME_END, masterCopy, masterLook } from './source-master';

const values = [{ title: 'Uno', text: 'Primero' }, { title: 'Dos', text: 'Segundo' }, { title: 'Tres', text: 'Tercero' }];
const master: MasterSettings = {
  copy: { announcement: '', eyebrow: 'Nueva', headline: 'Hecho con cuidado', subcopy: 'Sub', primaryCta: 'Ver', secondaryCta: 'Historia', productsTitle: 'Productos', storyTitle: 'Historia', storyBody: 'Cuerpo', values, closingLine: 'Cierre', closingCta: 'Ver todo', tagline: '' },
  palettes: [{ id: 'terracotta', name: 'Terracota', paper: '#f6f1ea', ink: '#1f1a17', muted: '#ede6dc', accent: '#b8553a', deep: '#2b211c' }, { id: 'sage', name: 'Salvia', paper: '#eef0ea', ink: '#1a211c', muted: '#e1e6dd', accent: '#2f5d46', deep: '#1f3a2e' }],
  fonts: [{ id: 'classic', name: 'Clásica', heading: 'cormorant-garamond', body: 'dm-sans' }, { id: 'modern', name: 'Moderna', heading: 'fraunces', body: 'geist' }],
};
const manifest = { id: 'esencial', name: 'Esencial', category: 'general', description: 'x', tags: [], sitePurpose: 'shop', order: 0, hidden: true, master,
  photos: [{ slot: 'hero', role: 'hero', demo: 'hero.jpg' }, { slot: 'story', role: 'lifestyle', demo: 'story.jpg' }] } as unknown as TemplateManifest;

const storeFiles = () => [
  templateStoreDataFile({ name: 'Café Buna', tagline: '', city: 'La Paz' }, { hero: 'https://x/h.jpg', story: '' }, { copy: masterCopy(master), look: masterLook(master) }),
  { path: 'styles/globals.css', content: `${MASTER_THEME_START}\n:root{}\n${MASTER_THEME_END}\nbody{margin:0}` },
  { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: { display: 'cormorant-garamond', text: 'dm-sans', button: 'pill' }, data: {} })};\n` },
];

describe('master store data', () => {
  it('no demo photo reaches a store without photos', () => {
    const { photos, demoSlots } = fillTemplatePhotos(manifest, [], false);
    expect(photos).toEqual({ hero: '', story: '' });
    expect(demoSlots).toEqual([]);
  });

  it('round-trips copy, look and photos through store-data', () => {
    const state = readMasterState(storeFiles());
    expect(state.copy?.headline).toBe('Hecho con cuidado');
    expect(state.look).toEqual({ palette: 'terracotta', fonts: 'classic', colors: {} });
    expect(state.photos.hero).toBe('https://x/h.jpg');
  });

  it('refill changes only what was asked and moves the kit DNA fonts with the pair', () => {
    const files = refillMasterFiles(storeFiles(), manifest, { copy: { headline: 'Café de altura' }, look: { fonts: 'modern' } });
    const state = readMasterState(files);
    expect(state.copy?.headline).toBe('Café de altura');
    expect(state.copy?.subcopy).toBe('Sub');
    expect(state.look?.palette).toBe('terracotta');
    expect(files.find(f => f.path === 'styles/globals.css')!.content).toContain('assets/geist.ttf');
    expect(files.find(f => f.path === 'config.js')!.content).toContain('"display":"fraunces"');
    expect(files.find(f => f.path === 'config.js')!.content).toContain('"button":"pill"');
  });

  it('refill restores a deleted theme block and survives a missing copy line', () => {
    const files = storeFiles().map(f => f.path === 'styles/globals.css' ? { ...f, content: 'body{margin:0}' }
      : f.path === TEMPLATE_STORE_DATA_PATH ? { ...f, content: f.content.replace(/^export const copy = .*$/m, '') } : f);
    const out = refillMasterFiles(files, manifest, { look: { palette: 'sage' } });
    expect(out.find(f => f.path === 'styles/globals.css')!.content.startsWith(MASTER_THEME_START)).toBe(true);
    expect(readMasterState(out).copy?.headline).toBe('Hecho con cuidado');
  });

  it('a new look replaces earlier custom colours instead of keeping them (review fix 5)', () => {
    const custom = refillMasterFiles(storeFiles(), manifest, { look: { colors: { paper: '#ffff33' } } });
    expect(readMasterState(custom).look?.colors).toEqual({ paper: '#ffff33' });
    const back = refillMasterFiles(custom, manifest, { look: { palette: 'sage', fonts: 'classic', colors: {} } });
    expect(readMasterState(back).look).toEqual({ palette: 'sage', fonts: 'classic', colors: {} });
  });

  it('a photo change given as an upload path is saved as a full API URL (live check fix)', () => {
    const out = refillMasterFiles(storeFiles(), manifest, { heroPhoto: '/v1/uploads/new.jpg' }, new URL('https://api.pagosya.test/v1'));
    expect(readMasterState(out).photos.hero).toBe('https://api.pagosya.test/v1/uploads/new.jpg');
  });

  it('a named variant replaces only its part, and an unknown id is ignored', () => {
    const files = [templateStoreDataFile({ name: 'Café' }, { hero: '' }, { copy: masterCopy(master), look: masterLook(master), variants: { hero: 'full', grid: 'grid4', sections: [] } as any }), ...storeFiles().slice(1)];
    const m = { ...manifest, master: { ...master, variants: { hero: ['full', 'split-left'], grid: ['grid4'] } } } as any;
    const out = refillMasterFiles(files, m, { variants: { hero: 'split-left', grid: 'nope' } });
    expect(readMasterState(out).variants).toMatchObject({ hero: 'split-left', grid: 'grid4' });
  });

  // Owner 2026-10-29: stores built Oct 27–29 keep variants the Oct 22 template no longer reads; a chat edit still saves, and an
  // asked-for value of a removed part is never written.
  it('a refill keeps working when the stored variants name parts the template no longer has', () => {
    const stale = { hero: 'full', grid: 'grid4', family: 'pop', heroFade: 'fade', footer: 'statement', effect: 'bubbles', sections: [] };
    const files = [templateStoreDataFile({ name: 'Café' }, { hero: '' }, { copy: masterCopy(master), look: masterLook(master), variants: stale as any }), ...storeFiles().slice(1)];
    const m = { ...manifest, master: { ...master, variants: { hero: ['full', 'split-left'], grid: ['grid4'], footer: ['columns'] } } } as any;
    let out: ReturnType<typeof refillMasterFiles> = [];
    expect(() => { out = refillMasterFiles(files, m, { copy: { headline: 'Nuevo título' }, variants: { effect: 'petals' } as any }); }).not.toThrow();
    expect(readMasterState(out).copy?.headline).toBe('Nuevo título');
    expect((readMasterState(out).variants as any)?.effect).not.toBe('petals');
  });

  it('round-trips the rolled variants and business sections, and a refill keeps them (variety spec §2)', () => {
    const variants = { hero: 'arch', grid: 'feature', sections: ['process'] } as any;
    const sections = [{ id: 'process', title: 'Del cafetal a tu taza', items: [{ title: 'Cosecha', text: 'A mano.' }] }];
    const files = [templateStoreDataFile({ name: 'Café' }, { hero: '' }, { copy: masterCopy(master), look: masterLook(master), variants, sections }), ...storeFiles().slice(1)];
    expect(readMasterState(files).variants).toEqual(variants);
    expect(readMasterState(files).sections).toEqual(sections);
    const out = refillMasterFiles(files, manifest, { copy: { headline: 'Otro' } });
    expect(readMasterState(out).variants).toEqual(variants);
    expect(readMasterState(out).sections).toEqual(sections);
  });
});

describe('review fix: a product photo that is the bundled hero or story points at the same asset', () => {
  it('maps product slots holding the hero/story upload to the bundled asset', () => {
    const photos = { hero: 'assets/image-1.jpg', story: 'assets/image-2.jpg', p1: 'http://localhost:3001/v1/uploads/aaaa-0001.jpg', p2: '/v1/uploads/aaaa-0002.jpg', p3: '/v1/uploads/aaaa-0003.jpg' };
    expect(sameAsBundled(photos, { hero: '/v1/uploads/aaaa-0001.jpg', story: '/v1/uploads/aaaa-0002.jpg' })).toEqual({ ...photos, p1: 'assets/image-1.jpg', p2: 'assets/image-2.jpg' });
  });
  it('leaves photos alone without sources', () => expect(sameAsBundled({ hero: 'h', p1: 'x' }, undefined)).toEqual({ hero: 'h', p1: 'x' }));
});

describe('fashion look', () => {
  const withVariants = { ...manifest, master: { ...master, variants: { cards: ['compact', 'fashion'], pdp: ['gallery-left', 'fashion'] } } } as unknown as TemplateManifest;
  const configOf = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
  it('a refill to the fashion variants writes the card design and product-page style into config.js, and back', () => {
    const fashion = refillMasterFiles(storeFiles(), withVariants, { variants: { cards: 'fashion', pdp: 'fashion' } as any });
    expect(configOf(fashion).showcase.cards).toBe('fashion');
    expect(configOf(fashion).productPageStyle).toBe('fashion');
    expect(readMasterState(fashion).variants?.pdp).toBe('fashion');
    const back = refillMasterFiles(fashion, withVariants, { variants: { cards: 'compact', pdp: 'gallery-left' } as any });
    expect(configOf(back).showcase.cards).toBe('compact');
    expect(configOf(back).productPageStyle).toBeUndefined();
  });

  const oldProduct = [
    "import Shell, { variant } from './Shell';",
    "import { ProductPageTemplate, KitSlot } from '@pagosya/ui';",
    '            <KitSlot kind="product" name="title" className="es-pdp__title" />',
    '            <KitSlot kind="product" name="buy" className="es-pdp__buy" />',
  ].join('\n');
  const withPages = () => [...storeFiles(), { path: 'components/product.tsx', content: oldProduct }];
  const file = (files: Array<{ path: string; content: string }>, path: string) => files.find(f => f.path === path)!.content;

  it('a store switched to the fashion look gains the fashion CSS and the product page\'s category line and size guide link', () => {
    const files = refillMasterFiles(withPages(), withVariants, { variants: { cards: 'fashion', pdp: 'fashion' } as any });
    expect(file(files, 'styles/globals.css')).toContain('.es-pdp[data-es-pdp="fashion"]');
    expect(file(files, 'styles/globals.css')).toContain('body{margin:0}');
    const product = file(files, 'components/product.tsx');
    expect(product).toContain("{variant('pdp', 'gallery-left') === 'fashion' ? <KitSlot kind=\"product\" name=\"category\"");
    expect(product).toContain('href="index.html#sizes"');
    expect(product).toContain("import { sections } from './store-data';");
    // Twice is the same as once.
    const again = refillMasterFiles(files, withVariants, { variants: { cards: 'fashion', pdp: 'fashion' } as any });
    expect(file(again, 'styles/globals.css').split('/* Fashion look (2026-10-21)').length).toBe(2);
    expect(file(again, 'components/product.tsx').split('name="category"').length).toBe(2);
  });

  it('other refills leave the product page and CSS as they are; an edited product page without the anchors is left alone', () => {
    const plain = refillMasterFiles(withPages(), withVariants, { copy: { headline: 'Otra' } });
    expect(file(plain, 'components/product.tsx')).toBe(oldProduct);
    const edited = [...storeFiles(), { path: 'components/product.tsx', content: 'export default function Product() { return null; }' }];
    expect(file(refillMasterFiles(edited, withVariants, { variants: { pdp: 'fashion' } as any }), 'components/product.tsx')).toBe('export default function Product() { return null; }');
  });
});

import { readStoreMenu } from './source-store-menu';
/** Dropdown menu spec 2026-10-21: the menu variant writes config.js header.menu and gives an older Shell its mounts. */
const menuManifest = { ...manifest, master: { ...master, variants: { menu: ['none', 'panel', 'dropdowns'], cards: ['showcase', 'fashion'] } } } as unknown as TemplateManifest;
const shellFile = { path: 'components/Shell.tsx', content: `      <div className="es-header__start">\n        <button type="button" className="es-icon-btn" aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>\n        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>\n      </div>\n      <nav className="es-header__links" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>` };
const menuStore = () => storeFiles().map(file => file.path === 'config.js' ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: {}, header: { account: false }, data: { categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Seda' }], items: [{ categoryId: 'c1', imageUrls: ['https://api.test/v1/uploads/p1.jpg'] }, { categoryId: 'c2', imageUrls: [] }] } })};\n` } : file).concat(shellFile);
const configOf = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(file => file.path === 'config.js')!.content.match(/= (.*);/)![1]);

describe('menu on a master store', () => {
  it('a menu style in the change turns the menu on, writes header.menu and gives an older Shell its mounts', () => {
    const files = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }] }] } });
    expect(readStoreMenu(files)).toEqual({ style: 'panel', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:c1' }] }] });
    expect(readMasterState(files).variants?.menu).toBe('panel');
    const shell = files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(shell).toContain('data-pagosya-store-menu="toggle"');
    expect(shell).toContain('data-pagosya-store-menu="links"');
    expect(shell.match(/data-store-menu-replaces/g)).toHaveLength(2);
    expect(configOf(files).header.account).toBe(false);
  });
  it('a tile given as an upload path is saved as the full API URL and kept when it is a store photo', () => {
    const files = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }], tiles: [{ title: 'Vestidos', image: '/v1/uploads/p1.jpg', to: 'category:c1' }] }] } }, new URL('https://api.test/v1'));
    expect(readStoreMenu(files)?.groups?.[0].tiles).toEqual([{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }]);
  });
  it('a refill that says nothing about the menu keeps it, groups included', () => {
    const on = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }] }] } });
    const again = refillMasterFiles(on, menuManifest, { copy: { headline: 'Otra' } });
    expect(readStoreMenu(again)).toEqual(readStoreMenu(on));
  });
  it('style none removes it; doing the mounts twice changes nothing', () => {
    const on = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [] } });
    const off = refillMasterFiles(on, menuManifest, { menu: { style: 'none', groups: [] } });
    expect(readStoreMenu(off)).toBeUndefined();
    expect(configOf(off).header).toEqual({ account: false });
    const twice = refillMasterFiles(on, menuManifest, { menu: { style: 'panel', groups: [] } });
    expect(twice.find(f => f.path === 'components/Shell.tsx')!.content).toBe(on.find(f => f.path === 'components/Shell.tsx')!.content);
  });
  it('a fashion store gets the panel at its next refill even without a menu change', () => {
    const fashion = refillMasterFiles(menuStore(), menuManifest, { variants: { cards: 'fashion' } as never });
    expect(readStoreMenu(fashion)).toEqual({ style: 'panel' });
  });
  it('a fashion store that removed its menu keeps it removed through later edits (final review 2026-10-21)', () => {
    const off = refillMasterFiles(menuStore(), menuManifest, { variants: { cards: 'fashion' } as never, menu: { style: 'none', groups: [] } });
    expect(readStoreMenu(off)).toBeUndefined();
    expect(readStoreMenu(refillMasterFiles(off, menuManifest, { copy: { headline: 'Otra' } }))).toBeUndefined();
  });
  it('a store without the menu part in its catalogue never gets a menu', () => {
    expect(readStoreMenu(refillMasterFiles(menuStore(), manifest, { copy: { headline: 'Otra' } }))).toBeUndefined();
  });
  it('an edited Shell without the template lines is left alone, and the menu still saves', () => {
    const edited = menuStore().map(file => file.path === 'components/Shell.tsx' ? { ...file, content: '<header>propio</header>' } : file);
    const files = refillMasterFiles(edited, menuManifest, { menu: { style: 'panel', groups: [] } });
    expect(files.find(f => f.path === 'components/Shell.tsx')!.content).toBe('<header>propio</header>');
    expect(readStoreMenu(files)).toEqual({ style: 'panel' });
  });
});

/** Spec 2026-10-21 sort & filter styles: the filters variant writes config.js filterStyle. */
describe('filter style on a master store', () => {
  const filtersManifest = { ...manifest, master: { ...master, variants: { filters: ['bar', 'chips', 'sidebar'] } } } as unknown as TemplateManifest;
  it('a filters choice writes filterStyle, and a later refill keeps it', () => {
    const files = refillMasterFiles(storeFiles(), filtersManifest, { variants: { filters: 'chips' } as never });
    expect(configOf(files).filterStyle).toBe('chips');
    expect(configOf(refillMasterFiles(files, filtersManifest, { copy: { headline: 'Otra' } })).filterStyle).toBe('chips');
  });
  it('a style the merchant asked for in chat survives the next refill (final review 2026-10-21)', () => {
    const rolled = refillMasterFiles(storeFiles(), filtersManifest, { variants: { filters: 'chips' } as never });
    const asked = rolled.map(file => file.path === 'config.js' ? { ...file, content: file.content.replace('"filterStyle":"chips"', '"filterStyle":"sidebar"') } : file);
    expect(configOf(refillMasterFiles(asked, filtersManifest, { copy: { headline: 'Otra' } })).filterStyle).toBe('sidebar');
    expect(configOf(refillMasterFiles(asked, filtersManifest, { variants: { filters: 'bar' } as never })).filterStyle).toBe('bar');
  });
  it('an older fashion store without a filters record gets the chip rows at its next refill', () => {
    const both = { ...manifest, master: { ...master, variants: { filters: ['bar', 'chips', 'sidebar'], cards: ['showcase', 'fashion'] } } } as unknown as TemplateManifest;
    expect(configOf(refillMasterFiles(storeFiles(), both, { variants: { cards: 'fashion' } as never })).filterStyle).toBe('chips');
    expect(configOf(refillMasterFiles(storeFiles(), both, { copy: { headline: 'Otra' } })).filterStyle).toBeUndefined();
  });
});

import { designFileCount } from './source-next';
import { templateSourceFiles } from '@pagosya/store-templates';
/** Deferred minors 2026-10-21: the platform's catalogue pages do not count toward the store's design files, and a page from
 *  the first version of them is brought up to date. */
describe('Esencial catalogue pages follow-ups', () => {
  const template = (path: string) => templateSourceFiles('esencial').find(file => file.path === path)!.content;
  it('the catalogue pages are marked and not counted as design files', () => {
    for (const path of ['components/page-productos.tsx', 'components/page-coleccion.tsx']) expect(template(path)).toMatch(/^\/\/ @pagosya-catalog-page/);
    expect(designFileCount([{ path: 'components/page-productos.tsx', content: template('components/page-productos.tsx') }, { path: 'components/home.tsx', content: '' }])).toBe(1);
  });
  it('a first-version collection page (no mark, fixed title) is replaced by the current one; an edited one is kept', () => {
    // As NOA VARGAS rev 8 has it: no mark, a fixed title, and the first wording of the comment (live 2026-10-21).
    const first = template('components/page-coleccion.tsx').replace(/^\/\/ @pagosya-catalog-page[^\n]*\n/, '').replace(' data-collection-title', '')
      .replace(/\/\*\*[\s\S]*?\*\//, "/** Sort & filter styles spec 2026-10-21: one collection inside the store's own header, menu and footer; the kit draws the\n *  collection's name, its tabs and its products into the mount. */");
    const store = storeFiles().concat({ path: 'components/page-coleccion.tsx', content: first }, { path: 'components/page-productos.tsx', content: 'mine' });
    const out = refillMasterFiles(store, manifest, { copy: { headline: 'Otra' } });
    expect(out.find(file => file.path === 'components/page-coleccion.tsx')!.content).toBe(template('components/page-coleccion.tsx'));
    expect(out.find(file => file.path === 'components/page-productos.tsx')!.content).toBe('mine');
  });
});

/** John Smedley sections (spec 2026-10-21): the features on a master store. */
describe('features on a master store', () => {
  const featureManifest = { ...manifest, master: { ...master, variants: { feature: ['duo', 'explore', 'capsule', 'origin', 'palette'] } } } as unknown as TemplateManifest;
  const withData = () => storeFiles().map(file => file.path === 'config.js' ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: {}, slug: 'noa', data: { categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }], items: [{ id: 'a', categoryId: 'c1', imageUrls: [] }, { id: 'b', categoryId: 'c2', imageUrls: [] }] } })};\n` } : file)
    .map(file => file.path === 'components/store-data.tsx' ? { ...file, content: file.content.replace('{"hero":"https://x/h.jpg","story":""}', '{"hero":"https://x/h.jpg","story":"https://x/s.jpg","p1":"https://x/p1.jpg"}') } : file);
  it('a named section builds its data into store-data', () => {
    const files = refillMasterFiles(withData(), featureManifest, { variants: { feature: 'duo' } as never, featureCopy: { duoTitles: ['Novias', ''] } });
    const state = readMasterState(files);
    expect(state.variants?.feature).toBe('duo');
    // The story photo is used last (final review 2026-10-21).
    expect((state.features as any).duo.halves[0]).toMatchObject({ title: 'Novias', href: 'productos.html?f_categoria=c1', photo: 'https://x/p1.jpg' });
    expect((state.features as any).duo.halves[1]).toMatchObject({ title: 'Faldas', photo: 'https://x/s.jpg' });
  });
  it('a list of sections is taken as given; a refill that names none keeps them', () => {
    const files = refillMasterFiles(withData(), featureManifest, { variants: { feature: ['duo', 'origin'] } as never });
    expect(readMasterState(files).variants?.feature).toBe('duo,origin');
    const again = refillMasterFiles(files, featureManifest, { copy: { headline: 'Otra' } });
    expect(readMasterState(again).features).toEqual(readMasterState(files).features);
  });
  it('an older store without a feature record gets a roll, and store-data always exports features', () => {
    const files = refillMasterFiles(withData(), featureManifest, { copy: { headline: 'Otra' } });
    expect(typeof readMasterState(files).variants?.feature).toBe('string');
    expect(files.find(file => file.path === 'components/store-data.tsx')!.content).toMatch(/^export const features: Record<string, any> = /m);
  });
});

/** John Smedley sections (spec 2026-10-21): an older home gets the four slots, the component and the CSS once. */
describe('feature slots on an older home', () => {
  const anchors = `import { copy, photos, sections, store } from './store-data';\nexport default function Home() {\n  return <main>\n      <section id="productos"></section>\n\n      <section id="historia"></section>\n\n      {sections.map(section => null)}\n\n      <section id="valores"></section>\n\n      <section id="resenas"></section>\n\n      <section id="cierre"></section>\n  </main>;\n}\n`;
  const older = (home: string) => storeFiles().concat({ path: 'components/home.tsx', content: home });
  it('adds the slots before the four anchors, the component and the CSS, once', () => {
    const files = refillMasterFiles(older(anchors), manifest, { copy: { headline: 'Otra' } });
    const home = files.find(file => file.path === 'components/home.tsx')!.content;
    for (const at of ['products', 'story', 'values', 'closing']) expect(home).toContain(`<FeatureSlot at="${at}" />`);
    expect(home.indexOf('<FeatureSlot at="products" />')).toBeLessThan(home.indexOf('<section id="historia">'));
    expect(home).toContain("import { FeatureSlot } from './features';");
    expect(files.some(file => file.path === 'components/features.tsx')).toBe(true);
    const again = refillMasterFiles(files, manifest, { copy: { headline: 'Otra más' } });
    expect(again.find(file => file.path === 'components/home.tsx')!.content).toBe(home);
  });
  it('a home without all four anchors is left alone — Review Focus 3', () => {
    const edited = anchors.replace('<section id="valores"></section>', '<div id="valores"></div>');
    const files = refillMasterFiles(older(edited), manifest, { copy: { headline: 'Otra' } });
    expect(files.find(file => file.path === 'components/home.tsx')!.content).toBe(edited);
  });
  it('an older Shell gets the column footer\'s photo band (live check 2026-10-21, NOA VARGAS rev 11)', () => {
    const shell = `import { store, copy, variants } from './store-data';\nexport function Footer() {\n  const footer = variant('footer', 'columns');\n  return <footer className="es-footer" data-es-footer={footer}>\n  </footer>;\n}\n`;
    const files = refillMasterFiles(older(anchors).concat({ path: 'components/Shell.tsx', content: shell }), manifest, { copy: { headline: 'Otra' } });
    const patched = files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(patched).toContain('data-es-footer={footer} style={band}>');
    expect(patched).toContain("import { store, copy, variants, photos } from './store-data';");
    expect(refillMasterFiles(files, manifest, { copy: { headline: 'Otra más' } }).find(file => file.path === 'components/Shell.tsx')!.content).toBe(patched);
  });
  it('an older copy of the sections CSS block is refreshed to the template\'s', () => {
    const stale = '/* John Smedley sections (2026-10-21): old */\n.es-duo{}\n/* John Smedley sections end */';
    const files = refillMasterFiles(older(anchors).map(file => file.path === 'styles/globals.css' ? { ...file, content: `${file.content}\n${stale}\n` } : file), manifest, { copy: { headline: 'Otra' } });
    const css = files.find(file => file.path === 'styles/globals.css')!.content;
    expect(css).not.toContain('/* John Smedley sections (2026-10-21): old */');
    expect(css).toContain('#productos .es-grid[data-es-grid="side-title"][data-pagosya-catalog]');
    expect(css.split('/* John Smedley sections end */')).toHaveLength(2);
  });
  it('a home whose store-data import is double-quoted or split over lines still gets the import (final review 2026-10-21)', () => {
    for (const importLine of [`import { copy, photos, sections, store } from "./store-data";\n`, `import {\n  copy,\n  photos,\n  sections,\n} from './store-data'\n`]) {
      const home = anchors.replace(`import { copy, photos, sections, store } from './store-data';\n`, importLine);
      const patched = refillMasterFiles(older(home), manifest, { copy: { headline: 'Otra' } }).find(file => file.path === 'components/home.tsx')!.content;
      expect(patched).toContain("import { FeatureSlot } from './features';");
      expect(patched.indexOf("import { FeatureSlot }")).toBeLessThan(patched.indexOf('export default'));
    }
  });
  it('a home with no import it can follow is left alone rather than given slots without one', () => {
    const home = anchors.replace(`import { copy, photos, sections, store } from './store-data';\n`, '');
    expect(refillMasterFiles(older(home), manifest, { copy: { headline: 'Otra' } }).find(file => file.path === 'components/home.tsx')!.content).toBe(home);
  });
});

/** Final review 2026-10-21: an edit of the sections' words reaches the store. */
it('a words-only change rebuilds the rolled sections with the new words', () => {
  const featureManifest = { ...manifest, master: { ...master, variants: { feature: ['duo', 'explore', 'capsule', 'origin', 'palette'] } } } as unknown as TemplateManifest;
  const base = storeFiles().map(file => file.path === 'config.js' ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: {}, slug: 'x', data: { categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }], items: [{ id: 'a', categoryId: 'c1', imageUrls: [] }, { id: 'b', categoryId: 'c2', imageUrls: [] }] } })};\n` } : file)
    .map(file => file.path === 'components/store-data.tsx' ? { ...file, content: file.content.replace('{"hero":"https://x/h.jpg","story":""}', '{"hero":"https://x/h.jpg","story":"https://x/s.jpg","p1":"https://x/p1.jpg"}') } : file);
  const rolled = refillMasterFiles(base, featureManifest, { variants: { feature: 'duo' } as never });
  const edited = refillMasterFiles(rolled, featureManifest, { featureCopy: { duoTitles: ['Verano', ''] } });
  expect((readMasterState(edited).features as any).duo.halves[0].title).toBe('Verano');
  expect(readMasterState(edited).variants?.feature).toBe('duo');
});

/** Final review 2026-10-21: the boxed header keeps the store menu's panels full width, and an empty rail is hidden. */
it('the sections CSS keeps menu panels full width under the boxed header and hides empty rails', () => {
  const css = templateSourceFiles('esencial').find(file => file.path === 'styles/globals.css')!.content;
  expect(css).toMatch(/\.es-header\[data-es-header="boxed"\] \.pym-panel\{[^}]*width:100vw/);
  expect(css).toContain('.es-explore__rail[hidden],.es-capsule__cards[hidden]{display:none}');
});

