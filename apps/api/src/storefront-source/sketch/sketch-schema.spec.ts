import { contrastRatio, DEFAULT_SKETCH_STYLE, SKETCH_STYLE_OPTIONS, type StoreSketch, ensureAllPhotosUsed, ensureBandRhythm, mixHex, repairSketch, resolveBg, SKETCH_BLOCK_TYPES } from './sketch-schema';
import { drawPageStructure } from './sketch-structure-draw';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };

describe('repairSketch', () => {
  it('builds a usable default from garbage', () => {
    for (const bad of [undefined, null, 'x', 42, { blocks: 'nope' }]) {
      const { sketch } = repairSketch(bad, ctx);
      expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
      expect(sketch.blocks.at(-1)?.type).toBe('footer');
      expect(sketch.palette.paper).toMatch(/^#[0-9a-f]{6}$/);
      expect(sketch.blocks.every(b => SKETCH_BLOCK_TYPES.includes(b.type))).toBe(true);
    }
  });
  it('clamps fonts and colors to the catalogs', () => {
    const { sketch, notes } = repairSketch({ fonts: { display: 'comic-sans', text: 'epilogue' }, palette: { paper: 'red!!' }, blocks: [] }, ctx);
    expect(sketch.fonts.text).toBe('epilogue');
    expect(sketch.fonts.display).not.toBe('comic-sans');
    expect(sketch.palette.paper).toMatch(/^#[0-9a-f]{6}$/);
    expect(notes.length).toBeGreaterThan(0);
  });
  it('drops hallucinated photos and unknown block types, dedupes ids, inserts catalog+footer', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'x', type: 'hero', headline: 'Hola', photo: 'assets/nope.jpg' },
      { id: 'x', type: 'hologram' },
      { id: 'x', type: 'gallery', photos: ['assets/a.jpg', 'assets/nope.jpg'] },
    ] }, ctx);
    const ids = sketch.blocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sketch.blocks.find(b => b.type === 'hero')).not.toHaveProperty('photo');
    expect((sketch.blocks.find(b => b.type === 'gallery') as any).photos).toEqual(['assets/a.jpg']);
    expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
  });
  it('defaults the product skin to plain, keeps a valid preset with its dimensions, and keeps single overrides', () => {
    expect(repairSketch(undefined, ctx).sketch.product).toEqual({ preset: 'plain', layout: 'editorial', assurances: [], swatch: 'pill', gallery: 'rail', blocks: 'plain', divider: 'none', enter: 'none', media: 'left' });
    const boutique = repairSketch({ product: { preset: 'boutique' } }, ctx).sketch.product;
    expect(boutique).toEqual({ preset: 'boutique', layout: 'editorial', assurances: [], swatch: 'circle', gallery: 'strip', blocks: 'plain', divider: 'none', enter: 'fade-up', media: 'right' });
    // The composition defaults to the preset's commerce recipe and keeps a valid stored value.
    expect(repairSketch({ product: { preset: 'craft' } }, ctx).sketch.product.layout).toBe('story-led');
    expect(repairSketch({ product: { preset: 'craft', layout: 'image-led', media: 'right' } }, ctx).sketch.product).toMatchObject({ layout: 'image-led', media: 'right' });
    const tweaked = repairSketch({ product: { preset: 'boutique', gallery: 'mosaic' } }, ctx).sketch.product;
    expect(tweaked.gallery).toBe('mosaic');
    expect(tweaked.swatch).toBe('circle');
    const { sketch, notes } = repairSketch({ product: { preset: 'neon', swatch: 'hexagon' } }, ctx);
    expect(sketch.product.preset).toBe('plain');
    expect(sketch.product.swatch).toBe('pill');
    expect(notes.some(note => note.includes('estilo de ficha'))).toBe(true);
  });
  it('keeps honest assurance lines, drops platform claims and links, caps at 3', () => {
    const { sketch, notes } = repairSketch({ product: { preset: 'craft', assurances: [
      { icon: 'coffee', title: 'Horneado del día', detail: 'Salimos del horno a las 7am' },
      { icon: 'volcano', title: 'x'.repeat(90), detail: 'y'.repeat(200) },
      { icon: 'star', title: 'Pago seguro con pagosYa', detail: '' },
      { icon: 'leaf', title: 'Visítanos en www.ejemplo.com', detail: '' },
      { icon: 'gift', title: 'Empaque de regalo', detail: '' },
      { icon: 'clock', title: 'Pedidos hasta las 18h', detail: '' },
    ] } }, ctx);
    const items = sketch.product.assurances;
    expect(items.map(item => item.icon)).toEqual(['coffee', 'sparkles', 'gift']);
    expect(items[1].title.length).toBe(40);
    expect(items[1].detail.length).toBe(80);
    expect(items.some(item => /pagosya|www\./i.test(item.title))).toBe(false);
    expect(notes.some(note => note.includes('reservadas a la plataforma'))).toBe(true);
    expect(repairSketch(undefined, ctx).sketch.product.assurances).toEqual([]);
  });
  it('clamps text lengths and list sizes', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'x'.repeat(500) },
      { id: 's', type: 'story', paragraphs: Array.from({ length: 20 }, (_, i) => `p${i}` + 'y'.repeat(900)) },
    ] }, ctx);
    expect((sketch.blocks.find(b => b.type === 'hero') as any).headline.length).toBeLessThanOrEqual(120);
    const story = sketch.blocks.find(b => b.type === 'story') as any;
    expect(story.paragraphs.length).toBeLessThanOrEqual(6);
    expect(story.paragraphs[0].length).toBeLessThanOrEqual(600);
  });
  it('moves a misplaced footer to the end', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'f', type: 'footer', tagline: 'fin' },
      { id: 'h', type: 'hero', headline: 'Hola' },
    ] }, ctx);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
    expect(sketch.blocks.filter(b => b.type === 'footer')).toHaveLength(1);
  });
  it('never throws and fixes unreadable ink', () => {
    const { sketch } = repairSketch({ palette: { paper: '#ffffff', ink: '#fefefe' } }, ctx);
    expect(sketch.palette.ink === '#111111' || sketch.palette.ink === '#000000').toBe(true);
  });
});

describe('review fixes', () => {
  it('keeps valid unique ids stable across reorders (F2)', () => {
    const blocks = [
      { id: 'intro', type: 'hero', headline: 'Hola' },
      { id: 'proceso', type: 'story', title: 'Proceso', paragraphs: ['uno'] },
    ];
    const first = repairSketch({ blocks }, ctx).sketch;
    expect(first.blocks.map(b => b.id)).toEqual(expect.arrayContaining(['intro', 'proceso']));
    const reordered = repairSketch({ blocks: [blocks[1], blocks[0]] }, ctx).sketch;
    expect(reordered.blocks.find(b => b.type === 'story')!.id).toBe('proceso');
    expect(reordered.blocks.find(b => b.type === 'hero')!.id).toBe('intro');
  });
  it('caps the number of blocks (F6)', () => {
    const { sketch } = repairSketch({ blocks: Array.from({ length: 50 }, () => ({ type: 'hero', headline: 'x' })) }, ctx);
    expect(sketch.blocks.length).toBeLessThanOrEqual(22);
  });
  it('keeps only one catalog block (F8)', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'a', type: 'catalog', title: 'Uno' },
      { id: 'b', type: 'catalog', title: 'Dos' },
    ] }, ctx);
    expect(sketch.blocks.filter(b => b.type === 'catalog')).toHaveLength(1);
  });
  it('repairs ink to the best WCAG contrast, not a 0.5 luminance split (F7)', () => {
    const { sketch } = repairSketch({ palette: { paper: '#e35336', ink: '#e35336' } }, ctx);
    expect(sketch.palette.ink).toBe('#111111');
  });
});

describe('bake-lab enrichment', () => {
  it('repairs announce and split blocks and hero extras', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'a', type: 'announce', left: 'Cada galleta pesa 150g', right: 'Pide antes del domingo' },
      { id: 'h', type: 'hero', headline: 'Hola', badge: 'EL DROP SEMANAL', note: '4.9 · 2.400 pedidos', sticker: 'Recién horneado', photo: 'assets/a.jpg' },
      { id: 'sp', type: 'split', headline: 'Mezcla y combina', body: 'Elige tu caja.', cta: 'Armar caja', pills: ['6 · Bs38', '9 · Bs54'], photo: 'assets/a.jpg' },
    ] }, ctx);
    expect(sketch.blocks.map(b => b.type)).toEqual(expect.arrayContaining(['announce', 'hero', 'split']));
    const hero = sketch.blocks.find(b => b.type === 'hero') as any;
    expect(hero.badge).toBe('EL DROP SEMANAL');
    expect(hero.sticker).toBe('Recién horneado');
    const split = sketch.blocks.find(b => b.type === 'split') as any;
    expect(split.pills).toEqual(['6 · Bs38', '9 · Bs54']);
  });
});

describe('ensureAllPhotosUsed', () => {
  const many = { ...ctx, photos: ['assets/a.jpg', 'assets/b.jpg', 'assets/c.jpg'] };
  it('every provided photo ends up somewhere: hero first, the rest in a gallery', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] }, many);
    const filled = ensureAllPhotosUsed(sketch, many);
    const used = JSON.stringify(filled.blocks);
    for (const photo of many.photos) expect(used).toContain(photo);
    expect((filled.blocks.find(b => b.type === 'hero') as any).photo).toBe('assets/a.jpg');
    expect(filled.blocks.findIndex(b => b.type === 'gallery')).toBeLessThan(filled.blocks.length - 1);
  });
  it('leaves the blocks alone when all photos are already used, and lends the hero photo to the account page', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', photo: 'assets/a.jpg' },
      { id: 'g', type: 'gallery', photos: ['assets/b.jpg', 'assets/c.jpg'] },
    ] }, many);
    const placed = ensureAllPhotosUsed(sketch, many);
    expect(placed.blocks).toEqual(sketch.blocks);
    expect(placed.account.photo).toBe('assets/a.jpg');
  });
});

describe('tinted surfaces (SP1)', () => {
  it('mixHex mixes per channel and resolveBg derives soft tints near paper', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#000000');
    const { sketch } = repairSketch({}, ctx);
    const tint = resolveBg(sketch.palette, 'tint-accent');
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    // Tints stay close to paper, so the repaired page ink keeps WCAG AA contrast on them.
    expect(contrastRatio(tint, sketch.palette.ink)).toBeGreaterThanOrEqual(4.5);
    expect(resolveBg(sketch.palette, 'paper')).toBe(sketch.palette.paper);
  });
  it('accepts tint backgrounds on blocks and keeps them through repair', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola', bg: 'tint-pop' }] }, ctx);
    expect(sketch.blocks.find(b => b.type === 'hero')!.bg).toBe('tint-pop');
  });
});

describe('band rhythm (SP3)', () => {
  it('rotates the second of two adjacent same-bg sections to a tint, sparing strips and the footer', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', bg: 'paper' },
      { id: 'c', type: 'catalog', title: 'Productos', bg: 'paper' },
      { id: 'm', type: 'marquee', text: 'Fresco', bg: 'paper' },
      { id: 's', type: 'story', title: 'Historia', paragraphs: ['uno'], bg: 'paper' },
      { id: 'f', type: 'footer', tagline: 'fin', bg: 'deep' },
    ] }, ctx);
    const varied = ensureBandRhythm(sketch);
    expect(varied.blocks.find(b => b.id === 'c')!.bg).not.toBe('paper');
    expect(varied.blocks.find(b => b.id === 'm')!.bg).toBe('paper');
    expect(varied.blocks.find(b => b.id === 'f')!.bg).toBe('deep');
    // repairSketch itself never rewrites backgrounds: Boceto hand edits survive saves.
    expect(sketch.blocks.find(b => b.id === 'c')!.bg).toBe('paper');
  });
});

describe('element order and sticker position (SP4)', () => {
  it('keeps a valid reorder, completes missing keys and drops unknown ones', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola', order: ['actions', 'headline', 'hack'] }] }, ctx);
    expect((sketch.blocks.find(b => b.type === 'hero') as any).order).toEqual(['actions', 'headline', 'badge', 'sub', 'trust', 'note']);
  });
  it('omits a default-order array and clamps sticker positions into the section', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', order: ['badge', 'headline', 'sub', 'actions', 'trust', 'note'], stickerPos: { x: 140, y: -3 }, align: 'center' },
    ] }, ctx);
    const hero = sketch.blocks.find(b => b.type === 'hero') as any;
    expect(hero.order).toBeUndefined();
    expect(hero.stickerPos).toEqual({ x: 100, y: 0 });
    expect(hero.align).toBe('center');
  });
});

describe('new block fields (SP2)', () => {
  it('repairs collections, split stats and reviews rating/photos', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'co', type: 'collections', title: 'Antojos', items: [{ title: 'Chocolate', text: 'Intensos', photo: 'assets/a.jpg' }, { title: '', text: 'sin título' }] },
      { id: 'sp', type: 'split', headline: 'Hecho a mano', stats: [{ value: '150g', label: 'por galleta' }, { value: '', label: 'vacío' }], sticker: 'Ahorra 15%' },
      { id: 'r', type: 'reviews', title: 'Felices', ratingValue: '4.9 / 5', ratingSource: 'Google', handle: '@salv', quotes: [{ text: 'Rico', name: 'Ana' }], photos: ['assets/a.jpg', 'assets/nope.jpg'] },
      { id: 'ca', type: 'catalog', title: 'Productos', badges: ['NUEVO', 'CL"ÁSICO\\'], seeAll: 'VER TODO →', stripLeft: 'izq', stripRight: 'der' },
    ] }, ctx);
    const collections = sketch.blocks.find(b => b.type === 'collections') as any;
    expect(collections.items).toEqual([{ title: 'Chocolate', text: 'Intensos', photo: 'assets/a.jpg' }]);
    const split = sketch.blocks.find(b => b.type === 'split') as any;
    expect(split.stats).toEqual([{ value: '150g', label: 'por galleta' }]);
    expect(split.sticker).toBe('Ahorra 15%');
    const reviews = sketch.blocks.find(b => b.type === 'reviews') as any;
    expect(reviews.ratingValue).toBe('4.9 / 5');
    expect(reviews.photos).toEqual(['assets/a.jpg']);
    const catalog = sketch.blocks.find(b => b.type === 'catalog') as any;
    // Badge text feeds CSS content strings, so quotes and backslashes are stripped.
    expect(catalog.badges).toEqual(['NUEVO', 'CLÁSICO']);
    expect(catalog.seeAll).toBe('VER TODO →');
  });
});

it('repairs a steps block with icon names clamped to slug shape', () => {
  const { sketch } = repairSketch({ blocks: [{ id: 's', type: 'steps', title: 'Así de simple', items: [
    { icon: 'cookie', title: 'Elige', text: 'Tu antojo' },
    { icon: '<bad>', title: 'Pagamos', text: '' },
  ] }] }, ctx);
  const steps = sketch.blocks.find(b => b.type === 'steps') as any;
  expect(steps.items).toHaveLength(2);
  expect(steps.items[0].icon).toBe('cookie');
  expect(steps.items[1].icon).toBe('sparkles');
});

describe('fuller, varied sketches', () => {
  const byId = (sketch: { blocks: unknown[] }, id: string) => sketch.blocks.find(block => (block as { id: string }).id === id) as any;
  const many = { ...ctx, photos: ['assets/1.jpg', 'assets/2.jpg', 'assets/3.jpg', 'assets/4.jpg', 'assets/5.jpg', 'assets/6.jpg', 'assets/7.jpg', 'assets/8.jpg', 'assets/9.jpg', 'assets/10.jpg', 'assets/11.jpg', 'assets/12.jpg'] };

  it('strips glyphs the model typed into kickers (the design adds its own ✦)', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 's', type: 'story', kicker: '✦ ✦ ARCHIVO DE TEXTURAS', title: 't', paragraphs: [] }] }, ctx);
    expect((sketch.blocks[0] as any).kicker).toBe('ARCHIVO DE TEXTURAS');
  });

  it('repairs page style role by role and defaults the rest', () => {
    const { sketch } = repairSketch({ style: { radius: 'square', buttons: 'neon', header: 'center' }, blocks: [] }, ctx);
    expect(sketch.style).toEqual({ ...DEFAULT_SKETCH_STYLE, radius: 'square', buttons: 'pill', cards: 'bleed', header: 'center', footer: 'columns' });
  });

  it('spreads photos into real slots before any gallery, and never builds a wall', () => {
    const drawn = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'x' },
      { id: 'sp', type: 'split', headline: 'y' },
      { id: 'st', type: 'story', title: 'z', paragraphs: [] },
      { id: 'co', type: 'collections', title: 'c', items: [{ title: 'A', text: '' }, { title: 'B', text: '' }] },
      { id: 'r', type: 'reviews', title: 'r', quotes: [{ text: 'bien', name: 'Ana' }] },
      { id: 'n', type: 'newsletter', title: 'n' },
    ] }, many).sketch;
    const placed = ensureAllPhotosUsed(drawn, many);
    const by = (id: string) => placed.blocks.find(b => b.id === id) as any;
    expect(by('h').photo).toBe('assets/1.jpg');
    expect(by('sp').photo).toBe('assets/2.jpg');
    expect(by('st').photo).toBe('assets/3.jpg');
    expect(by('co').items.every((item: any) => item.photo)).toBe(true);
    expect(by('n')).toMatchObject({ photo: expect.any(String), variant: 'split' });
    expect(by('r').photos).toHaveLength(3);
    const gallery = placed.blocks.find(b => b.type === 'gallery') as any;
    expect(gallery.photos.length).toBeLessThanOrEqual(6);
  });

  it('keeps editor layout controls only where they make sense', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'x', align: 'end', flip: true, swap: true },
      { id: 'f', type: 'faq', title: 'q', items: [], align: 'center', flip: true, swap: true },
      { id: 'g', type: 'gallery', title: 'g', photos: [], align: 'sideways' },
    ] }, ctx);
    expect(byId(sketch, 'h')).toMatchObject({ align: 'end', flip: true, swap: true });
    expect(byId(sketch, 'f')).toMatchObject({ align: 'center' });
    expect(byId(sketch, 'f').flip).toBeUndefined();
    expect(byId(sketch, 'f').swap).toBeUndefined();
    expect(byId(sketch, 'g').align).toBeUndefined();
  });

  it('newsletter forms and box icons are allowlisted', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'n', type: 'newsletter', title: 'n', form: 'card' },
      { id: 'm', type: 'newsletter', title: 'm', form: '<script>' },
      { id: 's', type: 'split', headline: 's', boxes: [{ title: 'Regalos', text: 'Desde 25', icon: 'gift' }, { title: 'Eventos', icon: '../x' }] },
    ] }, ctx);
    expect((byId(sketch, 'n') as any).form).toBe('card');
    expect(byId(sketch, 'm').form).toBe('pill');
    expect(byId(sketch, 's').boxes).toEqual([{ title: 'Regalos', text: 'Desde 25', icon: 'gift' }, { title: 'Eventos', text: '' }]);
  });
});

import { carryEditorFields } from './sketch-schema';

describe('structured selection fields', () => {
  const blockOf = (raw: object) => repairSketch({ blocks: [raw] }, ctx).sketch.blocks[0] as any;
  it('keeps a valid copy order for story, newsletter and banner, omitting the default', () => {
    expect(blockOf({ id: 's', type: 'story', title: 'T', paragraphs: ['a'], order: ['paragraphs', 'title'] }).order).toEqual(['paragraphs', 'title']);
    expect(blockOf({ id: 's', type: 'story', title: 'T', paragraphs: ['a'], order: ['title', 'paragraphs'] }).order).toBeUndefined();
    expect(blockOf({ id: 'n', type: 'newsletter', title: 'T', order: ['form', 'bogus'] }).order).toEqual(['form', 'title', 'note']);
    expect(blockOf({ id: 'b', type: 'banner', headline: 'H', order: ['cta'] }).order).toEqual(['cta', 'headline']);
  });
  it('repairs layout against the block structure and drops it from blocks without groups', () => {
    expect(blockOf({ id: 'h', type: 'hero', headline: 'H', layout: { copy: { gap: 'l' }, actions: { dir: 'column' }, nope: { gap: 's' } } }).layout).toEqual({ copy: { gap: 'l' }, actions: { dir: 'column' } });
    expect(blockOf({ id: 'h', type: 'hero', headline: 'H', layout: { media: { gap: 's' } } }).layout).toBeUndefined();
    expect(blockOf({ id: 'm', type: 'marquee', text: 'x', layout: { copy: { gap: 's' } } }).layout).toBeUndefined();
  });
  it('repair is idempotent with order and layout', () => {
    const once = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', order: ['actions'], layout: { copy: { valign: 'end' } } }] }, ctx).sketch;
    expect(repairSketch(once, ctx).sketch).toEqual(once);
  });
  it('chat edits keep editor-only fields, layout included, by block id', () => {
    const current = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', align: 'center', layout: { copy: { gap: 'l' } } }] }, ctx).sketch;
    const edited = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Nuevo' }] }, ctx).sketch;
    const blocks = carryEditorFields(current, edited) as any[];
    expect(blocks[0]).toMatchObject({ headline: 'Nuevo', align: 'center', layout: { copy: { gap: 'l' } } });
  });
});

describe('review fixes (structured selection)', () => {
  it('a chat edit that changes a block type does not carry the old copy order or layout', () => {
    const current = repairSketch({ blocks: [{ id: 'b5', type: 'story', title: 'T', paragraphs: ['a'], order: ['paragraphs', 'title'], layout: { copy: { gap: 'l' } }, align: 'center' }] }, ctx).sketch;
    const edited = repairSketch({ blocks: [{ id: 'b5', type: 'newsletter', title: 'Únete', note: 'n' }] }, ctx).sketch;
    const block = carryEditorFields(current, edited)[0] as any;
    expect(block.order).toBeUndefined();
    expect(block.layout).toBeUndefined();
    expect(block.align).toBe('center');
  });
});

describe('free layer repair', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const heroOf = (extra: object) => repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', cta: 'Ver', cta2: 'Caja', photo: 'assets/a.jpg', ...extra }] }, ctx).sketch.blocks[0] as any;
  it('keeps freed parts of the block and drops the rest', () => {
    const block = heroOf({ free: { 'copy/headline': { x: 10, y: 140, w: 40, r: 8 }, copy: { x: 1, y: 1 }, 'media/photo': { x: 1, y: 1 }, 'copy/badge': { x: 1, y: 1 }, 'copy/actions/cta2': { x: 'a', y: 1 } } });
    expect(block.free).toEqual({ 'copy/headline': { x: 10, y: 100, w: 40, r: 8 } });
    expect(heroOf({ free: { copy: { x: 1, y: 1 } } }).free).toBeUndefined();
  });
  it('keeps every valid kind of inserted element and repairs or drops the rest', () => {
    const block = heroOf({ extras: [
      { id: 'eab1', kind: 'emoji', value: '🍪', x: 10, y: 10, w: 8 },
      { id: 'eab2', kind: 'text', value: 'x'.repeat(200), x: 10, y: 10 },
      { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 10, y: 10 },
      { id: 'eab4', kind: 'button', value: 'Pedir', href: 'javascript:alert(1)', x: 10, y: 10 },
      { id: 'eab5', kind: 'photo', value: 'assets/a.jpg', x: 10, y: 10, w: 22 },
      { id: 'eab6', kind: 'icon', value: 'gift', x: 10, y: 10, r: -8 },
      { id: 'eab7', kind: 'emoji', value: 'hola', x: 1, y: 1 },
      { id: 'eab8', kind: 'photo', value: 'assets/otra.jpg', x: 1, y: 1 },
      { id: 'eab9', kind: 'icon', value: '../x', x: 1, y: 1 },
      { id: 'ebad', kind: 'video', value: 'x', x: 1, y: 1 },
      { id: 'eab1', kind: 'text', value: 'mismo id', x: 1, y: 1 },
      { id: 'eabz', kind: 'text', value: 'sin posición' },
    ] });
    expect(block.extras.map((e: any) => [e.kind, e.value.length > 20 ? e.value.length : e.value, e.href])).toEqual([
      ['emoji', '🍪', undefined], ['text', 120, undefined], ['button', 'Escríbenos', 'https://wa.me/59170000000'], ['button', 'Pedir', 'checkout.html'],
      ['photo', 'assets/a.jpg', undefined], ['icon', 'gift', undefined], ['text', 'mismo id', undefined],
    ]);
    const ids = block.extras.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id: string) => /^e[a-z0-9]{3,10}$/.test(id))).toBe(true);
    expect(block.extras[5].r).toBe(-8);
  });
  it('keeps at most 12 inserted elements and is idempotent', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `e00${i.toString(36)}`, kind: 'emoji', value: '✨', x: i, y: i }));
    const block = heroOf({ extras: many, free: { 'copy/sub': { x: 1, y: 1 } } });
    expect(block.extras).toHaveLength(12);
    const once = repairSketch({ blocks: [block] }, ctx).sketch;
    expect(repairSketch(once, ctx).sketch).toEqual(once);
  });
  it('a chat edit keeps free spots and inserted elements by block id; a type change drops the spots only', () => {
    const current = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', free: { 'copy/headline': { x: 5, y: 5 } }, extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }] }] }, ctx).sketch;
    const same = carryEditorFields(current, repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Nuevo' }] }, ctx).sketch)[0] as any;
    expect(same.free).toEqual({ 'copy/headline': { x: 5, y: 5 } });
    expect(same.extras).toHaveLength(1);
    const changed = carryEditorFields(current, repairSketch({ blocks: [{ id: 'h', type: 'banner', headline: 'B' }] }, ctx).sketch)[0] as any;
    expect(changed.free).toBeUndefined();
    expect(changed.extras).toHaveLength(1);
  });
  it('a carried spot whose part the chat edit removed is dropped on the next repair', () => {
    const block = heroOf({ cta2: '', free: { 'copy/actions/cta2': { x: 1, y: 1 }, 'copy/headline': { x: 2, y: 2 } } });
    expect(block.free).toEqual({ 'copy/headline': { x: 2, y: 2 } });
  });
});

describe('review: free spots on list items follow their item', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const steps = (items: object[], free: object) => ({ id: 'st', type: 'steps', title: 'T', items, free });
  const step = (title: string, text = '') => ({ icon: 'gift', title, text });
  it('repair that drops a broken item moves the later spots with their items and drops the broken one', () => {
    const block = repairSketch({ blocks: [steps([step(''), step('Dos'), step('Tres')], { 'items/0': { x: 1, y: 1 }, 'items/2': { x: 3, y: 3 } })] }, ctx).sketch.blocks[0] as any;
    expect(block.items.map((item: any) => item.title)).toEqual(['Dos', 'Tres']);
    expect(block.free).toEqual({ 'items/1': { x: 3, y: 3 } });
  });
  it('repair moves spots inside a copy-column list too (split pills)', () => {
    const block = repairSketch({ blocks: [{ id: 'sp', type: 'split', headline: 'H', pills: [null, 'Dos', 'Tres'], free: { 'copy/pills/2': { x: 3, y: 3 } } }] }, ctx).sketch.blocks[0] as any;
    expect(block.free).toEqual({ 'copy/pills/1': { x: 3, y: 3 } });
  });
  const carry = (before: object[], after: object[], free: object) => {
    const current = repairSketch({ blocks: [steps(before, free)] }, ctx).sketch;
    const edited = repairSketch({ blocks: [steps(after, {})] }, ctx).sketch;
    return (carryEditorFields(current, edited)[0] as any).free;
  };
  it('a chat edit that removes an item keeps the others’ spots on them and drops the removed one’s', () => {
    expect(carry([step('Uno'), step('Dos'), step('Tres')], [step('Dos'), step('Tres')], { 'items/0': { x: 1, y: 1 }, 'items/2': { x: 3, y: 3 } })).toEqual({ 'items/1': { x: 3, y: 3 } });
  });
  it('an item the edit reworded keeps its spot by its title; reorders follow the items', () => {
    expect(carry([step('Uno'), step('Dos'), step('Tres')], [step('Tres', 'nuevo'), step('Dos')], { 'items/2': { x: 3, y: 3 }, 'head/title': { x: 9, y: 9 } })).toEqual({ 'items/0': { x: 3, y: 3 }, 'head/title': { x: 9, y: 9 } });
  });
  it('a same-length edit that rewrites every item keeps the spots in place; a spot with no item left goes', () => {
    expect(carry([step('Uno'), step('Dos')], [step('A'), step('B')], { 'items/1': { x: 2, y: 2 } })).toEqual({ 'items/1': { x: 2, y: 2 } });
    expect(carry([step('Uno'), step('Dos')], [step('A')], { 'items/1': { x: 2, y: 2 } })).toBeUndefined();
  });
});

describe('band width', () => {
  it('keeps a valid width and drops bleed, the default', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'a', type: 'story', title: 'Hola', width: 'narrow' },
      { id: 'b', type: 'story', title: 'Chau', width: 'bleed' },
    ] }, ctx);
    expect(sketch.blocks.find(b => b.id === 'a')).toMatchObject({ width: 'narrow' });
    expect(sketch.blocks.find(b => b.id === 'b')).not.toHaveProperty('width');
  });
  it('drops an invented width instead of failing', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'a', type: 'story', title: 'Hola', width: 'ultra-wide' }] }, ctx);
    expect(sketch.blocks.find(b => b.id === 'a')).not.toHaveProperty('width');
  });
  // Review Focus 1: every live store re-renders through repair, so a sketch that predates width must come out untouched.
  it('leaves a sketch that predates width exactly as it was', () => {
    const before = repairSketch({ blocks: [{ id: 'a', type: 'hero', headline: 'Hola' }] }, ctx).sketch;
    expect(before.blocks.every(block => !('width' in block))).toBe(true);
    expect(repairSketch(JSON.parse(JSON.stringify(before)), ctx).sketch).toEqual(before);
  });
});

describe('style the model may choose', () => {
  const drawn = { radius: 'square', buttons: 'outline', cards: 'inset', header: 'center', footer: 'center', buttonIcon: 'arrow', icons: 'circle', dividers: 'rule', badges: 'tag', fields: 'box', links: 'underline' } as const;
  it('takes a valid choice from the model', () => {
    const { sketch } = repairSketch({ style: { radius: 'soft', buttons: 'auto', cards: 'auto', header: 'auto', footer: 'auto' }, blocks: [] }, ctx, { style: drawn });
    expect(sketch.style.radius).toBe('soft');
  });
  // Review Focus 5: 'auto' must mean "keep what we had", never "reset to the global default".
  it('falls back to the given defaults for auto, invalid and missing values', () => {
    const { sketch } = repairSketch({ style: { radius: 'auto', buttons: 'banana' }, blocks: [] }, ctx, { style: drawn });
    expect(sketch.style).toEqual(drawn);
  });
  it('still falls back to the base style when no defaults are given', () => {
    const { sketch } = repairSketch({ style: { radius: 'auto' }, blocks: [] }, ctx);
    expect(sketch.style).toEqual(DEFAULT_SKETCH_STYLE);
  });
});

describe('repairSketch with a drawn structure', () => {
  const structCtx = { storeName: 'salv', purpose: 'shop' as const, photos: ['a.jpg'] };
  const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const aStructure = () => drawPageStructure({ products: 40, photos: 6, categories: 5, briefWords: 60 }, seeded(11));

  it('holds a new sketch to the structure it was drawn', () => {
    const structure = aStructure();
    const { sketch } = repairSketch({ blocks: [{ id: 'invented', type: 'marquee', text: 'x' }] }, structCtx, { structure });
    expect(sketch.blocks.map(b => b.id)).not.toContain('invented');
    expect(sketch.blocks.map(b => b.type)).toContain('catalog');
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
    expect(sketch.structure).toEqual(structure);
  });

  // A chat edit passes no structure, and its blocks must survive whole.
  it('leaves an edited sketch alone when no structure is passed', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola' },
      { id: 'm', type: 'marquee', text: 'x' },
    ] }, structCtx);
    expect(sketch.blocks.map(b => b.id)).toEqual(expect.arrayContaining(['h', 'm']));
    expect(sketch.structure).toBeUndefined();
  });

  // The field's presence on a saved sketch must not trigger enforcement; only the caller's argument does.
  it('does not enforce a structure merely because the sketch carries one', () => {
    const { sketch } = repairSketch({ structure: aStructure(), blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }, { id: 'm', type: 'marquee', text: 'x' }] }, structCtx);
    expect(sketch.blocks.map(b => b.id)).toEqual(expect.arrayContaining(['h', 'm']));
    expect(sketch.structure).toBeUndefined();
  });

  it('repairs a pre-structure sketch with no structure key at all', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] }, structCtx);
    expect('structure' in sketch).toBe(false);
  });

  it('ignores a truthy structure that has no slots array', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] }, structCtx, { structure: {} as never });
    expect(sketch.structure).toBeUndefined();
    expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
  });
});

describe('style vocabulary', () => {
  const sctx = { storeName: 's', purpose: 'shop' as const, photos: [] };

  it('offers a wider button vocabulary', () => {
    expect(SKETCH_STYLE_OPTIONS.buttons).toEqual(['pill', 'square', 'outline', 'ghost', 'underline', 'hard-shadow']);
  });

  it('offers the new component choices, each with a default', () => {
    for (const key of ['buttonIcon', 'icons', 'dividers', 'badges', 'fields', 'links'] as const) {
      expect(SKETCH_STYLE_OPTIONS[key].length).toBeGreaterThanOrEqual(3);
      expect(SKETCH_STYLE_OPTIONS[key]).toContain(DEFAULT_SKETCH_STYLE[key]);
    }
  });

  it('repairs an unknown or auto value for any key back to its default', () => {
    const { sketch } = repairSketch({ style: { buttons: 'neon', icons: 'nope', dividers: 'zigzag', fields: 'auto', links: 42 }, blocks: [] }, sctx);
    for (const key of ['buttons', 'icons', 'dividers', 'fields', 'links'] as const) expect(sketch.style[key]).toBe(DEFAULT_SKETCH_STYLE[key]);
  });

  it('keeps a valid value for a new key', () => {
    const { sketch } = repairSketch({ style: { dividers: 'notch', buttons: 'hard-shadow' }, blocks: [] }, sctx);
    expect(sketch.style.dividers).toBe('notch');
    expect(sketch.style.buttons).toBe('hard-shadow');
  });

  // A sketch saved before these keys existed must stay itself and gain defaults for the rest.
  it('fills the new keys with defaults for a sketch that predates them', () => {
    const { sketch } = repairSketch({ style: { radius: 'soft', buttons: 'pill', cards: 'inset', header: 'center', footer: 'center' }, blocks: [] }, sctx);
    expect(sketch.style).toEqual({ ...DEFAULT_SKETCH_STYLE, radius: 'soft', buttons: 'pill', cards: 'inset', header: 'center', footer: 'center' });
  });

  it('falls back to the default even when the caller passes an old five-key style as defaults', () => {
    const old = { radius: 'soft', buttons: 'square', cards: 'inset', header: 'center', footer: 'center' } as unknown as StoreSketch['style'];
    const { sketch } = repairSketch({ blocks: [] }, sctx, { style: old });
    expect(sketch.style.buttons).toBe('square');
    for (const key of ['buttonIcon', 'icons', 'dividers', 'badges', 'fields', 'links'] as const) expect(sketch.style[key]).toBe(DEFAULT_SKETCH_STYLE[key]);
  });
});
