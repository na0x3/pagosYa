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
  const product = (externalId: string, amount: number) => ({ externalId, name: `Producto ${externalId}`, description: 'Texto', tags: ['a'], categoryName: 'Alimento', amount, onSale: false, descriptionTruncated: false, stock: null,
    shippingWeightGrams: 500, imageSources: ['https://cdn.shopify.com/a.jpg'], imageUrls: ['/v1/uploads/a.jpg'], skus: ['SKU'],
    variants: [{ name: 'S', amount, stock: null, options: [{ name: 'Talla', value: 'S' }] }, { name: 'M', amount: amount + 100, stock: null, options: [{ name: 'Talla', value: 'M' }] }], variantImageUrls: [undefined, undefined] });
  const input = (amount: number, stockKnown = false) => ({ storeId, sourceHost: 'mitienda.com', authorName: 'Mi tienda', stockKnown, products: [product('croquetas', amount), product('collar', 3000)],
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

  // Final review, Important #1 and Critical #1: a re-import updates prices and photos only. Stock, the merchant's own
  // name, and a discount they scheduled in pagosYa survive; stock changes only when the source knows it (the CSV).
  it('re-import keeps the merchant edits, their scheduled discount and their stock unless the CSV says otherwise', async () => {
    const product = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto croquetas' } });
    const starts = new Date('2026-10-01T00:00:00Z'), ends = new Date('2026-10-31T00:00:00Z');
    const edited = (product.variants as any[]).map(v => ({ ...v, stock: 7 }));
    await db.paymentLink.update({ where: { id: product.id }, data: { name: 'Croquetas del comercio', description: 'Mi texto', discountPercent: 10, discountStartsAt: starts, discountEndsAt: ends, variants: edited, stock: 14 } });
    await db.$transaction(tx => writeImport(tx, input(6000)));
    const afterUrl = await db.paymentLink.findUniqueOrThrow({ where: { id: product.id } });
    expect(afterUrl).toMatchObject({ name: 'Croquetas del comercio', description: 'Mi texto', amount: 6000, discountPercent: 10, discountStartsAt: starts, discountEndsAt: ends, stock: 14 });
    expect((afterUrl.variants as any[]).map(v => v.stock)).toEqual([7, 7]);
    await db.$transaction(tx => writeImport(tx, { ...input(6000, true), products: input(6000, true).products.map(p => ({ ...p, variants: p.variants.map(v => ({ ...v, stock: 3 })) })) }));
    const afterCsv = await db.paymentLink.findUniqueOrThrow({ where: { id: product.id } });
    expect((afterCsv.variants as any[]).map(v => v.stock)).toEqual([3, 3]);
    expect(afterCsv.stock).toBe(6);
  });

  it('never goes past 500 redirects per store', async () => {
    await db.storeRedirect.createMany({ data: Array.from({ length: 497 }, (_, i) => ({ storeId, fromPath: `/es/viejo-${i}`, toPath: '/es/nuevo' })) });
    // 3 imported redirects already exist; the new product's would be the 501st.
    const summary = await db.$transaction(tx => writeImport(tx, { ...input(5500), products: [...input(5500).products, product('nuevo', 100)] }));
    expect(await db.storeRedirect.count({ where: { storeId } })).toBe(500);
    expect(summary.skippedRedirects).toBe(1);
  });
});
