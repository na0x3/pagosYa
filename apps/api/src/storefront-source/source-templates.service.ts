import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { UploadsService } from '../uploads/uploads.service';
import { ProductPageWriterService } from '../product-content/product-page-writer.service';
import { BrandProfileService } from '../brand/brand-profile.service';
import { proposeStorePalette, type SourcePalette } from './source-palette';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { BUNDLED_PHOTO, bundledPhotoPath, uploadPath } from './source-product-photos';
import { ConfigService } from '@nestjs/config';
import * as registry from '@pagosya/store-templates';
import { PrismaService } from '../prisma/prisma.service';
import { PublicStoresService } from '../stores/public-stores.service';
import { SourceProjectsService } from './source-projects.service';
import type { SourceProjectSnapshot } from './source-project';
import { assembleTemplateRevision, readMasterState, refillMasterFiles, refillPlantillaFiles, templateDemoRevision, TEMPLATE_STORE_DATA_PATH } from './source-templates';
import { plantillaFallback, plantillaFillFromRead } from './source-plantilla-fill';
import { MASTER_COPY_CAPS, MASTER_TEMPLATE_ID, paletteForBrand, type MasterFill, type MasterVariants } from './source-master';
import { distinctPhotoCount, rollVariants, type RecentRoll } from './source-master-dice';

/** What the master template's filler is told about a store (spec 2026-10-19 §2.3). */
export type MasterFacts = { storeName: string; products: string[]; photos: string[]; brand?: { voice?: string; headlineExamples?: string; avoid?: string } };
/** What a Plantilla's filler is told (spec 2026-10-20 §4): the store as the apply reads it, and the template's slots. */
export type PlantillaFacts = { storeName: string; tagline: string; products: string[]; photos: string[]; slots: NonNullable<registry.TemplateManifest['copy']> };
const HEX = /^#[0-9a-f]{6}$/i;
import { sourcePublicApiUrl } from './source-store-config';

/** Plantillas: apply a designer-made store as the next revision (free, no AI call). */
@Injectable()
export class SourceTemplatesService {
  /** The template registry; replaceable in tests. */
  registry: Pick<typeof registry, 'galleryTemplates' | 'templateManifest' | 'templateSourceFiles'> = registry;

  constructor(private readonly prisma: PrismaService, private readonly publicStores: PublicStoresService, private readonly projects: SourceProjectsService, private readonly config: ConfigService, @Optional() private readonly uploads?: UploadsService, @Optional() private readonly pageWriter?: ProductPageWriterService, @Optional() private readonly brands?: BrandProfileService) {}

  /** The logo's colours as a palette (variety spec §4); replaceable in tests. */
  logoPalette = async (merchantId: string, url: string): Promise<SourcePalette | undefined> => {
    const path = uploadPath(url);
    const match = /^\/v1\/uploads\/([a-f0-9-]+\.(png|jpe?g|webp))$/i.exec(path);
    if (!match || !this.uploads) return undefined;
    const owned = (await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [path] } }, select: { url: true } })).length > 0;
    const bytes = owned ? await this.uploads.getBuffer(match[1]).catch(() => null) : null;
    return bytes ? proposeStorePalette({ logo: { url: path, path, bytes } }).catch(() => undefined) : undefined;
  };

  list(curatedOnly = false) {
    return this.registry.galleryTemplates().filter(manifest => !curatedOnly || (manifest.curated === true && Boolean(manifest.copy?.length)))
      .map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }

  /** The pieces `apply` saves and `preview` shows: the template filled with this store's name, products and photos. */
  private async assemble(merchantId: string, storeId: string, templateId: string, expectedRevision?: number, fill?: MasterFill, extraFiles?: SourceProjectFileDto[], variants?: MasterVariants, plantillaCopy?: Record<string, string>) {
    const manifest = this.registry.templateManifest(templateId);
    if (!manifest) throw new NotFoundException('Esa plantilla no existe.');
    const current = await this.projects.current(merchantId, storeId);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ConflictException('El proyecto cambió. Recarga antes de aplicar la plantilla.');
    const previous = current.revision ? await this.projects.version(merchantId, storeId, current.revision) : null;
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    const assembled = await assembleTemplateRevision({
      manifest, source: this.registry.templateSourceFiles(manifest.id), storeId, slug: current.slug, publicStore,
      apiUrl: sourcePublicApiUrl(this.config), checkoutOrigin: this.config.get<string>('app.checkoutOrigin'), firstRevision: current.revision === 0,
      previousBrief: (previous?.snapshot as unknown as SourceProjectSnapshot | undefined)?.brief,
      // A filled Plantilla shows the merchant's photos or none, never the demo business's (spec 2026-10-20).
      fill, demoPhotos: !manifest.master && !plantillaCopy, extraFiles, variants, plantillaCopy,
    });
    return { current, assembled };
  }

  /** Spec 2026-10-19 §2: the master template applied to a new store and filled in one call; the store is saved even when
   *  the filler fails. The filler sees what the apply sees: the store's name, product names and photos. */
  async applyMaster(merchantId: string, storeId: string, revision: number, filler: (facts: MasterFacts) => Promise<MasterFill | null>) {
    const manifest = this.registry.templateManifest(MASTER_TEMPLATE_ID);
    if (!manifest?.master) throw new NotFoundException('La plantilla base no está disponible.');
    const current = await this.projects.current(merchantId, storeId);
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    // Variety spec §4: the merchant's confirmed brand comes before the dice.
    const brand = await Promise.resolve(this.brands?.get(merchantId, storeId)).catch(() => undefined);
    const confirmed = new Map((brand?.data.confirmed ?? []).map(fact => [String(fact.field), String(fact.value)]));
    const facts: MasterFacts = { storeName: publicStore.storeName, products: publicStore.items.map(item => item.name), photos: [...new Set(publicStore.items.flatMap(item => item.imageUrls ?? []))],
      ...(confirmed.get('voice') || confirmed.get('avoid') || confirmed.get('headlineExamples') ? { brand: { voice: confirmed.get('voice'), headlineExamples: confirmed.get('headlineExamples'), avoid: confirmed.get('avoid') } } : {}) };
    const filled = await filler(facts).catch(() => null);
    // Live 2026-10-19: a fill that timed out left the template's placeholder story and an API-hosted hero, and that hero then
    // failed every later design edit's checks («Imagen no disponible»). The merchant's own words and photos stand in.
    const fallback = filled ? null : await this.masterFallback(storeId, facts);
    const bundled = filled || fallback ? await this.bundleMasterPhotos(merchantId, filled ?? fallback!) : { change: undefined, files: [] };
    let fill = bundled.change ?? null;
    // Variety spec §3: the platform rolls the store's variants, palette and fonts within the business's character.
    let variants: MasterVariants | undefined;
    if (this.config.get<boolean>('app.yapiEsencialDice') !== false) {
      // Counted before bundling: a bundled hero is an asset path and would count its product photo twice (review fix).
      const photoCount = distinctPhotoCount([...facts.photos, filled?.heroPhoto, filled?.storyPhoto]);
      const rolled = rollVariants({ seed: storeId, settings: manifest.master, character: fill?.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] },
        photoCount, sections: (fill?.sections ?? []).map(section => section.id), recent: await this.recentMasterRolls(storeId) });
      variants = rolled.variants;
      fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), palette: rolled.palette, fonts: rolled.fonts } };
    }
    const brandColours = Object.fromEntries(([['paper', 'background'], ['ink', 'foreground'], ['accent', 'accent'], ['muted', 'surface']] as const)
      .flatMap(([key, field]) => HEX.test(confirmed.get(field) ?? '') ? [[key, confirmed.get(field)!.toLowerCase()]] : []));
    const logo = Object.keys(brandColours).length || !publicStore.logoUrl ? undefined : await this.logoPalette(merchantId, publicStore.logoUrl).catch(() => undefined);
    const colours = Object.keys(brandColours).length ? brandColours : logo ? { paper: logo.paper, ink: logo.ink, accent: logo.accent, muted: logo.surface } : undefined;
    if (colours) fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), colors: colours, ...(fill?.look?.palette ? { palette: paletteForBrand(manifest.master, fill.look.palette, colours) } : {}) } };
    const { assembled } = await this.assemble(merchantId, storeId, MASTER_TEMPLATE_ID, revision, fill ?? undefined, bundled.files, variants);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    // Variety spec §2b: every product's own page content (highlights, story, faq…), written in the background.
    void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId, 20, { fashion: fill?.character?.kind === 'fashion' })).catch(() => undefined);
    return { ...saved, filled: Boolean(fill) };
  }

  /** Spec 2026-10-19 §3.1: a content edit on a master store — data and theme only, as a new revision. */
  async refill(merchantId: string, storeId: string, revision: number, change: MasterFill, label: string) {
    const previous = await this.projects.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const manifest = snapshot.brief?.templateId ? this.registry.templateManifest(snapshot.brief.templateId) : undefined;
    if (!manifest?.master) throw new BadRequestException('Esta tienda no usa la plantilla base.');
    const bundled = await this.bundleMasterPhotos(merchantId, change);
    const files = refillMasterFiles(snapshot.files, manifest, bundled.change, sourcePublicApiUrl(this.config));
    return this.projects.save(merchantId, storeId, { revision, label, brief: snapshot.brief, files: [...files, ...bundled.files.filter(asset => !files.some(file => file.path === asset.path))] });
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
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId)).catch(() => undefined);
    return { ...saved, filled: Object.keys(filled).length > 0 };
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
    for (const key of ['heroPhoto', 'storyPhoto'] as const) {
      const value = change[key];
      if (!value || BUNDLED_PHOTO.test(value)) continue;
      const path = uploadPath(value);
      const match = /^\/v1\/uploads\/([a-f0-9-]+\.(png|jpe?g|webp))$/i.exec(path);
      const owned = match ? (await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [path] } }, select: { url: true } })).length > 0 : false;
      let bytes: Buffer | null = owned ? await this.uploads.getBuffer(match![1]).catch(() => null) : null;
      let name = path;
      if (bytes && bytes.length > 2_000_000) { bytes = await sharp(bytes).resize({ width: 1800, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer().catch(() => null); name = path.replace(/\.[a-z]+$/i, '.jpg'); }
      if (!bytes) { out[key] = ''; continue; }
      out.photoSources = { ...(out.photoSources ?? {}), [key === 'heroPhoto' ? 'hero' : 'story']: path };
      const asset = bundledPhotoPath(bytes, name);
      if (!files.some(file => file.path === asset)) files.push({ path: asset, content: bytes.toString('base64'), encoding: 'base64' });
      out[key] = asset;
    }
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
      pending = templateDemoRevision(manifest, this.registry.templateSourceFiles(manifest.id))
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
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    return saved;
  }
}
