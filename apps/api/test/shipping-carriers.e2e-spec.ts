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
    // New stores start private; the public quote and checkout endpoints only serve visible ones.
    await prisma.store.update({ where: { id: storeId }, data: { publicVisibility: true } });
    productId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Café', amount: 10000, currency: 'BOB', shippingWeightGrams: 500 }).expect(201)).body.id;
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/shipping`).set(auth()).send({ enabled: true, pickupEnabled: false, carriersEnabled: true, prepMinutes: 45 }).expect(201);
    merchantId = (await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).merchantId;
    rateId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Servientrega · Santa Cruz', fee: 2500, departments: ['SANTA_CRUZ'], carrierId: 'car_servientrega' }).expect(201)).body.id;
  });
  afterAll(async () => { await app?.close(); });

  const cart = () => ({ items: [{ paymentLinkId: productId, quantity: 1 }], fulfillmentMethod: 'delivery', shippingZoneId: rateId, shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: destination });

  it('offers the carrier rate only for its department', async () => {
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
    expect(quote.shippingOptions).toEqual([expect.objectContaining({ id: rateId, amount: 2500, carrierId: 'car_servientrega' })]);
    const lp = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, shippingDestination: { ...destination, department: 'LA_PAZ' } }).expect(201)).body;
    expect(lp.shippingOptions).toEqual([]);
  });

  it('quotes carrier rates by department alone and rejects an unknown department', async () => {
    const byDepartment = { ...cart(), shippingDestination: undefined, shippingZoneId: undefined, shippingDepartment: 'SANTA_CRUZ' };
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send(byDepartment).expect(201)).body;
    expect(quote.shippingOptions).toEqual([expect.objectContaining({ id: rateId, carrierId: 'car_servientrega' })]);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...byDepartment, shippingDepartment: 'LIMA' }).expect(400);
  });

  it('hides carrier rates and refuses them at checkout while carriers are turned off', async () => {
    await prisma.store.update({ where: { id: storeId }, data: { shippingCarriersEnabled: false } });
    try {
      const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
      expect(quote.shippingOptions).toEqual([]);
      await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(400);
    } finally {
      await prisma.store.update({ where: { id: storeId }, data: { shippingCarriersEnabled: true } });
    }
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

  it('a partial refund keeps the shipment; the refund that completes it cancels the shipment before booking', async () => {
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    await pay(paid);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    const refund = (amount: number, key: string) => request(app.getHttpServer()).post('/v1/refunds').set(auth()).set('Idempotency-Key', key).send({ paymentIntentId: paid.id, amount }).expect(201);
    await refund(2500, `ship-partial-${order.id}`);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('BOOKING');
    await refund(paid.amount - 2500, `ship-rest-${order.id}`);
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id }, include: { events: true } });
    expect(shipment).toMatchObject({ status: 'CANCELED', nextAttemptAt: null, labelFileId: null });
    expect(shipment.events.map(e => e.description)).toEqual(['Envío cancelado con el pedido']);
    await app.get(ShipmentBookingWorker).tick();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('CANCELED');
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('leaves own-rider rates on the old path (no shipment row)', async () => {
    const own = await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Moto propia', fee: 1000, currency: 'BOB' } });
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: own.id, shippingDestination: undefined }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(await prisma.shipment.findUnique({ where: { orderId: order.id } })).toBeNull();
    expect(await prisma.deliveryAssignment.findUnique({ where: { orderId: order.id } })).not.toBeNull();
  });

  it('lets the merchant see the shipment, download the waybill, add tracking and mark delivered', async () => {
    const settings = (await request(app.getHttpServer()).get(`/v1/stores/${storeId}/shipping`).set(auth()).expect(200)).body;
    expect(settings).toMatchObject({ carriersEnabled: true, prepMinutes: 45 });
    expect(settings.carriers.map((c: any) => c.code)).toEqual(expect.arrayContaining(['servientrega', 'ocs', 'correos_bo']));
    expect(settings.carriers.map((c: any) => c.code)).not.toContain('dhl_express');
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'X', fee: 1, departments: ['LIMA'] }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Y', fee: 1, carrierId: 'car_dhl_express' }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Z', fee: 1, carrierId: '' }).expect(400);

    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    await pay(paid);
    await app.get(ShipmentBookingWorker).tick();
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    const view = (await request(app.getHttpServer()).get(`/v1/orders/${order.id}/shipment`).set(auth()).expect(200)).body;
    expect(view).toMatchObject({ status: 'BOOKED', hasLabel: true, carrier: { code: 'servientrega' } });
    const pdf = await request(app.getHttpServer()).get(`/v1/shipments/${view.id}/label`).set(auth()).buffer(true)
      .parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', d => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const other = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'CarrierOther', email: 'carrier-other@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body.testKeys.secretKey;
    const otherLabel = await request(app.getHttpServer()).get(`/v1/shipments/${view.id}/label`).set({ Authorization: `Bearer ${other}` }).expect(404);
    expect(otherLabel.headers['content-type']).toContain('application/json');
    await request(app.getHttpServer()).post(`/v1/shipments/${view.id}/tracking`).set({ Authorization: `Bearer ${other}` }).send({ trackingNumber: 'SV-000123' }).expect(404);
    const tracked = (await request(app.getHttpServer()).post(`/v1/shipments/${view.id}/tracking`).set(auth()).send({ trackingNumber: 'SV-000123' }).expect(201)).body;
    expect(tracked).toMatchObject({ status: 'IN_TRANSIT', trackingNumber: 'SV-000123' });
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SHIPPED');
    await request(app.getHttpServer()).post(`/v1/shipments/${view.id}/delivered`).set(auth()).expect(201);
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');

    const trackedByBuyer = (await request(app.getHttpServer()).get(`/v1/orders/track/${paid.trackingToken}`).expect(200)).body;
    expect(trackedByBuyer.shipment).toMatchObject({ carrierName: 'Servientrega Bolivia', trackingNumber: 'SV-000123', status: 'DELIVERED' });
    expect(JSON.stringify(trackedByBuyer.shipment)).not.toMatch(/labelFileId|recipientPhone|lastError/);
  });

  it('classifies the parcel, hides motorbike rates for big boxes and snapshots the parcel', async () => {
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: true }).expect(200);
    const moto = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Moto SCZ', fee: 1500, departments: ['SANTA_CRUZ'], carrierId: 'car_other', sizeClasses: ['MOTO'] }).expect(201)).body.id;
    const small = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
    expect(small.sizeClass).toBe('MOTO');
    expect(small.shippingOptions.map((o: any) => o.id)).toContain(moto);
    const big = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, items: [{ paymentLinkId: productId, quantity: 20 }] }).expect(201)).body;
    expect(big.sizeClass).not.toBe('MOTO');
    expect(big.shippingOptions.map((o: any) => o.id)).not.toContain(moto);
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: moto }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order.parcel).toMatchObject({ sizeClass: 'MOTO', fragile: true, weightGrams: 500 });
  });

  it('keeps the parcel off own-rider orders and validates parcel inputs in Spanish', async () => {
    const own = await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Moto propia 2', fee: 1000, currency: 'BOB' } });
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: own.id, shippingDestination: undefined }).expect(201)).body;
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } })).parcel).toBeNull();
    const badSize = await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Bici', fee: 1, sizeClasses: ['BICI'] }).expect(400);
    expect(JSON.stringify(badSize.body)).toContain('Elige tamaños de paquete válidos.');
    const badDims = await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 500, lengthCm: 0 }).expect(400);
    expect(JSON.stringify(badDims.body)).toContain('Las medidas deben ser números enteros entre 1 y 500 cm.');
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 700 }).expect(200);
    expect(await prisma.paymentLink.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({ shippingWeightGrams: 700, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: true });
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 700, fragile: null, noStack: null }).expect(200);
    expect(await prisma.paymentLink.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({ fragile: true, noStack: false });
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 500 }).expect(200);
  });

  it('sizes the parcel from physical lines only when the cart also holds a digital product', async () => {
    const digitalId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Guía PDF', amount: 5000, currency: 'BOB' }).expect(201)).body.id;
    await prisma.paymentLink.update({ where: { id: digitalId }, data: { fulfillmentType: 'DIGITAL' } });
    await prisma.store.update({ where: { id: storeId }, data: { digitalGoodsEnabled: true } });
    await prisma.digitalAsset.create({ data: { storeId, productId: digitalId, storageKey: `test/${digitalId}.pdf`, filename: 'guia.pdf', mimeType: 'application/pdf', byteSize: 10 } });
    const moto = (await prisma.deliveryZone.findFirstOrThrow({ where: { storeId, name: 'Moto SCZ' } })).id;
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, items: [{ paymentLinkId: productId, quantity: 1 }, { paymentLinkId: digitalId, quantity: 1 }] }).expect(201)).body;
    expect(quote.sizeClass).toBe('MOTO');
    expect(quote.shippingOptions.map((o: any) => o.id)).toContain(moto);
  });

  it('stores branch coordinates for pickup origins', async () => {
    const updated = (await request(app.getHttpServer()).patch(`/v1/stores/${storeId}`).set(auth()).send({ locations: [{ id: 'centro', name: 'Centro', address: 'Calle 21 #100', department: 'LA_PAZ', city: 'La Paz', lat: -16.5, lng: -68.12, pickupEnabled: true, deliveryEnabled: true }] }).expect(200)).body;
    expect(updated.locations[0]).toMatchObject({ department: 'LA_PAZ', lat: -16.5 });
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}`).set(auth()).send({ locations: [{ id: 'x', name: 'X', lat: 40, lng: -3, pickupEnabled: true, deliveryEnabled: true }] }).expect(400);
  });
});
