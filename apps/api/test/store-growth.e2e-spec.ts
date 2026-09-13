import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';

describe('Store growth: inbox, attribution and owner isolation', () => {
  let app: INestApplication, prisma: PrismaService, token: string, foreignToken: string, storeId: string, slug: string, productId: string, route: string;
  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  const email = { send: jest.fn().mockRejectedValue(new Error('Mail unavailable')) };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(email).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    for (const name of ['GrowthOwner', 'GrowthOther']) {
      const result = await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@growth.example`, settlementMode: 'AGGREGATOR' }).expect(201);
      if (name === 'GrowthOwner') token = result.body.testKeys.secretKey; else foreignToken = result.body.testKeys.secretKey;
    }
    const store = await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Growth Store', contactFormEnabled: true }).expect(201);
    storeId = store.body.id; slug = store.body.slug; route = `/v1/stores/${storeId}/growth`;
    const product = await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Café', amount: 10000, currency: 'BOB' }).expect(201);
    productId = product.body.id;
  });
  afterAll(async () => { await app?.close(); });
  it('persists a public inquiry even if email fails, lets the owner resolve it, and rejects another merchant', async () => {
    const result = await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/leads`).send({ items: [], name: 'Cliente de prueba', email: 'prueba@example.com', phone: '+59170000000', message: '¿Tienen entregas?' }).expect(201);
    const inbox = await request(app.getHttpServer()).get(`${route}/inbox`).set(auth()).expect(200);
    expect(inbox.body.unread).toBe(1); expect(inbox.body.items[0]).toMatchObject({ id: result.body.leadId, message: '¿Tienen entregas?', status: 'NEW' });
    await request(app.getHttpServer()).get(`${route}/inbox`).expect(401);
    await request(app.getHttpServer()).get(`${route}/inbox`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).patch(`${route}/inbox/${result.body.leadId}`).set(auth(foreignToken)).send({ status: 'RESOLVED' }).expect(404);
    await request(app.getHttpServer()).patch(`${route}/inbox/${result.body.leadId}`).set(auth()).send({ status: 'INVALID' }).expect(400);
    await request(app.getHttpServer()).patch(`${route}/inbox/${result.body.leadId}`).set(auth()).send({ status: 'RESOLVED' }).expect(200);
    expect((await request(app.getHttpServer()).get(`${route}/inbox?status=NEW`).set(auth()).expect(200)).body.items).toEqual([]);
  });
  it('validates partner rates, attributes checkout on the server and excludes sandbox sales', async () => {
    await request(app.getHttpServer()).post(`${route}/partners`).set(auth()).send({ name: 'Socio', commissionBps: 10001 }).expect(400);
    const partner = (await request(app.getHttpServer()).post(`${route}/partners`).set(auth()).send({ name: 'Socio de prueba', commissionBps: 1000 }).expect(201)).body;
    const checkout = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ partnerCode: partner.code, items: [{ paymentLinkId: productId, quantity: 1 }] }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: checkout.id } });
    expect(order).toMatchObject({ partnerId: partner.id, partnerCommissionBps: 1000 });
    await prisma.paymentIntent.update({ where: { id: checkout.id }, data: { status: 'SUCCEEDED' } });
    const sandbox = (await request(app.getHttpServer()).get(`${route}/insights`).set(auth()).expect(200)).body;
    expect(sandbox.partnerSales).toEqual([]);
    await prisma.paymentIntent.update({ where: { id: checkout.id }, data: { livemode: true } });
    await prisma.transaction.create({ data: { paymentIntentId: checkout.id, type: 'REFUND', status: 'SUCCEEDED', amount: 2500, railId: 'test' } });
    await prisma.transaction.create({ data: { paymentIntentId: checkout.id, type: 'REFUND', status: 'FAILED', amount: 2000, railId: 'test' } });
    const live = (await request(app.getHttpServer()).get(`${route}/insights`).set(auth()).expect(200)).body;
    expect(live.partnerSales[0]).toMatchObject({ netSales: 7500, commission: 750, paidOrders: 1 });
    await request(app.getHttpServer()).patch(`${route}/partners/${partner.id}`).set(auth()).send({ active: false }).expect(200);
    const paused = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ partnerCode: partner.code, items: [{ paymentLinkId: productId, quantity: 1 }] }).expect(201)).body;
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paused.id } })).partnerId).toBeNull();
    await request(app.getHttpServer()).get(`${route}/partners`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).get(`${route}/insights`).set(auth(foreignToken)).expect(404);
  });
});
