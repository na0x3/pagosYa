import { publicAssistant } from './assistant-public-settings';

const now = new Date('2026-10-13T15:00:00Z');
const store = { id: 's1', name: 'Café', logoUrl: '/v1/uploads/logo.png', contactPhone: '+591 70000000', publishedSourceRevision: 2, shippingEnabled: true };
const prisma = (row: any, used = 0): any => ({ storeAssistant: { findUnique: jest.fn().mockResolvedValue(row) }, assistantConversation: { count: jest.fn().mockResolvedValue(used) } });
const on = { enabled: true, name: 'Carla', greeting: null, avatarUrl: null, monthlyCap: 300 };

describe('public assistant settings', () => {
  it('fills defaults from the store', async () => {
    expect(await publicAssistant(prisma(on), store, true, true, now)).toEqual({
      name: 'Carla', greeting: '¡Hola! Soy Carla. ¿En qué te ayudo?', avatarUrl: '/v1/uploads/logo.png', handoff: 'whatsapp',
      suggestions: ['¿Qué me recomiendas?', '¿Hacen envíos a mi ciudad?', '¿Tienen otras tallas o colores?'],
    });
    expect(await publicAssistant(prisma({ ...on, name: null }), { ...store, contactPhone: null }, false, true, now)).toMatchObject({ name: 'Asistente de Café', greeting: '¡Hola! Soy el asistente de Café. ¿En qué te ayudo?', handoff: 'form' });
  });

  it('is null when the platform, the store or the design is off, or the month is used up', async () => {
    expect(await publicAssistant(prisma(on), store, false, false, now)).toBeNull();
    expect(await publicAssistant(prisma({ ...on, enabled: false }), store, false, true, now)).toBeNull();
    expect(await publicAssistant(prisma(on), { ...store, publishedSourceRevision: null }, false, true, now)).toBeNull();
    expect(await publicAssistant(prisma(on, 300), store, false, true, now)).toBeNull();
  });
});
