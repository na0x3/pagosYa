import { rankTemplates } from './source-template-ranking';

const templates = [
  { id: 'tostado', name: 'Tostado', category: 'comida' as const, description: 'Café de especialidad con notas de sabor.', tags: ['café', 'tostador'], order: 10 },
  { id: 'miga', name: 'Miga', category: 'comida' as const, description: 'Panadería y pastelería.', tags: ['pan', 'panadería'], order: 20 },
  { id: 'huella', name: 'Huella', category: 'mascotas' as const, description: 'Todo para perros y gatos.', tags: ['perros', 'gatos'], order: 30 },
  { id: 'pixel', name: 'Pixel', category: 'tecnologia' as const, description: 'Tecnología y gadgets.', tags: ['tecnología'], order: 40 },
];

describe('rankTemplates', () => {
  it('keeps valid model suggestions first, drops unknown and repeated ids, and fills to three', () => {
    const choices = rankTemplates('Una cafetería de especialidad', templates, [
      { id: 'miga', reason: 'Pan artesanal para acompañar el café' }, { id: 'nope', reason: 'x' }, { id: 'miga', reason: 'otra vez' },
    ]);
    expect(choices.map(choice => choice.id)).toEqual(['miga', 'tostado', 'huella']);
    expect(choices[0]).toEqual({ id: 'miga', name: 'Miga', reason: 'Pan artesanal para acompañar el café' });
    expect(choices[1].reason).toBe('Café de especialidad con notas de sabor.');
  });

  it('scores by the summary words, accents folded, ties by order', () => {
    expect(rankTemplates('Vendemos juguetes y comida para PERROS y gatos', templates).map(choice => choice.id)[0]).toBe('huella');
    expect(rankTemplates('Tecnologia y cafe', templates).map(choice => choice.id).slice(0, 2)).toEqual(['tostado', 'pixel']);
  });

  it('falls back to manifest order when nothing matches, and never returns more than three', () => {
    expect(rankTemplates('zzz', templates).map(choice => choice.id)).toEqual(['tostado', 'miga', 'huella']);
    expect(rankTemplates('', templates, templates.map(t => ({ id: t.id, reason: 'r' })))).toHaveLength(3);
  });

  it('uses the description when a suggestion has a blank reason', () => {
    expect(rankTemplates('', templates, [{ id: 'pixel', reason: '  ' }])[0].reason).toBe('Tecnología y gadgets.');
  });
});
