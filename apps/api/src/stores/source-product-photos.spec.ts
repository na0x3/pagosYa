import { authoredUploadReferences, bundledPhotoPath, productPhotoReferences, rewriteAuthoredUploads, rewriteProductPhotos, uploadPath } from './source-product-photos';

it('finds upload URLs written straight into authored pages and rewrites them to bundled paths', () => {
  const files = [
    { path: 'components/home.tsx', content: "const boxPhoto = '/v1/uploads/987f0ee4-7008.jpg';\n<img src={boxPhoto} /><img src=\"http://localhost:3001/v1/uploads/aa11.png\" />" },
    { path: 'styles/globals.css', content: '.hero{background:url(/v1/uploads/987f0ee4-7008.jpg)}' },
    { path: 'assets/image-aaaaaaaaaaaa.jpg', content: 'bytes', encoding: 'base64' as const },
  ];
  expect(authoredUploadReferences(files).sort()).toEqual(['/v1/uploads/987f0ee4-7008.jpg', 'http://localhost:3001/v1/uploads/aa11.png']);
  rewriteAuthoredUploads(files, new Map([['/v1/uploads/987f0ee4-7008.jpg', '/assets/image-bbbbbbbbbbbb.jpg']]));
  expect(files[0].content).toContain("'/assets/image-bbbbbbbbbbbb.jpg'");
  expect(files[0].content).toContain('http://localhost:3001/v1/uploads/aa11.png');
  expect(files[1].content).toBe('.hero{background:url(/assets/image-bbbbbbbbbbbb.jpg)}');
});

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
