import { uploadPath } from './source-product-photos';
/** Plantillas (spec 2026-09-25-plantillas-design.md): the per-store pieces a template needs at apply time. A template's
 * authored source never contains merchant text; it imports `./store-data`, which this module writes with every value
 * JSON-encoded, so no store name or photo URL is ever pasted into JSX. */
import type { MasterCopy } from '@pagosya/store-templates';
import { MASTER_TEMPLATE_ID, bindThemeAccent, frameChoices, refreshVariantBlocks, masterCopy, readableAccentText, masterDnaFonts, masterDnaLook, masterFilterStyle, masterProductStyle, masterShowcase, masterLook, masterPhotoUrl, masterThemeCss, templateLook, withMasterTheme, withOnlyTheme, type MasterColour, type MasterFill, type MasterLook, type MasterSection, type MasterVariants } from './source-master';
import { readFile } from 'node:fs/promises';
import { templateDemoPhoto, templateManifest, templateSourceFiles, type TemplateCopySlot, type TemplateManifest } from '@pagosya/store-templates';
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
import { isFilterStyle } from './source-filter-style';
import { buildFeatures, eligibleFeatures, featureFacts, rollFeatures } from './source-master-features';
import type { ExtraPage } from './source-extra-pages';
import { readConfigFile } from './store-look';

export const TEMPLATE_STORE_DATA_PATH = 'components/store-data.tsx';

export const templateDemoPath = (manifest: Pick<TemplateManifest, 'id' | 'photos' | 'photoSource'>, slot: string) => {
  const demo = manifest.photos.find(photo => photo.slot === slot)?.demo;
  // A preset resolved to its master carries the preset's own demo photos (Plantillas presets 2026-10-22).
  return demo ? `assets/template-${manifest.photoSource ?? manifest.id}-${slot}.${demo.split('.').pop()}` : '';
};

/** (34 templates 2026-10-31: a preset may carry a whole theme — its style block, motion and home; see presetFill's layout. all 34 built, each with its own product page; a new store starts on the one YAPI picks.)
 *  Plantillas presets (2026-10-22): the master a preset is a look of, carrying the preset's photos, and the fill that gives
 *  it the preset's look, parts, sections and starting words. Any other template resolves to itself. */
export function resolvePresetTemplate(manifest: TemplateManifest, master: (id: string) => TemplateManifest | undefined): { manifest: TemplateManifest; preset?: MasterFill; sourceId: string; demo?: NonNullable<TemplateManifest['preset']>['demo'] } {
  // sourceId: whose files the store is built from — a preset's master, or a starter's own (spec 2026-10-24).
  if (!manifest.preset || !manifest.extends) return { manifest, sourceId: manifest.id };
  const base = master(manifest.extends);
  if (!base?.master) throw new TypeError(`Plantilla ${manifest.id}: ${manifest.extends} no es una plantilla base.`);
  return { manifest: { ...base, photos: manifest.photos, photoSource: manifest.id }, preset: presetFill(manifest.preset), sourceId: manifest.id, demo: manifest.preset.demo };
}

export function presetFill(preset: NonNullable<TemplateManifest['preset']>): MasterFill {
  const sections = (preset.sections ?? []).map(section => ({ id: section.id, title: section.title, items: section.items.map(item => ({ title: item.title, text: item.text })) }));
  return {
    look: { palette: preset.palette, fonts: preset.fonts, colors: { ...(preset.colors ?? {}) } },
    copy: preset.copy as MasterFill['copy'],
    variants: { ...preset.variants, sections: sections.map(section => section.id) } as MasterVariants,
    sections, featureCopy: (preset.featureCopy ?? {}) as MasterFill['featureCopy'],
    // 34 templates (2026-10-31): the theme's fixed home (section-library blocks with demo words).
    ...(preset.layout?.length ? { layout: preset.layout.map(block => ({ ...block })) } : {}),
    ...(preset.productLayout?.length ? { productLayout: preset.productLayout.map(block => ({ ...block })) } : {}),
    character: { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [], kind: preset.kind ?? (preset.variants.cards === 'fashion' ? 'fashion' : 'other') },
  };
}

/** The preset's look, parts and sections over a business's fill: the fill's words win, the preset keeps its design. */
export function withPreset(preset: MasterFill, fill?: MasterFill | null, keepBrandColours = false): MasterFill {
  if (!fill) return preset;
  // A starter (spec 2026-10-24) keeps the merchant's brand colours over its own look; a preset is a chosen look and keeps none.
  // Chunky colour titles (live check 2026-11-03): the photos' title colours travel with the brand colours.
  const look = keepBrandColours && fill.look?.colors && Object.keys(fill.look.colors).length ? { ...(preset.look ?? {}), colors: { ...(preset.look?.colors ?? {}), ...fill.look.colors }, ...(fill.look.titles ? { titles: fill.look.titles } : {}) } : preset.look;
  return { ...fill, look, variants: preset.variants,
    copy: { ...(preset.copy ?? {}), ...(fill.copy ?? {}) }, sections: fill.sections?.length ? fill.sections : preset.sections,
    featureCopy: { ...(preset.featureCopy ?? {}), ...(fill.featureCopy ?? {}) },
    character: { ...(fill.character ?? preset.character!), kind: preset.character?.kind ?? fill.character?.kind },
    // 34 templates: the template's home is part of its design — a business fill never drops it (live check 2026-10-31).
    ...(preset.layout?.length ? { layout: preset.layout } : {}), ...(preset.productLayout?.length ? { productLayout: preset.productLayout } : {}) };
}

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

/** Starters (spec 2026-10-24 §1): the merchant's brand colours over a copy-slot starter's own, appended last so they win. */
export type StarterBrandColours = Partial<Record<'accent' | 'background' | 'foreground' | 'surface', string>>;
export function starterBrandBlock(colours: StarterBrandColours): string {
  const vars = (['accent', 'background', 'foreground', 'surface'] as const).filter(key => /^#[0-9a-f]{6}$/i.test(colours[key] ?? '')).map(key => `--store-${key}:${colours[key]!.toLowerCase()}`);
  return vars.length ? `/* pagosya-brand */ :root{${vars.join(';')}}` : '';
}

export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string; logo?: string; phone?: string }, photos: Record<string, string>, master?: { copy: MasterCopy; look: MasterLook; variants?: MasterVariants; sections?: MasterSection[]; features?: Record<string, unknown>; layout?: unknown[]; productLayout?: unknown[]; pageLayouts?: Record<string, unknown[]>; extraPages?: unknown[] }, plantillaCopy?: Record<string, string>): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '', logo: store.logo ?? '', phone: store.phone ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`
      + (master ? `export const copy = ${JSON.stringify(master.copy)} as const;\nexport const look = ${JSON.stringify(master.look)} as const;\n`
        + `export const variants: Record<string, string | string[]> = ${JSON.stringify(master.variants ?? { sections: [] })};\n`
        + `export const sections: Array<{ id: string; title: string; items: Array<{ title: string; text: string }> }> = ${JSON.stringify(master.sections ?? [])};\n`
        // John Smedley sections (spec 2026-10-21): always exported, so a home that imports it compiles with none rolled.
        + `export const features: Record<string, any> = ${JSON.stringify(master.features ?? {})};\n`
        // Section library (spec 2026-10-31): always exported, empty for a store YAPI did not compose from the library.
        + `export const layout: any[] = ${JSON.stringify(master.layout ?? [])};\n`
        // The template's product-page sections (owner 2026-10-31); always exported, so the product page compiles with none.
        + `export const productLayout: any[] = ${JSON.stringify(master.productLayout ?? [])};\n`
        // The menu pages' sections (spec 2026-11-05); always exported, so a page that draws them compiles with none.
        + `export const pageLayouts: Record<string, any[]> = ${JSON.stringify(master.pageLayouts ?? {})};\n`
        // The pages YAPI made (spec 2026-11-05 creates anything); always exported, so their files compile with none.
        + `export const extraPages: any[] = ${JSON.stringify(master.extraPages ?? [])};\n` : '')
      // A converted Plantilla (spec 2026-10-20): every text it shows, filled for the merchant or the template's own defaults.
      + (plantillaCopy ? `export const copy: Record<string, string> = ${JSON.stringify(plantillaCopy)};\n` : ''),
  };
}

const dataLine = (content: string, name: string) => {
  const match = content.match(new RegExp(`^export const ${name}(?:: [^=]+)? = (.*?)(?: as const)?;$`, 'm'));
  try { return match ? JSON.parse(match[1]) : undefined; } catch { return undefined; }
};

/** Review fix 2026-10-28 (I1): a logo saved after the template build (the cover pick) reaches the store line the Shell reads;
 *  a logo the store-data already has stays. */
export function withStoreLogo<T extends { path: string; content: string }>(files: T[], logo: string): T[] {
  if (!logo) return files;
  const line = /^export const store = (.*) as const;$/m;
  return files.map(file => {
    if (file.path !== TEMPLATE_STORE_DATA_PATH) return file;
    const match = line.exec(file.content);
    if (!match) return file;
    const store = JSON.parse(match[1]) as { logo?: string };
    if (store.logo) return file;
    return { ...file, content: file.content.replace(line, () => `export const store = ${JSON.stringify({ ...store, logo })} as const;`) };
  });
}

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
    features: (dataLine(content, 'features') ?? {}) as Record<string, unknown>,
    layout: (dataLine(content, 'layout') ?? []) as unknown[],
    productLayout: (dataLine(content, 'productLayout') ?? []) as unknown[],
    pageLayouts: (dataLine(content, 'pageLayouts') ?? {}) as Record<string, unknown[]>,
    extraPages: (dataLine(content, 'extraPages') ?? []) as ExtraPage[],
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

/** Sort & filter styles spec 2026-10-21: an Esencial store built before the store's own catalogue pages gets them, with their
 *  CSS block (kept up to date: it is the platform's), so its productos.html and coleccion.html carry the store's header, menu, footer and fonts (the compiled pages
 *  replace the kit's fallback files at save). A page the store already has is left alone; doing it twice changes nothing. */
/** 2026-11-02 (DooBoo: Pancita's turquoise tag was fixed in the template, the store kept its white-on-turquoise copy): the store's own
 *  theme block is the platform's too, so a refill takes the template's current one (without developer notes) before the store's
 *  accent is bound into it again. A theme the template no longer has stays as it is. */
export function withCurrentThemeBlock(css: string, theme: string): string {
  const start = css.indexOf(`/* theme:${theme} */`), end = css.indexOf(`/* /theme:${theme} */`);
  if (!theme || theme === 'none' || start < 0 || end < start) return css;
  const source = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  const from = source.indexOf(`/* theme:${theme} */`), to = source.indexOf(`/* /theme:${theme} */`);
  if (from < 0 || to < from) return css;
  const latest = source.slice(from, to).replace(/\/\*(?! ?\/?(?:theme|lb):| ?pagosya)[\s\S]*?\*\//g, '');
  return css.slice(0, start) + latest + css.slice(end);
}

/** 2026-11-02 (Taller Lienzo: the overlap section's phone rule was fixed in the template, the store kept its old copy): the section
 *  blocks a store's sheet carries («lb:ids») are the platform's, so a refill brings each one up to the template's current version,
 *  without the developer notes (as withOnlyTheme ships them). Sections the store does not carry are left out. */
export function withCurrentSectionCss<F extends { path: string; content: string }>(files: F[]): F[] {
  const sheet = files.find(file => file.path === 'styles/globals.css');
  if (!sheet || !sheet.content.includes('/* lb:') || !files.some(file => file.path === TEMPLATE_STORE_DATA_PATH)) return files;
  const source = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  // One tag can mark several blocks (story-overlap has two): the store's n-th block of a tag takes the template's n-th.
  const latest = new Map<string, string[]>();
  for (const match of source.matchAll(/\/\* lb:([a-z0-9,-]+) \*\/[\s\S]*?\/\* \/lb:\1 \*\//g)) latest.set(match[1], [...(latest.get(match[1]) ?? []), match[0].replace(/\/\*(?! ?\/?(?:theme|lb):| ?pagosya)[\s\S]*?\*\//g, '')]);
  const seen = new Map<string, number>();
  // The colour binding ran before this (the accent as words): a fresh block gets it too.
  const content = readableAccentText(sheet.content.replace(/\/\* lb:([a-z0-9,-]+) \*\/[\s\S]*?\/\* \/lb:\1 \*\//g, (block, ids: string) => {
    const at = seen.get(ids) ?? 0; seen.set(ids, at + 1);
    return latest.get(ids)?.[at] ?? block;
  }));
  return content === sheet.content ? files : files.map(file => file === sheet ? { ...file, content } : file);
}

/** Template frame variety (2026-11-03): a refill brings the store's variant blocks («v:part=value») in line with its footer, button,
 *  card and product page — the chosen ones from the template's current sheet, the others empty. Only a template store's sheet. */
export function withCurrentVariantCss<F extends { path: string; content: string }>(files: F[], choices: Record<string, unknown>): F[] {
  const sheet = files.find(file => file.path === 'styles/globals.css');
  if (!sheet || !sheet.content.includes('/* pagosya:master-theme */') || !files.some(file => file.path === TEMPLATE_STORE_DATA_PATH)) return files;
  const source = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  const content = readableAccentText(refreshVariantBlocks(sheet.content, source, choices));
  return content === sheet.content ? files : files.map(file => file === sheet ? { ...file, content } : file);
}

const CATALOG_PAGES = ['components/page-productos.tsx', 'components/page-coleccion.tsx'];
const CATALOG_CSS_MARK = '/* Esencial catalogue pages (2026-10-21)';
const CATALOG_CSS_END = '/* Esencial catalogue pages end */';
export function withEsencialCatalogPages<F extends { path: string; content: string }>(files: F[]): F[] {
  if (!files.some(file => file.path === TEMPLATE_STORE_DATA_PATH)) return files;
  const source = templateSourceFiles(MASTER_TEMPLATE_ID);
  const css = source.find(file => file.path === 'styles/globals.css')?.content ?? '';
  const start = css.indexOf(CATALOG_CSS_MARK), end = css.indexOf(CATALOG_CSS_END);
  const block = start >= 0 && end > start ? css.slice(start, end + CATALOG_CSS_END.length) : '';
  const missing = CATALOG_PAGES.filter(path => !files.some(file => file.path === path)).flatMap(path => source.filter(file => file.path === path));
  // A page as the first version shipped it (no mark, a fixed collection title) is brought up to date; an edited one is the store's.
  // Compared as code only: the first version's comments were worded differently (NOA VARGAS rev 8, 2026-10-21).
  const code = (content: string) => content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(' data-collection-title', '').replace(/\s+/g, ' ').trim();
  const firstVersion = (content: string, latest: string) => !/^\s*\/\/\s*@pagosya-catalog-page/.test(content) && code(content) === code(latest);
  const current = (path: string) => source.find(file => file.path === path)?.content;
  const withCss = files.map(file => {
    if (file.path === 'styles/globals.css' && block && !file.content.includes(CATALOG_CSS_MARK)) return { ...file, content: `${file.content.trimEnd()}\n\n${block}\n` };
    // The block is the platform's (2026-11-02: the template-card grid): an older copy of it is replaced by the current one.
    if (file.path === 'styles/globals.css' && block) {
      const from = file.content.indexOf(CATALOG_CSS_MARK), to = file.content.indexOf(CATALOG_CSS_END, from);
      if (to > from && file.content.slice(from, to + CATALOG_CSS_END.length) !== block) return { ...file, content: file.content.slice(0, from) + block + file.content.slice(to + CATALOG_CSS_END.length) };
    }
    const latest = CATALOG_PAGES.includes(file.path) ? current(file.path) : undefined;
    return latest && file.content !== latest && firstVersion(file.content, latest) ? { ...file, content: latest } : file;
  });
  return missing.length ? [...withCss, ...missing.map(file => ({ ...file }) as unknown as F)] : withCss;
}

/** John Smedley sections (spec 2026-10-21): an Esencial home built before the sections gets the component, the CSS block and a
 *  slot before each of its four anchors — only when all four are there and none is placed yet, so a home YAPI rebuilt is left
 *  alone (store-data always exports `features`, so it still compiles). Doing it twice changes nothing. */
const FEATURE_ANCHORS: Array<[string, string]> = [['<section id="historia"', 'products'], ['{sections.map(', 'story'], ['<section id="valores"', 'values'], ['<section id="cierre"', 'closing']];
const FEATURE_CSS_MARK = '/* John Smedley sections (2026-10-21)';
const FOOTER_ANCHOR = 'return <footer className="es-footer" data-es-footer={footer}>';
const SHELL_DATA_IMPORT = "import { store, copy, variants } from './store-data';";
const FEATURE_CSS_END = '/* John Smedley sections end */';
export function withFeatureSlots<F extends { path: string; content: string }>(files: F[]): F[] {
  if (!files.some(file => file.path === TEMPLATE_STORE_DATA_PATH)) return files;
  const source = templateSourceFiles(MASTER_TEMPLATE_ID);
  const css = source.find(file => file.path === 'styles/globals.css')?.content ?? '';
  const start = css.indexOf(FEATURE_CSS_MARK), end = css.indexOf(FEATURE_CSS_END);
  const block = start >= 0 && end > start ? css.slice(start, end + FEATURE_CSS_END.length) : '';
  const component = source.find(file => file.path === 'components/features.tsx');
  const out = files.map(file => {
    if (file.path === 'styles/globals.css' && block) {
      // An older copy of the block is replaced by the template's current one (live check, NOA VARGAS rev 11).
      const from = file.content.indexOf(FEATURE_CSS_MARK), to = file.content.indexOf(FEATURE_CSS_END, from);
      if (from < 0) return { ...file, content: `${file.content.trimEnd()}\n\n${block}\n` };
      if (to > from) { const content = file.content.slice(0, from) + block + file.content.slice(to + FEATURE_CSS_END.length); return content === file.content ? file : { ...file, content }; }
      return file;
    }
    // The column footer's photo band reads store-data photos; an older Shell gets the two lines (live check, NOA VARGAS rev 11).
    if (file.path === 'components/Shell.tsx' && !file.content.includes('style={band}') && file.content.includes(FOOTER_ANCHOR) && file.content.includes(SHELL_DATA_IMPORT)) {
      const indent = file.content.slice(file.content.lastIndexOf('\n', file.content.indexOf(FOOTER_ANCHOR)) + 1, file.content.indexOf(FOOTER_ANCHOR));
      return { ...file, content: file.content.replace(SHELL_DATA_IMPORT, "import { store, copy, variants, photos } from './store-data';")
        .replace(FOOTER_ANCHOR, `const band = footer === 'column' && photos.hero ? { ['--es-footer-photo' as string]: \`url("\${photos.hero}")\` } as Record<string, string> : undefined;\n${indent}return <footer className="es-footer" data-es-footer={footer} style={band}>`) };
    }
    if (file.path !== 'components/home.tsx' || file.content.includes('FeatureSlot') || !FEATURE_ANCHORS.every(([anchor]) => file.content.split(anchor).length === 2)) return file;
    // The import goes after the home's last import, whatever its quotes or line breaks; a home with none it can follow is left
    // alone, so slots never land without their import (final review 2026-10-21).
    const code = file.content.search(/^export\b/m);
    const imports = [...file.content.matchAll(/^(?:import\b[^\n]*|\}[^\n]*)\bfrom\s+['"][^'"\n]+['"];?[ \t]*$/gm)].filter(match => code < 0 || match.index! < code);
    const last = imports.at(-1);
    if (!last) return file;
    const afterImports = last.index! + last[0].length;
    let content = `${file.content.slice(0, afterImports)}\nimport { FeatureSlot } from './features';${file.content.slice(afterImports)}`;
    for (const [anchor, slot] of FEATURE_ANCHORS) {
      const at = content.indexOf(anchor), indent = content.slice(content.lastIndexOf('\n', at) + 1, at);
      content = `${content.slice(0, at)}<FeatureSlot at="${slot}" />\n\n${indent}${content.slice(at)}`;
    }
    return { ...file, content };
  });
  return component && !out.some(file => file.path === component.path) && out.some(file => file.path === 'components/home.tsx' && file.content.includes('FeatureSlot'))
    ? [...out, { ...component } as unknown as F] : out;
}

/** A tile photo the fill gave as an upload path (`/v1/uploads/…`) as the full API URL, so the save check can match it. */
export const absoluteTiles = (groups: StoreMenuGroup[] | undefined, apiUrl?: URL) => groups?.map(group => ({ ...group, ...(group.tiles ? { tiles: group.tiles.map(tile => ({ ...tile, image: masterPhotoUrl(tile.image, apiUrl) })) } : {}) }));

export function refillMasterFiles(files: SourceProjectFileDto[], manifest: TemplateManifest, change: MasterFill, apiUrl?: URL): SourceProjectFileDto[] {
  const settings = manifest.master;
  if (!settings) throw new TypeError(`Plantilla ${manifest.id}: no es una plantilla base.`);
  const state = readMasterState(files);
  const copy = masterCopy(settings, { ...(state.copy ?? {}), ...(change.copy ?? {}) });
  // A changed look carries its whole colour set (the fill call copies the colours it keeps), so earlier custom colours can go.
  // On a template (spec 2026-11-01 §2) only the accent changes: its theme is drawn for its own paper, ink and deep.
  const themeId = String((state.variants as Record<string, unknown> | undefined)?.theme ?? 'none');
  const themed = themeId !== 'none' ? templateManifest(themeId)?.preset?.colors as Partial<Record<MasterColour, string>> | undefined : undefined;
  const look = themed && change.look && state.look ? templateLook(settings, state.look as MasterLook, change.look)
    : masterLook(settings, { ...(state.look ?? {}), ...(change.look ?? {}), colors: change.look?.colors ?? state.look?.colors ?? {} });
  const photos = sameAsBundled({ ...state.photos, ...(change.heroPhoto !== undefined ? { hero: masterPhotoUrl(change.heroPhoto, apiUrl) } : {}), ...(change.storyPhoto !== undefined ? { story: masterPhotoUrl(change.storyPhoto, apiUrl) } : {}) }, change.photoSources);
  const variants = { ...(state.variants ?? { sections: [] }), ...Object.fromEntries(Object.entries(change.variants ?? {}).filter(([part, id]) => part !== 'sections' && (settings.variants?.[part] ?? []).includes(String(id)))) } as MasterVariants;
  // Chunky colour titles (spec 2026-11-03): the theme block carries the chosen title style's font.
  const theme = masterThemeCss(settings, look, String((variants as Record<string, unknown>).titles ?? ''));
  // Dropdown menu spec 2026-10-21: a menu change sets the record; a fashion store without one gets the panel.
  const menuIds = settings.variants?.menu ?? [];
  if (menuIds.length) {
    if (change.menu && menuIds.includes(change.menu.style)) variants.menu = change.menu.style;
    // Only a fashion store from before the menu (no record) gets the default: an explicit «none» is the merchant's removal.
    else if (!change.menu && variants.cards === 'fashion' && variants.menu === undefined) variants.menu = 'panel';
  }
  // A style already in config.js (rolled, or asked for in chat) stays unless this change names one (final review 2026-10-21).
  // John Smedley sections (spec 2026-10-21): sections a change names (one id, a comma list or a list) are built; an older store
  // with no record gets its roll, seeded by its slug; otherwise the built sections stay as they are.
  let features = state.features ?? {};
  const featureIds = (settings.variants?.feature ?? []) as readonly string[];
  if (featureIds.length) {
    const asked = (change.variants as Record<string, unknown> | undefined)?.feature;
    const named = asked === undefined ? undefined : (Array.isArray(asked) ? asked : String(asked).split(',')).map(id => String(id).trim()).filter(id => featureIds.includes(id));
    // A words-only change rebuilds the rolled sections with the new words over the ones they had (final review 2026-10-21).
    if (named || variants.feature === undefined || change.featureCopy) {
      const config = readConfigFile(files);
      const facts = featureFacts(config.data ?? {}, photos, state.store?.city ?? '');
      const fashion = variants.cards === 'fashion';
      const ids = named ?? (variants.feature !== undefined ? String(variants.feature).split(',').filter(Boolean)
        : rollFeatures({ seed: String(config.slug || state.store?.name || ''), eligible: eligibleFeatures(facts, fashion), fashion, exclude: [] }));
      variants.feature = ids.join(',');
      const words = { ...(((state.features ?? {}) as { copy?: object }).copy ?? {}), ...(change.featureCopy ?? {}) };
      features = buildFeatures(ids, facts, words, { productsTitle: copy.productsTitle, storyTitle: copy.storyTitle, subcopy: copy.subcopy });
    }
  }
  // Sort & filter styles spec 2026-10-21: a fashion store from before the filters part gets the John Smedley chip rows.
  if ((settings.variants?.filters ?? []).includes('chips') && variants.filters === undefined && variants.cards === 'fashion') variants.filters = 'chips';
  const out = withFashionTemplateParts(files.map(file => {
    if (file.path === TEMPLATE_STORE_DATA_PATH) return templateStoreDataFile(state.store ?? { name: '' }, photos, { copy, look, variants, sections: change.sections ?? state.sections ?? [], features, layout: change.layout ?? state.layout ?? [], productLayout: change.productLayout ?? state.productLayout ?? [], pageLayouts: change.pageLayouts ?? state.pageLayouts ?? {}, extraPages: change.extraPages ?? state.extraPages ?? [] });
    // Owner 2026-11-02 (DooBoo): the accent as words on the page reads even when the brand's accent is pale.
    if (file.path === 'styles/globals.css') return { ...file, content: readableAccentText(themed ? bindThemeAccent(withMasterTheme(withCurrentThemeBlock(file.content, themeId), theme), themeId, themed) : withMasterTheme(file.content, theme)) };
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
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...rest, ...(style ? { productPageStyle: style } : {}), ...(change.variants?.filters || !isFilterStyle(rest.filterStyle) ? masterFilterStyle(variants) : {}), ...withHeader, dna: { ...config.dna, ...masterDnaFonts(settings, look), ...masterDnaLook({ ...(state.variants ?? {}), ...(change.variants ?? {}) }), ...Object.fromEntries(Object.entries(change.dna ?? {}).filter(([name, value]) => SOURCE_DNA_RUNTIME_ENUMS[name]?.includes(value))) }, showcase: { ...(config.showcase ?? {}), ...masterShowcase(variants) } })};\n` };
    }
    return file;
  }), variants);
  const pages = withFeatureSlots(withCurrentVariantCss(withCurrentSectionCss(withEsencialCatalogPages(out)), frameChoices(variants as Record<string, unknown>, (change.layout ?? state.layout ?? []) as { type?: unknown; card?: unknown }[])));
  return variants.menu && variants.menu !== 'none' ? withStoreMenuMounts(pages) : pages;
}

export function templateDemoAssets(manifest: TemplateManifest, demoSlots: readonly string[]): SourceProjectFileDto[] {
  return demoSlots.flatMap(slot => {
    const photo = templateDemoPhoto(manifest.photoSource ?? manifest.id, slot);
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
  /** Starters (spec 2026-10-24): the starter a master-based store was built from, named in its label and brief. */
  starter?: { id: string; name: string };
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
  /** YAPI plan card (spec 2026-10-22): kit surfaces the plan pins (card swatches…); values the kit does not know are dropped. */
  dna?: Record<string, string>;
}): Promise<{ label: string; brief: SourceProjectBriefDto; files: SourceProjectFileDto[] }> {
  const { manifest } = input;
  const data = sourceStoreConfigData(input.publicStore, input.apiUrl, input.firstRevision);
  const settings = manifest.master;
  const filled = fillTemplatePhotos(manifest, data.items, input.demoPhotos !== false);
  const photos: Record<string, string> = sameAsBundled({ ...filled.photos,
    ...(settings && input.fill?.heroPhoto !== undefined ? { hero: masterPhotoUrl(input.fill.heroPhoto, input.apiUrl) } : {}),
    ...(settings && input.fill?.storyPhoto !== undefined ? { story: masterPhotoUrl(input.fill.storyPhoto, input.apiUrl) } : {}),
    // Owner 2026-10-25: a video the merchant attached plays as the cover, its photo the poster.
    ...(settings && input.fill?.heroVideo ? { heroVideo: masterPhotoUrl(input.fill.heroVideo, input.apiUrl) } : {}),
    ...(settings ? Object.fromEntries((input.fill?.brandPhotos ?? []).slice(0, 6).map((url, index) => [`b${index + 1}`, masterPhotoUrl(url, input.apiUrl)])) : {}) }, input.fill?.photoSources);
  const demoSlots = filled.demoSlots.filter(slot => photos[slot] === templateDemoPath(manifest, slot));
  const copy = settings ? masterCopy(settings, input.fill?.copy) : undefined;
  const look = settings ? masterLook(settings, input.fill?.look) : undefined;
  const city = (data.locations as Array<{ city?: string | null }> | undefined)?.[0]?.city ?? '';
  // John Smedley sections (spec 2026-10-21): rolled here, where the store's photos are known, unless the dice already did.
  let builtVariants = input.variants ?? (input.fill?.variants as MasterVariants | undefined);
  // Owner 2026-10-29 («full picture hero»): a first build that has a cover or story photo never shows the words-only cover or story
  // (the plan card chose both for NOA although it had the photos).
  if (input.firstRevision && builtVariants) {
    if (builtVariants.hero === 'type' && photos.hero) builtVariants = Object.assign({}, builtVariants, { hero: 'full' });
    if (builtVariants.story === 'note' && photos.story) builtVariants = Object.assign({}, builtVariants, { story: 'split' });
  }
  let features: Record<string, unknown> = {};
  if (settings && builtVariants && (settings.variants?.feature ?? []).length) {
    const facts = featureFacts(data, photos, city);
    const fashion = input.fill?.character?.kind === 'fashion' || builtVariants.cards === 'fashion';
    const eligible = eligibleFeatures(facts, fashion);
    let ids = typeof builtVariants.feature === 'string' ? builtVariants.feature.split(',').filter(Boolean)
      : rollFeatures({ seed: input.storeId, eligible, fashion, exclude: input.fill?.character?.exclude ?? [] });
    // Owner 2026-10-29 («picture | picture»): a first build gets the duo whenever it has two spare photos, whoever chose the list.
    if (input.firstRevision && eligible.includes('duo') && !ids.includes('duo')) ids = ['duo', ...ids];
    builtVariants = Object.assign({}, builtVariants, { feature: ids.join(',') });
    features = buildFeatures(ids, facts, input.fill?.featureCopy ?? {}, { productsTitle: copy!.productsTitle, storyTitle: copy!.storyTitle, subcopy: copy!.subcopy });
  }
  const storeData = templateStoreDataFile({ name: data.storeName, tagline: data.tagline ?? '', city,
    // An uploaded logo as the full API URL, like the photos: the store is served from another origin (Remolino 2026-10-21).
    logo: masterPhotoUrl(data.logoUrl, input.apiUrl), phone: data.contactPhone ?? '' }, photos, settings ? { copy: copy!, look: look!, variants: builtVariants, sections: input.sections ?? input.fill?.sections, features, layout: input.fill?.layout ?? [], productLayout: input.fill?.productLayout ?? [] } : undefined, manifest.copy ? { ...plantillaDefaults(manifest), ...(input.plantillaCopy ?? {}) } : undefined);
  const themed = (file: SourceProjectFileDto) => settings && file.path === 'styles/globals.css' ? { ...file, content: withOnlyTheme(withMasterTheme(file.content, masterThemeCss(settings, look!, String((builtVariants as Record<string, unknown> | undefined)?.titles ?? ''))), String((builtVariants as Record<string, unknown> | undefined)?.theme ?? ''),
    new Set([...(input.fill?.layout ?? []), ...(input.fill?.productLayout ?? [])].map(block => String((block as { type?: string }).type))),
    // Template frame variety (2026-11-03): only the footer, button, card and product page this store uses.
    frameChoices((builtVariants ?? {}) as Record<string, unknown>, (input.fill?.layout ?? []) as { type?: unknown; card?: unknown }[])) } : file;
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
    ...sourceCommerceRoutes([...authored, ...scaffold, ...kitFiles], {}), dna: { ...templateDna(manifest, input.storeId), ...(settings ? { ...masterDnaFonts(settings, look!), ...masterDnaLook(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {}),
      ...Object.fromEntries(Object.entries(input.dna ?? {}).filter(([name, value]) => SOURCE_DNA_RUNTIME_ENUMS[name]?.includes(value))) },
    ...(settings ? { showcase: masterShowcase(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {}),
    ...(settings ? masterProductStyle(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) : {}),
    ...(settings ? masterFilterStyle(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) : {}),
    ...(menu ? { header: { menu } } : {}),
    // Owner 2026-10-27: the sign-in pages show the store's own photo beside the form; Esencial's CSS gives them its look.
    ...(settings ? { accountTheme: { layout: 'split', ...(photos.story || photos.hero ? { photo: photos.story || photos.hero } : {}) } } : {}),
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
  // Starters (spec 2026-10-24): a store started from a finished store is named by its style.
  const starter = input.starter ?? (manifest.starter && manifest.id !== 'esencial' ? { id: manifest.id, name: manifest.name } : undefined);
  return { label: `${starter ? `Estilo: ${starter.name}` : `Plantilla: ${manifest.name}`}`.slice(0, 120), brief: starter ? { ...brief, starterId: starter.id } : brief, files };
}

/** The demo store Plantillas are checked and previewed with: four products (so every photo slot shows the template's
 * demo photo), BOB prices, no branches (a branch without a delivery method would stop the simulated checkout). */
export function templateDemoPublicStore(demo?: TemplateDemo): SourcePublicStore {
  const product = (id: string, name: string, amount: number, description: string, categoryId?: string) => ({ id, name, amount, currency: 'BOB', stock: 12, description, imageUrls: [], variants: [], extras: [], highlights: [], ...(categoryId ? { categoryId } : {}) });
  // Owner 2026-10-31 («repetitivo»): a template with its own demo shop shows it — its name, its categories, products of its industry —
  // instead of the same «Tu marca» and «Producto estrella» on every preview.
  if (demo?.products?.length) {
    const names = [...new Set(demo.products.map(item => item.category).filter((name): name is string => Boolean(name)))];
    const categories = names.map((name, at) => ({ id: `demo-cat-${at + 1}`, name, sortOrder: at }));
    return ({ ...(templateDemoPublicStore() as unknown as Record<string, unknown>), storeName: demo.storeName, tagline: demo.tagline ?? '', categories,
      items: demo.products.slice(0, 8).map((item, at) => product(`demo-${at + 1}`, item.name, Math.round(item.price * 100), item.description ?? '', item.category ? `demo-cat-${names.indexOf(item.category) + 1}` : undefined)) }) as unknown as SourcePublicStore;
  }
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
type TemplateDemo = NonNullable<NonNullable<TemplateManifest['preset']>['demo']>;
export async function templateDemoRevision(manifest: TemplateManifest, source: SourceProjectFileDto[], fill?: MasterFill, demo?: TemplateDemo) {
  const assembled = await assembleTemplateRevision({ manifest, source, storeId: `template-${manifest.id}`, slug: manifest.id, publicStore: templateDemoPublicStore(demo), apiUrl: new URL('https://api.pagosya.test/v1'), checkoutOrigin: 'https://pagar.pagosya.test', firstRevision: true, fill });
  const productPhotos = manifest.photos.filter(photo => photo.role === 'product' && photo.demo).map(photo => templateDemoPath(manifest, photo.slot));
  const files = assembled.files.map(file => {
    if (file.path !== 'config.js' || !productPhotos.length) return file;
    const config = JSON.parse(file.content.match(/^window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    config.data.items = config.data.items.map((item: { imageUrls: string[] }, index: number) => ({ ...item, imageUrls: [productPhotos[index % productPhotos.length]] }));
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` };
  });
  return { ...assembled, files };
}
