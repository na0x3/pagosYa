import { CommerceContentService } from './commerce-content.service';

describe('CommerceContentService.reviews', () => {
  it('returns a bounded cursor page and store-wide status counts', async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      id: `review_${index}`,
      productId: 'product_1',
      displayName: `Buyer ${index}`,
      rating: 5,
      body: 'Great product.',
      status: 'PENDING',
      createdAt: new Date(2026, 8, 11, 12, 30, index),
    }));
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store_1' }) },
      storeReview: {
        findFirst: jest.fn().mockResolvedValue({ id: 'review_30' }),
        findMany: jest.fn().mockResolvedValue(rows),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'PENDING', _count: 31 },
          { status: 'PUBLISHED', _count: 4 },
        ]),
      },
    };
    const service = new CommerceContentService(prisma as any, {} as any);

    const result = await service.reviews('merchant_1', 'store_1', { status: 'PENDING', before: 'review_30' });

    expect(result.items).toHaveLength(30);
    expect(result.nextBefore).toBe('review_29');
    expect(result.counts).toEqual({ PENDING: 31, PUBLISHED: 4 });
    expect(prisma.storeReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 'store_1', status: 'PENDING' },
      take: 31,
      cursor: { id: 'review_30' },
      skip: 1,
    }));
  });
});

describe('CommerceContentService.publicContent', () => {
  it('returns exact per-product published review totals beside the latest reviews', async () => {
    const prisma = {
      storeArticle: { findMany: jest.fn().mockResolvedValue([]) },
      storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
      storeReview: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { productId: 'product_1', _count: { _all: 140 }, _avg: { rating: 4.8571 } },
          { productId: 'product_2', _count: { _all: 0 }, _avg: { rating: null } },
        ]),
      },
    };
    const service = new CommerceContentService(prisma as any, {} as any);
    const result = await service.publicContent('store_1');
    expect(result.reviewSummary).toEqual({ product_1: { count: 140, average: 4.9 } });
    expect(prisma.storeReview.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store_1', status: 'PUBLISHED' } }));
  });
});
