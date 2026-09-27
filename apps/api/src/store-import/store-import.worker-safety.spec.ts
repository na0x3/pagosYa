import { StoreImportService } from './store-import.service';

const data = { host: 'x.com', origin: 'https://x.com/', name: '  Mi‮ tienda ', currency: 'BOB', collections: [], articles: [], truncated: false, stockKnown: false, warnings: [],
  products: [{ handle: 'a', title: 'A', bodyHtml: '', productType: '', tags: [], optionNames: ['Title'], variants: [{ id: '1', options: ['Default Title'], sku: null, price: '10', compareAtPrice: null, available: true, grams: 0 }], images: [] as string[] }] };
const row = (over: any = {}) => ({ id: 'imp', merchantId: 'm', storeId: null, source: 'SHOPIFY_URL', sourceHost: 'x.com', status: 'RUNNING', exchangeRateMilli: null, excluded: [], photos: {}, progress: {}, summary: null, error: null,
  attempts: 1, leaseToken: 'lease', leaseUntil: new Date(), designOption: null, designStatus: null, designTries: 0, designRevision: null, designError: null, data, preview: {}, ...over });

function setup(opts: { leaseHeld?: boolean; txLease?: boolean; failWrite?: boolean; message?: any } = {}) {
  const tx: any = {
    storeImport: { updateMany: jest.fn(async () => ({ count: opts.txLease === false ? 0 : 1 })), findUniqueOrThrow: jest.fn(async () => ({ storeId: null })), update: jest.fn(async () => ({})) },
    $queryRaw: jest.fn(async () => []),
    storeImportLink: { findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
    category: { findMany: jest.fn(async () => []) },
    paymentLink: { create: jest.fn(async () => { if (opts.failWrite) throw new Error('db down'); return { id: 'p1' }; }) },
    collection: { findMany: jest.fn(async () => []) },
    storeRedirect: { findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
  };
  const prisma: any = {
    storeImport: { updateMany: jest.fn(async () => ({ count: opts.leaseHeld === false ? 0 : 1 })), findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    merchant: { findUnique: jest.fn(async () => ({ importBuildUsedAt: null })) },
    storeAgentMessage: { findFirst: jest.fn(async () => opts.message ?? null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const stores = { create: jest.fn(async () => ({ id: 'store-new' })) };
  const service = new StoreImportService(prisma, stores as any, { saveBuffer: jest.fn(async () => ({ url: '/v1/uploads/n.png' })), exists: jest.fn(async () => true) } as any, {} as any);
  return { service, prisma, tx, stores };
}

describe('Shopify import worker safety', () => {
  it('creates the store inside the catalog transaction, under the name the store form accepts', async () => {
    const { service, tx, stores } = setup();
    await service.run(row() as any);
    expect(stores.create).toHaveBeenCalledWith('m', expect.objectContaining({ name: 'Mi tienda' }), tx);
    expect(tx.storeImport.update).toHaveBeenCalledWith({ where: { id: 'imp' }, data: expect.objectContaining({ storeId: 'store-new', status: 'COMPLETED', leaseToken: null }) });
  });

  it('leaves no store behind when the catalog cannot be written: the store rolls back with it', async () => {
    const { service, prisma, tx } = setup({ failWrite: true });
    await service.run(row() as any);
    expect(tx.storeImport.update).not.toHaveBeenCalled();
    expect(prisma.storeImport.updateMany).toHaveBeenLastCalledWith({ where: { id: 'imp', leaseToken: 'lease' }, data: expect.objectContaining({ status: 'FAILED' }) });
  });

  it('stops quietly, writing nothing, when another worker took the lease', async () => {
    const early = setup({ leaseHeld: false });
    await early.service.run(row() as any);
    expect(early.prisma.$transaction).not.toHaveBeenCalled();
    expect(early.prisma.storeImport.updateMany).toHaveBeenCalledTimes(1);

    const late = setup({ txLease: false });
    await late.service.run(row() as any);
    expect(late.stores.create).not.toHaveBeenCalled();
    expect(late.prisma.storeImport.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('gives up on an import that took its worker down three times, and a manual retry starts the count again', async () => {
    const { service, prisma } = setup();
    await service.claim();
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { status: 'RUNNING', leaseUntil: { lt: expect.any(Date) }, attempts: { gte: 3 } }, data: expect.objectContaining({ status: 'FAILED', leaseToken: null }) });
    prisma.storeImport.findFirst.mockResolvedValue(row({ status: 'FAILED', attempts: 3 }));
    await service.retry('m', 'imp');
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp', status: 'FAILED' }, data: { status: 'QUEUED', error: null, attempts: 0 } });
  });

  it('reuses photos a completed import into the same store already copied', async () => {
    const withPhoto = { ...data, products: [{ ...data.products[0], images: ['https://cdn.shopify.com/a.png'] }] };
    const { service, prisma } = setup();
    prisma.storeImport.findMany.mockResolvedValue([{ photos: { 'https://cdn.shopify.com/a.png': '/v1/uploads/old.png' } }]);
    await service.run(row({ storeId: 'store-a', data: withPhoto }) as any);
    expect(prisma.storeImport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store-a', status: 'COMPLETED', id: { not: 'imp' } } }));
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ photos: { 'https://cdn.shopify.com/a.png': '/v1/uploads/old.png' } }) }));
  });

  it('shows YAPI\'s own steps while it designs the imported store', async () => {
    const message = { metadata: { progress: { steps: [{ label: 'Interpretando tu pedido', status: 'completed' }, { label: 'Construyendo los cambios', status: 'running', details: [{ label: 'Portada' }, { label: 'Catálogo' }] }] } } };
    const { service, prisma } = setup({ message });
    prisma.storeImport.findFirst.mockResolvedValue(row({ status: 'COMPLETED', storeId: 's', designStatus: 'RUNNING' }));
    const view: any = await service.get('m', 'imp');
    expect(view.designSteps).toEqual([{ label: 'Interpretando tu pedido', status: 'completed', detail: null }, { label: 'Construyendo los cambios', status: 'running', detail: 'Catálogo' }]);
    expect(prisma.storeAgentMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ thread: { storeId: 's' }, metadata: { path: ['requestId'], equals: 'imp' } }) }));
  });
});
