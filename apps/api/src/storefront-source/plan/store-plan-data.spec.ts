import { catalogFacts, otherFingerprints } from './store-plan-data';

it('counts colours, sizes, photos and categories from the live catalog', async () => {
  const prisma: any = { paymentLink: { findMany: jest.fn().mockResolvedValue([
    { name: 'Polo Andes', imageUrls: ['/a.jpg', '/b.jpg'], categoryId: 'c1', variants: [{ name: 'Rojo / M', options: [{ name: 'Color', value: 'Rojo' }, { name: 'Talla', value: 'M' }], imageUrls: ['/r.jpg'] }, { name: 'Azul / M', options: [{ name: 'Color', value: 'Azul' }], imageUrls: ['/z.jpg'] }] },
    { name: 'Gorra', imageUrls: ['/c.jpg'], categoryId: 'c1', variants: [{ name: 'Negro', options: [{ name: 'Colour', value: 'Negro' }] }] },
    { name: 'Taza', imageUrls: [], categoryId: null, variants: [] },
  ]) } };
  expect(await catalogFacts(prisma, 's1')).toEqual({ productNames: ['Polo Andes', 'Gorra', 'Taza'], productCount: 3, photoCount: 3, categorySizes: [2], colourProducts: 2, colourPhotoProducts: 1, sizeProducts: 1 });
});

it('reads every other Esencial store from its current store-data, skipping broken rows', async () => {
  const data = [`export const variants = ${JSON.stringify({ hero: 'type', grid: 'grid3', sections: ['faq'] })};`, `export const look = ${JSON.stringify({ palette: 'linen', fonts: 'serif', colors: { accent: '#ff0000' } })};`].join('\n');
  const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ data }, { data: null }]) };
  expect(await otherFingerprints(prisma, 's1')).toEqual([{ variants: { hero: 'type', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', accentHue: 0 }]);
});
