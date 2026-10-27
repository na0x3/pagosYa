import { animatedVariants, asksForAnimatedStore } from './source-master-animated';

// Owner 2026-10-27 (PEPPA please): the merchant's words ask for a lively store; «nada animada» does not.
it('reads an animated-store request in the merchant\'s words', () => {
  expect(asksForAnimatedStore('Quiero una tienda muy animada')).toBe(true);
  expect(asksForAnimatedStore('algo divertido y con movimiento')).toBe(true);
  expect(asksForAnimatedStore('Una tienda dinámica')).toBe(true);
  expect(asksForAnimatedStore('Una tienda calmada y sobria')).toBe(false);
  expect(asksForAnimatedStore('nada animada, por favor')).toBe(false);
  expect(asksForAnimatedStore('sin movimiento')).toBe(false);
});

it('gives the lively parts the template has, and the fading hero only with two photos or more', () => {
  const catalogue = { announce: ['plain', 'ticker'], bands: ['blocks', 'calm'], card: ['plain', 'hover2'], heroFade: ['still', 'fade'] };
  expect(animatedVariants(3, catalogue)).toEqual({ announce: 'ticker', bands: 'blocks', card: 'hover2', heroFade: 'fade' });
  expect(animatedVariants(1, catalogue)).toEqual({ announce: 'ticker', bands: 'blocks', card: 'hover2' });
  expect(animatedVariants(3, { announce: ['plain'] })).toEqual({});
});
