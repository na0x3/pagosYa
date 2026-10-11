// "Elige tu estilo" (spec 2026-10-11): proposal mode of a real generate() run, planner and hero writer mocked.
jest.setTimeout(60_000);

import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import * as styleHero from './design-engine/style-hero';
import * as styleDrawsModule from './design-engine/style-draws';
import { Logger } from '@nestjs/common';
import { SourceGenerationService } from './source-generation.service';
import { validateStyleDesign } from './source-style-design';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';

// Pixel sampling launches Chromium; unit tests exercise what the service does with a sample, not the decoder.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna(),
  cardName: `${name} de barrio`, vibe: `${name} vibe paragraph.`, inspiration: ['El tostado de cada mañana', 'La esquina de la plaza', 'Tazas de cerámica local'] });
const modes = ['calm', 'calm', 'bold', 'bold'] as Array<'calm' | 'bold'>;
/** A planner result whose concepts carry the cards of exactly these slots. */
const designWith = (slots: number[]): designModule.SourceDesign => {
  const { design } = validateStyleDesign({ concepts: ['Menu', 'Window', 'Counter', 'Studio'].map(concept), selection: { index: 0, rationale: 'r' } }, modes, { narrative: true });
  return { ...design, selected: 0, concepts: design.concepts.filter(c => slots.includes(c.card!.slot)) };
};
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(name => { const { cardName, vibe, inspiration, ...rest } = concept(name); return rest; }), selected: 0 }, 0, true, true);
const files = () => [
  { path: 'index.html', content: '<!doctype html><main><section id="menu"><h1>Menú</h1><div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>' },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;

function setup() {
  const prisma: any = { storeRetention: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) }, store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) } };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = { prepare: jest.fn(async value => sourceProjectSnapshot(value)), current: jest.fn().mockResolvedValue({ revision: 0, slug: 'cafe' }), save: jest.fn().mockImplementation(async (_m, _s, value) => ({ revision: 1, snapshot: sourceProjectSnapshot(value) })), version: jest.fn(), recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]) };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static',
    'app.yapiStylePick': true, 'app.sep5Author': true, 'app.yapiPlaybook': true, 'app.yapiFrameDraw': true, 'app.yapiDesignDraw': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects, config, metering };
}

describe('style proposal mode', () => {
  let service: SourceGenerationService, prisma: any, projects: any, config: any, metering: any;
  let explore: jest.SpyInstance, writeStyleHero: jest.SpyInstance, fetchMock: jest.SpyInstance, draws: jest.SpyInstance;
  let budget: SourceRequestBudget;
  const progress = jest.fn(async () => undefined);
  /** The Sep-5 author prompt of this run, if the author was called. */
  const authorPrompt = (): string | undefined => {
    const call = fetchMock.mock.calls.map(c => JSON.parse(c[1].body as string)).find(body => body.text?.format?.name === 'independent_storefront');
    return call?.input[0].content[0].text;
  };
  beforeEach(() => {
    ({ service, prisma, projects, config, metering } = setup());
    progress.mockClear();
    budget = new SourceRequestBudget(25);
    explore = jest.spyOn(SourceDesignPlanner.prototype, 'explore');
    draws = jest.spyOn(styleDrawsModule, 'styleDraws');
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    writeStyleHero = jest.spyOn(styleHero, 'writeStyleHero').mockResolvedValue({ html: '<header data-store-name>x</header>', source: 'model' });
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'Café', files: files(), products: [] }) }] }] })));
  });
  afterEach(() => jest.restoreAllMocks());

  it('makes a proposal instead of building: four slots to the planner, a hero per concept, row left awaiting the pick', async () => {
    explore.mockResolvedValueOnce(designWith([0, 1, 2, 3]));
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect(result).toEqual({ styleProposal: { generationId: expect.any(String), cards: 4 } });
    const call = explore.mock.calls[0][0];
    expect(call.styleSlots.map((slot: { mode: string }) => slot.mode)).toEqual(['calm', 'calm', 'bold', 'bold']);
    expect(JSON.parse(call.context).designDraw).toBeUndefined();
    expect(writeStyleHero).toHaveBeenCalledTimes(4);
    expect(writeStyleHero.mock.calls.map(c => [c[0].facts.storeName, c[0].facts.mode])).toEqual([['Café', 'calm'], ['Café', 'calm'], ['Café', 'bold'], ['Café', 'bold']]);
    await writeStyleHero.mock.calls[0][0].record({ usage: null }, { durationMs: 7, status: 'COMPLETED' });
    expect(metering.record).toHaveBeenCalledWith('s1', 'source-style-hero', expect.any(String), { usage: null }, 7, 'COMPLETED');
    const final = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.data.status === 'AWAITING_STYLE');
    expect(final.data).toMatchObject({ activeStoreId: null, proposal: expect.objectContaining({ version: 1, status: 'AWAITING_STYLE' }) });
    expect(progress).toHaveBeenCalledWith('styles');
    expect(authorPrompt()).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('throws and leaves no proposal awaiting when the run lost its row before the proposal finished', async () => {
    explore.mockResolvedValueOnce(designWith([0, 1, 2, 3]));
    // The stale sweep marked the row INTERRUPTED: every RUNNING-guarded write after the start matches nothing.
    prisma.storeSourceGeneration.updateMany.mockImplementation(async (args: any) => ({ count: args.data.status === 'AWAITING_STYLE' ? 0 : 1 }));
    await expect(service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true })).rejects.toThrow();
    const awaiting = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => c.data.status === 'AWAITING_STYLE');
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].where).toEqual({ id: 'run-1', status: 'RUNNING', activeStoreId: 's1' });
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('guards every proposal write on a running row', async () => {
    explore.mockResolvedValueOnce(designWith([0, 1, 2, 3]));
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    const writes = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => 'proposal' in c.data);
    expect(writes.length).toBe(6);
    expect(writes.every((c: any) => c.where.status === 'RUNNING' && c.where.id === 'run-1')).toBe(true);
  });

  it('builds directly with the only card the planner kept, on its own drawn slot', async () => {
    explore.mockResolvedValueOnce(designWith([2]));
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect('styleProposal' in result).toBe(false);
    expect(authorPrompt()).toContain('BOLD BY DEFAULT');
    expect(explore).toHaveBeenCalledTimes(1);
    expect(projects.save).toHaveBeenCalledTimes(1);
    const drawn = draws.mock.results[0].value[2].file;
    expect(projects.save.mock.calls[0][2].files).toContainEqual(drawn);
  });

  it('falls back to today when the style planner fails', async () => {
    explore.mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(threeConceptDesign);
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect('styleProposal' in result).toBe(false);
    expect(explore.mock.calls[1][0].styleSlots).toBeUndefined();
    expect(writeStyleHero).not.toHaveBeenCalled();
  });

  it('changes nothing with the flag off', async () => {
    config.set('app.yapiStylePick', false);
    explore.mockResolvedValueOnce(threeConceptDesign);
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect(explore.mock.calls[0][0].styleSlots).toBeUndefined();
    expect(explore).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalledWith('styles');
    expect(authorPrompt()).not.toContain('BOLD BY DEFAULT');
  });
});
