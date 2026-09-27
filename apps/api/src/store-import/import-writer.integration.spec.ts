import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import { writeImport } from './import-writer';

const harness = integrationDatabase('store_import');
harness.describeDb('writeImport (real Postgres, real migrations)', () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }
  let db: PrismaClient; let storeId: string;
  const product = (externalId: string, amount: number) => ({ externalId, name: `Producto ${externalId}`, description: 'Texto', tags: ['a'], categoryName: 'Alimento', amount, discountPercent: null, stock: null,
    shippingWeightGrams: 500, imageSources: ['https://cdn.shopify.com/a.jpg'], imageUrls: ['/v1/uploads/a.jpg'], skus: ['SKU'],
    variants: [{ name: 'S', amount, stock: null, options: [{ name: 'Talla', value: 'S' }] }, { name: 'M', amount: amount + 100, stock: null, options: [{ name: 'Talla', value: 'M' }] }], variantImageUrls: [undefined, undefined] });
  const input = (amount: number) => ({ storeId, sourceHost: 'mitienda.com', authorName: 'Mi tienda', products: [product('croquetas', amount), product('collar', 3000)],
    collections: [{ externalId: 'perros', title: 'Perros', productExternalIds: ['collar', 'croquetas'] }],
    articles: [{ externalId: 'policy:refund-policy', slug: 'politica-de-devoluciones', title: 'Política de devoluciones', excerpt: '30 días', body: '30 días' }] });

  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'Comercio', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'Tienda', slug: `t-${harness.databaseName}` } })).id;
  });
  afterAll(async () => { await harness.drop(); });

  it('creates everything once, unpublished pages, and Shopify redirects', async () => {
    const summary = await db.$transaction(tx => writeImport(tx, input(5000)));
    expect(summary).toEqual({ products: { created: 2, updated: 0 }, collections: 1, articles: 1, redirects: 3, skippedRedirects: 0 });
    const croquetas = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto croquetas' } });
    expect(croquetas).toMatchObject({ amount: 5000, currency: 'BOB', imageUrls: ['/v1/uploads/a.jpg'], shippingWeightGrams: 500 });
    expect((croquetas.variants as any[]).map(v => v.name)).toEqual(['S', 'M']);
    const collection = await db.collection.findFirstOrThrow({ where: { storeId }, include: { products: { orderBy: { sortOrder: 'asc' } } } });
    expect(collection.slug).toBe('perros');
    const collar = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto collar' } });
    expect(collection.products.map(p => p.paymentLinkId)).toEqual([collar.id, croquetas.id]);
    expect((await db.storeArticle.findFirstOrThrow({ where: { storeId } })).publishedAt).toBeNull();
    expect(await db.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: '/products/croquetas' } } })).toMatchObject({ toPath: `/p/${croquetas.id}` });
    expect(await db.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: '/collections/perros' } } })).toMatchObject({ toPath: '/c/perros' });
  });

  it('re-import updates prices without duplicating, and keeps variant ids by name', async () => {
    const before = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto croquetas' } });
    const summary = await db.$transaction(tx => writeImport(tx, input(5500)));
    expect(summary.products).toEqual({ created: 0, updated: 2 });
    expect(await db.paymentLink.count({ where: { storeId } })).toBe(2);
    expect(await db.collection.count({ where: { storeId } })).toBe(1);
    expect(await db.storeArticle.count({ where: { storeId } })).toBe(1);
    const after = await db.paymentLink.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.amount).toBe(5500);
    expect((after.variants as any[]).map(v => v.id)).toEqual((before.variants as any[]).map(v => v.id));
  });

  it('never goes past 500 redirects per store', async () => {
    await db.storeRedirect.createMany({ data: Array.from({ length: 497 }, (_, i) => ({ storeId, fromPath: `/es/viejo-${i}`, toPath: '/es/nuevo' })) });
    // 3 imported redirects already exist; the new product's would be the 501st.
    const summary = await db.$transaction(tx => writeImport(tx, { ...input(5500), products: [...input(5500).products, product('nuevo', 100)] }));
    expect(await db.storeRedirect.count({ where: { storeId } })).toBe(500);
    expect(summary.skippedRedirects).toBe(1);
  });
});
