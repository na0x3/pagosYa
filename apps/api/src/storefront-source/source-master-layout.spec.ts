import { layoutChangeFor, layoutChangeNote } from './source-master-layout';

// Owner 2026-10-27 (Oh Belly edit test): plain layout asks are the template's own switches, never a design rewrite.
const mesa = { hero: ['split-left', 'poster', 'stack'], grid: ['list', 'grid3', 'strip'], closing: ['accent', 'photo', 'newsletter'], announce: ['plain', 'ticker'] };
it('reads the band, the products, the cover and the closing in the merchant\'s words', () => {
  expect(layoutChangeFor('Quita la cinta que se mueve', mesa)).toEqual({ announce: 'plain' });
  expect(layoutChangeFor('Muestra los productos en tarjetas grandes con foto, en una fila que se desliza', mesa)).toEqual({ grid: 'strip' });
  expect(layoutChangeFor('Pon la portada con la foto grande de fondo y el título encima', mesa)).toEqual({ hero: 'poster' });
  expect(layoutChangeFor('quiero los productos como una carta, en lista', mesa)).toEqual({ grid: 'list' });
  expect(layoutChangeFor('Cambia las palabras de la cinta que se mueve por: Burbujas, Prebióticos', mesa)).toEqual({});
  expect(layoutChangeFor('Cambia el color del botón a rosado', mesa)).toEqual({});
});
it('uses only what the template offers', () => {
  expect(layoutChangeFor('Pon la portada con foto de fondo', { hero: ['split-left', 'full'] })).toEqual({ hero: 'full' });
  expect(layoutChangeFor('Pon la portada con foto de fondo', { hero: ['split-left'] })).toEqual({});
  expect(layoutChangeNote({ announce: 'plain', grid: 'strip' })).toBe('quité la cinta que se mueve; los productos van en una fila que se desliza');
});

// Live check 2026-10-27: the band's new words «Burbujas sin azúcar» are not «sin cinta».
it('never reads the dictated words as an instruction', () => {
  expect(layoutChangeFor('Cambia las palabras de la cinta que se mueve por: Burbujas sin azúcar, Prebióticos', mesa)).toEqual({});
  expect(layoutChangeFor('Quiero la tienda sin la cinta', mesa)).toEqual({ announce: 'plain' });
  expect(layoutChangeFor('Pon en la portada el título "Sin azúcar, con burbujas"', mesa)).toEqual({});
});
