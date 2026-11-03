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
