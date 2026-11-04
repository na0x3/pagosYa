import { SourceConversationService } from './source-conversation.service';
import { INTAKE_PROMPT } from './source-intake';

/** Spec 2026-11-04 §1: the intake call — one structured answer, null when it fails. */
const originalFetch = global.fetch;
let fetchMock: jest.Mock;
beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
const respondWith = (answer: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }) });
function setup() {
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  return new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: jest.fn() } as any, config);
}
const facts = { tienda: 'Láminas Lu', vende: '', historia: '', productos: 1, conFoto: [], sinFoto: ['Café'], fotos: 0, envios: false, recojo: false, codigo: '', whatsapp: false, instagram: false };

it('asks the model once with the intake prompt and returns its JSON', async () => {
  const answer = { understood: 'láminas', reply: '', ready: false, topic: 'look', question: '¿Cómo quieres que se vea?', options: ['Tranquila'] };
  respondWith(answer);
  const out = await setup().intakeStep('m1', { storeId: 's1', facts, words: 'quiero vender laminas', answers: [], asked: [] });
  expect(out).toEqual(answer);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.instructions).toBe(INTAKE_PROMPT);
  expect(body.text.format.name).toBe('store_intake');
  expect(JSON.parse(body.input[0].content[0].text)).toMatchObject({ palabras: 'quiero vender laminas', hechos: facts, preguntado: [] });
});

it('null after two failed attempts, so the store is built anyway', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  jest.useFakeTimers({ advanceTimers: true });
  await expect(setup().intakeStep('m1', { storeId: 's1', facts, words: 'x', answers: [], asked: [] })).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
