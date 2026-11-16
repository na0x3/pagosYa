import { SellingService } from './selling.service';

const NOW = new Date('2026-11-30T12:00:00Z');
const STORE = { id: 's1', publishedSourceRevision: 7, autoImprove: true };
function fakePrisma(over: Record<string, any> = {}) {
  const prisma: any = {
    store: { findMany: jest.fn().mockResolvedValue([STORE]), findFirst: jest.fn().mockResolvedValue({ ...STORE, merchantId: 'm1' }), update: jest.fn() },
    storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'e9' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeSellingChange: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeAnalyticsEvent: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: 'b', name: 'Ginger' }]) },
    ...over,
  };
  prisma.$transaction = jest.fn(async (run: any) => run(prisma));
  return prisma;
}
const events = (variant: string, sessions: number, adds: number) => [
  ...Array.from({ length: sessions }, (_, i) => ({ variant, sessionHash: `${variant}${i}`, type: 'page_view' })),
  ...Array.from({ length: adds }, (_, i) => ({ variant, sessionHash: `${variant}${i}`, type: 'add_to_cart' })),
];

describe('SellingService daily run (spec 2026-11-16)', () => {
  it('keeps a selling change that sold more and tells the merchant by how much', async () => {
    const prisma = fakePrisma();
    prisma.storeSourceExperiment.findUnique.mockResolvedValue({ id: 'e1', kind: 'selling', status: 'RUNNING', startedAt: new Date('2026-11-25T12:00:00Z'), variantSettings: { buyWord: 'Lo quiero' } });
    prisma.storeSellingChange.findFirst.mockResolvedValue({ id: 'c1', kind: 'buyWord', summary: 'Botón «Lo quiero»', status: 'TRYING', experimentId: 'e1' });
    prisma.storeAnalyticsEvent.findMany.mockResolvedValue([...events('A', 300, 30), ...events('B', 300, 36)]);
    await new SellingService(prisma).runDaily(NOW);
    expect(prisma.storeSourceExperiment.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', status: 'RUNNING' }, data: expect.objectContaining({ status: 'COMPLETED', winner: 'B', activeStoreId: null }) });
    expect(prisma.storeSellingChange.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: expect.objectContaining({ status: 'KEPT', summary: 'Botón «Lo quiero» — agregados +20%' }) });
  });
  it('starts the next change as a test on the published design when nothing runs', async () => {
    const prisma = fakePrisma();
    prisma.storeOrder.findMany.mockResolvedValue(Array.from({ length: 3 }, () => ({ items: [{ paymentLinkId: 'b', quantity: 1 }] })));
    await new SellingService(prisma).runDaily(NOW);
    expect(prisma.storeSourceExperiment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: 's1', activeStoreId: 's1', kind: 'selling', controlRevision: 7, variantRevision: 7, variantSettings: { best: 'b' } }) });
    expect(prisma.storeSellingChange.create).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: 's1', kind: 'best', status: 'TRYING', experimentId: 'e9', summary: '«Ginger» primero como Más vendido' }) });
  });
  it('leaves a store alone while another test runs or when «Mejora automática» is off', async () => {
    const prisma = fakePrisma();
    prisma.storeSourceExperiment.findUnique.mockResolvedValue({ id: 'e2', kind: 'design', status: 'RUNNING' });
    await new SellingService(prisma).runDaily(NOW);
    expect(prisma.storeSourceExperiment.create).not.toHaveBeenCalled();
    expect(prisma.store.findMany.mock.calls[0][0].where).toMatchObject({ autoImprove: true });
  });
  it('closes a trying change whose test the merchant ended, by the winner they chose', async () => {
    const prisma = fakePrisma();
    prisma.storeSellingChange.findMany.mockImplementation(async ({ where }: any) => where?.status === 'TRYING' ? [{ id: 'c3', experimentId: 'e3', summary: 'Botón «Comprar ahora»' }] : []);
    prisma.storeSourceExperiment.findFirst.mockResolvedValue({ id: 'e3', status: 'COMPLETED', winner: 'B' });
    await new SellingService(prisma).runDaily(NOW);
    expect(prisma.storeSellingChange.update).toHaveBeenCalledWith({ where: { id: 'c3' }, data: expect.objectContaining({ status: 'KEPT' }) });
  });
  it('undoes the newest kept change when weekly orders really drop', async () => {
    const prisma = fakePrisma();
    prisma.storeOrder.count.mockResolvedValueOnce(4).mockResolvedValueOnce(40);
    prisma.storeSellingChange.findFirst.mockImplementation(async ({ where }: any) => where?.status === 'KEPT' ? { id: 'k1', summary: 'Botón «Lo quiero» — agregados +8%' } : null);
    await new SellingService(prisma).runDaily(NOW);
    expect(prisma.storeSellingChange.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: expect.objectContaining({ status: 'UNDONE' }) });
  });
});
