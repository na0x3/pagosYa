import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpsRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MerchantsService } from '../src/merchants/merchants.service';
import { LimitsService } from '../src/limits/limits.service';
import { OpsUserService } from '../src/ops/ops-user.service';

// Mock card rail: apps/api/src/rails/adapters/mock-card.adapter.ts declines
// synchronously whenever the token includes "decline".
const DECLINE_TOKEN = 'tok_visa_decline';
// Mock QR rail (apps/api/src/rails/adapters/mock-qr.adapter.ts): any token
// that isn't "decline" or "instant_success" comes back requires_action, i.e.
// pending a scan that may never happen.
const QR_PENDING_TOKEN = 'tok_qr_pending';
// test/setup-env.cjs sets this for the e2e run.
const INTERNAL_RAIL_CALLBACK_SECRET = 'e2e-internal-rail-secret';

describe('Merchant levels and limits', () => {
  let app: INestApplication, prisma: PrismaService, merchantId: string, liveKey: string, testKey: string;
  let opsAdminToken: string, opsAgentToken: string, dashboardSessionToken: string;
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

    const opsUsers = app.get(OpsUserService);
    opsAdminToken = (await opsUsers.create('Limits Admin', 'limits-admin@pagosya.bo', OpsRole.SUPPORT_ADMIN)).fullToken;
    opsAgentToken = (await opsUsers.create('Limits Agent', 'limits-agent@pagosya.bo', OpsRole.SUPPORT_AGENT)).fullToken;

    const dashboardPassword = 'Correct-password-2026!';
    await prisma.merchantUser.create({
      data: {
        merchantId,
        email: 'owner-limits@test.example',
        hashedPassword: await argon2.hash(dashboardPassword),
        emailVerifiedAt: new Date(),
      },
    });
    const login = await http().post('/v1/dashboard/login').send({ email: 'owner-limits@test.example', password: dashboardPassword }).expect(201);
    dashboardSessionToken = login.body.token;
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

  it('gives back limit room held by a stale unpaid QR reservation, and still counts a late success', async () => {
    const pi = (await createIntent(60_000).expect(201)).body;
    const confirmed = await http()
      .post(`/v1/payment_intents/${pi.id}/confirm`)
      .set({ Authorization: `Bearer ${pi.clientSecret}` })
      .send({ paymentMethod: { type: 'QR', token: QR_PENDING_TOKEN } })
      .expect(201);
    expect(confirmed.body.paymentIntent.status).toBe('REQUIRES_ACTION');
    expect(await volume()).toMatchObject({ reserved: 60_000, settled: 0 });

    // Backdate as if the QR was shown and never scanned for 25 hours.
    await prisma.paymentIntent.update({ where: { id: pi.id }, data: { updatedAt: new Date(Date.now() - 25 * 60 * 60_000) } });

    const released = await app.get(LimitsService).releaseStale();
    expect(released).toBe(1);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 0 });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: pi.id } })).toMatchObject({ status: 'REQUIRES_ACTION', limitStatus: 'RELEASED' });

    // The bank confirms late, through the same rail-callback path a real QR
    // scan would use. It must still be counted, and never touch status via cancel.
    await http()
      .post('/internal/rails/mock_qr/callback')
      .set({ Authorization: `Bearer ${INTERNAL_RAIL_CALLBACK_SECRET}` })
      .send({ paymentIntentId: pi.id, status: 'succeeded', railReference: 'qr_late_success' })
      .expect(201);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 60_000 });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: pi.id } })).toMatchObject({ status: 'SUCCEEDED', limitStatus: 'SETTLED' });
  });

  it('never checks, reserves or counts TEST-mode payments', async () => {
    const pi = (await http().post('/v1/payment_intents').set({ Authorization: `Bearer ${testKey}` }).send({ amount: 10_000_000, currency: 'BOB' }).expect(201)).body;
    await http().post(`/v1/payment_intents/${pi.id}/confirm`).set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
    expect(await volume()).toBeNull();
  });

  it('keeps KYC photos out of the public uploads route', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a1f60000000049454e44ae426082', 'hex');
    const doc = (await http().post('/v1/merchants/kyc/documents').set({ Authorization: `Bearer ${liveKey}` }).field('slot', 'CI_FRONT').attach('file', png, { filename: 'ci.png', contentType: 'image/png' }).expect(201)).body;
    const stored = await prisma.merchantKycDocument.findUniqueOrThrow({ where: { id: doc.id } });
    await http().get(`/v1/uploads/${stored.storageKey}`).expect(404);
    await http().get(`/v1/uploads/private%2F${stored.storageKey}`).expect(404);
  });

  it('lets only an admin edit a level policy, and audits the change with before and after', async () => {
    await http().patch('/internal/limits/policies/1').set({ Authorization: `Bearer ${opsAgentToken}` }).send({ monthlyLimit: 3_000_000 }).expect(403);
    await http().patch('/internal/limits/policies/1').set({ Authorization: `Bearer ${opsAdminToken}` }).send({ monthlyLimit: 3_000_000 }).expect(200);
    expect(await prisma.auditLogEntry.count({ where: { action: 'limits.policy_updated', targetId: '1' } })).toBeGreaterThan(0);
    // Restore the seeded default so it doesn't leak into other tests in this file.
    await http().patch('/internal/limits/policies/1').set({ Authorization: `Bearer ${opsAdminToken}` }).send({ monthlyLimit: 1_000_000 }).expect(200);
  });

  it("shows the dashboard the merchant's own usage, matching settled volume", async () => {
    await confirm((await createIntent(40_000).expect(201)).body).expect(201);
    const res = await http().get('/v1/dashboard/limits').set({ Authorization: `Bearer ${dashboardSessionToken}` }).expect(200);
    expect(res.body.used).toBe(40_000);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 40_000 });
  });

  it('lets any authenticated ops user view a submitted KYC document, audits the view, and refuses a merchant key', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a1f60000000049454e44ae426082', 'hex');
    const upload = (slot: string) =>
      http().post('/v1/merchants/kyc/documents').set({ Authorization: `Bearer ${liveKey}` }).field('slot', slot).attach('file', png, { filename: `${slot}.png`, contentType: 'image/png' }).expect(201);
    const ciFront = (await upload('CI_FRONT')).body;
    const ciBack = (await upload('CI_BACK')).body;
    const selfie = (await upload('SELFIE')).body;

    const submission = await http()
      .post('/v1/merchants/kyc')
      .set({ Authorization: `Bearer ${liveKey}` })
      .send({
        targetLevel: 2,
        legalName: 'Limits SRL',
        taxId: '1023456028',
        legalRepName: 'Maria Fernanda Rojas',
        legalRepDocumentId: '7654321 LP',
        payoutBankAccount: 'BNB 4012345678',
        ciFrontDocId: ciFront.id,
        ciBackDocId: ciBack.id,
        selfieDocId: selfie.id,
      })
      .expect(201);
    const submissionId = submission.body.id;

    const view = await http().get(`/v1/merchants/kyc/${submissionId}/documents/CI_FRONT`).set({ Authorization: `Bearer ${opsAgentToken}` }).expect(200);
    expect(view.headers['content-type']).toContain('image/png');
    expect(await prisma.auditLogEntry.count({ where: { action: 'kyc.document_viewed', targetId: submissionId } })).toBeGreaterThan(0);

    const res = await http().get(`/v1/merchants/kyc/${submissionId}/documents/CI_FRONT`).set({ Authorization: `Bearer ${liveKey}` });
    expect([401, 403]).toContain(res.status);
  });
});
