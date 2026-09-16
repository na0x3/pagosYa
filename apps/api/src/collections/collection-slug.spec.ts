import { collectionSlug } from './collection-slug';

describe('collectionSlug', () => {
  it('slugifies Spanish names', () => {
    expect(collectionSlug('Verano', new Set())).toBe('verano');
    expect(collectionSlug('Más vendidos', new Set())).toBe('mas-vendidos');
    expect(collectionSlug('  Ropa   de Niño ', new Set())).toBe('ropa-de-nino');
  });

  it('suffixes when the slug is taken', () => {
    expect(collectionSlug('Verano', new Set(['verano']))).toBe('verano-2');
    expect(collectionSlug('Verano', new Set(['verano', 'verano-2']))).toBe('verano-3');
  });

  it('falls back when the name has no slug characters', () => {
    expect(collectionSlug('!!!', new Set())).toBe('coleccion');
    expect(collectionSlug('!!!', new Set(['coleccion']))).toBe('coleccion-2');
  });

  it('bounds the slug length', () => {
    expect(collectionSlug('a'.repeat(120), new Set())).toHaveLength(60);
  });
});
