import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionService } from '../src/stores/retention.service';
import { DEFAULT_RETENTION } from '../src/stores/retention.dto';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';
import { createOrderTrackingToken } from '../src/consumer/order-tracking-token';

describe('Customer retention', () => {
  let app: INestApplication, db: PrismaService, service: RetentionService, store: any, product: any, owner: string, other: string;
  const mail = { send: jest.fn(async (_request: any) => {}) };
  const auth = (value = owner) => ({ Authorization: `Bearer ${value}` });
  const manage = (path = '') => `/v1/stores/${store.id}/retention${path}`;
  const publicPath = (path = '') => `/v1/stores/public/${store.slug}/retention${path}`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(mail).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService); service = app.get(RetentionService);
    app.get(ConfigService).set('app.email.resendApiKey', 'test-only-provider-is-mocked');
    for (const name of ['RetentionOwner', 'RetentionOther']) {
      const merchant = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name.endsWith('Owner')) owner = merchant.testKeys.secretKey; else other = merchant.testKeys.secretKey;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Club de pruebas' }).expect(201)).body;
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Café', amount: 1000, currency: 'BOB' }).expect(201)).body;
  });
  afterAll(async () => { await app?.close(); });
  it('is optional, owner-scoped, revision-checked, and validates thresholds and consent', async () => {
    expect((await request(app.getHttpServer()).get(publicPath()).expect(200)).body.comebackEnabled).toBe(false);
    await request(app.getHttpServer()).get(manage()).expect(401);
    await request(app.getHttpServer()).get(manage()).set(auth(other)).expect(404);
    await request(app.getHttpServer()).post(publicPath('/cards')).send({ email: 'client@example.com' }).expect(400);
    const settings = { ...DEFAULT_RETENTION, revision: 0, comebackEnabled: true, signupEnabled: true, recoveryEnabled: true, welcomeEnabled: true, visitsRequired: 4, rewardLabel: 'Un café gratis', signupTitle: 'Club del café' };
    await request(app.getHttpServer()).put(manage()).set(auth()).send({ ...settings, visitsRequired: 0 }).expect(400);
    await request(app.getHttpServer()).put(manage()).set(auth()).send(settings).expect(200);
    await request(app.getHttpServer()).put(manage()).set(auth()).send(settings).expect(409);
    await request(app.getHttpServer()).post(publicPath('/subscribe')).send({ email: 'client@example.com', consent: false }).expect(400);
    await request(app.getHttpServer()).post(publicPath('/subscribe')).send({ email: 'client@example.com', consent: true }).expect(201);
    await service.subscribe(store, 'CLIENT@EXAMPLE.COM');
    expect(await db.storeNewsletterSubscriber.count({ where: { storeId: store.id } })).toBe(1);
    expect(await db.storeEmailDelivery.count({ where: { storeId: store.id, kind: 'WELCOME' } })).toBe(1);
  });
  it('does not expose cards by email, deduplicates paid days and atomically redeems once', async () => {
    const response = await request(app.getHttpServer()).post(publicPath('/cards')).send({ email: 'client@example.com' }).expect(201);
    expect(response.body).toEqual({ submitted: true });
    const card = await db.comebackCard.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'client@example.com' } } });
    await db.storeRetention.update({ where: { storeId: store.id }, data: { startedAt: new Date('2026-01-01') } });
    for (const date of ['2026-01-02T15:00Z', '2026-01-02T17:00Z', '2026-01-03T15:00Z', '2026-01-04T15:00Z', '2026-01-05T15:00Z']) {
      await db.paymentIntent.create({ data: { merchantId: store.merchantId, amount: 1000, currency: 'BOB', status: 'SUCCEEDED', clientSecret: randomUUID(), livemode: true, customerEmail: card.email, transactions: { create: { type: 'CAPTURE', status: 'SUCCEEDED', amount: 1000, railId: 'mock', createdAt: new Date(date) } }, storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 1000, currency: 'BOB', items: [], createdAt: new Date(date) } } } });
    }
    const state = (await request(app.getHttpServer()).get(publicPath(`/cards/${card.token}`)).expect(200)).body;
    expect(state).toMatchObject({ visits: 4, visitsRequired: 4, rewardLabel: 'Un café gratis' }); expect(state.code).toMatch(/^CB-/);
    const redemptions = await Promise.all([request(app.getHttpServer()).post(manage('/redeem')).set(auth()).send({ code: state.code }), request(app.getHttpServer()).post(manage('/redeem')).set(auth()).send({ code: state.code })]);
    expect(redemptions.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await service.card(store.id, card.token)).visits).toBe(0);
    await request(app.getHttpServer()).post(manage('/redeem')).set(auth(other)).send({ code: state.code }).expect(404);
  });
  it('queues campaigns once and honors unsubscribe at delivery time', async () => {
    const draft = (await request(app.getHttpServer()).post(manage('/campaigns')).set(auth()).send({ subject: 'Oferta del viernes', body: 'Te esperamos con café recién hecho.' }).expect(201)).body;
    const queued = await Promise.all([request(app.getHttpServer()).post(manage(`/campaigns/${draft.id}/send`)).set(auth()), request(app.getHttpServer()).post(manage(`/campaigns/${draft.id}/send`)).set(auth())]);
    expect(queued.map(r => r.status).sort()).toEqual([201, 409]);
    const subscriber = await db.storeNewsletterSubscriber.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'client@example.com' } } });
    await request(app.getHttpServer()).post(publicPath(`/unsubscribe/${subscriber.unsubscribeToken}`)).send({}).expect(201);
    mail.send.mockClear(); await service.deliver();
    expect(mail.send.mock.calls.every(([r]) => r.subject.includes('tarjeta Comeback'))).toBe(true);
    expect(await db.storeEmailDelivery.count({ where: { campaignId: draft.id, status: 'CANCELED' } })).toBe(1);
  });
  it('shows branded cards only for qualifying paid orders and never exposes another email owner’s history', async () => {
    const pi = await db.paymentIntent.create({ data: { merchantId: store.merchantId, amount: 1000, currency: 'BOB', status: 'SUCCEEDED', clientSecret: randomUUID(), livemode: true, customerEmail: 'client@example.com', customerName: 'Doris',
      transactions: { create: { type: 'CAPTURE', status: 'SUCCEEDED', amount: 1000, railId: 'mock' } },
      storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 1000, currency: 'BOB', items: [] } } }, include: { storeOrder: true } });
    await db.store.update({ where: { id: store.id }, data: { backgroundColor: '#b69b88', name: 'Urban Roasters Co' } });
    const trackingToken = createOrderTrackingToken(pi.storeOrder!.id, app.get(ConfigService).get('app.orderTrackingSecret')!);
    const endpoint = '/v1/retention/payment-card';
    const call = () => request(app.getHttpServer()).post(endpoint).send({ trackingToken });
    const response = await call().expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ paymentIntentId: pi.id, customerName: 'Doris', currentPurchaseOnly: true, visits: 1, availableRewards: null, code: null, brand: { name: 'Urban Roasters Co', background: '#b69b88', stamp: 'coffee' } });
    expect(response.body.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(response.body).not.toHaveProperty('token'); expect(response.body).not.toHaveProperty('email');
    expect(response.body.cardUrl).toContain('/track/'); expect(response.body.cardUrl).not.toContain('comeback=');
    await call().expect(201);
    expect(await db.comebackCard.count({ where: { storeId: store.id, email: 'client@example.com' } })).toBe(1);
    await request(app.getHttpServer()).post(endpoint).send({ trackingToken: trackingToken + 'x' }).expect(404);
    await request(app.getHttpServer()).post(endpoint + '/email').send({ trackingToken, email: 'attacker@example.com' }).expect(400);
    await request(app.getHttpServer()).post(endpoint + '/email').send({ trackingToken }).expect(201);
    for (const data of [{ status: 'PROCESSING' }, { status: 'FAILED' }, { status: 'SUCCEEDED', livemode: false }, { livemode: true, customerEmail: null }]) {
      await db.paymentIntent.update({ where: { id: pi.id }, data: data as any });
      expect((await call().expect(201)).text).toBe('');
    }
    await db.paymentIntent.update({ where: { id: pi.id }, data: { customerEmail: 'client@example.com' } });
    await db.transaction.create({ data: { paymentIntentId: pi.id, type: 'REFUND', status: 'SUCCEEDED', amount: 1000, railId: 'mock' } });
    expect((await call().expect(201)).text).toBe('');
    const saved = await db.storeRetention.findUniqueOrThrow({ where: { storeId: store.id } });
    await db.storeRetention.update({ where: { storeId: store.id }, data: { settings: { ...saved.settings as object, comebackEnabled: false } } });
    expect((await call().expect(201)).text).toBe('');
    await db.storeRetention.update({ where: { storeId: store.id }, data: { settings: saved.settings! } });
  });
  it('personalizes signup with actual store imagery and saves optional subscriber details', async () => {
    await db.category.create({ data: { storeId: store.id, name: 'Café de origen' } });
    await db.paymentLink.update({ where: { id: product.id }, data: { imageUrls: ['https://images.example/coffee.jpg'] } });
    const visual = (await request(app.getHttpServer()).get(publicPath()).expect(200)).body.signupVisual;
    expect(visual).toMatchObject({ imageUrl: 'https://images.example/coffee.jpg', interests: ['Café de origen'], brand: { name: 'Urban Roasters Co' } });
    const payload = { email: 'profile@example.com', consent: true, name: 'Doris', phone: '+591 70000000', interests: ['Café de origen'] };
    await request(app.getHttpServer()).post(publicPath('/subscribe')).send({ ...payload, interests: ['Foreign store category'] }).expect(400);
    await request(app.getHttpServer()).post(publicPath('/subscribe')).send(payload).expect(201);
    expect(await db.storeNewsletterSubscriber.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: payload.email } } })).toMatchObject({ name: payload.name, phone: payload.phone, interests: payload.interests });
    const overview = (await request(app.getHttpServer()).get(manage()).set(auth()).expect(200)).body;
    expect(overview.subscribers).toEqual(expect.arrayContaining([expect.objectContaining({ email: payload.email, name: payload.name, interests: payload.interests })]));
    await service.deliver(); // Drain this fixture's welcome email before the recovery tests.
  });
  it('remembers only opted-in carts, links checkout, suppresses paid carts and sends one recoverable reminder', async () => {
    const payload = { email: 'cart@example.com', consent: true, items: [{ paymentLinkId: product.id, quantity: 1 }] };
    const saved = (await request(app.getHttpServer()).post(publicPath('/carts')).send(payload).expect(201)).body;
    expect(saved.token).toHaveLength(64);
    expect((await request(app.getHttpServer()).post(publicPath('/carts')).send(payload).expect(201)).body.token).toBeUndefined();
    const checkout = (await request(app.getHttpServer()).post(`/v1/stores/public/${store.slug}/cart-checkout`).send({ items: payload.items, recoveryToken: saved.token }).expect(201)).body;
    const cart = await db.storeSavedCart.findUniqueOrThrow({ where: { token: saved.token } });
    expect(cart.paymentIntentId).toBe(checkout.id);
    await db.storeSavedCart.update({ where: { id: cart.id }, data: { dueAt: new Date(0) } });
    await service.scheduleCarts(); await service.scheduleCarts();
    expect(await db.storeEmailDelivery.count({ where: { sourceId: cart.id, kind: 'RECOVERY' } })).toBe(1);
    await db.paymentIntent.update({ where: { id: checkout.id }, data: { status: 'SUCCEEDED', customerEmail: payload.email } });
    mail.send.mockClear(); await service.deliver(); expect(mail.send).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get(publicPath(`/carts/${saved.token}`)).expect(404);
    const second = await service.saveCart(store.id, { ...payload, email: 'unpaid@example.com' });
    const unpaid = await db.storeSavedCart.update({ where: { token: second.token! }, data: { dueAt: new Date(0) } });
    await service.scheduleCarts(); mail.send.mockClear(); await Promise.all([service.deliver(), service.deliver()]);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ idempotencyKey: expect.stringMatching(/^retention\//), body: expect.stringContaining('recover=') });
    expect(mail.send.mock.calls[0][0].body).toContain('unsubscribe=');
    expect((await service.restoreCart(store.id, unpaid.token)).items).toEqual(payload.items);
    expect((await db.storeNewsletterSubscriber.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'unpaid@example.com' } } })).isActive).toBe(false);
  });
  it('serializes cart saves by recipient and postpones an already queued reminder when the cart changes', async () => {
    const dto = { email: 'concurrent@example.com', consent: true, items: [{ paymentLinkId: product.id, quantity: 1 }] };
    const results = await Promise.all([service.saveCart(store.id, dto), service.saveCart(store.id, dto)]);
    expect(results.filter(r => r.token)).toHaveLength(1);
    const value = results.find(r => r.token)!.token!;
    const cart = await db.storeSavedCart.update({ where: { token: value }, data: { dueAt: new Date(0) } });
    await service.scheduleCarts();
    await service.saveCart(store.id, { ...dto, token: value, items: [{ paymentLinkId: product.id, quantity: 2 }] });
    mail.send.mockClear(); await service.deliver(); expect(mail.send).not.toHaveBeenCalled();
    expect(await db.storeEmailDelivery.findFirst({ where: { sourceId: cart.id } })).toMatchObject({ status: 'PENDING' });
  });
  it('retries delivery failures with the same idempotency key', async () => {
    await service.requestCard(store, 'retry@example.com');
    mail.send.mockRejectedValueOnce(new Error('Provider unavailable'));
    await service.deliver();
    const delivery = await db.storeEmailDelivery.findFirstOrThrow({ where: { storeId: store.id, email: 'retry@example.com' } });
    expect(delivery.status).toBe('PENDING'); expect(delivery.attempts).toBe(1);
    await db.storeEmailDelivery.update({ where: { id: delivery.id }, data: { dueAt: new Date(0) } });
    await service.deliver();
    expect((await db.storeEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('SENT');
    expect(mail.send.mock.calls.slice(-2).map(([r]) => r.idempotencyKey)).toEqual([`retention/${delivery.id}`, `retention/${delivery.id}`]);
  });
});
