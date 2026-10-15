// Store voice (spec docs/superpowers/specs/2026-10-14-store-voice-design.md) in real generate() runs: photo descriptions, the voice
// sheet beside the style cards, voice.json, the writing rules, the copy check, the kit's voice line and tone requests.
jest.setTimeout(60_000);

import { createHash } from 'node:crypto';
import { ConflictException, Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';
import { voiceFile, type StoreVoice } from './store-voice';
import * as styleHero from './design-engine/style-hero';
import { validateStyleDesign } from './source-style-design';

// Measuring, sampling, the review's shots, the header check and the controls guard launch Chromium; these tests exercise what
// the service does with their results.
jest.mock('./store-look-measure', () => ({ ...jest.requireActual('./store-look-measure'), measureStoreLook: jest.fn().mockResolvedValue(null) }));
jest.mock('./product-theme-check', () => ({ ...jest.requireActual('./product-theme-check'), checkProductThemeOnSnapshot: jest.fn().mockResolvedValue([]) }));
jest.mock('./kit-surface-check', () => ({ checkKitSurfacesOnSnapshot: jest.fn().mockResolvedValue({ catalog: [], card: [], cart: [] }) }));
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('./design-engine/sep5-review-capture', () => ({ ...jest.requireActual('./design-engine/sep5-review-capture'), captureSep5Draft: jest.fn().mockResolvedValue({ shots: [{ width: 1280, y: 0, image: 'data:image/png;base64,AAAA' }], facts: [] }) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));
jest.mock('./store-controls-guard', () => ({ ...jest.requireActual('./store-controls-guard'), guardControlsOnSnapshot: jest.fn().mockResolvedValue([]), captureControlsShots: jest.fn().mockResolvedValue([]) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
const SCRIPTS = '<script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>';
/** The author's project: a home with the platform header slot, the commerce mounts and `body` in its menu section. */
const filesWith = (body = '<h1>Menú</h1>') => [
  { path: 'index.html', content: `<!doctype html><html lang="es"><body><header data-pagosya-header></header><main><section id="menu">${body}<div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p>${SCRIPTS}</body></html>` },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Un lugar calmo para leer, trabajar y conversar sin apuro.', businessInformation: 'Café Remanso es una cafetería de barrio tranquila en La Paz, enfocada en café de especialidad.' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;
const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));
const schemaOf = (init: any): string => JSON.parse(init.body).text.format.name;
const promptOf = (init: any): string => JSON.parse(init.body).input[0].content[0].text;
/** Every text part of a request (the single-call edit sends its stable prompt and its task as two parts). */
const textOf = (init: any): string => JSON.parse(init.body).input[0].content.map((part: any) => part.text ?? '').join('\n');
/** Answers by response-schema name; anything else is the author's project. */
const respond = (answers: Record<string, (init: any) => unknown> = {}) => async (_url: unknown, init: any) => {
  const reply = answers[schemaOf(init)];
  return answer(reply ? await reply(init) : { label: 'Café', files: filesWith(), products: [] });
};
const ONBOARDING = { version: 1, step: 8, done: [], skipped: [], what: 'Cafetería de barrio tranquila: café de especialidad y pastelería casera.', story: 'Un lugar calmo para leer, trabajar y conversar sin apuro. Luz suave, mesas de madera y café bien hecho.', answers: [{ question: '¿Qué pide todo el mundo?', answer: 'El flat white con alfajor de maicena.' }] };
/** A saved sheet: a1 on the page, a2 on no page, a3 confirmed by the merchant. */
const SHEET: StoreVoice = {
  version: 1, voice: 'Hablamos de tú, despacio y con nombres propios; nunca prometemos lo que no servimos.',
  specifics: [{ id: 's1', text: 'El flat white con alfajor de maicena es lo que todos piden', source: 'merchant' }],
  texture: ['El vapor de la leche empaña la ventana a media mañana'],
  assumed: [{ id: 'a1', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }, { id: 'a2', text: 'abiertos desde 2019', kind: 'history', status: 'assumed' }, { id: 'a3', text: 'hornean cada mañana', kind: 'process', status: 'confirmed' }],
  words: { products: 'la carta', customers: 'vecinos', order: 'Tu pedido' }, avoid: ['pausa perfecta'],
};
// The home needs its h1, or the save's preflight refuses the draft («missing a primary h1»).
const SPAN = '<h1>Menú</h1><p>Café <span data-assumed="a1">tostado en Caranavi</span> para la media mañana.</p>';
const EDIT = { label: 'Texto', edits: [{ path: 'styles.css', search: 'color: #222', replacement: 'color: #333' }], files: [] };
const authorWith = (body: string) => () => ({ label: 'Café', files: filesWith(body), products: [] });

function setup() {
  const revision = { current: 0 };
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue({ id: 'review-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe', onboarding: ONBOARDING }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    mediaAssetDescription: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    storeAgentThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([{ content: 'Crea la tienda de mi cafetería' }]) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café Remanso', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
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
    recentStyleCards: jest.fn().mockResolvedValue([]), recentControls: jest.fn().mockResolvedValue([]), recentVoices: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': false, 'app.yapiVoice': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn().mockResolvedValue(null), contentTypeFor: jest.fn().mockReturnValue('image/jpeg') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, stores, projects, config, uploads, revision };
}

let service: SourceGenerationService, prisma: any, stores: any, projects: any, config: any, uploads: any;
let fetchMock: jest.SpyInstance;
const calls = (schema: string): any[] => fetchMock.mock.calls.map(call => call[1]).filter(init => schemaOf(init) === schema);
const savedFile = (index: number, path: string): string | undefined => projects.save.mock.calls[index]?.[2].files.find((file: any) => file.path === path)?.content;
const savedVoice = (index = 0) => { const content = savedFile(index, 'voice.json'); return content === undefined ? undefined : JSON.parse(content); };
const configOf = (index = 0) => JSON.parse(savedFile(index, 'config.js')!.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
const logLines = () => (Logger.prototype.log as unknown as jest.Mock).mock.calls.map(call => String(call[0]));
const warnLines = () => (Logger.prototype.warn as unknown as jest.Mock).mock.calls.map(call => String(call[0]));
const build = (over: Record<string, unknown> = {}, execution?: any) => service.generate('m1', 's1', { ...dto, ...over }, new SourceRequestBudget(500), [], undefined, execution);
/** The store as save `index` left it, plus `extra` files, so the next request edits (or redesigns) it. */
const asPrevious = (index: number, extra: Array<{ path: string; content: string }> = []) => {
  const saved = projects.save.mock.calls[index][2];
  const files = [...saved.files.filter((file: any) => !extra.some(added => added.path === file.path)), ...extra];
  projects.version.mockResolvedValue({ revision: index + 1, snapshot: sourceProjectSnapshot({ ...saved, files, revision: index + 1 }) });
};

beforeEach(() => {
  ({ service, prisma, stores, projects, config, uploads } = setup());
  jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
  jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respond() as any);
});
afterEach(() => jest.restoreAllMocks());

describe('photo descriptions in a build (spec 2026-10-14, part 1)', () => {
  const PHOTO = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
  const bytes = Buffer.from('una foto del café');
  const digest = createHash('sha256').update(bytes).digest('hex');
  beforeEach(() => {
    prisma.mediaAsset.findMany.mockImplementation(async ({ where }: any) => ((where?.url?.in ?? []).includes(PHOTO) ? [{ url: PHOTO, kind: 'ORIGINAL', parentAsset: null }] : []));
    uploads.getBuffer.mockResolvedValue(bytes);
  });

  it('describes a new photo once in the design stage, saves it by digest, and the author reads it in Bundled images', async () => {
    fetchMock.mockImplementation(respond({ photo_description: () => ({ description: 'latte con arte de hoja en taza azul' }) }) as any);
    const result: any = await build({ assetUrls: [PHOTO] });
    expect(calls('photo_description')).toHaveLength(1);
    expect(prisma.mediaAssetDescription.upsert).toHaveBeenCalledWith({ where: { merchantId_digest: { merchantId: 'm1', digest } }, create: { merchantId: 'm1', digest, description: 'latte con arte de hoja en taza azul' }, update: {} });
    expect(promptOf(calls('independent_storefront')[0])).toContain('"description":"latte con arte de hoja en taza azul"');
    expect(result.generation.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'photo', status: 'COMPLETED' })]));
  });

  it('reads a cached description without a call', async () => {
    prisma.mediaAssetDescription.findMany.mockResolvedValue([{ digest, description: 'pan de masa madre en tabla' }]);
    await build({ assetUrls: [PHOTO] });
    expect(calls('photo_description')).toHaveLength(0);
    expect(promptOf(calls('independent_storefront')[0])).toContain('"description":"pan de masa madre en tabla"');
  });

  it('a failed description leaves the bare path and the build goes on', async () => {
    fetchMock.mockImplementation(respond({ photo_description: () => 'esto no es JSON' }) as any);
    const result: any = await build({ assetUrls: [PHOTO] });
    expect(result.revision).toBe(1);
    expect(promptOf(calls('independent_storefront')[0])).toMatch(/"path":"assets\/image-[a-f0-9]{12}\.jpg"\}/);
    expect(prisma.mediaAssetDescription.upsert).not.toHaveBeenCalled();
  });

  it('with YAPI_VOICE off, no photo is described or looked up', async () => {
    config.set('app.yapiVoice', false);
    await build({ assetUrls: [PHOTO] });
    expect(calls('photo_description')).toHaveLength(0);
    expect(prisma.mediaAssetDescription.findMany).not.toHaveBeenCalled();
  });
});

describe('voice.json in every save (spec 2026-10-14, part 2)', () => {
  it('an edit carries the store’s sheet: pending facts no page uses are dropped, confirmed ones become the merchant’s', async () => {
    fetchMock.mockImplementation(respond({ independent_storefront: authorWith(SPAN) }) as any);
    await build();
    asPrevious(0, [voiceFile(SHEET)]);
    fetchMock.mockImplementation(respond({ independent_storefront: () => EDIT }) as any);
    await build({ revision: 1, instruction: 'Oscurece un poco el texto' });
    const voice = savedVoice(1);
    expect(voice.assumed).toEqual([{ id: 'a1', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }]);
    expect(voice.specifics).toEqual([...SHEET.specifics, { id: 'a3', text: 'hornean cada mañana', source: 'merchant' }]);
  });

  it('with YAPI_VOICE off a store’s own voice.json travels byte for byte', async () => {
    fetchMock.mockImplementation(respond({ independent_storefront: authorWith(SPAN) }) as any);
    await build();
    const own = voiceFile(SHEET);
    asPrevious(0, [own]);
    config.set('app.yapiVoice', false);
    fetchMock.mockImplementation(respond({ independent_storefront: () => EDIT }) as any);
    await build({ revision: 1, instruction: 'Oscurece un poco el texto' });
    expect(savedFile(1, 'voice.json')).toBe(own.content);
  });

  it('a first build reads the merchant’s material and the sibling voices, and saves no sheet it did not write', async () => {
    await build();
    expect(prisma.storeAgentMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { thread: { storeId: 's1' }, channel: 'source', role: 'USER' } }));
    expect(projects.recentVoices).toHaveBeenCalledWith('s1', expect.any(Date), 12);
    expect(savedVoice(0)).toBeUndefined();
  });
});

/** The sheet call's answer. Code drops the merchant specific with no source in the merchant's words and the percent. */
const SHEET_ANSWER = {
  voice: SHEET.voice,
  specifics: [{ text: 'El flat white con alfajor de maicena es lo que todos piden', source: 'merchant' }, { text: 'Espresso doble a Bs 18', source: 'product' }, { text: 'Un sabio que nadie nombró', source: 'merchant' }],
  texture: SHEET.texture,
  assumed: [{ text: 'tostado en Caranavi', kind: 'origin' }, { text: 'abiertos desde 2019', kind: 'history' }, { text: '20% menos azúcar', kind: 'number' }],
  words: { products: 'la carta', customers: 'vecinos', order: 'Tu pedido', team: '' },
  avoid: ['pausa perfecta'],
};

describe('the voice sheet (spec 2026-10-14, part 2)', () => {
  it('a first build writes the sheet in the design stage and saves it in revision N, with only the assumptions a page uses', async () => {
    fetchMock.mockImplementation(respond({ store_voice: () => SHEET_ANSWER, independent_storefront: authorWith(SPAN) }) as any);
    const result: any = await build();
    expect(calls('store_voice')).toHaveLength(1);
    const prompt = promptOf(calls('store_voice')[0]);
    expect(prompt).toContain('"answers":[{"question":"¿Qué pide todo el mundo?","answer":"El flat white con alfajor de maicena."}]');
    expect(prompt).toContain('Crea la tienda de mi cafetería');
    const voice = savedVoice(0);
    expect(voice.specifics.map((entry: any) => entry.id)).toEqual(['s1', 's2']);
    expect(voice.assumed).toEqual([{ id: 'a1', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }]);
    expect(voice.words.order).toBe('Tu pedido');
    expect(result.generation.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'voice', status: 'COMPLETED' })]));
  });

  it('a redesign keeps the store’s sheet and writes no new one', async () => {
    fetchMock.mockImplementation(respond({ store_voice: () => SHEET_ANSWER, independent_storefront: authorWith(SPAN) }) as any);
    await build();
    asPrevious(0);
    await build({ revision: 1, instruction: 'Rediseña toda la tienda desde cero' });
    expect(calls('store_voice')).toHaveLength(1);
    expect(savedVoice(1).voice).toBe(SHEET_ANSWER.voice);
    expect(savedVoice(1).assumed.map((entry: any) => entry.id)).toEqual(['a1']);
  });

  it('with YAPI_VOICE off a first build makes no sheet call', async () => {
    config.set('app.yapiVoice', false);
    await build();
    expect(calls('store_voice')).toHaveLength(0);
    expect(savedVoice(0)).toBeUndefined();
  });

  it('a failed or unusable sheet call never fails the build', async () => {
    fetchMock.mockImplementation(respond({ store_voice: () => 'esto no es JSON' }) as any);
    const result: any = await build();
    expect(result.revision).toBe(1);
    expect(savedVoice(0)).toBeUndefined();
    expect(warnLines().some(line => line.includes('"event":"voice_sheet_dropped"'))).toBe(true);
  });
});

describe('the voice sheet beside the style cards (spec 2026-10-14, part 2)', () => {
  const cardConcept = (name: string) => ({ ...concept(name), cardName: `${name} de barrio`, vibe: `${name} vibe paragraph.`, inspiration: ['El tostado de cada mañana', 'La esquina de la plaza', 'Tazas de cerámica local'] });
  const laneDesign = (slot: number) => {
    const { design } = validateStyleDesign({ concepts: ['Menu', 'Window'].map(cardConcept), selection: { index: 0, rationale: 'r' } }, ['calm', 'bold'], { narrative: true });
    return { ...design, selected: 0, concepts: design.concepts.filter(item => item.card!.slot === slot) };
  };
  let explore: jest.SpyInstance;
  const finalProposal = () => prisma.storeSourceGeneration.updateMany.mock.calls.map((call: any[]) => call[0]).find((call: any) => call.data.status === 'AWAITING_STYLE')?.data.proposal;
  beforeEach(() => {
    for (const key of ['app.yapiStylePick', 'app.yapiPlaybook', 'app.yapiFrameDraw', 'app.yapiDesignDraw']) config.set(key, true);
    jest.spyOn(styleHero, 'writeStyleHero').mockResolvedValue({ html: '<header data-store-name>Café</header><section><h1>Tarjeta</h1></section>', source: 'model' });
    explore = jest.spyOn(SourceDesignPlanner.prototype, 'explore');
  });

  it('writes the sheet beside the cards, not after them, and keeps it on the proposal', async () => {
    let voiceStarted!: () => void;
    const started = new Promise<void>(resolve => { voiceStarted = resolve; });
    explore.mockImplementation(async (args: any) => {
      if (!args.styleSlots) return threeConceptDesign;
      await Promise.race([started, new Promise((_ok, fail) => setTimeout(() => fail(new Error('the voice call did not start beside the cards')), 5000))]);
      return laneDesign(args.styleSlots[0].slot);
    });
    fetchMock.mockImplementation(respond({ store_voice: () => { voiceStarted(); return SHEET_ANSWER; } }) as any);
    const result = await build({}, { styleProposal: true });
    expect(result).toEqual({ styleProposal: { generationId: expect.any(String), cards: 2 } });
    expect(finalProposal().voice).toMatchObject({ version: 1, voice: SHEET_ANSWER.voice, words: { order: 'Tu pedido' } });
  });

  it('a picked card builds with the proposal’s sheet and writes no new one', async () => {
    explore.mockImplementation(async (args: any) => (args.styleSlots ? laneDesign(args.styleSlots[0].slot) : threeConceptDesign));
    fetchMock.mockImplementation(respond({ store_voice: () => SHEET_ANSWER }) as any);
    await build({}, { styleProposal: true });
    const asked = calls('store_voice').length;
    const proposal = { ...finalProposal(), status: 'PICKED', picked: 0 };
    fetchMock.mockImplementation(respond({ independent_storefront: authorWith('<h1>Menú</h1><p><span data-assumed="a2">abiertos desde 2019</span></p>') }) as any);
    await build({}, { style: { proposal, index: 0 } });
    expect(calls('store_voice')).toHaveLength(asked);
    expect(savedVoice(0)).toMatchObject({ voice: SHEET_ANSWER.voice, assumed: [{ id: 'a2', text: 'abiertos desde 2019', status: 'assumed' }] });
  });
});
