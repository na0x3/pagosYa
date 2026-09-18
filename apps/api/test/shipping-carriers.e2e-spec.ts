import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShipmentBookingWorker } from '../src/shipping/shipment-booking.worker';

describe('Carrier shipping checkout', () => {
  let app: INestApplication, prisma: PrismaService, token: string, storeId: string, slug: string, productId: string, rateId: string, merchantId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const destination = { department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: 'Portón verde', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '+59171234567' };
  const pay = (paid: any) => request(app.getHttpServer()).post(`/v1/payment_intents/${paid.id}/confirm`).set({ Authorization: `Bearer ${paid.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    token = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'CarrierOwner', email: 'carrier-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body.testKeys.secretKey;
    const store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Tienda Courier' }).expect(201)).body;
    storeId = store.id; slug = store.slug;
    productId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Café', amount: 10000, currency: 'BOB', shippingWeightGrams: 500 }).expect(201)).body.id;
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/shipping`).set(auth()).send({ enabled: true, pickupEnabled: false }).expect(201);
    merchantId = (await prisma.store.update({ where: { id: storeId }, data: { shippingCarriersEnabled: true } })).merchantId;
    rateId = (await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Servientrega · Santa Cruz', fee: 2500, currency: 'BOB', departments: ['SANTA_CRUZ'], carrierId: 'car_servientrega' } })).id;
  });
  afterAll(async () => { await app?.close(); });

  const cart = () => ({ items: [{ paymentLinkId: productId, quantity: 1 }], fulfillmentMethod: 'delivery', shippingZoneId: rateId, shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: destination });

  it('offers the carrier rate only for its department', async () => {
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
    expect(quote.shippingOptions).toEqual([expect.objectContaining({ id: rateId, amount: 2500, carrierId: 'car_servientrega' })]);
    const lp = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, shippingDestination: { ...destination, department: 'LA_PAZ' } }).expect(201)).body;
    expect(lp.shippingOptions).toEqual([]);
  });

  it('requires a structured destination for carrier rates and rejects pins outside Bolivia', async () => {
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingDestination: undefined }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingDestination: { ...destination, lat: -12.05, lng: -77.04 } }).expect(400);
  });

  it('creates an unarmed shipment at checkout, arms it on payment and books it with a waybill', async () => {
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    expect(paid.amount).toBe(12500);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order).toMatchObject({ shippingDepartment: 'SANTA_CRUZ', shippingCity: 'Santa Cruz', recipientPhone: '+59171234567', shippingLat: -17.78 });
    expect(await prisma.shipment.findUnique({ where: { orderId: order.id } })).toMatchObject({ status: 'BOOKING', nextAttemptAt: null, quotedAmount: 2500, carrierId: 'car_servientrega', quoteId: rateId });
    await pay(paid);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).nextAttemptAt).not.toBeNull();
    await app.get(ShipmentBookingWorker).tick();
    const booked = await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(booked.status).toBe('BOOKED'); expect(booked.labelFileId).toMatch(/^[a-f\d-]{36}$/);
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PREPARING');
  });

  it('cancels the shipment when the merchant cancels the order', async () => {
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    await pay(paid);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    await request(app.getHttpServer()).patch(`/v1/orders/${order.id}/fulfillment`).set(auth()).send({ status: 'CANCELED' }).expect(200);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('CANCELED');
  });

  it('leaves own-rider rates on the old path (no shipment row)', async () => {
    const own = await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Moto propia', fee: 1000, currency: 'BOB' } });
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: own.id, shippingDestination: undefined }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(await prisma.shipment.findUnique({ where: { orderId: order.id } })).toBeNull();
    expect(await prisma.deliveryAssignment.findUnique({ where: { orderId: order.id } })).not.toBeNull();
  });
});
