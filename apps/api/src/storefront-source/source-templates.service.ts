import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import sharp from 'sharp';
import { UploadsService } from '../uploads/uploads.service';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { BUNDLED_PHOTO, bundledPhotoPath, uploadPath } from './source-product-photos';
import { ConfigService } from '@nestjs/config';
import * as registry from '@pagosya/store-templates';
import { PrismaService } from '../prisma/prisma.service';
import { PublicStoresService } from '../stores/public-stores.service';
import { SourceProjectsService } from './source-projects.service';
import type { SourceProjectSnapshot } from './source-project';
import { assembleTemplateRevision, refillMasterFiles, templateDemoRevision } from './source-templates';
import { MASTER_TEMPLATE_ID, type MasterFill } from './source-master';

/** What the master template's filler is told about a store (spec 2026-10-19 §2.3). */
export type MasterFacts = { storeName: string; products: string[]; photos: string[] };
import { sourcePublicApiUrl } from './source-store-config';

/** Plantillas: apply a designer-made store as the next revision (free, no AI call). */
@Injectable()
export class SourceTemplatesService {
  /** The template registry; replaceable in tests. */
  registry: Pick<typeof registry, 'galleryTemplates' | 'templateManifest' | 'templateSourceFiles'> = registry;

  constructor(private readonly prisma: PrismaService, private readonly publicStores: PublicStoresService, private readonly projects: SourceProjectsService, private readonly config: ConfigService, @Optional() private readonly uploads?: UploadsService) {}

  list() {
    return this.registry.galleryTemplates().map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }

  /** The pieces `apply` saves and `preview` shows: the template filled with this store's name, products and photos. */
  private async assemble(merchantId: string, storeId: string, templateId: string, expectedRevision?: number, fill?: MasterFill, extraFiles?: SourceProjectFileDto[]) {
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
      fill, demoPhotos: !manifest.master, extraFiles,
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
    const facts: MasterFacts = { storeName: publicStore.storeName, products: publicStore.items.map(item => item.name), photos: [...new Set(publicStore.items.flatMap(item => item.imageUrls ?? []))] };
    const filled = await filler(facts).catch(() => null);
    const bundled = filled ? await this.bundleMasterPhotos(merchantId, filled) : { change: undefined, files: [] };
    const fill = bundled.change ?? null;
    const { assembled } = await this.assemble(merchantId, storeId, MASTER_TEMPLATE_ID, revision, fill ?? undefined, bundled.files);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
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
