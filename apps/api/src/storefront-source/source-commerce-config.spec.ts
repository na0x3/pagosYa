import { commerceConfig } from './source-commerce-config';

describe('commerceConfig', () => {
  const draw = { account: 'split', checkout: 'brand', fields: 'filled', cartSurface: 'sheet', added: 'ribbon' } as const;
  const dna = { cart: 'sheet', added: 'ribbon', review: 'split', checkout: 'brand', fields: 'filled' };
  it('a fresh draw sets the account layout with the first store photo, the brand checkout photo and the word', () => {
    expect(commerceConfig({ commerce: { draw, fresh: true, cartWord: 'Tu caja' }, photos: ['assets/a.jpg', 'assets/b.jpg'] }))
      .toEqual({ dna, accountTheme: { layout: 'split', photo: 'assets/a.jpg' }, checkoutPhoto: 'assets/a.jpg', cartWord: 'Tu caja' });
  });
  it('without photos: split has no media and brand has no photo', () => {
    expect(commerceConfig({ commerce: { draw, fresh: true }, photos: [] })).toEqual({ dna, accountTheme: { layout: 'split' } });
  });
  it('a kept draw never sets an account theme (the store\'s saved one carries over)', () => {
    expect(commerceConfig({ commerce: { draw, fresh: false }, photos: ['assets/a.jpg'] }).accountTheme).toBeUndefined();
  });
  it('a non-split account never takes the photo', () => {
    expect(commerceConfig({ commerce: { draw: { ...draw, account: 'panel' }, fresh: true }, photos: ['assets/a.jpg'] }).accountTheme).toEqual({ layout: 'panel' });
  });
  it('nothing without a commerce draw', () => {
    expect(commerceConfig({ commerce: undefined, photos: ['assets/a.jpg'] })).toEqual({ dna: {} });
  });
});
