import { uploadPath } from './source-product-photos';
/** Plantillas (spec 2026-09-25-plantillas-design.md): the per-store pieces a template needs at apply time. A template's
 * authored source never contains merchant text; it imports `./store-data`, which this module writes with every value
 * JSON-encoded, so no store name or photo URL is ever pasted into JSX. */
import type { MasterCopy } from '@pagosya/store-templates';
import { MASTER_TEMPLATE_ID, masterCopy, masterDnaFonts, masterDnaLook, masterProductStyle, masterShowcase, masterLook, masterPhotoUrl, masterThemeCss, withMasterTheme, type MasterFill, type MasterLook, type MasterSection, type MasterVariants } from './source-master';
import { readFile } from 'node:fs/promises';
import { templateDemoPhoto, templateSourceFiles, type TemplateCopySlot, type TemplateManifest } from '@pagosya/store-templates';
import { plantillaFillFromRead } from './source-plantilla-fill';
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
import { menuFromVariant, storeMenuContext, type StoreMenuGroup } from './source-store-menu';

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

export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string; logo?: string; phone?: string }, photos: Record<string, string>, master?: { copy: MasterCopy; look: MasterLook; variants?: MasterVariants; sections?: MasterSection[] }, plantillaCopy?: Record<string, string>): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '', logo: store.logo ?? '', phone: store.phone ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`
      + (master ? `export const copy = ${JSON.stringify(master.copy)} as const;\nexport const look = ${JSON.stringify(master.look)} as const;\n`
        + `export const variants: Record<string, string | string[]> = ${JSON.stringify(master.variants ?? { sections: [] })};\n`
        + `export const sections: Array<{ id: string; title: string; items: Array<{ title: string; text: string }> }> = ${JSON.stringify(master.sections ?? [])};\n` : '')
      // A converted Plantilla (spec 2026-10-20): every text it shows, filled for the merchant or the template's own defaults.
      + (plantillaCopy ? `export const copy: Record<string, string> = ${JSON.stringify(plantillaCopy)};\n` : ''),
  };
}

const dataLine = (content: string, name: string) => {
  const match = content.match(new RegExp(`^export const ${name}(?:: [^=]+)? = (.*?)(?: as const)?;$`, 'm'));
  try { return match ? JSON.parse(match[1]) : undefined; } catch { return undefined; }
};

/** A converted Plantilla's texts as its store-data says now; {} for any other store. */
export function readPlantillaCopy(files: readonly SourceProjectFileDto[]): Record<string, string> {
  const value = dataLine(files.find(file => file.path === TEMPLATE_STORE_DATA_PATH)?.content ?? '', 'copy');
  return value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(text => typeof text === 'string') ? value as Record<string, string> : {};
}

/** Spec 2026-10-20 §5: a words change on a Plantilla store. Only store-data's `copy` line is rewritten, merged over the
 *  current words; keys the template has no slot for are dropped and long values clipped to the slot. */
export function refillPlantillaFiles(files: SourceProjectFileDto[], change: Record<string, unknown>, slots: readonly TemplateCopySlot[]): SourceProjectFileDto[] {
  const line = /^export const copy: Record<string, string> = .*;$/m;
  return files.map(file => {
    if (file.path !== TEMPLATE_STORE_DATA_PATH || !line.test(file.content)) return file;
    const copy = { ...readPlantillaCopy([file]), ...plantillaFillFromRead(change, slots) };
    return { ...file, content: file.content.replace(line, () => `export const copy: Record<string, string> = ${JSON.stringify(copy)};`) };
  });
}

/** The template's own words for every slot: the demo store and the gallery preview show exactly what it was designed with. */
export function plantillaDefaults(manifest: Pick<TemplateManifest, 'copy'>): Record<string, string> {
  return Object.fromEntries((manifest.copy ?? []).map(slot => [slot.key, slot.default]));
}

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
/** Fashion look spec 2026-10-21: a store switched to the fashion card or page after its build gains the template's fashion
 *  CSS block and, when its product page is still the template's, the category line and size guide link. A product page the
 *  store edited (anchors missing) is left alone; doing it twice changes nothing. */
const FASHION_CSS_MARK = '/* Fashion look (2026-10-21)';
export function withFashionTemplateParts<F extends { path: string; content: string }>(files: F[], variants: Partial<MasterVariants>): F[] {
  if (variants.cards !== 'fashion' && variants.pdp !== 'fashion') return files;
  const css = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  const block = css.includes(FASHION_CSS_MARK) ? css.slice(css.indexOf(FASHION_CSS_MARK)).trim() : '';
  const title = '<KitSlot kind="product" name="title" className="es-pdp__title" />', buy = '<KitSlot kind="product" name="buy" className="es-pdp__buy" />';
  return files.map(file => {
    if (file.path === 'styles/globals.css' && block && !file.content.includes(FASHION_CSS_MARK)) return { ...file, content: `${file.content.trimEnd()}\n\n${block}\n` };
    if (file.path !== 'components/product.tsx' || file.content.includes('name="category"') || !file.content.includes(title) || !file.content.includes(buy)) return file;
    const indent = (line: string) => file.content.slice(file.content.lastIndexOf('\n', file.content.indexOf(line)) + 1, file.content.indexOf(line));
    let content = file.content
      .replace(title, `${title}\n${indent(title)}{variant('pdp', 'gallery-left') === 'fashion' ? <KitSlot kind="product" name="category" className="es-pdp__category" /> : null}`)
      .replace(buy, `{variant('pdp', 'gallery-left') === 'fashion' && sections.some(section => section.id === 'sizes') ? <a className="es-pdp__guide" href="index.html#sizes">Guía de tallas</a> : null}\n${indent(buy)}${buy}`);
    if (!/import \{[^}]*\bsections\b[^}]*\} from '\.\/store-data'/.test(content)) content = content.replace(/^(import [^\n]*\n)/, `$1import { sections } from './store-data';\n`);
    return { ...file, content };
  });
}

/** Dropdown menu spec 2026-10-21: an Esencial store built before the menu gets its two mounts, the replace marks and the
 *  mounts' CSS. A Shell the store edited (the template lines gone) is left alone; the menu then simply has no host there.
 *  Doing it twice changes nothing. */
const SHELL_TOGGLE = '<button type="button" className="es-icon-btn" aria-controls="es-menu"';
const SHELL_LOGO_END = ': store.name}</a>';
const SHELL_NAV = '<nav className="es-header__links" aria-label="Principal">';
const STORE_MENU_CSS_MARK = '/* Dropdown menu (2026-10-21)';
const STORE_MENU_CSS_END = '/* Dropdown menu end */';
export function withStoreMenuMounts<F extends { path: string; content: string }>(files: F[]): F[] {
  const css = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  const start = css.indexOf(STORE_MENU_CSS_MARK), end = css.indexOf(STORE_MENU_CSS_END);
  const block = start >= 0 && end > start ? css.slice(start, end + STORE_MENU_CSS_END.length) : '';
  return files.map(file => {
    if (file.path === 'styles/globals.css' && block && !file.content.includes(STORE_MENU_CSS_MARK)) return { ...file, content: `${file.content.trimEnd()}\n\n${block}\n` };
    if (file.path !== 'components/Shell.tsx' || file.content.includes('data-pagosya-store-menu') || ![SHELL_TOGGLE, SHELL_LOGO_END, SHELL_NAV].every(line => file.content.includes(line))) return file;
    const indent = file.content.slice(file.content.lastIndexOf('\n', file.content.indexOf(SHELL_TOGGLE)) + 1, file.content.indexOf(SHELL_TOGGLE));
    const content = file.content
      .replace(SHELL_TOGGLE, () => `<div className="es-store-menu" data-pagosya-store-menu="toggle" />\n${indent}<button type="button" className="es-icon-btn" data-store-menu-replaces aria-controls="es-menu"`)
      .replace(SHELL_LOGO_END, () => `${SHELL_LOGO_END}\n${indent}<div className="es-store-menu-links" data-pagosya-store-menu="links" />`)
      .replace(SHELL_NAV, () => '<nav className="es-header__links" aria-label="Principal" data-store-menu-replaces>');
    return { ...file, content };
  });
}

/** A tile photo the fill gave as an upload path (`/v1/uploads/…`) as the full API URL, so the save check can match it. */
export const absoluteTiles = (groups: StoreMenuGroup[] | undefined, apiUrl?: URL) => groups?.map(group => ({ ...group, ...(group.tiles ? { tiles: group.tiles.map(tile => ({ ...tile, image: masterPhotoUrl(tile.image, apiUrl) })) } : {}) }));

export function refillMasterFiles(files: SourceProjectFileDto[], manifest: TemplateManifest, change: MasterFill, apiUrl?: URL): SourceProjectFileDto[] {
  const settings = manifest.master;
  if (!settings) throw new TypeError(`Plantilla ${manifest.id}: no es una plantilla base.`);
  const state = readMasterState(files);
  const copy = masterCopy(settings, { ...(state.copy ?? {}), ...(change.copy ?? {}) });
  // A changed look carries its whole colour set (the fill call copies the colours it keeps), so earlier custom colours can go.
  const look = masterLook(settings, { ...(state.look ?? {}), ...(change.look ?? {}), colors: change.look?.colors ?? state.look?.colors ?? {} });
  const photos = sameAsBundled({ ...state.photos, ...(change.heroPhoto !== undefined ? { hero: masterPhotoUrl(change.heroPhoto, apiUrl) } : {}), ...(change.storyPhoto !== undefined ? { story: masterPhotoUrl(change.storyPhoto, apiUrl) } : {}) }, change.photoSources);
  const theme = masterThemeCss(settings, look);
  const variants = { ...(state.variants ?? { sections: [] }), ...Object.fromEntries(Object.entries(change.variants ?? {}).filter(([part, id]) => part !== 'sections' && (settings.variants?.[part] ?? []).includes(String(id)))) } as MasterVariants;
  // Dropdown menu spec 2026-10-21: a menu change sets the record; a fashion store without one gets the panel.
  const menuIds = settings.variants?.menu ?? [];
  if (menuIds.length) {
    if (change.menu && menuIds.includes(change.menu.style)) variants.menu = change.menu.style;
    else if (!change.menu && variants.cards === 'fashion' && (!variants.menu || variants.menu === 'none')) variants.menu = 'panel';
  }
  const out = withFashionTemplateParts(files.map(file => {
    if (file.path === TEMPLATE_STORE_DATA_PATH) return templateStoreDataFile(state.store ?? { name: '' }, photos, { copy, look, variants, sections: change.sections ?? state.sections ?? [] });
    if (file.path === 'styles/globals.css') return { ...file, content: withMasterTheme(file.content, theme) };
    if (file.path === 'config.js') {
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return file;
      const config = JSON.parse(match[1]);
      // Fashion look spec 2026-10-21: the product-page style follows the pdp variant; a store leaving it drops the fashion style.
      const { productPageStyle, ...rest } = config;
      const style = masterProductStyle(variants).productPageStyle ?? (productPageStyle === 'fashion' ? undefined : productPageStyle);
      // Dropdown menu spec 2026-10-21: header.menu follows the menu variant; a refill that names no menu keeps its groups.
      const { menu: savedMenu, ...header } = config.header ?? {};
      const menu = menuIds.length ? menuFromVariant(variants.menu, change.menu ? absoluteTiles(change.menu.groups, apiUrl) : savedMenu?.groups, storeMenuContext(config.data ?? {}, files)) : savedMenu;
      const withHeader = config.header || menu ? { header: { ...header, ...(menu ? { menu } : {}) } } : {};
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...rest, ...(style ? { productPageStyle: style } : {}), ...withHeader, dna: { ...config.dna, ...masterDnaFonts(settings, look), ...masterDnaLook({ ...(state.variants ?? {}), ...(change.variants ?? {}) }) }, showcase: { ...(config.showcase ?? {}), ...masterShowcase(variants) } })};\n` };
    }
    return file;
  }), variants);
  return variants.menu && variants.menu !== 'none' ? withStoreMenuMounts(out) : out;
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
  /** A converted Plantilla's filled texts (spec 2026-10-20); missing keys keep the template's own words. */
  plantillaCopy?: Record<string, string>;
  /** Dropdown menu spec 2026-10-21: groups YAPI wrote for the menu; without them the fill's own, else the kit builds the menu. */
  menuGroups?: StoreMenuGroup[];
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
    logo: data.logoUrl ?? '', phone: data.contactPhone ?? '' }, photos, settings ? { copy: copy!, look: look!, variants: input.variants ?? (input.fill?.variants as MasterVariants | undefined), sections: input.sections ?? input.fill?.sections } : undefined, manifest.copy ? { ...plantillaDefaults(manifest), ...(input.plantillaCopy ?? {}) } : undefined);
  const themed = (file: SourceProjectFileDto) => settings && file.path === 'styles/globals.css' ? { ...file, content: withMasterTheme(file.content, masterThemeCss(settings, look!)) } : file;
  // A filled Plantilla never shows the demo business's photos; a slot the merchant has no photo for stays empty instead
  // of a broken image showing its description (live check 2026-10-21, Alfar's floating photos).
  const noEmptyPhotos = (file: SourceProjectFileDto) => manifest.copy && input.plantillaCopy && input.demoPhotos === false && file.path === 'styles/globals.css'
    ? { ...file, content: `${file.content}\n/* pagosYa: a photo slot with no photo stays empty. */\nimg:not([src]),img[src=""]{visibility:hidden}\n` } : file;
  const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH).map(themed).map(noEmptyPhotos), ...contentPagesFor(input.source), storeData];
  const compiled = await compileNextPreview(authored, 'shop');
  const scaffold = [...compiled, ...nextProjectScaffold(input.slug, nextContentPages(authored, 'shop'))];
  // Dropdown menu spec 2026-10-21: the rolled menu variant becomes config.js header.menu, its groups checked against this store.
  const menuVariants = input.variants ?? (input.fill?.variants as MasterVariants | undefined);
  const menu = settings ? menuFromVariant(menuVariants?.menu, absoluteTiles(input.menuGroups ?? input.fill?.menu?.groups, input.apiUrl), storeMenuContext(data, [...authored, ...scaffold])) : undefined;
  const kitFiles = await Promise.all(TEMPLATE_KIT_FILES.filter(path => !scaffold.some(file => file.path === path))
    .map(async path => ({ path, content: await readFile(kitPath(path), 'utf8') })));
  const demoAssets = templateDemoAssets(manifest, demoSlots);
  const config = {
    ...sourceCommerceRoutes([...authored, ...scaffold, ...kitFiles], {}), dna: { ...templateDna(manifest, input.storeId), ...(settings ? { ...masterDnaFonts(settings, look!), ...masterDnaLook(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {}) },
    ...(settings ? { showcase: masterShowcase(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {}),
    ...(settings ? masterProductStyle(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) : {}),
    ...(menu ? { header: { menu } } : {}),
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
