import { NotFoundException } from '@nestjs/common';
import { PublicStoresService } from './public-stores.service';
import { StoreCheckoutService } from './store-checkout.service';
import { StoresPublicController } from './stores-public.controller';
import { StoreSeoService } from '../store-seo/store-seo.service';
import { StoreDiscoveryController, StoreSeoController } from '../store-seo/store-seo.controller';
import { CustomDomainsService } from '../domains/custom-domains.service';
import { SourcePublishingService } from '../storefront-source/source-publishing.service';
import { sourceProjectDigest, sourceProjectSnapshot } from '../storefront-source/source-project';

function setup() {
  const row: any = {
    id: 'store-1', merchantId: 'merchant-1', slug: 'nueva', name: 'Tienda nueva', status: 'ACTIVE',
    publicVisibility: false, sourcePublicationPaused: false, publishedSourceRevision: null,
    sourcePublicationVersion: 0, checkoutMode: 'payment', merchant: { status: 'ACTIVE' },
    createdAt: new Date(), updatedAt: new Date(), customDomains: [], categories: [], paymentLinks: [], _count: { paymentLinks: 1 },
  };
  // Evaluate scalar Prisma filters against the row, so missing visibility filters leak it.
  const matches = (where: any) => Object.entries(where).every(([key, value]) =>
    typeof value === 'object' || row[key] === value);
  const snapshot = sourceProjectSnapshot({ revision: 1, label: 'Primera publicación', brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files: [
    { path: 'index.html', content: '<button data-cart-open>Pedido</button><div data-pagosya-catalog></div><script src="config.js"></script><script src="commerce.js"></script>', encoding: 'utf8' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"nueva"};', encoding: 'utf8' },
    { path: 'commerce.js', content: '// commerce', encoding: 'utf8' },
    { path: 'package.json', content: '{"name":"visibility-test","scripts":{"build":"node build.mjs"}}', encoding: 'utf8' },
    { path: 'build.mjs', content: '// build', encoding: 'utf8' },
    { path: 'README.md', content: 'Proyecto de prueba', encoding: 'utf8' },
  ] });
  const prisma: any = {
    store: {
      findUnique: jest.fn(async ({ where }) => matches(where) ? row : null),
      findFirst: jest.fn(async ({ where }) => matches(where) ? row : null),
      findMany: jest.fn(async ({ where }) => matches(where) ? [row] : []),
      count: jest.fn(async ({ where }) => matches(where) ? 1 : 0),
      findUniqueOrThrow: jest.fn(async () => row),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!matches(where)) return { count: 0 };
        row.sourcePublicationVersion += data.sourcePublicationVersion.increment;
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }) => Object.assign(row, data)),
    },
    storeSourceVersion: { findUnique: jest.fn(async () => ({ snapshot, digest: sourceProjectDigest(snapshot), createdAt: row.updatedAt })) },
    storeSourceExperiment: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 0 })) },
    paymentLink: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
    category: { findMany: jest.fn(async () => []) },
    storeLink: { findMany: jest.fn(async () => []) },
    storeProductStat: { findMany: jest.fn(async () => []) },
    appointmentServiceOffering: { findMany: jest.fn(async () => []) },
    collection: { findMany: jest.fn(async () => []) },
    customDomain: { findUnique: jest.fn(async () => ({ hostname: 'nueva.example', status: 'ACTIVE', store: row })) },
  };
  prisma.$transaction = jest.fn(async (work) => {
    if (Array.isArray(work)) return Promise.all(work);
    const before = structuredClone(row);
    try { return await work(prisma); } catch (error) { Object.assign(row, before); throw error; }
  });
  const config: any = { get: () => 'https://shops.example' };
  const catalog = new PublicStoresService(prisma);
  const seo = new StoreSeoService(prisma, catalog, config);
  const checkout = new StoreCheckoutService(prisma, {} as any, {} as any, {} as any, config);
  const domains = new CustomDomainsService(prisma, config);
  const controller = new StoresPublicController({} as any, catalog, checkout, domains, {} as any);
  return { row, prisma, catalog, seo, domains, controller,
    discovery: new StoreDiscoveryController(seo), seoController: new StoreSeoController(seo),
    publishing: new SourcePublishingService(prisma) };
}

describe('First publication visibility', () => {
  it('excludes a new store from discovery and the paginated public directory', async () => {
    const { discovery, catalog } = setup();
    expect(await discovery.directory()).toEqual([]);
    expect(await catalog.listPublishedStores()).toMatchObject({ stores: [], pagination: { total: 0 } });
  });

  it.each(['document', 'sitemap', 'llms'] as const)('returns 404 for the /s/:slug SEO %s before publication', async method => {
    const { seoController } = setup();
    await expect(seoController[method]('nueva')).rejects.toMatchObject({ status: 404 });
  });

  it.each([undefined, '1'])('blocks the public catalog even with preview=%s', async preview => {
    const { controller } = setup();
    await expect(controller.getStore('nueva', preview)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps the owner catalog available and rejects a different owner', async () => {
    const { catalog } = setup();
    await expect(catalog.getStorePublic('nueva', { ownerMerchantId: 'merchant-1' })).resolves.toMatchObject({ storeId: 'store-1' });
    await expect(catalog.getStorePublic('nueva', { ownerMerchantId: 'foreign' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects public checkout creation and shipping quotes before reading products', async () => {
    const { controller, prisma } = setup();
    const cart = { items: [{ paymentLinkId: 'product-1', quantity: 1 }] };
    await expect(controller.cartCheckout('nueva', cart)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.shippingQuote('nueva', cart)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.paymentLink.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { publicVisibility: false },
    { publicVisibility: true, sourcePublicationPaused: true },
    { publicVisibility: true, status: 'ARCHIVED' },
  ])('does not resolve a domain for a non-public store: %j', async state => {
    const { row, domains } = setup(); Object.assign(row, state);
    await expect(domains.resolve('nueva.example')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not serve source assets before first publication', async () => {
    await expect(setup().publishing.publicSite('nueva')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('makes the store public across discovery, SEO, catalog and domains after successful source publication', async () => {
    const { publishing, row, discovery, catalog, seo, domains } = setup();
    const state = await publishing.publish('merchant-1', 'store-1', 1, 0);
    expect(row.publicVisibility).toBe(true);
    expect(state.active).toBe(true);
    expect(await discovery.directory()).toEqual([expect.objectContaining({ home: 'https://shops.example/s/nueva' })]);
    expect((await catalog.listPublishedStores()).pagination.total).toBe(1);
    expect((await catalog.getStorePublic('nueva', { trackView: false })).storeId).toBe('store-1');
    expect((await seo.document('nueva')).canonical).toBe('https://shops.example/s/nueva');
    expect(await seo.sitemap('nueva')).toContain('<loc>https://shops.example/s/nueva</loc>');
    expect(await seo.llms('nueva')).toContain('https://shops.example/s/nueva');
    expect(await domains.resolve('nueva.example')).toMatchObject({ slug: 'nueva' });
  });


  it('reports a never-published store as inactive and cannot expose it by toggling visibility', async () => {
    const { publishing, row, prisma } = setup();
    const { publicationState } = await import('../storefront-source/source-publishing.service');
    expect((await publicationState(prisma, row.id)).active).toBe(false);
    await expect(publishing.visibility('merchant-1', row.id, true, 0)).rejects.toThrow('Publica un diseño');
    expect(row.publicVisibility).toBe(false);
  });

  it('can resume a previously published store that was paused during migration', async () => {
    const { publishing, row, catalog } = setup();
    Object.assign(row, { publishedSourceRevision: 1, sourcePublicationPaused: true });
    await publishing.visibility('merchant-1', row.id, true, 0);
    expect(row.publicVisibility).toBe(true);
    await expect(catalog.findActiveBySlugPublic('nueva')).resolves.toMatchObject({ id: row.id });
    await publishing.visibility('merchant-1', row.id, false, 1);
    expect(row.publicVisibility).toBe(true);
    await expect(catalog.findActiveBySlugPublic('nueva')).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.getStorePublic('nueva', { ownerMerchantId: 'merchant-1' })).resolves.toMatchObject({ storeId: row.id });
  });

  it.each(['invalid revision', 'stale publication', 'running experiment'])('keeps visibility private after a rejected publish: %s', async failure => {
    const { publishing, row, prisma } = setup();
    if (failure === 'invalid revision') prisma.storeSourceVersion.findUnique.mockResolvedValueOnce(null);
    if (failure === 'stale publication') row.sourcePublicationVersion = 1;
    if (failure === 'running experiment') prisma.storeSourceExperiment.findUnique.mockResolvedValueOnce({ id: 'experiment' });
    await expect(publishing.publish('merchant-1', 'store-1', 1, 0)).rejects.toThrow();
    expect(row.publicVisibility).toBe(false);
    expect(row.publishedSourceRevision).toBeNull();
  });
});
