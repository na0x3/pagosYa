import { AssistantToolbox, productCard } from './assistant-tools';

const now = new Date('2026-10-13T15:00:00Z');
const base = { storeId: 's1', status: 'ACTIVE', description: 'Alpaca 100% natural', imageUrls: ['/v1/uploads/a.webp'], stock: null, variants: [], extras: [], fulfillmentType: 'PHYSICAL',
  discountPercent: null, discountStartsAt: null, discountEndsAt: null, currency: 'BOB', category: { name: 'Abrigo' }, subscriptionOptions: [], highlights: [] };
const chompa = { ...base, id: 'p1', name: 'Chompa', amount: 30000, discountPercent: 15, discountStartsAt: new Date('2026-10-01'), discountEndsAt: new Date('2026-10-31') };
const polera = { ...base, id: 'p2', name: 'Polera', amount: 9000, variants: [{ id: 'v1', name: 'M', amount: 9000, stock: 0 }, { id: 'v2', name: 'L', amount: 9500, stock: 4 }] };
const caja = { ...base, id: 'p3', name: 'Caja regalo', amount: 15000, extras: [{ id: 'e1', name: 'Taza', amount: 0, required: true, groupName: 'Elige', pickCount: 1 }] };
const club = { ...base, id: 'p4', name: 'Club del café', amount: 5000, fulfillmentType: 'MEMBERSHIP' };
const agotado = { ...base, id: 'p5', name: 'Gorro', amount: 8000, stock: 0 };

function setup(overrides: Record<string, any> = {}) {
  const products = [chompa, polera, caja, club, agotado];
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
    paymentLink: {
      findMany: jest.fn(async ({ where }: any) => products.filter((p) => where.id.in.includes(p.id) && p.storeId === where.storeId)),
      findFirst: jest.fn(async ({ where }: any) => products.find((p) => p.id === where.id && p.storeId === where.storeId && p.status === 'ACTIVE') ?? null),
    },
    storeReview: { aggregate: jest.fn().mockResolvedValue({ _count: 2, _avg: { rating: 4.5 } }) },
    deliveryZone: { findMany: jest.fn().mockResolvedValue([{ name: 'La Paz centro', fee: 1500, currency: 'BOB', freeAbove: 40000, minimumOrder: 0, estimatedMinutes: 90, departments: ['LA_PAZ'] }, { name: 'Santa Cruz', fee: 3000, currency: 'BOB', freeAbove: null, minimumOrder: 0, estimatedMinutes: 2880, departments: ['SANTA_CRUZ'] }]) },
    promoCode: { findMany: jest.fn().mockResolvedValue([{ code: 'HOLA10', discountType: 'PERCENT', discountValue: 10 }]) },
    ...overrides,
  };
  const box = new AssistantToolbox({ prisma, now, store: { id: 's1', contactPhone: '+591 70000000', locations: [{ id: 'l1', name: 'Sopocachi', pickupEnabled: true, deliveryEnabled: true, openingHours: [] }], passages: [] } });
  return { prisma, box };
}

describe('assistant toolbox', () => {
  it('cards: live discounted price, and Agregar only when one tap can add it', () => {
    expect(productCard(chompa as any, now)).toEqual({ id: 'p1', name: 'Chompa', price: 'Bs 255,00', originalPrice: 'Bs 300,00', inStock: true, image: '/v1/uploads/a.webp', addKey: 'p1' });
    expect(productCard(polera as any, now)).toMatchObject({ price: 'desde Bs 90,00', inStock: true, addKey: null });
    expect(productCard(caja as any, now).addKey).toBeNull();
    expect(productCard(club as any, now).addKey).toBeNull();
    expect(productCard(agotado as any, now)).toMatchObject({ inStock: false, addKey: null });
  });

  it('buscar_productos returns live products of this store and records evidence', async () => {
    const { box, prisma } = setup();
    const out = JSON.parse(await box.run('buscar_productos', JSON.stringify({ consulta: 'chompa', categoria: null })));
    expect(out.map((p: any) => p.nombre)).toEqual(['Chompa', 'Polera']);
    expect(prisma.paymentLink.findMany.mock.calls[0][0].where).toMatchObject({ storeId: 's1', status: 'ACTIVE' });
    expect(box.searched).toEqual(['p1', 'p2']);
    expect(box.evidence.join(' ')).toContain('Bs 255,00');
  });

  it('ver_producto refuses another store\'s or an archived product', async () => {
    const { box } = setup();
    expect(await box.run('ver_producto', JSON.stringify({ id: 'zz' }))).toBe('Ese producto no está disponible en esta tienda.');
  });

  it('ver_producto lists variants with their own price and availability', async () => {
    const { box } = setup();
    const out = JSON.parse(await box.run('ver_producto', JSON.stringify({ id: 'p2' })));
    expect(out.variantes).toEqual([{ id: 'v1', nombre: 'M', precio: 'Bs 90,00', disponible: false }, { id: 'v2', nombre: 'L', precio: 'Bs 95,00', disponible: true }]);
    expect(out.resenas).toEqual({ cantidad: 2, promedio: 4.5 });
  });

  it('agregar_al_carrito needs a variant when there are variants, refuses sold out and boxes, and builds the kit key', async () => {
    const { box } = setup();
    expect(await box.run('agregar_al_carrito', JSON.stringify({ id: 'p2', varianteId: null }))).toContain('Pregunta qué opción');
    expect(await box.run('agregar_al_carrito', JSON.stringify({ id: 'p2', varianteId: 'v1' }))).toContain('agotada');
    expect(await box.run('agregar_al_carrito', JSON.stringify({ id: 'p3', varianteId: null }))).toContain('se arma en su página');
    await box.run('agregar_al_carrito', JSON.stringify({ id: 'p2', varianteId: 'v2' }));
    expect(box.addBlocks).toEqual([{ type: 'add_to_cart', productId: 'p2', addKey: JSON.stringify(['p2', 'v2']), label: 'Polera — L', price: 'Bs 95,00' }]);
  });

  it('envios filters by department and lists pickup points', async () => {
    const { box } = setup();
    const out = JSON.parse(await box.run('envios', JSON.stringify({ departamento: 'La Paz' })));
    expect(out.zonas).toEqual([{ zona: 'La Paz centro', costo: 'Bs 15,00', gratis_desde: 'Bs 400,00', pedido_minimo: null, tiempo: 'unas 2 horas' }]);
    expect(out.recojo).toEqual([{ local: 'Sopocachi', horario: null }]);
  });

  it('cupon_disponible only asks for codes marked for the assistant', async () => {
    const { box, prisma } = setup();
    expect(JSON.parse(await box.run('cupon_disponible', '{}'))).toEqual([{ codigo: 'HOLA10', descuento: '10%' }]);
    expect(prisma.promoCode.findMany.mock.calls[0][0].where).toEqual({ storeId: 's1', isActive: true, showInAssistant: true });
  });

  it('pasar_con_la_tienda records the handoff', async () => {
    const { box } = setup();
    await box.run('pasar_con_la_tienda', JSON.stringify({ motivo: 'no_se', pregunta: '¿Hacen factura con NIT?', resumen: 'Pregunta por factura con NIT.' }));
    expect(box.handoff).toEqual({ reason: 'no_se', question: '¿Hacen factura con NIT?', summary: 'Pregunta por factura con NIT.' });
  });

  it('a tool that throws answers with a soft message and bad JSON is refused', async () => {
    const { box } = setup({ $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) });
    expect(await box.run('buscar_productos', JSON.stringify({ consulta: 'chompa', categoria: null }))).toBe('No pude consultar ese dato ahora.');
    expect(await box.run('ver_producto', '{oops')).toBe('Argumentos inválidos.');
  });
});
