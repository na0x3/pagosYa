import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreSeoService } from '../../store-seo/store-seo.service';
import { publicImage } from '../../store-seo/store-seo';
import { PublicStoresService } from '../../stores/public-stores.service';
import { findExtension } from '../registry';
import { feedItems, productFeedXml } from './product-feed';

const TTL_MS = 60 * 60_000;

/** Catalog feeds for Google Shopping and Facebook & Instagram Shop: live data on request, cached an hour (spec §7.3). */
@Injectable()
export class StoreFeedsService {
  private readonly cache = new Map<string, { at: number; body: string }>();
  constructor(private readonly prisma: PrismaService, private readonly seo: StoreSeoService, private readonly publicStores: PublicStoresService, private readonly config: ConfigService) {}
  private apiBase() { return (process.env.PUBLIC_API_URL || `http://localhost:${this.config.get('app.port') || 3001}/v1`).replace(/\/$/, ''); }

  private async build(slug: string) {
    const context = await this.seo.context(slug);
    const data = await this.publicStores.getStorePublic(slug, { trackView: false });
    return { context, ...feedItems({ storeName: context.store.name, items: data.items as never, productUrl: context.productUrl, image: url => publicImage(url, this.apiBase()) }) };
  }

  async feed(slug: string, file: string) {
    const match = /^([a-z0-9-]{1,60})\.xml$/.exec(file);
    const manifest = match ? findExtension(match[1]) : undefined;
    if (!manifest?.productFeed) throw new NotFoundException();
    const context = await this.seo.context(slug);
    const installation = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId: context.store.id, extensionId: manifest.id } }, select: { enabled: true } });
    if (!installation?.enabled) throw new NotFoundException();
    const key = `${context.store.id}:${manifest.id}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
    const { items } = await this.build(slug);
    const body = productFeedXml(context.store.name, context.home, items);
    this.cache.set(key, { at: Date.now(), body });
    return body;
  }

  /** For the extension card: how many products the feed leaves out, and why. */
  async summary(slug: string) {
    try { return { skipped: (await this.build(slug)).skipped }; } catch { return { skipped: { noPhoto: 0, noPrice: 0 } }; }
  }
}
