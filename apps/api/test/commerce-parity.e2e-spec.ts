import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { createHmac, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { PaymentIntentsService } from '../src/payment-intents/payment-intents.service';
import { CreditExpiryService } from '../src/commerce-platform/credit-expiry.service';
import { PrivateFilesService } from '../src/commerce-platform/private-files.service';

describe('Credit ledger and digital delivery', () => {
  let app: INestApplication, db: PrismaService, payments: PaymentIntentsService;
  let token: string, other: string, store: any, product: any;
  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  const management = (path = '') => `/v1/stores/${store.id}/commerce${path}`;
  const checkout = (code?: string, productId = product.id) => request(app.getHttpServer()).post(`/v1/stores/public/${store.slug}/cart-checkout`).send({ items: [{ paymentLinkId: productId, quantity: 1 }], ...(code ? { creditCode: code } : {}) });
  async function issue(amount = 5000) { return (await request(app.getHttpServer()).post(management('/credits')).set(auth()).send({ reference: randomUUID(), label: 'Tarjeta de prueba', kind: 'GIFT_CARD', amount, currency: 'BOB' }).expect(201)).body; }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService); payments = app.get(PaymentIntentsService);
    for (const name of ['CreditOwner', 'CreditOther']) {
      const m = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name.endsWith('Owner')) token = m.testKeys.secretKey; else other = m.testKeys.secretKey;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Digital' }).expect(201)).body;
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Guía', amount: 10000, currency: 'BOB' }).expect(201)).body;
  });
  afterAll(async () => {
    if (db && store) for (const asset of await db.digitalAsset.findMany({ where: { storeId: store.id } })) await app.get(PrivateFilesService).remove(asset.storageKey);
    await app?.close();
  });
  it('scopes management and idempotent issuance, reserves credit without overspending, restores canceled and abandoned carts', async () => {
    const body = { reference: randomUUID(), label: 'Reembolso', kind: 'STORE_CREDIT', amount: 5000, currency: 'BOB' };
    const credit = (await request(app.getHttpServer()).post(management('/credits')).set(auth()).send(body).expect(201)).body;
    expect((await request(app.getHttpServer()).post(management('/credits')).set(auth()).send(body).expect(201)).body.code).toBe(credit.code);
    await request(app.getHttpServer()).post(management('/credits')).set(auth()).send({ ...body, amount: 6000 }).expect(409);
    await request(app.getHttpServer()).get(management()).set(auth(other)).expect(404);
    await request(app.getHttpServer()).get(management()).expect(401);
    const results = await Promise.all([checkout(credit.code), checkout(credit.code)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 400]);
    const intent = results.find(r => r.status === 201)!.body;
    expect(intent.amount).toBe(5000);
    expect(await db.storeOrder.findUnique({ where: { paymentIntentId: intent.id } })).toMatchObject({ amount: 10000 });
    await payments.cancelById(intent.id);
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 5000 });
    const abandoned = (await checkout(credit.code).expect(201)).body;
    const old = new Date(Date.now() - 3600000);
    await db.paymentIntent.update({ where: { id: abandoned.id }, data: { createdAt: old } });
    await db.storeCreditReservation.update({ where: { paymentIntentId: abandoned.id }, data: { createdAt: old } });
    await app.get(CreditExpiryService).releaseAbandoned();
    expect(await db.paymentIntent.findUnique({ where: { id: abandoned.id } })).toMatchObject({ status: 'CANCELED' });
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 5000 });
  });
  it('commits partial credit on rail success and refunds only its own portion idempotently', async () => {
    const credit = await issue(); const intent = (await checkout(credit.code).expect(201)).body;
    await payments.confirm(intent.id, { paymentMethod: { type: 'CARD', token: 'tok_visa_success' } });
    expect(await db.storeCreditReservation.findUnique({ where: { paymentIntentId: intent.id } })).toMatchObject({ status: 'COMMITTED', amount: 5000 });
    expect(await db.transaction.findFirst({ where: { paymentIntentId: intent.id, status: 'SUCCEEDED' } })).toMatchObject({ amount: 5000 });
    const order = await db.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: intent.id } });
    const body = { reference: randomUUID(), amount: 3000 };
    const path = management(`/orders/${order.id}/credit-refund`);
    await request(app.getHttpServer()).post(path).set(auth(other)).send(body).expect(404);
    await request(app.getHttpServer()).post(path).set(auth()).send(body).expect(201);
    await request(app.getHttpServer()).post(path).set(auth()).send(body).expect(201);
    await request(app.getHttpServer()).post(path).set(auth()).send({ reference: randomUUID(), amount: 3000 }).expect(400);
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 3000 });
  });
  it('releases failed payments, then reacquires the same credit before retrying', async () => {
    const credit = await issue(); const intent = (await checkout(credit.code).expect(201)).body;
    await payments.confirm(intent.id, { paymentMethod: { type: 'CARD', token: 'tok_charge_declined' } });
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 5000 });
    await payments.confirm(intent.id, { paymentMethod: { type: 'CARD', token: 'tok_visa_success' } });
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 0 });
    expect(await db.storeCreditReservation.findUnique({ where: { paymentIntentId: intent.id } })).toMatchObject({ status: 'COMMITTED' });
  });
  it('serves escaped published articles, canonical metadata, feeds and cycle-safe scoped redirects', async () => {
    const content = `/v1/stores/${store.id}/commerce-content/articles`;
    const article = { slug: 'guia', locale: 'es', title: 'Guía & consejos', excerpt: 'Una guía de prueba.', author: 'La marca', body: '<script>alert(1)</script>\n\nContenido seguro.', publishedAt: new Date(Date.now() - 1000).toISOString() };
    await request(app.getHttpServer()).put(content).set(auth()).send(article).expect(200);
    await request(app.getHttpServer()).put(content).set(auth()).send({ ...article, slug: 'borrador', publishedAt: null }).expect(200);
    await request(app.getHttpServer()).put(`/v1/stores/${store.id}/brand`).set(auth()).send({ revision: 0, confirmed: [{ field: 'background', value: '#eeeeee', evidence: 'Brand guide', source: 'merchant' }], suggested: [] }).expect(200);
    const publicBase = `/v1/stores/public/${store.slug}`;
    const page = await request(app.getHttpServer()).get(`${publicBase}/pages/es/guia`).expect(200);
    expect(page.headers['content-type']).toContain('text/html'); expect(page.text).toContain('rel="canonical"'); expect(page.text).toContain('&lt;script&gt;'); expect(page.text).not.toContain('<script>alert'); expect(page.text).toContain('--article-bg:#eeeeee');
    await request(app.getHttpServer()).get(`${publicBase}/pages/es/borrador`).expect(404);
    for (const endpoint of ['pages', 'rss.xml', 'sitemap.xml']) {
      const response = await request(app.getHttpServer()).get(`${publicBase}/${endpoint}`).expect(200);
      expect(response.text).toContain('/pages/es/guia'); expect(response.text).not.toContain('borrador');
    }
    await request(app.getHttpServer()).post(management('/redirects')).set(auth(other)).send({ fromPath: '/es/antes', toPath: '/es/guia' }).expect(404);
    await request(app.getHttpServer()).post(management('/redirects')).set(auth()).send({ fromPath: '/es/antes', toPath: 'https://evil.example' }).expect(400);
    await request(app.getHttpServer()).post(management('/redirects')).set(auth()).send({ fromPath: '/es/antes', toPath: '/es/guia' }).expect(201);
    await request(app.getHttpServer()).post(management('/redirects')).set(auth()).send({ fromPath: '/es/guia', toPath: '/es/antes' }).expect(400);
    expect((await request(app.getHttpServer()).get(`${publicBase}/pages/es/antes`).expect(301)).headers.location).toContain('/pages/es/guia');
  });
  it('rejects a selected shipping rate outside its destination and snapshots the accepted destination', async () => {
    const rate = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/operations/delivery/zones`).set(auth()).send({ name: 'Postal limitado', fee: 1000, countryCodes: ['CA'], postalPrefixes: ['K1A'] }).expect(201)).body;
    await db.store.update({ where: { id: store.id }, data: { shippingEnabled: true } });
    const cart = { items: [{ paymentLinkId: product.id, quantity: 1 }], fulfillmentMethod: 'delivery', shippingZoneId: rate.id, shippingAddress: 'Dirección de prueba', shippingCountry: 'US', shippingPostalCode: 'K1A 0B1' };
    await request(app.getHttpServer()).post(`/v1/stores/public/${store.slug}/cart-checkout`).send(cart).expect(400);
    const accepted = (await request(app.getHttpServer()).post(`/v1/stores/public/${store.slug}/cart-checkout`).send({ ...cart, shippingCountry: 'CA' }).expect(201)).body;
    expect(accepted.amount).toBe(11000); expect(accepted.metadata.shipping).toMatchObject({ country: 'CA', postalCode: 'K1A 0B1' });
  });
  it('delivers only snapshotted paid files, skips physical shipping and revokes full refunds', async () => {
    const path = management(`/products/${product.id}/files`);
    await request(app.getHttpServer()).post(path).set(auth(other)).attach('file', Buffer.from('%PDF-1.4\nprivate guide'), 'guide.pdf').expect(404);
    const asset = (await request(app.getHttpServer()).post(path).set(auth()).attach('file', Buffer.from('%PDF-1.4\nprivate guide'), 'guide.pdf').expect(201)).body;
    await db.store.update({ where: { id: store.id }, data: { shippingEnabled: true, locations: [{ id: 'branch', name: 'Local', pickupEnabled: true, deliveryEnabled: true }] } });
    const unpaid = (await checkout().expect(201)).body;
    await request(app.getHttpServer()).get(`/v1/commerce/orders/${unpaid.trackingToken}/downloads`).expect(404);
    const credit = await issue(15000); const paid = (await checkout(credit.code).expect(201)).body;
    expect(paid).toMatchObject({ amount: 0, status: 'SUCCEEDED' });
    expect(await db.transaction.count({ where: { paymentIntentId: paid.id } })).toBe(0);
    const order = await db.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order.status).toBe('PAID'); expect(order.fulfillmentLocationId).toBeNull();
    expect((order.items as any)[0].digitalAssetIds).toEqual([asset.id]);
    await request(app.getHttpServer()).patch(management(`/files/${asset.id}`)).set(auth()).send({ active: false }).expect(200);
    await checkout(credit.code).expect(400);
    await request(app.getHttpServer()).post(path).set(auth()).attach('file', Buffer.from('%PDF-1.4 replacement'), 'new-guide.pdf').expect(201);
    const downloads = (await request(app.getHttpServer()).get(`/v1/commerce/orders/${paid.trackingToken}/downloads`).expect(200)).body;
    expect(downloads).toHaveLength(1); expect(downloads[0].filename).toBe('guide.pdf');
    const file = await request(app.getHttpServer()).get(downloads[0].url).expect(200);
    expect(file.headers['cache-control']).toContain('no-store'); expect(file.headers['content-disposition']).toContain('attachment');
    await request(app.getHttpServer()).get(downloads[0].url + 'x').expect(404);
    const expired = Buffer.from(JSON.stringify({ order: order.id, asset: asset.id, exp: Math.floor(Date.now() / 1000) - 1 })).toString('base64url');
    const signature = createHmac('sha256', 'e2e-order-tracking-secret').update(`digital:${expired}`).digest('base64url');
    await request(app.getHttpServer()).get(`/v1/commerce/downloads/${expired}.${signature}`).expect(404);
    const privateFile = await db.digitalAsset.findUniqueOrThrow({ where: { id: asset.id } });
    await request(app.getHttpServer()).get(`/v1/uploads/${privateFile.storageKey}`).expect(404);
    await request(app.getHttpServer()).delete(`/v1/stores/${store.id}/payment_links/${product.id}`).set(auth()).expect(400);

    await request(app.getHttpServer()).post(management(`/orders/${order.id}/credit-refund`)).set(auth()).send({ reference: randomUUID(), amount: 10000 }).expect(201);
    await request(app.getHttpServer()).get(downloads[0].url).expect(404);
    await request(app.getHttpServer()).get(`/v1/commerce/orders/${paid.trackingToken}/downloads`).expect(404);
  });
  it('fulfills mixed carts from physical branch stock without requiring digital branch inventory', async () => {
    const physical = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Libro impreso', amount: 10000, currency: 'BOB' }).expect(201)).body;
    await db.paymentLink.update({ where: { id: physical.id }, data: { stock: 2, locationStocks: { branch: 2 } } });
    const credit = await issue(30000);
    const cart = { creditCode: credit.code, locationId: 'branch', fulfillmentMethod: 'pickup' as const, items: [{ paymentLinkId: physical.id, quantity: 1 }, { paymentLinkId: product.id, quantity: 1 }] };
    const paid = await app.get(StoresService).createCartCheckout(store.slug, cart);
    expect(paid).toMatchObject({ amount: 0, status: 'SUCCEEDED' });
    expect(await db.paymentLink.findUnique({ where: { id: physical.id } })).toMatchObject({ stock: 1, locationStocks: { branch: 1 } });
    expect(await db.storeCredit.findUnique({ where: { id: credit.id } })).toMatchObject({ balance: 10000 });
  });

});
