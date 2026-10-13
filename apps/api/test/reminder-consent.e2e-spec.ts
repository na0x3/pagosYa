import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionService } from '../src/retention/retention.service';
import { DEFAULT_RETENTION } from '../src/retention/retention.dto';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';

describe('«Avísame»: a reminder cart saved from the payment form', () => {
  let app: INestApplication, db: PrismaService, service: RetentionService, store: any, product: any, owner: string, otherMerchantId: string;
  const mail = { send: jest.fn(async () => {}) };
  const auth = (value = owner) => ({ Authorization: `Bearer ${value}` });
  const hex = () => randomBytes(8).toString('hex');
  const line = () => ({ paymentLinkId: product.id, name: 'Café', quantity: 2, unitAmount: 1000 });
  const recovery = async (recoveryEnabled: boolean) => {
    const settings = { ...DEFAULT_RETENTION, recoveryEnabled };
    await db.storeRetention.upsert({ where: { storeId: store.id }, create: { storeId: store.id, settings }, update: { settings } });
  };
  /** A store-page cart payment as cart-checkout makes it (cart-checkout itself is throttled to 10 a minute). */
  const cartPayment = (patch: Record<string, unknown> = {}) => db.paymentIntent.create({ data: {
    merchantId: store.merchantId, amount: 2000, currency: 'BOB', clientSecret: `pi_${hex()}_secret_${hex()}`, metadata: { storeId: store.id, cart: [line()] },
    storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 2000, currency: 'BOB', items: [line()] } }, ...patch,
  } as any }); // Loose patches on purpose (status, merchantId, metadata): ts-jest type-checks e2e files.
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(mail).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService); service = app.get(RetentionService);
    for (const name of ['ReminderOwner', 'ReminderOther']) {
      const created = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name === 'ReminderOwner') owner = created.testKeys.secretKey; else otherMerchantId = created.merchant.id;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Café Avísame' }).expect(201)).body;
    await db.store.update({ where: { id: store.id }, data: { publicVisibility: true } });
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Café', amount: 1000, currency: 'BOB' }).expect(201)).body;
    await recovery(true);
  });
  afterAll(async () => { await app?.close(); });

  it('saves one cart for the payment’s email, linked to it, under saveCart’s rules', async () => {
    const pi = await cartPayment({ customerEmail: 'ana@example.com', status: 'FAILED' });
    const before = Date.now();
    await expect(service.saveCartFromPayment(pi.id)).resolves.toMatchObject({ saved: true, token: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const carts = await db.storeSavedCart.findMany({ where: { storeId: store.id, email: 'ana@example.com' } });
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ paymentIntentId: pi.id, items: [{ paymentLinkId: product.id, quantity: 2 }], sentAt: null, closedAt: null });
    expect(carts[0].dueAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600000 - 1000);
    // Cart consent never subscribes to campaigns.
    expect((await db.storeNewsletterSubscriber.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'ana@example.com' } } })).isActive).toBe(false);
  });

  it('follows the one-reminder-a-week cap', async () => {
    await db.storeSavedCart.updateMany({ where: { storeId: store.id, email: 'ana@example.com' }, data: { sentAt: new Date() } });
    const again = await cartPayment({ customerEmail: 'ana@example.com', status: 'FAILED' });
    await expect(service.saveCartFromPayment(again.id)).resolves.toEqual({ saved: false });
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: 'ana@example.com' } })).toBe(1);
  });

  it('does nothing without reminders on, an email, a store cart, an unpaid payment, or the store’s own merchant', async () => {
    const none = async (pi: { id: string }) => expect(await service.saveCartFromPayment(pi.id)).toBeNull();
    await none(await cartPayment({ status: 'FAILED' }));
    await none(await cartPayment({ customerEmail: 'paid@example.com', status: 'SUCCEEDED' }));
    await none(await cartPayment({ customerEmail: 'cobro@example.com', metadata: { storeId: store.id, businessDocument: { documentId: 'd1' } } }));
    await none(await cartPayment({ customerEmail: 'renewal@example.com', metadata: { storeId: store.id, cart: [line()], subscription: { subscriptionId: 'sub_1' } } }));
    await none(await cartPayment({ customerEmail: 'spoof@example.com', merchantId: otherMerchantId }));
    await expect(service.reminderAvailable({ merchantId: store.merchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(true);
    await expect(service.reminderAvailable({ merchantId: otherMerchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(false);
    await recovery(false);
    await none(await cartPayment({ customerEmail: 'off@example.com', status: 'FAILED' }));
    await expect(service.reminderAvailable({ merchantId: store.merchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(false);
    await recovery(true);
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: { in: ['paid@example.com', 'cobro@example.com', 'renewal@example.com', 'spoof@example.com', 'off@example.com'] } } })).toBe(0);
  });

  const confirm = (pi: { id: string; clientSecret: string }, body: Record<string, unknown>) => request(app.getHttpServer()).post(`/v1/payment_intents/${pi.id}/confirm`)
    .set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_decline' }, customerName: 'Bea', customerEmail: 'Bea@Example.com', customerPhone: '+591 70000002', ...body });

  it('tells the payment form when to offer the box', async () => {
    const session = async (clientSecret: string) => (await request(app.getHttpServer()).post('/v1/checkout/session').send({ clientSecret }).expect(200)).body.reminderAvailable;
    const pi = await cartPayment();
    expect(await session(pi.clientSecret)).toBe(true);
    await recovery(false);
    expect(await session(pi.clientSecret)).toBe(false);
    await recovery(true);
    expect(await session((await cartPayment({ metadata: { storeId: store.id, businessDocument: { documentId: 'd1' } } })).clientSecret)).toBe(false);
  });

  it('saves the reminder when the shopper ticked it and pressed Pagar, and never fails the payment', async () => {
    const ticked = await cartPayment();
    expect((await confirm(ticked, { reminderConsent: true }).expect(201)).body.paymentIntent.status).toBe('FAILED');
    expect(await db.storeSavedCart.findFirst({ where: { storeId: store.id, email: 'bea@example.com' } })).toMatchObject({ paymentIntentId: ticked.id });
    await confirm(await cartPayment(), { customerEmail: 'carlos@example.com' }).expect(201);
    await confirm(await cartPayment(), { customerEmail: 'dora@example.com', reminderConsent: true, paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: { in: ['carlos@example.com', 'dora@example.com'] } } })).toBe(0);
    const failing = jest.spyOn(service, 'saveCart').mockRejectedValueOnce(new Error('db down'));
    expect((await confirm(await cartPayment(), { customerEmail: 'eva@example.com', reminderConsent: true }).expect(201)).body.paymentIntent.status).toBe('FAILED');
    expect(failing).toHaveBeenCalled(); failing.mockRestore();
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: 'eva@example.com' } })).toBe(0);
    await confirm(await cartPayment(), { reminderConsent: 'yes' }).expect(400);
  });
});
