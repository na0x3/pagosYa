import { contractMisses, craftFacts, detectKind, pickFamily, playbookDirection, PLAYBOOK, CONVENTIONAL_HEADERS } from './playbook';
import { SOURCE_FONT_IDS } from '../source-font-catalog';
import { DESIGN_CATALOGUE, FRAME_CATALOGUE } from './frame-draw';

const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

it('has nine entries with valid families, fonts, buttons and readable palettes', () => {
  expect(Object.keys(PLAYBOOK).sort()).toEqual(['bakery-sweets', 'beauty', 'cafe-food', 'clothing', 'crafts-home', 'fitness-wellness', 'flowers-gifts', 'general', 'services']);
  const buttons = DESIGN_CATALOGUE.button.map(entry => entry.id);
  for (const entry of Object.values(PLAYBOOK)) {
    expect(entry.families.length).toBeGreaterThanOrEqual(2);
    expect(entry.sections.length).toBeGreaterThanOrEqual(3);
    for (const family of entry.families) {
      for (const pair of family.fonts) { expect(SOURCE_FONT_IDS).toContain(pair.display); expect(SOURCE_FONT_IDS).toContain(pair.text); }
      for (const button of family.buttons) expect(buttons).toContain(button);
      for (const palette of family.palettes) expect([family.id, palette.id, contrast(palette.ink, palette.paper) >= 4.5]).toEqual([family.id, palette.id, true]);
    }
  }
  expect(PLAYBOOK.services.profile).toBe('story');
  expect(PLAYBOOK['cafe-food'].profile).toBe('shop');
  for (const id of CONVENTIONAL_HEADERS) expect(FRAME_CATALOGUE.header.map(entry => entry.id)).toContain(id);
});

it('detects the kind of business from the merchant words, deterministically', () => {
  expect(detectKind('Tostadero Yungas: tostamos café de especialidad')).toBe('cafe-food');
  expect(detectKind('Somos un estudio contable para pymes')).toBe('services');
  expect(detectKind('Florería en Sopocachi, arreglos y regalos')).toBe('flowers-gifts');
  expect(detectKind('Estudio de pilates reformer')).toBe('fitness-wellness');
  expect(detectKind('Vendemos poleras y vestidos')).toBe('clothing');
  expect(detectKind('Hacemos tortas y pan de masa madre')).toBe('bakery-sweets');
  expect(detectKind('Café y panadería del barrio')).toBe(detectKind('Café y panadería del barrio'));
  expect(detectKind('Vendemos repuestos de motos')).toBe('general');
});

it('picks a family, avoiding the ones recent stores of the same kind got', () => {
  const entry = PLAYBOOK['cafe-food'];
  for (let seed = 1; seed < 30; seed++) expect(pickFamily(entry, seeded(seed), [entry.families[0].id]).id).toBe(entry.families[1].id);
  expect(pickFamily(PLAYBOOK.general, seeded(3), []).id).toBeTruthy();
});

it('writes the playbook paragraph with the contract, the profile and the family values', () => {
  const entry = PLAYBOOK.services, family = entry.families[0];
  const text = playbookDirection(entry, family);
  expect(text.startsWith('PLAYBOOK:')).toBe(true);
  for (const section of entry.sections) expect(text).toContain(section.must);
  expect(text).toMatch(/h1 56-96px/);
  expect(text).toContain(family.palettes[0].paper);
  expect(text).toMatch(/legal row/i);
});

it('reports missing contract sections, counting other words for the same thing', () => {
  const cafe = PLAYBOOK['cafe-food'];
  expect(contractMisses(cafe, 'Nuestra historia: café de especialidad desde 2015. Abrimos de lunes a sábado 9:00 a 18:00. Calle Sagárnaga 215. Envíos y retiro.')).toEqual([]);
  expect(contractMisses(cafe, 'Nuestra historia. Calle Sagárnaga 215. Envíos.')).toContain('horario');
});

it('flags type sizes outside the profile, never a page inside it', () => {
  expect(craftFacts('shop', 1280, 140, 15).join(' ')).toMatch(/título principal/);
  expect(craftFacts('shop', 1280, 40, 15)).toEqual([]);
  expect(craftFacts('story', 1280, 80, 18)).toEqual([]);
  expect(craftFacts('story', 1280, 80, 11).join(' ')).toMatch(/texto/);
  expect(craftFacts('shop', 390, 44, 15)).toEqual([]);
});
