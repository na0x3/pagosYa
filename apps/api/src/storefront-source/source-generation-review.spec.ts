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
import { captureBrokenHeadings } from './design-engine/phone-layout';
import { controlsKey, pickLibraryControls, storePalette } from './store-controls-library';
// Measuring launches Chromium; these tests exercise what the service does with a reading.
jest.mock('./store-look-measure', () => ({ ...jest.requireActual('./store-look-measure'), measureStoreLook: jest.fn().mockResolvedValue(null) }));
import { measureStoreLook } from './store-look-measure';

jest.mock('./product-theme-check', () => ({ ...jest.requireActual('./product-theme-check'), checkProductThemeOnSnapshot: jest.fn().mockResolvedValue([]) }));
jest.mock('./kit-surface-check', () => ({ checkKitSurfacesOnSnapshot: jest.fn().mockResolvedValue({ catalog: [], card: [], cart: [] }) }));
import { checkKitSurfacesOnSnapshot } from './kit-surface-check';
import * as kitTouchModule from './kit-touch';
import * as controlsDesignModule from './store-controls-design';
import { CONTROLS_REQUEST_DROPPED_NOTE } from './store-controls-design';
const realTouchBudget = kitTouchModule.touchBudgetMs;

// Pixel sampling launches Chromium; unit tests exercise what the service does with a sample, not the decoder.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
// The review renders the draft in Chromium; unit tests exercise what the service does with the shots.
jest.mock('./design-engine/sep5-review-capture', () => ({ ...jest.requireActual('./design-engine/sep5-review-capture'), captureSep5Draft: jest.fn().mockResolvedValue({ shots: [{ width: 1280, y: 0, image: 'data:image/png;base64,AAAA' }], facts: [] }) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));
jest.mock('./design-engine/phone-layout', () => ({ ...jest.requireActual('./design-engine/phone-layout'), captureBrokenHeadings: jest.fn().mockResolvedValue([]) }));
// The controls guard launches Chromium; these tests exercise what the service does with its verdict.
jest.mock('./store-controls-guard', () => ({ ...jest.requireActual('./store-controls-guard'), guardControlsOnSnapshot: jest.fn().mockResolvedValue([]), captureControlsShots: jest.fn().mockResolvedValue([]) }));
import { guardControlsOnSnapshot } from './store-controls-guard';
import { CART_ICONS } from './store-controls-library';

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

function setup(brands?: unknown, strict = false) {
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
      if (strict) sourceProjectSnapshot(value); // the real save rejects duplicate paths
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
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, brands as any, metering), prisma, stores, projects, config, revision };
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
    jest.mocked(captureBrokenHeadings).mockReset().mockResolvedValue([]);
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

  it('discards review edits that split a headline on the phone revision N did not split', async () => {
    config.set('app.headerClickGate', true);
    jest.mocked(captureBrokenHeadings).mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 390, word: 'sabor', heading: 'El sabor', column: 68 }]);
    await generateN();
    await service.reviewSettled('s1');
    expect(captureBrokenHeadings).toHaveBeenCalledTimes(2);
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

  it('redeems reward credits for the review row it saves (the service helper keeps its `this`)', async () => {
    // coverWithRewardCredits swallows its own errors: called without `this` it would return 0 and redeem nothing, silently.
    const rewards = { redeemForGeneration: jest.fn().mockResolvedValue(0) };
    (service as any).rewards = rewards;
    await generateN();
    await service.reviewSettled('s1');
    expect(fenceWrite().data.credits).toBeGreaterThan(0);
    expect(rewards.redeemForGeneration).toHaveBeenCalledWith('m1', 'review-1', fenceWrite().data.credits);
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
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('an unusable touch answer leaves revision N as the store', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, 'not json') as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('does not call the touch step when YAPI_KIT_TOUCH is off', async () => {
    config.set('app.yapiKitTouch', false);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await service.reviewSettled('s1');
    expect(fetchMock.mock.calls.some(c => JSON.parse((c[1] as any).body).text.format.name === 'storefront_kit_touch')).toBe(false);
  });
  const READING = { heading: { families: ['Anton'], weight: 400, transform: 'uppercase', literalUpper: false, letterSpacing: 4, fontSize: 40, italic: false }, loadedFamilies: ['Anton'], labels: [], photos: [], cards: [], buttons: [], sections: [], pageLuminance: 1 };

  it('a touch that outlives its own budget is dropped (reason deadline) and N+1 still saves the review edits', async () => {
    // The review stage gives the touch min(150 s, time left − 90 s); here that budget is made 1 s.
    jest.spyOn(kitTouchModule, 'touchBudgetMs').mockImplementation((left: number, margin?: number) => margin === 90_000 ? 1_000 : realTouchBudget(left, margin));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    let touchAborted = false;
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: any) => {
      if (JSON.parse(init.body).text.format.name !== 'storefront_kit_touch') return respondWith(REVIEW, TOUCH)(url, init);
      // A bridge that hangs: it answers only after 5 s unless the touch's own signal aborts it first.
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(answer(TOUCH)), 5_000);
        init.signal?.addEventListener('abort', () => { clearTimeout(timer); touchAborted = true; reject(init.signal.reason); });
      });
    }) as any);
    await run();
    await service.reviewSettled('s1');
    expect(touchAborted).toBe(true);
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(configOf(projects.save.mock.calls[1]).dna.cardCss).toBeUndefined();
    expect(warn.mock.calls.map(c => String(c[0])).some(line => line.includes('"event":"kit_touch_dropped"') && line.includes('"reason":"deadline"'))).toBe(true);
  });

  it('measures the home at most twice in a touched build: the final save reuses the touch base look', async () => {
    config.set('app.yapiLookMeasure', true);
    (measureStoreLook as jest.Mock).mockReset().mockResolvedValue(READING);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, TOUCH) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    const saved = configOf(projects.save.mock.calls[1]);
    expect(saved.dna.cardCss).toContain('rotate(-2deg)');
    expect(saved.look).toMatchObject({ version: 1, type: { heading: { family: 'Anton', case: 'upper' } } });
    expect(measureStoreLook).toHaveBeenCalledTimes(2);
  });

  it('N+1 falls back to the look revision N just measured when its own measurement fails', async () => {
    config.set('app.yapiLookMeasure', true);
    config.set('app.yapiKitTouch', false);
    (measureStoreLook as jest.Mock).mockReset().mockResolvedValueOnce(READING).mockRejectedValue(new Error('chromium crashed'));
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, TOUCH) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    const n = configOf(projects.save.mock.calls[0]).look;
    expect(n).toMatchObject({ version: 1, type: { heading: { family: 'Anton' } } });
    expect(configOf(projects.save.mock.calls[1]).look).toEqual(n);
  });

  it('a redesign whose measurement fails saves no look, even when the previous revision had one', async () => {
    config.set('app.yapiLookMeasure', true);
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiKitTouch', false);
    (measureStoreLook as jest.Mock).mockReset().mockResolvedValueOnce(READING).mockRejectedValue(new Error('chromium crashed'));
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    const saved = projects.save.mock.calls[0][2];
    expect(configOf(projects.save.mock.calls[0]).look).toBeDefined();
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...saved, revision: 1 }) });
    await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(25), []);
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).look).toBeUndefined();
  });

  describe('a chat request about the kit pages re-runs the touch', () => {
    const OLD = { touch: 1, cardCss: ':root:root:root [data-pagosya-catalog] [data-part="card-name"]{letter-spacing:.1em}', cartCss: ':root:root:root .cart-drawer [data-part="cart-head"]{border-bottom:3px solid #111}' };
    const EDIT = { label: 'Fotos inclinadas', edits: [{ path: 'styles.css', search: '#222', replacement: '#333' }], files: [] };
    const touchedStore = async () => {
      config.set('app.sep5SelfReview', false);
      config.set('app.yapiKitTouch', false);
      jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
      await run();
      const saved = projects.save.mock.calls[0][2];
      const files = saved.files.map((f: any) => f.path !== 'config.js' ? f : { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...configOf(projects.save.mock.calls[0]), dna: { ...configOf(projects.save.mock.calls[0]).dna, ...OLD } })};\n` });
      projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...saved, files, revision: 1 }) });
      config.set('app.yapiKitTouch', true);
      jest.restoreAllMocks();
      jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
      jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
      return jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(JSON.parse(init.body).text.format.name === 'storefront_kit_touch' ? TOUCH : EDIT)) as any);
    };
    it('saves the new card CSS with touch:1, keeps the untouched surfaces, and bills the touch attempt', async () => {
      const fetchMock = await touchedStore();
      const result: any = await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Pon las fotos de los productos inclinadas' }, new SourceRequestBudget(500), []);
      expect(fetchMock.mock.calls.some(c => JSON.parse((c[1] as any).body).text.format.name === 'storefront_kit_touch')).toBe(true);
      const dna = configOf(projects.save.mock.calls[1]).dna;
      expect(dna.touch).toBe(1);
      expect(dna.cardCss).toContain('rotate(-2deg)');
      expect(dna.cartCss).toBe(OLD.cartCss);
      expect(result.generation.attempts.find((a: any) => a.phase === 'touch')).toMatchObject({ status: 'COMPLETED' });
    });
  });
  describe('with a confirmed brand (brand.css is written on every assemble)', () => {
    const brand = { revision: 1, data: { confirmed: [{ field: 'accent', value: '#135724', evidence: 'Manual', source: 'merchant' }], suggested: [] } };
    const brandCount = (call: any[]) => call[2].files.filter((f: any) => f.path === 'brand.css').length;
    beforeEach(() => {
      ({ service, projects, config } = setup({ get: jest.fn().mockResolvedValue(brand) }, true));
      jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
      jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
      config.set('app.yapiKitTouch', true);
    });
    it('saves N+1 with exactly one brand.css when only the touch changes the store', async () => {
      jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
      await run();
      await service.reviewSettled('s1');
      expect(projects.save).toHaveBeenCalledTimes(2);
      expect([brandCount(projects.save.mock.calls[0]), brandCount(projects.save.mock.calls[1])]).toEqual([1, 1]);
      expect(configOf(projects.save.mock.calls[1]).dna.cardCss).toContain('rotate(-2deg)');
    });
    it('saves N+1 with exactly one brand.css when the review edits and the touch both apply', async () => {
      jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, TOUCH) as any);
      await run();
      await service.reviewSettled('s1');
      expect(projects.save).toHaveBeenCalledTimes(2);
      expect([brandCount(projects.save.mock.calls[0]), brandCount(projects.save.mock.calls[1])]).toEqual([1, 1]);
      expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    });
  });
});

// Spec 2026-10-14 store controls. The fixture home has no <body>, so the platform header has nowhere to claim its slot
// (withSourceHeader's claimSlot); these tests give the author's home a body so the header, and its controls, are drawn.
const homeWithBody = () => files().map(file => file.path === 'index.html' ? { ...file, content: file.content.replace('<!doctype html>', '<!doctype html><html lang="es"><body>') + '</body></html>' } : file);
const authorWithBody = (review: unknown) => async (_url: unknown, init: any) => JSON.parse(init.body).text.format.name === 'storefront_self_review' ? answer(review) : answer({ label: 'Café', files: homeWithBody(), products: [] });

describe('store controls: revision N gets a library language (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const homeOf = (call: any[]): string => call[2].files.find((f: any) => f.path === 'index.html').content;
  const EDIT = (from: string, to: string) => ({ label: 'Texto', edits: [{ path: 'styles.css', search: from, replacement: to }], files: [] });
  const build = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves the seeded library pick in config.js and draws it into the header of revision N', async () => {
    await build();
    const controls = configOf(projects.save.mock.calls[0]).controls;
    expect(controls).toEqual(pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(projects.save.mock.calls[0][2].files) }));
    expect(homeOf(projects.save.mock.calls[0])).toContain(`data-controls-outline="${controls.shape.outline}"`);
    expect(homeOf(projects.save.mock.calls[0])).toContain('<style data-pagosya-controls-style>');
  });

  it('never repeats the outline and cart icon of the latest sibling stores', async () => {
    const alone = pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(files()) });
    projects.recentControls = jest.fn().mockResolvedValue([{ kind: 'general', controls: alone }]);
    await build();
    expect(projects.recentControls).toHaveBeenCalledWith('s1', expect.any(Date), 40);
    expect(controlsKey(configOf(projects.save.mock.calls[0]).controls)).not.toBe(controlsKey(alone));
  });

  it("an edit carries the language; with YAPI_CONTROLS off the next save drops it and draws today's header", async () => {
    await build();
    const first = configOf(projects.save.mock.calls[0]).controls;
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    (globalThis.fetch as unknown as jest.Mock).mockImplementation((async () => answer(EDIT('#222', '#333'))) as any);
    await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Oscurece un poco el texto' }, new SourceRequestBudget(500), []);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(first);
    expect(homeOf(projects.save.mock.calls[1])).toContain(`data-controls-outline="${first.shape.outline}"`);
    config.set('app.yapiControls', false);
    projects.version.mockResolvedValue({ revision: 2, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[1][2], revision: 2 }) });
    (globalThis.fetch as unknown as jest.Mock).mockImplementation((async () => answer(EDIT('#333', '#444'))) as any);
    await service.generate('m1', 's1', { ...dto, revision: 2, instruction: 'Oscurece un poco más el texto' }, new SourceRequestBudget(500), []);
    expect(configOf(projects.save.mock.calls[2]).controls).toBeUndefined();
    expect(homeOf(projects.save.mock.calls[2])).not.toContain('data-controls-');
    expect(homeOf(projects.save.mock.calls[2])).toContain('<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span>');
  });

  it("a redesign picks a new language away from the store's previous one", async () => {
    await build();
    const previous = configOf(projects.save.mock.calls[0]).controls;
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(25), []);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:1', avoid: [previous], palette: storePalette(projects.save.mock.calls[1][2].files) }));
  });
});

describe('store controls: the guard on revision N (spec 2026-10-14, part 5)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const homeOf = (call: any[]): string => call[2].files.find((f: any) => f.path === 'index.html').content;
  const build = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  const picked = () => pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(projects.save.mock.calls[0][2].files) });
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("saves no record and today's header when the library language fails the guard", async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 390, slot: 'cart', check: 'contrast', detail: 'word 1.20:1, needs 4.5:1' }]);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toBeUndefined();
    expect(homeOf(projects.save.mock.calls[0])).not.toContain('data-controls-');
    expect(log.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_dropped"') && line.includes('"source":"library"'))).toBe(true);
  });

  it('an icon that fails the guard takes the line drawing of the library icon for that slot only', async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 1440, slot: 'cart', check: 'icon', detail: 'the icon paints 0 pixels' }]);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toEqual({ ...picked(), icons: { ...picked().icons, cart: CART_ICONS.bag.line } });
    // The seeded pick is a line language whose cart already is the bag: the log proves the verdict reached the save.
    expect(log.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_saved"') && line.includes('"iconFallbacks":["cart"]'))).toBe(true);
  });

  it('keeps the library language when the guard itself cannot run', async () => {
    (guardControlsOnSnapshot as jest.Mock).mockRejectedValueOnce(new Error('chromium crashed'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toEqual(picked());
    expect(guardControlsOnSnapshot).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_guard_failed"') && line.includes('chromium crashed'))).toBe(true);
  });
});

describe('store controls: YAPI designs N+1 in the review stage (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, prisma: any, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const DESIGNED = {
    shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
    layout: { cart: 'icon+word', account: 'icon' },
    icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: '', minus: '', close: '' },
    words: { cart: 'Tu taza', account: '' }, badge: 'stamp',
    note: 'Diseñé los botones como sellos, con una taza para el carrito.',
  };
  const SAVED = { version: 1, shape: DESIGNED.shape, layout: DESIGNED.layout, icons: { cart: CART_ICONS.cup.solid }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' };
  const NO_EDITS = { label: 'Café', notes: [], edits: [] };
  const schemaOf = (init: any) => JSON.parse(init.body).text.format.name;
  const respondWith = (review: unknown, controls: (init: any) => Promise<Response>) => async (_url: unknown, init: any) =>
    schemaOf(init) === 'storefront_self_review' ? answer(review) : schemaOf(init) === 'storefront_controls' ? controls(init) : answer({ label: 'Café', files: files(), products: [] });
  const ended = (status: string) => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.where.id === 'review-1' && c.data.status === status);
  const run = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, prisma, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    config.set('app.yapiControls', true);
    config.set('app.yapiControlsDesign', true);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("saves YAPI's controls in N+1 with the review's edits, bills the call and puts its note in the chat", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[0]).controls.source).toBe('library');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(prisma.storeAgentMessage.create.mock.calls[0][0].data.content).toContain(DESIGNED.note);
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'COMPLETED' })]));
  });

  it('starts the controls call beside the review call, not after it', async () => {
    let controlsStarted!: () => void;
    const started = new Promise<void>(resolve => { controlsStarted = resolve; });
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => {
      if (schemaOf(init) === 'storefront_self_review') {
        await Promise.race([started, new Promise((_ok, fail) => setTimeout(() => fail(new Error('the controls call did not start beside the review')), 5000))]);
        return answer(REVIEW);
      }
      if (schemaOf(init) === 'storefront_controls') { controlsStarted(); return answer(DESIGNED); }
      return answer({ label: 'Café', files: files(), products: [] });
    }) as any);
    await run();
    await service.reviewSettled('s1');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
  });

  it('an unusable answer keeps the library language; with nothing else changed there is no N+1 and the call is not billed', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, async () => answer('esto no es JSON')) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
  });

  it("a failing guard keeps revision N's language while the review's edits still save", async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 390, slot: 'cart', check: 'contrast', detail: 'word 1.10:1, needs 4.5:1' }]);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(configOf(projects.save.mock.calls[0]).controls);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
  });

  it('a controls call past its own deadline is dropped (reason deadline) and N+1 still saves the review edits', async () => {
    jest.spyOn(controlsDesignModule, 'controlsDeadlineMs').mockReturnValue(50);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, init => new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(init.signal.reason)))) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls.source).toBe('library');
    expect(warn.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_dropped"') && line.includes('"reason":"deadline"'))).toBe(true);
  });

  it("a review stage without time for the guard drops only YAPI's controls; the review's edits still save (review CD fix 5)", async () => {
    jest.spyOn(controlsDesignModule, 'reviewControlsGuardBudgetMs').mockReturnValue(0);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(configOf(projects.save.mock.calls[0]).controls);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(guardControlsOnSnapshot).toHaveBeenCalledTimes(1);
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
  });

  it("a guard that runs past the review's time drops only YAPI's controls; the review's edits still save (review CD fix 5)", async () => {
    jest.spyOn(controlsDesignModule, 'reviewControlsGuardBudgetMs').mockReturnValue(50);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const begun = Date.now();
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([]).mockImplementationOnce((_snapshot: unknown, options: { signal: AbortSignal }) => new Promise((_ok, fail) => options.signal.addEventListener('abort', () => fail(options.signal.reason))));
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(configOf(projects.save.mock.calls[0]).controls);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
    // Stopped by the stage's own budget, not by the guard's 30 s.
    expect(warn.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_dropped"') && line.includes('"source":"yapi"') && line.includes('"reason":"deadline"'))).toBe(true);
    expect(Date.now() - begun).toBeLessThan(20_000);
  });

  it("a redesign tells YAPI to move away from the store's previous controls", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    projects.version.mockResolvedValue({ revision: 2, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[1][2], revision: 2 }) });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, async () => answer(DESIGNED)) as any);
    await service.generate('m1', 's1', { ...dto, revision: 2, instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(25), []);
    await service.reviewSettled('s1');
    const last = fetchMock.mock.calls.map(call => call[1] as any).filter(init => schemaOf(init) === 'storefront_controls').at(-1);
    const prompt = JSON.parse(last.body).input[0].content[0].text;
    expect(prompt).toContain("move away from the store's previous controls");
    expect(prompt).toContain('"outline":"stamp"');
  });
});

describe('store controls: a chat request about the controls (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const DESIGNED = {
    shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
    layout: { cart: 'icon+word', account: 'icon' },
    icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: '', minus: '', close: '' },
    words: { cart: 'Tu taza', account: '' }, badge: 'stamp', note: 'Puse una taza en el carrito.',
  };
  const SAVED = { version: 1, shape: DESIGNED.shape, layout: DESIGNED.layout, icons: { cart: CART_ICONS.cup.solid }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' };
  const EDIT = { label: 'Carrito', edits: [{ path: 'styles.css', search: '#222', replacement: '#333' }], files: [] };
  const NO_CHANGE = { label: 'Carrito', edits: [], files: [] };
  const schemaOf = (init: any) => JSON.parse(init.body).text.format.name;
  const storeWithControls = async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    config.set('app.yapiControlsDesign', true);
    config.set('app.yapiKitTouch', true);
  };
  const request = (instruction: string) => service.generate('m1', 's1', { ...dto, revision: 1, instruction: `Resumen de YAPI.\nPedido actual del comercio: ${instruction}` }, new SourceRequestBudget(500), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("runs the controls call with the merchant's words and saves the result with the edit, billed, and no kit touch", async () => {
    await storeWithControls();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : EDIT)) as any);
    const result: any = await request('haz el carrito como una taza');
    const calls = fetchMock.mock.calls.map(call => call[1] as any).filter(init => schemaOf(init) === 'storefront_controls');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).input[0].content[0].text).toContain('«haz el carrito como una taza»');
    expect(fetchMock.mock.calls.some(call => schemaOf(call[1]) === 'storefront_kit_touch')).toBe(false);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
    expect(result.generation.attempts.find((attempt: any) => attempt.phase === 'controls')).toMatchObject({ status: 'COMPLETED' });
    expect(result.generation.controlsNote).toBe(DESIGNED.note);
  });

  it('a request only about the controls may leave the authored files unchanged', async () => {
    await storeWithControls();
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : NO_CHANGE)) as any);
    await request('botones más redondos');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
  });

  it("a result the guard drops keeps the store's language and still saves the edit, unbilled", async () => {
    await storeWithControls();
    const before = configOf(projects.save.mock.calls[0]).controls;
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 1440, slot: 'cart', check: 'covered', detail: 'covered by div.promo' }]);
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : EDIT)) as any);
    const result: any = await request('haz el carrito como una taza');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(before);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('#333');
    expect(result.generation.attempts.find((attempt: any) => attempt.phase === 'controls')).toMatchObject({ status: 'FAILED' });
    expect(result.generation.controlsNote).toBe(CONTROLS_REQUEST_DROPPED_NOTE);
  });

  it('a run without time left for the call and its guard skips it and still saves the edit (review CD fix 2)', async () => {
    await storeWithControls();
    const budget = jest.spyOn(controlsDesignModule, 'controlsRequestBudgetMs').mockReturnValue(0);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : EDIT)) as any);
    const result: any = await request('haz el carrito como una taza');
    expect(result.generation.controlsNote).toBe(CONTROLS_REQUEST_DROPPED_NOTE);
    expect(budget).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(call => schemaOf(call[1]) === 'storefront_controls')).toBe(false);
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('#333');
  });

  it('a request that is not about the controls makes no controls call', async () => {
    await storeWithControls();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((async () => answer(EDIT)) as any);
    const result: any = await request('cambia el color del texto');
    expect(fetchMock.mock.calls.some(call => schemaOf(call[1]) === 'storefront_controls')).toBe(false);
    expect(result.generation.controlsNote).toBeUndefined();
  });
});
