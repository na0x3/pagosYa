import { masterFillFromRead, type MasterRead } from './source-master';
import { SourceConversationService } from './source-conversation.service';

const read = (over: Partial<MasterRead> = {}): MasterRead => ({ announcement: '', eyebrow: 'Café de altura', headline: 'Café de Coroico', subcopy: 'Tostado cada semana.', primaryCta: 'Ver cafés', secondaryCta: 'Nuestra historia', productsTitle: 'Nuestros cafés', storyTitle: 'De la finca a tu taza', storyBody: 'Cuerpo',
  values: [{ title: 'a', text: 'b' }, { title: 'c', text: 'd' }, { title: 'e', text: 'f' }], closingLine: 'Pide el tuyo', closingCta: 'Ver todo', tagline: '',
  palette: 'sand', fonts: 'literary', colors: { paper: '', ink: '', muted: '', accent: '#9a4a2a', deep: '' }, heroPhoto: 1, storyPhoto: -1, changed: [], ...over });

describe('masterFillFromRead', () => {
  it('turns photo indexes into URLs and drops empty colours', () => {
    const fill = masterFillFromRead(read(), ['a.jpg', 'b.jpg'], false);
    expect(fill.heroPhoto).toBe('b.jpg');
    expect(fill.storyPhoto).toBeNull();
    expect(fill.look).toEqual({ palette: 'sand', fonts: 'literary', colors: { accent: '#9a4a2a' } });
    expect(fill.copy?.headline).toBe('Café de Coroico');
  });
  it('an out-of-range photo index is no photo', () => {
    expect(masterFillFromRead(read({ heroPhoto: 7 }), ['a.jpg'], false).heroPhoto).toBeNull();
  });
  it('an edit keeps only the fields the model says it changed', () => {
    expect(masterFillFromRead(read({ changed: ['headline'] }), ['a.jpg'], true)).toEqual({ copy: { headline: 'Café de Coroico' } });
  });
});

describe('fillMaster', () => {
  const input = { storeId: 's1', storeName: 'Café Buna', what: 'Café de especialidad', story: '', city: 'La Paz', products: ['Coroico 250 g'], photos: [], palettes: [{ id: 'sand', name: 'Arena' }], fonts: [{ id: 'literary', name: 'Literaria' }] };
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  const service = () => new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: () => 'image/jpeg' } as any, config);
  const body = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('returns the parsed read on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    expect((await service().fillMaster('m1', input))?.headline).toBe('Café de Coroico');
  });
  it('sends the strict schema with the store\'s palette and font ids', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    await service().fillMaster('m1', input);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(sent.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'master_fill' });
    expect(sent.text.format.schema.properties.palette.enum).toEqual(['sand']);
    expect(sent.instructions).toMatch(/Never invent reviews/);
  });
  it('returns null after a failed call and one retry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as any);
    expect(await service().fillMaster('m1', input)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
