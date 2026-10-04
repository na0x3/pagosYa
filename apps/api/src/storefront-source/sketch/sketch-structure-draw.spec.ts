import { drawPageStructure } from './sketch-structure-draw';
import { substanceCaps } from './sketch-substance';

/** A seeded generator, so a draw is reproducible and a failure is debuggable. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };

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
it('draws a short page with no commerce bands for an empty store', () => {
  const empty = { products: 0, photos: 0, categories: 0, briefWords: 4 };
  for (let seed = 1; seed <= 15; seed++) {
    const { slots } = drawPageStructure(empty, seeded(seed));
    expect(slots.length).toBeLessThanOrEqual(substanceCaps(empty).maxLength);
    expect(slots.map(s => s.type)).not.toContain('catalog');
    expect(slots.map(s => s.type)).not.toContain('collections');
    expect(slots.filter(s => s.media)).toHaveLength(0);
  }
});

it('carries exactly one catalog when the store has products', () => {
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(full, seeded(seed)).slots.filter(s => s.type === 'catalog')).toHaveLength(1);
  }
});

it('never gives more media slots than the store has photos', () => {
  const thin = { products: 10, photos: 2, categories: 2, briefWords: 40 };
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(thin, seeded(seed)).slots.filter(s => s.media).length).toBeLessThanOrEqual(2);
  }
});

it('enforces the grammar over many draws: no three consecutive media, no adjacent accents, announce at slot 0', () => {
  const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
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
