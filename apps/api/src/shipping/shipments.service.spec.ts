import { ShipmentsService, BOOKING_BACKOFF_MS } from './shipments.service';
import { ManualCarrier } from './carriers/manual.carrier';
import { CarrierRegistry } from './carriers/carrier-registry';

const carrier = { id: 'car_servientrega', code: 'servientrega', name: 'Servientrega Bolivia', mode: 'MANUAL', trackingUrlTemplate: 'https://t.example/{tracking}' };

function fakePrisma() {
  const db: any = { shipments: new Map<string, any>(), events: [] as any[], orders: new Map<string, any>(), statusEvents: [] as any[], emails: [] as any[] };
  const carriers: Record<string, any> = { car_servientrega: carrier, car_ocs: { ...carrier, id: 'car_ocs', code: 'ocs', name: 'OCS Bolivia', trackingUrlTemplate: null }, car_dhl_express: { ...carrier, id: 'car_dhl_express', code: 'dhl_express', mode: 'API' } };
  const hydrate = (s: any) => s && { ...s, carrier: carriers[s.carrierId], events: db.events.filter((e: any) => e.shipmentId === s.id), order: db.orders.get(s.orderId) };
  const matches = (s: any, where: any) => (!where.id || s.id === where.id) && (!where.orderId || s.orderId === where.orderId) && (!where.merchantId || s.merchantId === where.merchantId)
    && (where.status === undefined || (typeof where.status === 'string' ? s.status === where.status : where.status.in.includes(s.status)));
  const client: any = {
    shipment: {
      findUnique: async ({ where }: any) => hydrate([...db.shipments.values()].find((s: any) => matches(s, where))),
      findFirst: async ({ where }: any) => hydrate([...db.shipments.values()].find((s: any) => matches(s, where))),
      update: async ({ where, data }: any) => { Object.assign(db.shipments.get(where.id), data); return hydrate(db.shipments.get(where.id)); },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const s of db.shipments.values()) if (matches(s, where)) { Object.assign(s, data); count++; } return { count }; },
    },
    shipmentEvent: { create: async ({ data }: any) => { db.events.push({ occurredAt: new Date(), description: null, location: null, ...data }); return data; } },
    shippingCarrier: { findFirst: async ({ where }: any) => carriers[where.id] ?? null },
    storeOrder: { updateMany: async ({ where, data }: any) => { const o = db.orders.get(where.id); if (o && where.status.in.includes(o.status)) { Object.assign(o, data); return { count: 1 }; } return { count: 0 }; } },
    storeOrderStatusEvent: { create: async ({ data }: any) => { db.statusEvents.push(data); return { id: `evt_${db.statusEvents.length}`, ...data }; } },
    paymentIntent: { findUnique: async () => ({ livemode: true, customerEmail: 'ana@example.com', customerName: 'Ana' }) },
    store: { findUnique: async () => ({ name: 'Tienda Sol', contactPhone: '+59170000000', shippingPrepMinutes: 60, locations: [{ id: 'loc1', name: 'Centro', address: 'Calle 21', department: 'LA_PAZ', city: 'La Paz', lat: -16.5, lng: -68.1 }] }) },
    storeRetention: { findUnique: async () => null },
    storeEmailDelivery: { upsert: async ({ create }: any) => { db.emails.push(create); return create; } },
    $transaction: async (fn: any) => fn(client),
  };
  return { db, client };
}

function seed(db: any, overrides: any = {}) {
  db.orders.set('ord_1', { id: 'ord_1', storeId: 'st_1', storeName: 'Tienda Sol', status: 'PAID', paymentIntentId: 'pi_1', amount: 16500, currency: 'BOB', items: [{ name: 'Café', quantity: 1 }], fulfillmentLocationId: 'loc1', shippingDepartment: 'SANTA_CRUZ', shippingCity: 'Santa Cruz', shippingStreet: 'Av. Busch 55', shippingReferences: null, shippingLat: -17.78, shippingLng: -63.18, recipientName: 'Ana', recipientPhone: '+59171111111' });
  db.shipments.set('shp_1', { id: 'shp_1', orderId: 'ord_1', storeId: 'st_1', merchantId: 'm_1', carrierId: 'car_servientrega', status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), quotedAmount: 1500, currency: 'BOB', trackingNumber: null, carrierRef: null, labelFileId: null, lastError: null, ...overrides });
}

describe('ShipmentsService', () => {
  const FILE = '11111111-1111-1111-1111-111111111111';
  const files = { put: jest.fn(async () => FILE), get: jest.fn(async () => Buffer.from('%PDF-')) };
  const config = { get: (key: string) => (key === 'app.checkoutOrigin' ? 'https://pay.example' : key === 'app.orderTrackingSecret' ? 'test-secret' : undefined) };
  const make = (client: any) => new ShipmentsService(client, new CarrierRegistry(new ManualCarrier()), files as any, config as any);
  beforeEach(() => { files.put.mockReset(); files.put.mockResolvedValue(FILE); });

  it('books a manual shipment: stores a waybill, marks BOOKED and the order PREPARING', async () => {
    const { db, client } = fakePrisma(); seed(db);
    await make(client).book('shp_1');
    expect(db.shipments.get('shp_1')).toMatchObject({ status: 'BOOKED', labelFileId: FILE, nextAttemptAt: null, bookingAttempts: 1 });
    expect(files.put).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    expect(db.orders.get('ord_1').status).toBe('PREPARING');
    expect(db.events.map((e: any) => e.status)).toEqual(['BOOKED']);
  });

  it('ignores shipments that are not in BOOKING', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'CANCELED' });
    await make(client).book('shp_1');
    expect(files.put).not.toHaveBeenCalled();
  });

  it('retries with backoff and fails after three attempts', async () => {
    const { db, client } = fakePrisma(); seed(db);
    files.put.mockRejectedValue(new Error('storage down'));
    const service = make(client);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const before = Date.now();
      await service.book('shp_1');
      const s = db.shipments.get('shp_1');
      if (attempt < 3) { expect(s.status).toBe('BOOKING'); expect(s.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + BOOKING_BACKOFF_MS[attempt - 1]); }
      else expect(s).toMatchObject({ status: 'FAILED', nextAttemptAt: null, lastError: 'storage down', bookingAttempts: 3 });
    }
  });

  it('books safely when a non-Error is thrown, recording a Spanish fallback message', async () => {
    const { db, client } = fakePrisma(); seed(db);
    files.put.mockRejectedValueOnce('boom');
    await make(client).book('shp_1');
    expect(db.shipments.get('shp_1')).toMatchObject({ status: 'BOOKING', bookingAttempts: 1, lastError: 'No se pudo reservar el envío.' });
  });

  it('entering a tracking number ships the order and emails the buyer the tracking link', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    client.storeRetention.findUnique = async () => ({ settings: { emailWorkspace: { templates: { SHIPPED: { enabled: true, subject: 'Tu pedido {{order}} va en camino', body: 'Hola {{customer}}, tu pedido está en camino.' } } } } });
    const view = await make(client).setTrackingNumber('m_1', 'shp_1', ' SV-123 ');
    expect(view).toMatchObject({ trackingNumber: 'SV-123', trackingUrl: 'https://t.example/SV-123', status: 'IN_TRANSIT' });
    expect(db.orders.get('ord_1').status).toBe('SHIPPED');
    expect(db.statusEvents.map((e: any) => e.status)).toEqual(['SHIPPED']);
    expect(db.emails).toHaveLength(1);
    expect(db.emails[0].body).toContain('SV-123');
    expect(db.emails[0].body).toContain('https://t.example/SV-123');
  });

  it("rejects tracking on another merchant's shipment", async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    await expect(make(client).setTrackingNumber('m_other', 'shp_1', 'SV-1')).rejects.toThrow('no encontrado');
  });

  it('marks delivered and moves the order to DELIVERED', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'IN_TRANSIT', trackingNumber: 'SV-1' }); db.orders.get('ord_1').status = 'SHIPPED';
    await make(client).markDelivered('m_1', 'shp_1');
    expect(db.shipments.get('shp_1').status).toBe('DELIVERED');
    expect(db.orders.get('ord_1').status).toBe('DELIVERED');
  });

  it('retry re-arms a FAILED shipment; switchCarrier only accepts active manual carriers', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'FAILED', bookingAttempts: 3 });
    const service = make(client);
    await service.retry('m_1', 'shp_1');
    expect(db.shipments.get('shp_1')).toMatchObject({ status: 'BOOKING', bookingAttempts: 0 });
    db.shipments.get('shp_1').status = 'FAILED';
    await service.switchCarrier('m_1', 'shp_1', 'car_ocs');
    expect(db.shipments.get('shp_1')).toMatchObject({ carrierId: 'car_ocs', status: 'BOOKING' });
    db.shipments.get('shp_1').status = 'FAILED';
    await expect(service.switchCarrier('m_1', 'shp_1', 'car_dhl_express')).rejects.toThrow('manual');
  });

  it('cancelForOrder cancels shipments not yet picked up and leaves picked-up ones alone', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    await make(client).cancelForOrder(client, 'ord_1');
    expect(db.shipments.get('shp_1').status).toBe('CANCELED');
    db.shipments.get('shp_1').status = 'IN_TRANSIT';
    await make(client).cancelForOrder(client, 'ord_1');
    expect(db.shipments.get('shp_1').status).toBe('IN_TRANSIT');
  });

  it('cancelForOrder blocks a later retry: the shipment stays CANCELED', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'FAILED' });
    const service = make(client);
    await service.cancelForOrder(client, 'ord_1');
    expect(db.shipments.get('shp_1').status).toBe('CANCELED');
    await expect(service.retry('m_1', 'shp_1')).rejects.toThrow();
    expect(db.shipments.get('shp_1').status).toBe('CANCELED');
  });

  it('builds tracking URLs safely', () => {
    expect(ShipmentsService.trackingUrl('https://t.example/{tracking}', 'A B/1')).toBe('https://t.example/A%20B%2F1');
    expect(ShipmentsService.trackingUrl(null, 'X')).toBeNull();
    expect(ShipmentsService.trackingUrl('https://t.example/{tracking}', null)).toBeNull();
  });
});
