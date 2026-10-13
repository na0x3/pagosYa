import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_RETENTION } from '../src/retention/retention.dto';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';

describe('Crecer › Carritos abandonados', () => {
  let app: INestApplication, db: PrismaService, store: any, product: any, owner: string, other: string;
  const auth = (value = owner) => ({ Authorization: `Bearer ${value}` });
  const list = (days: number | string = 7, value = owner) => request(app.getHttpServer()).get(`/v1/stores/${store.id}/abandoned-carts?days=${days}`).set(auth(value));
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000);
  const items = () => [{ paymentLinkId: product.id, name: 'Café', variantName: 'Grande', quantity: 2, unitAmount: 1000 }];
  /** A live store-cart payment the shopper confirmed, `hours` ago. */
  const attempt = (hours: number, data: Record<string, unknown>) => {
    const at = hoursAgo(hours);
    return db.paymentIntent.create({ data: {
      merchantId: store.merchantId, amount: 2000, currency: 'BOB', clientSecret: randomUUID(), livemode: true, status: 'FAILED', confirmationAttempts: 1, createdAt: at, updatedAt: at,
      metadata: { storeId: store.id, cart: items() }, storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 2000, currency: 'BOB', items: items(), createdAt: at } }, ...data,
    } as any }); // Loose patches on purpose: ts-jest type-checks e2e files.
  };
  const paid = (data: Record<string, unknown>) => db.paymentIntent.create({ data: {
    merchantId: store.merchantId, amount: 1000, currency: 'BOB', clientSecret: randomUUID(), livemode: true, status: 'SUCCEEDED', metadata: { storeId: store.id, cart: items() },
    storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 1000, currency: 'BOB', items: items() } }, ...data,
  } as any });
  const saved = (hours: number, email: string, data: Record<string, unknown> = {}) => db.storeSavedCart.create({ data: {
    storeId: store.id, email, token: randomBytes(32).toString('hex'), items: [{ paymentLinkId: product.id, quantity: 1 }], dueAt: new Date(Date.now() + 86400000), createdAt: hoursAgo(hours), ...data,
  } as any });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue({ send: jest.fn() }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService);
    for (const name of ['CartsOwner', 'CartsOther']) {
      const created = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name === 'CartsOwner') owner = created.testKeys.secretKey; else other = created.testKeys.secretKey;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Casa Luz' }).expect(201)).body;
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Café', amount: 1000, currency: 'BOB' }).expect(201)).body;
    await db.storeRetention.create({ data: { storeId: store.id, settings: { ...DEFAULT_RETENTION, recoveryEnabled: true } } });
  });
  afterAll(async () => { await app?.close(); });

  it('lists who pressed Pagar and who saved a cart, one row per person, newest first', async () => {
    await attempt(5, { customerName: 'Ana Rojas', customerEmail: 'ana@example.com', customerPhone: '70000001' });
    await attempt(3, { customerName: 'Ana Rojas', customerEmail: 'ana@example.com', customerPhone: '70000001' });
    const bruno = await saved(2, 'bruno@example.com');
    await attempt(4, { customerPhone: '+591 70000003' });
    const carla = await attempt(6, { customerName: 'Carla', customerEmail: 'carla@example.com' });
    const carlaCart = await saved(6, 'carla@example.com', { paymentIntentId: carla.id, sentAt: hoursAgo(1) });
    const body = (await list().expect(200)).body;
    expect(body.carts.map((c: any) => [c.source, c.name ?? c.email ?? c.phone, c.reminder])).toEqual([
      ['saved', 'bruno@example.com', 'scheduled'], ['payment', 'Ana Rojas', 'none'], ['payment', '+591 70000003', 'none'], ['payment', 'Carla', 'sent'],
    ]);
    expect(body.carts[0]).toMatchObject({ items: [{ name: 'Café', variant: null, quantity: 1 }], total: 1000, currency: 'BOB', recoverUrl: expect.stringContaining(`recover=${bruno.token}`), storeUrl: expect.stringContaining(`/s/${store.slug}`) });
    expect(body.carts[1]).toMatchObject({ phone: '70000001', items: [{ name: 'Café', variant: 'Grande', quantity: 2 }], total: 2000, recoverUrl: null });
    expect(body.carts[3].recoverUrl).toContain(`recover=${carlaCart.token}`);
  });

  it('drops paid people, test, unconfirmed or too recent payments, renewals, closed carts and anything past the period', async () => {
    await attempt(3, { customerEmail: 'test@example.com', livemode: false });
    await attempt(3, { customerEmail: 'unconfirmed@example.com', confirmationAttempts: 0 });
    await attempt(0.5, { customerEmail: 'recent@example.com' });
    await attempt(3, { customerEmail: 'renewal@example.com', metadata: { storeId: store.id, cart: items(), subscription: { subscriptionId: 'sub_1' } } });
    await attempt(3, { customerEmail: 'dora@example.com' }); await paid({ customerEmail: 'DORA@example.com' });
    await attempt(3, { customerPhone: '70000009' }); await paid({ customerPhone: '+591 7000 0009' });
    await attempt(3, { customerEmail: 'before@example.com' }); await paid({ customerEmail: 'before@example.com', updatedAt: hoursAgo(5) });
    const own = await paid({ livemode: false }); await saved(3, 'own@example.com', { paymentIntentId: own.id });
    await saved(3, 'closed@example.com', { closedAt: new Date() });
    await attempt(10 * 24, { customerEmail: 'tendays@example.com' });
    await attempt(40 * 24, { customerEmail: 'old@example.com' });
    const people = async (days: number) => (await list(days).expect(200)).body.carts.map((c: any) => c.email ?? c.phone);
    const week = await people(7);
    for (const gone of ['test@example.com', 'unconfirmed@example.com', 'recent@example.com', 'renewal@example.com', 'dora@example.com', '70000009', 'own@example.com', 'closed@example.com', 'tendays@example.com', 'old@example.com']) expect(week).not.toContain(gone);
    expect(week).toContain('before@example.com');
    const month = await people(30);
    expect(month).toContain('tendays@example.com'); expect(month).not.toContain('old@example.com');
  });

  it('counts anonymous sessions that added to the cart over a day ago and never pressed Pagar', async () => {
    const event = (session: string, type: string, hours: number, storeId = store.id) => ({ storeId, sessionHash: session, type, device: 'mobile', createdAt: hoursAgo(hours) });
    await db.storeAnalyticsEvent.createMany({ data: [
      event('a', 'page_view', 30), event('a', 'add_to_cart', 30),
      event('b', 'add_to_cart', 30), event('b', 'pay_click', 29),
      event('c', 'add_to_cart', 2),
      event('d', 'add_to_cart', 10 * 24),
      event('e', 'add_to_cart', 30, 'another-store'),
    ] });
    expect((await list(7).expect(200)).body.anonymousSessions).toBe(1);
    expect((await list(30).expect(200)).body.anonymousSessions).toBe(2);
  });

  // saveCart refreshes an open cart in place: the merchant sees when the shopper last left, and a payment made
  // before that refresh does not hide the new abandonment.
  it('dates a re-saved cart by its last save, not its first', async () => {
    const cart = await saved(5 * 24, 'reused@example.com');
    await paid({ customerEmail: 'reused@example.com', updatedAt: hoursAgo(3 * 24) });
    await db.storeSavedCart.update({ where: { id: cart.id }, data: { updatedAt: hoursAgo(2) } });
    const row = (await list(7).expect(200)).body.carts.find((c: any) => c.email === 'reused@example.com');
    expect(row).toBeDefined();
    expect(Math.abs(Date.parse(row.leftAt) - hoursAgo(2).getTime())).toBeLessThan(60_000);
  });

  it('refuses another merchant’s store and unknown periods', async () => {
    await request(app.getHttpServer()).get(`/v1/stores/${store.id}/abandoned-carts?days=7`).expect(401);
    await list(7, other).expect(404);
    await list(90).expect(400);
  });
});
