import { isFashionStore } from './source-master-fashion';
import { sourceDesignSchema } from './source-design';
import { SOURCE_MODEL_PRODUCT_PAGE_STYLES } from './source-dna';

describe('isFashionStore', () => {
  it('trusts the read when it says fashion', () => expect(isFashionStore({ kind: 'fashion', storeName: 'Lumen' })).toBe(true));
  it('finds clothing in the store words when the read says other or is missing', () => {
    expect(isFashionStore({ kind: 'other', storeName: 'NOA VARGAS Atelier', products: ['Vestido Cala', 'Corsé Anturio'] })).toBe(true);
    expect(isFashionStore({ categories: ['Polos', 'Pantalones'] })).toBe(true);
    expect(isFashionStore({ what: 'Ropa de diseño para mujer' })).toBe(true);
    expect(isFashionStore({ products: ['Zapatos de cuero', 'Bolso tote'] })).toBe(true);
  });
  it('hoodie and sweatshirt stores are fashion (BOXY demo, 2026-10-21)', () => {
    for (const word of ['Hoodie Boxy Esencial', 'Sudadera oversize', 'Polerón gris', 'Buzo de algodón', 'Sweatshirt crema', 'Joggers negros']) expect(isFashionStore({ products: [word] })).toBe(true);
    expect(isFashionStore({ what: 'Hoodies de corte boxy' })).toBe(true);
  });
  it('ignores accents and case', () => expect(isFashionStore({ products: ['SASTRERÍA A MEDIDA'] })).toBe(true));
  it('a bakery or café with «tejido», «punto» or «boutique» is not fashion', () => {
    expect(isFashionStore({ storeName: 'Boutique del Pan', products: ['Pan de punto', 'Torta'] })).toBe(false);
    expect(isFashionStore({ what: 'Café de especialidad, tejido social del barrio' })).toBe(false);
  });
  it('two weak words together are fashion', () => expect(isFashionStore({ storeName: 'Boutique Punto Fino', what: 'tejidos de alpaca' })).toBe(true));
  it('nothing to go on is not fashion', () => expect(isFashionStore({})).toBe(false));
  it('food and craft stores with a clothing-sounding word are not fashion when the read says other (review probes)', () => {
    expect(isFashionStore({ kind: 'other', storeName: 'Atelier Dulce', what: 'Pastelería artesanal y tortas' })).toBe(false);
    expect(isFashionStore({ kind: 'other', storeName: 'Heladería Sol', products: ['Polos de fruta'] })).toBe(false);
    expect(isFashionStore({ kind: 'other', storeName: 'Café Altura', what: 'El sabor de moda en La Paz' })).toBe(false);
    expect(isFashionStore({ kind: 'other', storeName: 'Atelier Cerámica', products: ['Taza', 'Plato'] })).toBe(false);
    expect(isFashionStore({ kind: 'other', storeName: 'Florería Lis', products: ['Ramo para novias', 'Accesorios florales'] })).toBe(false);
  });
  it('Bolivian knitwear words are fashion', () => expect(isFashionStore({ storeName: 'Wari', products: ['Chompa de alpaca', 'Gorro', 'Bufanda'] })).toBe(true));
});

it('YAPI-coded stores are never offered the fashion page by the design and sketch schemas', () => {
  expect(SOURCE_MODEL_PRODUCT_PAGE_STYLES).not.toContain('fashion');
  expect(JSON.stringify(sourceDesignSchema)).not.toContain('"fashion"');
});
