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
    },
    assistantMessage: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    assistantUnanswered: { upsert: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...patch,
  };
  let i = 0;
  const model = jest.fn(async () => turns[Math.min(i++, turns.length - 1)]);
  const factory = jest.fn(() => ({ model, modelName: 'gpt-5.6-luna' }));
  const usage: any = { startGate: jest.fn().mockResolvedValue('ok'), spendOk: jest.fn().mockResolvedValue(true), ipHash: () => 'h' };
  const metering: any = { record: jest.fn() };
  const config: any = { get: (key: string) => (key === 'app.assistant.enabled' ? true : undefined) };
  return { prisma, model, usage, metering, service: new StoreAssistantService(prisma, config, usage, factory, metering) };
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

  it('refuses a second message within 2 seconds of the last one', async () => {
    const { service } = setup([], { assistantConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv1', storeId: 's1', preview: false, buyerMessages: 1, lastMessageAt: new Date(now.getTime() - 1000) }) } });
    await expect(service.chat('cafe', { message: 'otra', conversationId: 'conv1aaaaaaaaaaaaaaaaaaaa' }, 'ip', now)).rejects.toMatchObject({ status: 429 });
  });

  it('after 20 buyer messages it hands off without calling the model', async () => {
    const { service, model } = setup([], { assistantConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv1', storeId: 's1', preview: false, buyerMessages: 20, lastMessageAt: new Date(now.getTime() - 60_000) }), update: jest.fn() } });
    const result = await service.chat('cafe', { message: 'otra', conversationId: 'conv1aaaaaaaaaaaaaaaaaaaa' }, 'ip', now);
    expect(model).not.toHaveBeenCalled();
    expect(result.reply?.blocks[0]).toMatchObject({ type: 'handoff' });
  });

  it('when the provider fails, a new conversation is not counted and the buyer gets the handoff', async () => {
    const { service, prisma, model } = setup([]);
    model.mockRejectedValue(new Error('El proveedor de IA respondió 503.'));
    const result = await service.chat('cafe', { message: 'hola' }, 'ip', now);
    expect(result.reply?.text).toBe('Ahora no puedo responder. Escríbele a la tienda 👉');
    expect(result.reply?.blocks).toEqual([{ type: 'handoff', whatsappUrl: 'https://wa.me/59170000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.'), summary: '' }]);
    expect(prisma.assistantConversation.delete).toHaveBeenCalledWith({ where: { id: 'conv1' } });
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
