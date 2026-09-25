import { BadRequestException } from '@nestjs/common';
import {
  ANALYTICS_CHECKOUT_STEPS, ANALYTICS_EVENT_TYPES, ANALYTICS_MAX_BATCH, ANALYTICS_PRODUCT_EVENTS, ANALYTICS_TRACK_LABELS,
  type AnalyticsEventType,
} from './store-analytics.constants';

export type NormalizedAnalyticsEvent = { type: AnalyticsEventType; productId: string | null; target: string | null; path: string | null };
export type NormalizedAnalyticsBatch = { sessionId: string; events: NormalizedAnalyticsEvent[]; referrerHost: string | null };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[\w-]{1,64}$/;
/** A store page file such as `product.html`: never a path with directories or a query. */
const PAGE = /^[a-z0-9][a-z0-9_-]{0,60}\.html$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const pick = <T extends string>(list: readonly T[], value: unknown): T | null => typeof value === 'string' && (list as readonly string[]).includes(value) ? value as T : null;

/** A referrer reduced to its host name (lower case, no `www.`); anything else is null. */
export function referrerHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  let host = value.trim().toLowerCase();
  if (host.includes('://')) {
    try {
      const url = new URL(host);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      host = url.hostname;
    } catch { return null; }
  }
  host = host.replace(/^www\./, '');
  return HOST.test(host) ? host : null;
}

/** Two classes are enough to steer a merchant; the user agent itself is never stored. */
export function deviceClass(userAgent?: string): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent || '') ? 'mobile' : 'desktop';
}

function normalizeEvent(raw: unknown): NormalizedAnalyticsEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const type = pick(ANALYTICS_EVENT_TYPES, input.type);
  if (!type) return null;
  const productId = typeof input.productId === 'string' && PRODUCT_ID.test(input.productId) ? input.productId : null;
  const product = ANALYTICS_PRODUCT_EVENTS.includes(type);
  if (product && !productId) return null;
  let target: string | null = null;
  if (type === 'cta_click') { target = pick(ANALYTICS_TRACK_LABELS, input.target); if (!target) return null; }
  if (type === 'checkout_step') { target = pick(ANALYTICS_CHECKOUT_STEPS, input.step); if (!target) return null; }
  const path = typeof input.path === 'string' && PAGE.test(input.path) ? input.path : null;
  return { type, productId: product || type === 'cta_click' ? productId : null, target, path };
}

/**
 * A strict envelope (a v4 session UUID and 1–20 events, else 400) with each event checked on its own: an invalid
 * event is dropped so one stale field from an older kit does not lose the rest. Only known fields survive.
 */
export function normalizeAnalyticsBatch(body: unknown): NormalizedAnalyticsBatch {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (!input || typeof input.sessionId !== 'string' || !UUID_V4.test(input.sessionId)) throw new BadRequestException('Sesión no válida');
  if (!Array.isArray(input.events) || !input.events.length || input.events.length > ANALYTICS_MAX_BATCH) throw new BadRequestException(`Envía entre 1 y ${ANALYTICS_MAX_BATCH} eventos`);
  const events = input.events.map(normalizeEvent).filter((event): event is NormalizedAnalyticsEvent => event !== null);
  return { sessionId: input.sessionId, events, referrerHost: referrerHost(input.referrer) };
}
