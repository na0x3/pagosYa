import { drawPageStructure, violations } from './sketch-structure-draw';
import { substanceCaps } from './sketch-substance';

/** A seeded generator, so a draw is reproducible and a failure is debuggable. Mulberry32, not an LCG: the
 * LCG's first output barely moves across small seeds, which pinned every draw to a single page length. */
const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60, reviews: 4 };

it('is deterministic for a seed, and different across seeds', () => {
  const a = drawPageStructure(full, seeded(1));
  const b = drawPageStructure(full, seeded(1));
  const c = drawPageStructure(full, seeded(2));
  expect(a.slots).toEqual(b.slots);
  expect(c.slots).not.toEqual(a.slots);
});

it('gives every slot an id, a size and a width', () => {
  const { slots } = drawPageStructure(full, seeded(3));
  expect(slots.length).toBeGreaterThanOrEqual(6);
  for (const slot of slots) {
    expect(slot.id).toMatch(/^s\d+$/);
    expect(['s', 'm', 'l', 'xl']).toContain(slot.size);
    expect(['bleed', 'wide', 'narrow', 'offset-left', 'offset-right']).toContain(slot.width);
  }
  expect(new Set(slots.map(slot => slot.id)).size).toBe(slots.length);
});

it('always ends on a footer and never opens on one', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));
    expect(slots[slots.length - 1].type).toBe('footer');
    expect(slots.filter(slot => slot.type === 'footer')).toHaveLength(1);
  }
});

// Review Focus 2: nothing to sell, nothing to show.
it('draws a short page with a catalog but no collections for an empty store', () => {
  const empty = { products: 0, photos: 0, categories: 0, briefWords: 4, reviews: 0 };
  for (let seed = 1; seed <= 15; seed++) {
    const { slots } = drawPageStructure(empty, seeded(seed));
    expect(slots.length).toBeLessThanOrEqual(substanceCaps(empty).maxLength);
    // The catalog is the commerce mount: a zero-product shop keeps it so its first products have somewhere to show.
    expect(slots.filter(s => s.type === 'catalog')).toHaveLength(1);
    expect(slots.map(s => s.type)).not.toContain('collections');
    expect(violations({ slots, params: {} as never }, empty)).toEqual([]);
    expect(slots.filter(s => s.media)).toHaveLength(0);
  }
});

it('carries exactly one catalog when the store has products', () => {
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(full, seeded(seed)).slots.filter(s => s.type === 'catalog')).toHaveLength(1);
  }
});

it('never gives more media slots than the store has photos', () => {
  const thin = { products: 10, photos: 2, categories: 2, briefWords: 40, reviews: 4 };
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(thin, seeded(seed)).slots.filter(s => s.media).length).toBeLessThanOrEqual(2);
  }
});

it('enforces the grammar over many draws: no three consecutive media, no adjacent accents, announce at slot 0', () => {
  const full = { products: 40, photos: 6, categories: 5, briefWords: 60, reviews: 4 };
  const accentTypes = new Set(['announce', 'marquee', 'banner']);

  for (let seed = 1; seed <= 100; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));

    // No three consecutive slots carry media.
    for (let i = 0; i < slots.length - 2; i++) {
      expect(slots[i].media && slots[i + 1].media && slots[i + 2].media).toBe(false);
    }

    // No two adjacent slots are both accents.
    for (let i = 0; i < slots.length - 1; i++) {
      const isAccent = accentTypes.has(slots[i].type);
      const nextIsAccent = accentTypes.has(slots[i + 1].type);
      expect(isAccent && nextIsAccent).toBe(false);
    }

    // Announce, when present, is at slot 0.
    const announceSlots = slots.filter(s => s.type === 'announce');
    if (announceSlots.length > 0) {
      expect(slots[0].type).toBe('announce');
    }
  }
});

const STORES = [
  { name: 'full', s: { products: 40, photos: 6, categories: 5, briefWords: 60, reviews: 4 } },
  { name: 'empty', s: { products: 0, photos: 0, categories: 0, briefWords: 4, reviews: 0 } },
  { name: 'one-photo', s: { products: 12, photos: 1, categories: 1, briefWords: 30, reviews: 4 } },
  { name: 'service', s: { products: 0, photos: 3, categories: 0, briefWords: 40, reviews: 4 } },
];

it.each(STORES)('draws a legal page every time for a $name store', ({ s }) => {
  const broken: string[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const structure = drawPageStructure(s, seeded(seed));
    for (const problem of violations(structure, s)) broken.push(`seed ${seed}: ${problem}`);
  }
  expect(broken).toEqual([]);
});

it('reports a malformed structure instead of throwing', () => {
  expect(violations({ slots: undefined } as any, full)).not.toEqual([]);
  expect(violations({ slots: [null, 3, {}] } as any, full)).not.toEqual([]);
  expect(violations({ slots: [] } as any, full)).not.toEqual([]);
  expect(violations({ slots: [] } as any, undefined as any)).not.toEqual([]);
});

// Negative fixtures: a rule that is mistyped would let every draw pass vacuously, so each one is shown to bite.
type Slot = { id: string; type: any; size: any; width: any; media: boolean };
const legal = (): Slot[] => [
  { id: 's1', type: 'announce', size: 'm', width: 'bleed', media: false },
  { id: 's2', type: 'hero', size: 'l', width: 'wide', media: false },
  { id: 's3', type: 'catalog', size: 'm', width: 'narrow', media: false },
  { id: 's4', type: 'story', size: 'm', width: 'bleed', media: false },
  { id: 's5', type: 'newsletter', size: 'm', width: 'wide', media: false },
  { id: 's6', type: 'footer', size: 'm', width: 'narrow', media: false },
];
const check = (slots: Slot[], substance = full) => violations({ slots, params: {} } as any, substance);

it('accepts a hand-built legal structure', () => {
  expect(check(legal())).toEqual([]);
});

// A tuple's optional fourth member would be taken by jest for a done callback, so the substance is a field.
const thin = { products: 40, photos: 1, categories: 5, briefWords: 60, reviews: 4 };
it.each<[string, (s: Slot[]) => Slot[], string, { products: number; photos: number; categories: number; briefWords: number; reviews: number }]>([
  ['repeated width on neighbours', s => { s[2].width = 'wide'; return s; }, 'repeated width at 2', full],
  ['adjacent accent bands', s => { s[1].type = 'marquee'; return s; }, 'accent bands adjacent at 1', full],
  ['three consecutive media slots', s => { s[1].media = s[3].media = s[2].media = true; return s; }, 'three media slots in a row at 3', full],
  ['announce not at slot 0', s => { s[0].type = 'hero'; s[1].type = 'announce'; return s; }, 'announce is not the first slot', full],
  ['a repeated once-only type', s => { s[3].type = 'hero'; return s; }, 'repeated once-only type: hero', full],
  ['two catalogs', s => { s[3].type = 'catalog'; return s; }, 'not exactly one catalog', full],
  ['no footer last', s => { s[5].type = 'story'; return s; }, 'last slot is not a footer', full],
  ['duplicate ids', s => { s[3].id = 's2'; return s; }, 'duplicate slot ids', full],
  ['media above maxMedia', s => { s[1].media = s[3].media = true; return s; }, 'media slots exceed the photo count', thin],
  ['length below the floor', s => s.slice(1), 'length 5 outside 6..14', full],
  ['a forbidden type', s => { s[3].type = 'gallery'; return s; }, 'forbidden type present: gallery', thin],
])('flags %s', (_name, mutate, message, substance) => {
  expect(check(mutate(legal()), substance)).toContain(message);
});

// This is the test that would have caught the original defect: it fails if the generator has a favourite.
it('draws fifty structures and nearly all of them differ', () => {
  const spines = new Set<string>();
  const lengths = new Set<number>();
  const rhythms = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) {
    const { slots, params } = drawPageStructure(full, seeded(seed));
    spines.add(slots.map(slot => slot.type).join('>'));
    lengths.add(slots.length);
    rhythms.add(params.rhythm);
  }
  expect(spines.size).toBeGreaterThanOrEqual(45);
  expect(lengths.size).toBeGreaterThan(1);
  expect(rhythms.size).toBeGreaterThan(1);
});

// The exact spine the model produced for every store before this work, verbatim from the 2026-10-04 15:29 store.
const MODAL_SPINE = 'announce>hero>catalog>collections>split>steps>story>reviews>marquee>faq>banner>newsletter>footer';

it('does not keep landing on the spine the model used to produce', () => {
  let hits = 0;
  const lengths = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));
    lengths.add(slots.length);
    if (slots.map(s => s.type).join('>') === MODAL_SPINE) hits++;
  }
  // Without this the assertion below is vacuous: a 13-band spine cannot occur if every page is 8 long.
  expect(lengths.size).toBeGreaterThan(1);
  expect(hits).toBeLessThanOrEqual(1);
});

it('varies the shape of the page, not only its block list', () => {
  const shapes = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));
    shapes.add(slots.map(slot => `${slot.size}/${slot.width}`).join(' '));
  }
  expect(shapes.size).toBeGreaterThanOrEqual(45);
});
