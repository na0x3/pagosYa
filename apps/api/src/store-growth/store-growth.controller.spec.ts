import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { StoreGrowthController } from './store-growth.controller';
import { StoreGrowthService } from './store-growth.service';

describe('growth overview and insight state routes', () => {
  let app: INestApplication;
  const growth = { overview: jest.fn().mockResolvedValue({ ok: true }), setInsightState: jest.fn().mockResolvedValue({ ok: true }), restoreInsights: jest.fn().mockResolvedValue({ restored: 0 }) };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [StoreGrowthController], providers: [{ provide: StoreGrowthService, useValue: growth }] })
      .overrideGuard(MerchantAuthGuard).useValue({ canActivate: (context: ExecutionContext) => { context.switchToHttp().getRequest().merchant = { id: 'm1' }; return true; } })
      .compile();
    app = moduleRef.createNestApplication();
    // The production pipe (main.ts).
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => Object.values(growth).forEach(fn => fn.mockClear()));

  it('answers the overview for 7, 30 (default) or 90 days', async () => {
    await request(app.getHttpServer()).get('/v1/stores/s1/growth/overview?days=90').expect(200, { ok: true });
    expect(growth.overview).toHaveBeenLastCalledWith('m1', 's1', 90);
    await request(app.getHttpServer()).get('/v1/stores/s1/growth/overview').expect(200);
    expect(growth.overview).toHaveBeenLastCalledWith('m1', 's1', 30);
  });

  it.each(['?days=14', '?days=abc', '?days=30&extra=1'])('refuses %s', async query => {
    await request(app.getHttpServer()).get(`/v1/stores/s1/growth/overview${query}`).expect(400);
    expect(growth.overview).not.toHaveBeenCalled();
  });

  it('dismisses, snoozes or restores one insight by its stable id', async () => {
    await request(app.getHttpServer()).put('/v1/stores/s1/growth/insights/referrer-surge:l.facebook.com').send({ action: 'snooze' }).expect(200);
    expect(growth.setInsightState).toHaveBeenLastCalledWith('m1', 's1', 'referrer-surge:l.facebook.com', 'snooze');
    await request(app.getHttpServer()).put('/v1/stores/s1/growth/insights/views-no-adds:cmabc123').send({ action: 'dismiss' }).expect(200);
    await request(app.getHttpServer()).delete('/v1/stores/s1/growth/insights').expect(200, { restored: 0 });
    expect(growth.restoreInsights).toHaveBeenCalledWith('m1', 's1');
  });

  it.each([
    ['an unknown action', 'weak-photos', { action: 'delete' }],
    ['an extra field', 'weak-photos', { action: 'dismiss', until: '2030-01-01' }],
    ['a malformed id', 'Weak Photos!', { action: 'dismiss' }],
    ['an id that is too long', `views-no-adds:${'x'.repeat(200)}`, { action: 'dismiss' }],
  ])('refuses %s', async (_name, id, body) => {
    await request(app.getHttpServer()).put(`/v1/stores/s1/growth/insights/${encodeURIComponent(id)}`).send(body).expect(400);
    expect(growth.setInsightState).not.toHaveBeenCalled();
  });
});
