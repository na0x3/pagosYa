import { SourceConversationService } from './source-conversation.service';

/** Point YAPI at a part of the page (spec 2026-11-05 point-at): the quick edit call carries the focus and the circled picture. */
const originalFetch = global.fetch;
let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ops: [], store: [], rest: 'nada' }) }] }] }) });
  global.fetch = fetchMock;
});
afterEach(() => { global.fetch = originalFetch; });
const service = () => {
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-terra') };
  return new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: jest.fn() } as any, config);
};
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

it('sends the focus as «foco» and the circled picture as an image', async () => {
  const focus = { pagina: 'home', secciones: [1], textos: ['Hola'], fotos: [], partes: [] };
  await service().editLayout('m1', { storeId: 's1', layout: [{ type: 'cover-split', title: 'Hola' }] as never, request: 'cambia esto', focus, picture: Buffer.from('jpg') });
  const content = sent().input[0].content;
  expect(JSON.parse(content[0].text).foco).toEqual(focus);
  expect(content[1]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,anBn', detail: 'high' });
});

it('sends neither when nothing was pointed at', async () => {
  await service().editLayout('m1', { storeId: 's1', layout: [{ type: 'cover-split', title: 'Hola' }] as never, request: 'cambia el título' });
  const content = sent().input[0].content;
  expect(content).toHaveLength(1);
  expect(JSON.parse(content[0].text).foco).toBeUndefined();
});

it('lists the pages YAPI made under their address, and their address and the dropdowns in the schema (spec 2026-11-05 creates anything)', async () => {
  await service().editLayout('m1', { storeId: 's1', layout: [{ type: 'cover-split', title: 'Hola' }] as never, request: 'agrega un paso en Novias',
    extraPages: [{ slug: 'novias', nombre: 'Novias', layout: [{ type: 'story-list', title: 'Pasos' }] as never }], menuGroups: ['Colecciones'] });
  const body = sent();
  expect(JSON.parse(body.input[0].content[0].text).paginas.novias).toMatchObject({ nombre: 'Novias' });
  const schema = JSON.stringify(body.text.format.schema);
  expect(schema).toContain('"novias"');
  expect(schema).toContain('"Colecciones"');
});
