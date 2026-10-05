import { fillStructure } from './sketch-structure-fill';
import { drawPageStructure, ACCENT, ONCE_ONLY, type PageStructure } from './sketch-structure-draw';
import type { SketchBlock } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['a.jpg'] };
// mulberry32, not a bare LCG: an LCG's first output is linear in the seed, so every seed drew the same page length.
const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60, reviews: 4 };
const structure = () => drawPageStructure(full, seeded(7));
/** A response block: it names the slot it fills. */
const CONTENT: Partial<Record<SketchBlock['type'], object>> = {
  steps: { items: [{ icon: 'x', title: 't', text: '' }] }, faq: { items: [{ q: 'q', a: 'a' }] }, collections: { items: [{ title: 't', text: '' }] },
  gallery: { photos: ['a.jpg'] }, reviews: { quotes: [{ text: 't', name: 'n', place: '' }] }, story: { paragraphs: ['p'] }, announce: { left: 'hola', right: '' },
};
/** A block of the slot's type carrying content, as repairSketch would leave a well-formed one. */
const filled = (id: string, type: SketchBlock['type']) => ({ id, type, ...CONTENT[type] } as SketchBlock);
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

  // The catalog is the commerce mount, so it is unvetoable and the empty-band drop (which only touches list-bearing
  // bands) must never take it, however short the zero-product page is.
  it('a zero-product page keeps its catalog and footer through the veto, the empty drop and the floor', () => {
    const empty = { products: 0, photos: 0, categories: 0, briefWords: 4, reviews: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const s = drawPageStructure(empty, seeded(seed));
      expect(s.slots.filter(slot => slot.type === 'catalog')).toHaveLength(1);
      for (const response of [[], answering(s).filter(block => block.type !== 'catalog' && block.type !== 'footer')]) {
        const { blocks } = fillStructure(response, s, ctx);
        const types = blocks.map(block => block.type);
        expect(types.filter(type => type === 'catalog')).toHaveLength(1);
        expect(types[types.length - 1]).toBe('footer');
      }
    }
  });

  it('stops the model vetoing its way back to a short habitual page', () => {
    // Bands with no list to be empty, so the cap is what is under test (an unanswered list band is dropped regardless).
    const types: SketchBlock['type'][] = ['hero', 'banner', 'split', 'marquee', 'newsletter', 'catalog', 'footer'];
    const s = { params: {} as never, slots: types.map((type, i) => ({ id: `s${i + 1}`, type, size: 'm' as const, width: (i % 2 ? 'wide' : 'bleed') as 'wide' | 'bleed', media: false })) };
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

  it('makes the slot own the size and width of a block the model shaped differently', () => {
    const s = structure();
    const response = s.slots.map(slot => ({ ...filled(slot.id, slot.type), size: slot.size === 's' ? 'xl' : 's', width: slot.width === 'narrow' ? 'wide' : 'narrow' } as SketchBlock));
    const { blocks } = fillStructure(response, s, ctx);
    blocks.forEach((block, i) => {
      expect(block.size).toBe(s.slots[i].size);
      if (s.slots[i].width === 'bleed') expect('width' in block).toBe(false);
      else expect(block.width).toBe(s.slots[i].width);
    });
  });

  it('strips the photo from a block whose slot carries no media', () => {
    const slot = (id: string, type: SketchBlock['type'], media: boolean) => ({ id, type, size: 'm' as const, width: 'bleed' as const, media });
    const s = { params: {} as never, slots: [slot('s1', 'hero', false), slot('s2', 'catalog', false), slot('s3', 'footer', false)] };
    const { blocks } = fillStructure([{ ...filled('s1', 'hero'), photo: 'a.jpg' } as SketchBlock, filled('s2', 'catalog'), filled('s3', 'footer')], s, ctx);
    expect('photo' in blocks[0]).toBe(false);
  });

  describe('a slot with no media carries no photo anywhere in its block', () => {
    const slot = (id: string, type: SketchBlock['type'], media: boolean, width: PageStructure['slots'][number]['width']) => ({ id, type, size: 'm' as const, width, media });
    const run = (type: SketchBlock['type'], block: object, media: boolean) => {
      const s = { params: {} as never, slots: [slot('s1', 'hero', true, 'bleed'), slot('s2', type, media, 'wide'), slot('s3', 'catalog', false, 'bleed'), slot('s4', 'footer', false, 'wide')] };
      return fillStructure([{ ...filled('s1', 'hero'), photo: 'a.jpg' } as SketchBlock, { id: 's2', type, ...block } as SketchBlock, filled('s3', 'catalog'), filled('s4', 'footer')], s, ctx).blocks;
    };
    it('gallery photos', () => {
      // Without media a gallery has nothing left to show, so it is dropped rather than kept as a heading.
      expect(run('gallery', { photos: ['a.jpg', 'b.jpg'] }, false).map(b => b.id)).not.toContain('s2');
      expect((run('gallery', { photos: ['a.jpg', 'b.jpg'] }, true).find(b => b.id === 's2') as any).photos).toEqual(['a.jpg', 'b.jpg']);
    });
    it('reviews photos, keeping the quotes', () => {
      const block = run('reviews', { quotes: [{ text: 't', name: 'n', place: '' }], photos: ['a.jpg'] }, false).find(b => b.id === 's2') as any;
      expect(block.photos).toEqual([]);
      expect(block.quotes).toHaveLength(1);
    });
    it('collections card photos, keeping the cards', () => {
      const block = run('collections', { items: [{ title: 't', text: '', photo: 'a.jpg' }] }, false).find(b => b.id === 's2') as any;
      expect(block.items).toHaveLength(1);
      expect('photo' in block.items[0]).toBe(false);
      expect((run('collections', { items: [{ title: 't', text: '', photo: 'a.jpg' }] }, true).find(b => b.id === 's2') as any).items[0].photo).toBe('a.jpg');
    });
    it('the single photo of split, story and newsletter', () => {
      for (const type of ['split', 'story', 'newsletter'] as const) {
        const block = run(type, { ...CONTENT[type], photo: 'a.jpg' }, false).find(b => b.id === 's2') as any;
        expect([type, 'photo' in block]).toEqual([type, false]);
      }
    });
  });

  it('leaves no two adjacent kept bands of one width on pages that had vetoes and drops', () => {
    let reshaped = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const s = drawPageStructure(full, seeded(seed));
      // Leave a varying subset unfilled, so some slots are honoured vetoes and some become dropped stand-ins.
      const response = s.slots.filter((_, i) => (i * 7 + seed) % 3 !== 0).map(slot => ({ ...filled(slot.id, slot.type), width: 'wide' } as SketchBlock));
      const { blocks } = fillStructure(response, s, ctx);
      if (blocks.length < s.slots.length) reshaped++;
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].width ?? 'bleed').not.toBe(blocks[i - 1].width ?? 'bleed');
    }
    expect(reshaped).toBeGreaterThan(0);
  });

  it('re-picks a width instead of dropping a band when a veto makes neighbours collide', () => {
    const slot = (id: string, type: SketchBlock['type'], width: PageStructure['slots'][number]['width']) => ({ id, type, size: 'm' as const, width, media: false });
    const s = { params: {} as never, slots: [slot('s1', 'hero', 'wide'), slot('s2', 'story', 'narrow'), slot('s3', 'split', 'wide'), slot('s4', 'catalog', 'bleed'), slot('s5', 'footer', 'narrow')] };
    const { blocks } = fillStructure([filled('s1', 'hero'), filled('s3', 'split'), filled('s4', 'catalog'), filled('s5', 'footer')], s, ctx);
    expect(blocks.map(block => block.id)).toEqual(['s1', 's3', 's4', 's5']);
    expect(blocks[1].width ?? 'bleed').not.toBe(blocks[0].width ?? 'bleed');
  });

  describe('empty list-bearing bands', () => {
    const slot = (id: string, type: SketchBlock['type'], width: PageStructure['slots'][number]['width']) => ({ id, type, size: 'm' as const, width, media: false });
    const W = ['bleed', 'wide'] as const;
    const build = (types: SketchBlock['type'][]) => ({ params: {} as never, slots: types.map((type, i) => slot(`s${i + 1}`, type, W[i % 2])) });

    it('drops a band that would be a heading over nothing', () => {
      const s = build(['hero', 'split', 'steps', 'collections', 'banner', 'story', 'faq', 'catalog', 'newsletter', 'reviews', 'gallery', 'footer']);
      const keep = ['hero', 'split', 'banner', 'catalog', 'newsletter', 'footer'];
      const { blocks, notes } = fillStructure(s.slots.filter(sl => keep.includes(sl.type)).map(sl => filled(sl.id, sl.type)), s, ctx);
      const types = blocks.map(block => block.type);
      for (const empty of ['reviews', 'gallery', 'faq', 'steps']) expect(types).not.toContain(empty);
      expect(notes.join(' ')).toMatch(/sin contenido/);
    });

    // The floor protects a veto no longer: an UNANSWERED list band is the same empty shell as an answered-empty
    // one. The veto allowance (a third of the page) still caps how many bands the model may decline outright.
    it('drops an unanswered list band at the floor too, so the page is five bands rather than a padded six', () => {
      const s = build(['hero', 'split', 'steps', 'catalog', 'newsletter', 'footer']);
      const keep = ['hero', 'split', 'catalog', 'newsletter', 'footer'];
      const { blocks, notes } = fillStructure(s.slots.filter(sl => keep.includes(sl.type)).map(sl => filled(sl.id, sl.type)), s, ctx);
      expect(blocks.map(block => block.type)).not.toContain('steps');
      expect(blocks).toHaveLength(5);
      expect(notes.join(' ')).toMatch(/sin contenido|no se llenó/);
    });

    it('drops the unanswered list bands that exceed the veto allowance instead of padding them with shells', () => {
      const s = build(['hero', 'steps', 'faq', 'reviews', 'catalog', 'newsletter', 'footer']);
      const keep = ['hero', 'catalog', 'newsletter', 'footer'];
      const { blocks, notes } = fillStructure(s.slots.filter(sl => keep.includes(sl.type)).map(sl => filled(sl.id, sl.type)), s, ctx);
      expect(blocks.map(block => block.type)).toEqual(['hero', 'catalog', 'newsletter', 'footer']);
      expect(notes.join(' ')).toMatch(/no se llenó y no tiene contenido/);
    });

    it('still fills in a vetoed band that has no list to be empty, rather than deleting it', () => {
      const s = build(['hero', 'split', 'story', 'banner', 'catalog', 'footer']);
      const keep = ['hero', 'story', 'banner', 'catalog', 'footer'];
      const { blocks } = fillStructure(s.slots.filter(sl => keep.includes(sl.type)).map(sl => filled(sl.id, sl.type)), s, ctx);
      expect(blocks.map(block => block.type)).toContain('story');
      expect(blocks).toHaveLength(5);
    });
  });

  describe('a block whose items repair discarded', () => {
    const slot = (id: string, type: SketchBlock['type'], width: PageStructure['slots'][number]['width']) => ({ id, type, size: 'm' as const, width, media: false });
    const W = ['bleed', 'wide'] as const;
    const build = (types: SketchBlock['type'][]) => ({ params: {} as never, slots: types.map((type, i) => slot(`s${i + 1}`, type, W[i % 2])) });
    // What repairSketch leaves behind when every item was malformed: the band is present and its list is empty.
    const emptied: Array<[SketchBlock['type'], object]> = [
      ['faq', { items: [] }], ['reviews', { quotes: [] }], ['gallery', { photos: [] }], ['steps', { items: [] }],
      ['collections', { items: [] }], ['story', { paragraphs: [] }], ['announce', { left: '', right: '' }],
    ];

    for (const [type, empty] of emptied) {
      it(`drops an emptied ${type} band instead of showing a heading over nothing`, () => {
        const s = build(type === 'announce' ? ['announce', 'hero', 'split', 'banner', 'catalog', 'newsletter', 'footer'] : ['hero', 'split', type, 'banner', 'catalog', 'newsletter', 'footer']);
        const response = s.slots.map(sl => (sl.type === type ? ({ id: sl.id, type, ...empty } as SketchBlock) : filled(sl.id, sl.type)));
        const { blocks, notes } = fillStructure(response, s, ctx);
        expect(blocks.map(block => block.type)).not.toContain(type);
        expect(blocks).toHaveLength(6);
        expect(notes.join(' ')).toMatch(/sin contenido/);
      });
    }

    it('drops an emptied band even when that takes the page under six, because it was answered and came back unusable', () => {
      const s = build(['hero', 'split', 'faq', 'catalog', 'newsletter', 'footer']);
      const response = s.slots.map(sl => (sl.type === 'faq' ? ({ id: sl.id, type: 'faq', items: [] } as unknown as SketchBlock) : filled(sl.id, sl.type)));
      const { blocks } = fillStructure(response, s, ctx);
      expect(blocks.map(block => block.type)).not.toContain('faq');
      expect(blocks).toHaveLength(5);
    });

    it('keeps a band that still has content', () => {
      const s = build(['hero', 'split', 'faq', 'banner', 'catalog', 'newsletter', 'footer']);
      const { blocks } = fillStructure(answering(s), s, ctx);
      expect(blocks.map(block => block.type)).toContain('faq');
    });
  });
});
