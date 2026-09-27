import { BadRequestException, ConflictException } from '@nestjs/common';
import { StoreImportService } from './store-import.service';
import * as reader from './shopify-reader';

const data = (over: any = {}) => ({ host: 'www.mitienda.com', shopDomain: 'mitienda.myshopify.com', origin: 'https://www.mitienda.com/', name: 'X', currency: 'BOB',
  products: [{ handle: 'a', title: 'A', bodyHtml: '', productType: '', tags: [], optionNames: ['Title'], variants: [{ id: '1', options: ['Default Title'], sku: null, price: '10', compareAtPrice: null, available: true, grams: 0 }], images: [] }],
  collections: [], articles: [], truncated: false, stockKnown: false, warnings: [], ...over });

function setup(opts: { previous?: any; imports?: any[]; merchant?: any; row?: any } = {}) {
  const prisma: any = {
    storeImport: {
      findFirst: jest.fn(async ({ where }: any) => where.id ? opts.row ?? null : opts.previous ?? null),
      findMany: jest.fn(async () => opts.imports ?? []),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', designTries: 0, ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => opts.row),
    },
    merchant: { findUnique: jest.fn(async () => opts.merchant ?? { importBuildUsedAt: null }) },
    $queryRaw: jest.fn(async () => []),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return { service: new StoreImportService(prisma, {} as any, {} as any, {} as any), prisma };
}

describe('Shopify import after the final review', () => {
  afterEach(() => jest.restoreAllMocks());

  // Critical #2: two different CSV files must never land in the same store.
  it('never reuses a store for a CSV import without an address', async () => {
    const { service, prisma } = setup({ previous: { storeId: 'store-a' } });
    await service.previewCsv('m', 'Handle,Title,Variant Price\nb,B,10', 'Tienda B');
    expect(prisma.storeImport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: null }) }));
  });

  // Important #8: the same Shopify store under another address goes back into the same pagosYa store.
  it('keys URL imports on the myshopify domain', async () => {
    jest.spyOn(reader, 'readShopifyStore').mockResolvedValue(data() as any);
    const { service, prisma } = setup({ previous: { storeId: 'store-a' } });
    await service.previewUrl('m', 'www.mitienda.com');
    expect(prisma.storeImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ merchantId: 'm', sourceHost: 'mitienda.myshopify.com' }) }));
    expect(prisma.storeImport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceHost: 'mitienda.myshopify.com', storeId: 'store-a' }) }));
  });

  // Important #3: nothing importable must not become an empty store.
  it('refuses to confirm an import with no importable products', async () => {
    const { service } = setup({ row: { id: 'i', merchantId: 'm', status: 'REVIEW', designTries: 0, preview: { needsExchangeRate: false, products: [{ externalId: 'a', problem: 'A: no tiene precio.' }] } } });
    await expect(service.confirm('m', 'i', {})).rejects.toThrow('No hay productos para importar');
  });

  // Important #4: one free build per merchant, counted across every import, reserved under a lock.
  it('counts failed free builds across all of the merchant\'s imports and allows one at a time', async () => {
    const row = { id: 'i', merchantId: 'm', status: 'COMPLETED', storeId: 's', designTries: 0, designStatus: null };
    const tried = setup({ row, imports: [{ designTries: 1, designStatus: 'FAILED' }, { designTries: 1, designStatus: 'FAILED' }] });
    await expect(tried.service.requestDesign('m', 'i', 'same')).rejects.toBeInstanceOf(ConflictException);
    const busy = setup({ row, imports: [{ designTries: 0, designStatus: 'RUNNING' }] });
    await expect(busy.service.requestDesign('m', 'i', 'same')).rejects.toBeInstanceOf(ConflictException);
    const ok = setup({ row, imports: [{ designTries: 1, designStatus: 'FAILED' }] });
    await ok.service.requestDesign('m', 'i', 'same');
    expect(ok.prisma.$queryRaw).toHaveBeenCalled();
  });

  it('does not accept "same as my Shopify" for a CSV import, which has no store to look at', async () => {
    const { service } = setup({ row: { id: 'i', merchantId: 'm', status: 'COMPLETED', storeId: 's', source: 'SHOPIFY_CSV', designTries: 0, designStatus: null } });
    await expect(service.requestDesign('m', 'i', 'same')).rejects.toBeInstanceOf(BadRequestException);
  });

  // Important #5: a build interrupted by a restart must not stay "diseñando" forever.
  it('expires a design build that has been running for more than 15 minutes, without spending a try', async () => {
    const { service, prisma } = setup();
    await service.claimDesign();
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { designStatus: 'RUNNING', updatedAt: { lt: expect.any(Date) } }, data: { designStatus: 'FAILED', designError: expect.stringContaining('se interrumpió') } });
  });

  // Important #7: the dialog can resume after a reload or on another device.
  it('returns the merchant\'s latest confirmed import', async () => {
    const { service, prisma } = setup({ previous: { id: 'i', merchantId: 'm', status: 'RUNNING', designTries: 0, data: {}, photos: {} } });
    const view: any = await service.latest('m');
    expect(prisma.storeImport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ merchantId: 'm', status: { not: 'REVIEW' } }) }));
    expect(view).toMatchObject({ id: 'i', status: 'RUNNING' }); expect(view).not.toHaveProperty('data');
  });
});
