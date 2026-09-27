import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreImportService } from './store-import.service';

const row = (over: any = {}) => ({ id: 'imp', merchantId: 'm', storeId: null, source: 'SHOPIFY_URL', sourceHost: 'x.com', status: 'REVIEW', exchangeRateMilli: null, excluded: [], photos: {}, progress: {}, summary: null, error: null, attempts: 0, leaseToken: null, leaseUntil: null, designOption: null, designStatus: null, designTries: 0, designRevision: null, designError: null,
  data: { host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'USD', products: [], collections: [], articles: [], truncated: false, stockKnown: false, warnings: [] },
  preview: { needsExchangeRate: true, products: [{ externalId: 'a' }] }, ...over });

function setup(found: any = row()) {
  const prisma: any = {
    storeImport: { findFirst: jest.fn(async () => found), create: jest.fn(async ({ data }) => ({ ...row(), ...data })), updateMany: jest.fn(async () => ({ count: 1 })) },
    merchant: { findUnique: jest.fn(async () => ({ importBuildUsedAt: null })) },
  };
  const service = new StoreImportService(prisma, { create: jest.fn() } as any, { saveBuffer: jest.fn() } as any);
  return { service, prisma };
}

describe('StoreImportService', () => {
  it('only shows an import to its merchant', async () => {
    const { service, prisma } = setup(null);
    await expect(service.get('other', 'imp')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.storeImport.findFirst).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'other' } });
  });

  it('never exposes the raw data, photo map or lease in the view', async () => {
    const view: any = await setup().service.get('m', 'imp');
    expect(view).not.toHaveProperty('data'); expect(view).not.toHaveProperty('photos'); expect(view).not.toHaveProperty('leaseToken');
    expect(view.freeBuildAvailable).toBe(true);
  });

  it('refuses to confirm a foreign-currency store without an exchange rate', async () => {
    await expect(setup().service.confirm('m', 'imp', {})).rejects.toThrow('tipo de cambio');
  });

  it('queues a confirmed import with the rate in thousandths and only known unchecked products', async () => {
    const { service, prisma } = setup();
    await service.confirm('m', 'imp', { exchangeRate: 6.96, excluded: ['a', 'zzz'] });
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'm', status: 'REVIEW' }, data: { status: 'QUEUED', exchangeRateMilli: 6960, excluded: ['a'] } });
  });

  it('only retries a failed import', async () => {
    await expect(setup(row({ status: 'COMPLETED' })).service.retry('m', 'imp')).rejects.toBeInstanceOf(BadRequestException);
  });
});
