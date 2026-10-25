import { listTemplates } from '@pagosya/store-templates';
import { buildStarters, pickStarter, rankStarters } from './source-starter-pick';

/** Spec 2026-10-24 §2: the starter closest to the business, chosen in code before the fill. */
const starters = [
  { id: 'esencial', fits: ['tienda', 'productos', 'general'], order: 99 },
  { id: 'vitrina', fits: ['postres', 'dulces', 'regalos', 'alegre'], order: 1 },
  { id: 'taller', fits: ['moda', 'ropa', 'diseño', 'lujo', 'minimal'], fashion: true, order: 3 },
  { id: 'calle', fits: ['ropa', 'streetwear', 'poleras'], fashion: true, order: 2 },
  { id: 'mesa', fits: ['café', 'comida', 'panadería'], order: 4 },
];

describe('pickStarter', () => {
  it('fit words choose the starter', () => expect(pickStarter({ text: 'Vendemos tortas y postres para regalar', fashion: false, starters, recent: [] })).toBe('vitrina'));
  it('accents and case do not matter', () => expect(pickStarter({ text: 'CAFE de especialidad', fashion: false, starters, recent: [] })).toBe('mesa'));
  it('a fashion store always gets a fashion starter', () => expect(['taller', 'calle']).toContain(pickStarter({ text: 'Tienda de tortas', fashion: true, starters, recent: [] })));
  it('look words pull toward the matching starter', () => expect(pickStarter({ text: 'ropa minimalista y de lujo', fashion: true, starters, recent: [] })).toBe('taller'));
  it("the merchant's last stores are not repeated when another fits", () => expect(pickStarter({ text: 'ropa poleras streetwear moda', fashion: true, starters, recent: ['calle'] })).toBe('taller'));
  it('nothing fits → esencial', () => expect(pickStarter({ text: 'repuestos de motor', fashion: false, starters, recent: [] })).toBe('esencial'));
  it('same words, same starter', () => { const input = { text: 'dulces y café', fashion: false, starters, recent: [] }; expect(rankStarters(input)).toEqual(rankStarters(input)); });
  it('a fit word inside a longer word does not count', () => expect(pickStarter({ text: 'cafetería de barrio', fashion: false, starters, recent: [] })).toBe('esencial'));
});

// Esencial is hidden from the gallery, so listStarters leaves it out; without it, a business nothing fits got vitrina.
it('the real starter list has Esencial as a master fallback, the harvested starters by kind, and no presets', () => {
  const starters = buildStarters();
  const kinds = Object.fromEntries(starters.map(starter => [starter.id, starter.kind]));
  expect(kinds).toMatchObject({ esencial: 'master', vitrina: 'master', calle: 'master', taller: 'master' });
  const presets = listTemplates().filter(manifest => manifest.preset && !manifest.starter).map(manifest => manifest.id);
  expect(presets.length).toBeGreaterThan(0);
  expect(starters.filter(starter => presets.includes(starter.id))).toEqual([]);
  expect(pickStarter({ text: 'repuestos de motor', fashion: false, starters, recent: [] })).toBe('esencial');
});

it('a store that does not sell clothes never starts from a fashion starter, even with look words', () => {
  const starters = [{ id: 'esencial', fits: ['tienda'], order: 99 }, { id: 'vitrina', fits: ['dulces'], order: 1 }, { id: 'calle', fits: ['ropa', 'minimal'], fashion: true, order: 2 }];
  expect(rankStarters({ text: 'joyería minimalista de lujo', fashion: false, starters, recent: [] })).not.toContain('calle');
});
