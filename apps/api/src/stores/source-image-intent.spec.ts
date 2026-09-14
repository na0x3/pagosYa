import { honorImageContent, requestsImageContent } from './source-image-intent';

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
