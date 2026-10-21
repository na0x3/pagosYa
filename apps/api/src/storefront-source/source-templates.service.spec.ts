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
    // Spec 2026-10-14 store controls: a template is a fresh design with no control language (and a Next store, out of scope).
    expect(config).not.toHaveProperty('controls');
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

  it('keeps the store\'s own brief when it has one, marked with the template it came from', async () => {
    const brief = { sitePurpose: 'shop' as const, businessType: 'Cafetería', audience: 'Oficinistas', primaryAction: 'Pedir', visualDirection: 'Cálida' };
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false, previousBrief: brief });
    expect(assembled.brief).toEqual({ ...brief, templateId: manifest.id });
  });
  it('marks a first site\'s default brief with the template', async () => {
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true });
    expect(assembled.brief.templateId).toBe(manifest.id);
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

  it('bundles the master hero and story photos into the store, so its pages never load them from the API (live check fix)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const uploads = { getBuffer: jest.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])) };
    (prisma as any).mediaAsset = { findMany: jest.fn(async () => [{ url: '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000002.jpg' }]) };
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config, uploads as any);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    await templates.applyMaster('m1', 'store-1', 0, async () => ({ heroPhoto: '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000002.jpg', storyPhoto: 'https://elsewhere.test/x.jpg' }));
    const files = (projects.save.mock.calls[0] as any[])[2].files as Array<{ path: string; content: string }>;
    const data = files.find(f => f.path === 'components/store-data.tsx')!.content;
    const hero = /"hero":"(assets\/image-[a-f0-9]{12}\.jpg)"/.exec(data)?.[1];
    expect(hero).toBeDefined();
    expect(files.some(f => f.path === hero)).toBe(true);
    expect(data).toContain('"story":""');
  });

  it('a failed fill keeps the merchant\'s own story and a bundled hero, never the placeholder and an API photo (live 2026-10-19)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const uploads = { getBuffer: jest.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])) };
    (prisma as any).mediaAsset = { findMany: jest.fn(async () => [{ url: '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000003.jpg' }]) };
    (prisma as any).store.findUnique = jest.fn(async () => ({ onboarding: { story: 'Horneamos cada madrugada con masa madre.', photos: ['/v1/uploads/aaaaaaaa-0000-0000-0000-000000000003.jpg'] } }));
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config, uploads as any);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    await templates.applyMaster('m1', 'store-1', 0, async () => null);
    const files = (projects.save.mock.calls[0] as any[])[2].files as Array<{ path: string; content: string }>;
    const data = files.find(f => f.path === 'components/store-data.tsx')!.content;
    expect(data).toContain('Horneamos cada madrugada con masa madre.');
    expect(data).not.toContain('Somos un emprendimiento');
    expect(/"hero":"assets\/image-[a-f0-9]{12}\.jpg"/.test(data)).toBe(true);
  });

  it('writes every product\'s own page content after a master build, in the background (variety spec §2b)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const pageWriter = { fillStore: jest.fn(async () => undefined) };
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config, undefined, pageWriter as any);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    await templates.applyMaster('m1', 'store-1', 0, async () => null);
    await new Promise(resolve => setImmediate(resolve));
    expect(pageWriter.fillStore).toHaveBeenCalledWith('store-1');
  });

  it('rolls the store\'s variants and a palette that fits a bold character (variety spec §3)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    await templates.applyMaster('m1', 'store-1', 0, async () => ({ character: { tone: 'bold', temperature: 'warm', lead: 'photo', exclude: [] }, sections: [{ id: 'faq', title: 'Preguntas', items: [{ title: '¿Envían?', text: 'Sí.' }, { title: '¿Pago?', text: 'QR.' }] }] }));
    const data = ((projects.save.mock.calls[0] as any[])[2].files as any[]).find(f => f.path === 'components/store-data.tsx').content as string;
    const variants = JSON.parse(/export const variants[^=]*= (.*);/.exec(data)![1]);
    const look = JSON.parse(/export const look = (.*) as const;/.exec(data)![1]);
    expect(real.templateManifest('esencial').master.variants.hero).toContain(variants.hero);
    expect(variants.sections).toEqual(['faq']);
    expect(['ember', 'cobalt', 'citrus', 'ink', 'wine', 'noir']).toContain(look.palette);
    expect(data).toContain('"title":"Preguntas"');
  });

  it('a fashion store gets the menu the fill picked; the filler hears how many categories have products (dropdown menu 2026-10-21)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    const filler = jest.fn(async () => ({ character: { tone: 'calm' as const, temperature: 'neutral' as const, lead: 'photo' as const, exclude: [], kind: 'fashion' as const }, menu: { style: 'dropdowns' as const, groups: [] } }));
    await templates.applyMaster('m1', 'store-1', 0, filler);
    expect((filler.mock.calls[0] as any[])[0].categoryCount).toBe(0);
    const files = (projects.save.mock.calls[0] as any[])[2].files as any[];
    const variants = JSON.parse(/export const variants[^=]*= (.*);/.exec(files.find(f => f.path === 'components/store-data.tsx').content)![1]);
    expect(variants.menu).toBe('dropdowns');
    expect(files.find(f => f.path === 'config.js').content).toContain('"header":{"menu":{"style":"dropdowns"}}');
  });

  describe('the merchant\'s brand first (variety spec §4)', () => {
    const real = jest.requireActual('@pagosya/store-templates');
    const build = (confirmed: Array<{ field: string; value: string }>, logo?: string) => {
      const { templates: base, projects, prisma } = service(0);
      const publicStores = { getStorePublic: jest.fn(async () => ({ ...publicStore([item]), logoUrl: logo ?? null })) };
      const brands = { get: jest.fn(async () => ({ data: { confirmed: confirmed.map(f => ({ ...f, evidence: '', source: 'merchant' })), suggested: [] } })) };
      const templates = new SourceTemplatesService(prisma as any, publicStores as any, projects as any, (base as any).config, undefined, undefined, brands as any);
      templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
      return { templates, projects };
    };
    const savedLook = (projects: any) => JSON.parse(/export const look = (.*) as const;/.exec(((projects.save.mock.calls[0] as any[])[2].files as any[]).find(f => f.path === 'components/store-data.tsx').content)![1]);

    it('confirmed brand colours become the store\'s colours', async () => {
      const { templates, projects } = build([{ field: 'background', value: '#FAF7F2' }, { field: 'foreground', value: '#1A1A1A' }, { field: 'accent', value: '#2F6B4F' }]);
      await templates.applyMaster('m1', 'store-1', 0, async () => ({}));
      expect(savedLook(projects).colors).toEqual({ paper: '#faf7f2', ink: '#1a1a1a', accent: '#2f6b4f' });
    });

    it('a partial brand palette fills the rest from the roll', async () => {
      const { templates, projects } = build([{ field: 'accent', value: '#2F6B4F' }]);
      await templates.applyMaster('m1', 'store-1', 0, async () => ({}));
      const look = savedLook(projects);
      expect(look.colors).toEqual({ accent: '#2f6b4f' });
      expect(real.templateManifest('esencial').master.palettes.map((p: any) => p.id)).toContain(look.palette);
    });

    it('with no brand colours, the logo\'s colours become the palette', async () => {
      const { templates, projects } = build([], '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000009.png');
      (templates as any).logoPalette = jest.fn(async () => ({ paper: '#ffffff', ink: '#101010', accent: '#c0392b', surface: '#f4f4f4', onAccent: '#ffffff' }));
      await templates.applyMaster('m1', 'store-1', 0, async () => ({}));
      expect(savedLook(projects).colors).toEqual({ paper: '#ffffff', ink: '#101010', accent: '#c0392b', muted: '#f4f4f4' });
    });

    it('hands the brand\'s voice to the filler', async () => {
      const { templates } = build([{ field: 'voice', value: 'Cercana y alegre' }, { field: 'avoid', value: 'Jerga técnica' }]);
      const filler = jest.fn(async () => ({}));
      await templates.applyMaster('m1', 'store-1', 0, filler);
      expect((filler.mock.calls[0] as any[])[0].brand).toMatchObject({ voice: 'Cercana y alegre', avoid: 'Jerga técnica' });
    });
  });

  it('review fix: recent rolls read only store-data, in SQL, not 40 whole snapshots', async () => {
    const { templates, prisma } = service(0) as any;
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ data: 'export const look = {"palette":"ink","fonts":"poster","colors":{}} as const;\nexport const variants: Record<string, string | string[]> = {"hero":"arch","sections":[]};\n' }]);
    prisma.storeSourceVersion = { ...(prisma.storeSourceVersion ?? {}), findMany: jest.fn() };
    expect(await templates.recentMasterRolls('s')).toEqual([{ hero: 'arch', palette: 'ink', fonts: 'poster' }]);
    expect(prisma.storeSourceVersion.findMany).not.toHaveBeenCalled();
  });

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

  it('records which revision the template produced', async () => {
    const { templates, projects } = service(3);
    await templates.apply('m1', 'store-1', 'prueba', 3);
    expect((projects.save.mock.calls[0] as any)[2].brief.templateRevision).toBe(4);
  });

  it('previews a template on the store without saving anything', async () => {
    const { templates, projects } = service(2);
    (projects as any).prepare = jest.fn(async (input: any) => ({ schemaVersion: 1, brief: input.brief, files: input.files }));
    const snapshot: any = await templates.preview('m1', 'store-1', 'prueba');
    expect(projects.save).not.toHaveBeenCalled();
    expect((projects as any).prepare).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, label: 'Plantilla: Prueba' }));
    expect(snapshot.files.some((file: any) => file.path === 'config.js')).toBe(true);
  });

  it('rejects an unknown template in preview', async () => {
    const { templates } = service(0);
    await expect(templates.preview('m1', 'store-1', 'nada')).rejects.toThrow('Esa plantilla no existe.');
  });

  it('lists the gallery templates without file details', () => {
    const { templates } = service(0);
    templates.registry = { ...templates.registry, galleryTemplates: () => [manifest] };
    expect(templates.list()).toEqual([{ id: 'prueba', name: 'Prueba', category: 'comida', description: 'Una tienda de prueba.', tags: [], order: 1 }]);
  });

  it('still previews a template the owner hid from the gallery', async () => {
    const { templates, projects } = service(0);
    (projects as any).prepare = jest.fn(async (input: any) => ({ schemaVersion: 1, brief: input.brief, files: input.files }));
    templates.registry = { ...templates.registry, galleryTemplates: () => [] };
    await expect(templates.preview('m1', 'store-1', 'prueba')).resolves.toBeDefined();
  });

  // Plantillas › Ver shows the template as its designer made it. Dressed in a real store, its demo copy ("DROP 03",
  // a discount code) sat next to the merchant's name and photos and read as a broken store.
  it('builds the as-designed demo once, from nothing of the merchant', async () => {
    const { templates, projects } = service(0);
    (projects as any).prepare = jest.fn(async (input: any) => ({ schemaVersion: 1, brief: input.brief, files: input.files }));
    const publicStores = (templates as any).publicStores;
    const [first, second] = await Promise.all([templates.demo('prueba'), templates.demo('prueba')]);
    expect(first).toBe(second);
    expect((projects as any).prepare).toHaveBeenCalledTimes(1);
    expect(publicStores.getStorePublic).not.toHaveBeenCalled();
    expect(projects.current).not.toHaveBeenCalled();
    const config = first.files.find((file: any) => file.path === 'config.js')!.content;
    expect(config).toContain('Tu marca');
    expect(() => templates.demo('../prueba')).toThrow(NotFoundException);
  });
});
