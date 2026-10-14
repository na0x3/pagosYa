// Spec 2026-10-12 faster generation, part 2: a Sep-5 store is saved before its self-review, which lands later as N+1.
jest.setTimeout(60_000);

import { ConflictException, Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';
import { captureHeaderCovers } from './design-engine/header-clickable';
// Measuring launches Chromium; these tests exercise what the service does with a reading.
jest.mock('./store-look-measure', () => ({ ...jest.requireActual('./store-look-measure'), measureStoreLook: jest.fn().mockResolvedValue(null) }));
import { measureStoreLook } from './store-look-measure';

jest.mock('./product-theme-check', () => ({ ...jest.requireActual('./product-theme-check'), checkProductThemeOnSnapshot: jest.fn().mockResolvedValue([]) }));
jest.mock('./kit-surface-check', () => ({ checkKitSurfacesOnSnapshot: jest.fn().mockResolvedValue({ catalog: [], card: [], cart: [] }) }));
import { checkKitSurfacesOnSnapshot } from './kit-surface-check';

// Pixel sampling launches Chromium; unit tests exercise what the service does with a sample, not the decoder.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
// The review renders the draft in Chromium; unit tests exercise what the service does with the shots.
jest.mock('./design-engine/sep5-review-capture', () => ({ ...jest.requireActual('./design-engine/sep5-review-capture'), captureSep5Draft: jest.fn().mockResolvedValue({ shots: [{ width: 1280, y: 0, image: 'data:image/png;base64,AAAA' }], facts: [] }) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
const files = () => [
  { path: 'index.html', content: '<!doctype html><main><section id="menu"><h1>Menú</h1><div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>' },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;
const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));
const REVIEW = { label: 'Café pulido', notes: ['Oscurecí el texto para que se lea mejor.'], edits: [{ path: 'styles.css', find: 'color: #222', replace: 'color: #111' }] };
/** The author answers with the draft; the self-review answers with `review`. */
const respond = (review: (init: any) => Promise<Response>) => async (_url: unknown, init: any) => JSON.parse(init.body).text.format.name === 'storefront_self_review' ? review(init) : answer({ label: 'Café', files: files(), products: [] });
const eventually = async (check: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5)); expect(check()).toBe(true); };

function setup() {
  const revision = { current: 0 };
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue({ id: 'review-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    storeAgentThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = {
    prepare: jest.fn(async value => sourceProjectSnapshot(value)),
    current: jest.fn(async () => ({ revision: revision.current, slug: 'cafe' })),
    version: jest.fn(),
    // Like SourceProjectsService.save: the optimistic revision check, then the fence, in one transaction.
    save: jest.fn(async (_m: string, _s: string, value: any, _generation: unknown, fence?: (tx: unknown) => Promise<void>) => {
      if (value.revision !== revision.current) throw new ConflictException('El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.');
      if (fence) await fence(prisma);
      revision.current += 1;
      return { revision: revision.current, label: value.label, digest: 'd', createdAt: new Date(), restoredFrom: null, createdProducts: [], updatedProducts: [], deletedProducts: [] };
    }),
    recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, stores, projects, config, revision };
}

describe('Sep-5 self-review after the save', () => {
  let service: SourceGenerationService, prisma: any, stores: any, projects: any, config: any, revision: { current: number };
  let fetchMock: jest.SpyInstance;
  const progress = jest.fn(async () => undefined);
  const reviewCalls = () => fetchMock.mock.calls.filter(c => JSON.parse(c[1].body).text.format.name === 'storefront_self_review');
  const reviewWrites = () => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => c.where.id === 'review-1');
  const fenceWrite = () => reviewWrites().find((c: any) => c.where.status === 'REVIEWING' && c.data.status === 'COMPLETED' && c.data.revision);
  const ending = (status: string) => reviewWrites().find((c: any) => c.data.status === status);
  const generateN = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], progress);
  beforeEach(() => {
    ({ service, prisma, stores, projects, config, revision } = setup());
    progress.mockClear();
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.mocked(captureHeaderCovers).mockReset().mockResolvedValue([]);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respond(async () => answer(REVIEW)) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves the draft as revision N before the review runs, then saves the accepted review as N+1 «Revisión de YAPI»', async () => {
    const result: any = await generateN();
    expect(result.revision).toBe(1);
    expect(result.generation.attempts.some((attempt: any) => attempt.phase === 'review')).toBe(false);
    const reviewRow = prisma.storeSourceGeneration.create.mock.calls[1][0].data;
    expect(reviewRow).toEqual({ storeId: 's1', baseRevision: 1, requestedModel: expect.any(String), model: expect.any(String), maxCredits: expect.any(Number), status: 'REVIEWING' });
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(projects.save.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(reviewCalls()[0])]);
    const polished = projects.save.mock.calls[1][2];
    expect(polished).toMatchObject({ revision: 1, label: 'Revisión de YAPI' });
    expect(polished.files.find((file: any) => file.path === 'styles.css').content).toContain('color: #111');
    expect(projects.save.mock.calls[0][2].files.find((file: any) => file.path === 'styles.css').content).toContain('color: #222');
    const done = fenceWrite();
    expect(done.data).toMatchObject({ status: 'COMPLETED', revision: 2 });
    expect(done.data.credits).toBeGreaterThan(0);
    expect(prisma.storeAgentMessage.create).toHaveBeenCalledWith({ data: { threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'Pulí tu tienda: Oscurecí el texto para que se lea mejor.', metadata: { sourceRevision: 2, label: 'Revisión de YAPI', review: true } } });
  });

  it('never reports progress on the chat request the draft already finished', async () => {
    await generateN();
    const reported = progress.mock.calls.length;
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.length).toBe(reported);
  });

  it('discards the review silently when the merchant saved another revision meanwhile', async () => {
    fetchMock.mockImplementation(respond(async () => { revision.current = 2; return answer(REVIEW); }) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(fenceWrite()).toBeUndefined();
    expect(ending('DISCARDED').data).toMatchObject({ credits: 0 });
    expect(ending('DISCARDED').where).toEqual({ id: 'review-1', status: { in: ['REVIEWING', 'CANCELLED'] } });
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('saves no second version when no review edit applies', async () => {
    fetchMock.mockImplementation(respond(async () => answer({ ...REVIEW, edits: [{ path: 'styles.css', find: 'no existe en el borrador', replace: 'x' }] })) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('COMPLETED').data.revision).toBeUndefined();
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('keeps revision N when the review finds nothing to change', async () => {
    fetchMock.mockImplementation(respond(async () => answer({ label: 'Café', notes: [], edits: [] })) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('COMPLETED').data.credits).toBeGreaterThan(0);
  });

  it('keeps revision N and charges nothing when the review answer is unusable', async () => {
    fetchMock.mockImplementation(respond(async () => answer('esto no es JSON')) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('FAILED').data).toMatchObject({ credits: 0 });
  });

  it('discards review edits that bring in a header cover revision N did not have', async () => {
    config.set('app.headerClickGate', true);
    jest.mocked(captureHeaderCovers).mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 390, control: 'Carrito', cover: 'section.poster', section: 'hero', atTop: true }]);
    await generateN();
    await service.reviewSettled('s1');
    expect(captureHeaderCovers).toHaveBeenCalledTimes(2);
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('DISCARDED').data).toMatchObject({ credits: 0 });
  });

  it('runs no review and opens no review row with the self-review off', async () => {
    config.set('app.sep5SelfReview', false);
    await generateN();
    await service.reviewSettled('s1');
    expect(prisma.storeSourceGeneration.create).toHaveBeenCalledTimes(1);
    expect(reviewCalls()).toHaveLength(0);
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  /** A review call that waits until its signal aborts. */
  const hangingReview = (seen: { signal?: AbortSignal }) => respond(init => { seen.signal = init.signal; return new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(init.signal.reason))); });

  it('a new request cancels the running review before it takes the lease; the cancelled review saves nothing and costs nothing', async () => {
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => Boolean(seen.signal));
    const cancel = jest.spyOn(service, 'cancelReview');
    stores.getStorePublic.mockRejectedValueOnce(new Error('tienda no disponible'));
    await expect(service.generate('m1', 's1', { ...dto, revision: 1 }, new SourceRequestBudget(25), [], progress)).rejects.toThrow('tienda no disponible');
    expect(cancel).toHaveBeenCalledWith('s1');
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(stores.getStorePublic.mock.invocationCallOrder.at(-1)!);
    await service.reviewSettled('s1');
    expect(seen.signal!.aborted).toBe(true);
    expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { storeId: 's1', status: 'REVIEWING' }, data: { status: 'CANCELLED', completedAt: expect.any(Date) } });
    expect(ending('CANCELLED').data).toMatchObject({ credits: 0 });
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('leaves the review alone for a private visual-repair candidate', async () => {
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => Boolean(seen.signal));
    const cancel = jest.spyOn(service, 'cancelReview');
    stores.getStorePublic.mockRejectedValueOnce(new Error('tienda no disponible'));
    await expect(service.generate('m1', 's1', { ...dto, revision: 1 }, new SourceRequestBudget(25), [], progress, { candidate: true })).rejects.toThrow('tienda no disponible');
    expect(cancel).not.toHaveBeenCalled();
    expect(seen.signal!.aborted).toBe(false);
    await service.cancelReview('s1');
    await service.reviewSettled('s1');
  });

  it('keeps the review row beating while it runs, and stops the review when another process retired the row', async () => {
    (service as any).reviewHeartbeatMs = 5;
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => reviewWrites().some((c: any) => 'heartbeatAt' in c.data));
    expect(reviewWrites().find((c: any) => 'heartbeatAt' in c.data)).toEqual({ where: { id: 'review-1', status: 'REVIEWING' }, data: { heartbeatAt: expect.any(Date) } });
    prisma.storeSourceGeneration.updateMany.mockImplementation(async (args: any) => ({ count: 'heartbeatAt' in args.data ? 0 : 1 }));
    await service.reviewSettled('s1');
    expect(seen.signal!.aborted).toBe(true);
    expect(ending('CANCELLED').data).toMatchObject({ credits: 0 });
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  // Final review: N's save rewrote config.js with the catalog the run created; N+1 keeps that catalog.
  it('keeps the catalog revision N saved in config.js when the review saves N+1', async () => {
    projects.version.mockImplementation(async (_m: string, _s: string, rev: number) => ({ revision: rev, snapshot: { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","data":{"storeName":"Café","items":[{"id":"p1","name":"Latte"}]}};' }] } }));
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    const config = projects.save.mock.calls[1][2].files.find((file: any) => file.path === 'config.js').content;
    expect(JSON.parse(config.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, '')).data.items).toEqual([{ id: 'p1', name: 'Latte' }]);
  });

  // Final review: the ChatGPT bridge serves about two calls at once, so the polish goes first and the store's email look
  // and long product pages follow it.
  it('starts the email look and the product pages only after the background review ends', async () => {
    const emailKits = { designAfterSite: jest.fn().mockResolvedValue(undefined) };
    const pageWriter = { fillStore: jest.fn().mockResolvedValue(undefined) };
    Object.assign(service as any, { emailKits, pageWriter });
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => Boolean(seen.signal));
    expect(emailKits.designAfterSite).not.toHaveBeenCalled();
    expect(pageWriter.fillStore).not.toHaveBeenCalled();
    await service.cancelReview('s1');
    await service.reviewSettled('s1');
    await eventually(() => emailKits.designAfterSite.mock.calls.length === 1 && pageWriter.fillStore.mock.calls.length === 1);
  });
});

describe('one look per store: measured at every save', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const reading = { heading: { families: ['Anton'], weight: 400, transform: 'uppercase', literalUpper: false, letterSpacing: 4, fontSize: 40, italic: false }, loadedFamilies: ['Anton'], labels: [], photos: [], cards: [], buttons: [], sections: [], pageLuminance: 1 };
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respond(async () => answer(REVIEW)) as any);
    (measureStoreLook as jest.Mock).mockReset().mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the measured look into the saved config.js', async () => {
    config.set('app.yapiLookMeasure', true);
    (measureStoreLook as jest.Mock).mockResolvedValue(reading);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(configOf(projects.save.mock.calls[0]).look).toMatchObject({ version: 1, type: { heading: { family: 'Anton', case: 'upper', tracking: 0.1 } } });
  });

  it('still saves when measuring fails, without a look', async () => {
    config.set('app.yapiLookMeasure', true);
    (measureStoreLook as jest.Mock).mockRejectedValue(new Error('chromium crashed'));
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(configOf(projects.save.mock.calls[0]).look).toBeUndefined();
  });

  it('does not measure when YAPI_LOOK_MEASURE is off', async () => {
    config.set('app.yapiLookMeasure', false);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(measureStoreLook).not.toHaveBeenCalled();
  });
});

describe('one look per store: YAPI touches the kit pages in the review stage', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const TOUCH = { product: '', catalog: '', card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '', notes: ['Tarjetas inclinadas como en la portada.'] };
  const NO_EDITS = { label: 'Café', notes: [], edits: [] };
  const respondWith = (review: unknown, touch: unknown) => async (_url: unknown, init: any) => {
    const name = JSON.parse(init.body).text.format.name;
    return name === 'storefront_self_review' ? answer(review) : name === 'storefront_kit_touch' ? answer(touch) : answer({ label: 'Café', files: files(), products: [] });
  };
  const run = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.yapiKitTouch', true);
    (checkKitSurfacesOnSnapshot as jest.Mock).mockReset().mockResolvedValue({ catalog: [], card: [], cart: [] });
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves N+1 with the touch even when the review changes nothing', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await eventually(() => projects.save.mock.calls.length === 2);
    const dna = configOf(projects.save.mock.calls[1]).dna;
    expect(dna.cardCss).toContain('rotate(-2deg)');
    expect(dna.touch).toBe(1);
  });

  it('a surface that fails its check is dropped, and nothing left means no N+1', async () => {
    (checkKitSurfacesOnSnapshot as jest.Mock).mockResolvedValue({ catalog: [], card: [{ control: 'add', viewport: 'mobile', reason: 'covered by another element' }], cart: [] });
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('an unusable touch answer leaves revision N as the store', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, 'not json') as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 3600));
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('does not call the touch step when YAPI_KIT_TOUCH is off', async () => {
    config.set('app.yapiKitTouch', false);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(fetchMock.mock.calls.some(c => JSON.parse((c[1] as any).body).text.format.name === 'storefront_kit_touch')).toBe(false);
  });
});
