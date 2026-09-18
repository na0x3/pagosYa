import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Brand memory and shipping checkout', () => {
  let app: INestApplication, prisma: PrismaService, token: string, other: string, storeId: string, slug: string, productId: string, rateId: string;
  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    for (const name of ['BrandShippingOwner', 'BrandShippingOther']) {
      const result = await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201);
      if (name.endsWith('Owner')) token = result.body.testKeys.secretKey; else other = result.body.testKeys.secretKey;
    }
    const store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Tienda de prueba' }).expect(201)).body;
    storeId = store.id; slug = store.slug;
    productId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Café', amount: 10000, currency: 'BOB', shippingWeightGrams: 500 }).expect(201)).body.id;
  });
  afterAll(async () => { await app?.close(); });
  it('persists confirmed facts, rejects stale saves, isolates merchants and keeps brand private', async () => {
    const path = `/v1/stores/${storeId}/brand`;
    expect((await request(app.getHttpServer()).get(path).set(auth()).expect(200)).body.revision).toBe(0);
    const data = { revision: 0, confirmed: [{ field: 'accent', value: '#135724', evidence: 'Guía oficial', source: 'merchant' }], suggested: [] };
    await request(app.getHttpServer()).put(path).set(auth()).send(data).expect(200);
    await request(app.getHttpServer()).put(path).set(auth()).send(data).expect(409);
    await request(app.getHttpServer()).get(path).set(auth(other)).expect(404);
    await request(app.getHttpServer()).get(path).expect(401);
    expect((await request(app.getHttpServer()).get(path).set(auth()).expect(200)).body.data.confirmed[0].value).toBe('#135724');
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(200)).body).not.toHaveProperty('brandProfile');
    const history = (await request(app.getHttpServer()).get(`${path}/history`).set(auth()).expect(200)).body;
    expect(history).toHaveLength(1); expect(history[0].data.confirmed[0].value).toBe('#135724');
    await request(app.getHttpServer()).put(path).set(auth()).send({ ...data, revision: 1, confirmed: [] }).expect(200);
    await request(app.getHttpServer()).post(`${path}/restore`).set(auth()).send({ revision: 2, targetRevision: 1 }).expect(201);
    expect((await request(app.getHttpServer()).get(path).set(auth()).expect(200)).body).toMatchObject({ revision: 3, data: { confirmed: data.confirmed } });
    expect((await request(app.getHttpServer()).get(`${path}/history`).set(auth()).expect(200)).body).toHaveLength(3);

  });
  it('quotes without creating payments, then charges shipping and records the same fee atomically', async () => {
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth(other)).send({ weightGrams: 10 }).expect(404);
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: -1 }).expect(400);
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 500 }).expect(200);
    rateId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'La Paz', fee: 1500, freeAbove: 20000, maximumWeightGrams: 2000 }).expect(201)).body.id;
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/shipping`).set(auth()).send({ enabled: true, pickupEnabled: true }).expect(201);
    const before = await prisma.paymentIntent.count();
    const cart = { items: [{ paymentLinkId: productId, quantity: 1 }], fulfillmentMethod: 'delivery', shippingZoneId: rateId, shippingAddress: 'Calle de prueba 123, La Paz' };
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send(cart).expect(201)).body;
    expect(quote).toMatchObject({ amount: 11500, shippingAmount: 1500 });
    expect(await prisma.paymentIntent.count()).toBe(before);
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart).expect(201)).body;
    expect(paid.amount).toBe(11500);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order.amount).toBe(11500); expect(order.fulfillmentMethod).toBe('delivery');
    expect(await prisma.deliveryAssignment.findUnique({ where: { orderId: order.id } })).toMatchObject({ fee: 1500, zoneId: rateId, address: cart.shippingAddress });
    expect((await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart, items: [{ paymentLinkId: productId, quantity: 2 }] }).expect(201)).body.shippingAmount).toBe(0);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart, shippingZoneId: 'foreign' }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart, shippingAmount: 0 }).expect(400);
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/rates/${rateId}`).set(auth(other)).send({ active: false }).expect(404);
  });
  it('keeps draft and scheduled articles private, enforces revisions and isolates management', async () => {
    const path = `/v1/stores/${storeId}/commerce-content`;
    const article = { slug: 'nuestro-cafe', locale: 'es', title: 'Nuestro café', excerpt: 'Origen', body: 'Cultivado en Bolivia.', author: 'La marca', publishedAt: null };
    const saved = (await request(app.getHttpServer()).put(`${path}/articles`).set(auth()).send(article).expect(200)).body;
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/content`).expect(200)).body.articles).toEqual([]);
    const future = new Date(Date.now() + 86400000).toISOString();
    await request(app.getHttpServer()).put(`${path}/articles`).set(auth()).send({ ...article, revision: saved.revision, publishedAt: future }).expect(200);
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/content`).expect(200)).body.articles).toEqual([]);
    await request(app.getHttpServer()).put(`${path}/articles`).set(auth()).send({ ...article, revision: saved.revision }).expect(409);
    await request(app.getHttpServer()).put(`${path}/articles`).set(auth()).send({ ...article, revision: saved.revision + 1, publishedAt: new Date(Date.now() - 1000).toISOString() }).expect(200);
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/content`).expect(200)).body.articles).toEqual([expect.objectContaining({ title: article.title })]);
    await request(app.getHttpServer()).get(path).set(auth(other)).expect(404);
  });
  it('applies bundles before shipping thresholds, permits only paid-purchase reviews, and moderates publication', async () => {
    const path = `/v1/stores/${storeId}/commerce-content`;
    const bundle = (await request(app.getHttpServer()).post(`${path}/bundles`).set(auth()).send({ name: 'Dos cafés', kind: 'FIXED', items: [{ productId, quantity: 2 }], minimumQuantity: 2, discountPercent: 10 }).expect(201)).body;
    const cart = { items: [{ paymentLinkId: productId, quantity: 2 }], fulfillmentMethod: 'delivery', shippingZoneId: rateId, shippingAddress: 'Calle de prueba 123' };
    expect((await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send(cart).expect(201)).body).toMatchObject({ subtotal: 20000, discountAmount: 2000, shippingAmount: 1500, amount: 19500 });
    const checkout = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart).expect(201)).body;
    expect(checkout.amount).toBe(19500);
    const review = { trackingToken: checkout.trackingToken, productId, displayName: 'Compradora', rating: 5, body: 'Excelente café.' };
    const reviewPath = `/v1/stores/public/${slug}/content/reviews`;
    await request(app.getHttpServer()).post(reviewPath).send(review).expect(400);
    await prisma.paymentIntent.update({ where: { id: checkout.id }, data: { status: 'SUCCEEDED' } });
    await request(app.getHttpServer()).post(reviewPath).send({ ...review, productId: 'not-purchased' }).expect(400);
    await request(app.getHttpServer()).post(reviewPath).send(review).expect(201);
    await request(app.getHttpServer()).post(reviewPath).send(review).expect(409);
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/content`).expect(200)).body.reviews).toEqual([]);
    const pending = (await request(app.getHttpServer()).get(path).set(auth()).expect(200)).body.reviews[0];
    await request(app.getHttpServer()).patch(`${path}/reviews/${pending.id}`).set(auth(other)).send({ status: 'PUBLISHED' }).expect(404);
    await request(app.getHttpServer()).patch(`${path}/reviews/${pending.id}`).set(auth()).send({ status: 'PUBLISHED' }).expect(200);
    const published = (await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/content`).expect(200)).body.reviews[0];
    expect(published).toMatchObject({ rating: 5, displayName: 'Compradora' }); expect(published).not.toHaveProperty('orderId');
    await request(app.getHttpServer()).patch(`${path}/bundles/${bundle.id}`).set(auth()).send({ active: false }).expect(200);
    expect((await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send(cart).expect(201)).body).toMatchObject({ discountAmount: 0, shippingAmount: 0, amount: 20000 });
  });

});
