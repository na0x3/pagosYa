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
  it('a hero-photo edit changes the hero only (review fix 6)', () => {
    expect(masterFillFromRead(read({ changed: ['heroPhoto'] }), ['a.jpg', 'b.jpg'], true)).toEqual({ heroPhoto: 'b.jpg' });
  });
  it('an edit keeps only the fields the model says it changed', () => {
    expect(masterFillFromRead(read({ changed: ['headline'] }), ['a.jpg'], true)).toEqual({ copy: { headline: 'Café de Coroico' } });
  });
});

describe('character and sections (variety spec §3)', () => {
  it('a layout the merchant names becomes that part\'s variant', () => {
    const fill = masterFillFromRead({ ...read(), changed: ['variants'], variantChoices: [{ part: 'hero', id: 'split-left' }] } as any, [], true);
    expect(fill.variants).toEqual({ hero: 'split-left' });
  });
  it('maps the character and business sections from the read', () => {
    const fill = masterFillFromRead({ ...read(), tone: 'bold', temperature: 'cool', lead: 'text', exclude: ['type'], sections: [{ id: 'process', title: 'Del cafetal', items: [{ title: 'Cosecha', text: 'A mano' }, { title: 'Tueste', text: 'Cada semana' }] }] } as any, [], false);
    expect(fill.character).toEqual({ tone: 'bold', temperature: 'cool', lead: 'text', exclude: ['type'] });
    expect(fill.sections?.[0].id).toBe('process');
  });
});

describe('fillMaster', () => {
  const input = { storeId: 's1', storeName: 'Café Buna', what: 'Café de especialidad', story: '', city: 'La Paz', products: ['Coroico 250 g'], photos: [], palettes: [{ id: 'sand', name: 'Arena' }], fonts: [{ id: 'literary', name: 'Literaria' }] };
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  const service = () => new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: () => 'image/jpeg' } as any, config);
  const body = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('sends only images: a video upload is skipped, the photo labels keep their indexes (PEPPA please 2026-10-20)', async () => {
    // The ChatGPT-plan bridge answered 400 invalid_value to an mp4 sent as an image, twice, and every store with a video
    // upload was built without its fill.
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    const photos = ['https://cdn.test/uploads/clip.mp4', 'https://cdn.test/uploads/a.jpg'];
    const uploads = { getBuffer: jest.fn(async () => Buffer.from('x')), contentTypeFor: (name: string) => name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' };
    const svc = new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue(photos.map(url => ({ url }))) } } as any, uploads as any, config);
    await svc.fillMaster('m1', { ...input, photos });
    const content = JSON.parse((fetchMock.mock.calls[0][1] as any).body).input[0].content;
    expect(content.filter((part: any) => part.type === 'input_image').map((part: any) => part.image_url.split(';')[0])).toEqual(['data:image/jpeg']);
    expect(content.filter((part: any) => part.type === 'input_text').map((part: any) => part.text)).toContain('Foto 1');
    expect(content.some((part: any) => part.text === 'Foto 0')).toBe(false);
  });
  it('returns the parsed read on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    expect((await service().fillMaster('m1', input))?.headline).toBe('Café de Coroico');
  });
  it('sends the strict schema with the store\'s palette and font ids', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    await service().fillMaster('m1', { ...input, sectionCatalogue: ['process', 'faq'] });
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(sent.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'master_fill' });
    expect(sent.text.format.schema.properties.palette.enum).toEqual(['sand']);
    expect(sent.instructions).toMatch(/Never invent reviews/);
    expect(sent.text.format.schema.properties.tone.enum).toEqual(['calm', 'bold']);
    expect(sent.text.format.schema.properties.sections.items.properties.id.enum).toContain('process');
  });
  it('asks for exclusions by part, so an id two parts share (compact density, compact cards) rules out only the one meant', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    await service().fillMaster('m1', { ...input, variantCatalogue: { density: ['airy', 'compact'], cards: ['showcase', 'compact'] } });
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(sent.text.format.schema.properties.exclude.items.enum).toEqual(['density:airy', 'density:compact', 'cards:showcase', 'cards:compact']);
    expect(sent.instructions).toMatch(/part:id/);
  });
  it('labels every image with its index and sends the current photo choices (review fix 6)', async () => {
    const svc = new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([{ url: 'https://x/u/a.jpg' }, { url: 'https://x/u/c.jpg' }]) } } as any,
      { getBuffer: jest.fn().mockResolvedValue(Buffer.from('px')), contentTypeFor: () => 'image/jpeg' } as any, config);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body(read()) } as any);
    await svc.fillMaster('m1', { ...input, photos: ['https://x/u/a.jpg', 'https://other/b.jpg', 'https://x/u/c.jpg'], current: { copy: {} as any, look: { palette: 'sand', fonts: 'literary', colors: {} }, heroPhoto: 2, storyPhoto: -1 } });
    const content = JSON.parse((fetchMock.mock.calls[0][1] as any).body).input[0].content;
    expect(content.filter((part: any) => part.type === 'input_text').map((part: any) => part.text).slice(1)).toEqual(['Foto 0', 'Foto 2']);
    expect(JSON.parse(content[0].text).current).toMatchObject({ heroPhoto: 2, storyPhoto: -1 });
  });
  it('returns null after a failed call and one retry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as any);
    expect(await service().fillMaster('m1', input)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
