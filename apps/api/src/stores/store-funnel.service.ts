import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export const FUNNEL_EVENTS = ['visit', 'product_view', 'add_to_cart', 'checkout_started', 'delivery_selected'] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];
const fields = { product_view: 'productViewedAt', add_to_cart: 'cartAddedAt', checkout_started: 'checkoutStartedAt', delivery_selected: 'deliverySelectedAt' } as const;
@Injectable()
export class StoreFunnelService {
  constructor(private readonly prisma: PrismaService) {}
  async record(slug: string, sessionId: string, event: FunnelEvent, method?: 'delivery' | 'pickup') {
    if (!FUNNEL_EVENTS.includes(event) || event === 'delivery_selected' && !method) throw new BadRequestException('Evento no válido');
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true } });
    if (!store) throw new NotFoundException('Tienda no publicada');
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const visit = await this.prisma.storeFunnelVisit.upsert({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } }, update: {}, create: { storeId: store.id, sessionHash, token: randomBytes(24).toString('base64url') } }).catch(async error => {
      // Prisma may implement an empty-update upsert as read/create. A concurrent
      // first event can win the unique key; reuse its session instead of failing.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.prisma.storeFunnelVisit.findUniqueOrThrow({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } } });
    });
    // First occurrence only, including concurrent retries. A session expires after 24h.
    if (visit.createdAt.getTime() < Date.now() - 86400000) throw new BadRequestException('Sesión caducada');
    if (event !== 'visit') {
      const field = fields[event];
      await this.prisma.storeFunnelVisit.updateMany({ where: { id: visit.id, [field]: null }, data: { [field]: new Date(), ...(event === 'delivery_selected' ? { fulfillmentMethod: method } : {}) } });
    }
    return { token: visit.token };
  }
  async summary(storeId: string, since: Date) {
    const where = { storeId, createdAt: { gte: since } };
    const [visitors, productViews, cartAdds, checkoutStarts, deliverySelections, paymentCompletions] = await Promise.all([
      this.prisma.storeFunnelVisit.count({ where }),
      ...Object.values(fields).map(field => this.prisma.storeFunnelVisit.count({ where: { ...where, [field]: { not: null } } })),
      // Only the server's confirmed live payment status counts; clients cannot submit success.
      this.prisma.storeFunnelVisit.count({ where: { ...where, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } }),
    ]);
    const mature = { storeId, createdAt: { gte: since, lt: new Date(Date.now() - 86400000) } };
    const [matureCartAdds, cartWithoutCheckout, checkoutWithoutPayment] = await Promise.all([
      this.prisma.storeFunnelVisit.count({ where: { ...mature, cartAddedAt: { not: null } } }),
      this.prisma.storeFunnelVisit.count({ where: { ...mature, cartAddedAt: { not: null }, checkoutStartedAt: null } }),
      this.prisma.storeFunnelVisit.count({ where: { ...mature, checkoutStartedAt: { not: null }, orders: { none: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } }),
    ]);
    const rate = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
    return {
      visitors,
      productViews,
      cartAdds,
      checkoutStarts,
      deliverySelections,
      paymentCompletions,
      conversionRates: {
        productViewFromVisitor: rate(productViews, visitors),
        cartAddFromProductView: rate(cartAdds, productViews),
        checkoutFromCartAdd: rate(checkoutStarts, cartAdds),
        deliverySelectionFromCheckout: rate(deliverySelections, checkoutStarts),
        paymentFromCheckout: rate(paymentCompletions, checkoutStarts),
      },
      matureCartAdds,
      cartWithoutCheckout,
      checkoutWithoutPayment,
    };
  }
}
