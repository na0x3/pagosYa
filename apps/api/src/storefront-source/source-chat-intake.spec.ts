import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

jest.mock('./source-master-check', () => ({ masterLayoutFindings: jest.fn().mockResolvedValue([]) }));

/** Spec 2026-11-04 §1: YAPI asks what is missing before a new store's first build. */
let chat: SourceChatService, prisma: any, applyMaster: jest.Mock, fillMaster: jest.Mock, intakeStep: jest.Mock, config: Map<string, unknown>, messages: any[];
const question = (topic: string, text: string, options: string[] = ['Tranquila', 'Colorida']) => ({ understood: 'láminas de arte para decorar', reply: '', ready: false, topic, question: text, options });
const ready = { understood: 'láminas de arte', reply: '', ready: true, topic: 'none', question: '', options: [] };
beforeEach(() => {
  messages = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Láminas Lu', logoUrl: null, contactPhone: null, locations: [], onboarding: { what: 'laminas de arte' }, _count: { paymentLinks: 0 },
      paymentLinks: [{ name: 'Café', imageUrls: [] }], promoCodes: [], links: [] }), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    deliveryZone: { count: jest.fn().mockResolvedValue(0) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn(), delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockImplementation(async ({ where }) => messages.filter(m => m.threadId === where.threadId && m.role === where.role).reverse()) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  applyMaster = jest.fn().mockImplementation(async (_m, _s, _r, filler) => { await filler({ storeName: 'Láminas Lu', products: ['Café'], photos: [] }); return { revision: 1, label: 'Plantilla: Esencial' }; });
  intakeStep = jest.fn(); fillMaster = jest.fn().mockResolvedValue(null);
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiSkeletons', false], ['app.yapiMasterPolish', true], ['app.yapiPersonalTouch', false], ['app.yapiPeppaRedesign', false], ['app.yapiIntake', true], ['app.yapiTemplatePick', true], ['app.yapiBriefChecklist', true]]);
  const generation = { generate: jest.fn(), newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn(), interruptedPreview: jest.fn() } as any;
  chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation,
    { decide: jest.fn(), fillMaster, intakeStep, briefChecklist: jest.fn() } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});
// The store's delivery and every product photo set: the facts have nothing left to ask once the model is ready.
const settle = () => { prisma.deliveryZone.count.mockResolvedValue(1); prisma.store.findFirst.mockResolvedValue({ logoUrl: null, _count: { paymentLinks: 1 }, name: 'Láminas Lu', onboarding: { what: 'laminas de arte' }, locations: [], contactPhone: null, promoCodes: [], links: [], paymentLinks: [{ name: 'Café', imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg', '/v1/uploads/c.jpg'] }] }); };
const first = (instruction: string, assetUrls: string[] = []) => chat.send('m1', 's1', { revision: 0, instruction, assetUrls, setupAction: 'generate', requestId: uuid() }) as Promise<any>;
const reply = (instruction: string, assetUrls: string[] = []) => chat.send('m1', 's1', { revision: 0, instruction, assetUrls, requestId: uuid() }) as Promise<any>;

it('asks first: one question with chips and «Créala ya», nothing built yet', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea tu tienda?'));
  const out = await first('hola quiero mi tienda para vender laminas');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(out.assistantMessage.content).toBe('Entendí: láminas de arte para decorar.\n\n¿Cómo quieres que se vea tu tienda?');
  expect(out.assistantMessage.metadata.clarification.options.map((option: any) => option.label)).toEqual(['Tranquila', 'Colorida', 'Créala ya']);
  expect(out.assistantMessage.metadata.intake).toMatchObject({ pending: true, asked: ['look'], question: { topic: 'look' } });
  expect(intakeStep.mock.calls[0][1].facts).toMatchObject({ sinFoto: ['Café'], envios: false });
});

it('a chip answer (no setupAction) goes back to the questions, then builds with every answer', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea tu tienda?')).mockResolvedValueOnce(ready);
  settle();
  await first('hola quiero mi tienda para vender laminas');
  const out = await reply('Colorida');
  expect(intakeStep.mock.calls[1][1].answers).toEqual([{ topic: 'look', question: '¿Cómo quieres que se vea tu tienda?', answer: 'Colorida' }]);
  expect(applyMaster).toHaveBeenCalledTimes(1);
  expect(out.assistantMessage.content).toMatch(/^Listo, ya tengo lo que necesito\./);
  // The section library's follow-up and the request check read the first words with every answer.
  expect(out.followUp).toMatchObject({ sectionLibrary: true });
  expect(out.followUp.checklistWords).toContain('Respuestas del comercio:\n- ¿Cómo quieres que se vea tu tienda? → Colorida');
});

it('«Créala ya» builds without asking again', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea?'));
  await first('quiero vender laminas');
  await reply('Créala ya');
  expect(intakeStep).toHaveBeenCalledTimes(1);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('«créala ya» as the very first message builds at once (review focus 2)', async () => {
  await first('Créala ya');
  expect(intakeStep).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a reply of photos only counts as an answer and the photos join the build (review focus 1)', async () => {
  intakeStep.mockResolvedValueOnce(question('photos', '¿Me mandas fotos de Café?', ['Te las mando'])).mockResolvedValueOnce(ready);
  prisma.deliveryZone.count.mockResolvedValue(1);
  await first('quiero vender laminas');
  await reply('', ['/v1/uploads/11111111-1111-1111-1111-111111111111.jpg']);
  expect(intakeStep.mock.calls[1][1].answers.at(-1)).toMatchObject({ topic: 'photos', answer: '(fotos)' });
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a model «ready» on a store with no delivery, pickup, code or WhatsApp still asks how orders reach the buyer (live: Libros de Ana)', async () => {
  intakeStep.mockResolvedValueOnce(ready);
  const out = await first('vendo novelas y cuadernos, algo bonito y sencillo');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(out.assistantMessage.metadata.intake).toMatchObject({ asked: ['musts'] });
  expect(out.assistantMessage.content).toContain('¿Cómo le llegan los pedidos a tus clientes?');
});

// Final review 2026-11-04 (Important 1): only a plain answer goes back to the questions; a product photo, a pasted link, «restart» or a
// template tap keeps its own flow.
describe('only a plain answer goes back to the questions (final review 2026-11-04, Important 1)', () => {
  beforeEach(async () => { intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea?')); await first('quiero vender laminas'); });
  afterEach(() => expect(intakeStep).toHaveBeenCalledTimes(1));
  it('a pasted link keeps its own flow', async () => {
    // The link's own flow (product import) is long; the routing is decided before it, so the test does not wait for the import.
    const offline = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    void reply('https://www.aliexpress.com/item/100500.html').catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 200));
    offline.mockRestore();
  });
  it('«restart» keeps its own flow', async () => {
    await (chat.send('m1', 's1', { revision: 0, instruction: 'Empezar de nuevo', setupAction: 'restart', requestId: uuid() }) as Promise<any>).catch(() => undefined);
  });
  it('a template tap keeps its own flow', async () => {
    await (chat.send('m1', 's1', { revision: 0, instruction: 'Usar Muro', templateId: 'muro', requestId: uuid() } as any) as Promise<any>).catch(() => undefined);
  });
});

// Final review 2026-11-04 (Important 3): photos sent as an answer are images only and come first in the build.
it('photos sent as an answer are images only and lead the build\'s photos', async () => {
  intakeStep.mockResolvedValueOnce(question('photos', '¿Me mandas fotos de Café?', ['Te las mando'])).mockResolvedValueOnce(ready);
  prisma.deliveryZone.count.mockResolvedValue(1);
  await first('quiero vender laminas', Array.from({ length: 8 }, (_, i) => `/v1/uploads/0000000${i}-0000-0000-0000-000000000000.jpg`));
  await reply('', ['/v1/uploads/22222222-2222-2222-2222-222222222222.mp4', '/v1/uploads/33333333-3333-3333-3333-333333333333.png']);
  const photos: string[] = fillMaster.mock.calls[0][1].photos;
  expect(photos).toContain('/v1/uploads/33333333-3333-3333-3333-333333333333.png');
  expect(photos.some(url => url.endsWith('.mp4'))).toBe(false);
});

// Final review 2026-11-04 (Important 4): without the template pick a first build ends on a plan card, so the questions stay off.
it('asks nothing when the template pick is off', async () => {
  config.set('app.yapiTemplatePick', false);
  await first('quiero vender laminas').catch(() => undefined);
  expect(intakeStep).not.toHaveBeenCalled();
});

it('stops at four questions', async () => {
  for (const topic of ['what', 'look', 'musts', 'photos']) intakeStep.mockResolvedValueOnce(question(topic, `¿${topic}?`));
  await first('quiero vender laminas');
  for (const answer of ['a', 'b', 'c']) await reply(answer);
  expect(applyMaster).not.toHaveBeenCalled();
  await reply('d');
  expect(intakeStep).toHaveBeenCalledTimes(4);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a failed check builds at once; switched off, nothing is asked', async () => {
  intakeStep.mockResolvedValueOnce(null);
  await first('quiero vender laminas');
  expect(applyMaster).toHaveBeenCalledTimes(1);
  config.set('app.yapiIntake', false); applyMaster.mockClear(); messages = [];
  await first('quiero vender laminas');
  expect(intakeStep).toHaveBeenCalledTimes(1);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a product-link first build is never interrupted (review focus 4)', async () => {
  const workflow = { report: jest.fn(), finish: jest.fn(), value: {} };
  const userMessage = { id: 'u', threadId: 't1', content: 'https://example.com/producto', metadata: {} };
  await (chat as any).firstBuild('m1', 's1', 't1', userMessage, workflow, { answers: {} }, 0, [], userMessage.content, undefined, '', undefined, false);
  expect(intakeStep).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

// Live check 2026-11-09 (Miga, Bruma, Pawby): the WhatsApp given as an answer was only words for the designer — the store kept no
// number and YAPI's checklist said WhatsApp was missing.
it('the WhatsApp given as an answer becomes the store number before the build, never over one already set', async () => {
  intakeStep.mockResolvedValueOnce(question('musts', '¿Quieres incluir un WhatsApp para pedidos?', ['Sí', 'No'])).mockResolvedValueOnce(ready);
  settle();
  await first('hola quiero mi tienda para vender laminas');
  await reply('Sí, al 71234567');
  expect(prisma.store.updateMany).toHaveBeenCalledWith({ where: { id: 's1', OR: [{ contactPhone: null }, { contactPhone: '' }] }, data: { contactPhone: '71234567' } });
  expect(prisma.store.updateMany.mock.invocationCallOrder[0]).toBeLessThan(applyMaster.mock.invocationCallOrder[0]);
});

it('no number in the answers changes nothing', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea tu tienda?')).mockResolvedValueOnce(ready);
  settle();
  await first('hola quiero mi tienda para vender laminas');
  await reply('Colorida');
  expect(prisma.store.updateMany).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalledTimes(1);
});
