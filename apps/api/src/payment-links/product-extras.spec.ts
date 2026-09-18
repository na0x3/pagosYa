import { resolveSelectedExtras, selectedExtrasLabel } from './product-extras';

const flavours = (pickCount: number) => [
  { id: 'matcha', name: 'Matcha', amount: 0, required: false, groupName: 'Sabores', pickCount },
  { id: 'pistacho', name: 'Pistacho', amount: 0, required: false, groupName: 'Sabores', pickCount },
  { id: 'chips', name: 'Chocolate chips', amount: 0, required: false, groupName: 'Sabores', pickCount },
];

it('keeps one extra per pick, in the product order, when a choose-N group is filled exactly', () => {
  const picked = resolveSelectedExtras('Caja de 4', flavours(4), ['pistacho', 'matcha', 'pistacho', 'matcha']);
  expect(picked.map(extra => extra.id)).toEqual(['matcha', 'matcha', 'pistacho', 'pistacho']);
  expect(selectedExtrasLabel(picked)).toBe('Matcha ×2 + Pistacho ×2');
});

it('rejects a choose-N group with too few or too many picks', () => {
  expect(() => resolveSelectedExtras('Caja de 4', flavours(4), ['matcha', 'matcha', 'chips'])).toThrow('Elige 4 en "Sabores" para "Caja de 4" (elegiste 3)');
  expect(() => resolveSelectedExtras('Caja de 4', flavours(4), [])).toThrow('Elige 4 en "Sabores" para "Caja de 4" (elegiste 0)');
  expect(() => resolveSelectedExtras('Caja de 4', flavours(4), Array(5).fill('chips'))).toThrow('(elegiste 5)');
});

it('still allows an ordinary extra only once and keeps existing checks', () => {
  const extras = [
    { id: 'cheese', name: 'Queso', amount: 500, required: true },
    { id: 'gift', name: 'Caja regalo', amount: 300, required: false },
  ];
  expect(resolveSelectedExtras('Pizza', extras, ['gift', 'cheese']).map(extra => extra.id)).toEqual(['cheese', 'gift']);
  expect(selectedExtrasLabel(resolveSelectedExtras('Pizza', extras, ['gift', 'cheese']))).toBe('Queso + Caja regalo');
  expect(() => resolveSelectedExtras('Pizza', extras, ['cheese', 'gift', 'gift'])).toThrow('"Caja regalo" solo puede elegirse una vez en "Pizza"');
  expect(() => resolveSelectedExtras('Pizza', extras, ['removed', 'cheese'])).toThrow('Un extra de "Pizza" ya no está disponible');
  expect(() => resolveSelectedExtras('Pizza', extras, [])).toThrow('Elige "Queso" para "Pizza"');
});
