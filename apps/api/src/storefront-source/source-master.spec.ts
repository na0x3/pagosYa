import { masterFillFromRead, masterProductStyle, masterShowcase } from './source-master';
import { templateManifest } from '@pagosya/store-templates';
import { paletteForBrand } from './source-master';
import type { MasterSettings } from '@pagosya/store-templates';
import { masterDnaLook, masterColours, masterCopy, masterDnaFonts, masterLook, masterThemeCss, withMasterTheme, MASTER_THEME_START, MASTER_THEME_END } from './source-master';
import { contrastRatio } from './sketch/sketch-schema';

const values = [{ title: 'Uno', text: 'Primero' }, { title: 'Dos', text: 'Segundo' }, { title: 'Tres', text: 'Tercero' }];
const settings: MasterSettings = {
  copy: { announcement: '', eyebrow: 'Nueva colección', headline: 'Hecho con cuidado', subcopy: 'Sub', primaryCta: 'Ver la colección', secondaryCta: 'Nuestra historia', productsTitle: 'Productos', storyTitle: 'Historia', storyBody: 'Cuerpo', values, closingLine: 'Cierre', closingCta: 'Ver todo', tagline: '' },
  palettes: [{ id: 'terracotta', name: 'Terracota', paper: '#f6f1ea', ink: '#1f1a17', muted: '#ede6dc', accent: '#b8553a', deep: '#2b211c' }, { id: 'gold', name: 'Oro', paper: '#141210', ink: '#f2ece2', muted: '#1e1b18', accent: '#c9a45c', deep: '#0b0a09' }],
  fonts: [{ id: 'classic', name: 'Clásica', heading: 'cormorant-garamond', body: 'dm-sans' }, { id: 'modern', name: 'Moderna', heading: 'fraunces', body: 'geist' }],
};

describe('masterCopy', () => {
  it('keeps defaults for missing or blank fields and clips to the caps', () => {
    const copy = masterCopy(settings, { headline: '  ' + 'x'.repeat(200), subcopy: '' });
    expect(copy.headline).toHaveLength(70);
    expect(copy.subcopy).toBe('Sub');
    expect(copy.eyebrow).toBe('Nueva colección');
  });
  it('lets the announcement and tagline be empty on purpose', () => {
    expect(masterCopy({ ...settings, copy: { ...settings.copy, announcement: 'Envío gratis' } }, { announcement: '' }).announcement).toBe('');
  });
  it('always has three values, filling the missing ones from the defaults', () => {
    expect(masterCopy(settings, { values: [{ title: 'Propio', text: 'Texto' }] as any }).values).toEqual([{ title: 'Propio', text: 'Texto' }, values[1], values[2]]);
  });
});

describe('masterLook', () => {
  it('falls back to the first palette and pair for unknown ids and drops colours that are not #rrggbb', () => {
    expect(masterLook(settings, { palette: 'nope', fonts: 'nope', colors: { accent: 'red', paper: '#FFFFFF' } })).toEqual({ palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffffff' } });
  });
});

describe('masterColours', () => {
  it('corrects unreadable custom ink', () => {
    const colours = masterColours(settings, { palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffff33', ink: '#ffffff' } });
    expect(contrastRatio(colours.paper, colours.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps text readable on the muted surfaces when the merchant inverts the colours (review fix 4)', () => {
    const dark = masterColours(settings, { palette: 'terracotta', fonts: 'classic', colors: { paper: '#000000', ink: '#ffffff' } });
    expect(contrastRatio(dark.muted, dark.ink)).toBeGreaterThanOrEqual(4.5);
    const light = masterColours(settings, { palette: 'gold', fonts: 'classic', colors: { paper: '#ffffff' } });
    expect(contrastRatio(light.muted, light.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it('picks a readable text colour on the accent', () => {
    const colours = masterColours(settings, { palette: 'gold', fonts: 'classic', colors: {} });
    expect(contrastRatio(colours.accent, colours.onAccent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('masterThemeCss', () => {
  it('declares both fonts from the kit catalogue and every colour variable', () => {
    const css = masterThemeCss(settings, masterLook(settings, { fonts: 'modern' }));
    expect(css.startsWith(MASTER_THEME_START)).toBe(true);
    expect(css.endsWith(MASTER_THEME_END)).toBe(true);
    expect(css).toContain('src:url(assets/fraunces.ttf)');
    expect(css).toContain('src:url(assets/geist.ttf)');
    expect(css).toMatch(/--es-heading:'Fraunces'/);
    for (const name of ['paper', 'ink', 'muted', 'accent', 'deep', 'on-accent', 'on-deep']) expect(css).toContain(`--es-${name}:#`);
  });
  it('maps the pair onto the kit DNA fonts', () => {
    expect(masterDnaFonts(settings, masterLook(settings, { fonts: 'modern' }))).toEqual({ display: 'fraunces', text: 'geist' });
  });
});

describe('withMasterTheme', () => {
  it('replaces an existing block and prepends a missing one, idempotently', () => {
    const block = `${MASTER_THEME_START}\n:root{--es-paper:#000000}\n${MASTER_THEME_END}`;
    const once = withMasterTheme('body{margin:0}', block);
    expect(once).toBe(`${block}\nbody{margin:0}`);
    expect(withMasterTheme(once, block)).toBe(once);
    expect(withMasterTheme(once, block.replace('#000000', '#ffffff'))).toContain('--es-paper:#ffffff');
  });
});

describe('masterDnaLook (variety spec §2 look details)', () => {
  it('maps the rolled button and corners to the kit DNA', () => {
    expect(masterDnaLook({ button: 'pill', corners: 'round', sections: [] } as any)).toEqual({ button: 'pill', radius: 'round' });
    expect(masterDnaLook({ button: 'square', corners: 'sharp', sections: [] } as any)).toEqual({ button: 'block', radius: 'none' });
    expect(masterDnaLook({ button: 'underline', corners: 'soft', sections: [] } as any)).toEqual({ button: 'underline', radius: 'soft' });
    expect(masterDnaLook({ button: 'soft', sections: [] } as any)).toEqual({ button: 'block' });
  });
  it('adds nothing for a store without rolled variants', () => expect(masterDnaLook(undefined)).toEqual({}));
});

describe('review fix: a brand accent is readable on the rolled palette', () => {
  const esencial = templateManifest('esencial')!.master!;
  const paper = (id: string) => esencial.palettes.find(p => p.id === id)!.paper;
  it('keeps the roll when the brand accent reads on its paper', () => expect(paletteForBrand(esencial, 'terracotta', { accent: '#1f2a44' })).toBe('terracotta'));
  it('moves off a dark palette when a dark brand accent would vanish on it', () => {
    const id = paletteForBrand(esencial, 'ink', { accent: '#1f2a44' });
    expect(contrastRatio('#1f2a44', paper(id))).toBeGreaterThanOrEqual(3);
  });
  it('a brand paper is the brand\'s own choice: the roll stays', () => expect(paletteForBrand(esencial, 'ink', { accent: '#1f2a44', paper: '#ffffff' })).toBe('ink'));
});

describe('masterShowcase (showcase commerce)', () => {
  it('passes the rolled card and offer styles to the kit config', () => {
    expect(masterShowcase({ cards: 'showcase', offers: 'rows', sections: [] } as any)).toEqual({ cards: 'showcase', offers: 'rows' });
    expect(masterShowcase({ cards: 'nope', sections: [] } as any)).toEqual({});
    expect(masterShowcase(undefined)).toEqual({});
  });
});

it('the read\'s kind reaches the character', () => {
  const read = { headline: 'x', palette: 'mono', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1, changed: [], values: [], tone: 'calm', temperature: 'warm', lead: 'photo', exclude: [], kind: 'fashion' } as any;
  expect(masterFillFromRead(read, [], false).character?.kind).toBe('fashion');
});

it('the fashion variants reach the kit config: card design and product-page style', () => {
  expect(masterShowcase({ cards: 'fashion' } as any)).toEqual({ cards: 'fashion' });
  expect(masterProductStyle({ pdp: 'fashion' } as any)).toEqual({ productPageStyle: 'fashion' });
  expect(masterProductStyle({ pdp: 'gallery-left' } as any)).toEqual({});
});

import { menuGroupsFromRead } from './source-master';
/** Dropdown menu spec 2026-10-21: the fill read's menu. */
describe('menu from the fill read', () => {
  const photos = ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'];
  const groups = [{ label: 'Mujer', links: [{ label: '', target: 'category:c1' }], tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', photo: 1, target: 'category:c1' }, { title: 'Sin foto', photo: 9, target: 'all' }], footerLabel: 'Ver toda la tienda', footerTarget: 'all' }];
  it('turns photo indexes into the photos, leaves empty labels to the save check, and drops empty tile lists', () => {
    expect(menuGroupsFromRead(groups, photos)).toEqual([{ label: 'Mujer', links: [{ to: 'category:c1' }], tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: '/v1/uploads/b.jpg', to: 'category:c1' }], footer: { label: 'Ver toda la tienda', to: 'all' } }]);
    expect(menuGroupsFromRead([{ ...groups[0], tiles: [], tilesTitle: '', footerTarget: '' }], photos)).toEqual([{ label: 'Mujer', links: [{ to: 'category:c1' }] }]);
  });
  it('a build always carries the read menu; an edit only when "menu" changed', () => {
    const read = { menuStyle: 'dropdowns', menuGroups: groups, changed: [] } as never;
    expect(masterFillFromRead(read, photos, false).menu?.style).toBe('dropdowns');
    expect(masterFillFromRead(read, photos, true).menu).toBeUndefined();
    expect(masterFillFromRead({ ...(read as object), changed: ['menu'] } as never, photos, true).menu?.style).toBe('dropdowns');
  });
});

import { masterThemeCss as themeCss } from './source-master';
import { templateManifest as manifestOf } from '@pagosya/store-templates';
/** Sort & filter styles spec 2026-10-21: kit pages read --store-heading-font / --store-body-font. */
it('the Esencial theme also sets the store font variables the kit pages read', () => {
  const settings = manifestOf('esencial')!.master!;
  const css = themeCss(settings, { palette: settings.palettes[0].id, fonts: settings.fonts[0].id, colors: {} });
  expect(css).toContain('--store-heading-font:var(--es-heading)');
  expect(css).toContain('--store-body-font:var(--es-body)');
});


// Owner 2026-10-24 («make stores fuller, more sections»), raised to six 2026-10-27 («full stores with many sections»).
it('a fill read keeps up to six business sections', () => {
  const section = (id: string) => ({ id, title: id, items: [{ title: 'a', text: 'b' }, { title: 'c', text: 'd' }] });
  const read = { sections: ['faq', 'process', 'materials', 'visit', 'quotes', 'care', 'sizes'].map(section) } as any;
  expect(masterFillFromRead(read, [], false).sections?.map(s => s.id)).toEqual(['faq', 'process', 'materials', 'visit', 'quotes', 'care']);
});
