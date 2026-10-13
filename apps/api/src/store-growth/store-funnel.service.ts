import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { funnelSessions } from './funnel-sessions';

export const FUNNEL_EVENTS = ['visit', 'product_view', 'add_to_cart', 'checkout_started', 'delivery_selected'] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];
@Injectable()
export class StoreFunnelService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * The store page sends only `visit`: its token links a paid order to the session (StoreCheckoutService). Every
   * checkout step is a G1 analytics event since 2026-10-13. A cached older host page still posts the old steps; they
   * are accepted, validated as before, and nothing is written for them. The step columns stay in the table, unwritten.
   */
  async record(slug: string, sessionId: string, event: FunnelEvent, method?: 'delivery' | 'pickup') {
    if (!FUNNEL_EVENTS.includes(event) || event === 'delivery_selected' && !method) throw new BadRequestException('Evento no válido');
    if (event !== 'visit') return {};
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true } });
    if (!store) throw new NotFoundException('Tienda no publicada');
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const visit = await this.prisma.storeFunnelVisit.upsert({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } }, update: {}, create: { storeId: store.id, sessionHash, token: randomBytes(24).toString('base64url') } }).catch(async error => {
      // Prisma may implement an empty-update upsert as read/create. A concurrent
      // first event can win the unique key; reuse its session instead of failing.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.prisma.storeFunnelVisit.findUniqueOrThrow({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } } });
    });
    // A session expires after 24h.
    if (visit.createdAt.getTime() < Date.now() - 86400000) throw new BadRequestException('Sesión caducada');
    return { token: visit.token };
  }
  /**
   * Step counts come from the G1 analytics events (funnelSessions), with the 24-hour "mature" rule. Paid sessions still
   * come through the order link, the one thing StoreFunnelVisit records now. The two cannot be joined per session
   * (different hashes), so the old "checkout without payment" count is gone.
   */
  async summary(storeId: string, since: Date, now = new Date()) {
    const [steps, paymentCompletions] = await Promise.all([
      funnelSessions(this.prisma, storeId, since, now),
      // Only the server's confirmed live payment status counts; clients cannot submit success.
      this.prisma.storeFunnelVisit.count({ where: { storeId, createdAt: { gte: since }, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } }),
    ]);
    const { visitors, productViews, cartAdds, checkoutStarts, deliverySelections, matureCartAdds, cartWithoutCheckout } = steps;
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
    };
  }
}
