import { StoreAssistantService } from './store-assistant.service';
import type { AssistantModelTurn } from './assistant-loop';

const now = new Date('2026-10-13T15:00:00Z');
const store = { id: 's1', slug: 'cafe', name: 'Café', merchantId: 'm1', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: 3,
  tagline: null, aboutText: null, announcement: null, contactPhone: '+591 70000000', checkoutMode: 'payment', shippingEnabled: true, shippingPickupEnabled: false, locations: [], policies: {} };
const assistant = { storeId: 's1', enabled: true, name: null, avatarUrl: null, greeting: null, formality: 'tu', notes: '', monthlyCap: 300 };

function setup(turns: AssistantModelTurn[], patch: Record<string, any> = {}) {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(store) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeAssistant: { findUnique: jest.fn().mockResolvedValue(assistant) },
    assistantConversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'conv1', buyerMessages: 0, lastMessageAt: now, ...data })),
      update: jest.fn(async ({ data }: any) => data), delete: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(null),
    },
    assistantMessage: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    assistantUnanswered: { upsert: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...patch,
  };
  let i = 0;
  const model = jest.fn(async () => turns[Math.min(i++, turns.length - 1)]);
  const factory = jest.fn((input: any) => ({
    modelName: 'gpt-5.6-luna',
    model: async (...args: any[]) => { await input.onTurn({ body: { fake: true }, durationMs: 12, status: 'COMPLETED' }); return (model as any)(...args); },
  }));
  const usage: any = { startGate: jest.fn().mockResolvedValue('ok'), spendOk: jest.fn().mockResolvedValue(true), ipHash: () => 'h' };
  const metering: any = { record: jest.fn() };
  const config: any = { get: (key: string) => (key === 'app.assistant.enabled' ? true : undefined) };
  return { prisma, model, factory, usage, metering, service: new StoreAssistantService(prisma, config, usage, factory, metering) };
}

describe('StoreAssistantService.chat', () => {
  it('answers, stores both messages, and returns the conversation id', async () => {
    const { service, prisma } = setup([{ calls: [], text: '¡Hola! ¿Qué buscas?' }]);
    const result = await service.chat('cafe', { message: 'hola' }, '1.2.3.4', now);
    expect(result).toEqual({ conversationId: 'conv1', reply: { text: '¡Hola! ¿Qué buscas?', blocks: [] } });
    expect(prisma.assistantMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.assistantConversation.create.mock.calls[0][0].data).toMatchObject({ storeId: 's1', preview: false, ipHash: 'h' });
  });

  it('falls back to the contact button when off, unpublished, over the cap, or over the spend ceiling', async () => {
    expect(await setup([], { storeAssistant: { findUnique: jest.fn().mockResolvedValue({ ...assistant, enabled: false }) } }).service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
    expect(await setup([], { store: { findUnique: jest.fn().mockResolvedValue({ ...store, publishedSourceRevision: null }) } }).service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
    const capped = setup([]); capped.usage.startGate.mockResolvedValue('cap');
    expect(await capped.service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
    const spent = setup([]); spent.usage.spendOk.mockResolvedValue(false);
    expect(await spent.service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
  });

  const existing = (over: Record<string, any> = {}) => ({ id: 'conv1', storeId: 's1', preview: false, buyerMessages: 1, lastMessageAt: new Date(now.getTime() - 60_000), ...over });
  const CID = 'conv1aaaaaaaaaaaaaaaaaaaa';

  it('claims an existing conversation turn atomically before the model runs', async () => {
    const { service, prisma } = setup([{ calls: [], text: 'Claro.' }], { assistantConversation: { ...setup([]).prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing()) } });
    await service.chat('cafe', { message: 'otra', conversationId: CID }, 'ip', now);
    expect(prisma.assistantConversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv1', storeId: 's1', lastMessageAt: { lte: new Date(now.getTime() - 2000) }, buyerMessages: { lt: 20 } },
      data: { lastMessageAt: now, buyerMessages: { increment: 1 } },
    });
    expect(prisma.assistantConversation.update.mock.calls.at(-1)[0].data).not.toHaveProperty('buyerMessages');
  });

  it('creates a new conversation already counted (1 message)', async () => {
    const { service, prisma } = setup([{ calls: [], text: 'Hola' }]);
    await service.chat('cafe', { message: 'hola' }, 'ip', now);
    expect(prisma.assistantConversation.create.mock.calls[0][0].data).toMatchObject({ buyerMessages: 1, lastMessageAt: now });
    expect(prisma.assistantConversation.updateMany).not.toHaveBeenCalled();
  });

  it('refuses with 429 when the claim fails inside the 2 second gap, without calling the model', async () => {
    const base = setup([]);
    const { service, model, prisma } = setup([], { assistantConversation: { ...base.prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing({ lastMessageAt: new Date(now.getTime() - 1000) })), updateMany: jest.fn().mockResolvedValue({ count: 0 }), findUnique: jest.fn().mockResolvedValue(existing({ buyerMessages: 1 })) } });
    await expect(service.chat('cafe', { message: 'otra', conversationId: CID }, 'ip', now)).rejects.toMatchObject({ status: 429 });
    expect(model).not.toHaveBeenCalled();
    expect(prisma.assistantMessage.create).not.toHaveBeenCalled();
  });

  it('after 20 buyer messages it hands off without calling the model', async () => {
    const base = setup([]);
    const { service, model } = setup([], { assistantConversation: { ...base.prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing({ buyerMessages: 20 })), updateMany: jest.fn().mockResolvedValue({ count: 0 }), findUnique: jest.fn().mockResolvedValue(existing({ buyerMessages: 20 })) } });
    const result = await service.chat('cafe', { message: 'otra', conversationId: CID }, 'ip', now);
    expect(model).not.toHaveBeenCalled();
    expect(result.reply?.blocks[0]).toMatchObject({ type: 'handoff' });
  });

  it('an idle conversation (over 30 min) starts a new one and consults the monthly gate', async () => {
    const base = setup([{ calls: [], text: 'Hola otra vez' }]);
    const { service, prisma, usage } = setup([{ calls: [], text: 'Hola otra vez' }], { assistantConversation: { ...base.prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing({ lastMessageAt: new Date(now.getTime() - 31 * 60_000) })) } });
    await service.chat('cafe', { message: 'hola', conversationId: CID }, 'ip', now);
    expect(usage.startGate).toHaveBeenCalled();
    expect(prisma.assistantConversation.create).toHaveBeenCalled();
    expect(prisma.assistantConversation.updateMany).not.toHaveBeenCalled();
  });

  it('falls back when the hourly limit is hit or the platform flag is off (without touching the store)', async () => {
    const hourly = setup([]); hourly.usage.startGate.mockResolvedValue('hourly');
    expect(await hourly.service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
    const off = setup([]);
    const service = new StoreAssistantService(off.prisma, { get: () => false } as any, off.usage, jest.fn() as any, off.metering);
    expect(await service.chat('cafe', { message: 'hola' }, 'ip', now)).toEqual({ conversationId: null, fallback: 'contact' });
    expect(off.prisma.store.findUnique).not.toHaveBeenCalled();
  });

  it('passes the last 12 messages oldest to newest and never stores the raw IP', async () => {
    const base = setup([]);
    const rows = Array.from({ length: 3 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'buyer', text: `m${3 - i}` })); // newest first
    const { service, prisma, factory, model } = setup([{ calls: [], text: 'ok' }], { assistantConversation: { ...base.prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing()) }, assistantMessage: { create: jest.fn(), findMany: jest.fn().mockResolvedValue(rows) } });
    await service.chat('cafe', { message: 'nuevo', conversationId: CID }, '9.9.9.9', now);
    expect(prisma.assistantMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 12, orderBy: { createdAt: 'desc' } }));
    const transcript = model.mock.calls[0] as any[];
    const texts = JSON.stringify(transcript);
    expect(texts.indexOf('m1')).toBeLessThan(texts.indexOf('m2'));
    expect(texts.indexOf('m2')).toBeLessThan(texts.indexOf('m3'));
    expect(texts.indexOf('m3')).toBeLessThan(texts.indexOf('nuevo'));
    const fresh = setup([{ calls: [], text: 'ok' }]);
    await fresh.service.chat('cafe', { message: 'hola' }, '9.9.9.9', now);
    expect(JSON.stringify(fresh.prisma.assistantConversation.create.mock.calls[0][0])).not.toContain('9.9.9.9');
    expect(factory).toBeDefined();
  });

  it('records each model call and each guarded reply in the metering table', async () => {
    const { service, metering } = setup([{ calls: [], text: 'Hoy está a Bs 10.' }]);
    await service.chat('cafe', { message: 'precio?' }, 'ip', now);
    expect(metering.record).toHaveBeenCalledWith('s1', 'assistant', 'gpt-5.6-luna', { fake: true }, 12, 'COMPLETED');
    expect(metering.record).toHaveBeenCalledWith('s1', 'assistant-guard', 'gpt-5.6-luna', { offending: expect.any(Array) }, 0, 'REJECTED');
    expect((metering.record.mock.calls.find((c: any[]) => c[1] === 'assistant-guard') as any[])[3].offending.length).toBeGreaterThan(0);
  });

  it('when the provider fails, a new conversation is not counted and the buyer gets the handoff', async () => {
    const { service, prisma, model } = setup([]);
    model.mockRejectedValue(new Error('El proveedor de IA respondió 503.'));
    const result = await service.chat('cafe', { message: 'hola' }, 'ip', now);
    expect(result.reply?.text).toBe('Ahora no puedo responder. Escríbele a la tienda 👉');
    expect(result.reply?.blocks).toEqual([{ type: 'handoff', whatsappUrl: 'https://wa.me/59170000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.'), summary: '' }]);
    expect(prisma.assistantConversation.delete).toHaveBeenCalledWith({ where: { id: 'conv1' } });
    expect(prisma.assistantMessage.create).not.toHaveBeenCalled();
  });

  it('a provider failure on an existing conversation keeps it and leaves no orphan buyer message', async () => {
    const base = setup([]);
    const { service, prisma, model } = setup([], { assistantConversation: { ...base.prisma.assistantConversation, findFirst: jest.fn().mockResolvedValue(existing()) } });
    model.mockRejectedValue(new Error('503'));
    const result = await service.chat('cafe', { message: 'otra', conversationId: CID }, 'ip', now);
    expect(result.conversationId).toBe('conv1');
    expect(prisma.assistantConversation.delete).not.toHaveBeenCalled();
    expect(prisma.assistantMessage.create).not.toHaveBeenCalled();
  });

  it('a failing unanswered-question upsert does not break the stored reply', async () => {
    const { service, prisma } = setup([
      { calls: [{ name: 'pasar_con_la_tienda', arguments: JSON.stringify({ motivo: 'no_se', pregunta: '¿Dan factura?', resumen: 'x' }), callId: 'c1' }] },
      { calls: [], text: 'No tengo ese dato, te paso con la tienda.' },
    ]);
    prisma.assistantUnanswered.upsert.mockRejectedValue(new Error('race'));
    await expect(service.chat('cafe', { message: '¿Dan factura?' }, 'ip', now)).resolves.toMatchObject({ conversationId: 'conv1' });
  });

  it('a "no sé" handoff files the question without contact details', async () => {
    const { service, prisma } = setup([
      { calls: [{ name: 'pasar_con_la_tienda', arguments: JSON.stringify({ motivo: 'no_se', pregunta: '¿Dan factura? mi cel 70012345', resumen: 'Pregunta por factura.' }), callId: 'c1' }] },
      { calls: [], text: 'No tengo ese dato, te paso con la tienda.' },
    ]);
    await service.chat('cafe', { message: '¿Dan factura?' }, 'ip', now);
    expect(prisma.assistantUnanswered.upsert).toHaveBeenCalledWith({
      where: { storeId_question: { storeId: 's1', question: 'dan factura mi cel [contacto]' } },
      create: { storeId: 's1', question: 'dan factura mi cel [contacto]' },
      update: { count: { increment: 1 }, lastAskedAt: now, status: 'open' },
    });
    expect(prisma.assistantConversation.update.mock.calls.at(-1)[0].data).toMatchObject({ handedOff: true });
  });
});
