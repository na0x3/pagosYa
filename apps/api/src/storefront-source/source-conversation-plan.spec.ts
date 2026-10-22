import { PLAN_PROMPT, SourceConversationService } from './source-conversation.service';

const catalogue = { variants: { hero: ['full', 'type'], grid: ['grid3', 'grid4'] }, sections: ['faq', 'sizes'], palettes: ['linen'], fonts: ['grotesk'] };
const facts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
const request = { storeId: 's1', storeName: 'Luz', what: 'velas', request: 'hazme una tienda', products: ['Vela'], facts, photos: [], catalogue, revision: 0 };
function setup() {
  const prisma: any = { mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  return new SourceConversationService(prisma, uploads, config);
}
const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const respondWith = (answer: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }) });
beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

it('the prompt carries the owner rules', () => {
  expect(PLAN_PROMPT).toMatch(/nunca inventes un color/i);
  expect(PLAN_PROMPT).toMatch(/Foto N/);
  expect(PLAN_PROMPT).toMatch(/3 o 4 por fila/);
});

it('returns a normalised plan and sends the clash words when re-planning', async () => {
  respondWith({ parts: { hero: { id: 'type', why: 'nombre corto de la marca' }, grid: null }, sections: [], custom: [], colour: { palette: 'linen', accent: null, from: '' },
    fonts: { id: 'grotesk', why: 'tono claro' }, motif: null, brands: [], card: ['Portada con el nombre en grande'] });
  const plan = await setup().planStore('m1', { ...request, clash: 'misma portada que otra tienda' });
  expect(plan?.parts.hero).toEqual({ id: 'type', why: 'nombre corto de la marca' });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.input[0].content[0].text).toContain('misma portada que otra tienda');
  expect(body.text.format.name).toBe('store_plan');
});

it('null after two failures', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  jest.useFakeTimers({ advanceTimers: true });
  expect(await setup().planStore('m1', request)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
