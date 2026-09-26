import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as registry from '@pagosya/store-templates';
import { PrismaService } from '../prisma/prisma.service';
import { PublicStoresService } from '../stores/public-stores.service';
import { SourceProjectsService } from './source-projects.service';
import type { SourceProjectSnapshot } from './source-project';
import { assembleTemplateRevision } from './source-templates';
import { sourcePublicApiUrl } from './source-store-config';

/** Plantillas: apply a designer-made store as the next revision (free, no AI call). */
@Injectable()
export class SourceTemplatesService {
  /** The template registry; replaceable in tests. */
  registry: Pick<typeof registry, 'listTemplates' | 'templateManifest' | 'templateSourceFiles'> = registry;

  constructor(private readonly prisma: PrismaService, private readonly publicStores: PublicStoresService, private readonly projects: SourceProjectsService, private readonly config: ConfigService) {}

  list() {
    return this.registry.listTemplates().map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }

  async apply(merchantId: string, storeId: string, templateId: string, revision: number) {
    const manifest = this.registry.templateManifest(templateId);
    if (!manifest) throw new NotFoundException('Esa plantilla no existe.');
    const current = await this.projects.current(merchantId, storeId);
    if (current.revision !== revision) throw new ConflictException('El proyecto cambió. Recarga antes de aplicar la plantilla.');
    const previous = revision ? await this.projects.version(merchantId, storeId, revision) : null;
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    const assembled = await assembleTemplateRevision({
      manifest, source: this.registry.templateSourceFiles(manifest.id), storeId, slug: current.slug, publicStore,
      apiUrl: sourcePublicApiUrl(this.config), checkoutOrigin: this.config.get<string>('app.checkoutOrigin'), firstRevision: revision === 0,
      previousBrief: (previous?.snapshot as unknown as SourceProjectSnapshot | undefined)?.brief,
    });
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    // A first site takes payments, as a first YAPI generation does.
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    return saved;
  }
}
