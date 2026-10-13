// Spec 2026-10-13: a Sep-5 store saved with the platform header on every page (Task 4), and a showcase store (Task 8).
jest.setTimeout(60_000);

import { Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';

// Pixel sampling and the header sweep launch Chromium; these tests exercise what the service saves.
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
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': false }));
  const config: any = { get: jest.fn((key: string) => values.get(key)) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects };
}

describe('the platform header on a Sep-5 store', () => {
  let service: SourceGenerationService, prisma: any, projects: any, fetchMock: jest.SpyInstance, warn: jest.SpyInstance;
  const saved = () => projects.save.mock.calls[0][2].files as Array<{ path: string; content: string }>;
  const file = (path: string) => saved().find(entry => entry.path === path)?.content;
  const authorBody = () => fetchMock.mock.calls.map(call => JSON.parse(call[1].body)).find(body => body.text?.format?.name === 'independent_storefront');
  const warned = (event: string) => warn.mock.calls.some(([message]) => String(message).includes(`"event":"${event}"`));
  beforeEach(() => {
    ({ service, prisma, projects } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'Café', files: shopFiles(), products: [] }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves a shop with the drawn header (menu-button without a draw) on the home, standard and kit commerce pages', async () => {
    const result: any = await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(result.revision).toBe(1);
    expect(file('index.html')).toContain('<header data-pagosya-header data-shape="menu-button" data-purpose="shop"');
    expect(file('index.html')).toContain('<a href="#menu">Menú</a>');
    expect(file('index.html')).toContain('<a href="#historia">Nuestra historia</a>');
    expect(file('index.html')).toContain('data-cart-open');
    expect(file('index.html')).toContain('<span data-store-name>Café</span>');
    expect(file('nosotros.html')).toContain('<a href="index.html#menu">Menú</a>');
    expect(file('product.html')).toContain('<header data-pagosya-header data-shape="menu-button"');
    expect(file('product.html')).toContain('<a href="index.html#menu">Menú</a>');
    expect(file('product.html')).not.toContain('class="commerce-header"');
    expect(warned('source_header_shape_fallback')).toBe(true);
    expect(warned('source_header_slot_missing')).toBe(false);
    expect(prisma.storeSourceGeneration.create).toHaveBeenCalled();
    expect(authorBody()).toBeDefined();
  });

  it('leaves a store whose author wrote its own header alone, and says nothing about it', async () => {
    fetchMock.mockImplementation(async () => answer({ label: 'Café', files: shopFiles().map(entry => entry.path === 'index.html' ? { ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '<header class="propio"><a href="index.html">Café</a></header>') } : entry), products: [] }));
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(file('index.html')).toContain('<header class="propio">');
    expect(file('index.html')).not.toContain('data-pagosya-header');
    expect(warned('source_header_shape_fallback')).toBe(false);
  });
});
