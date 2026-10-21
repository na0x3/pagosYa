import { plantillaFallback, plantillaFillFromRead, plantillaFillSchema } from './source-plantilla-fill';

const slots = [
  { key: 'home_1', role: 'headline', default: 'Café que vale la pena', max: 34 },
  { key: 'home_2', role: 'lead', default: 'Granos tostados cada semana.', max: 45 },
  { key: 'home_3', role: 'question', default: '¿En grano o molido?', max: 30 },
  { key: 'home_4', role: 'answer', default: 'Como prefieras.', max: 24 },
  { key: 'home_5', role: 'cta', default: 'Comprar café', max: 19 },
  { key: 'shell_1', role: 'label', default: 'Mi pedido', max: 14 },
] as const;

// Spec 2026-10-20 Plantillas fill §4: one answer per slot, clipped, about the merchant — never the demo business.
describe('Plantilla fill', () => {
  it('asks for exactly one string per slot', () => {
    const schema = plantillaFillSchema(slots as any);
    expect(schema.required).toEqual(['home_1', 'home_2', 'home_3', 'home_4', 'home_5', 'shell_1']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.home_1).toEqual(expect.objectContaining({ type: 'string' }));
  });
  it('clips long answers at a word, drops unknown keys and leaves missing keys out', () => {
    const read = plantillaFillFromRead({ home_1: 'Cortes madurados en seco para tu parrilla de domingo', home_9: 'x', home_2: 42 }, slots as any);
    expect(read).toEqual({ home_1: 'Cortes madurados en seco para tu' });
    expect(read.home_1.length).toBeLessThanOrEqual(34);
  });
  it('falls back to the merchant’s own words, never to the template’s demo business', () => {
    const fallback = plantillaFallback(slots as any, { storeName: 'Meathouse', tagline: 'Carne madurada en seco', products: ['Ribeye', 'Tomahawk'] });
    expect(fallback.home_1).toBe('Meathouse');
    expect(fallback.home_2).toBe('Carne madurada en seco');
    expect(fallback.home_5).toBe('Ver productos');
    expect(fallback.home_3).toBe('');
    for (const slot of slots.filter(slot => slot.key.startsWith('home_'))) expect(fallback[slot.key]).not.toBe(slot.default);
    // The shop's own controls («Mi pedido») are not the demo business; they stay.
    expect(fallback.shell_1).toBe('Mi pedido');
  });
});

describe('fillPlantilla', () => {
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  const { SourceConversationService } = jest.requireActual('./source-conversation.service');
  const service = () => new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: () => 'image/jpeg' } as any, config);
  const body = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  const input = { storeId: 's1', storeName: 'Meathouse', about: 'Carne madurada en seco', products: ['Ribeye'], photos: [], slots: slots as any };
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('sends the slots with the demo text as an example, under a strict schema, and returns the clipped answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body({ home_1: 'Fuego sin disculpas', home_2: 'x', home_3: 'q', home_4: 'a', home_5: 'Ver cortes', shell_1: 'Mi pedido' }) } as any);
    const read = await service().fillPlantilla('m1', input);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(sent.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'plantilla_fill' });
    expect(sent.instructions).toMatch(/Never mention the demo business/);
    expect(JSON.parse(sent.input[0].content[0].text).slots[0]).toEqual({ key: 'home_1', role: 'headline', demo: 'Café que vale la pena', max: 34 });
    expect(read?.home_1).toBe('Fuego sin disculpas');
  });
  it('returns null after a failed call and one retry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as any);
    expect(await service().fillPlantilla('m1', input)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// Live check 2026-10-21: a slot beside the store name kept no space («…Santa Cruz.Parrilla Don Kike»).
it('keeps the template\'s edge spaces around the new words, in a fill and in the fallback', () => {
  const slots = [{ key: 'home_1', role: 'lead', default: 'Hecho a mano en ', max: 80 }, { key: 'home_2', role: 'body', default: ' cada pieza es única.', max: 80 }] as any;
  expect(plantillaFillFromRead({ home_1: 'Cortes madurados en Santa Cruz ', home_2: '  y entrega a domicilio. ' }, slots)).toEqual({ home_1: 'Cortes madurados en Santa Cruz ', home_2: ' y entrega a domicilio.' });
  expect(plantillaFallback(slots, { storeName: 'Kike', tagline: 'Carnes a la brasa', products: [] })).toEqual({ home_1: 'Carnes a la brasa ', home_2: '' });
});
