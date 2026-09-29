import { PublicStoresService } from './public-stores.service';

const storeRow: any = {
  id: 'store-1', slug: 'cafe', name: 'Café', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false,
  publishedSourceRevision: null, bundlesEnabled: false, subscriptionsEnabled: false,
};

const productRow: any = {
  id: 'p0', categoryId: null, fulfillmentType: 'PHYSICAL', name: 'Producto', description: null,
  imageUrls: [], imagePositions: null, tags: [], specifications: null, highlights: null,
  recommendedProductIds: [], stock: null, color: null, variants: null, extras: null,
  amount: 1000, currency: 'BOB', discountPercent: null, discountStartsAt: null, discountEndsAt: null,
  subscriptionOptions: [],
};

function setup() {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(storeRow), findFirst: jest.fn().mockResolvedValue(storeRow) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeLink: { findMany: jest.fn().mockResolvedValue([]) },
    storeProductStat: { findMany: jest.fn().mockResolvedValue([]) },
    appointmentServiceOffering: { findMany: jest.fn().mockResolvedValue([]) },
    collection: { findMany: jest.fn().mockResolvedValue([]) },
    storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new PublicStoresService(prisma) };
}

describe('subscription offers', () => {
  it('publishes offers only when the store switch is on and never for digital items', async () => {
    const { service, prisma } = setup();
    prisma.store.findUnique.mockResolvedValue({ ...storeRow, subscriptionsEnabled: true });
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: 'p1', subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] },
      { ...productRow, id: 'p2', fulfillmentType: 'DIGITAL', subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 5 }] },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(true);
    expect(result.items.find((item: { id: string }) => item.id === 'p1')!.subscriptionOptions).toEqual([{ cadence: 'MONTHLY', discountPercent: 10 }]);
    expect(result.items.find((item: { id: string }) => item.id === 'p2')!.subscriptionOptions).toEqual([]);
  });

  it('hides every offer while the switch is off', async () => {
    const { service, prisma } = setup();
    prisma.store.findUnique.mockResolvedValue({ ...storeRow, subscriptionsEnabled: false });
    prisma.paymentLink.findMany.mockResolvedValue([{ ...productRow, id: 'p1', subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] }]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(false);
    expect(result.items[0].subscriptionOptions).toEqual([]);
  });
});
