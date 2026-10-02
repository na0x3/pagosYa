import { ensureAllPhotosUsed, repairSketch, SKETCH_BLOCK_TYPES } from './sketch-schema';

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
  it('changes nothing when all photos are already used', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', photo: 'assets/a.jpg' },
      { id: 'g', type: 'gallery', photos: ['assets/b.jpg', 'assets/c.jpg'] },
    ] }, many);
    expect(ensureAllPhotosUsed(sketch, many)).toEqual(sketch);
  });
});
