import { animatedFontFor, animatedVariants, asksForAnimatedStore, asksForCalmStore, isTreatBusiness, namesAnimatedLook } from './source-master-animated';

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

it('an animated store takes the chunky outline when the template has it; the dice never roll it', () => {
  expect(animatedVariants(2, { outline: ['none', 'chunky'] })).toEqual({ outline: 'chunky' });
});

// Owner 2026-10-27 (Remolino «alegre y con movimiento» came out animated): a first build asks for the look by name.
it('a first build turns animated only on the word itself', () => {
  expect(namesAnimatedLook('Quiero una tienda animada')).toBe(true);
  expect(namesAnimatedLook('con un estilo animado')).toBe(true);
  expect(namesAnimatedLook('Quiero una tienda alegre y con movimiento')).toBe(false);
  expect(namesAnimatedLook('dinámica y divertida')).toBe(false);
  expect(namesAnimatedLook('nada animada')).toBe(false);
});

// Owner 2026-10-27 («for bakeries, candy… warm decoration, chunky, really animated»): sweets are animated by default.
it('knows a bakery or sweets business, and the words that keep a store calm', () => {
  expect(isTreatBusiness('BAEK Korean Bakehouse — panadería coreana, croissants')).toBe(true);
  expect(isTreatBusiness('Dulce Horno: galletas y tortas')).toBe(true);
  expect(isTreatBusiness('Golosinas y chocolates para regalar')).toBe(true);
  expect(isTreatBusiness('Licuadoras para batidos')).toBe(false);
  expect(asksForCalmStore('quiero una tienda sobria y elegante')).toBe(true);
  expect(asksForCalmStore('alegre y con color')).toBe(false);
});

// Owner 2026-10-27: two animated stores do not share one font by rule.
it('picks a playful font by store, among the ones the template has', () => {
  const seen = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(seed => animatedFontFor(seed, ['alegre', 'poster', 'soft', 'condensed', 'classic'])));
  expect(seen.size).toBeGreaterThan(1);
  expect(animatedFontFor('s1', ['classic'])).toBeUndefined();
});
