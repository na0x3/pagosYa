import { BRAND_SOURCE_QUESTION, brandSourceAnswer, brandSourceIntent, brandSourceTouchesLook } from './brand-source-intent';

describe('brand source intent', () => {
  it.each([
    'usa los colores y frases de mi Instagram',
    'esta es mi página anterior https://baek.bo',
    'te paso mis banners para que el sitio se parezca',
    'quiero que tenga la onda de nuestra marca',
    'son fotos de mi negocio, úsalas como inspiración',
    'this is our brand, use it',
  ])('own: %s', words => expect(brandSourceIntent(words)).toBe('own'));
  it.each([
    'quiero algo como esta tienda https://otra.com',
    'me gusta este estilo',
    'inspírate en Apple',
  ])('other: %s', words => expect(brandSourceIntent(words)).toBe('other'));
  it.each(['mira estas imágenes', 'haz el sitio con esto'])('unknown: %s', words => expect(brandSourceIntent(words)).toBe('unknown'));
  it('own wins when a message mixes own material with another site', () => {
    expect(brandSourceIntent('mis capturas de Instagram, y quiero algo como www.otra.com')).toBe('own');
  });
  it('reads the answer to YAPI\'s question', () => {
    expect(BRAND_SOURCE_QUESTION).toContain('¿Es material de tu marca');
    for (const words of ['sí', 'si, es mía', 'es de mi marca', 'son míos']) expect(brandSourceAnswer(words)).toBe('own');
    for (const words of ['solo estilo', 'no, es de otra tienda', 'solo inspiración']) expect(brandSourceAnswer(words)).toBe('other');
    expect(brandSourceAnswer('cambia el color')).toBeUndefined();
  });
  it('knows when a request is about the look', () => {
    expect(brandSourceTouchesLook('usa los colores de mi Instagram')).toBe(true);
    expect(brandSourceTouchesLook('rediseña con la onda de mi marca')).toBe(true);
    expect(brandSourceTouchesLook('pon la frase de mi Instagram en la portada')).toBe(false);
  });
});

// Final review 2026-10-16 (C1, I2): only an old site the merchant names as theirs is theirs; a «no» is never a yes.
import { brandSourceOwnSite } from './brand-source-intent';
it('names an own old site only with words that say so', () => {
  expect(brandSourceOwnSite('esta es mi página anterior')).toBe(true);
  expect(brandSourceOwnSite('mi web vieja era más bonita')).toBe(true);
  expect(brandSourceOwnSite('pon en mi sitio el link')).toBe(false);
  expect(brandSourceOwnSite('quiero que mi sitio se parezca a')).toBe(false);
  expect(brandSourceAnswer('no, no es de mi marca')).toBe('other');
});
