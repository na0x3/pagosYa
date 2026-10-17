import { sourceWebsiteReferenceUrls } from './source-website-reference';

// Spec 2026-10-16 brand source: a merchant's own old site is inspected even without «como»/«estilo» words.
it('inspects a link the merchant calls their own old site', () => {
  expect(sourceWebsiteReferenceUrls('esta es mi página anterior https://baek-old.bo, usa sus colores')).toEqual(['https://baek-old.bo']);
  expect(sourceWebsiteReferenceUrls('mi instagram https://instagram.com/baek')).toEqual([]);
  expect(sourceWebsiteReferenceUrls('pon este link en el pie https://baek.bo')).toEqual([]);
});

it('never inspects a link the merchant only wants placed on the site, or another company\'s site described with «mi sitio»', () => {
  expect(sourceWebsiteReferenceUrls('pon en mi sitio el link https://pedidos.x.bo')).toEqual([]);
});
