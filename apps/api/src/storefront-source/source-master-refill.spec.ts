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
