import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StoreAnalyticsController, StoreAnalyticsPublicController } from './store-analytics.controller';
import { StoreAnalyticsService } from './store-analytics.service';

const SESSION = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('POST v1/stores/public/:slug/events', () => {
  let app: INestApplication;
  const ingest = jest.fn().mockResolvedValue({ accepted: 1 });
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [StoreAnalyticsPublicController], providers: [{ provide: StoreAnalyticsService, useValue: { ingest } }] }).compile();
    app = moduleRef.createNestApplication();
    // The production pipe (main.ts): unknown fields would be a 400 on a DTO; this route normalises by hand instead.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => ingest.mockClear());

  it('answers 202 and hands the raw body, the user agent and the GPC signal to the service', async () => {
    const body = { sessionId: SESSION, events: [{ type: 'page_view', email: 'a@b.co' }], extra: true };
    await request(app.getHttpServer()).post('/v1/stores/public/shop/events').set('User-Agent', 'UA/1').set('Sec-GPC', '1').send(body).expect(202, { accepted: 1 });
    expect(ingest).toHaveBeenCalledWith('shop', body, { userAgent: 'UA/1', gpc: true });
  });

  it('is throttled to 30 requests a minute', () => {
    const limits = Reflect.getMetadata('THROTTLER:LIMITdefault', StoreAnalyticsPublicController.prototype.record);
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', StoreAnalyticsPublicController.prototype.record);
    expect([limits, ttl]).toEqual([30, 60000]);
  });
});

describe('GET v1/stores/:storeId/analytics', () => {
  let app: INestApplication;
  const findFirst = jest.fn();
  const findMany = jest.fn().mockResolvedValue([]);
  beforeAll(async () => {
    const prisma = { store: { findFirst }, storeAnalyticsDaily: { findMany }, paymentLink: { findMany: jest.fn().mockResolvedValue([]) } };
    const moduleRef = await Test.createTestingModule({ controllers: [StoreAnalyticsController], providers: [StoreAnalyticsService, { provide: PrismaService, useValue: prisma }] })
      .overrideGuard(MerchantAuthGuard).useValue({ canActivate: (context: ExecutionContext) => { context.switchToHttp().getRequest().merchant = { id: 'm1' }; return true; } })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => { findFirst.mockReset().mockResolvedValue({ id: 's1' }); findMany.mockClear(); });

  it('answers the owner with a report over the requested Bolivia days', async () => {
    const { body } = await request(app.getHttpServer()).get('/v1/stores/s1/analytics?from=2026-09-01&to=2026-09-03&granularity=day').expect(200);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 's1', merchantId: 'm1' }, select: { id: true } });
    expect(findMany).toHaveBeenCalledWith({ where: { storeId: 's1', day: { gte: new Date('2026-09-01T00:00:00Z'), lte: new Date('2026-09-03T00:00:00Z') } }, select: { day: true, type: true, productId: true, target: true, count: true, uniqueSessions: true } });
    expect(body.series.page_view).toHaveLength(3);
  });

  it('defaults to the last 30 days', async () => {
    const { body } = await request(app.getHttpServer()).get('/v1/stores/s1/analytics').expect(200);
    expect(body.series.page_view).toHaveLength(30);
    expect(body.to).toBe(new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10));
  });

  it.each([
    ['from after to', '?from=2026-09-05&to=2026-09-01'],
    ['more than 400 days', '?from=2025-01-01&to=2026-09-01'],
    ['an impossible date', '?from=2026-02-30&to=2026-03-01'],
    ['a malformed date', '?from=yesterday'],
    ['an hourly granularity', '?granularity=hour'],
    ['an unknown parameter', '?limit=5'],
  ])('refuses %s', async (_name, query) => {
    await request(app.getHttpServer()).get(`/v1/stores/s1/analytics${query}`).expect(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('answers 404 for a store the merchant does not own', async () => {
    findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/v1/stores/other/analytics').expect(404);
    expect(findMany).not.toHaveBeenCalled();
  });
});
