import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MerchantsService } from '../src/merchants/merchants.service';

// Mock card rail: apps/api/src/rails/adapters/mock-card.adapter.ts declines
// synchronously whenever the token includes "decline".
const DECLINE_TOKEN = 'tok_visa_decline';

describe('Merchant levels and limits', () => {
  let app: INestApplication, prisma: PrismaService, merchantId: string, liveKey: string, testKey: string;
  const http = () => request(app.getHttpServer());
  const createIntent = (amount: number, currency = 'BOB') => http().post('/v1/payment_intents').set({ Authorization: `Bearer ${liveKey}` }).send({ amount, currency });
  const confirm = (pi: any, token = 'tok_visa_success') => http().post(`/v1/payment_intents/${pi.id}/confirm`).set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token } });
  const volume = () => prisma.merchantMonthlyVolume.findFirst({ where: { merchantId } });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    const created = await http().post('/v1/merchants').send({ name: 'Limits', email: 'limits@test.example', settlementMode: 'AGGREGATOR' }).expect(201);
    merchantId = created.body.merchant.id;
    testKey = created.body.testKeys.secretKey;
    await prisma.merchant.update({ where: { id: merchantId }, data: { status: 'ACTIVE', level: 1 } });
    liveKey = (await app.get(MerchantsService).issueLiveKeys(merchantId)).liveKeys.secretKey;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => {
    await prisma.merchantMonthlyVolume.deleteMany({ where: { merchantId } });
    await prisma.merchant.update({ where: { id: merchantId }, data: { level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null } });
  });

  it('refuses a live intent over the per-payment max with the merchant message', async () => {
    const res = await createIntent(200_001).expect(403);
    expect(res.body).toMatchObject({ code: 'per_payment_limit_exceeded', message: 'Este cobro supera el máximo por pago de tu nivel.' });
    await createIntent(200_000).expect(201);
  });

  it('settles a successful payment and releases a failed one', async () => {
    await confirm((await createIntent(100_000).expect(201)).body).expect(201);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
    const bad = (await createIntent(50_000).expect(201)).body;
    await confirm(bad, DECLINE_TOKEN);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: bad.id } })).toMatchObject({ status: 'FAILED', limitStatus: 'RELEASED' });
  });

  it('reserves again when the buyer retries a failed payment', async () => {
    const pi = (await createIntent(50_000).expect(201)).body;
    await confirm(pi, DECLINE_TOKEN);
    await confirm(pi).expect(201);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 50_000 });
  });

  it('refuses at the monthly limit with the neutral message and never calls the rail', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { monthlyLimitOverride: 150_000 } });
    await confirm((await createIntent(100_000).expect(201)).body).expect(201);
    const over = (await createIntent(50_001).expect(201)).body;
    const res = await confirm(over).expect(403);
    expect(res.body).toMatchObject({ code: 'limit_exceeded', message: 'Este comercio no puede recibir pagos en este momento.' });
    expect(await prisma.transaction.count({ where: { paymentIntentId: over.id } })).toBe(0);
    await confirm((await createIntent(50_000).expect(201)).body).expect(201);
  });

  it('lets only one of two concurrent confirms through when both would exceed the limit', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { monthlyLimitOverride: 150_000 } });
    const a = (await createIntent(100_000).expect(201)).body;
    const b = (await createIntent(100_000).expect(201)).body;
    const results = await Promise.all([confirm(a), confirm(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
  });

  it('does not free room on refund', async () => {
    const paid = (await createIntent(100_000).expect(201)).body;
    await confirm(paid).expect(201);
    await http().post('/v1/refunds').set({ Authorization: `Bearer ${liveKey}`, 'idempotency-key': 'refund-limits-test-1' }).send({ paymentIntentId: paid.id, amount: 100_000 }).expect(201);
    expect(await volume()).toMatchObject({ settled: 100_000 });
  });

  it('refuses live payments at level 0', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { level: 0 } });
    await createIntent(1_000).expect(403);
    expect(await volume()).toBeNull();
  });

  it('shows the buyer the neutral message when a store product is over the per-payment max', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { perPaymentLimitOverride: 5_000 } });
    const store = (await http().post('/v1/stores').set({ Authorization: `Bearer ${liveKey}` }).send({ name: 'Tienda Límite' }).expect(201)).body;
    const product = (await http().post(`/v1/stores/${store.id}/payment_links`).set({ Authorization: `Bearer ${liveKey}` }).send({ name: 'Caro', amount: 10_000, currency: 'BOB' }).expect(201)).body;
    const res = await http().post(`/v1/stores/public/${store.slug}/cart-checkout`).send({ items: [{ paymentLinkId: product.id, quantity: 1 }], fulfillmentMethod: 'pickup' }).expect(403);
    expect(res.body.message).toBe('Este comercio no puede recibir pagos en este momento.');
  });

  it('never checks, reserves or counts TEST-mode payments', async () => {
    const pi = (await http().post('/v1/payment_intents').set({ Authorization: `Bearer ${testKey}` }).send({ amount: 10_000_000, currency: 'BOB' }).expect(201)).body;
    await http().post(`/v1/payment_intents/${pi.id}/confirm`).set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
    expect(await volume()).toBeNull();
  });
});
