import { ANALYTICS_EVENT_TYPES, type AnalyticsEventType } from './store-analytics.constants';
import { daysBetween } from './store-analytics-days';

/** One StoreAnalyticsDaily row with its day as YYYY-MM-DD. `productId` / `target` are '' for none. */
export type RollupRow = { day: string; type: string; productId: string; target: string; count: number; uniqueSessions: number };
/**
 * The rollup's per-(type, day) row (productId and target both `*`): its uniqueSessions is COUNT(DISTINCT session) over
 * every product and label of that type, so a shopper who views three products is one session, not three.
 */
export const ROLLUP_ALL = '*';
type Tally = { count: number; sessions: number };
export type CheckoutStep = { step: string; optional: boolean; sessions: number; dropOff: number | null };

/** The checkout path in the order a shopper walks it. Delivery is skipped by digital-only and pickup-less stores. */
const CHECKOUT_PATH: { step: string; type: string; target: string; optional: boolean }[] = [
  { step: 'cart_open', type: 'cart_open', target: '', optional: false },
  { step: 'review', type: 'checkout_step', target: 'review', optional: false },
  { step: 'delivery', type: 'checkout_step', target: 'delivery', optional: true },
  { step: 'pay_click', type: 'pay_click', target: '', optional: false },
  { step: 'contact', type: 'checkout_step', target: 'contact', optional: false },
  { step: 'payment', type: 'checkout_step', target: 'payment', optional: false },
];
const rate = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

/**
 * The read API's answer, from rollup rows only. "sessions" over a range is the sum of each day's unique sessions
 * (a session crossing midnight counts twice). addRate = add sessions per view session, in percent; it can exceed
 * 100 when shoppers add from the card without opening the product.
 */
export function buildAnalyticsReport(rows: RollupRow[], names: Map<string, string>, from: string, to: string) {
  const days = daysBetween(from, to);
  const totals = Object.fromEntries(ANALYTICS_EVENT_TYPES.map(type => [type, { count: 0, sessions: 0 }])) as Record<AnalyticsEventType, Tally>;
  // Per (type, day): the rollup's `*` row when present; rows rolled before it existed fall back to the sum.
  const daily = new Map<string, Tally>();
  const dailyAll = new Map<string, Tally>();
  const products = new Map<string, { impressions: number; cardClicks: number; views: number; adds: number; viewSessions: number; addSessions: number }>();
  const ctas = new Map<string, { clicks: number; sessions: number }>();
  const devices = new Map<string, { pageViews: number; sessions: number }>([['mobile', { pageViews: 0, sessions: 0 }], ['desktop', { pageViews: 0, sessions: 0 }]]);
  const referrers = new Map<string, number>();
  const steps = new Map<string, number>();
  for (const row of rows) {
    if (row.type === '_device') { const device = devices.get(row.target); if (device) { device.pageViews += row.count; device.sessions += row.uniqueSessions; } continue; }
    if (row.type === '_referrer') { referrers.set(row.target, (referrers.get(row.target) || 0) + row.uniqueSessions); continue; }
    if (!totals[row.type as AnalyticsEventType]) continue;
    const key = `${row.type}|${row.day}`;
    if (row.productId === ROLLUP_ALL && row.target === ROLLUP_ALL) { dailyAll.set(key, { count: row.count, sessions: row.uniqueSessions }); continue; }
    const point = daily.get(key) || { count: 0, sessions: 0 };
    point.count += row.count; point.sessions += row.uniqueSessions; daily.set(key, point);
    const stepKey = `${row.type}|${row.target}`;
    steps.set(stepKey, (steps.get(stepKey) || 0) + row.uniqueSessions);
    if (row.type === 'cta_click' && row.target) {
      const cta = ctas.get(row.target) || { clicks: 0, sessions: 0 };
      cta.clicks += row.count; cta.sessions += row.uniqueSessions; ctas.set(row.target, cta);
    }
    if (row.productId && ['product_card_impression', 'product_card_click', 'product_view', 'add_to_cart'].includes(row.type)) {
      const product = products.get(row.productId) || { impressions: 0, cardClicks: 0, views: 0, adds: 0, viewSessions: 0, addSessions: 0 };
      if (row.type === 'product_card_impression') product.impressions += row.count;
      if (row.type === 'product_card_click') product.cardClicks += row.count;
      if (row.type === 'product_view') { product.views += row.count; product.viewSessions += row.uniqueSessions; }
      if (row.type === 'add_to_cart') { product.adds += row.count; product.addSessions += row.uniqueSessions; }
      products.set(row.productId, product);
    }
  }
  for (const [key, point] of dailyAll) daily.set(key, point);
  for (const [key, point] of daily) { const total = totals[key.slice(0, key.indexOf('|')) as AnalyticsEventType]; total.count += point.count; total.sessions += point.sessions; }
  const series = Object.fromEntries(ANALYTICS_EVENT_TYPES.map(type => [type, days.map(day => ({ day, ...(daily.get(`${type}|${day}`) || { count: 0, sessions: 0 }) }))])) as Record<AnalyticsEventType, ({ day: string } & Tally)[]>;
  const topProducts = [...products].sort(([, a], [, b]) => b.views - a.views || b.adds - a.adds).slice(0, 10).map(([productId, p]) => ({
    productId, name: names.get(productId) ?? 'Producto eliminado', impressions: p.impressions, cardClicks: p.cardClicks, views: p.views, adds: p.adds,
    addRate: p.viewSessions ? rate(p.addSessions, p.viewSessions) : null,
  }));
  let previous: number | null = null;
  const checkoutSteps: CheckoutStep[] = CHECKOUT_PATH.map(({ step, type, target, optional }) => {
    const sessions = steps.get(`${type}|${target}`) || 0;
    // Loss from the last required step; a later step reached by another path never shows a negative loss.
    const dropOff = previous ? Math.max(0, rate(previous - sessions, previous)) : null;
    if (!optional) previous = sessions;
    return { step, optional, sessions, dropOff };
  });
  return {
    from, to, granularity: 'day' as const, totals, series, topProducts,
    topCtas: [...ctas].map(([target, cta]) => ({ target, ...cta })).sort((a, b) => b.clicks - a.clicks),
    devices: [...devices].map(([device, d]) => ({ device, ...d })),
    referrers: [...referrers].map(([host, sessions]) => ({ host, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 10),
    checkoutSteps,
  };
}
