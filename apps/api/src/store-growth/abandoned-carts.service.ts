import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { reminderCart } from '../retention/reminder-cart';
import { buildAbandonedCarts, orderLines, savedCartLines, savedItems } from './abandoned-carts';
import { funnelSessions } from './funnel-sessions';

export const ABANDONED_CART_PERIODS = [7, 30] as const;
export type AbandonedCartDays = typeof ABANDONED_CART_PERIODS[number];
const HOUR_MS = 3_600_000;
/** Enough for a busy month; the page is a to-do list, not an export. */
const ROWS = 500;

/** Crecer › Carritos abandonados: read-only, owner-scoped, nothing stored (a "Contactado" mark would need state). */
@Injectable()
export class AbandonedCartsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async list(merchantId: string, storeId: string, days: AbandonedCartDays, now = new Date()) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1 } } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const since = new Date(now.getTime() - days * 24 * HOUR_MS);
    const [orders, saved, paid, retention, sessions] = await Promise.all([
      // Kind 1: a live payment the shopper confirmed (pressed Pagar) at least an hour ago, unpaid, with a way to reach them.
      this.prisma.storeOrder.findMany({
        where: { storeId, merchantId, createdAt: { gte: since, lt: new Date(now.getTime() - HOUR_MS) }, paymentIntent: { livemode: true, confirmationAttempts: { gt: 0 }, status: { not: 'SUCCEEDED' }, OR: [{ customerEmail: { not: null } }, { customerPhone: { not: null } }] } },
        orderBy: { createdAt: 'desc' }, take: ROWS,
        select: { items: true, amount: true, currency: true, createdAt: true, paymentIntent: { select: { id: true, customerName: true, customerEmail: true, customerPhone: true, metadata: true } } },
      }),
      // Kind 2: carts saved with consent («¿Prefieres terminar después?» or «Avísame») and still open.
      // saveCart refreshes an open cart in place (updatedAt): its last save is when the shopper last left.
      this.prisma.storeSavedCart.findMany({ where: { storeId, closedAt: null, updatedAt: { gte: since } }, orderBy: { updatedAt: 'desc' }, take: ROWS, select: { id: true, token: true, email: true, items: true, paymentIntentId: true, updatedAt: true, sentAt: true } }),
      // Whoever paid live in this store since: their earlier rows are not abandoned.
      this.prisma.storeOrder.findMany({ where: { storeId, merchantId, paymentIntent: { status: 'SUCCEEDED', livemode: true, updatedAt: { gte: since } } }, take: 5000, select: { paymentIntent: { select: { customerEmail: true, customerPhone: true, updatedAt: true } } } }),
      this.prisma.storeRetention.findUnique({ where: { storeId }, select: { settings: true } }),
      funnelSessions(this.prisma, storeId, since, now),
    ]);
    const linked = saved.flatMap(cart => cart.paymentIntentId ? [cart.paymentIntentId] : []);
    const productIds = [...new Set(saved.flatMap(cart => savedItems(cart.items).map(item => item.paymentLinkId)))];
    const emails = [...new Set(saved.map(cart => cart.email))];
    const [ownPaid, products, subscribers] = await Promise.all([
      linked.length ? this.prisma.paymentIntent.findMany({ where: { id: { in: linked }, status: 'SUCCEEDED' }, select: { id: true } }) : Promise.resolve([]),
      productIds.length ? this.prisma.paymentLink.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, name: true, amount: true, currency: true, variants: true, extras: true } }) : Promise.resolve([]),
      // A saved cart has only an email; a newsletter profile may add a name and a WhatsApp number.
      emails.length ? this.prisma.storeNewsletterSubscriber.findMany({ where: { storeId, email: { in: emails } }, select: { email: true, name: true, phone: true } }) : Promise.resolve([]),
    ]);
    const paidIds = new Set(ownPaid.map(payment => payment.id));
    const catalog = new Map(products.map(product => [product.id, product]));
    const profiles = new Map(subscribers.map(subscriber => [subscriber.email, subscriber]));
    const carts = buildAbandonedCarts({
      // Renewals and membership joins carry a cart too, but are not store carts.
      attempts: orders.filter(order => reminderCart(order.paymentIntent.metadata)).map(order => ({
        paymentIntentId: order.paymentIntent.id, name: order.paymentIntent.customerName, email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone,
        items: orderLines(order.items), total: order.amount, currency: order.currency, leftAt: order.createdAt,
      })),
      saved: saved.map(cart => ({
        ...savedCartLines(cart.items, catalog), id: cart.id, token: cart.token, email: cart.email, name: profiles.get(cart.email)?.name ?? null, phone: profiles.get(cart.email)?.phone ?? null,
        paymentIntentId: cart.paymentIntentId, leftAt: cart.updatedAt, sentAt: cart.sentAt, paymentSucceeded: paidIds.has(cart.paymentIntentId ?? ''),
      })),
      paid: paid.map(order => ({ email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone, paidAt: order.paymentIntent.updatedAt })),
      recoveryOn: (retention?.settings as { recoveryEnabled?: unknown } | null | undefined)?.recoveryEnabled === true,
      storeUrl: store.customDomains[0] ? `https://${store.customDomains[0].hostname}` : this.link(store.slug),
      recoverUrl: token => this.link(store.slug, token),
    });
    return { anonymousSessions: sessions.cartWithoutPay, carts };
  }

  /** The same address the reminder email links to (RetentionService.link). */
  private link(slug: string, token?: string) {
    const url = new URL(`/s/${encodeURIComponent(slug)}`, this.config.get<string>('app.checkoutOrigin'));
    if (token) url.searchParams.set('recover', token);
    return url.href;
  }
}
