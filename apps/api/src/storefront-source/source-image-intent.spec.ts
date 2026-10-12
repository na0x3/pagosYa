import { honorImageContent, requestsImageContent, unusedPhotoDiagnostic } from './source-image-intent';

const photo = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
it.each(['use these pictures', 'include my photos', 'usa estas imágenes', 'quiero lujo juvenil, use these pictures'])('honors content intent: %s', instruction => {
  expect(honorImageContent(instruction, [photo], [{url:photo,role:'reference',description:'Campaign reference'}])).toEqual([expect.objectContaining({url:photo,role:'business'})]);
});
it.each(['use these pictures as references', 'usa estas imágenes como inspiración', 'do not use these pictures', 'no uses estas fotos', 'what do you think of these pictures?'])('preserves references/negations/questions: %s', instruction => {
  expect(requestsImageContent(instruction)).toBe(false);
});
it('keeps product roles and unrelated reference images intact', () => {
  const other = '/v1/uploads/old.jpg';
  expect(honorImageContent('use these pictures', [photo], [{url:photo,role:'product',description:'Confirmed shirt'}, {url:other,role:'reference',description:'Earlier reference'}])).toEqual([{url:photo,role:'product',description:'Confirmed shirt'}, {url:other,role:'reference',description:'Earlier reference'}]);
});
it('recognizes creation with supplied images as content authorization', () => {
  expect(requestsImageContent('créame un sitio con estas imágenes')).toBe(true);
  expect(requestsImageContent('crea una tienda con estas imágenes de referencia')).toBe(false);
});

it.each(['Usa estas 4 fotos: el pistacho es la foto del Vasito', 'usa estas dos fotos en la portada', 'use these 3 photos', 'crea mi tienda con estas 4 fotos'])('honors a request that counts its photos: %s', instruction => {
  expect(requestsImageContent(instruction)).toBe(true);
});
it('still declines a counted reference', () => {
  expect(requestsImageContent('usa estas 4 fotos como referencia')).toBe(false);
});
it('names each unused photo, its role and where a product photo goes', () => {
  const note = unusedPhotoDiagnostic(['assets/image-14614d93e843.webp'], [{ original: photo, path: 'assets/image-14614d93e843.webp' }], [{ url: photo, role: 'product', description: 'Pote de tumbo' }]);
  expect(note).toContain(`${photo} (assets/image-14614d93e843.webp), product: Pote de tumbo`);
  expect(note).toContain('productOperations[].changes.imageUrls');
});
