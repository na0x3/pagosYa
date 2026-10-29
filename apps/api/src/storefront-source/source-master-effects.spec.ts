import { effectsFor, effectVariants } from './source-master-effects';

// Owner 2026-10-27: motion effects from the merchant's words and, for an animated store, from what it sells.
describe('motion effects', () => {
  it('takes an effect the merchant names, on any store', () => {
    expect(effectsFor({ words: 'Quiero burbujas que suben en la portada', business: '', animated: false })).toEqual({ effect: 'bubbles' });
    expect(effectsFor({ words: 'con pétalos cayendo', business: '', animated: false })).toEqual({ effect: 'petals' });
    expect(effectsFor({ words: 'quita las burbujas', business: '', animated: false })).toEqual({ effect: 'none' });
    expect(effectsFor({ words: 'Una tienda sobria', business: 'Soda prebiótica', animated: false })).toEqual({});
  });
  it('gives an animated store the effect its products suggest, none otherwise, and confetti', () => {
    expect(effectsFor({ words: 'muy animada', business: 'Oh Belly\nSoda prebiótica con burbujas', animated: true })).toEqual({ effect: 'bubbles', confetti: 'on' });
    expect(effectsFor({ words: 'divertida', business: 'Antojo Café\nCafé frío y en grano', animated: true })).toEqual({ effect: 'steam', confetti: 'on' });
    expect(effectsFor({ words: 'divertida', business: 'Florería Lirio\nRamos de rosas', animated: true })).toEqual({ confetti: 'on' });
    expect(effectsFor({ words: 'atrevida', business: 'PEPPA please\nSalsas picantes', animated: true })).toEqual({ confetti: 'on' });
  });
  it('keeps only ids the template has', () => {
    expect(effectVariants({ effect: 'bubbles', confetti: 'on' }, { effect: ['none', 'bubbles'] })).toEqual({ effect: 'bubbles' });
  });
});
