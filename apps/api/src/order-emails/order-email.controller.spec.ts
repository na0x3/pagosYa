import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { OrderEmailController } from './order-email.controller';
import { OrderEmailService } from './order-email.service';

/**
 * The guard is replaced rather than disabled: a preview reads a store's authored
 * template, and a test-send puts a real message on the wire, so both the 401 and
 * the ownership boundary have to be exercised for real.
 */
const SESSION = 'Bearer dash_session';
const KEY = 'Bearer sk_test_key';

describe('the merchant previews the buyer email and sends themselves a copy', () => {
  let app: INestApplication;
  const orderEmail = {
    renderForStore: jest.fn().mockResolvedValue({ html: '<p>Orden: pi_SYNTH001</p>', repairs: ['logo: not an https url, dropped'] }),
    sampleData: jest.fn((storeName: string) => ({ storeName, orderId: 'pi_SYNTH001' })),
  };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const prisma = { store: { findFirst: jest.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrderEmailController],
      providers: [
        { provide: OrderEmailService, useValue: orderEmail },
        { provide: PrismaService, useValue: prisma },
        { provide: EMAIL_PROVIDER, useValue: email },
      ],
    })
      .overrideGuard(MerchantAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const header = req.headers['authorization'];
          if (header === SESSION) {
            req.merchant = { id: 'm1' };
            req.merchantUser = { id: 'mu1', email: 'dueña@tienda.test' };
            return true;
          }
          // A secret key authenticates a merchant but carries no dashboard user.
          if (header === KEY) {
            req.merchant = { id: 'm1' };
            return true;
          }
          throw new UnauthorizedException('Missing credentials');
        },
      })
      .overrideGuard(MerchantThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    orderEmail.renderForStore.mockClear();
    orderEmail.sampleData.mockClear();
    email.send.mockClear();
    prisma.store.findFirst.mockReset().mockResolvedValue({ name: 'Café Illimani' });
  });

  it('renders a preview against sample data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/stores/store_1/source-project/order-email/preview')
      .set('authorization', SESSION)
      .expect(200);
    expect(res.body.html).toContain('Orden:');
    expect(res.body.repairs).toEqual(['logo: not an https url, dropped']);
    expect(orderEmail.sampleData).toHaveBeenCalledWith('Café Illimani');
    expect(orderEmail.renderForStore).toHaveBeenCalledWith('store_1', expect.objectContaining({ storeName: 'Café Illimani' }));
  });

  it('refuses an unauthenticated preview', async () => {
    await request(app.getHttpServer()).get('/v1/stores/store_1/source-project/order-email/preview').expect(401);
    expect(orderEmail.renderForStore).not.toHaveBeenCalled();
  });

  it('looks the store up scoped to the authenticated merchant, never by id alone', async () => {
    await request(app.getHttpServer())
      .get('/v1/stores/store_1/source-project/order-email/preview')
      .set('authorization', SESSION)
      .expect(200);
    expect(prisma.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'store_1', merchantId: 'm1' } }));
  });

  it("will not preview or send another merchant's store", async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/v1/stores/store_9/source-project/order-email/preview')
      .set('authorization', SESSION)
      .expect(404);
    await request(app.getHttpServer())
      .post('/v1/stores/store_9/source-project/order-email/test-send')
      .set('authorization', SESSION)
      .expect(404);
    expect(orderEmail.renderForStore).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends a test only to the authenticated merchant's own address", async () => {
    await request(app.getHttpServer())
      .post('/v1/stores/store_1/source-project/order-email/test-send')
      .set('authorization', SESSION)
      .expect(201, { sent: true });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueña@tienda.test' }));
  });

  it('ignores any address in the request body', async () => {
    await request(app.getHttpServer())
      .post('/v1/stores/store_1/source-project/order-email/test-send')
      .set('authorization', SESSION)
      .send({ to: 'attacker@evil.test' })
      .expect(201);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueña@tienda.test' }));
    expect(email.send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'attacker@evil.test' }));
  });

  it('carries a plain-text body alongside the html, as every other send does', async () => {
    await request(app.getHttpServer())
      .post('/v1/stores/store_1/source-project/order-email/test-send')
      .set('authorization', SESSION)
      .expect(201);
    const sent = email.send.mock.calls[0][0];
    expect(sent.html).toContain('Orden:');
    expect(typeof sent.body).toBe('string');
    expect(sent.body.length).toBeGreaterThan(0);
    expect(sent.subject).toContain('Café Illimani');
  });

  it('refuses a test-send from a secret key, which has no merchant address to send to', async () => {
    await request(app.getHttpServer())
      .post('/v1/stores/store_1/source-project/order-email/test-send')
      .set('authorization', KEY)
      .expect(403);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('still previews for a secret key, which needs no address', async () => {
    await request(app.getHttpServer())
      .get('/v1/stores/store_1/source-project/order-email/preview')
      .set('authorization', KEY)
      .expect(200);
  });
});
