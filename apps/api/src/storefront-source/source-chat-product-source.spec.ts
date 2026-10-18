// Spec 2026-10-18 product link store: a new store's first message with a product link builds the store around that product.
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import * as websiteFetch from './source-website-fetch';

const png = (w: number, h: number) => { const buffer = Buffer.alloc(33); buffer.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'latin1'); buffer.writeUInt32BE(w, 16); buffer.writeUInt32BE(h, 20); return buffer; };
const listing = { url: 'https://www.alibaba.com/product-detail/x_1.html', name: '200W USB Rechargeable Portable Blender With 6 Blades', description: 'High quality juicer cup', price: 18.3, currency: 'USD',
  images: ['https://s.alicdn.com/a.jpg', 'https://s.alicdn.com/b.jpg'], options: [{ name: 'Color', values: ['Rosa', 'Negro'] }], videos: [] as string[] };
const link = 'https://www.alibaba.com/product-detail/x_1.html';

function setup(messages: any[] = []) {
  const products: any[] = [];
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Batido Ya', logoUrl: null, _count: { paymentLinks: 0 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: {
      create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }),
      update: jest.fn().mockImplementation(async ({ where, data }) => { const message = messages.find(item => item.id === where.id); Object.assign(message, data); return message; }),
    },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(0) },
    mediaAsset: { create: jest.fn().mockResolvedValue({ id: 'asset' }) },
    paymentLink: {
      create: jest.fn().mockImplementation(async ({ data }) => { const row = { ...data, id: `p${products.length + 1}` }; products.push(row); return row; }),
      findFirst: jest.fn().mockImplementation(async ({ where }) => products.find(row => row.id === where.id && row.storeId === where.storeId) ?? null),
    },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 1, label: 'Batido Ya' }), newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn().mockResolvedValue({ storeName: 'Batido Ya', items: [] }), interruptedPreview: jest.fn().mockResolvedValue({ at: null }) };
  const dialogue: any = { decide: jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Tienda de una licuadora portátil.', generationInstruction: 'Crea la tienda completa.', imageUses: [], startFrom: 'scratch', productCopy: { name: 'Licuadora portátil', description: 'Batidos frescos donde estés.' } }) };
  const uploads: any = { saveBuffer: jest.fn(async (_body: Buffer, mimeType: string) => { const filename = `${Math.random().toString(16).slice(2)}.${mimeType === "video/mp4" ? "mp4" : "png"}`; return { filename, url: `/v1/uploads/${filename}`, mimeType, byteSize: 10 }; }) };
  const service = new SourceChatService(prisma, projects, generation, dialogue, {} as any, { get: () => undefined } as any, uploads);
  service.productReader = jest.fn().mockResolvedValue({ ok: true, listing, tier: 'fetch' });
  return { service, prisma, generation, dialogue, uploads, messages, products };
}
const request = { revision: 0, assetUrls: [] as string[] };
const execution = (generation: any) => generation.generate.mock.calls[0][2];

beforeEach(() => jest.spyOn(websiteFetch, 'readSourceReferenceResource').mockImplementation(async (url: string) => ({ url, body: png(1200, 1200), contentType: 'image/png' })));
afterEach(() => jest.restoreAllMocks());

it('reads the link, creates the product with its photos and builds the store around it', async () => {
  const { service, dialogue, generation, products, messages } = setup();
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  expect(dialogue.decide.mock.calls[0][1]).toMatchObject({ buildNow: true, productSource: { site: 'Alibaba', name: listing.name, price: 18.3, currency: 'USD' } });
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({ storeId: 's', name: 'Licuadora portátil', description: 'Batidos frescos donde estés.', amount: 1830, currency: 'USD', priceToConfirm: true });
  expect(products[0].imageUrls).toHaveLength(2);
  expect(products[0].variants.map((variant: any) => variant.name)).toEqual(['Rosa', 'Negro']);
  const build = execution(generation);
  expect(build.instruction).toContain('PRODUCT SOURCE');
  expect(build.instruction).toContain('already in the catalog as «Licuadora portátil»');
  expect(build.assetUrls).toEqual(products[0].imageUrls);
  expect(generation.generate.mock.calls[0][4]).toEqual(expect.arrayContaining(products[0].imageUrls.map((url: string) => expect.objectContaining({ url, role: 'product' }))));
  expect(messages.find(message => message.role === 'USER').metadata.productImport).toMatchObject({ url: link, site: 'Alibaba', productId: 'p1' });
  expect(messages.at(-1).content).toMatch(/^Traje «Licuadora portátil» de Alibaba con 2 fotos\. Puse USD 18\.30, el precio del anuncio/);
});

it('brings the listing video too, and asks for one carousel of photos and video (spec 2026-10-18 A2)', async () => {
  const { service, generation, messages } = setup();
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(20)]);
  jest.spyOn(websiteFetch, 'readSourceReferenceResource').mockImplementation(async (url: string) => url.endsWith('.mp4') ? { url, body: mp4, contentType: 'video/mp4' } : { url, body: png(1200, 1200), contentType: 'image/png' });
  (service.productReader as jest.Mock).mockResolvedValue({ ok: true, listing: { ...listing, videos: ['https://video.aliexpress-media.com/play/1.mp4'] }, tier: 'browser' });
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  const build = execution(generation);
  const video = build.assetUrls.find((url: string) => url.endsWith('.mp4'));
  expect(video).toMatch(/^\/v1\/uploads\/[0-9a-f]+\.mp4$/);
  expect(generation.generate.mock.calls[0][4]).toEqual(expect.arrayContaining([expect.objectContaining({ url: video, role: 'product', description: 'Video de Licuadora portátil.' })]));
  expect(build.instruction).toContain('<div data-pagosya-carousel');
  expect(build.instruction).toContain('a video slide is <figure><video');
  expect(messages.at(-1).content).toMatch(/^Traje «Licuadora portátil» de Alibaba con 2 fotos y 1 video\./);
});

it('a video that does not come through never stops the store', async () => {
  const { service, generation } = setup();
  (service.productReader as jest.Mock).mockResolvedValue({ ok: true, listing: { ...listing, videos: ['https://cdn.x.com/broken.mp4'] }, tier: 'fetch' });
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  expect(execution(generation).assetUrls.some((url: string) => url.endsWith('.mp4'))).toBe(false);
  expect(generation.generate).toHaveBeenCalledTimes(1);
});

it("uses the merchant's own price and confirms it", async () => {
  const { service, products } = setup();
  await service.send('m', 's', { ...request, instruction: `vendo esta licuadora a Bs 150 ${link}` });
  expect(products[0]).toMatchObject({ amount: 15000, currency: 'BOB', priceToConfirm: false });
});

it('a retry of the same link reuses the product instead of creating it twice', async () => {
  const { service, products, generation } = setup();
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  expect(products).toHaveLength(1);
  expect(service.productReader).toHaveBeenCalledTimes(1);
  expect(generation.generate.mock.calls[1][2].instruction).toContain('already in the catalog as «Licuadora portátil»');
});

it('a blocked link with no photos asks for screenshots and builds nothing', async () => {
  const { service, dialogue, generation, products, messages } = setup();
  (service.productReader as jest.Mock).mockResolvedValue({ ok: false, reason: 'blocked' });
  await service.send('m', 's', { ...request, instruction: 'https://www.temu.com/licuadora-g-601099.html' });
  expect(dialogue.decide).not.toHaveBeenCalled();
  expect(generation.generate).not.toHaveBeenCalled();
  expect(products).toHaveLength(0);
  expect(messages.at(-1).content).toMatch(/^Temu no me dejó abrir ese enlace.*Mándame capturas/);
});

it('a Facebook link is never fetched', async () => {
  const { service, messages } = setup();
  (service.productReader as jest.Mock).mockImplementation(async (found: any) => found.social ? { ok: false, reason: 'login' } : { ok: true, listing, tier: 'fetch' });
  await service.send('m', 's', { ...request, instruction: 'lo vendo en https://www.facebook.com/marketplace/item/123' });
  expect(messages.at(-1).content).toMatch(/^Facebook solo muestra esa publicación con una cuenta iniciada/);
});

it('no photo came through and none attached: asks for the photos', async () => {
  const { service, generation, products, messages } = setup();
  jest.spyOn(websiteFetch, 'readSourceReferenceResource').mockRejectedValue(new Error('Reference page unavailable'));
  await service.send('m', 's', { ...request, instruction: `quiero vender esto ${link}` });
  expect(generation.generate).not.toHaveBeenCalled();
  expect(products).toHaveLength(0);
  expect(messages.at(-1).content).toContain('no pude traer sus fotos');
});

it('an existing store keeps today\'s behaviour: links are not product imports', async () => {
  const { service, prisma } = setup();
  prisma.storeSourceVersion.count.mockResolvedValue(1);
  (service as any).projects.current.mockResolvedValue({ revision: 1 });
  (service as any).projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'x', audience: 'y', primaryAction: 'z', visualDirection: 'w' } } });
  await service.send('m', 's', { ...request, revision: 1, instruction: `agrega esto ${link}` });
  expect(service.productReader).not.toHaveBeenCalled();
});
