import { uploadPath } from './source-product-photos';
/** Plantillas (spec 2026-09-25-plantillas-design.md): the per-store pieces a template needs at apply time. A template's
 * authored source never contains merchant text; it imports `./store-data`, which this module writes with every value
 * JSON-encoded, so no store name or photo URL is ever pasted into JSX. */
import type { MasterCopy } from '@pagosya/store-templates';
import { masterCopy, masterDnaFonts, masterDnaLook, masterLook, masterPhotoUrl, masterThemeCss, withMasterTheme, type MasterFill, type MasterLook, type MasterSection, type MasterVariants } from './source-master';
import { readFile } from 'node:fs/promises';
import { templateDemoPhoto, type TemplateManifest } from '@pagosya/store-templates';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectBriefDto, SourceProjectFileDto } from './dto/save-source-project.dto';
import { compileNextPreview, nextContentPages, nextProjectScaffold } from './source-next';
import { contentPagesFor } from './source-content-pages';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { SOURCE_DNA_RUNTIME_ENUMS, sourceRuntimeDna } from './source-dna';
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
export function fillTemplatePhotos(manifest: Pick<TemplateManifest, 'id' | 'photos'>, items: ReadonlyArray<{ imageUrls?: readonly string[] }>, allowDemo = true) {
  const used = new Set<string>();
  const firsts = items.map(item => item.imageUrls?.[0]).filter((url): url is string => Boolean(url));
  const rest = items.flatMap(item => item.imageUrls?.slice(1) ?? []);
  const take = (pool: string[]) => { const url = pool.find(candidate => !used.has(candidate)); if (url) used.add(url); return url; };
  const photos: Record<string, string> = {};
  const demoSlots: string[] = [];
  for (const { slot, role } of manifest.photos) {
    const url = role === 'hero' || role === 'product' ? take(firsts) : take([...rest, ...firsts]);
    if (url) { photos[slot] = url; continue; }
    photos[slot] = allowDemo ? templateDemoPath(manifest, slot) : '';
    if (photos[slot]) demoSlots.push(slot);
  }
  return { photos, demoSlots };
}

/** Review fix: a product slot holding the same upload as the bundled hero or story photo points at that bundle, so the page
 *  can tell they are one photo (the store shows it once per block). */
export function sameAsBundled(photos: Record<string, string>, sources: MasterFill['photoSources']): Record<string, string> {
  if (!sources) return photos;
  return Object.fromEntries(Object.entries(photos).map(([slot, src]) => {
    if (slot === 'hero' || slot === 'story' || !src) return [slot, src];
    const path = uploadPath(src);
    return [slot, sources.hero && path === sources.hero && photos.hero ? photos.hero : sources.story && path === sources.story && photos.story ? photos.story : src];
  }));
}

export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string; logo?: string; phone?: string }, photos: Record<string, string>, master?: { copy: MasterCopy; look: MasterLook; variants?: MasterVariants; sections?: MasterSection[] }): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '', logo: store.logo ?? '', phone: store.phone ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`
      + (master ? `export const copy = ${JSON.stringify(master.copy)} as const;\nexport const look = ${JSON.stringify(master.look)} as const;\n`
        + `export const variants: Record<string, string | string[]> = ${JSON.stringify(master.variants ?? { sections: [] })};\n`
        + `export const sections: Array<{ id: string; title: string; items: Array<{ title: string; text: string }> }> = ${JSON.stringify(master.sections ?? [])};\n` : ''),
  };
}

const dataLine = (content: string, name: string) => {
  const match = content.match(new RegExp(`^export const ${name}(?:: [^=]+)? = (.*?)(?: as const)?;$`, 'm'));
  try { return match ? JSON.parse(match[1]) : undefined; } catch { return undefined; }
};

/** What a master store's store-data says now (spec 2026-10-19 §3.1): the content edits start from it. */
export function readMasterState(files: readonly SourceProjectFileDto[]) {
  const content = files.find(file => file.path === TEMPLATE_STORE_DATA_PATH)?.content ?? '';
  return {
    store: dataLine(content, 'store') as { name: string; tagline?: string; city?: string; logo?: string; phone?: string } | undefined,
    photos: (dataLine(content, 'photos') ?? {}) as Record<string, string>,
    copy: dataLine(content, 'copy') as MasterCopy | undefined,
    look: dataLine(content, 'look') as MasterLook | undefined,
    variants: dataLine(content, 'variants') as MasterVariants | undefined,
    sections: dataLine(content, 'sections') as MasterSection[] | undefined,
  };
}

/** A content edit: new store-data, theme block and DNA fonts; components and every other file untouched. */
export function refillMasterFiles(files: SourceProjectFileDto[], manifest: TemplateManifest, change: MasterFill, apiUrl?: URL): SourceProjectFileDto[] {
  const settings = manifest.master;
  if (!settings) throw new TypeError(`Plantilla ${manifest.id}: no es una plantilla base.`);
  const state = readMasterState(files);
  const copy = masterCopy(settings, { ...(state.copy ?? {}), ...(change.copy ?? {}) });
  // A changed look carries its whole colour set (the fill call copies the colours it keeps), so earlier custom colours can go.
  const look = masterLook(settings, { ...(state.look ?? {}), ...(change.look ?? {}), colors: change.look?.colors ?? state.look?.colors ?? {} });
  const photos = sameAsBundled({ ...state.photos, ...(change.heroPhoto !== undefined ? { hero: masterPhotoUrl(change.heroPhoto, apiUrl) } : {}), ...(change.storyPhoto !== undefined ? { story: masterPhotoUrl(change.storyPhoto, apiUrl) } : {}) }, change.photoSources);
  const theme = masterThemeCss(settings, look);
  return files.map(file => {
    if (file.path === TEMPLATE_STORE_DATA_PATH) return templateStoreDataFile(state.store ?? { name: '' }, photos, { copy, look, variants: { ...(state.variants ?? { sections: [] }), ...Object.fromEntries(Object.entries(change.variants ?? {}).filter(([part, id]) => part !== 'sections' && (settings.variants?.[part] ?? []).includes(String(id)))) } as MasterVariants, sections: change.sections ?? state.sections ?? [] });
    if (file.path === 'styles/globals.css') return { ...file, content: withMasterTheme(file.content, theme) };
    if (file.path === 'config.js') {
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return file;
      const config = JSON.parse(match[1]);
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, dna: { ...config.dna, ...masterDnaFonts(settings, look), ...masterDnaLook({ ...(state.variants ?? {}), ...(change.variants ?? {}) }) } })};\n` };
    }
    return file;
  });
}

export function templateDemoAssets(manifest: TemplateManifest, demoSlots: readonly string[]): SourceProjectFileDto[] {
  return demoSlots.flatMap(slot => {
    const photo = templateDemoPhoto(manifest.id, slot);
    return photo ? [{ path: templateDemoPath(manifest, slot), content: photo.bytes.toString('base64'), encoding: 'base64' as const }] : [];
  });
}

/** A template pins the kit surfaces its design depends on (button form, radius, cart…); every value must be one the
 * kit renders. The rest of the DNA stays seeded by the store id, as for any store. */
export function templateDna(manifest: Pick<TemplateManifest, 'id' | 'dna'>, storeId: string) {
  const pinned = manifest.dna ?? {};
  for (const [name, value] of Object.entries(pinned)) {
    if (!SOURCE_DNA_RUNTIME_ENUMS[name]?.includes(value)) throw new TypeError(`Plantilla ${manifest.id}: dna.${name} no admite ${value}`);
  }
  return { ...sourceRuntimeDna(undefined, storeId), ...pinned };
}

const TEMPLATE_KIT_FILES = ['build.mjs', 'server.mjs', 'commerce.js', 'product.html', 'checkout.html', 'productos.html', 'coleccion.html', 'commerce-pages.css'];
const CATEGORY_BUSINESS: Record<TemplateManifest['category'], string> = {
  comida: 'Comida y bebidas', moda: 'Moda', belleza: 'Belleza y cuidado personal', hogar: 'Hogar y decoración', arte: 'Arte y artesanía',
  tecnologia: 'Tecnología', mascotas: 'Mascotas', ninos: 'Niños y juguetes', deporte: 'Deporte y aire libre', servicios: 'Servicios', libros: 'Libros y papelería', 'producto-unico': 'Un producto estrella', motor: 'Autopartes y motor', construccion: 'Construcción y obras', general: 'Tienda en línea',
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
  /** Master templates only (spec 2026-10-19): the filled copy, look and photo choices; and false keeps demo photos out. */
  fill?: MasterFill; demoPhotos?: boolean;
  /** Bundled photo assets the fill points at (assets/image-…). */
  extraFiles?: SourceProjectFileDto[];
  /** Variety spec: the rolled variants and the business sections' content. */
  variants?: MasterVariants; sections?: MasterSection[];
}): Promise<{ label: string; brief: SourceProjectBriefDto; files: SourceProjectFileDto[] }> {
  const { manifest } = input;
  const data = sourceStoreConfigData(input.publicStore, input.apiUrl, input.firstRevision);
  const settings = manifest.master;
  const filled = fillTemplatePhotos(manifest, data.items, input.demoPhotos !== false);
  const photos: Record<string, string> = sameAsBundled({ ...filled.photos,
    ...(settings && input.fill?.heroPhoto !== undefined ? { hero: masterPhotoUrl(input.fill.heroPhoto, input.apiUrl) } : {}),
    ...(settings && input.fill?.storyPhoto !== undefined ? { story: masterPhotoUrl(input.fill.storyPhoto, input.apiUrl) } : {}) }, input.fill?.photoSources);
  const demoSlots = filled.demoSlots.filter(slot => photos[slot] === templateDemoPath(manifest, slot));
  const copy = settings ? masterCopy(settings, input.fill?.copy) : undefined;
  const look = settings ? masterLook(settings, input.fill?.look) : undefined;
  const storeData = templateStoreDataFile({ name: data.storeName, tagline: data.tagline ?? '', city: (data.locations as Array<{ city?: string | null }> | undefined)?.[0]?.city ?? '',
    logo: data.logoUrl ?? '', phone: data.contactPhone ?? '' }, photos, settings ? { copy: copy!, look: look!, variants: input.variants ?? (input.fill?.variants as MasterVariants | undefined), sections: input.sections ?? input.fill?.sections } : undefined);
  const themed = (file: SourceProjectFileDto) => settings && file.path === 'styles/globals.css' ? { ...file, content: withMasterTheme(file.content, masterThemeCss(settings, look!)) } : file;
  const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH).map(themed), ...contentPagesFor(input.source), storeData];
  const compiled = await compileNextPreview(authored, 'shop');
  const scaffold = [...compiled, ...nextProjectScaffold(input.slug, nextContentPages(authored, 'shop'))];
  const kitFiles = await Promise.all(TEMPLATE_KIT_FILES.filter(path => !scaffold.some(file => file.path === path))
    .map(async path => ({ path, content: await readFile(kitPath(path), 'utf8') })));
  const demoAssets = templateDemoAssets(manifest, demoSlots);
  const config = {
    ...sourceCommerceRoutes([...authored, ...scaffold, ...kitFiles], {}), dna: { ...templateDna(manifest, input.storeId), ...(settings ? { ...masterDnaFonts(settings, look!), ...masterDnaLook(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {}) },
    productPage: 'product.html', checkoutPage: 'checkout.html', sitePurpose: 'shop', demo: false, slug: input.slug,
    apiBaseUrl: input.apiUrl.href.replace(/\/$/, ''), checkoutOrigin: input.checkoutOrigin, data,
  };
  const visualSystem = buildSourceVisualSystem('auto', sourceAssetInventory(demoAssets));
  const files = await withSourceMotion(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
    ...authored, ...scaffold, ...kitFiles, ...demoAssets, ...(input.extraFiles ?? []),
    { path: 'brand.css', content: '/* No confirmed brand tokens. */' },
    { path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify(withSourceStyleTokens(visualSystem, authored), null, 2) + '\n' },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
  ]))), 'auto');
  const brief = { ...(input.previousBrief ?? {
    sitePurpose: 'shop' as const, businessType: CATEGORY_BUSINESS[manifest.category], audience: `Clientes de ${data.storeName}`.slice(0, 500),
    primaryAction: 'Comprar en línea', visualDirection: `Plantilla ${manifest.name}: ${manifest.description}`.slice(0, 2000),
  }), templateId: manifest.id };
  return { label: `Plantilla: ${manifest.name}`.slice(0, 120), brief, files };
}

/** The demo store Plantillas are checked and previewed with: four products (so every photo slot shows the template's
 * demo photo), BOB prices, no branches (a branch without a delivery method would stop the simulated checkout). */
export function templateDemoPublicStore(): SourcePublicStore {
  const product = (id: string, name: string, amount: number, description: string) => ({ id, name, amount, currency: 'BOB', stock: 12, description, imageUrls: [], variants: [], extras: [], highlights: [] });
  return ({
    storeName: 'Tu marca', tagline: 'Hecho con cuidado en Bolivia', checkoutMode: 'payment', creditsEnabled: false, digitalGoodsEnabled: false,
    shippingEnabled: false, shippingPickupEnabled: false, shippingCarriersEnabled: false, bundlesEnabled: false, subscriptionsEnabled: false, logoUrl: null, contactPhone: null,
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
export async function templateDemoRevision(manifest: TemplateManifest, source: SourceProjectFileDto[], fill?: MasterFill) {
  const assembled = await assembleTemplateRevision({ manifest, source, storeId: `template-${manifest.id}`, slug: manifest.id, publicStore: templateDemoPublicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), checkoutOrigin: 'https://pagar.pagosya.test', firstRevision: true, fill });
  const productPhotos = manifest.photos.filter(photo => photo.role === 'product' && photo.demo).map(photo => templateDemoPath(manifest, photo.slot));
  const files = assembled.files.map(file => {
    if (file.path !== 'config.js' || !productPhotos.length) return file;
    const config = JSON.parse(file.content.match(/^window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    config.data.items = config.data.items.map((item: { imageUrls: string[] }, index: number) => ({ ...item, imageUrls: [productPhotos[index % productPhotos.length]] }));
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` };
  });
  return { ...assembled, files };
}
