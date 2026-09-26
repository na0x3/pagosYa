import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TemplateManifest } from '@pagosya/store-templates';
import { nextStoreFiles } from './fixtures/next-store';
import { assembleTemplateRevision } from './source-templates';
import { SourceTemplatesService } from './source-templates.service';
import { SourceProjectsService } from './source-projects.service';
import { assertSourceCommerceContract } from './source-commerce-contract';

// These compile real React stores with esbuild; next to the browser contract suite that takes longer than 5 s.
jest.setTimeout(60_000);

const manifest: TemplateManifest = {
  id: 'prueba', name: 'Prueba', category: 'comida', description: 'Una tienda de prueba.', tags: [], sitePurpose: 'shop', order: 1,
  photos: [{ slot: 'hero', role: 'hero' }],
};
const publicStore = (items: any[] = []) => ({
  storeName: 'Tostado', tagline: 'Café de altura', checkoutMode: 'catalog', creditsEnabled: false, digitalGoodsEnabled: false, shippingEnabled: false,
  shippingPickupEnabled: false, shippingCarriersEnabled: false, bundlesEnabled: false, logoUrl: null, contactPhone: null, leadCaptureUrl: null,
  contactFormEnabled: false, contactTitle: null, contactSubtitle: null, categories: [], locations: [{ city: 'La Paz' }], cartRecommendationsEnabled: false,
  cartRecommendationProductIds: [], bundles: [], items,
}) as any;
const item = { id: 'p1', name: 'Café Yungas', amount: 6500, currency: 'BOB', stock: 5, imageUrls: ['/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg'], variants: [], extras: [] };
const source = () => nextStoreFiles().map(file => file.path === 'components/home.tsx'
  ? { ...file, content: "import { store, photos } from './store-data';\n" + file.content.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, '<h1$1>{store.name}</h1><img src={photos.hero} alt="" aria-hidden="true" />') }
  : file);

describe('assembleTemplateRevision', () => {
  it('builds a complete store revision that passes the commerce contract', async () => {
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 'store-1', slug: 'tostado', publicStore: publicStore([item]), apiUrl: new URL('https://api.pagosya.test/v1'), checkoutOrigin: 'https://pagar.pagosya.test', firstRevision: true });
    expect(assembled.label).toBe('Plantilla: Prueba');
    const paths = assembled.files.map(f => f.path);
    expect(paths).toEqual(expect.arrayContaining(['components/store-data.tsx', 'config.js', 'commerce.js', 'index.html', 'product.html', 'checkout.html', 'storefront-framework.json']));
    const config = JSON.parse(assembled.files.find(f => f.path === 'config.js')!.content.match(/window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    expect(config).toMatchObject({ slug: 'tostado', sitePurpose: 'shop', productPage: 'product.html', checkoutPage: 'checkout.html', apiBaseUrl: 'https://api.pagosya.test/v1', data: { storeName: 'Tostado', checkoutMode: 'payment' } });
    expect(config.dna).toBeTruthy();
    expect(config.data.items[0].imageUrls[0]).toBe('https://api.pagosya.test/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg');
    expect(assembled.files.find(f => f.path === 'components/store-data.tsx')!.content).toContain('"hero":"https://api.pagosya.test/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg"');
    const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
    expect(snapshot.files.some(f => f.path === '_compiled/home.js')).toBe(true);
  });

  it('pins the kit surfaces a template declares, over the store-seeded DNA', async () => {
    const pinned = { ...manifest, dna: { button: 'block', radius: 'none' } } as TemplateManifest;
    const assembled = await assembleTemplateRevision({ manifest: pinned, source: source(), storeId: 'store-1', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false });
    const config = JSON.parse(assembled.files.find(f => f.path === 'config.js')!.content.match(/window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    expect(config.dna).toMatchObject({ button: 'block', radius: 'none' });
  });

  it('refuses a template DNA value the kit does not know', async () => {
    const broken = { ...manifest, dna: { button: 'wobbly' } } as TemplateManifest;
    await expect(assembleTemplateRevision({ manifest: broken, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false })).rejects.toThrow(/prueba.*button.*wobbly/);
  });

  it('keeps the store\'s own brief when it has one', async () => {
    const brief = { sitePurpose: 'shop' as const, businessType: 'Cafetería', audience: 'Oficinistas', primaryAction: 'Pedir', visualDirection: 'Cálida' };
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false, previousBrief: brief });
    expect(assembled.brief).toEqual(brief);
  });

  it('ignores a store-data file shipped inside a template', async () => {
    const assembled = await assembleTemplateRevision({ manifest, source: [...source(), { path: 'components/store-data.tsx', content: 'export const store = { name: "hack" };' }], storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false });
    const data = assembled.files.filter(f => f.path === 'components/store-data.tsx');
    expect(data).toHaveLength(1);
    expect(data[0].content).toContain('"name":"Tostado"');
  });
});

describe('SourceTemplatesService', () => {
  function service(revision = 0) {
    const projects = { current: jest.fn(async () => ({ slug: 'tostado', revision, updatedAt: null })), version: jest.fn(async () => ({ snapshot: { brief: undefined, files: [] } })), save: jest.fn(async (_m: string, _s: string, input: any) => ({ revision: input.revision + 1, label: input.label })) };
    const publicStores = { getStorePublic: jest.fn(async () => publicStore([item])) };
    const prisma = { store: { update: jest.fn(async () => ({})) } };
    const config = { get: (key: string) => ({ 'app.checkoutOrigin': 'https://pagar.pagosya.test', 'app.environment': 'development', 'app.port': 3001 } as any)[key] };
    const templates = new SourceTemplatesService(prisma as any, publicStores as any, projects as any, config as any);
    templates.registry = { ...templates.registry, templateManifest: (id: string) => (id === 'prueba' ? manifest : undefined), templateSourceFiles: (id: string) => (id === 'prueba' ? source() : []) };
    return { templates, projects, prisma };
  }

  it('saves the template as the next revision and switches a first site to payment checkout', async () => {
    const { templates, projects, prisma } = service(0);
    const saved = await templates.apply('m1', 'store-1', 'prueba', 0);
    expect(saved).toMatchObject({ revision: 1, label: 'Plantilla: Prueba' });
    expect(projects.save).toHaveBeenCalledWith('m1', 'store-1', expect.objectContaining({ revision: 0, label: 'Plantilla: Prueba' }));
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { checkoutMode: 'payment' } });
  });

  it('refuses a stale revision without saving', async () => {
    const { templates, projects } = service(4);
    await expect(templates.apply('m1', 'store-1', 'prueba', 3)).rejects.toBeInstanceOf(ConflictException);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown or path-like template id', async () => {
    const { templates, projects } = service(0);
    await expect(templates.apply('m1', 'store-1', '../prueba', 0)).rejects.toBeInstanceOf(NotFoundException);
    await expect(templates.apply('m1', 'store-1', 'nada', 0)).rejects.toBeInstanceOf(NotFoundException);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('does not touch checkout mode when the store already has a site', async () => {
    const { templates, prisma } = service(2);
    await templates.apply('m1', 'store-1', 'prueba', 2);
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('lists templates without file details', () => {
    const { templates } = service(0);
    templates.registry = { ...templates.registry, listTemplates: () => [manifest] };
    expect(templates.list()).toEqual([{ id: 'prueba', name: 'Prueba', category: 'comida', description: 'Una tienda de prueba.', tags: [], order: 1 }]);
  });
});
