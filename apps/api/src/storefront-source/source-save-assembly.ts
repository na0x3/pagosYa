import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { patchConfigFile, type StoreLook } from './store-look';
import { applyProductThemeToDesign, productThemeRuntime, resolveProductTheme, sanitizeProductAssurances } from './product-theme';
import { sourceDesignAfterSectionEdit } from './source-edit-scope';
import { buildSourceVisualSystem, sourceProductPageStyle, SOURCE_VISUAL_SYSTEM_FILE, withSourceStyleTokens } from './source-visual-system';
import { sourceAssetInventory, withSourceAssets } from './source-asset-library';
import { designBrandCss, parseFrameDraw, storePhotoPaths } from './design-engine/frame-draw';
import { brandHasColours, brandStyles, linkBrandStylesheet } from '../brand/brand-profile';
import { nextContentPages, nextProjectScaffold } from './source-next';
import { sketchKitDna, sketchProductTheme } from './sketch';
import { SOURCE_PRODUCT_PAGE_STYLES, sourceRuntimeDna } from './source-dna';
import { commerceConfig } from './source-commerce-config';
import { carriedTouch } from './kit-touch';
import { sourceMotifConfig, sourceMotifPaths } from './source-motifs';
import { normalizeAccountTheme } from './account-theme';
import { chosenMotifPack } from './source-motif-packs';
import { mergeAgentPolicies } from './source-agent-policies';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { withSourceMotion } from './source-motion';
import { withSourceCommerceDesign } from './source-commerce-design';
import { withSourceFonts } from './source-fonts';
import { SOURCE_DESIGN_FILE, type SourceDesign } from './source-design';
import { measureStoreLook, withMeasuredLook } from './store-look-measure';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';
import { voiceFile, voiceForSave, VOICE_FILE } from './store-voice';

/** The DNA motifs a design's selected concept declares. */
export const designMotifs = (value?: SourceDesign | null) => value?.concepts[value.selected]?.dna?.motifs ?? [];

/** `reuse`: a look already measured on this same home (the touch base), written as is without measuring again;
 *  `fallback`: the look to keep when measuring fails (the review stage's revision N), instead of the previous
 *  revision's. A new store or a redesign never falls back to the previous revision's look: its design is new. */
export type LookChoice = { reuse?: { look: StoreLook | undefined }; fallback?: StoreLook };

export type SaveAssemblyContext = {
  facts: Pick<GenerationRunFacts, 'prisma' | 'config' | 'logger' | 'storeId' | 'runId' | 'slug' | 'dto' | 'brand' | 'apiUrl' | 'data' | 'assets' | 'retainedAssets' | 'assetLegend' | 'imageUses' | 'photoFacts' | 'fontPaths' | 'previous' | 'previousFiles' | 'previousDesign' | 'previousScene' | 'sectionScope' | 'sitePurpose' | 'scrollFeel' | 'motion' | 'primaryAction' | 'creative' | 'useNext' | 'signal' | 'voice'>;
  live: Pick<GenerationLive, 'generated' | 'agentTheme' | 'visualSystem' | 'frame' | 'compiledNext' | 'sketchFile' | 'websiteDesignFile' | 'kitTouch' | 'motifFiles' | 'agentAccountTheme' | 'agentMotifPack' | 'agentPolicies'>;
  /** generate()'s platformHeader: draws the platform header on every static page and logs its notes once per run. */
  platformHeader: (files: SourceProjectFileDto[], platformPages: string[]) => SourceProjectFileDto[];
  /** YAPI rewrote at least one store policy this run (computed once after the engine branch). */
  agentPolicyChange: boolean;
};

/** Everything a save carries besides the model's authored files: kit files, assets, design and visual-system files,
 *  config.js. Built from `live.generated` as it is when called: once for revision N, and again by the background review. */
export async function assembleSourceSave(context: SaveAssemblyContext, assembleSignal: AbortSignal = context.facts.signal, lookChoice: LookChoice = {}) {
  const { facts, live, platformHeader, agentPolicyChange } = context;
  // Run constants only. `live` is read through on purpose; see GenerationLive. The ConfigService is `appConfig` here:
  // the body builds its own `config` (the store's config.js object).
  const { prisma, config: appConfig, logger, storeId, runId, slug, dto, brand, apiUrl, data, assets, retainedAssets, assetLegend, imageUses, photoFacts, fontPaths, previous, previousFiles, previousDesign, previousScene, sectionScope, sitePurpose, scrollFeel, motion, primaryAction, creative, useNext } = facts;
  const acceptedDesign = applyProductThemeToDesign(sourceDesignAfterSectionEdit(live.generated.design || previousDesign || undefined, live.generated.files, sectionScope), live.agentTheme);
  // A local copy: the review stage assembles twice (the touch reads a base, then the final save), and brand.css, the Next scaffold and the brand link must not pile up on `generated`.
  let files = [...live.generated.files];
  if (sectionScope) live.visualSystem = buildSourceVisualSystem(motion, sourceAssetInventory([...previousFiles, ...assets]), acceptedDesign);
  // Carry forward previously bundled assets on an edit, without carrying old private configuration.
  const previousAssets = retainedAssets;
  const assetPaths = new Set(assets.map((f) => f.path));
  assets.push(...previousAssets.filter((f) => !assetPaths.has(f.path)));
  const previousBrand = (previous?.snapshot as any)?.files?.find((file: SourceProjectFileDto) => file.path === 'brand.css');
  // Confirmed brand colours win; otherwise a fresh design's drawn colour world becomes the brand tokens.
  // The rule lives in designBrandCss (tested): confirmed colours, else the drawn world, never a stale drawn block.
  const tokenCss = designBrandCss({ palette: live.frame.palette, brandColours: brandHasColours(brand?.data), confirmedCss: brand && brand.revision > 0 ? brandStyles(brand.data, fontPaths) : '', brandRevision: brand?.revision ?? 0, previousBrand: previousBrand?.content });
  if (useNext) files.push(...live.compiledNext, ...nextProjectScaffold(slug, nextContentPages(files, sitePurpose)));
  if (tokenCss) {
    files = files.map(file => file.path.endsWith('.html') ? { ...file, content: linkBrandStylesheet(file.content, file.path) } : file);
    files.push({ path: 'brand.css', content: tokenCss });
  }
  if (useNext && !tokenCss) files.push({ path: 'brand.css', content: '/* No confirmed brand tokens. */' });
  const useCommercePages = sitePurpose === 'shop' && (useNext || !previous || files.some(file => file.path === "product.html") && files.some(file => file.path === "checkout.html"));
  // commerce-pages.css is platform CSS (never authored), so like commerce.js every save takes the kit's current copy:
  // kept from the first build, kit fixes never reached existing stores (2026-10-12, the checkout row fix).
  const refreshPagesCss = useCommercePages || useNext || files.some(file => file.path === "commerce-pages.css");
  if (refreshPagesCss) files = files.filter(file => file.path !== "commerce-pages.css");
  const kitFiles = await Promise.all(["build.mjs", "server.mjs", "commerce.js", ...(refreshPagesCss ? ["commerce-pages.css"] : []), ...(useCommercePages ? ["product.html", "checkout.html", "productos.html", "coleccion.html"] : []).filter(path => !files.some(file => file.path === path))].map(async (path) => ({ path, content: (await readFile(kitPath(path), "utf8")).replace(/<head>/i, tokenCss ? '<head>\n<link rel="stylesheet" href="brand.css">' : '<head>') })));
  const previousConfigFile = (previous?.snapshot as any)?.files?.find((f: SourceProjectFileDto) => f.path === 'config.js');
  const previousConfigMatch = previousConfigFile?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  const previousConfig = previousConfigMatch ? JSON.parse(previousConfigMatch[1]) : {};
  let productPageStyle = sourceProductPageStyle(live.visualSystem, previousConfig);
  // Every store carries a DNA: the chosen concept's, else one seeded by the store id (stable, differs per store).
  // The agent's theme also wins over a store that has no saved design (its DNA is seeded), so it always reaches the runtime.
  // A sketch-born save instead carries the sketch's chosen product skin and composition (sketch.product, model-picked by sector).
  let sketchTheme: Record<string, string | number> | null = null;
  let sketchAssurances: ReturnType<typeof sanitizeProductAssurances>['items'] = [];
  if (!live.agentTheme && live.sketchFile) {
    try {
      const parsedSketch = JSON.parse(live.sketchFile.content);
      sketchTheme = { ...productThemeRuntime((await resolveProductTheme(sketchProductTheme(parsedSketch.product))).dna), ...sketchKitDna(parsedSketch) };
      if (SOURCE_PRODUCT_PAGE_STYLES.includes(parsedSketch.product?.layout)) productPageStyle = parsedSketch.product.layout;
      sketchAssurances = sanitizeProductAssurances(parsedSketch.product?.assurances).items;
    } catch { /* a malformed sketch keeps the seeded DNA */ }
  }
  // A sketch-born store has no design concept: without this, any later chat edit would re-seed the
  // DNA and silently strip the skin, button form, card behaviour and motion its boceto chose.
  const conceptDna = acceptedDesign?.concepts[acceptedDesign.selected]?.dna;
  const KEPT_DNA = ['swatch', 'gallery', 'blocks', 'divider', 'enter', 'media', 'productCss', 'button', 'card', 'cart', 'review', 'motion', 'hover', 'press', 'added', 'checkout', 'fields'];
  const carriedDna = !live.agentTheme && !sketchTheme && !conceptDna && previousConfig.dna && typeof previousConfig.dna === 'object'
    ? Object.fromEntries(KEPT_DNA.filter(key => previousConfig.dna[key] !== undefined).map(key => [key, previousConfig.dna[key]])) : {};
  // The picked card's account, checkout, fields and cart path (spec 2026-10-11 commerce surfaces); nothing without a draw.
  const keptCheckoutPhoto = typeof previousConfig.checkoutPhoto === 'string' && assets.some(file => file.path === previousConfig.checkoutPhoto) ? previousConfig.checkoutPhoto : undefined;
  const drawnCommerce = commerceConfig({ commerce: live.frame.commerce, photos: storePhotoPaths({ assetLegend, imageUses, logoUrl: (data as { logoUrl?: string | null }).logoUrl }), keptPhoto: keptCheckoutPhoto });
  const dna = { ...sourceRuntimeDna(conceptDna, storeId, productPageStyle), ...carriedDna, ...carriedTouch(previousConfig.dna, creative), ...(live.agentTheme ? productThemeRuntime(live.agentTheme) : sketchTheme ?? {}), ...(live.frame.dna ?? {}), ...drawnCommerce.dna, ...(live.kitTouch && Object.keys(live.kitTouch).length ? { ...live.kitTouch, touch: 1 } : {}) };
  // Only the accepted design's motifs are kept; a store without any gets no files and no config key.
  const acceptedMotifPaths = sourceMotifPaths(designMotifs(acceptedDesign));
  const acceptedMotifFiles = live.motifFiles.filter(file => acceptedMotifPaths.includes(file.path));
  const runtimeMotifs = sourceMotifConfig(designMotifs(acceptedDesign), acceptedMotifFiles);
  // The account pages' theme (spec 2026-10-08): what YAPI set this run, otherwise what the store already had.
  // A freshly drawn account layout wins over the saved one; a kept draw leaves the saved theme (and its CSS) as it is.
  const accountTheme = live.agentAccountTheme ?? drawnCommerce.accountTheme ?? normalizeAccountTheme(previousConfig.accountTheme);
  // The store-wide motif pack: YAPI's choice this run (null removes it), otherwise the one the store had.
  const motifPack = chosenMotifPack(live.agentMotifPack, previousConfig.motifPack);
  if (agentPolicyChange) data.policies = mergeAgentPolicies((await prisma.store.findUnique({ where: { id: storeId }, select: { policies: true } }))?.policies, live.agentPolicies);
  // Store voice (spec 2026-10-14): voice.json beside frame-draw.json. A YAPI save drops pending facts no page carries any more and
  // moves confirmed ones to the specifics; a run without a sheet (always, with the flag off) carries the store's own file as is.
  const sheet = facts.voice.sheet;
  const voiceToSave = sheet ? voiceForSave(sheet, files) : undefined;
  const carriedVoice = voiceToSave ? undefined : previousFiles.find(file => file.path === VOICE_FILE);
  const config = { ...sourceCommerceRoutes([...files, ...kitFiles], previousConfig), ...(productPageStyle ? { productPageStyle } : {}), ...(sketchAssurances.length ? { productAssurances: sketchAssurances }
    // The agent replaces ([] clears) or, untouched, the store's saved lines carry over like its theme.
    : live.agentTheme?.assurances !== undefined ? (live.agentTheme.assurances.length ? { productAssurances: live.agentTheme.assurances } : {})
    : Array.isArray(previousConfig.productAssurances) && previousConfig.productAssurances.length ? { productAssurances: previousConfig.productAssurances } : {}), dna, ...(accountTheme ? { accountTheme } : {}), ...(drawnCommerce.checkoutPhoto ? { checkoutPhoto: drawnCommerce.checkoutPhoto } : {}), ...(drawnCommerce.cartWord ? { cartWord: drawnCommerce.cartWord } : {}), ...(motifPack ? { motifPack } : {}), ...(runtimeMotifs.length ? { motifs: runtimeMotifs } : {}), ...(useNext && sitePurpose === 'shop' ? { productPage: 'product.html', checkoutPage: 'checkout.html' } : {}), ...(primaryAction ? { primaryAction } : {}), sitePurpose, scrollFeel, demo: false, slug: slug, apiBaseUrl: apiUrl.href.replace(/\/$/, ""), checkoutOrigin: appConfig.get<string>("app.checkoutOrigin"), data };
  const assembled = { revision: dto.revision, label: live.generated.label, brief: dto.brief, files: await withSourceMotion(platformHeader(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
    ...files, ...kitFiles, ...assets, ...acceptedMotifFiles,
    ...(acceptedDesign ? [{ path: SOURCE_DESIGN_FILE, content: JSON.stringify(acceptedDesign, null, 2) + '\n' }] : []),
    ...(live.sketchFile ? [live.sketchFile] : []),
    ...(live.websiteDesignFile ? [live.websiteDesignFile] : []),
    ...(live.frame.file ? [live.frame.file] : []),
    ...(voiceToSave ? [voiceFile(voiceToSave)] : carriedVoice ? [carriedVoice] : []),
    { path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify(withSourceStyleTokens(live.visualSystem, files, previousScene), null, 2) + '\n' },
    { path: "config.js", content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
    ...(!useNext ? [{ path: "package.json", content: JSON.stringify({ name: `storefront-${slug}`, version: "1.0.0", private: true, type: "module", scripts: { build: "node build.mjs", start: "node server.mjs" } }, null, 2) },
    { path: "README.md", content: `# ${data.storeName}\n\nStandalone browser source. Run npm run build, then npm start (Node 20+). Deploy dist/ to a static host. No install needed.\n\nEdit index.html, styles.css and site.js freely. config.js contains public API configuration and the initial catalog snapshot. The live catalog refreshes before ordering. Configure the deployed origin in PagosYa CORS.\n\nThe bundled build script copies files and checks classic JavaScript syntax; it does not execute storefront scripts. Preview code only in an isolated browser. Source checks are not a security review.\n\nOrders, payments, stock and customer data depend on the PagosYa API and are not included. Selected uploaded assets are bundled; other product image URLs may still depend on the API. Export includes the per-file manifest.\n` }] : []),
  ], previousFiles, assetLegend, imageUses, photoFacts))), []), motion) };
  // One look per store (spec 2026-10-14): read the final home page and keep it as config.look for the kit pages.
  if (lookChoice.reuse) {
    const { look } = lookChoice.reuse;
    return look ? { ...assembled, files: patchConfigFile(assembled.files, current => ({ ...current, look })) } : assembled;
  }
  const fallbackLook = 'fallback' in lookChoice ? lookChoice.fallback : creative ? undefined : previousConfig.look;
  const measured = await withMeasuredLook(assembled, { enabled: appConfig.get<boolean>('app.yapiLookMeasure') === true, declaredTreatment: parseFrameDraw(live.frame.file?.content).photos, previousLook: fallbackLook, brief: dto.brief, signal: assembleSignal, measure: measureStoreLook });
  logger.log(JSON.stringify({ event: measured.outcome === 'measured' ? 'look_measured' : 'look_kept', generationId: runId, outcome: measured.outcome, ...(measured.reason ? { reason: measured.reason } : {}) }));
  return measured.input;
}
