import { StoreFunnelService } from './store-funnel.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StoreAnalyticsService } from '../store-analytics/store-analytics.service';
import { storePolicies } from '../stores/store-presentation';
import { buildGrowthInsights, selectInsights } from './growth-insights';
import { buildGrowthOverview, growthPeriods } from './growth-overview';

export const GROWTH_PERIODS = [7, 30, 90] as const;
export type GrowthPeriodDays = typeof GROWTH_PERIODS[number];
export type InsightAction = 'dismiss' | 'snooze' | 'restore';
const SNOOZE_MS = 7 * 86_400_000;
/** Growth reads the whole catalog, bounded like the Store Brain. */
const GROWTH_PRODUCTS = 500;

export type GrowthOrder = { amount: number; currency: string; partnerId: string | null; partnerCommissionBps: number | null; items: unknown; paymentIntent: { status: string; transactions: { amount: number }[] } };
export function summarizeGrowth(orders: GrowthOrder[]) {
  const currencies = new Map<string, { currency: string; paidOrders: number; netSales: number }>();
  const partners = new Map<string, { partnerId: string; currency: string; paidOrders: number; netSales: number; commission: number }>();
  const products = new Map<string, { id: string; name: string; orders: number }>();
  for (const order of orders) {
    if (order.paymentIntent.status !== 'SUCCEEDED') continue;
    const net = Math.max(0, order.amount - order.paymentIntent.transactions.reduce((sum, refund) => sum + refund.amount, 0));
    const totals = currencies.get(order.currency) || { currency: order.currency, paidOrders: 0, netSales: 0 };
    totals.paidOrders++; totals.netSales += net; currencies.set(order.currency, totals);
    if (order.partnerId) {
      const key = `${order.partnerId}:${order.currency}`;
      const row = partners.get(key) || { partnerId: order.partnerId, currency: order.currency, paidOrders: 0, netSales: 0, commission: 0 };
      row.paidOrders++; row.netSales += net;
      row.commission += Math.round(net * (order.partnerCommissionBps || 0) / 10000);
      partners.set(key, row);
    }
    if (net && Array.isArray(order.items)) {
      const seen = new Set<string>();
      for (const item of order.items) {
        if (typeof item?.paymentLinkId !== 'string' || seen.has(item.paymentLinkId)) continue;
        seen.add(item.paymentLinkId);
        const row = products.get(item.paymentLinkId) || { id: item.paymentLinkId, name: String(item.name || 'Producto'), orders: 0 };
        row.orders++; products.set(row.id, row);
      }
    }
  }
  return { totals: [...currencies.values()], partnerSales: [...partners.values()], topProducts: [...products.values()].sort((a, b) => b.orders - a.orders).slice(0, 3) };
}

@Injectable()
export class StoreGrowthService {
  constructor(private readonly prisma: PrismaService, private readonly analytics: StoreAnalyticsService) {}
  async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true, contactFormEnabled: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }
  async inbox(merchantId: string, storeId: string, status?: string, before?: string) {
    await this.owner(merchantId, storeId);
    const where = { merchantId, storeId, ...(status ? { status } : {}) };
    // A cursor is an opaque lead id scoped to this merchant, never an arbitrary record.
    const cursor = before ? await this.prisma.storeLead.findFirst({ where: { ...where, id: before }, select: { id: true } }) : null;
    if (before && !cursor) throw new NotFoundException('Mensaje no encontrado');
    const [rows, unread] = await Promise.all([
      this.prisma.storeLead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, ...(cursor ? { cursor, skip: 1 } : {}) }),
      this.prisma.storeLead.count({ where: { merchantId, storeId, status: 'NEW' } }),
    ]);
    return { items: rows.slice(0, 30), unread, nextBefore: rows.length > 30 ? rows[29].id : null };
  }
  async updateLead(merchantId: string, storeId: string, id: string, status: string) {
    await this.owner(merchantId, storeId);
    const result = await this.prisma.storeLead.updateMany({ where: { id, merchantId, storeId }, data: { status } });
    if (!result.count) throw new NotFoundException('Mensaje no encontrado');
    return { updated: true };
  }
  async partners(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    return this.prisma.storePartner.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async createPartner(merchantId: string, storeId: string, name: string, commissionBps: number) {
    await this.owner(merchantId, storeId);
    return this.prisma.storePartner.create({ data: { storeId, name: name.trim(), commissionBps, code: randomBytes(12).toString('base64url') } });
  }
  async updatePartner(merchantId: string, storeId: string, id: string, active: boolean) {
    await this.owner(merchantId, storeId);
    const result = await this.prisma.storePartner.updateMany({ where: { id, storeId }, data: { active } });
    if (!result.count) throw new NotFoundException('Socio no encontrado');
    return { updated: true };
  }
  async insights(merchantId: string, storeId: string) {
    const store = await this.owner(merchantId, storeId);
    const since = new Date(Date.now() - 30 * 86400000);
    const [orders, unread, lowStock] = await Promise.all([
      this.prisma.storeOrder.findMany({ where: { merchantId, storeId, createdAt: { gte: since }, paymentIntent: { livemode: true } }, orderBy: { createdAt: 'desc' }, take: 10001,
        select: { amount: true, currency: true, partnerId: true, partnerCommissionBps: true, items: true, paymentIntent: { select: { status: true, transactions: { where: { type: 'REFUND', status: 'SUCCEEDED' }, select: { amount: true } } } } } }),
      this.prisma.storeLead.count({ where: { merchantId, storeId, status: 'NEW' } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE', stock: { lte: 5 } }, select: { id: true, name: true, stock: true }, take: 5, orderBy: { stock: 'asc' } }),
    ]);
    const truncated = orders.length > 10000;
    const summary = summarizeGrowth(orders.slice(0, 10000));
    const suggestions: { id: string; title: string; evidence: string; action: string; view: string }[] = [];
    if (unread) suggestions.push({ id: 'inbox', title: 'Responde a tus interesados', evidence: `${unread} consultas nuevas esperan atención.`, action: 'Abrir bandeja', view: 'inbox' });
    if (lowStock.length) suggestions.push({ id: 'stock', title: 'Revisa el stock disponible', evidence: lowStock.map(p => `${p.name}: ${p.stock}`).join(' · '), action: 'Revisar productos', view: 'products' });
    const top = summary.topProducts[0];
    if (!truncated && top) suggestions.push({ id: 'top', title: `Destaca ${top.name}`, evidence: `Aparece en ${top.orders} pedidos pagados con saldo después de reembolsos en los últimos 30 días.`, action: 'Abrir diseñador', view: 'workspace' });
    if (!truncated && !summary.totals.length) suggestions.push({ id: 'start', title: 'Prepara tu primera venta', evidence: 'Todavía no hay pagos reales confirmados en los últimos 30 días. Las pruebas no cuentan como ventas.', action: 'Probar mi sitio', view: 'workspace' });
    if (!store.contactFormEnabled) suggestions.push({ id: 'form', title: 'Abre un canal de consultas', evidence: 'El formulario de contacto está desactivado.', action: 'Configurar formulario', view: 'inbox' });
    const funnel = await new StoreFunnelService(this.prisma).summary(storeId, since);
    if (funnel.matureCartAdds >= 20 && funnel.cartWithoutCheckout / funnel.matureCartAdds >= .5) suggestions.unshift({ id: 'cart-funnel', title: 'Revisa el paso del pedido al checkout', evidence: `${funnel.cartWithoutCheckout} de ${funnel.matureCartAdds} sesiones que añadieron productos no iniciaron checkout. Solo incluye sesiones con más de 24 horas; es una señal para investigar, no una causa confirmada.`, action: 'Probar el recorrido', view: 'workspace' });
    return { funnel, since: since.toISOString(), until: new Date().toISOString(), truncated, ...summary, suggestions };
  }

  /**
   * G2 "Crecimiento": this period and the previous one from the G1 rollups (every product), orders of both, the catalog,
   * leads and the device split, run through the insights engine. Ownership is checked before anything is read.
   */
  async overview(merchantId: string, storeId: string, days: GrowthPeriodDays, now = new Date()) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: {
      id: true, name: true, checkoutMode: true, status: true, sourcePublicationPaused: true, publicVisibility: true,
      publishedSourceRevision: true, websitePublishedRevision: true, policies: true, merchant: { select: { status: true } },
    } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const period = growthPeriods(now, days);
    const [current, previous, orders, catalog, paidEver, unread, oldestUnread, leadsInPeriod, devices, states] = await Promise.all([
      this.analytics.report(merchantId, storeId, { from: period.from, to: period.to }, { productLimit: GROWTH_PRODUCTS }),
      this.analytics.report(merchantId, storeId, { from: period.previousFrom, to: period.previousTo }, { productLimit: GROWTH_PRODUCTS }),
      this.prisma.storeOrder.findMany({
        where: { merchantId, storeId, createdAt: { gte: period.previousStart, lt: period.end }, paymentIntent: { livemode: true } }, orderBy: { createdAt: 'desc' }, take: 10001,
        select: { createdAt: true, amount: true, currency: true, items: true, paymentIntent: { select: { status: true, transactions: { where: { type: 'REFUND', status: 'SUCCEEDED' }, select: { amount: true } } } } },
      }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: GROWTH_PRODUCTS,
        select: { id: true, name: true, description: true, amount: true, currency: true, stock: true, imageUrls: true, createdAt: true } }),
      this.prisma.storeOrder.count({ where: { merchantId, storeId, paymentIntent: { status: 'SUCCEEDED', livemode: true } } }),
      this.prisma.storeLead.count({ where: { merchantId, storeId, status: 'NEW' } }),
      this.prisma.storeLead.findFirst({ where: { merchantId, storeId, status: 'NEW' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.storeLead.count({ where: { merchantId, storeId, createdAt: { gte: period.start, lt: period.end } } }),
      this.deviceConversion(storeId, period.start, period.end),
      this.prisma.storeGrowthInsightState.findMany({ where: { storeId }, select: { insightId: true, status: true, until: true } }),
    ]);
    const products = catalog.map(product => ({
      id: product.id, name: product.name, stock: product.stock, photos: product.imageUrls.length, amount: product.amount, currency: product.currency, createdAt: product.createdAt,
      // The Store Brain's rule: an empty description or one that only repeats the name is not a description.
      hasDescription: Boolean(product.description?.trim() && product.description.trim() !== product.name.trim()),
    }));
    const mode = store.checkoutMode;
    const { unitsSold, paidOrders, ...view } = buildGrowthOverview({ days, mode, period, current, previous, orders: orders.slice(0, 10000), products, devices });
    const policies = storePolicies(store.policies);
    const flags = {
      published: Boolean(store.publishedSourceRevision || store.websitePublishedRevision), paused: store.sourcePublicationPaused,
      hidden: !store.publicVisibility || store.status !== 'ACTIVE', verified: store.merchant.status === 'ACTIVE',
    };
    const all = buildGrowthInsights({
      days, mode, storeName: store.name, store: { ...flags, policies: { returns: Boolean(policies.returns), delivery: Boolean(policies.delivery) } },
      report: current, previousReport: previous, products, unitsSold, paidEver,
      leads: { unread, oldestUnreadAt: oldestUnread?.createdAt ?? null, inPeriod: leadsInPeriod }, devices, periodStart: period.start, now,
    });
    return {
      period: { days, from: period.from, to: period.to, previousFrom: period.previousFrom, previousTo: period.previousTo },
      checkoutMode: mode, store: { name: store.name, ...flags }, paidOrders, truncated: orders.length > 10000,
      ...view, ...selectInsights(all, states, now),
      freshness: 'Las visitas y los clics se actualizan cada 15 minutos y solo cuentan a quienes aceptaron la analítica.',
    };
  }

  /**
   * Visit and add-to-cart sessions per device. The rollups keep the device for page views only, so this reads the raw
   * events of one store over at most 90 days through the (storeId, createdAt) index; only counts leave the query.
   */
  private async deviceConversion(storeId: string, start: Date, end: Date) {
    return this.prisma.$queryRaw<{ device: string; sessions: number; addSessions: number }[]>`
      SELECT "device",
             COUNT(DISTINCT "sessionHash") FILTER (WHERE "type" = 'page_view')::int AS "sessions",
             COUNT(DISTINCT "sessionHash") FILTER (WHERE "type" = 'add_to_cart')::int AS "addSessions"
      FROM "StoreAnalyticsEvent"
      WHERE "storeId" = ${storeId}
        AND "createdAt" >= (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND "createdAt" < (${end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY "device"`;
  }

  /** "Ocultar" hides an insight for good, "Recordar en 7 días" until then, "restore" shows it again. */
  async setInsightState(merchantId: string, storeId: string, insightId: string, action: InsightAction, now = new Date()) {
    await this.owner(merchantId, storeId);
    if (action === 'restore') {
      await this.prisma.storeGrowthInsightState.deleteMany({ where: { storeId, insightId } });
      return { insightId, status: 'active', until: null };
    }
    const state = action === 'dismiss' ? { status: 'dismissed', until: null } : { status: 'snoozed', until: new Date(now.getTime() + SNOOZE_MS) };
    await this.prisma.storeGrowthInsightState.upsert({ where: { storeId_insightId: { storeId, insightId } }, create: { storeId, insightId, ...state }, update: state });
    return { insightId, ...state };
  }

  /** "Mostrar ocultas": every dismissed or snoozed insight of this store shows again. */
  async restoreInsights(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    const { count } = await this.prisma.storeGrowthInsightState.deleteMany({ where: { storeId } });
    return { restored: count };
  }
}
