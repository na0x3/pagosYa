import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cleanSwitches, decide, finishedSummary, mergeKept, nextChange, ordersDropped, type SellingSignals, type SideStats } from './selling-rules';
import { stopSellingTest } from './selling-store';

const DAY = 86_400_000;
const PAID = { paymentIntent: { status: 'SUCCEEDED' as const } };

/**
 * «La tienda que vende sola» (spec 2026-11-16): once a day each published store with «Mejora automática» on either judges its running
 * selling test (keep or undo), or starts the next change as a test on the published design. A real drop in weekly orders undoes the
 * newest kept change. The merchant reads the week on the dashboard and can undo anything.
 */
@Injectable()
export class SellingService {
  private readonly log = new Logger(SellingService.name);
  constructor(private readonly prisma: PrismaService) {}

  async runDaily(now = new Date()) {
    const stores = await this.prisma.store.findMany({ where: { autoImprove: true, status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true, publishedSourceRevision: true } });
    let started = 0, judged = 0;
    for (const store of stores) {
      try { const did = await this.runStore(store as { id: string; publishedSourceRevision: number }, now); if (did === 'started') started++; if (did === 'judged') judged++; }
      catch (error) { this.log.warn(JSON.stringify({ event: 'selling_store_failed', storeId: store.id, reason: String((error as Error)?.message ?? error).slice(0, 200) })); }
    }
    this.log.log(JSON.stringify({ event: 'selling_daily', stores: stores.length, started, judged }));
  }

  async runStore(store: { id: string; publishedSourceRevision: number }, now = new Date()): Promise<'started' | 'judged' | 'idle'> {
    await this.healEnded(store.id, now);
    await this.guardOrders(store.id, now);
    const running = await this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: store.id } });
    if (running) {
      if (running.kind !== 'selling') return 'idle';
      await this.judge(store.id, running, now);
      return 'judged';
    }
    return await this.startNext(store, now) ? 'started' : 'idle';
  }

  /** A trying change whose test ended outside this job (the merchant ended it on «Pruebas A/B») follows the winner they chose. */
  private async healEnded(storeId: string, now: Date) {
    const trying = await this.prisma.storeSellingChange.findMany({ where: { storeId, status: 'TRYING' } });
    for (const change of trying) {
      const test = change.experimentId ? await this.prisma.storeSourceExperiment.findFirst({ where: { id: change.experimentId } }) : null;
      if (test?.status === 'RUNNING') continue;
      const kept = test?.status === 'COMPLETED' && test.winner === 'B';
      await this.prisma.storeSellingChange.update({ where: { id: change.id }, data: { status: kept ? 'KEPT' : 'UNDONE', endedAt: now, ...(change.summary ? { summary: kept ? `${change.summary} — lo elegiste tú` : `${change.summary} — prueba terminada` } : {}) } });
    }
  }

  private async guardOrders(storeId: string, now: Date) {
    const week = new Date(now.getTime() - 7 * DAY), before = new Date(now.getTime() - 35 * DAY);
    const lastWeek = await this.prisma.storeOrder.count({ where: { storeId, createdAt: { gte: week }, ...PAID } });
    const previous = await this.prisma.storeOrder.count({ where: { storeId, createdAt: { gte: before, lt: week }, ...PAID } });
    if (!ordersDropped(lastWeek, previous)) return;
    const newest = await this.prisma.storeSellingChange.findFirst({ where: { storeId, status: 'KEPT', endedAt: { gte: new Date(now.getTime() - 28 * DAY) } }, orderBy: { endedAt: 'desc' } });
    if (!newest) return;
    await this.prisma.storeSellingChange.update({ where: { id: newest.id }, data: { status: 'UNDONE', endedAt: now, summary: `${(newest.summary ?? 'Cambio').replace(/ — .*$/, '')} — deshecho: bajaron los pedidos de la semana` } });
  }

  private async sideStats(storeId: string, experimentId: string): Promise<{ a: SideStats; b: SideStats }> {
    const rows = await this.prisma.storeAnalyticsEvent.findMany({ where: { experimentId, type: { in: ['page_view', 'add_to_cart'] } }, select: { variant: true, sessionHash: true, type: true }, take: 400_000 });
    const sessions = (variant: string, type: string) => new Set(rows.filter(row => row.variant === variant && row.type === type).map(row => row.sessionHash)).size;
    const orders = await this.prisma.storeOrder.findMany({ where: { storeId, sourceVisit: { experimentId }, ...PAID }, select: { sourceVisit: { select: { variant: true } } } });
    const ordered = (variant: string) => orders.filter(order => order.sourceVisit?.variant === variant).length;
    const side = (variant: string): SideStats => ({ visits: sessions(variant, 'page_view'), adds: sessions(variant, 'add_to_cart'), orders: ordered(variant) });
    return { a: side('A'), b: side('B') };
  }

  private async judge(storeId: string, test: { id: string; startedAt: Date; extendedUntil?: Date | null }, now: Date) {
    const stats = await this.sideStats(storeId, test.id);
    const { decision, lift } = decide({ days: (now.getTime() - test.startedAt.getTime()) / DAY, ...stats });
    if (decision === 'WAIT') return;
    const keep = decision === 'KEEP';
    const ended = await this.prisma.storeSourceExperiment.updateMany({ where: { id: test.id, status: 'RUNNING' }, data: { status: keep ? 'COMPLETED' : 'STOPPED', winner: keep ? 'B' : 'A', activeStoreId: null, endedAt: now } });
    if (!ended.count) return;
    const change = await this.prisma.storeSellingChange.findFirst({ where: { experimentId: test.id, status: 'TRYING' } });
    if (change) await this.prisma.storeSellingChange.update({ where: { id: change.id }, data: { status: keep ? 'KEPT' : 'UNDONE', endedAt: now, summary: finishedSummary(change.summary ?? 'Cambio', decision, lift), evidence: { ...stats, lift: Math.round(lift * 1000) / 1000 } } });
  }

  private async signals(storeId: string, now: Date): Promise<SellingSignals> {
    const since = new Date(now.getTime() - 14 * DAY);
    const orders = await this.prisma.storeOrder.findMany({ where: { storeId, createdAt: { gte: since }, ...PAID }, select: { items: true } });
    const counts = new Map<string, number>();
    for (const order of orders) {
      const ids = new Set((Array.isArray(order.items) ? order.items as Array<{ paymentLinkId?: unknown }> : []).map(line => line?.paymentLinkId).filter((id): id is string => typeof id === 'string'));
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const names = counts.size ? await this.prisma.paymentLink.findMany({ where: { storeId, id: { in: [...counts.keys()] } }, select: { id: true, name: true } }) : [];
    const bestSellers = names.map(link => ({ productId: link.id, name: link.name, orders: counts.get(link.id) ?? 0 }));
    const events = await this.prisma.storeAnalyticsEvent.findMany({ where: { storeId, createdAt: { gte: since }, type: { in: ['section_view', 'section_click'] } }, select: { type: true, target: true, sessionHash: true }, take: 400_000 });
    const byIndex = new Map<number, { views: Set<string>; clicks: Set<string> }>();
    for (const event of events) {
      const index = Number(/^s(\d{1,2})$/.exec(event.target ?? '')?.[1]);
      if (!Number.isInteger(index)) continue;
      const entry = byIndex.get(index) ?? { views: new Set<string>(), clicks: new Set<string>() };
      (event.type === 'section_view' ? entry.views : entry.clicks).add(event.sessionHash);
      byIndex.set(index, entry);
    }
    return { bestSellers, sections: [...byIndex].map(([index, entry]) => ({ index, views: entry.views.size, clicks: entry.clicks.size })) };
  }

  private async startNext(store: { id: string; publishedSourceRevision: number }, now: Date): Promise<boolean> {
    const history = await this.prisma.storeSellingChange.findMany({ where: { storeId: store.id } });
    const next = nextChange(await this.signals(store.id, now), history, mergeKept(history), now);
    if (!next) return false;
    await this.prisma.$transaction(async tx => {
      const test = await tx.storeSourceExperiment.create({ data: { storeId: store.id, activeStoreId: store.id, kind: 'selling', controlRevision: store.publishedSourceRevision, variantRevision: store.publishedSourceRevision, variantSettings: next.settings, request: next.summary.slice(0, 200) } });
      await tx.storeSellingChange.create({ data: { storeId: store.id, kind: next.kind, settings: next.settings, status: 'TRYING', experimentId: test.id, summary: next.summary } });
    });
    return true;
  }

  // ── Merchant side ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  private async owned(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, autoImprove: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  /** «Tu tienda esta semana»: what is being tried, what was kept and what was undone in the last 7 days. */
  async summary(merchantId: string, storeId: string, now = new Date()) {
    const store = await this.owned(merchantId, storeId);
    const changes = await this.prisma.storeSellingChange.findMany({ where: { storeId }, orderBy: { startedAt: 'desc' }, take: 40 });
    const week = now.getTime() - 7 * DAY;
    const view = (change: (typeof changes)[number]) => ({ id: change.id, kind: change.kind, summary: change.summary ?? '', status: change.status, startedAt: change.startedAt, endedAt: change.endedAt });
    const trying = changes.find(change => change.status === 'TRYING');
    return {
      autoImprove: store.autoImprove,
      trying: trying ? { ...view(trying), daysLeft: Math.max(0, 14 - Math.floor((now.getTime() - trying.startedAt.getTime()) / DAY)) } : null,
      kept: changes.filter(change => change.status === 'KEPT').map(view),
      undone: changes.filter(change => change.status === 'UNDONE' && (change.endedAt?.getTime() ?? 0) >= week).map(view),
      switches: cleanSwitches(mergeKept(changes)),
    };
  }

  async undo(merchantId: string, storeId: string, changeId: string) {
    await this.owned(merchantId, storeId);
    const change = await this.prisma.storeSellingChange.findFirst({ where: { id: changeId, storeId } });
    if (!change || change.status === 'UNDONE') throw new NotFoundException('Ese cambio ya no está activo.');
    if (change.status === 'TRYING' && change.experimentId) await stopSellingTest(this.prisma, change.experimentId, 'Deshecho por ti');
    else await this.prisma.storeSellingChange.update({ where: { id: change.id }, data: { status: 'UNDONE', endedAt: new Date(), summary: `${(change.summary ?? 'Cambio').replace(/ — .*$/, '')} — lo deshiciste tú` } });
    return this.summary(merchantId, storeId);
  }

  /** Off stops the change being tried; kept changes stay until the merchant undoes them. */
  async setAutoImprove(merchantId: string, storeId: string, on: boolean) {
    await this.owned(merchantId, storeId);
    await this.prisma.store.update({ where: { id: storeId }, data: { autoImprove: on } });
    if (!on) {
      const running = await this.prisma.storeSourceExperiment.findFirst({ where: { storeId, kind: 'selling', status: 'RUNNING' } });
      if (running) await stopSellingTest(this.prisma, running.id, 'Mejora automática apagada');
    }
    return this.summary(merchantId, storeId);
  }
}
