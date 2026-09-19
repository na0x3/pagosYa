import { bundledPhotoPath, productPhotoReferences, rewriteProductPhotos, uploadPath } from './source-product-photos';

it('collects every photo a generated catalog names, including variant photos and operations', () => {
  const products = [{ imageUrls: ['assets/image-aaaaaaaaaaaa.jpg'], variants: [{ imageUrl: 'http://localhost:3000/v1/uploads/b.jpg' }] }];
  const operations = [{ imageUrls: null, variantOperations: [{ action: 'update', changes: { imageUrl: '/v1/uploads/c.png' } }] }];
  expect(productPhotoReferences(products, operations).sort()).toEqual(['/v1/uploads/c.png', 'assets/image-aaaaaaaaaaaa.jpg', 'http://localhost:3000/v1/uploads/b.jpg']);
  expect(productPhotoReferences(undefined, null)).toEqual([]);
});
it('rewrites only resolved references and leaves the rest for validation to reject', () => {
  const products = [{ imageUrls: ['assets/image-aaaaaaaaaaaa.jpg', 'https://elsewhere.test/x.jpg'], variants: [{ imageUrl: 'assets/image-aaaaaaaaaaaa.jpg' }] }];
  rewriteProductPhotos(products, [], new Map([['assets/image-aaaaaaaaaaaa.jpg', '/v1/uploads/a.jpg']]));
  expect(products[0]).toEqual({ imageUrls: ['/v1/uploads/a.jpg', 'https://elsewhere.test/x.jpg'], variants: [{ imageUrl: '/v1/uploads/a.jpg' }] });
});
it('names bundled photos exactly as site generation does, and canonicalises upload URLs', () => {
  expect(bundledPhotoPath(Buffer.from('cookie'), '/v1/uploads/x.JPG')).toMatch(/^assets\/image-[a-f0-9]{12}\.jpg$/);
  expect(uploadPath('http://localhost:3000/v1/uploads/abc-1.jpg')).toBe('/v1/uploads/abc-1.jpg');
  expect(uploadPath('https://elsewhere.test/photo.jpg')).toBe('https://elsewhere.test/photo.jpg');
});
