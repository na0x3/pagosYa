import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { deviceClass, normalizeAnalyticsBatch } from './store-analytics-input';
import { addDays, boliviaDay, boliviaDayStart, dayCount } from './store-analytics-days';
import { buildAnalyticsReport, ROLLUP_ALL } from './store-analytics-report';
import { ANALYTICS_RETENTION_MONTHS, ANALYTICS_SESSION_DAILY_CAP, ANALYTICS_SESSION_DAILY_PAGE_VIEW_CAP } from './store-analytics.constants';

export type IngestContext = { userAgent?: string; gpc?: boolean };
const PRUNE_BATCH = 5000;
const MAX_REPORT_DAYS = 400;
/** Report days are real calendar days in these years (the query DTO pins the same bounds). */
const FIRST_YEAR = 2020;
const LAST_YEAR = 2100;

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

  /**
   * Rebuilds the rollup of the last `days` Bolivia days (today included) from the raw rows: remove those days, insert
   * fresh ones, in one transaction under an advisory lock (a second instance skips). Running it again gives the same
   * rows. Each type also gets a (type, day) row with productId and target `*` whose sessions are distinct across every
   * product and label (the report's totals and series read it). One session adds at most 5 to a (type, product, label)
   * count a day (20 page views), so a replaying script cannot inflate the numbers. Derived rows from page_view: `_device` (target = device) and `_referrer` (target = the session's referrer
   * host, or `direct`; count = sessions). createdAt is UTC wall time, so the Bolivia day is createdAt − 4 h; the
   * bounds are cast explicitly because the server's TimeZone setting is not UTC everywhere.
   */
  async rollup({ now = new Date(), days = 2 }: { now?: Date; days?: number } = {}): Promise<{ rolled: boolean; rows: number }> {
    const firstDay = addDays(boliviaDay(now), -(Math.max(1, days) - 1));
    const since = boliviaDayStart(firstDay).toISOString();
    return this.prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('store-analytics-rollup')) AS locked`;
      if (!lock?.locked) return { rolled: false, rows: 0 };
      await tx.$executeRaw`DELETE FROM "StoreAnalyticsDaily" WHERE "day" >= ${firstDay}::date`;
      const rows = await tx.$executeRaw`
        WITH e AS (
          SELECT "storeId", ("createdAt" - interval '4 hours')::date AS day, "type", COALESCE("productId", '') AS "productId",
                 COALESCE("target", '') AS "target", "device", "referrerHost", "sessionHash"
          FROM "StoreAnalyticsEvent" WHERE "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        ), s AS (
          -- One row per session and (type, product, label) a day, its weight capped: a replayed click counts a few times at most.
          SELECT "storeId", day, "type", "productId", "target", "sessionHash",
                 LEAST(COUNT(*), CASE WHEN "type" = 'page_view' THEN ${ANALYTICS_SESSION_DAILY_PAGE_VIEW_CAP}::int ELSE ${ANALYTICS_SESSION_DAILY_CAP}::int END)::int AS n
          FROM e GROUP BY "storeId", day, "type", "productId", "target", "sessionHash"
        ), r AS (
          SELECT "storeId", day, "type", "productId", "target", SUM(n)::int AS count, COUNT(*)::int AS sessions
          FROM s GROUP BY "storeId", day, "type", "productId", "target"
          UNION ALL
          SELECT "storeId", day, "type", '*', '*', SUM(n)::int, COUNT(DISTINCT "sessionHash")::int
          FROM s GROUP BY "storeId", day, "type"
          UNION ALL
          SELECT "storeId", day, '_device', '', "device", SUM(n)::int, COUNT(*)::int
          FROM (SELECT "storeId", day, "device", "sessionHash", LEAST(COUNT(*), ${ANALYTICS_SESSION_DAILY_PAGE_VIEW_CAP}::int) AS n FROM e WHERE "type" = 'page_view' GROUP BY "storeId", day, "device", "sessionHash") d
          GROUP BY "storeId", day, "device"
          UNION ALL
          SELECT "storeId", day, '_referrer', '', COALESCE(ref, 'direct'), COUNT(*)::int, COUNT(*)::int
          FROM (SELECT "storeId", day, "sessionHash", MAX("referrerHost") AS ref FROM e WHERE "type" = 'page_view' GROUP BY "storeId", day, "sessionHash") l
          GROUP BY "storeId", day, COALESCE(ref, 'direct')
        )
        INSERT INTO "StoreAnalyticsDaily" ("id", "storeId", "day", "type", "productId", "target", "count", "uniqueSessions", "updatedAt")
        SELECT gen_random_uuid()::text, "storeId", day, "type", "productId", "target", count, sessions, (now() AT TIME ZONE 'UTC') FROM r`;
      return { rolled: true, rows };
    }, { timeout: 120_000 });
  }

  /**
   * The merchant read API (G2 draws it). Bolivia days, both included; default the last 30; at most 400. Rollups only,
   * so the numbers lag at most one worker tick (15 minutes).
   */
  async report(merchantId: string, storeId: string, query: { from?: string; to?: string } = {}) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, checkoutMode: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const valid = (day?: string) => {
      if (!day) return true;
      const at = Date.parse(`${day}T00:00:00Z`);
      if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day) return false;
      const year = Number(day.slice(0, 4));
      return year >= FIRST_YEAR && year <= LAST_YEAR;
    };
    if (!valid(query.from) || !valid(query.to)) throw new BadRequestException(`Usa fechas reales entre ${FIRST_YEAR} y ${LAST_YEAR} con el formato AAAA-MM-DD`);
    const to = query.to || boliviaDay(new Date());
    const from = query.from || addDays(to, -29);
    // Arithmetic, before any day is listed: a long or far-future range never iterates.
    const days = dayCount(from, to);
    if (days < 1) throw new BadRequestException('La fecha inicial debe ser anterior a la final');
    if (days > MAX_REPORT_DAYS) throw new BadRequestException(`Elige un rango de hasta ${MAX_REPORT_DAYS} días`);
    const rows = await this.prisma.storeAnalyticsDaily.findMany({
      where: { storeId, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { day: true, type: true, productId: true, target: true, count: true, uniqueSessions: true },
    });
    const rollup = rows.map(row => ({ ...row, day: row.day.toISOString().slice(0, 10) }));
    const ids = [...new Set(rollup.filter(row => row.productId && row.productId !== ROLLUP_ALL).map(row => row.productId))];
    const names = new Map(ids.length ? (await this.prisma.paymentLink.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, name: true } })).map(product => [product.id, product.name]) : []);
    return buildAnalyticsReport(rollup, names, from, to, store.checkoutMode);
  }

  /** Removes raw events older than 13 calendar months, 5 000 at a time. Rollups are kept (no personal data). */
  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - ANALYTICS_RETENTION_MONTHS);
    const before = cutoff.toISOString();
    let removed = 0;
    for (let round = 0; round < 200; round++) {
      const deleted = await this.prisma.$executeRaw`DELETE FROM "StoreAnalyticsEvent" WHERE "id" IN (SELECT "id" FROM "StoreAnalyticsEvent" WHERE "createdAt" < (${before}::timestamptz AT TIME ZONE 'UTC') LIMIT ${PRUNE_BATCH})`;
      removed += deleted;
      if (deleted < PRUNE_BATCH) break;
    }
    return removed;
  }
}
