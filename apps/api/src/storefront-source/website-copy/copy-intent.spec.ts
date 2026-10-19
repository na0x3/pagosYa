import { websiteCopyAsked, websiteCopyWording } from './copy-intent';

describe('websiteCopyAsked (spec 2026-10-18 website copy)', () => {
  it.each([
    'copia esta estructura https://otra.com',
    'hazme la web como esta https://otra.com',
    'quiero mi tienda igual a esta https://otra.com',
    'clona esta página https://otra.com',
    'quiero la misma estructura que https://otra.com',
    'arma mi tienda como esta página https://otra.com',
    'copy this site https://otra.com',
    'rediseña mi tienda copiando la estructura de https://otra.com',
  ])('copies: %s', words => expect(websiteCopyAsked(words)).toBe(true));
  it.each([
    'inspírate en https://otra.com',
    'algo parecido a https://otra.com',
    'quiero algo como esta tienda pero inspírate solo en los colores https://otra.com',
    'quiero vender esta licuadora https://blendjet.com/products/x',
    'cambia el color del botón',
  ])('does not copy: %s', words => expect(websiteCopyAsked(words)).toBe(false));
});

describe('websiteCopyWording', () => {
  it('tells a named copy from wording that could be inspiration', () => {
    expect(websiteCopyWording('copia esta estructura https://otra.com')).toBe('strong');
    expect(websiteCopyWording('hazme la web como esta https://otra.com')).toBe('plain');
    expect(websiteCopyWording('inspírate en https://otra.com')).toBeNull();
  });
});
