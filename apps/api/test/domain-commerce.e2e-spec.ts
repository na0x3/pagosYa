import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DomainCommerceService } from '../src/stores/domains/domain-commerce.service';
import { NamecomProvider } from '../src/stores/domains/namecom.provider';
import { CloudflareHostingProvider } from '../src/stores/domains/cloudflare-hosting.provider';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PaymentIntentsService } from '../src/payment-intents/payment-intents.service';
import { CustomDomainsService } from '../src/stores/custom-domains.service';
import { RefundsService } from '../src/refunds/refunds.service';

describe('Domain shop (HTTP + PostgreSQL, mocked external providers)', () => {
  let app: INestApplication, db: PrismaService, service: DomainCommerceService, config: ConfigService;
  let merchant: string, platform: string, store: string, otherStore: string, token: string, quoteId: string;
  const contact = { firstName: 'Ana', lastName: 'Perez', email: 'ana@example.test', phone: '+59170000000', address1: 'Calle 123', city: 'La Paz', state: 'La Paz', zip: '0000', country: 'BO' };
  const availability = jest.fn(async (names: string[]) => names.map(domainName => ({ domainName, purchasable: true, premium: false, purchaseType: 'registration', purchasePrice: 12, renewalPrice: 15 })));
  const register = jest.fn(async (hostname: string) => ({ domain: { domainName: hostname, expireDate: '2027-10-01T00:00:00Z' }, order: 123, totalPaid: 12 }));
  const getDomain = jest.fn(async (hostname: string) => ({ domainName: hostname, expireDate: '2027-10-01T00:00:00Z', contacts: { registrant: { isVerified: true } } }));
  const ensureRecord = jest.fn(), ensure = jest.fn(async (hostname: string) => ({ id: hostname, hostname, status: 'active', ssl: { status: 'pending_validation' } }));
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NamecomProvider).useValue({ availability, register, getDomain, ensureRecord })
      .overrideProvider(CloudflareHostingProvider).useValue({ ensure }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    for (const interval of app.get(SchedulerRegistry).getIntervals()) app.get(SchedulerRegistry).deleteInterval(interval);
    db = app.get(PrismaService); service = app.get(DomainCommerceService); config = app.get(ConfigService);
    const account = await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'Domain buyer', email: 'domain-buyer@example.test' }).expect(201);
    merchant = account.body.merchant.id; token = account.body.testKeys.secretKey;
    platform = (await db.merchant.create({ data: { name: 'Platform', email: 'domains-platform@example.test', status: 'ACTIVE' } })).id;
    const outsider = await db.merchant.create({ data: { name: 'Other', email: 'domains-other@example.test' } });
    store = (await db.store.create({ data: { merchantId: merchant, name: 'Shop', slug: 'domain-shop' } })).id;
    otherStore = (await db.store.create({ data: { merchantId: outsider.id, name: 'Other', slug: 'domain-other' } })).id;
    config.set('app.domainCommerce', { enabled: true, sandbox: true, username: 'test', token: 'test', platformMerchantId: platform, bobPerUsd: 7, markupPercent: 20, cloudflareToken: 'test', cloudflareZoneId: 'test', target: 'stores.pagosya.bo' });
  });
  afterAll(async () => { await app?.close(); });
  it('protects ownership and rejects missing registrant consent', async () => {
    await request(app.getHttpServer()).get(`/v1/stores/${otherStore}/domain-shop`).set(auth()).expect(404);
    await request(app.getHttpServer()).post(`/v1/stores/${store}/domain-shop/checkout`).set(auth()).send({ quoteId: 'f00' }).expect(400);
    const result = await request(app.getHttpServer()).post(`/v1/stores/${store}/domain-shop/quotes`).set(auth()).send({ hostname: 'merchant-shop.com' }).expect(201);
    quoteId = result.body.id; expect(result.body.amount).toBe(10080);
  });
  it('atomically handles simultaneous checkout retries with one payment and two hostname claims', async () => {
    const body = { quoteId, registrant: contact, accepted: true };
    const results = await Promise.all([service.checkout(merchant, store, body), service.checkout(merchant, store, body)]);
    expect(results[0].checkoutUrl).toBe(results[1].checkoutUrl);
    const order = await db.domainOrder.findUniqueOrThrow({ where: { id: quoteId }, include: { paymentIntent: true, domains: true } });
    expect(order.paymentIntent?.merchantId).toBe(platform);
    expect(order.domains.map(d => d.hostname).sort()).toEqual(['merchant-shop.com', 'www.merchant-shop.com']);
    await service.reconcile(); expect(register).not.toHaveBeenCalled();
    await expect(service.checkout(merchant, otherStore, body)).rejects.toThrow();
  });
  it('rejects non-QR checkout and prevents real registration from a mock payment', async () => {
    const order = await db.domainOrder.findUniqueOrThrow({ where: { id: quoteId }, include: { paymentIntent: true } });
    await expect(app.get(PaymentIntentsService).confirm(order.paymentIntentId!, { paymentMethod: { type: 'CARD', token: 'tok_card_visa' } })).rejects.toThrow('QR');
    await db.domainOrder.update({ where: { id: quoteId }, data: { sandbox: false, nextAttemptAt: new Date(0) } });
    config.set('app.domainCommerce.sandbox', false); config.set('app.banecoQr.enabled', true);
    await db.paymentIntent.update({ where: { id: order.paymentIntentId! }, data: { status: 'SUCCEEDED', railId: 'mock_qr', livemode: true } });
    await service.reconcile(); expect(register).not.toHaveBeenCalled();
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('REVIEW_REQUIRED');
    expect(await db.supportCase.count({ where: { merchantId: merchant } })).toBe(1);
  });
  it('retries uncertain registration using the same key, then waits for both HTTPS certificates', async () => {
    const order = await db.domainOrder.update({ where: { id: quoteId }, data: { status: 'AWAITING_PAYMENT', nextAttemptAt: new Date(0) } });
    await db.paymentIntent.update({ where: { id: order.paymentIntentId! }, data: { railId: 'baneco_qr' } });
    register.mockRejectedValueOnce(new Error('Timeout after registrar committed'));
    await service.reconcile();
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('REGISTERING');
    await db.domainOrder.update({ where: { id: quoteId }, data: { nextAttemptAt: new Date(0) } });
    await service.reconcile();
    expect(register).toHaveBeenCalledTimes(2);
    expect(register.mock.calls[0]).toEqual(register.mock.calls[1]);
    expect(await db.customDomain.count({ where: { domainOrderId: quoteId, status: 'ACTIVE' } })).toBe(0);
    ensure.mockImplementation(async hostname => ({ id: hostname, hostname, status: 'active', ssl: { status: 'active' } }));
    await db.domainOrder.update({ where: { id: quoteId }, data: { nextAttemptAt: new Date(0) } });
    await service.reconcile();
    expect(register).toHaveBeenCalledTimes(2);
    expect(await db.customDomain.count({ where: { domainOrderId: quoteId, status: 'ACTIVE' } })).toBe(2);
    expect(ensureRecord).toHaveBeenCalledWith('merchant-shop.com', '', 'ANAME', 'stores.pagosya.bo');
    expect(ensureRecord).toHaveBeenCalledWith('merchant-shop.com', 'www', 'CNAME', 'stores.pagosya.bo');
  });
  it('does not allow manual verification or disconnection to bypass managed-domain status', async () => {
    const domain = await db.customDomain.findFirstOrThrow({ where: { domainOrderId: quoteId } });
    await request(app.getHttpServer()).post(`/v1/stores/${store}/domains/${domain.id}/verify`).set(auth()).expect(400);
    await request(app.getHttpServer()).delete(`/v1/stores/${store}/domains/${domain.id}`).set(auth()).expect(400);
  });
  it('blocks ordinary refunds once registration has started and does not resolve an expired domain', async () => {
    const order = await db.domainOrder.findUniqueOrThrow({ where: { id: quoteId } });
    await expect(app.get(RefundsService).create(platform, { paymentIntentId: order.paymentIntentId! }, 'domain-refund-test')).rejects.toThrow('conciliarlo');
    await db.merchant.update({ where: { id: merchant }, data: { status: 'ACTIVE' } });
    await db.domainOrder.update({ where: { id: quoteId }, data: { expiresAt: new Date(0) } });
    await expect(app.get(CustomDomainsService).resolve('merchant-shop.com')).rejects.toThrow();
  });
  it('cancels an unpaid purchase and releases both names without a registration', async () => {
    const fresh = await db.store.create({ data: { merchantId: merchant, name: 'Cancelable', slug: 'domain-cancel' } });
    const quote = await service.quote(merchant, fresh.id, 'cancelable-shop.com');
    await service.checkout(merchant, fresh.id, { quoteId: quote.id, registrant: contact, accepted: true });
    const count = register.mock.calls.length;
    await service.cancel(merchant, fresh.id, quote.id);
    expect(await db.customDomain.count({ where: { domainOrderId: quote.id } })).toBe(0);
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('CANCELED');
    expect(register).toHaveBeenCalledTimes(count);
  });
  it('keeps a stale price out of registration and creates a support case after payment', async () => {
    const fresh = await db.store.create({ data: { merchantId: merchant, name: 'Changed price', slug: 'domain-price' } });
    const quote = await service.quote(merchant, fresh.id, 'changed-price.com');
    await service.checkout(merchant, fresh.id, { quoteId: quote.id, registrant: contact, accepted: true });
    const order = await db.domainOrder.findUniqueOrThrow({ where: { id: quote.id } });
    await db.paymentIntent.update({ where: { id: order.paymentIntentId! }, data: { status: 'SUCCEEDED', railId: 'baneco_qr', livemode: true } });
    availability.mockResolvedValueOnce([{ domainName: order.hostname, purchasable: true, premium: false, purchaseType: 'registration', purchasePrice: 99, renewalPrice: 15 }]);
    const count = register.mock.calls.length; await service.reconcile();
    expect(register).toHaveBeenCalledTimes(count);
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('REVIEW_REQUIRED');
  });
});
