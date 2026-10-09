import { ProductPageWriterService } from './product-page-writer.service';

const product = (extra: Record<string, unknown> = {}) => ({ id: 'p1', updatedAt: new Date('2026-10-09T10:00:00Z'), name: 'Bolso térmico', description: 'Mantiene la comida fría 12 horas.', specifications: [], tags: [], imageUrls: [], highlights: [], contentBlocks: [], category: null, store: { name: 'Dacho' }, ...extra });
const answer = { highlights: [{ icon: 'snowflake', label: 'Frío 12 h', detail: null }], features: null, story: { title: null, problem: 'Llevas varias bolsas.', tried: 'La lonchera aparte se derrama.', solution: 'Un bolso con zona fría.' }, versus: null, faq: null, details: [] };
function setup(row = product(), ok = true) {
  const prisma: any = { paymentLink: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) } };
  const config: any = { get: jest.fn((key: string) => ({ 'app.openAi.apiKey': 'sk-test', 'app.openAi.enabled': true } as Record<string, unknown>)[key]) };
  const uploads: any = { getBuffer: jest.fn().mockResolvedValue(Buffer.from('img')), contentTypeFor: jest.fn().mockReturnValue('image/jpeg') };
  const usage: any = { record: jest.fn() };
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }], usage: { input_tokens: 900, output_tokens: 300 } }), { status: ok ? 200 : 500 }));
  return { service: new ProductPageWriterService(prisma, config, uploads, usage), prisma, fetchMock, usage };
}
afterEach(() => jest.restoreAllMocks());

describe('ProductPageWriterService', () => {
  it('writes YAPI rows onto an empty product and records usage', async () => {
    const { service, prisma, usage } = setup();
    expect(await service.fill('s1', 'p1', 'auto')).toBe('written');
    const data = prisma.paymentLink.updateMany.mock.calls[0][0].data;
    expect(data.highlights).toEqual([{ icon: 'snowflake', label: 'Frío 12 h', origin: 'yapi' }]);
    expect(data.contentBlocks[0]).toEqual(expect.objectContaining({ type: 'story', origin: 'yapi' }));
    expect(usage.record).toHaveBeenCalledWith('s1', 'product-page', expect.any(String), expect.anything(), expect.any(Number), 'ok');
  });
  it('skips a product the merchant already filled, without calling the model', async () => {
    const { service, prisma, fetchMock } = setup(product({ contentBlocks: [{ id: 'blk_aaaaaaaaaaaa', type: 'story', problem: 'p', tried: 't', solution: 's' }] }));
    expect(await service.fill('s1', 'p1', 'auto')).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
  });
  it('never overwrites a product the merchant saved while YAPI was writing', async () => {
    const { service, prisma } = setup();
    prisma.paymentLink.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.fill('s1', 'p1', 'auto')).toBe('skipped');
    expect(prisma.paymentLink.updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', updatedAt: new Date('2026-10-09T10:00:00Z') });
    expect(prisma.paymentLink.update).not.toHaveBeenCalled();
  });
  it('leaves the product unchanged when the model fails', async () => {
    const { service, prisma } = setup(product(), false);
    await expect(service.fill('s1', 'p1', 'auto')).rejects.toThrow();
    expect(prisma.paymentLink.updateMany).not.toHaveBeenCalled();
  });
  it("only reaches a product through its owner's store when a merchant asks", async () => {
    const { service, prisma } = setup();
    prisma.paymentLink.findFirst.mockResolvedValueOnce(null);
    await expect(service.fill('s1', 'p1', 'regenerate', 'someone-else')).rejects.toThrow('Producto no encontrado');
    expect(prisma.paymentLink.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', storeId: 's1', store: { merchantId: 'someone-else' } });
    expect(prisma.paymentLink.update).not.toHaveBeenCalled();
  });
  it('fills the first twenty products that still have no page, however many already do', async () => {
    const { service, prisma } = setup();
    const filled = { contentBlocks: [{ id: 'blk_aaaaaaaaaaaa', type: 'story', problem: 'p', tried: 't', solution: 's' }] };
    prisma.paymentLink.findMany.mockResolvedValueOnce(Array.from({ length: 45 }, (_, i) => ({ id: `p${i + 1}`, ...(i < 20 ? filled : { contentBlocks: [] }) })));
    const fill = jest.spyOn(service, 'fill').mockResolvedValue('written');
    await service.fillStore('s1');
    expect(fill.mock.calls.map(call => call[1])).toEqual(Array.from({ length: 20 }, (_, i) => `p${i + 21}`));
  });
  it('fills a store one product at a time and survives one failing product', async () => {
    const { service } = setup();
    const fill = jest.spyOn(service, 'fill').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('written');
    await service.fillStore('s1');
    expect(fill.mock.calls.map(call => call[1])).toEqual(['p1', 'p2']);
  });
});
