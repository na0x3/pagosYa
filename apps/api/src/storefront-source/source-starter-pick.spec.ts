import { pickStarter, rankStarters } from './source-starter-pick';

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
