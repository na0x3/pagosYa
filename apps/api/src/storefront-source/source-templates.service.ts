import { Prisma } from '@prisma/client';
import { homeSummary, type HomeSummary } from './source-composer';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { UploadsService } from '../uploads/uploads.service';
import { ProductPageWriterService } from '../product-content/product-page-writer.service';
import { BrandProfileService } from '../brand/brand-profile.service';
import { deepFromAccent, paletteFromNamed, proposeStorePalette, type SourcePalette } from './source-palette';
import { coverForPhoto, photoFitVariants, readPhotoFit, styleForCharacter } from './source-photo-fit';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { BUNDLED_PHOTO, bundledPhotoPath, uploadPath } from './source-product-photos';
import { ConfigService } from '@nestjs/config';
import * as registry from '@pagosya/store-templates';
import { PrismaService } from '../prisma/prisma.service';
import { PublicStoresService } from '../stores/public-stores.service';
import { SourceProjectsService } from './source-projects.service';
import type { SourceProjectSnapshot } from './source-project';
import { drawPresetChoices } from './source-preset-choices';
import { assembleTemplateRevision, readMasterState, refillMasterFiles, refillPlantillaFiles, resolvePresetTemplate, starterBrandBlock, templateDemoRevision, TEMPLATE_STORE_DATA_PATH, withPreset, type StarterBrandColours } from './source-templates';
import { plantillaFallback, plantillaFillFromRead } from './source-plantilla-fill';
import { MASTER_COPY_CAPS, MASTER_TEMPLATE_ID, accentInk, paletteForBrand, type MasterFill, type MasterVariants } from './source-master';
import { titleColours } from './source-title-style';
import { distinctPhotoCount, esencialDiceSettings, FASHION_PARTS, menuVariant, rollStarterDice, rollVariants, type RecentRoll } from './source-master-dice';
import { carriesColourPhotos } from './source-filter-style';
import { goodsIcon } from './source-goods-icon';
import { palettesForPhoto, photoTone } from './source-starter-palette';
import { DEFAULT_RETENTION } from '../retention/retention.dto';

/** What the master template's filler is told about a store (spec 2026-10-19 §2.3). */
export type MasterFacts = { storeName: string; products: string[]; photos: string[];
  /** Dropdown menu spec 2026-10-21: categories that have products; the dice give a menu only from two. */
  categoryCount: number;
  /** What the menu may link: categories with products and the info pages (no home sections: the home is not built yet). */
  menuTargets?: Array<{ target: string; label: string }>; brand?: { voice?: string; headlineExamples?: string; avoid?: string } };
/** What a Plantilla's filler is told (spec 2026-10-20 §4): the store as the apply reads it, and the template's slots. */
export type PlantillaFacts = { storeName: string; tagline: string; products: string[]; photos: string[]; slots: NonNullable<registry.TemplateManifest['copy']> };
const HEX = /^#[0-9a-f]{6}$/i;
import { sourcePublicApiUrl, sourceStoreConfigData, withLiveCatalog } from './source-store-config';
import { storeMenuContext, storeMenuTargetList } from './source-store-menu';

/** Plantillas: apply a designer-made store as the next revision (free, no AI call). */
/** YAPI plan card (spec 2026-10-22): what a checked plan pins on a master store. */
export type AppliedPlan = { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accent?: string; dna: Record<string, string> };

/** Owner 2026-10-31: built from Shrine Pro (not a Shopify theme-store theme); behind YAPI_SHRINE_TEMPLATES. */
const SHRINE_TEMPLATES = new Set(['shrine', 'shrine2']);

@Injectable()
export class SourceTemplatesService {
  /** The template registry; replaceable in tests. */
  registry: Pick<typeof registry, 'galleryTemplates' | 'templateManifest' | 'templateSourceFiles'> = registry;

  constructor(private readonly prisma: PrismaService, private readonly publicStores: PublicStoresService, private readonly projects: SourceProjectsService, private readonly config: ConfigService, @Optional() private readonly uploads?: UploadsService, @Optional() private readonly pageWriter?: ProductPageWriterService, @Optional() private readonly brands?: BrandProfileService) {}

  /** A store's first build: payments on, and (owner 2026-10-24, «make stores fuller … bot, email form on footer») the footer
   *  newsletter signup — the popup only on leaving the page, never on arrival — and the store bot. A merchant's own settings stay. */
  private async firstBuild(storeId: string) {
    await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    await this.prisma.storeRetention?.upsert({ where: { storeId }, update: {}, create: { storeId, settings: { ...DEFAULT_RETENTION, signupEnabled: true, popupTrigger: 'exit' } } }).catch(() => undefined);
    if (this.config.get<boolean>('app.assistant.enabled') === true) await this.prisma.storeAssistant?.upsert({ where: { storeId }, create: { storeId, enabled: true }, update: {} }).catch(() => undefined);
  }

  /** The logo's colours as a palette (variety spec §4); replaceable in tests. */
  /** Owner 2026-10-28: the palette of the store's own product photos (up to 8 it owns), for a store with no logo; replaceable in tests. */
  photosPalette = async (merchantId: string, urls: readonly string[]): Promise<SourcePalette | undefined> => {
    if (!this.uploads) return undefined;
    const paths = [...new Set(urls.map(url => uploadPath(url)).filter(path => /^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(path)))].slice(0, 8);
    if (!paths.length) return undefined;
    const owned = new Set((await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: paths } }, select: { url: true } })).map(asset => asset.url));
    const photos = (await Promise.all(paths.filter(path => owned.has(path)).map(async path => {
      const bytes = await this.uploads!.getBuffer(path.split('/').at(-1)!).catch(() => null);
      return bytes ? { url: path, path, bytes } : null;
    }))).filter((photo): photo is { url: string; path: string; bytes: Buffer } => Boolean(photo));
    return photos.length ? proposeStorePalette({ photos }).catch(() => undefined) : undefined;
  };

  logoPalette = async (merchantId: string, url: string): Promise<SourcePalette | undefined> => {
    const path = uploadPath(url);
    const match = /^\/v1\/uploads\/([a-f0-9-]+\.(png|jpe?g|webp))$/i.exec(path);
    if (!match || !this.uploads) return undefined;
    const owned = (await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [path] } }, select: { url: true } })).length > 0;
    const bytes = owned ? await this.uploads.getBuffer(match[1]).catch(() => null) : null;
    return bytes ? proposeStorePalette({ logo: { url: path, path, bytes } }).catch(() => undefined) : undefined;
  };

  list(curatedOnly = false) {
    // Owner 2026-10-31: the Shrine Pro templates stay built but hidden until YAPI_SHRINE_TEMPLATES=1 (the owner decides later).
    const shrine = this.config.get<boolean>('app.yapiShrineTemplates') === true;
    return this.registry.galleryTemplates().filter(manifest => shrine || !SHRINE_TEMPLATES.has(manifest.id))
      .filter(manifest => !curatedOnly || (manifest.curated === true && (Boolean(manifest.copy?.length) || Boolean(manifest.preset))))
      .map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }

  /** The pieces `apply` saves and `preview` shows: the template filled with this store's name, products and photos. */
  private async assemble(merchantId: string, storeId: string, templateId: string, expectedRevision?: number, fill?: MasterFill, extraFiles?: SourceProjectFileDto[], variants?: MasterVariants, plantillaCopy?: Record<string, string>, dna?: Record<string, string>,
    starterRoll?: { variants: Partial<MasterVariants>; palette?: string; fonts?: string }) {
    const listed = this.registry.templateManifest(templateId);
    if (!listed) throw new NotFoundException('Esa plantilla no existe.');
    // Spec 2026-11-10 Merienda: a style with choices gets this store's own font, parts and section looks (same store, same draw).
    const chosen = listed.preset?.choices ? { ...listed, preset: drawPresetChoices(listed.preset, storeId) } : listed;
    // Plantillas presets (2026-10-22): a preset is saved as its master (Esencial) with the preset's look and starting words,
    // so every master path (refill, chat edits, menus, sections) keeps working on the store.
    const { manifest, preset, sourceId } = resolvePresetTemplate(chosen, id => this.registry.templateManifest(id));
    if (preset) {
      // Owner 2026-10-29 («most lack … brand colors»): presets are picked for the merchant now, not chosen, so they keep the brand's colours too.
      fill = withPreset(preset, fill, true);
      variants = variants ? { ...variants, ...preset.variants } as MasterVariants : preset.variants as MasterVariants;
      // Starter dice (spec 2026-10-24-starter-dice): the roll goes over the starter's preset; the preset keeps every other part,
      // and the brand colours (look.colors) stay as withPreset left them.
      if (starterRoll) {
        variants = { ...variants, ...starterRoll.variants } as MasterVariants;
        fill = { ...fill, look: { ...(fill.look ?? {}), ...(starterRoll.palette ? { palette: starterRoll.palette } : {}), ...(starterRoll.fonts ? { fonts: starterRoll.fonts } : {}) } };
      }
    }
    const current = await this.projects.current(merchantId, storeId);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ConflictException('El proyecto cambió. Recarga antes de aplicar la plantilla.');
    const previous = current.revision ? await this.projects.version(merchantId, storeId, current.revision) : null;
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    // Owner 2026-11-02 («all stores have the same menu, not dropdown»): the 34 themed templates set no menu, so every template store
    // had the plain header links. The merchant's ask wins; a store with two or more categories gets dropdowns (the kit fills them
    // from its categories and pages), a smaller one the side panel.
    if (preset?.layout?.length && variants && !variants.menu) {
      const asked = fill?.menu?.style;
      const categories = [...storeMenuContext(sourceStoreConfigData(publicStore, sourcePublicApiUrl(this.config), false), []).targets.keys()].filter(key => key.startsWith('category:')).length;
      if (asked !== 'none') variants = Object.assign({}, variants, { menu: asked === 'panel' || asked === 'dropdowns' ? asked : categories >= 2 ? 'dropdowns' : 'panel' });
    }
    const assembled = await assembleTemplateRevision({
      manifest, source: this.registry.templateSourceFiles(sourceId), storeId,
      ...(chosen.starter && chosen.extends ? { starter: { id: chosen.id, name: chosen.name } } : {}), slug: current.slug, publicStore,
      apiUrl: sourcePublicApiUrl(this.config), checkoutOrigin: this.config.get<string>('app.checkoutOrigin'), firstRevision: current.revision === 0,
      previousBrief: (previous?.snapshot as unknown as SourceProjectSnapshot | undefined)?.brief,
      // A filled Plantilla shows the merchant's photos or none, never the demo business's (spec 2026-10-20).
      fill, demoPhotos: !manifest.master && !plantillaCopy, extraFiles, variants, plantillaCopy, ...(dna ? { dna } : {}),
    });
    return { current, assembled };
  }

  /** Spec 2026-10-19 §2: the master template applied to a new store and filled in one call; the store is saved even when
   *  the filler fails. The filler sees what the apply sees: the store's name, product names and photos. */
  /** `carried`: files of an earlier build the fill points at (a «Probar otro estilo» swap keeps the bundled hero and story photos). */
  async applyMaster(merchantId: string, storeId: string, revision: number, filler: (facts: MasterFacts) => Promise<MasterFill | null>, presetId?: string, plan?: AppliedPlan, starterId?: string, carried: SourceProjectFileDto[] = []) {
    const presetManifest = presetId ? this.registry.templateManifest(presetId) : undefined;
    if (presetId && !presetManifest?.preset) throw new NotFoundException('Esa plantilla no existe.');
    // Starters (spec 2026-10-24): a finished store that extends Esencial — its own files and look, no dice, still the merchant's brand.
    const starterManifest = starterId && starterId !== MASTER_TEMPLATE_ID ? this.registry.templateManifest(starterId) : undefined;
    if (starterId && starterId !== MASTER_TEMPLATE_ID && !(starterManifest?.starter && starterManifest.extends === MASTER_TEMPLATE_ID)) throw new NotFoundException('Ese estilo no existe.');
    const manifest = this.registry.templateManifest(MASTER_TEMPLATE_ID);
    if (!manifest?.master) throw new NotFoundException('La plantilla base no está disponible.');
    const current = await this.projects.current(merchantId, storeId);
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    // Variety spec §4: the merchant's confirmed brand comes before the dice.
    const brand = await Promise.resolve(this.brands?.get(merchantId, storeId)).catch(() => undefined);
    const confirmed = new Map((brand?.data.confirmed ?? []).map(fact => [String(fact.field), String(fact.value)]));
    const facts: MasterFacts = { storeName: publicStore.storeName, products: publicStore.items.map(item => item.name), photos: [...new Set(publicStore.items.flatMap(item => item.imageUrls ?? []))],
      categoryCount: publicStore.categories.filter(category => publicStore.items.some(item => item.categoryId === category.id)).length,
      menuTargets: storeMenuTargetList(storeMenuContext(sourceStoreConfigData(publicStore, sourcePublicApiUrl(this.config), false), [])),
      ...(confirmed.get('voice') || confirmed.get('avoid') || confirmed.get('headlineExamples') ? { brand: { voice: confirmed.get('voice'), headlineExamples: confirmed.get('headlineExamples'), avoid: confirmed.get('avoid') } } : {}) };
    const read = await filler(facts).catch(() => null);
    // Owner 2026-10-24 («a blank screen»): a store with photos never opens without one; no cover pick means its first photo.
    const filled = read && !read.heroPhoto && facts.photos.length ? { ...read, heroPhoto: facts.photos[0] } : read;
    // Live 2026-10-19: a fill that timed out left the template's placeholder story and an API-hosted hero, and that hero then
    // failed every later design edit's checks («Imagen no disponible»). The merchant's own words and photos stand in.
    const fallback = filled ? null : await this.masterFallback(storeId, facts);
    const bundled = filled || fallback ? await this.bundleMasterPhotos(merchantId, filled ?? fallback!) : { change: undefined, files: [] };
    let fill = bundled.change ?? null;
    // Variety spec §3: the platform rolls the store's variants, palette and fonts within the business's character.
    let variants: MasterVariants | undefined;
    // Browse catalogue (spec 2026-11-06): products with a photo per option get the Nike shop page — from the dice, and over a
    // themed template's or a starter's own filters (live 2026-11-06: Gramiyaa on Tacón kept the preset's bar).
    const colourPhotos = carriesColourPhotos(publicStore.items) && (manifest.master.variants?.filters ?? []).includes('browse');
    const browseOverPreset = colourPhotos && Boolean(presetManifest || starterManifest);
    // Owner 2026-11-06 («si es una joyería que el carrito sea un anillo»): the header's cart shows what the store sells, over any template's.
    const goods = (manifest.master.variants?.goods ?? []).length ? goodsIcon([...publicStore.items.map(item => item.name), ...publicStore.categories.map(category => category.name)], publicStore.storeName) : '';
    const own: Partial<Record<string, string>> = { ...(browseOverPreset ? { filters: 'browse' } : {}), ...(goods ? { goods } : {}) };
    // A preset (Plantillas, 2026-10-22) is a chosen look: no dice and no logo palette; the fill only writes the words.
    // YAPI plan card (spec 2026-10-22): a checked plan replaces the dice.
    if (plan) {
      variants = { ...plan.variants, sections: plan.sections } as MasterVariants;
      // NOA 2 2026-10-30: a fashion store keeps the fashion card (round size chips) and product page under a plan too.
      if (fill?.character?.kind === 'fashion') for (const part of FASHION_PARTS) if (manifest.master?.variants?.[part]?.includes('fashion')) (variants as Record<string, unknown>)[part] = 'fashion';
      fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), palette: plan.palette, fonts: plan.fonts, ...(plan.accent ? { colors: { ...(fill?.look?.colors ?? {}), accent: plan.accent } } : {}) } };
    } else if (!presetManifest && !starterManifest && this.config.get<boolean>('app.yapiEsencialDice') !== false) {
      // Counted before bundling: a bundled hero is an asset path and would count its product photo twice (review fix).
      const photoCount = distinctPhotoCount([...facts.photos, filled?.heroPhoto, filled?.storyPhoto]);
      const rolled = rollVariants({ seed: storeId, settings: esencialDiceSettings(manifest.master), character: fill?.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] },
        photoCount, sections: (fill?.sections ?? []).map(section => section.id), recent: await this.recentMasterRolls(storeId), categoryCount: facts.categoryCount,
        colourPhotos });
      variants = { ...rolled.variants, ...(goods ? { goods } : {}) } as MasterVariants;
      // Dropdown menu spec 2026-10-21: the fill picks panel or dropdowns; the roll decides whether a non-fashion store has one.
      if (variants.menu !== undefined) variants.menu = menuVariant(variants.menu, fill?.menu?.style, fill?.character?.kind === 'fashion')!;
      fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), palette: rolled.palette, fonts: rolled.fonts } };
    }
    const dna = plan?.dna;
    const brandColours = Object.fromEntries(([['paper', 'background'], ['ink', 'foreground'], ['accent', 'accent'], ['muted', 'surface']] as const)
      .flatMap(([key, field]) => HEX.test(confirmed.get(field) ?? '') ? [[key, confirmed.get(field)!.toLowerCase()]] : []));
    // Owner 2026-10-29 («most lack … brand colors»): an industry preset no longer hides the brand's logo, named or photo colours.
    const logo = plan?.accent || Object.keys(brandColours).length || !publicStore.logoUrl ? undefined : await this.logoPalette(merchantId, publicStore.logoUrl).catch(() => undefined);
    // Owner 2026-10-28 («uniqueness from the brand, not the dice… logo colours»): with no logo, the store's own product photos give the
    // colours — the goods, not the table they sit on — so two stores on one template never share a palette by roll.
    // Owner 2026-10-28: the colours the merchant named («Colores de la marca: rosa pálido, rojo-naranja…») come right after a logo.
    const named = logo || Object.keys(brandColours).length || plan?.accent ? undefined : paletteFromNamed(fill?.namedColours ?? []);
    const photosPalette = named || logo || Object.keys(brandColours).length || plan?.accent ? undefined
      : await this.photosPalette(merchantId, facts.photos).catch(() => undefined);
    const brandPalette = logo ?? named ?? photosPalette;
    // The whole brand palette on every template now (paper and ink only tinted by the brand's hue, so the page stays calm and readable),
    // and a deep colour from the accent for the dark bands.
    const colours = Object.keys(brandColours).length ? brandColours
      : brandPalette ? { paper: brandPalette.paper, ink: brandPalette.ink, accent: brandPalette.accent, muted: brandPalette.surface, ...(deepFromAccent(brandPalette.accent) ? { deep: deepFromAccent(brandPalette.accent)! } : {}) } : undefined;
    // The merchant's confirmed brand colours always win over a plan's accent (final review 2026-10-22).
    if (colours && plan?.accent && !Object.keys(brandColours).length) colours.accent = plan.accent;
    if (colours) fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), colors: colours, ...(brandPalette && colours.paper && colours.ink && colours.accent ? { titles: titleColours({ paper: colours.paper, ink: colours.ink, accentInk: accentInk(colours.accent, colours.paper, colours.ink), deep: colours.deep, extras: brandPalette.extras }) } : {}), ...(fill?.look?.palette ? { palette: paletteForBrand(manifest.master, fill.look.palette, colours) } : {}) } };
    const files = [...bundled.files, ...carried.filter(file => !bundled.files.some(own => own.path === file.path))];
    // Starter dice (spec 2026-10-24-starter-dice §1): a starter with dice rolls its own lists, seeded by the store.
    // A/B comparison 2026-10-24: the rolled palette sits with the hero photo (PEPPA's red bottles got a blue accent).
    let dice = starterManifest?.starter?.dice;
    const heroFile = dice?.palettes?.length && fill?.heroPhoto ? files.find(file => file.path === fill?.heroPhoto) : undefined;
    if (dice?.palettes?.length && heroFile) dice = { ...dice, palettes: palettesForPhoto(manifest.master.palettes, dice.palettes, await photoTone(Buffer.from(heroFile.content, 'base64'))) };
    const rolledStarter = dice ? rollStarterDice({ seed: storeId, settings: manifest.master, dice,
      character: fill?.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] },
      photoCount: distinctPhotoCount([...facts.photos, filled?.heroPhoto, filled?.storyPhoto]), recent: await this.recentMasterRolls(storeId), categoryCount: facts.categoryCount }) : undefined;
    // Owner 2026-10-24 (the NOA atelier's dropdown menu): the menu style the merchant asked for wins over the starter's preset.
    const askedMenu = starterManifest && fill?.menu?.style ? menuVariant(starterManifest.preset?.variants.menu ?? 'panel', fill.menu.style, fill.character?.kind === 'fashion') : undefined;
    // On an industry skeleton a fashion business keeps the fashion product page (sizes, details) — the skeleton keeps its own cards.
    const starterOwn: Record<string, string> = {
      ...(starterManifest && fill?.character?.kind === 'fashion' ? Object.fromEntries(FASHION_PARTS.filter(part => part === 'pdp' && manifest.master?.variants?.[part]?.includes('fashion')).map(part => [part, 'fashion'])) : {}) };
    // Owner 2026-10-28 («the picture is all stretched… well framed, never stretched»): the cover follows the cover photo — its shape, size,
    // backdrop and subject — and the photo is placed on its subject. The roll stays when the photo can carry it.
    if (starterManifest) Object.assign(starterOwn, Object.fromEntries(Object.entries(styleForCharacter(fill?.character, false))
      .filter(([part, id]) => (manifest.master?.variants?.[part] ?? []).includes(id))));
    const heroBytes = fill?.heroPhoto ? files.find(file => file.path === fill?.heroPhoto)?.content : undefined;
    const fit = heroBytes ? await readPhotoFit(Buffer.from(heroBytes, 'base64')) : undefined;
    if (fit) {
      Object.assign(starterOwn, photoFitVariants(fit));
      if (starterManifest) {
        const cover = coverForPhoto(starterManifest.id, (rolledStarter?.variants as Record<string, string> | undefined)?.hero ?? starterManifest.preset?.variants.hero, fit, starterManifest.starter?.dice?.hero ?? []);
        if (cover) starterOwn.hero = cover;
      } else if (variants) {
        const cover = coverForPhoto(MASTER_TEMPLATE_ID, (variants as unknown as Record<string, string>).hero, fit, manifest.master.variants?.hero ?? []);
        variants = { ...variants, ...photoFitVariants(fit), ...(cover ? { hero: cover } : {}) } as unknown as MasterVariants;
      }
    }
    // Owner 2026-10-28 («type that fits»): on a skeleton the font pair the fill picked from the brand (its words, logo and photos) wins over
    // the dice when the skeleton offers it; the dice only decide when the brand's pick is not one of the skeleton's.
    const brandFont = starterManifest && filled?.look?.fonts && (starterManifest.starter?.dice?.fonts ?? []).includes(filled.look.fonts) ? filled.look.fonts : undefined;
    const animatedFonts = brandFont ? { fonts: brandFont } : {};
    const overPreset = presetManifest || starterManifest ? own : {};
    const starterRoll = rolledStarter || askedMenu || Object.keys(overPreset).length || (starterManifest && (Object.keys(starterOwn).length || animatedFonts.fonts)) ? { ...(rolledStarter ?? {}), ...animatedFonts,
      variants: { ...(rolledStarter?.variants ?? {}), ...(askedMenu ? { menu: askedMenu } : {}), ...(starterManifest ? starterOwn : {}), ...overPreset } as Partial<MasterVariants> } : undefined;
    // Spec 2026-10-30 home writer variety: the brand mood rides with the variants; the writer's animated look reads it.
    if (variants) variants = { ...variants, mood: fill?.character?.tone === 'bold' ? 'bold' : 'calm' } as unknown as MasterVariants;
    const { assembled } = await this.assemble(merchantId, storeId, starterManifest?.id ?? presetManifest?.id ?? MASTER_TEMPLATE_ID, revision, fill ?? undefined, files, variants, undefined, dna, starterRoll);
    // A whole template (34 templates) is named in the history by its own name, not «Esencial» (owner 2026-10-31: switching back).
    const label = presetManifest?.preset?.layout?.length ? `Plantilla: ${presetManifest.name}` : assembled.label;
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, label, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.firstBuild(storeId);
    // Variety spec §2b: every product's own page content (highlights, story, faq…), written in the background.
    void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId)).catch(() => undefined);
    return { ...saved, filled: Boolean(fill) };
  }

  /** Spec 2026-10-19 §3.1: a content edit on a master store — data and theme only, as a new revision. */
  /** `options` (YAPI edits everything, spec 2026-11-03): `files` changes the store's files after the refill (the catalogue title);
   *  `refreshData` writes the live store data into config.js, so the preview shows what the edit just wrote to the database. */
  /** The store's files with a MasterFill applied, its photos bundled: what refill saves and what refillDraft only prepares. */
  private async refilledFiles(merchantId: string, storeId: string, revision: number, change: MasterFill, options: { files?: <T extends { path: string; content: string }>(files: T[]) => T[]; refreshData?: boolean } = {}) {
    const previous = await this.projects.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const manifest = snapshot.brief?.templateId ? this.registry.templateManifest(snapshot.brief.templateId) : undefined;
    if (!manifest?.master) throw new BadRequestException('Esta tienda no usa la plantilla base.');
    const bundled = await this.bundleMasterPhotos(merchantId, change);
    // Dropdown menu spec 2026-10-21: a menu change is checked against the live catalog, so a category made after the last build can
    // be linked (final review); config.js data is refreshed the way every save refreshes it.
    const live = change.menu || options.refreshData ? await this.liveConfigData(merchantId, storeId).catch(() => undefined) : undefined;
    const refilled = refillMasterFiles(live ? withLiveCatalog(snapshot.files, live) : snapshot.files, manifest, bundled.change, sourcePublicApiUrl(this.config));
    const files = options.files ? options.files(refilled) : refilled;
    return { brief: snapshot.brief, files: [...files, ...bundled.files.filter(asset => !files.some(file => file.path === asset.path))] };
  }

  async refill(merchantId: string, storeId: string, revision: number, change: MasterFill, label: string, options: { files?: <T extends { path: string; content: string }>(files: T[]) => T[]; refreshData?: boolean } = {}) {
    const { brief, files } = await this.refilledFiles(merchantId, storeId, revision, change, options);
    return this.projects.save(merchantId, storeId, { revision, label, brief, files });
  }

  /** Spec 2026-11-11 store composer: a composed home built for its photographs only — prepared, never saved. */
  async refillDraft(merchantId: string, storeId: string, revision: number, change: MasterFill) {
    const { brief, files } = await this.refilledFiles(merchantId, storeId, revision, change);
    return this.projects.prepare({ revision, label: 'Borrador del compositor', brief, files } as never);
  }

  /** Spec 2026-11-11 store composer: the homes of the latest stores on the same template (other stores), newest first. Only
   *  store-data is read, in SQL, from the latest revision of each of the 40 newest stores. */
  async recentThemeHomes(storeId: string, theme: string, limit = 6): Promise<HomeSummary[]> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ name: string; data: string | null }>>(Prisma.sql`
        SELECT s.name, (
          SELECT f->>'content' FROM "StoreSourceVersion" v, jsonb_array_elements(v.snapshot->'files') f
          WHERE v."storeId" = s.id AND f->>'path' = ${TEMPLATE_STORE_DATA_PATH} ORDER BY v.revision DESC LIMIT 1) AS data
        FROM "Store" s WHERE s.id <> ${storeId} ORDER BY s."createdAt" DESC LIMIT 40`);
      return rows.flatMap(row => {
        if (!row.data) return [];
        const state = readMasterState([{ path: TEMPLATE_STORE_DATA_PATH, content: row.data }]);
        const layout = (state.layout ?? []) as Array<{ type: string; look?: string }>;
        return String((state.variants as Record<string, unknown> | undefined)?.theme ?? '') === theme && layout.length ? [homeSummary(row.name, layout)] : [];
      }).slice(0, limit);
    } catch { return []; }
  }

  private async liveConfigData(merchantId: string, storeId: string) {
    const current = await this.projects.current(merchantId, storeId);
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    return sourceStoreConfigData(publicStore, sourcePublicApiUrl(this.config), false);
  }

  /** Spec 2026-10-20 Plantillas fill §4: a converted Plantilla applied and filled for this business in one call. The store is
   *  saved even when the call fails: the merchant's own words stand in for every slot it left out, never the demo business's.
   *  Esencial keeps applyMaster. */
  async applyPlantillaFilled(merchantId: string, storeId: string, templateId: string, revision: number, filler: (facts: PlantillaFacts) => Promise<Record<string, string> | null>) {
    const manifest = this.registry.templateManifest(templateId);
    if (!manifest) throw new NotFoundException('Esa plantilla no existe.');
    if (!manifest.copy?.length || manifest.master) throw new BadRequestException('YAPI no puede llenar esta plantilla.');
    const current = await this.projects.current(merchantId, storeId);
    if (current.revision !== revision) throw new ConflictException('El proyecto cambió. Recarga antes de aplicar la plantilla.');
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    const facts: PlantillaFacts = { storeName: publicStore.storeName, tagline: publicStore.tagline ?? '', products: publicStore.items.map(item => item.name),
      photos: [...new Set(publicStore.items.flatMap(item => item.imageUrls ?? []))], slots: manifest.copy };
    const filled = plantillaFillFromRead(await filler(facts).catch(() => null), manifest.copy);
    const copy = { ...plantillaFallback(manifest.copy, facts), ...filled };
    const { assembled } = await this.assemble(merchantId, storeId, templateId, revision, undefined, undefined, undefined, copy);
    // Starters (spec 2026-10-24 §1): a copy-slot starter keeps its look but wears the merchant's confirmed brand or logo colours.
    const brandBlock = manifest.starter ? starterBrandBlock(await this.starterBrandColours(merchantId, storeId, publicStore.logoUrl).catch(() => ({}))) : '';
    if (brandBlock) assembled.files = assembled.files.map(file => file.path === 'styles/globals.css' ? { ...file, content: `${file.content}\n${brandBlock}\n` } : file);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.firstBuild(storeId);
    void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId)).catch(() => undefined);
    return { ...saved, filled: Object.keys(filled).length > 0 };
  }

  /** Confirmed brand colours first, else the logo's palette; {} when the merchant has neither. */
  private async starterBrandColours(merchantId: string, storeId: string, logoUrl?: string | null): Promise<StarterBrandColours> {
    const brand = await Promise.resolve(this.brands?.get(merchantId, storeId)).catch(() => undefined);
    const confirmed = new Map((brand?.data.confirmed ?? []).map(fact => [String(fact.field), String(fact.value)]));
    const fields = ['accent', 'background', 'foreground', 'surface'] as const;
    const fromBrand = Object.fromEntries(fields.flatMap(field => HEX.test(confirmed.get(field) ?? '') ? [[field, confirmed.get(field)!]] : []));
    if (Object.keys(fromBrand).length) return fromBrand;
    const logo = logoUrl ? await this.logoPalette(merchantId, logoUrl).catch(() => undefined) : undefined;
    return logo ? { accent: logo.accent, background: logo.paper, foreground: logo.ink, surface: logo.surface } : {};
  }

  /** Spec 2026-10-20 §5: a words change on a Plantilla store — store-data's copy only, as a new revision. */
  async refillPlantilla(merchantId: string, storeId: string, revision: number, change: Record<string, string>, label: string) {
    const previous = await this.projects.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const manifest = snapshot.brief?.templateId ? this.registry.templateManifest(snapshot.brief.templateId) : undefined;
    if (!manifest?.copy?.length || manifest.master) throw new BadRequestException('Esta tienda no usa una plantilla con textos editables.');
    return this.projects.save(merchantId, storeId, { revision, label, brief: snapshot.brief, files: refillPlantillaFiles(snapshot.files, change, manifest.copy) });
  }

  /** Variety spec §3: hero + palette + fonts of the last 6 master stores (other stores), so a new roll avoids them. */
  private async recentMasterRolls(storeId: string): Promise<RecentRoll[]> {
    try {
      // Only store-data is read, in SQL: a whole snapshot carries the kit, fonts and photos (review fix).
      const rows = await this.prisma.$queryRaw<Array<{ data: string | null }>>(Prisma.sql`
        SELECT (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${TEMPLATE_STORE_DATA_PATH} LIMIT 1) AS data
        FROM "StoreSourceVersion" v
        WHERE v.revision = 1 AND v."storeId" <> ${storeId} AND v.snapshot->'brief'->>'templateId' = ${MASTER_TEMPLATE_ID}
        ORDER BY v."createdAt" DESC LIMIT 6`);
      return rows.flatMap(row => {
        if (!row.data) return [];
        const state = readMasterState([{ path: TEMPLATE_STORE_DATA_PATH, content: row.data }]);
        return state.variants?.hero && state.look ? [{ hero: String(state.variants.hero), palette: state.look.palette, fonts: state.look.fonts }] : [];
      }).slice(0, 6);
    } catch { return []; }
  }

  /** Live check 2026-10-19: the master hero and story photos are bundled into the store like any authored photo (the
   *  preview and the agent's checks cannot load images from the API). Only the merchant's own uploads; anything else is
   *  dropped. Over 2 MB is scaled down. Without the uploads service (tests) the value is left as it is. */
  /** What a failed fill still knows: the walkthrough story and the merchant's photos (brand photos first, then products). */
  private async masterFallback(storeId: string, facts: MasterFacts): Promise<MasterFill> {
    type Onboarding = { story?: unknown; photos?: unknown } | null;
    const onboarding = await Promise.resolve().then(() => this.prisma.store.findUnique({ where: { id: storeId }, select: { onboarding: true } }))
      .then(store => (store?.onboarding ?? null) as Onboarding, () => null as Onboarding);
    const story = typeof onboarding?.story === 'string' ? onboarding.story.trim().slice(0, MASTER_COPY_CAPS.storyBody) : '';
    const photos = [...new Set([...(Array.isArray(onboarding?.photos) ? onboarding!.photos.filter((url): url is string => typeof url === 'string') : []), ...facts.photos])];
    return { ...(story ? { copy: { storyBody: story } } : {}), ...(photos[0] ? { heroPhoto: photos[0] } : {}), ...(photos[1] ? { storyPhoto: photos[1] } : {}) };
  }

  private async bundleMasterPhotos(merchantId: string, change: MasterFill): Promise<{ change: MasterFill; files: SourceProjectFileDto[] }> {
    const out: MasterFill = { ...change };
    const files: SourceProjectFileDto[] = [];
    if (!this.uploads) return { change: out, files };
    const bundle = async (value: string) => {
      const path = uploadPath(value);
      const match = /^\/v1\/uploads\/([a-f0-9-]+\.(png|jpe?g|webp))$/i.exec(path);
      const owned = match ? (await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [path] } }, select: { url: true } })).length > 0 : false;
      let bytes: Buffer | null = owned ? await this.uploads!.getBuffer(match![1]).catch(() => null) : null;
      let name = path;
      if (bytes && bytes.length > 2_000_000) { bytes = await sharp(bytes).resize({ width: 1800, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer().catch(() => null); name = path.replace(/\.[a-z]+$/i, '.jpg'); }
      if (!bytes) return null;
      const asset = bundledPhotoPath(bytes, name);
      if (!files.some(file => file.path === asset)) files.push({ path: asset, content: bytes.toString('base64'), encoding: 'base64' });
      return { asset, path };
    };
    for (const key of ['heroPhoto', 'storyPhoto'] as const) {
      const value = change[key];
      if (!value || BUNDLED_PHOTO.test(value)) continue;
      const done = await bundle(value);
      if (!done) { out[key] = ''; continue; }
      out.photoSources = { ...(out.photoSources ?? {}), [key === 'heroPhoto' ? 'hero' : 'story']: done.path };
      out[key] = done.asset;
    }
    // Section library (spec 2026-10-31): every photo a block shows is bundled too; one that cannot be is left out of its block.
    // The product page's sections (owner 2026-10-31) the same way.
    // NOA 2026-11-11: a template photo named by its store-data key («slot:pa-hero1», library.tsx `slotted`) is already the store's;
    // bundling it as an upload failed, so «más secciones» emptied the cover and every template photo on the home.
    const swap = async (value: unknown) => typeof value !== 'string' || !value ? undefined : BUNDLED_PHOTO.test(value) || /^slot:[\w-]+$/.test(value) ? value : (await bundle(value))?.asset;
    const bundled = async (list: unknown[]) => {
      const blocks: unknown[] = [];
      for (const raw of list as Array<Record<string, unknown> & { items?: Array<Record<string, unknown>> }>) {
        const block: Record<string, unknown> = { ...raw };
        for (const key of ['photo', 'photo2'] as const) { if (key in block) { const asset = await swap(block[key]); if (asset) block[key] = asset; else delete block[key]; } }
        // Cut-outs (2026-11-10): the list of floating photos names them as the block does, or the page cannot tell them apart.
        if (Array.isArray(raw.cut)) block.cut = (await Promise.all(raw.cut.map(swap))).filter(Boolean);
        if (Array.isArray(raw.items)) block.items = await Promise.all(raw.items.map(async item => { if (!('photo' in item)) return item; const asset = await swap(item.photo); const { photo: _photo, ...rest } = item; return asset ? { ...rest, photo: asset } : rest; }));
        blocks.push(block);
      }
      return blocks;
    };
    for (const key of ['layout', 'productLayout'] as const) {
      if (!change[key]?.length) continue;
      out[key] = await bundled(change[key]!);
    }
    // The menu pages' sections (spec 2026-11-05) the same way.
    if (change.pageLayouts) {
      const pages: Record<string, unknown[]> = {};
      for (const [kind, list] of Object.entries(change.pageLayouts)) pages[kind] = Array.isArray(list) ? await bundled(list) : [];
      out.pageLayouts = pages;
    }
    // The pages YAPI made (spec 2026-11-05 creates anything) the same way.
    if (change.extraPages) out.extraPages = await Promise.all(change.extraPages.map(async page => ({ ...page, layout: await bundled(page.layout) as typeof page.layout })));
    return { change: out, files };
  }

  private readonly demos = new Map<string, Promise<SourceProjectSnapshot>>();

  /** The template as its designer made it, on the demo store: what Plantillas › Ver shows. It reads nothing of the
   *  merchant's, so it is built once per template and process; a failed build is not kept. */
  demo(templateId: string): Promise<SourceProjectSnapshot> {
    const manifest = this.registry.templateManifest(templateId);
    if (!manifest) throw new NotFoundException('Esa plantilla no existe.');
    let pending = this.demos.get(manifest.id);
    if (!pending) {
      const resolved = resolvePresetTemplate(manifest, id => this.registry.templateManifest(id));
      pending = templateDemoRevision(resolved.manifest, this.registry.templateSourceFiles(resolved.manifest.id), resolved.preset, resolved.demo)
        .then(assembled => this.projects.prepare({ revision: 0, ...assembled }) as Promise<SourceProjectSnapshot>);
      pending.catch(() => this.demos.delete(manifest.id));
      this.demos.set(manifest.id, pending);
    }
    return pending;
  }

  /** The template on this store as it would be saved, for the gallery's preview. Nothing is persisted. */
  async preview(merchantId: string, storeId: string, templateId: string) {
    const { current, assembled } = await this.assemble(merchantId, storeId, templateId);
    return this.projects.prepare({ revision: current.revision, ...assembled });
  }

  async apply(merchantId: string, storeId: string, templateId: string, revision: number) {
    const { assembled } = await this.assemble(merchantId, storeId, templateId, revision);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    // A first site takes payments, as a first YAPI generation does.
    if (revision === 0) await this.firstBuild(storeId);
    return saved;
  }
}
