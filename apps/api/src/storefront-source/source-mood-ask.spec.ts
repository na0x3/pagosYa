import { readMoodAsk } from './source-mood-ask';

describe('mood asks on a one-product store (spec 2026-11-03)', () => {
  it.each([
    ['hazla más tranquila', 'calm'], ['quiero algo más sobrio, menos colores', 'calm'], ['más seria por favor', 'calm'],
    ['hazla más colorida', 'colourful'], ['más divertida y con más colores', 'colourful'], ['dale más color', 'colourful'],
  ])('%s → %s', (text, mood) => expect(readMoodAsk(text)).toBe(mood));
  it('ignores other edits', () => {
    expect(readMoodAsk('cambia el color del botón a azul')).toBeNull();
    expect(readMoodAsk('pon la foto del sofá gris')).toBeNull();
  });
});

describe('mood asks never take over other edits (review 2026-11-03)', () => {
  it.each(['pon un título más divertido', 'un texto más serio en la portada', 'dale más color al botón', 'prueba otra plantilla más colorida',
    'hazla más colorida y cambia el precio a 3000'])('%s → not a mood switch', text => expect(readMoodAsk(text)).toBeNull());
});
