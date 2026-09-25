import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { deviceClass, normalizeAnalyticsBatch } from './store-analytics-input';

export type IngestContext = { userAgent?: string; gpc?: boolean };

/** G1: consented storefront events in, daily rollups out. The funnel (StoreFunnelService) stays as it is. */
@Injectable()
export class StoreAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Consent is enforced in the browser (the host page sends nothing without it); GPC is honoured here too. */
  async ingest(slug: string, body: unknown, context: IngestContext = {}): Promise<{ accepted: number }> {
    const batch = normalizeAnalyticsBatch(body);
    // The funnel's eligibility: only a live, published, unpaused store collects anything.
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true } });
    if (!store) throw new NotFoundException('Tienda no publicada');
    if (context.gpc || !batch.events.length) return { accepted: 0 };
    const ids = [...new Set(batch.events.map(event => event.productId).filter((id): id is string => !!id))];
    const known = new Set(ids.length ? (await this.prisma.paymentLink.findMany({ where: { storeId: store.id, id: { in: ids } }, select: { id: true } })).map(product => product.id) : []);
    const sessionHash = createHash('sha256').update(batch.sessionId).digest('hex');
    const device = deviceClass(context.userAgent);
    const data = batch.events.flatMap(event => {
      const productId = event.productId && known.has(event.productId) ? event.productId : null;
      // A product event about someone else's product is dropped; a CTA just loses the product.
      if (event.productId && !productId && event.type !== 'cta_click') return [];
      return [{ storeId: store.id, sessionHash, type: event.type, productId, target: event.target, path: event.path, device, referrerHost: event.type === 'page_view' ? batch.referrerHost : null }];
    });
    if (!data.length) return { accepted: 0 };
    await this.prisma.storeAnalyticsEvent.createMany({ data });
    return { accepted: data.length };
  }
}
