import { NotFoundException } from '@nestjs/common';
import { PublicStoresService } from './public-stores.service';

function service(overrides: { merchant?: string; kyc?: any; cuis?: string | null; store?: any } = {}) {
  const store = overrides.store === undefined ? { id: 's1', name: 'Pliegue', slug: 'pliegue', merchantId: 'm1', createdAt: new Date('2026-07-01T10:00:00Z'), checkoutMode: 'payment', merchant: { status: overrides.merchant ?? 'ACTIVE' }, customDomains: [] } : overrides.store;
  const prisma: any = {
    store: { findFirst: jest.fn(async () => store) },
    merchantKycSubmission: { findFirst: jest.fn(async () => overrides.kyc === undefined ? { reviewedAt: new Date('2026-08-02T15:00:00Z'), legalName: 'Ana Pérez', taxId: '1234567' } : overrides.kyc) },
    merchantInvoicingProfile: { findFirst: jest.fn(async () => ({ cuis: overrides.cuis === undefined ? 'CUIS1' : overrides.cuis })) },
    storeReview: { aggregate: jest.fn(async () => ({ _count: { _all: 3 }, _avg: { rating: 4.666 } })) },
  };
  return { prisma, svc: new PublicStoresService(prisma) };
}

describe('public store verification', () => {
  it('reports verification from platform records without identifying the person behind the business', async () => {
    const { svc, prisma } = service();
    const result = await svc.verification('pliegue');
    expect(result).toEqual({ storeName: 'Pliegue', slug: 'pliegue', verifiedBusiness: true, verifiedSince: '2026-08-02', electronicInvoicing: true, securePayments: true, onPlatformSince: '2026-07-01', reviews: { count: 3, average: 4.7 }, officialDomain: null });
    expect(JSON.stringify(result)).not.toMatch(/Ana|1234567/);
    expect(prisma.store.findFirst.mock.calls[0][0].where).toMatchObject({ slug: 'pliegue', publicVisibility: true, status: 'ACTIVE', sourcePublicationPaused: false });
  });
  it('is not verified without an approved KYC or an active merchant', async () => {
    expect((await service({ kyc: null }).svc.verification('pliegue')).verifiedBusiness).toBe(false);
    const pending = await service({ merchant: 'PENDING' }).svc.verification('pliegue');
    expect(pending).toMatchObject({ verifiedBusiness: false, verifiedSince: null, securePayments: false });
  });
  it('404s for stores that are not public', async () => {
    await expect(service({ store: null }).svc.verification('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
