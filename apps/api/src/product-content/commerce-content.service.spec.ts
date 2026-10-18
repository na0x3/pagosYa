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

describe('merchant-entered reviews (spec 2026-10-18)', () => {
  const base = () => ({
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store_1' }) },
    storeArticle: { findMany: jest.fn().mockResolvedValue([]) },
    storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
    storeReview: {
      findMany: jest.fn().mockResolvedValue([{ id: 'r1', productId: 'p1', displayName: 'Luis', rating: 4, body: 'Muy lindo', createdAt: new Date('2026-10-10') }]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    storeTestimonial: {
      findMany: jest.fn().mockResolvedValue([{ id: 't1', displayName: 'Ana', rating: 5, body: 'Perfecto', sourceNote: 'por WhatsApp', status: 'PUBLISHED', createdAt: new Date('2026-10-12') }]),
      create: jest.fn(async ({ data }: any) => ({ id: 't2', ...data })),
    },
  });

  it('serves both sources newest first, each labelled with where it came from', async () => {
    const prisma = base();
    const result = await new CommerceContentService(prisma as any, {} as any).publicContent('store_1');
    expect(result.reviews.map((review: any) => [review.displayName, review.source, review.sourceNote, review.productId])).toEqual([['Ana', 'MERCHANT', 'por WhatsApp', null], ['Luis', 'ORDER', null, 'p1']]);
    expect(result.reviews[0]).not.toHaveProperty('status');
    expect(prisma.storeTestimonial.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store_1', status: 'PUBLISHED' } }));
  });

  it('reads the merchant entries as none before their table exists', async () => {
    const prisma = base();
    prisma.storeTestimonial.findMany.mockRejectedValue(new Error('relation "StoreTestimonial" does not exist'));
    const result = await new CommerceContentService(prisma as any, {} as any).publicContent('store_1');
    expect(result.reviews.map((review: any) => review.source)).toEqual(['ORDER']);
  });

  it('saves only what the merchant confirms are a real customer\'s words, trimmed', async () => {
    const prisma = base();
    const service = new CommerceContentService(prisma as any, {} as any);
    await expect(service.createTestimonial('m1', 'store_1', { displayName: 'Ana', rating: 5, body: 'Perfecto', confirmedReal: false })).rejects.toThrow('palabras reales');
    await service.createTestimonial('m1', 'store_1', { displayName: ' Ana ', rating: 5, body: ' Perfecto ', sourceNote: ' ', confirmedReal: true });
    expect(prisma.storeTestimonial.create).toHaveBeenCalledWith(expect.objectContaining({ data: { storeId: 'store_1', displayName: 'Ana', body: 'Perfecto', sourceNote: null, rating: 5 } }));
  });
});
