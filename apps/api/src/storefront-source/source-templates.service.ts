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
import { assembleTemplateRevision, readMasterState, refillMasterFiles, templateDemoRevision } from './source-templates';
import { MASTER_TEMPLATE_ID, type MasterFill, type MasterVariants } from './source-master';
import { rollVariants, type RecentRoll } from './source-master-dice';

/** What the master template's filler is told about a store (spec 2026-10-19 §2.3). */
export type MasterFacts = { storeName: string; products: string[]; photos: string[]; brand?: { voice?: string; headlineExamples?: string; avoid?: string } };
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

  list() {
    return this.registry.galleryTemplates().map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }

  /** The pieces `apply` saves and `preview` shows: the template filled with this store's name, products and photos. */
  private async assemble(merchantId: string, storeId: string, templateId: string, expectedRevision?: number, fill?: MasterFill, extraFiles?: SourceProjectFileDto[], variants?: MasterVariants) {
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
      fill, demoPhotos: !manifest.master, extraFiles, variants,
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
    const bundled = filled ? await this.bundleMasterPhotos(merchantId, filled) : { change: undefined, files: [] };
    let fill = bundled.change ?? null;
    // Variety spec §3: the platform rolls the store's variants, palette and fonts within the business's character.
    let variants: MasterVariants | undefined;
    if (this.config.get<boolean>('app.yapiEsencialDice') !== false) {
      const photoCount = new Set([...facts.photos, fill?.heroPhoto, fill?.storyPhoto].filter(Boolean)).size;
      const rolled = rollVariants({ seed: storeId, settings: manifest.master, character: fill?.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] },
        photoCount, sections: (fill?.sections ?? []).map(section => section.id), recent: await this.recentMasterRolls(storeId) });
      variants = rolled.variants;
      fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), palette: rolled.palette, fonts: rolled.fonts } };
    }
    const brandColours = Object.fromEntries(([['paper', 'background'], ['ink', 'foreground'], ['accent', 'accent'], ['muted', 'surface']] as const)
      .flatMap(([key, field]) => HEX.test(confirmed.get(field) ?? '') ? [[key, confirmed.get(field)!.toLowerCase()]] : []));
    const logo = Object.keys(brandColours).length || !publicStore.logoUrl ? undefined : await this.logoPalette(merchantId, publicStore.logoUrl).catch(() => undefined);
    const colours = Object.keys(brandColours).length ? brandColours : logo ? { paper: logo.paper, ink: logo.ink, accent: logo.accent, muted: logo.surface } : undefined;
    if (colours) fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), colors: colours } };
    const { assembled } = await this.assemble(merchantId, storeId, MASTER_TEMPLATE_ID, revision, fill ?? undefined, bundled.files, variants);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    // Variety spec §2b: every product's own page content (highlights, story, faq…), written in the background.
    void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId)).catch(() => undefined);
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

  /** Variety spec §3: hero + palette + fonts of the last 6 master stores (other stores), so a new roll avoids them. */
  private async recentMasterRolls(storeId: string): Promise<RecentRoll[]> {
    try {
      const rows = await this.prisma.storeSourceVersion.findMany({ where: { revision: 1, storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 40, select: { snapshot: true } });
      return rows.flatMap(row => {
        const snapshot = row.snapshot as unknown as SourceProjectSnapshot;
        if (snapshot?.brief?.templateId !== MASTER_TEMPLATE_ID) return [];
        const state = readMasterState(snapshot.files ?? []);
        return state.variants?.hero && state.look ? [{ hero: String(state.variants.hero), palette: state.look.palette, fonts: state.look.fonts }] : [];
      }).slice(0, 6);
    } catch { return []; }
  }

  /** Live check 2026-10-19: the master hero and story photos are bundled into the store like any authored photo (the
   *  preview and the agent's checks cannot load images from the API). Only the merchant's own uploads; anything else is
   *  dropped. Over 2 MB is scaled down. Without the uploads service (tests) the value is left as it is. */
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
