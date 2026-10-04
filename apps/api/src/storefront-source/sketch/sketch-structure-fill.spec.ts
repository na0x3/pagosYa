import { fillStructure } from './sketch-structure-fill';
import { drawPageStructure, ACCENT, ONCE_ONLY, type PageStructure } from './sketch-structure-draw';
import type { SketchBlock } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['a.jpg'] };
// mulberry32, not a bare LCG: an LCG's first output is linear in the seed, so every seed drew the same page length.
const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
const structure = () => drawPageStructure(full, seeded(7));
/** A response block: it names the slot it fills. */
const filled = (id: string, type: SketchBlock['type']) => ({ id, type } as SketchBlock);
const answering = (s: PageStructure) => s.slots.map(slot => filled(slot.id, slot.type));

describe('fillStructure', () => {
  it('keeps a block that fills a real slot, in the slot order', () => {
    const s = structure();
    const { blocks } = fillStructure([...answering(s)].reverse(), s, ctx);
    expect(blocks.map(block => block.id)).toEqual(s.slots.map(slot => slot.id));
  });

  // This is what stops the model appending its habitual spine.
  it('drops a block whose id matches no slot', () => {
    const s = structure();
    const { blocks, notes } = fillStructure([...answering(s), filled('invented', 'marquee'), filled('also-invented', 'faq')], s, ctx);
    expect(blocks).toHaveLength(s.slots.length);
    expect(notes.join(' ')).toMatch(/no estaban en la estructura/);
  });

  it('treats a slot nobody filled as a veto and closes the page up', () => {
    const s = structure();
    const skipped = s.slots.find(slot => !['catalog', 'footer'].includes(slot.type))!;
    const { blocks, notes } = fillStructure(answering(s).filter(block => block.id !== skipped.id), s, ctx);
    expect(blocks.map(block => block.id)).not.toContain(skipped.id);
    expect(blocks).toHaveLength(s.slots.length - 1);
    expect(notes.join(' ')).toMatch(/quitaron/);
  });

  it('refuses to let the catalog or the footer be vetoed', () => {
    const s = structure();
    const { blocks } = fillStructure(answering(s).filter(block => !['catalog', 'footer'].includes(block.type)), s, ctx);
    expect(blocks.map(block => block.type)).toContain('catalog');
    expect(blocks[blocks.length - 1].type).toBe('footer');
  });

  it('stops the model vetoing its way back to a short habitual page', () => {
    const s = structure();
    const { blocks, notes } = fillStructure([], s, ctx);
    expect(blocks.length).toBeGreaterThanOrEqual(s.slots.length - Math.floor(s.slots.length / 3));
    expect(notes.join(' ')).toMatch(/demasiad/i);
  });

  it('still produces a catalog and a footer from an empty response', () => {
    const s = structure();
    const { blocks } = fillStructure([], s, ctx);
    expect(blocks.map(block => block.type)).toContain('catalog');
    expect(blocks[blocks.length - 1].type).toBe('footer');
  });

  it('repairs an adjacency that a veto created', () => {
    const slot = (id: string, type: SketchBlock['type']) => ({ id, type, size: 'm' as const, width: 'bleed' as const, media: false });
    const s = { params: {} as never, slots: [slot('s1', 'marquee'), slot('s2', 'story'), slot('s3', 'banner'), slot('s4', 'catalog'), slot('s5', 'footer')] };
    const { blocks } = fillStructure([filled('s1', 'marquee'), filled('s3', 'banner'), filled('s4', 'catalog'), filled('s5', 'footer')], s, ctx);
    const types = blocks.map(block => block.type);
    for (let i = 1; i < types.length; i++) expect(ACCENT.includes(types[i]) && ACCENT.includes(types[i - 1])).toBe(false);
  });

  // A default for a slot must be of the slot's own type, or an empty hero slot would put a second hero on the page.
  it('fills an empty slot with a block of the slot type, so once-only types stay once', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = drawPageStructure(full, seeded(seed));
      const { blocks } = fillStructure([], s, ctx);
      for (const type of ONCE_ONLY) expect(blocks.filter(block => block.type === type).length).toBeLessThanOrEqual(1);
    }
  });

  it('replaces a block of the wrong type for its slot, and says so', () => {
    const s = structure();
    const slot = s.slots.find(candidate => candidate.type === 'story' || candidate.type === 'hero')!;
    const wrong = answering(s).map(block => (block.id === slot.id ? filled(slot.id, 'faq') : block));
    const { blocks, notes } = fillStructure(wrong, s, ctx);
    expect(blocks.find(block => block.id === slot.id)?.type).toBe(slot.type);
    expect(notes.join(' ')).toMatch(/tipo/);
  });

  it('is total on garbage', () => {
    const s = structure();
    for (const bad of [undefined, null, 'x', 42, [null, 7, 'a', {}, { id: 3 }, { id: 's1', type: 'nope' }], {}]) {
      expect(() => fillStructure(bad as never, s, ctx)).not.toThrow();
    }
    for (const badStructure of [undefined, null, {}, { slots: 'no' }, { slots: [null, 3] }]) {
      expect(() => fillStructure([], badStructure as never, ctx)).not.toThrow();
    }
  });
});
