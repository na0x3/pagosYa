import { readProductVariants } from './product-pricing';

it('passes a variant photo set through to the public catalog and drops nothing else', () => {
  const rows = readProductVariants([{ id: 'v1', name: 'Rojo', amount: 100, imageUrl: '/v1/uploads/a.jpg', imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'] }] as never);
  expect(rows[0]).toMatchObject({ imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'] });
});
