import { isFashionStore } from './source-master-fashion';

describe('isFashionStore', () => {
  it('trusts the read when it says fashion', () => expect(isFashionStore({ kind: 'fashion', storeName: 'Lumen' })).toBe(true));
  it('finds clothing in the store words when the read says other or is missing', () => {
    expect(isFashionStore({ kind: 'other', storeName: 'NOA VARGAS Atelier', products: ['Vestido Cala', 'Corsé Anturio'] })).toBe(true);
    expect(isFashionStore({ categories: ['Polos', 'Pantalones'] })).toBe(true);
    expect(isFashionStore({ what: 'Ropa de diseño para mujer' })).toBe(true);
    expect(isFashionStore({ products: ['Zapatos de cuero', 'Bolso tote'] })).toBe(true);
  });
  it('ignores accents and case', () => expect(isFashionStore({ products: ['SASTRERÍA A MEDIDA'] })).toBe(true));
  it('a bakery or café with «tejido», «punto» or «boutique» is not fashion', () => {
    expect(isFashionStore({ storeName: 'Boutique del Pan', products: ['Pan de punto', 'Torta'] })).toBe(false);
    expect(isFashionStore({ what: 'Café de especialidad, tejido social del barrio' })).toBe(false);
  });
  it('two weak words together are fashion', () => expect(isFashionStore({ storeName: 'Boutique Punto Fino', what: 'tejidos de alpaca' })).toBe(true));
  it('nothing to go on is not fashion', () => expect(isFashionStore({})).toBe(false));
});
