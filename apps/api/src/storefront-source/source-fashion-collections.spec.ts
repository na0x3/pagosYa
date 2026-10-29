import { fashionCollections } from './source-fashion-collections';

describe('fashionCollections', () => {
  it('groups a clothing store into Mujer, Hombre and Niños from the products\' own words', () => {
    const groups = fashionCollections([
      { id: 'a', name: 'Vestido midi para mujer', category: 'Ropa' },
      { id: 'b', name: 'Botines de cuero', description: 'Botín para dama', category: 'Zapatos' },
      { id: 'c', name: 'Camisa Oxford hombre', category: 'Ropa' },
      { id: 'd', name: 'Polera básica unisex', category: 'Ropa' },
      { id: 'e', name: 'Zapatillas para niños', category: 'Zapatos' },
      { id: 'f', name: 'Cinturón de cuero', category: 'Accesorios' },
    ]);
    expect(groups).toEqual([
      { name: 'Mujer', productIds: ['a', 'b', 'd'] },
      { name: 'Hombre', productIds: ['c', 'd'] },
      { name: 'Niños', productIds: ['e'] },
    ]);
  });

  it('makes no collections when the products name only one group or none', () => {
    expect(fashionCollections([{ id: 'a', name: 'Vestido de mujer' }, { id: 'b', name: 'Blusa de dama' }])).toEqual([]);
    expect(fashionCollections([{ id: 'a', name: 'Abrigo de lana' }, { id: 'b', name: 'Blazer negro' }])).toEqual([]);
  });

  it('does not read «manta» or «hombrera» as a group', () => {
    expect(fashionCollections([{ id: 'a', name: 'Manta tejida' }, { id: 'b', name: 'Saco con hombreras' }])).toEqual([]);
  });
});
