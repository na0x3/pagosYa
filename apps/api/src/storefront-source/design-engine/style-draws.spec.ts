import { styleDraws, styleSlotDirection } from './style-draws';
import { FRAME_CATALOGUE, PALETTES, type FrameAvailable } from './frame-draw';
import { PLAYBOOK, playbookDirection } from './playbook';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
const bare: FrameAvailable = { photos: 0, products: 0, facts: false };
const base = { kind: 'cafe-food' as const, brandColours: false, category: 'cafe-food', previous: [], recent: [], available: rich, request: 'Mi cafetería' };
const boldIds = (part: 'header' | 'hero') => FRAME_CATALOGUE[part].filter(entry => entry.bold).map(entry => entry.id);

it('returns two calm slots (one per playbook family) then two bold slots', () => {
  const slots = styleDraws({ ...base, random: seeded(3) });
  expect(slots.map(slot => slot.mode)).toEqual(['calm', 'calm', 'bold', 'bold']);
  expect(slots.map(slot => slot.slot)).toEqual([0, 1, 2, 3]);
  expect(slots[0].family.id).toBe(PLAYBOOK['cafe-food'].families[0].id);
  expect(slots[1].family.id).toBe(PLAYBOOK['cafe-food'].families[1].id);
});

it('keeps calm slots on their family palettes and gives bold slots the full colour catalogue and bold parts', () => {
  for (let seed = 1; seed < 30; seed++) {
    const slots = styleDraws({ ...base, random: seeded(seed) });
    expect(PLAYBOOK['cafe-food'].families[0].palettes.map(p => p.id)).toContain(slots[0].palette!.id);
    expect(PLAYBOOK['cafe-food'].families[1].palettes.map(p => p.id)).toContain(slots[1].palette!.id);
    for (const bold of slots.slice(2)) {
      expect(PALETTES.map(p => p.id)).toContain(bold.palette!.id);
      expect(boldIds('header')).toContain(bold.draw.header);
      expect(boldIds('hero')).toContain(bold.draw.hero);
    }
  }
});

it('never gives two cards the same hero or palette when the catalogue allows it', () => {
  for (let seed = 1; seed < 40; seed++) {
    const slots = styleDraws({ ...base, random: seeded(seed) });
    expect(new Set(slots.map(slot => slot.draw.hero)).size).toBe(4);
    expect(new Set(slots.map(slot => slot.palette!.id)).size).toBe(4);
  }
});

it('avoids the hero the store itself used last time', () => {
  const previous = [{ path: 'frame-draw.json', content: JSON.stringify({ hero: 'full-bleed', header: 'stacked', cart: 'word-count', footer: 'directory' }) }];
  for (let seed = 1; seed < 20; seed++) expect(styleDraws({ ...base, previous, random: seeded(seed) }).map(slot => slot.draw.hero)).not.toContain('full-bleed');
});

it('still returns four slots for a store with no photos, products or facts', () => {
  const slots = styleDraws({ ...base, available: bare, random: seeded(5) });
  expect(slots).toHaveLength(4);
  for (const slot of slots) expect(['type-only', 'catalog-lead', 'illustration']).toContain(slot.draw.hero);
});

it('keeps confirmed brand colours: no drawn palette on any card', () => {
  for (const slot of styleDraws({ ...base, brandColours: true, random: seeded(2) })) expect(slot.palette).toBeUndefined();
});

it('writes a slot direction that names the slot, its mode and its drawn frame', () => {
  const [calm, , bold] = styleDraws({ ...base, random: seeded(9) });
  const playbook = playbookDirection(PLAYBOOK['cafe-food'], bold.family, { bold: true, palette: bold.palette, freeFonts: true });
  expect(styleSlotDirection(calm, 'PLAYBOOK: calm')).toMatch(/^CONCEPT 1 of 4 \(calm/);
  expect(styleSlotDirection(bold, playbook)).toMatch(/^CONCEPT 3 of 4 \(bold/);
  expect(styleSlotDirection(bold, playbook)).toContain(bold.paragraph);
  expect(playbook).toContain('fonts free from the self-hosted catalogue');
  expect(playbook).not.toContain(`${bold.family.fonts[0].display} + `);
});
