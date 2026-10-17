// Spec 2026-10-16 brand source: the chat step decides own/other/ask and hands the build the merchant's own material.
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import * as websiteReference from './source-website-reference';
import * as websiteFetch from './source-website-fetch';
import { BRAND_SOURCE_QUESTION } from './brand-source-intent';

function setup(messages: any[] = [], logoUrl: string | null = null) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'baek', logoUrl, _count: { paymentLinks: 0 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    mediaAsset: { create: jest.fn().mockResolvedValue({ id: 'asset' }) },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Panadería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Cálida' } } }) };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 2, label: 'Marca' }), newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn().mockResolvedValue({ storeName: 'baek', items: [] }), interruptedPreview: jest.fn().mockResolvedValue({ at: null }) };
  const dialogue: any = { decide: jest.fn() };
  const uploads: any = { saveBuffer: jest.fn(async (_body: Buffer, mimeType: string) => { const filename = `${Math.random().toString(16).slice(2)}.jpg`; return { filename, url: `/v1/uploads/${filename}`, mimeType, byteSize: 10 }; }) };
  const service = new SourceChatService(prisma, projects, generation, dialogue, {} as any, { get: () => undefined } as any, uploads);
  return { service, prisma, generation, dialogue, uploads, messages };
}
const a = '/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', b = '/v1/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png';
const generate = (imageUses: any[] = []) => ({ action: 'generate', reply: '', summary: 'Panadería BAEK.', generationInstruction: 'Aplica la marca.', imageUses, startFrom: 'scratch' });
const request = { revision: 1, assetUrls: [] as string[] };
const execution = (generation: any) => generation.generate.mock.calls[0][6];

afterEach(() => jest.restoreAllMocks());

it('own brand: attached screenshots reach the build as brand source', async () => {
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }, { url: b, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'usa los colores y frases de mi Instagram', assetUrls: [a, b] });
  expect(execution(generation).brandSource).toMatchObject({ imageUrls: [a, b], look: true, quotes: [], imported: [] });
});

it('unknown: asks once, then «sí, es mía» builds with the first message\'s images', async () => {
  const { service, dialogue, generation, messages } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'mira estas imágenes', assetUrls: [a] });
  expect(generation.generate).not.toHaveBeenCalled();
  expect(messages.at(-1).content).toBe(BRAND_SOURCE_QUESTION);
  expect(messages.at(-1).metadata.sourceSetup.brandSource).toBe('asked');
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'sí, es mía' });
  expect(execution(generation).brandSource.imageUrls).toEqual([a]);
});

it('other: no brand source, today\'s behaviour', async () => {
  jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue({ url: 'https://otra.com', status: 'inspected', evidence: '{}' });
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue(generate());
  await service.send('m', 's', { ...request, instruction: 'quiero algo como esta tienda https://otra.com' });
  expect(execution(generation)?.brandSource).toBeUndefined();
});

const oldSite = `<html><head><meta name="description" content="Hecho con amor, horneado con pasión."><style>h1{font-family:"Playfair Display",serif}</style></head>
<body><header><img src="/logo.png" alt="logo"></header><main><section><h1>El sabor que alegra tus días</h1><img src="/a.jpg"></section></main></body></html>`;
const ownSite = (logoUrl: string | null) => {
  jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue({ url: 'https://baek-old.bo', status: 'inspected', evidence: '{}' });
  jest.spyOn(websiteFetch, 'readSourceWebsite').mockResolvedValue({ url: 'https://baek-old.bo/', content: oldSite });
  // A real 1600x1000 JPEG header is not needed: the dimension reader is given PNG bytes it can read.
  const png = (w: number, h: number) => { const buffer = Buffer.alloc(33); buffer.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'latin1'); buffer.writeUInt32BE(w, 16); buffer.writeUInt32BE(h, 20); return buffer; };
  jest.spyOn(websiteFetch, 'readSourceReferenceResource').mockImplementation(async (url: string) => ({ url, body: url.endsWith('logo.png') ? png(200, 200) : png(1600, 1000), contentType: 'image/png' }));
  return setup([], logoUrl);
};

it('own old site: imports its photos and logo and passes its quotes', async () => {
  const { service, dialogue, generation, prisma } = ownSite(null);
  dialogue.decide.mockResolvedValue(generate());
  await service.send('m', 's', { ...request, instruction: 'esta es mi página anterior https://baek-old.bo, usa sus colores y frases' });
  const [, , dto, , imageUses, , exec] = generation.generate.mock.calls[0];
  expect(exec.brandSource.quotes.map((q: any) => q.text)).toContain('Hecho con amor, horneado con pasión.');
  expect(exec.brandSource.imported.length).toBe(2);
  expect(dto.assetUrls).toEqual(expect.arrayContaining(exec.brandSource.imported.map((i: any) => i.url)));
  expect(imageUses.some((use: any) => use.role === 'logo')).toBe(true);
  expect(prisma.mediaAsset.create).toHaveBeenCalledTimes(2);
});

it('keeps the store\'s own logo unless the merchant asks for the old one', async () => {
  const { service, dialogue, generation } = ownSite('/v1/uploads/current-logo.png');
  dialogue.decide.mockResolvedValue(generate());
  await service.send('m', 's', { ...request, instruction: 'esta es mi página anterior https://baek-old.bo, usa sus colores' });
  const [, , , , imageUses, , exec] = generation.generate.mock.calls[0];
  const logo = exec.brandSource.imported.find((i: any) => i.kind === 'logo');
  expect(imageUses.some((use: any) => use.url === logo.url)).toBe(false);
});

it('never asks when the attached photos are to be shown on the site', async () => {
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'business', description: 'foto del local' }]));
  await service.send('m', 's', { ...request, instruction: 'Reforma el sitio con estas fotos', assetUrls: [a] });
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(execution(generation)?.brandSource).toBeUndefined();
});

it('the reply starts with what YAPI took from the brand', async () => {
  const { service, dialogue, generation, messages } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  generation.generate.mockResolvedValue({ revision: 2, label: 'Marca', generation: { brandNote: 'Tomé de tu marca: sus colores.' } });
  await service.send('m', 's', { ...request, instruction: 'usa los colores de mi Instagram', assetUrls: [a] });
  expect(messages.at(-1).content.startsWith('Tomé de tu marca: sus colores.')).toBe(true);
});

// Final review 2026-10-16 (C1, I2).
it('a mixed message: the screenshots are the merchant\'s, the other site stays a style reference', async () => {
  jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue({ url: 'https://otra.com', status: 'inspected', evidence: '{}' });
  const read = jest.spyOn(websiteFetch, 'readSourceWebsite');
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'mis capturas de Instagram, y quiero algo como https://otra.com', assetUrls: [a] });
  expect(execution(generation).brandSource).toMatchObject({ imageUrls: [a], imported: [], quotes: [], captureIndexes: [] });
  expect(read).not.toHaveBeenCalled();
});

it('an earlier turn\'s link is never re-read as the merchant\'s own site on a later edit', async () => {
  const read = jest.spyOn(websiteFetch, 'readSourceWebsite');
  const earlier = { role: 'ASSISTANT', metadata: { sourceRevision: 1, sourceSetup: { step: 'conversation', answers: {}, assetUrls: [], imageUses: [], websiteReferences: [{ url: 'https://otra.com', status: 'inspected', evidence: '{}' }] } } };
  const { service, dialogue, generation } = setup([earlier]);
  dialogue.decide.mockResolvedValue(generate());
  await service.send('m', 's', { ...request, instruction: 'cambia las letras de mi página' });
  expect(execution(generation)?.brandSource).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});

it('the answer turn keeps what the asked message was about, and the question survives a turn that does not build', async () => {
  const { service, dialogue, generation, messages } = setup();
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'pon estos colores en el sitio', assetUrls: [a] });
  expect(messages.at(-1).content).toBe(BRAND_SOURCE_QUESTION);
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: '¿Algo más?', summary: '', generationInstruction: '', imageUses: [] });
  await service.send('m', 's', { ...request, instruction: 'un momento' });
  expect(messages.at(-1).metadata.sourceSetup).toMatchObject({ brandSource: 'asked', brandAssetUrls: [a] });
  dialogue.decide.mockResolvedValue(generate([{ url: a, role: 'reference', description: 'captura' }]));
  await service.send('m', 's', { ...request, instruction: 'sí, es mía' });
  expect(execution(generation).brandSource).toMatchObject({ imageUrls: [a], look: true });
});

// Deferred minor (final review 2026-10-16): a retry of a failed build imported the old site's photos a second time.
it('a retry reuses the photos the failed attempt imported, never saving them again', async () => {
  const { service, dialogue, generation, prisma } = ownSite(null);
  prisma.mediaAsset.findMany = jest.fn(async ({ where }: any) => where.url.in.map((url: string) => ({ url })));
  dialogue.decide.mockResolvedValue(generate());
  generation.generate.mockRejectedValueOnce(new Error('model down'));
  const instruction = 'esta es mi página anterior https://baek-old.bo, usa sus colores y frases';
  await expect(service.send('m', 's', { ...request, instruction })).rejects.toThrow();
  const first = generation.generate.mock.calls[0][6].brandSource.imported.map((i: any) => i.url);
  await service.send('m', 's', { ...request, instruction });
  const [, , dto, , imageUses, , exec] = generation.generate.mock.calls[1];
  expect(exec.brandSource.imported.map((i: any) => i.url)).toEqual(first);
  expect(prisma.mediaAsset.create).toHaveBeenCalledTimes(2);
  // Each imported photo once: in the request's assets and in its image uses.
  expect(dto.assetUrls.filter((url: string) => first.includes(url)).sort()).toEqual([...first].sort());
  const used = imageUses.filter((use: any) => first.includes(use.url)).map((use: any) => use.url);
  expect(new Set(used).size).toBe(used.length);
});

it('an old site with nothing to bring says so', async () => {
  jest.spyOn(websiteReference, 'inspectSourceWebsite').mockResolvedValue({ url: 'https://baek-old.bo', status: 'inspected', evidence: '{}' });
  jest.spyOn(websiteFetch, 'readSourceWebsite').mockResolvedValue({ url: 'https://baek-old.bo/', content: '<html><body><div id="app"></div></body></html>' });
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue(generate());
  await service.send('m', 's', { ...request, instruction: 'esta es mi página anterior https://baek-old.bo, usa sus colores' });
  expect(execution(generation).brandSource.notes).toContain('En tu página anterior no encontré fotos ni frases que pudiera traer.');
});
