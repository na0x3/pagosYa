import { AssistantOpsController } from './assistant-ops.controller';
import { ASSISTANT_PRIVACY_PARAGRAPH } from './assistant-privacy';
import { StoreAssistantAdminService } from './store-assistant-admin.service';

const now = new Date('2026-10-13T15:00:00Z');
const row = (patch: Record<string, unknown> = {}) => ({ storeId: 's1', enabled: false, name: null, avatarUrl: null, greeting: null, formality: 'tu', notes: '', monthlyCap: 300, ...patch });
function setup(patch: Record<string, any> = {}) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's1', merchantId: 'm1', name: 'Café', publishedSourceRevision: 2, policies: { privacy: 'Cuidamos tus datos.' } }), update: jest.fn() },
    storeAssistant: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(async ({ create, update }: any) => row({ ...create, ...update })) },
    promoCode: { findMany: jest.fn().mockResolvedValue([{ id: 'pc1', code: 'HOLA10', discountType: 'PERCENT', discountValue: 10, showInAssistant: true }]) },
    assistantConversation: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    assistantUnanswered: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn() },
    ...patch,
  };
  const usage: any = { monthlyUsed: jest.fn().mockResolvedValue(12), previewUsed: jest.fn().mockResolvedValue(3) };
  const chat: any = { converse: jest.fn().mockResolvedValue({ conversationId: 'c1', reply: { text: 'ok', blocks: [] } }), loadTurnStore: jest.fn().mockResolvedValue({ id: 's1', name: 'Café', categories: [] }) };
  const completion: any = { structuredCompletion: jest.fn().mockResolvedValue({ data: { notes: 'Tostamos los martes.' } }) };
  const config: any = { get: (key: string) => key === 'app.assistant.enabled' };
  return { prisma, usage, chat, completion, service: new StoreAssistantAdminService(prisma, config, usage, chat, completion) };
}

describe('StoreAssistantAdminService', () => {
  it('refuses another merchant\'s store', async () => {
    const { service } = setup({ store: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(service.view('m2', 's1', now)).rejects.toThrow('Tienda no encontrada');
  });

  it('shows defaults, usage and coupons', async () => {
    const { service } = setup();
    expect(await service.view('m1', 's1', now)).toEqual({
      settings: { enabled: false, name: null, avatarUrl: null, greeting: null, formality: 'tu', notes: '' },
      usage: { used: 12, cap: 300, previewUsed: 3, previewCap: 50 }, platformEnabled: true, publishedDesign: true,
      coupons: [{ id: 'pc1', code: 'HOLA10', label: '10%', showInAssistant: true }],
    });
  });

  it('switching on adds the privacy paragraph', async () => {
    const { service, prisma } = setup();
    await service.save('m1', 's1', { enabled: true }, now);
    expect(prisma.store.update.mock.calls[0][0].data.policies.privacy).toContain('Asistente automático');
  });

  it('teaching an answer appends it to the notes and marks the question taught', async () => {
    const { service, prisma } = setup({
      storeAssistant: { findUnique: jest.fn().mockResolvedValue(row({ notes: 'Tostamos los martes.' })), upsert: jest.fn(async ({ update }: any) => row(update)) },
      assistantUnanswered: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', storeId: 's1', question: 'dan factura', status: 'open' }), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    });
    await service.unanswered('m1', 's1', 'u1', { action: 'teach', answer: 'Sí, con NIT.' }, now);
    expect(prisma.storeAssistant.upsert.mock.calls[0][0].update.notes).toBe('Tostamos los martes.\n\nPregunta: dan factura\nRespuesta: Sí, con NIT.');
    expect(prisma.assistantUnanswered.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { status: 'taught' } });
  });

  it('the test chat uses the preview allowance', async () => {
    const { service, usage, chat } = setup();
    usage.previewUsed.mockResolvedValue(50);
    await expect(service.test('m1', 's1', { message: 'hola' }, now)).rejects.toThrow('Usaste las 50 pruebas de este mes.');
    usage.previewUsed.mockResolvedValue(1);
    await service.test('m1', 's1', { message: 'hola' }, now);
    expect(chat.converse.mock.calls[0][0]).toMatchObject({ preview: true, message: 'hola' });
  });

  it('masks contact details in the conversation list', async () => {
    const { service } = setup({ assistantConversation: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', startedAt: now, buyerMessages: 2, addedToCart: true, handedOff: false, messages: [{ text: 'mi correo es ana@mail.com' }] }]) } });
    expect((await service.conversations('m1', 's1')).conversations[0].firstQuestion).toBe('mi correo es a***@mail.com');
  });

  const storeWith = (privacy: string) => ({ store: { findFirst: jest.fn().mockResolvedValue({ id: 's1', merchantId: 'm1', publishedSourceRevision: 2, policies: { privacy } }), update: jest.fn() } });

  it('refuses to switch on when the privacy policy has no room for the notice', async () => {
    const { service, prisma } = setup(storeWith('x'.repeat(5990)));
    await expect(service.save('m1', 's1', { enabled: true }, now)).rejects.toThrow('Tu política de privacidad es demasiado larga');
    expect(prisma.storeAssistant.upsert).not.toHaveBeenCalled();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('switching off removes the privacy paragraph', async () => {
    const { service, prisma } = setup(storeWith(`Cuidamos tus datos.\n\n${ASSISTANT_PRIVACY_PARAGRAPH}`));
    await service.save('m1', 's1', { enabled: false }, now);
    expect(prisma.store.update.mock.calls[0][0].data.policies.privacy).toBe('Cuidamos tus datos.');
  });

  it('only acts on an open question', async () => {
    const { service, prisma } = setup({ assistantUnanswered: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', storeId: 's1', question: 'q', status: 'taught' }), update: jest.fn(), findMany: jest.fn() } });
    await expect(service.unanswered('m1', 's1', 'u1', { action: 'teach', answer: 'Sí' }, now)).rejects.toThrow('Esta pregunta ya fue atendida.');
    expect(prisma.storeAssistant.upsert).not.toHaveBeenCalled();
    expect(prisma.assistantUnanswered.update).not.toHaveBeenCalled();
  });

  it('ops cap answers 404 for an unknown store', async () => {
    const prisma: any = { store: { findUnique: jest.fn().mockResolvedValue(null) }, storeAssistant: { upsert: jest.fn() } };
    await expect(new AssistantOpsController(prisma).cap('nope', { monthlyCap: 10 })).rejects.toThrow('Tienda no encontrada');
    expect(prisma.storeAssistant.upsert).not.toHaveBeenCalled();
  });
});
