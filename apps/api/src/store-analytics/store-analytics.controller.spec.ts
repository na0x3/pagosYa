import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { StoreAnalyticsPublicController } from './store-analytics.controller';
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
