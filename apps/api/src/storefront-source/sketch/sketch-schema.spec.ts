import { repairSketch, SKETCH_BLOCK_TYPES } from './sketch-schema';

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
