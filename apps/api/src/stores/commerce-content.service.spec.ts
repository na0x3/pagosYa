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
