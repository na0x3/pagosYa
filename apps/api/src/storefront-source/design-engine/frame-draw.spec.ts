import { drawFrame, frameDirection, frameForRun, frameOverrides, parseFrameDraw, FRAME_CATALOGUE, FRAME_DRAW_FILE, type FrameAvailable } from './frame-draw';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
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
