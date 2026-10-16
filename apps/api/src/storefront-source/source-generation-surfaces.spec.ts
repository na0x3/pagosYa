// Spec 2026-10-15 free commerce surfaces: the stage's wiring in generate() (review C1-C3), harness from source-generation-header.spec.ts.
jest.setTimeout(60_000);

import { Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';
import { runCommerceSurfaces, SURFACES_ALL_NOTE } from './commerce-surfaces/surface-stage';
import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile } from './commerce-surfaces/surface-parts';
import { completedCredits } from './source-generation-run';

// Pixel sampling and the header sweep launch Chromium; these tests exercise what the service saves.
jest.mock('./commerce-surfaces/surface-stage', () => ({ ...jest.requireActual('./commerce-surfaces/surface-stage'), runCommerceSurfaces: jest.fn() }));
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
const shell = (main: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><title>Inicio</title></head><body><header data-pagosya-header></header><main>${main}</main><footer><p>Pie</p></footer><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script></body></html>`;
const shopFiles = () => [
  { path: 'index.html', content: shell('<section id="menu" data-nav-label="Menú"><h1>Menú</h1><div data-pagosya-catalog></div></section><section id="historia" data-nav-label="Nuestra historia"><h2>Historia</h2></section><div data-pagosya-cart></div><p data-pagosya-status role="status" aria-live="polite"></p>') },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;
const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));

function setup() {
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = {
    prepare: jest.fn(async value => sourceProjectSnapshot(value)),
    current: jest.fn(async () => ({ revision: 0, slug: 'cafe' })),
    version: jest.fn(),
    save: jest.fn(async (_m: string, _s: string, value: any) => ({ revision: 1, label: value.label, digest: 'd', createdAt: new Date(), restoredFrom: null, createdProducts: [], updatedProducts: [], deletedProducts: [] })),
    recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.yapiCommerceSurfaces': true, 'app.sep5SelfReview': false }));
  const config: any = { get: jest.fn((key: string) => values.get(key)) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects };
}


describe('commerce surfaces in generate()', () => {
  let service: SourceGenerationService, projects: any;
  const CART = '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>';
  beforeEach(() => {
    ({ service, projects } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'Café', files: shopFiles(), products: [] }));
    (runCommerceSurfaces as jest.Mock).mockImplementation(async (deps: any) => {
      const { used } = await deps.call('diseña', []);
      used();
      return { file: composeTemplatesFile([{ part: 'cart', html: CART, css: '' }]), report: [{ part: 'cart', status: 'passed' }], note: SURFACES_ALL_NOTE, retry: [] };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves the kept parts, reports the step and bills the stage like any other call (review C3)', async () => {
    const progress = jest.fn(async () => undefined);
    const result: any = await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], progress);
    const files = projects.save.mock.calls[0][2].files as Array<{ path: string; content: string }>;
    expect(files.find(f => f.path === COMMERCE_TEMPLATES_FILE)?.content).toContain('data-pagosya-cart-template');
    expect(progress.mock.calls.map(call => (call as unknown[])[0])).toContain('commerce');
    const attempts = result.generation.attempts;
    expect(attempts.some((a: any) => a.phase === 'surfaces' && a.status === 'COMPLETED')).toBe(true);
    expect(result.generation.credits).toBe(completedCredits(attempts, result.generation.maxCredits, false));
    expect(result.generation.surfacesNote).toBe(SURFACES_ALL_NOTE);
  });
});
