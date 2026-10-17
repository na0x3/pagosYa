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
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': false, 'app.yapiFrameDraw': true, 'app.yapiDesignDraw': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)) };
  const uploads: any = { getBuffer: jest.fn().mockResolvedValue(Buffer.from('89504e470d0a1a0a', 'hex')), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects };
}


import { samplePhotoColours } from './source-photo-sampler';
import { photoPalettes } from './design-engine/photo-palette';
import { brandColourDrift } from './brand-source-checks';

// Spec 2026-10-16 brand source, end to end: an edit carrying the merchant's own Instagram is built in its colours with one of its phrases.
describe('a brand source edit', () => {
  afterEach(() => jest.restoreAllMocks());
  const brandUrl = '/v1/uploads/11111111-2222-3333-4444-555555555555.png';
  const quote = 'Hecho con amor, horneado con pasión';
  const samples = new Map([[brandUrl, { dominant: ['#8a5a33', '#c9875b', '#efe4d3'] }]]);
  const palette = photoPalettes({ photos: [...samples.values()] })!.calm;
  const showcaseFiles = () => [
    { path: 'index.html', content: shell('<section id="inicio" data-nav-label="Inicio"><h1>BAEK</h1></section><p data-pagosya-status role="status" aria-live="polite"></p>') },
    { path: 'styles.css', content: ':root{--store-background:#ffffff;--store-foreground:#111111;--store-accent:#0f4c4c}' }, { path: 'site.js', content: 'globalThis.__x = 1;' },
  ];
  const showcaseDto = { ...dto, brief: { ...dto.brief, businessType: 'Panadería', sitePurpose: 'service' }, instruction: 'Crea el sitio de mi panadería' };

  it('repairs a build that ignored the brand, then saves its colours, a phrase and the reply line', async () => {
    const { service, prisma, projects } = setup();
    prisma.store.findFirst.mockResolvedValue({ slug: 'baek', onboarding: { version: 1, primaryAction: { kind: 'form' } } });
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'baek', files: showcaseFiles() }));
    await service.generate('m1', 's1', showcaseDto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    const first = projects.save.mock.calls[0][2];
    projects.current.mockResolvedValue({ revision: 1, slug: 'baek' });
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...first, revision: 1, label: 'baek' }) });
    projects.save.mockClear();
    (samplePhotoColours as jest.Mock).mockResolvedValue(samples);
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'brand', url: brandUrl, kind: 'ORIGINAL', role: null, mimeType: 'image/png', parentAsset: null }]);
    let edits = 0;
    fetchMock.mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (body.text?.format?.name === 'brand_source_read') return answer({ quotes: [], voice: 'cálida', layout: 'fotos grandes', typeLook: 'serif' });
      edits += 1;
      const accent = edits === 1 ? '#1d4ed8' : palette.accent;
      const paper = edits === 1 ? '#ffffff' : palette.paper;
      const ink = edits === 1 ? '#111111' : palette.ink;
      return answer({ label: 'Marca', edits: [
        { path: 'styles.css', search: ':root{--store-background:#ffffff;--store-foreground:#111111;--store-accent:#0f4c4c}', replacement: `:root{--store-background:${paper};--store-foreground:${ink};--store-accent:${accent}}` },
        ...(edits > 1 ? [{ path: 'index.html', search: '<h1>BAEK</h1>', replacement: `<h1>BAEK</h1><p>${quote}</p>` }] : []),
      ], files: [] });
    });
    const result: any = await service.generate('m1', 's1', { ...showcaseDto, revision: 1, instruction: 'usa los colores y frases de mi Instagram', assetUrls: [brandUrl] }, new SourceRequestBudget(25), [{ url: brandUrl, role: 'reference', description: 'captura' } as any], jest.fn(async () => undefined), {
      brandSource: { imageUrls: [brandUrl], captureIndexes: [], quotes: [{ text: quote, source: 'website', where: 'meta' }], fontFamilies: [], imported: [], look: true, notes: [] },
    });
    const failures = (result.generation?.attempts ?? result.attempts ?? []).map((a: any) => a.failureReason || '').join(' ');
    expect(failures).toMatch(/Colores de la marca/);
    const saved = projects.save.mock.calls[0][2].files as Array<{ path: string; content: string }>;
    expect(brandColourDrift(saved, palette)).toEqual([]);
    expect(saved.find(f => f.path === 'index.html')!.content).toContain(quote);
    expect(edits).toBeGreaterThanOrEqual(2);
    expect(result.generation?.brandNote ?? result.brandNote ?? JSON.stringify(result)).toContain('Tomé de tu marca');
  });

  it('never fails the request over colours: after one repair it saves and says so', async () => {
    const { service, prisma, projects } = setup();
    prisma.store.findFirst.mockResolvedValue({ slug: 'baek', onboarding: { version: 1, primaryAction: { kind: 'form' } } });
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'baek', files: showcaseFiles() }));
    await service.generate('m1', 's1', showcaseDto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    const first = projects.save.mock.calls[0][2];
    projects.current.mockResolvedValue({ revision: 1, slug: 'baek' });
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...first, revision: 1, label: 'baek' }) });
    projects.save.mockClear();
    (samplePhotoColours as jest.Mock).mockResolvedValue(samples);
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'brand', url: brandUrl, kind: 'ORIGINAL', role: null, mimeType: 'image/png', parentAsset: null }]);
    let edits = 0;
    fetchMock.mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (body.text?.format?.name === 'brand_source_read') return answer({ quotes: [], voice: 'cálida', layout: 'fotos grandes', typeLook: 'serif' });
      edits += 1;
      const accent = '#1d4ed8';
      const paper = edits === 1 ? '#fffffe' : '#ffffff';
      const ink = '#111111';
      return answer({ label: 'Marca', edits: [
        { path: 'styles.css', search: ':root{--store-background:#ffffff;--store-foreground:#111111;--store-accent:#0f4c4c}', replacement: `:root{--store-background:${paper};--store-foreground:${ink};--store-accent:${accent}}` },
        ...(edits > 1 ? [{ path: 'index.html', search: '<h1>BAEK</h1>', replacement: `<h1>BAEK</h1><p>${quote}</p>` }] : []),
      ], files: [] });
    });
    const result: any = await service.generate('m1', 's1', { ...showcaseDto, revision: 1, instruction: 'usa los colores y frases de mi Instagram', assetUrls: [brandUrl] }, new SourceRequestBudget(25), [{ url: brandUrl, role: 'reference', description: 'captura' } as any], jest.fn(async () => undefined), {
      brandSource: { imageUrls: [brandUrl], captureIndexes: [], quotes: [{ text: quote, source: 'website', where: 'meta' }], fontFamilies: [], imported: [], look: true, notes: [] },
    });
    const failures = (result.generation?.attempts ?? result.attempts ?? []).map((a: any) => a.failureReason || '').join(' ');
    expect(failures).toMatch(/Colores de la marca/);
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(result.generation?.brandNote ?? JSON.stringify(result)).toContain('no son exactamente los de tu marca');
  });

  it('a fresh build gives the author the brand block and names only what reached the site', async () => {
    const { service, prisma, projects } = setup();
    prisma.store.findFirst.mockResolvedValue({ slug: 'baek', onboarding: { version: 1, primaryAction: { kind: 'form' } } });
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'brand', url: brandUrl, kind: 'ORIGINAL', role: null, mimeType: 'image/png', parentAsset: null }]);
    (samplePhotoColours as jest.Mock).mockResolvedValue(samples);
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (body.text?.format?.name === 'brand_source_read') return answer({ quotes: [], voice: 'cálida', layout: 'fotos grandes', typeLook: 'serif' });
      return answer({ label: 'baek', files: showcaseFiles() });
    });
    const result: any = await service.generate('m1', 's1', { ...showcaseDto, assetUrls: [brandUrl] }, new SourceRequestBudget(25), [{ url: brandUrl, role: 'reference', description: 'captura' } as any], jest.fn(async () => undefined), {
      brandSource: { imageUrls: [brandUrl], captureIndexes: [], quotes: [{ text: quote, source: 'website', where: 'meta' }], fontFamilies: [], imported: [], look: true, notes: [] },
    });
    const author = fetchMock.mock.calls.map(call => JSON.parse((call[1] as any).body)).find(body => body.text?.format?.name === 'independent_storefront');
    expect(JSON.stringify(author)).toContain(quote);
    expect(result.generation?.brandNote ?? '').not.toContain('la frase');
  });
  // Deferred minor (final review 2026-10-16): on the ChatGPT plan the read marked every phrase not verbatim, so the reply never
  // named the phrase the author (who sees the images too) put on the site.
  it('names a phrase the read was unsure of once the saved site shows exactly that phrase, never handing it to the author', async () => {
    const { service, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue({ slug: 'baek', onboarding: { version: 1, primaryAction: { kind: 'form' } } });
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'brand', url: brandUrl, kind: 'ORIGINAL', role: null, mimeType: 'image/png', parentAsset: null }]);
    (samplePhotoColours as jest.Mock).mockResolvedValue(samples);
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const unsure = 'Flores que cuentan historias';
    const files = () => showcaseFiles().map(file => file.path === 'index.html' ? { ...file, content: file.content.replace('<h1>BAEK</h1>', `<h1>BAEK</h1><p>Flores que <em>cuentan</em> historias</p>`) } : file);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (body.text?.format?.name === 'brand_source_read') return answer({ quotes: [{ text: unsure, verbatim: false, where: 'post' }], voice: 'cálida', layout: 'fotos grandes', typeLook: 'serif' });
      return answer({ label: 'baek', files: files() });
    });
    const result: any = await service.generate('m1', 's1', { ...showcaseDto, assetUrls: [brandUrl] }, new SourceRequestBudget(25), [{ url: brandUrl, role: 'reference', description: 'captura' } as any], jest.fn(async () => undefined), {
      brandSource: { imageUrls: [brandUrl], captureIndexes: [], quotes: [], fontFamilies: [], imported: [], look: true, notes: [] },
    });
    const bodies = fetchMock.mock.calls.map(call => JSON.parse((call[1] as any).body));
    const read = bodies.find(body => body.text?.format?.name === 'brand_source_read');
    expect(JSON.stringify(read)).toContain('"detail":"high"');
    const author = bodies.find(body => body.text?.format?.name === 'independent_storefront');
    expect(JSON.stringify(author)).not.toContain(unsure);
    // The read reached the author: its voice line is in the BRAND SOURCE block.
    expect(JSON.stringify(author)).toContain('Their voice: cálida');
    expect(result.generation?.brandNote ?? '').toContain(`la frase «${unsure}»`);
  });
});
