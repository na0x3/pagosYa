import { SOURCE_RHYTHM_DIRECTION } from '../source-design';
import { PLAYBOOK } from './playbook';
import { asksForBold, designBrandCss, drawDesign, designCategory, designOverrides, drawFrame, frameDirection, frameForRun, frameFresh, frameInputs, frameOverrides, paletteBrandCss, parseFrameDraw, plannerDirection, DESIGN_CATALOGUE, FRAME_CATALOGUE, FRAME_DRAW_FILE, PALETTES, type FrameAvailable } from './frame-draw';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
const bare = { composedInstruction: 'x', assetLegend: [], imageUses: [], items: [] } as Parameters<typeof frameInputs>[0];
const ids = (part: keyof typeof FRAME_CATALOGUE) => FRAME_CATALOGUE[part].map(entry => entry.id);

it('has the agreed catalogue sizes and every entry says something for desktop and phone', () => {
  expect([FRAME_CATALOGUE.header.length, FRAME_CATALOGUE.cart.length, FRAME_CATALOGUE.footer.length, FRAME_CATALOGUE.hero.length]).toEqual([10, 6, 6, 8]);
  for (const entry of Object.values(FRAME_CATALOGUE).flat()) {
    expect(entry.desktop.trim().length).toBeGreaterThan(20);
    expect(entry.phone.trim().length).toBeGreaterThan(10);
  }
  expect(FRAME_CATALOGUE.header.filter(entry => entry.bold)).toHaveLength(5);
  for (const entry of FRAME_CATALOGUE.header) {
    expect(entry.phone).toMatch(/cart/i);
    expect(entry.phone).toMatch(/menu|navigation/i);
  }
  expect(JSON.stringify(FRAME_CATALOGUE)).not.toMatch(/env[ií]o gratis|free shipping|discount/i);
});

it('draws one valid id per part and is repeatable with a seed', () => {
  const draw = drawFrame(seeded(7), [], rich);
  expect(ids('header')).toContain(draw.header);
  expect(ids('cart')).toContain(draw.cart);
  expect(ids('footer')).toContain(draw.footer);
  expect(ids('hero')).toContain(draw.hero);
  expect(drawFrame(seeded(7), [], rich)).toEqual(draw);
});

it('never repeats a recent header or hero while a free one exists, else takes the least used', () => {
  const headers = ids('header'), heroes = ids('hero');
  const recent = headers.slice(0, 9).map((header, i) => ({ header, hero: heroes[i % 7] }));
  for (let seed = 1; seed < 40; seed++) {
    const draw = drawFrame(seeded(seed), recent, rich);
    expect(draw.header).toBe(headers[9]);
    expect(draw.hero).toBe(heroes[7]);
  }
  const all = [...headers, headers[0], headers[1]].map(header => ({ header }));
  for (let seed = 1; seed < 20; seed++) expect(headers.slice(2)).toContain(drawFrame(seeded(seed), all, rich).header);
});

it('never asks a store for photos, a product or facts it does not have', () => {
  const bare: FrameAvailable = { photos: 0, products: 0, facts: false };
  for (let seed = 1; seed < 200; seed++) {
    const draw = drawFrame(seeded(seed), [], bare);
    expect(['collage', 'statement-strip', 'slow-slideshow', 'single-product', 'full-bleed', 'split', 'offset-frame']).not.toContain(draw.hero);
    expect(draw.footer).not.toBe('photo-echo');
    expect(draw.header).not.toBe('info-bar');
  }
});

it('writes one paragraph from the draw and drops the parts the merchant decided', () => {
  const draw = { header: 'wordmark-band', cart: 'own-word', footer: 'statement-band', hero: 'type-only' };
  const text = frameDirection(draw);
  expect(text.startsWith('FRAME AND HERO:')).toBe(true);
  for (const part of ['header', 'cart', 'footer', 'hero'] as const) expect(text).toContain(FRAME_CATALOGUE[part].find(entry => entry.id === draw[part])!.desktop);
  expect(frameDirection(draw, { header: true })).not.toContain(FRAME_CATALOGUE.header.find(entry => entry.id === 'wordmark-band')!.desktop);
  expect(frameDirection({})).toBe('');
  expect(frameOverrides('Quiero el logo centrado arriba')).toEqual({ header: true, hero: false });
  expect(frameOverrides('sin foto en la portada')).toEqual({ header: false, hero: true });
  expect(frameOverrides('Hazme una tienda de café')).toEqual({ header: false, hero: false });
  expect(frameOverrides('pon el menú a la izquierda')).toEqual({ header: true, hero: false });
});

it('reads a saved draw defensively', () => {
  expect(parseFrameDraw(JSON.stringify({ header: 'side-rail', cart: 'nope', hero: 3 }))).toEqual({ header: 'side-rail' });
  expect(parseFrameDraw('not json')).toEqual({});
  expect(parseFrameDraw(undefined)).toEqual({});
});

it('decides what a run gets: fresh draws and saves, edits carry the file, off does nothing', () => {
  const recent = [{ header: 'side-rail' }];
  const fresh = frameForRun({ enabled: true, fresh: true, previous: [], recent, available: rich, request: 'Hazme la tienda', random: seeded(3) });
  expect(fresh.file?.path).toBe(FRAME_DRAW_FILE);
  expect(parseFrameDraw(fresh.file!.content).header).not.toBe('side-rail');
  expect(fresh.paragraph.startsWith('FRAME AND HERO:')).toBe(true);
  const saved = { path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'overlay', cart: 'icon-dot', footer: 'quiet-line', hero: 'split' }) };
  expect(frameForRun({ enabled: true, fresh: false, previous: [saved], recent, available: rich, request: 'cambia el título' })).toEqual({ file: saved, paragraph: '' });
  expect(frameForRun({ enabled: true, fresh: false, previous: [], recent, available: rich, request: 'x' })).toEqual({ paragraph: '' });
  expect(frameForRun({ enabled: false, fresh: true, previous: [saved], recent, available: rich, request: 'x' })).toEqual({ paragraph: '' });
  expect(frameForRun({ enabled: true, fresh: true, previous: [], recent, available: rich, request: 'logo centrado', random: seeded(3) }).paragraph).not.toMatch(/^- Header/m);
});

// Final review fixes (2026-10-10): what reaches the draw from a real generate() run.
describe('frame inputs from a real run', () => {
  it('reads only the merchant words, never the composed summary or YAPI interpretation', () => {
    const composed = 'Contexto acordado:\nCafé con menú del día en el centro de Cochabamba.\nInterpretación operativa de YAPI: logo centrado arriba\nPedido actual del comercio:\nHazme la tienda';
    expect(frameInputs({ ...bare, composedInstruction: composed, merchantInstruction: 'Hazme la tienda' }).request).toBe('Hazme la tienda');
    expect(frameInputs({ ...bare, composedInstruction: composed }).request.trim()).toBe('Hazme la tienda');
    expect(frameOverrides(frameInputs({ ...bare, composedInstruction: composed }).request)).toEqual({ header: false, hero: false });
  });
  it('counts only real display photos: never the logo, references, unused uploads or duplicates', () => {
    const logo = { original: '/v1/uploads/logo.png', path: 'assets/image-logo.png' };
    expect(frameInputs({ ...bare, assetLegend: [logo], imageUses: [{ url: logo.original, role: 'logo' }] }).available.photos).toBe(0);
    expect(frameInputs({ ...bare, assetLegend: [logo], logoUrl: logo.original }).available.photos).toBe(0);
    const ref = { original: '/v1/uploads/ref.png', path: 'assets/image-ref.png' };
    expect(frameInputs({ ...bare, assetLegend: [ref], imageUses: [{ url: ref.original, role: 'reference' }] }).available.photos).toBe(0);
    const a = { original: '/v1/uploads/a.jpg', path: 'assets/image-a.jpg' }, a2 = { original: '/v1/uploads/a2.jpg', path: 'assets/image-a.jpg' };
    const clip = { original: '/v1/uploads/c.mp4', path: 'assets/c.mp4' };
    expect(frameInputs({ ...bare, assetLegend: [a, a2, clip] }).available.photos).toBe(1);
  });
  it('treats only delivery, hours, pickup or a location as a fact for the info bar', () => {
    expect(frameInputs({ ...bare, businessInformation: 'Café de especialidad para amantes del grano.' }).available.facts).toBe(false);
    expect(frameInputs({ ...bare, businessInformation: 'Abrimos de lunes a sábado de 8:00 a 18:00.' }).available.facts).toBe(true);
    expect(frameInputs({ ...bare, businessInformation: 'Hacemos envíos a todo La Paz.' }).available.facts).toBe(true);
    expect(frameInputs({ ...bare, locations: [{ name: 'Local' }] }).available.facts).toBe(true);
  });
  it('draws fresh only where the drawn frame is actually built', () => {
    expect(frameFresh({ sep5Author: true, agentEngine: false, sketchFirst: false, hasPrevious: false, redesign: false })).toBe(true);
    expect(frameFresh({ sep5Author: false, agentEngine: true, sketchFirst: false, hasPrevious: true, redesign: true })).toBe(true);
    expect(frameFresh({ sep5Author: false, agentEngine: true, sketchFirst: true, hasPrevious: false, redesign: false })).toBe(false);
    expect(frameFresh({ sep5Author: true, agentEngine: false, sketchFirst: false, hasPrevious: true, redesign: false })).toBe(false);
  });
  it('gives a redesign a different header and hero from its own last draw', () => {
    const saved = { path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'overlay', cart: 'icon-dot', footer: 'quiet-line', hero: 'split' }) };
    for (let seed = 1; seed < 40; seed++) {
      const draw = parseFrameDraw(frameForRun({ enabled: true, fresh: true, previous: [saved], recent: [], available: rich, request: 'rediséñala', random: seeded(seed) }).file!.content);
      expect(draw.header).not.toBe('overlay');
      expect(draw.hero).not.toBe('split');
    }
  });
  it('does not mistake "portada" in passing for a hero decision', () => {
    expect(frameOverrides('Rehaz la composición de la portada con la nueva marca')).toEqual({ header: false, hero: false });
    expect(frameOverrides('pon mis productos en la portada')).toEqual({ header: false, hero: false });
    expect(frameOverrides('quiero un video en la primera pantalla')).toEqual({ header: false, hero: true });
  });
  it('never asks for a typed price in the product hero', () => {
    const entry = FRAME_CATALOGUE.hero.find(item => item.id === 'single-product')!;
    expect(entry.desktop).toMatch(/never type/i);
  });
});

describe('design draw round 2', () => {
  const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const hsl = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return { h: (h + 360) % 360, s, l }; };

  it('has the agreed catalogues, readable palettes and no brown-on-cream', () => {
    expect(PALETTES).toHaveLength(14);
    expect([DESIGN_CATALOGUE.angle.length, DESIGN_CATALOGUE.structure.length, DESIGN_CATALOGUE.photos.length, DESIGN_CATALOGUE.button.length, DESIGN_CATALOGUE.hover.length]).toEqual([10, 8, 7, 12, 5]);
    expect(DESIGN_CATALOGUE.button.map(entry => entry.id).sort()).toEqual(['block', 'brutal', 'bubbly', 'ghost', 'outline', 'pill', 'split', 'stamp', 'sticker', 'tag', 'ticket', 'underline']);
    for (const palette of PALETTES) {
      expect(contrast(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
      const ink = hsl(palette.ink), paper = hsl(palette.paper);
      const brownInk = ink.h >= 10 && ink.h <= 45 && ink.s > 0.15 && ink.l < 0.35, creamPaper = paper.h >= 25 && paper.h <= 55 && paper.s > 0.2 && paper.l > 0.85;
      expect(brownInk && creamPaper).toBe(false);
    }
  });

  it('avoids recent palettes and angles, the same business first', () => {
    const recent = PALETTES.slice(0, 13).map((palette, i) => ({ palette: palette.id, angle: DESIGN_CATALOGUE.angle[i % 9].id, category: 'café' }));
    for (let seed = 1; seed < 30; seed++) {
      const draw = drawDesign(seeded(seed), recent, rich, 'café');
      expect(draw.palette).toBe(PALETTES[13].id);
      expect(draw.angle).toBe(DESIGN_CATALOGUE.angle[9].id);
    }
    // p0 used once by a florist, p1 once by a café, every other palette twice by florists: only the double weight
    // of the café use separates p0 from p1.
    const mixed = [{ palette: PALETTES[0].id, category: 'florería' }, { palette: PALETTES[1].id, category: 'café' }, ...PALETTES.slice(2).flatMap(p => [{ palette: p.id, category: 'florería' }, { palette: p.id, category: 'florería' }])];
    for (let seed = 1; seed < 30; seed++) expect(drawDesign(seeded(seed), mixed, rich, 'café').palette).toBe(PALETTES[0].id);
    expect(drawDesign(seeded(5), [], rich, 'café')).toEqual(drawDesign(seeded(5), [], rich, 'café'));
  });

  it('never asks for photos or a product the store lacks', () => {
    for (let seed = 1; seed < 200; seed++) {
      const draw = drawDesign(seeded(seed), [], { photos: 0, products: 0, facts: false }, '');
      expect(['lookbook', 'single-focus']).not.toContain(draw.structure);
      expect(draw.photos).not.toBe('one-per-screen');
    }
  });

  it('lets the merchant keep their colours, buttons and photos', () => {
    expect(designOverrides('usa mis colores verde y blanco')).toEqual({ palette: true, photos: false, button: false });
    expect(designOverrides('quiero botones redondos')).toEqual({ palette: false, photos: false, button: true });
    expect(designOverrides('fotos en blanco y negro')).toEqual({ palette: false, photos: true, button: false });
    expect(designOverrides('Hazme la tienda de café')).toEqual({ palette: false, photos: false, button: false });
  });

  it('writes the design draw for YAPI and the angle and palette for the planner', () => {
    const draw = { header: 'side-rail', cart: 'icon-dot', footer: 'quiet-line', hero: 'type-only', palette: 'cobalt-bone', angle: 'process-numbers', structure: 'menu-board', photos: 'duotone', button: 'sticker', hover: 'tilt' };
    const text = frameDirection(draw);
    expect(text.startsWith('DESIGN DRAW:')).toBe(true);
    expect(text).toContain('#1533c9');
    for (const part of ['angle', 'structure', 'photos', 'button', 'hover'] as const) expect(text).toContain(DESIGN_CATALOGUE[part].find(entry => entry.id === draw[part])!.desktop);
    expect(text).toMatch(/textPath/);
    expect(frameDirection(draw, { palette: true })).not.toContain('#1533c9');
    expect(plannerDirection(draw)).toMatch(/process/i);
    expect(plannerDirection(draw)).toContain('#1533c9');
    expect(plannerDirection({})).toBe('');
  });

  it('turns a palette into brand tokens with a readable accent text colour', () => {
    const palette = PALETTES.find(p => p.id === 'cobalt-bone')!;
    const css = paletteBrandCss(palette);
    for (const token of ['--brand-background', '--brand-foreground', '--brand-accent', '--brand-accent-foreground', '--brand-surface']) expect(css).toContain(token);
    const fg = css.match(/--brand-accent-foreground:\s*(#[0-9a-f]{6})/i)![1];
    expect(contrast(fg, palette.accent)).toBeGreaterThanOrEqual(3);
  });

  it('reads the business category from the brief', () => {
    expect(designCategory({ businessType: '  Café de Especialidad ' })).toBe('café de especialidad');
    expect(designCategory({})).toBe('');
    expect(designCategory(null)).toBe('');
  });

  it('adds the design draw only to fresh runs that ask for it', () => {
    const fresh = frameForRun({ enabled: true, designEnabled: true, category: 'café', fresh: true, previous: [], recent: [], available: rich, request: 'Hazme la tienda', random: seeded(4) });
    const saved = parseFrameDraw(fresh.file!.content);
    expect(saved).toMatchObject({ category: 'café' });
    expect(Object.keys(saved)).toEqual(expect.arrayContaining(['palette', 'angle', 'structure', 'photos', 'button', 'hover']));
    expect(fresh.paragraph.startsWith('DESIGN DRAW:')).toBe(true);
    expect(fresh.dna).toEqual({ button: saved.button, hover: saved.hover });
    expect(fresh.palette?.id).toBe(saved.palette);
    expect(fresh.planner).not.toBe('');
    const kept = frameForRun({ enabled: true, designEnabled: true, category: 'café', fresh: true, previous: [], recent: [], available: rich, request: 'usa mis colores verde y blanco, botones redondos', random: seeded(4) });
    expect(kept.palette).toBeUndefined();
    expect(kept.dna).toBeUndefined();
    expect(kept.paragraph).not.toMatch(/#[0-9a-f]{6}/i);
    const off = frameForRun({ enabled: true, designEnabled: false, fresh: true, previous: [], recent: [], available: rich, request: 'x', random: seeded(4) });
    expect(off.paragraph.startsWith('FRAME AND HERO:')).toBe(true);
    expect('planner' in off || 'dna' in off || 'palette' in off).toBe(false);
  });
});

// Round-2 final review fixes (2026-10-10).
describe('design draw review fixes', () => {
  const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const savedDesign = { path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'overlay', cart: 'icon-dot', footer: 'quiet-line', hero: 'split', palette: 'cobalt-bone', angle: 'humour', structure: 'menu-board', photos: 'duotone', button: 'sticker', hover: 'tilt', category: 'café' }) };

  it('keeps the drawn buttons and colour world on an ordinary edit', () => {
    const edit = frameForRun({ enabled: true, designEnabled: true, fresh: false, previous: [savedDesign], recent: [], available: rich, request: 'cambia el teléfono del pie' });
    expect(edit).toMatchObject({ file: savedDesign, paragraph: '', dna: { button: 'sticker', hover: 'tilt' } });
    expect(edit.palette?.id).toBe('cobalt-bone');
    expect(frameForRun({ enabled: true, designEnabled: true, brandColours: true, fresh: false, previous: [savedDesign], recent: [], available: rich, request: 'x' }).palette).toBeUndefined();
  });

  it('never draws a colour world over confirmed brand colours, in the prompts either', () => {
    const run = frameForRun({ enabled: true, designEnabled: true, brandColours: true, category: 'café', fresh: true, previous: [], recent: [], available: rich, request: 'Hazme la tienda', random: seeded(4) });
    expect(run.palette).toBeUndefined();
    expect(run.paragraph).not.toMatch(/Colour world/);
    expect(run.planner ?? '').not.toMatch(/#[0-9a-f]{6}/i);
    expect(parseFrameDraw(run.file!.content).palette).toBeUndefined();
  });

  it('reads real colour, button and photo wishes and ignores ordinary words', () => {
    const cases: Array<[string, { palette: boolean; photos: boolean; button: boolean }]> = [
      ['mi tienda en verde y blanco', { palette: true, photos: false, button: false }],
      ['usa los colores de mi marca', { palette: true, photos: false, button: false }],
      ['quiero el botón redondo', { palette: false, photos: false, button: true }],
      ['fotos en blanco y negro', { palette: false, photos: true, button: false }],
      ['con botones de WhatsApp', { palette: false, photos: false, button: false }],
      ['con un tono cercano', { palette: false, photos: false, button: false }],
      ['vendo poleras de varios colores', { palette: false, photos: false, button: false }],
      ['agrega filtros por categoría', { palette: false, photos: false, button: false }],
      ['quiero zapatos negros en el catálogo', { palette: false, photos: false, button: false }],
    ];
    for (const [text, expected] of cases) expect([text, designOverrides(text)]).toEqual([text, expected]);
  });

  it('gives the platform panels a readable surface in every colour world', () => {
    for (const palette of PALETTES) {
      const surface = paletteBrandCss(palette).match(/--brand-surface:\s*(#[0-9a-f]{6})/i)![1];
      expect([palette.id, contrast(palette.ink, surface) >= 4.5]).toEqual([palette.id, true]);
    }
  });

  it('decides brand.css: drawn palette unless confirmed colours, never a stale drawn block', () => {
    const palette = PALETTES[0];
    const stale = `${paletteBrandCss(PALETTES[3])}@font-face { font-family: 'Brand heading'; }\n`;
    expect(designBrandCss({ palette, brandColours: false, confirmedCss: '', brandRevision: 0, previousBrand: stale })).toContain(palette.paper);
    expect(designBrandCss({ palette, brandColours: true, confirmedCss: ':root{--brand-accent:#0a7a3d}', brandRevision: 2 })).toBe(':root{--brand-accent:#0a7a3d}');
    const kept = designBrandCss({ brandColours: false, confirmedCss: '', brandRevision: 0, previousBrand: stale });
    expect(kept).not.toContain(PALETTES[3].paper);
    expect(kept).toContain('Brand heading');
    expect(designBrandCss({ brandColours: false, confirmedCss: '', brandRevision: 3 })).toBe('/* No confirmed visual tokens. */\n');
  });

  it('keeps photo treatments off the platform catalog and product photos', () => {
    const text = frameDirection({ header: 'side-rail', palette: 'cobalt-bone', photos: 'black-white' });
    expect(text).toMatch(/never to the platform's catalog cards or product page/);
  });

  it('tells the planner a drawn colour world beats sampling the photos', () => {
    expect(SOURCE_RHYTHM_DIRECTION).toMatch(/designDraw/);
  });
});

it('hears a merchant who asks for a bold store, and nobody else', () => {
  for (const text of ['hazla atrevida', 'quiero un estilo póster', 'algo muy llamativo', 'diseño bold']) expect([text, asksForBold(text)]).toEqual([text, true]);
  for (const text of ['Hazme la tienda de café', 'una tienda tranquila', 'ropa para niños']) expect([text, asksForBold(text)]).toEqual([text, false]);
});

describe('dice inside the playbook family', () => {
  const family = PLAYBOOK['cafe-food'].families[0];
  it('draws only conventional headers, family palettes and family buttons unless the merchant asked for bold', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = frameForRun({ enabled: true, designEnabled: true, fresh: true, previous: [], recent: [], available: rich, request: 'Hazme la tienda', random: seeded(seed), playbook: { kind: 'cafe-food', family, bold: false } });
      const saved = parseFrameDraw(run.file!.content) as Record<string, string>;
      expect(['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking']).toContain(saved.header);
      expect(family.buttons).toContain(saved.button);
      expect(family.palettes.map(pl => pl.id)).toContain(run.palette?.id);
      expect(saved).toMatchObject({ kind: 'cafe-food', family: family.id });
    }
    const bold = frameForRun({ enabled: true, designEnabled: true, fresh: true, previous: [], recent: [], available: rich, request: 'hazla atrevida', random: seeded(9), playbook: { kind: 'cafe-food', family, bold: true } });
    expect(FRAME_CATALOGUE.header.map(entry => entry.id)).toContain(parseFrameDraw(bold.file!.content).header);
  });
  it('reads back kind and family from a saved draw', () => {
    expect(parseFrameDraw(JSON.stringify({ header: 'stacked', kind: 'cafe-food', family: 'cafe-shop' }))).toMatchObject({ kind: 'cafe-food', family: 'cafe-shop' });
  });
});
