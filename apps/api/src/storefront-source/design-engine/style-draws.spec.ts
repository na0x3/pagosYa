import { styleDraws, styleSlotDirection } from './style-draws';
import { FRAME_CATALOGUE, PALETTES, type FrameAvailable } from './frame-draw';
import { PLAYBOOK, playbookDirection } from './playbook';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
const bare: FrameAvailable = { photos: 0, products: 0, facts: false };
const base = { kind: 'cafe-food' as const, brandColours: false, category: 'cafe-food', previous: [], recent: [], available: rich, request: 'Mi cafetería' };
const boldIds = (part: 'header' | 'hero') => FRAME_CATALOGUE[part].filter(entry => entry.bold).map(entry => entry.id);

const families = PLAYBOOK['cafe-food'].families;

it('returns exactly two slots: a calm one on the least-used family, then a bold one on the other family', () => {
  const slots = styleDraws({ ...base, random: seeded(3) });
  expect(slots.map(slot => slot.mode)).toEqual(['calm', 'bold']);
  expect(slots.map(slot => slot.slot)).toEqual([0, 1]);
  expect(slots[0].family.id).not.toBe(slots[1].family.id);
  // The calm card takes the family the latest same-kind stores used least, the bold card the other one.
  for (let seed = 1; seed < 10; seed++) {
    const [calm, bold] = styleDraws({ ...base, recentFamilies: [families[0].id, families[0].id, families[1].id], random: seeded(seed) });
    expect([calm.family.id, bold.family.id]).toEqual([families[1].id, families[0].id]);
    const [calm2, bold2] = styleDraws({ ...base, recentFamilies: [families[1].id], random: seeded(seed) });
    expect([calm2.family.id, bold2.family.id]).toEqual([families[0].id, families[1].id]);
  }
});

it('keeps the calm slot on its family palettes and gives the bold slot the full colour catalogue and bold parts', () => {
  for (let seed = 1; seed < 30; seed++) {
    const [calm, bold] = styleDraws({ ...base, random: seeded(seed) });
    expect(calm.family.palettes.map(p => p.id)).toContain(calm.palette!.id);
    expect(PALETTES.map(p => p.id)).toContain(bold.palette!.id);
    expect(boldIds('header')).toContain(bold.draw.header);
    expect(boldIds('hero')).toContain(bold.draw.hero);
  }
});

it('never gives the bold card the calm card\'s hero or palette', () => {
  for (let seed = 1; seed < 40; seed++) {
    const slots = styleDraws({ ...base, random: seeded(seed) });
    expect(new Set(slots.map(slot => slot.draw.hero)).size).toBe(2);
    expect(new Set(slots.map(slot => slot.palette!.id)).size).toBe(2);
  }
});

it('avoids the hero the store itself used last time', () => {
  const previous = [{ path: 'frame-draw.json', content: JSON.stringify({ hero: 'full-bleed', header: 'stacked', cart: 'word-count', footer: 'directory' }) }];
  for (let seed = 1; seed < 20; seed++) expect(styleDraws({ ...base, previous, random: seeded(seed) }).map(slot => slot.draw.hero)).not.toContain('full-bleed');
});

it('still returns two slots, calm then bold, for a store with no photos, products or facts', () => {
  const slots = styleDraws({ ...base, available: bare, random: seeded(5) });
  expect(slots.map(slot => slot.mode)).toEqual(['calm', 'bold']);
  for (const slot of slots) expect(['type-only', 'catalog-lead', 'illustration']).toContain(slot.draw.hero);
});

it('keeps confirmed brand colours: no drawn palette on any card', () => {
  for (const slot of styleDraws({ ...base, brandColours: true, random: seeded(2) })) expect(slot.palette).toBeUndefined();
});

it('writes a slot direction that names the slot, its mode and its drawn frame', () => {
  const [calm, bold] = styleDraws({ ...base, random: seeded(9) });
  const playbook = playbookDirection(PLAYBOOK['cafe-food'], bold.family, { bold: true, palette: bold.palette, freeFonts: true });
  expect(styleSlotDirection(calm, 'PLAYBOOK: calm')).toMatch(/^CONCEPT 1 of 2 \(calm/);
  expect(styleSlotDirection(bold, playbook)).toMatch(/^CONCEPT 2 of 2 \(bold/);
  expect(styleSlotDirection(bold, playbook)).toContain(bold.paragraph);
  // A lane plans this slot alone: same frame and playbook, but its one concept is concepts[0].
  expect(styleSlotDirection(bold, playbook, { lane: true })).toMatch(/^CONCEPT 2 of 2 \(bold: [^)]*\)\. Build the one concept you return on exactly this; the other card is planned separately:/);
  expect(styleSlotDirection(bold, playbook, { lane: true })).not.toContain('concepts[1]');
  expect(styleSlotDirection(bold, playbook, { lane: true })).toContain(bold.paragraph);
  expect(playbook).toContain('fonts free from the self-hosted catalogue');
  expect(playbook).not.toContain(`${bold.family.fonts[0].display} + `);
});
