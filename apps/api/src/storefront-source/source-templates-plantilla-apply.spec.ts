import { BadRequestException } from '@nestjs/common';
import { readPlantillaCopy, refillPlantillaFiles, TEMPLATE_STORE_DATA_PATH } from './source-templates';
import { SourceTemplatesService } from './source-templates.service';

// These compile real converted Plantillas with esbuild.
jest.setTimeout(60_000);

const real = jest.requireActual('@pagosya/store-templates');
const tostado = real.templateManifest('tostado');
const publicStore = {
  storeName: 'La Parrilla de Don Kike', tagline: 'Carnes a la brasa', checkoutMode: 'catalog', creditsEnabled: false, digitalGoodsEnabled: false, shippingEnabled: false,
  shippingPickupEnabled: false, shippingCarriersEnabled: false, bundlesEnabled: false, logoUrl: null, contactPhone: null, leadCaptureUrl: null,
  contactFormEnabled: false, contactTitle: null, contactSubtitle: null, categories: [], locations: [{ city: 'Santa Cruz' }], cartRecommendationsEnabled: false,
  cartRecommendationProductIds: [], bundles: [],
  items: [{ id: 'p1', name: 'Picaña', amount: 9500, currency: 'BOB', stock: 5, imageUrls: ['/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg'], variants: [], extras: [] }],
} as any;

function service(revision = 0) {
  const projects = { current: jest.fn(async () => ({ slug: 'kike', revision, updatedAt: null })), version: jest.fn(async () => ({ snapshot: { brief: undefined, files: [] } })), save: jest.fn(async (_m: string, _s: string, input: any) => ({ revision: input.revision + 1, label: input.label })) };
  const publicStores = { getStorePublic: jest.fn(async () => publicStore) };
  const prisma = { store: { update: jest.fn(async () => ({})) } };
  const config = { get: (key: string) => ({ 'app.checkoutOrigin': 'https://pagar.pagosya.test', 'app.environment': 'development', 'app.port': 3001 } as any)[key] };
  const templates = new SourceTemplatesService(prisma as any, publicStores as any, projects as any, config as any);
  templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
  const saved = () => (projects.save.mock.calls[0] as any[])[2] as { label: string; brief: { templateId?: string }; files: Array<{ path: string; content: string }> };
  return { templates, projects, prisma, saved };
}

// Spec 2026-10-20 Plantillas fill §4–§5: a picked Plantilla is filled for the merchant in one call and saved.
describe('applyPlantillaFilled', () => {
  it('saves the filled words, keeps the template as the store\'s base and bundles none of its demo photos', async () => {
    const { templates, saved, prisma } = service(0);
    const filler = jest.fn(async () => ({ home_1: 'Elegimos', home_2: 'Cada corte lo elegimos en el frigorífico.' }));
    const result = await templates.applyPlantillaFilled('m1', 'store-1', 'tostado', 0, filler);
    expect(filler).toHaveBeenCalledWith(expect.objectContaining({ storeName: 'La Parrilla de Don Kike', products: ['Picaña'], slots: tostado.copy }));
    expect(result).toMatchObject({ revision: 1, filled: true });
    const { brief, files } = saved();
    expect(brief.templateId).toBe('tostado');
    const copy = readPlantillaCopy(files as any);
    expect(copy).toMatchObject({ home_1: 'Elegimos', home_2: 'Cada corte lo elegimos en el frigorífico.' });
    expect(Object.keys(copy).sort()).toEqual(tostado.copy.map((slot: { key: string }) => slot.key).sort());
    expect(files.some(file => file.path.startsWith('assets/template-tostado-'))).toBe(false);
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { checkoutMode: 'payment' } });
  });

  it('a failed or empty fill takes the merchant\'s own words: no demo story, question or quote reaches the store', async () => {
    for (const answer of [null, {}]) {
      const { templates, saved } = service(0);
      const result = await templates.applyPlantillaFilled('m1', 'store-1', 'tostado', 0, async () => answer);
      expect(result.filled).toBe(false);
      const copy = readPlantillaCopy(saved().files as any);
      for (const slot of tostado.copy) if (!slot.key.startsWith('shell_') && slot.default.length > 3) expect(copy[slot.key]).not.toBe(slot.default);
      const headline = tostado.copy.find((slot: { role: string }) => slot.role === 'headline');
      if (headline) expect(copy[headline.key]).toBe('La Parrilla de Don Kike'.slice(0, headline.max));
    }
  });

  it('a partial fill: missing keys take the fallback, never the demo words', async () => {
    const { templates, saved } = service(0);
    await templates.applyPlantillaFilled('m1', 'store-1', 'tostado', 0, async () => ({ home_1: 'Elegimos' }));
    const copy = readPlantillaCopy(saved().files as any);
    expect(copy.home_1).toBe('Elegimos');
    expect(copy.home_2).not.toBe(tostado.copy.find((slot: { key: string }) => slot.key === 'home_2').default);
  });

  it('refuses Esencial and an unconverted template; those have their own paths', async () => {
    const { templates } = service(0);
    await expect(templates.applyPlantillaFilled('m1', 'store-1', 'esencial', 0, async () => null)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// Spec §5: a words change on a Plantilla store rewrites only store-data's copy line.
describe('refillPlantillaFiles', () => {
  const files = [
    { path: TEMPLATE_STORE_DATA_PATH, content: '// Written by pagosYa\nexport const store = {"name":"Kike"} as const;\nexport const photos: Record<string, string> = {"hero":"x.jpg"};\nexport const copy: Record<string, string> = {"home_1":"Hola","home_2":"Chau"};\n' },
    { path: 'components/home.tsx', content: 'export default () => <h1>{copy.home_1}</h1>;' },
  ];
  const slots = [{ key: 'home_1', role: 'title', default: '', max: 40 }, { key: 'home_2', role: 'body', default: '', max: 80 }] as const;
  it('merges the change over the current words and leaves every other line and file alone', () => {
    const next = refillPlantillaFiles(files, { home_2: 'Hasta pronto', bogus: 'x' }, slots);
    expect(readPlantillaCopy(next)).toEqual({ home_1: 'Hola', home_2: 'Hasta pronto' });
    expect(next[0].content).toContain('export const photos: Record<string, string> = {"hero":"x.jpg"};');
    expect(next[1]).toBe(files[1]);
  });
  it('a store without a copy line is returned unchanged', () => {
    const plain = [{ path: TEMPLATE_STORE_DATA_PATH, content: 'export const store = {"name":"Kike"} as const;\n' }];
    expect(refillPlantillaFiles(plain, { home_1: 'x' }, slots)).toEqual(plain);
  });
});

// Spec §3: with Plantillas fill on, the gallery offers only the curated, converted templates.
describe('gallery list', () => {
  it('curated only: every listed template is curated and has slots; off lists the whole gallery as before', () => {
    const { templates } = service(0);
    const curated = templates.list(true);
    expect(curated.length).toBeGreaterThanOrEqual(20);
    for (const { id } of curated) expect(real.templateManifest(id)).toMatchObject({ curated: true, copy: expect.any(Array) });
    expect(templates.list().length).toBeGreaterThan(curated.length);
  });
});
