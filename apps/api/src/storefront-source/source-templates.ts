/** Plantillas (spec 2026-09-25-plantillas-design.md): the per-store pieces a template needs at apply time. A template's
 * authored source never contains merchant text; it imports `./store-data`, which this module writes with every value
 * JSON-encoded, so no store name or photo URL is ever pasted into JSX. */
import { readFile } from 'node:fs/promises';
import { templateDemoPhoto, type TemplateManifest } from '@pagosya/store-templates';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectBriefDto, SourceProjectFileDto } from './dto/save-source-project.dto';
import { compileNextPreview, nextContentPages, nextProjectScaffold } from './source-next';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { sourceRuntimeDna } from './source-dna';
import { sourceAssetInventory, withSourceAssets } from './source-asset-library';
import { withSourceFonts } from './source-fonts';
import { withSourceCommerceDesign } from './source-commerce-design';
import { withSourceMotion } from './source-motion';
import { buildSourceVisualSystem, withSourceStyleTokens, SOURCE_VISUAL_SYSTEM_FILE } from './source-visual-system';
import { sourceStoreConfigData, type SourcePublicStore } from './source-store-config';

export const TEMPLATE_STORE_DATA_PATH = 'components/store-data.tsx';

export const templateDemoPath = (manifest: Pick<TemplateManifest, 'id' | 'photos'>, slot: string) => {
  const demo = manifest.photos.find(photo => photo.slot === slot)?.demo;
  return demo ? `assets/template-${manifest.id}-${slot}.${demo.split('.').pop()}` : '';
};

/**
 * Hero and product slots take each product's first photo in catalog order; lifestyle and detail slots take the
 * photos left over (second photos, then any first photo not used yet). A photo is used once. Whatever stays empty
 * keeps the template's demo photo, or '' when the template has none for that slot.
 */
export function fillTemplatePhotos(manifest: Pick<TemplateManifest, 'id' | 'photos'>, items: ReadonlyArray<{ imageUrls?: readonly string[] }>) {
  const used = new Set<string>();
  const firsts = items.map(item => item.imageUrls?.[0]).filter((url): url is string => Boolean(url));
  const rest = items.flatMap(item => item.imageUrls?.slice(1) ?? []);
  const take = (pool: string[]) => { const url = pool.find(candidate => !used.has(candidate)); if (url) used.add(url); return url; };
  const photos: Record<string, string> = {};
  const demoSlots: string[] = [];
  for (const { slot, role } of manifest.photos) {
    const url = role === 'hero' || role === 'product' ? take(firsts) : take([...rest, ...firsts]);
    if (url) { photos[slot] = url; continue; }
    photos[slot] = templateDemoPath(manifest, slot);
    if (photos[slot]) demoSlots.push(slot);
  }
  return { photos, demoSlots };
}

export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string }, photos: Record<string, string>): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`,
  };
}

export function templateDemoAssets(manifest: TemplateManifest, demoSlots: readonly string[]): SourceProjectFileDto[] {
  return demoSlots.flatMap(slot => {
    const photo = templateDemoPhoto(manifest.id, slot);
    return photo ? [{ path: templateDemoPath(manifest, slot), content: photo.bytes.toString('base64'), encoding: 'base64' as const }] : [];
  });
}

const TEMPLATE_KIT_FILES = ['build.mjs', 'server.mjs', 'commerce.js', 'product.html', 'checkout.html', 'productos.html', 'coleccion.html', 'commerce-pages.css'];
const CATEGORY_BUSINESS: Record<TemplateManifest['category'], string> = {
  comida: 'Comida y bebidas', moda: 'Moda', belleza: 'Belleza y cuidado personal', hogar: 'Hogar y decoración', arte: 'Arte y artesanía',
  tecnologia: 'Tecnología', mascotas: 'Mascotas', ninos: 'Niños y juguetes', deporte: 'Deporte y aire libre', servicios: 'Servicios', 'producto-unico': 'Un producto estrella',
};

/**
 * A complete store revision from a template, built with the same pieces a YAPI generation saves
 * (source-generation.service.ts, the `saveInput` block): authored source + platform-written store-data, the Next
 * scaffold, the kit runtime, brand.css, config.js with the store's data and a DNA seeded by the store id, the visual
 * system manifest, and fonts, assets, commerce pages and motion applied by the shared helpers. No AI call.
 */
export async function assembleTemplateRevision(input: {
  manifest: TemplateManifest; source: SourceProjectFileDto[]; storeId: string; slug: string; publicStore: SourcePublicStore;
  apiUrl: URL; checkoutOrigin?: string; firstRevision: boolean; previousBrief?: SourceProjectBriefDto;
}): Promise<{ label: string; brief: SourceProjectBriefDto; files: SourceProjectFileDto[] }> {
  const { manifest } = input;
  const data = sourceStoreConfigData(input.publicStore, input.apiUrl, input.firstRevision);
  const { photos, demoSlots } = fillTemplatePhotos(manifest, data.items);
  const storeData = templateStoreDataFile({ name: data.storeName, tagline: data.tagline ?? '', city: (data.locations as Array<{ city?: string | null }> | undefined)?.[0]?.city ?? '' }, photos);
  const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH), storeData];
  const compiled = await compileNextPreview(authored, 'shop');
  const scaffold = [...compiled, ...nextProjectScaffold(input.slug, nextContentPages(authored, 'shop'))];
  const kitFiles = await Promise.all(TEMPLATE_KIT_FILES.filter(path => !scaffold.some(file => file.path === path))
    .map(async path => ({ path, content: await readFile(kitPath(path), 'utf8') })));
  const demoAssets = templateDemoAssets(manifest, demoSlots);
  const config = {
    ...sourceCommerceRoutes([...authored, ...scaffold, ...kitFiles], {}), dna: sourceRuntimeDna(undefined, input.storeId),
    productPage: 'product.html', checkoutPage: 'checkout.html', sitePurpose: 'shop', demo: false, slug: input.slug,
    apiBaseUrl: input.apiUrl.href.replace(/\/$/, ''), checkoutOrigin: input.checkoutOrigin, data,
  };
  const visualSystem = buildSourceVisualSystem('auto', sourceAssetInventory(demoAssets));
  const files = await withSourceMotion(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
    ...authored, ...scaffold, ...kitFiles, ...demoAssets,
    { path: 'brand.css', content: '/* No confirmed brand tokens. */' },
    { path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify(withSourceStyleTokens(visualSystem, authored), null, 2) + '\n' },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
  ]))), 'auto');
  const brief = input.previousBrief ?? {
    sitePurpose: 'shop' as const, businessType: CATEGORY_BUSINESS[manifest.category], audience: `Clientes de ${data.storeName}`.slice(0, 500),
    primaryAction: 'Comprar en línea', visualDirection: `Plantilla ${manifest.name}: ${manifest.description}`.slice(0, 2000),
  };
  return { label: `Plantilla: ${manifest.name}`.slice(0, 120), brief, files };
}

/** The demo store Plantillas are checked and previewed with: four products (so every photo slot shows the template's
 * demo photo), BOB prices, no branches (a branch without a delivery method would stop the simulated checkout). */
export function templateDemoPublicStore(): SourcePublicStore {
  const product = (id: string, name: string, amount: number, description: string) => ({ id, name, amount, currency: 'BOB', stock: 12, description, imageUrls: [], variants: [], extras: [], highlights: [] });
  return ({
    storeName: 'Tu marca', tagline: 'Hecho con cuidado en Bolivia', checkoutMode: 'payment', creditsEnabled: false, digitalGoodsEnabled: false,
    shippingEnabled: false, shippingPickupEnabled: false, shippingCarriersEnabled: false, bundlesEnabled: false, logoUrl: null, contactPhone: null,
    leadCaptureUrl: null, contactFormEnabled: false, contactTitle: null, contactSubtitle: null, categories: [],
    locations: [],
    cartRecommendationsEnabled: false, cartRecommendationProductIds: [], bundles: [],
    items: [
      product('demo-1', 'Producto estrella', 12900, 'Nuestro favorito: hecho en pequeñas tandas.'),
      product('demo-2', 'Edición de temporada', 8900, 'Disponible solo por unas semanas.'),
      product('demo-3', 'El clásico', 5900, 'El que siempre vuelve a pedirse.'),
      product('demo-4', 'Set para regalar', 19900, 'Una selección lista para sorprender.'),
    ],
  }) as unknown as SourcePublicStore;
}

/** A template applied to the demo store, with the demo catalog's cards showing the template's product demo photos. */
export async function templateDemoRevision(manifest: TemplateManifest, source: SourceProjectFileDto[]) {
  const assembled = await assembleTemplateRevision({ manifest, source, storeId: `template-${manifest.id}`, slug: manifest.id, publicStore: templateDemoPublicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), checkoutOrigin: 'https://pagar.pagosya.test', firstRevision: true });
  const productPhotos = manifest.photos.filter(photo => photo.role === 'product' && photo.demo).map(photo => templateDemoPath(manifest, photo.slot));
  const files = assembled.files.map(file => {
    if (file.path !== 'config.js' || !productPhotos.length) return file;
    const config = JSON.parse(file.content.match(/^window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    config.data.items = config.data.items.map((item: { imageUrls: string[] }, index: number) => ({ ...item, imageUrls: [productPhotos[index % productPhotos.length]] }));
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` };
  });
  return { ...assembled, files };
}
