import type { buildAnalyticsReport } from '../store-analytics/store-analytics-report';
import { addDays, boliviaDay, boliviaDayStart } from '../store-analytics/store-analytics-days';
import { money } from '../store-knowledge/store-knowledge';
import type { GrowthProduct } from './growth-insights';

/**
 * What "Crecimiento" draws, assembled from the G1 report of this period and the previous one, the orders of both, the
 * catalog and the device split. Pure. Numbers are sessions unless a label says otherwise; the outcome follows the
 * store's checkout mode (paid orders, WhatsApp orders or final-button clicks), so a WhatsApp store never reads about
 * payments.
 */
type Report = ReturnType<typeof buildAnalyticsReport>;
export type GrowthPeriod = { days: number; from: string; to: string; previousFrom: string; previousTo: string; start: Date; end: Date; previousStart: Date };
export type GrowthOrderRow = { createdAt: Date; amount: number; currency: string; items: unknown; paymentIntent: { status: string; transactions: { amount: number }[] } };
export type GrowthOverviewInput = {
  days: number;
  mode: string;
  period: GrowthPeriod;
  current: Report;
  previous: Report;
  /** Orders created from the previous period's start to the period's end (any status; only paid ones count). */
  orders: GrowthOrderRow[];
  products: GrowthProduct[];
  devices: { device: string; sessions: number; addSessions: number }[];
};
export type Kpi = { id: string; label: string; value: number | null; previous: number | null; delta: number | null; format: 'count' | 'percent'; detail: string | null; note: string | null };

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const round1 = (value: number) => Math.round(value * 10) / 10;
const share = (part: number, whole: number) => whole ? round1(part / whole * 100) : 0;
const change = (value: number, previous: number) => previous ? round1((value - previous) / previous * 100) : null;
const plural = (n: number, one: string, many: string) => `${number.format(n)} ${n === 1 ? one : many}`;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export const CTA_LABELS: Record<string, string> = {
  'hero-cta': 'Botón principal (portada)', 'nav-cart': 'Carrito (menú)', 'nav-catalog': 'Catálogo (menú)', card: 'Tarjeta de producto',
  add: 'Añadir al carrito', checkout: 'Ir al pedido', pay: 'Botón final del pedido', whatsapp: 'WhatsApp', contact: 'Contacto',
  promo: 'Promoción', social: 'Redes sociales', newsletter: 'Suscripción',
};
const OUTCOME = {
  payment: { kpi: 'Ventas pagadas', funnel: 'Pagaron', week: ['venta pagada', 'ventas pagadas'] },
  whatsapp: { kpi: 'Pedidos por WhatsApp', funnel: 'Pidieron por WhatsApp', week: ['pedido por WhatsApp', 'pedidos por WhatsApp'] },
  external: { kpi: 'Clics en el botón final', funnel: 'Tocaron el botón final', week: ['clic en el botón final', 'clics en el botón final'] },
} as const;
function stepLabel(step: string, mode: string) {
  if (step === 'pay_click') return mode === 'whatsapp' ? 'Tocaron «Pedir por WhatsApp»' : mode === 'payment' ? 'Tocaron «Pagar»' : 'Tocaron el botón final';
  return ({ cart_open: 'Abrieron el carrito', review: 'Vieron el resumen', delivery: 'Eligieron la entrega', whatsapp: 'Abrieron WhatsApp', contact: 'Abrieron el formulario seguro', payment: 'Llegaron al pago' } as Record<string, string>)[step] || step;
}

/** This period (Bolivia days, today included) and the same length just before. */
export function growthPeriods(now: Date, days: number): GrowthPeriod {
  const to = boliviaDay(now);
  const from = addDays(to, -(days - 1));
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return { days, from, to, previousFrom, previousTo, start: boliviaDayStart(from), end: boliviaDayStart(addDays(to, 1)), previousStart: boliviaDayStart(previousFrom) };
}

/** Paid orders inside [start, end): count, net sales per currency (refunds out) and units per product. */
function paid(orders: GrowthOrderRow[], start: Date, end: Date) {
  let count = 0;
  const net = new Map<string, number>();
  const units: Record<string, number> = {};
  for (const order of orders) {
    if (order.paymentIntent.status !== 'SUCCEEDED' || order.createdAt < start || order.createdAt >= end) continue;
    const value = Math.max(0, order.amount - order.paymentIntent.transactions.reduce((total, refund) => total + refund.amount, 0));
    count++;
    net.set(order.currency, (net.get(order.currency) || 0) + value);
    if (!value || !Array.isArray(order.items)) continue;
    for (const line of order.items as { paymentLinkId?: unknown; quantity?: unknown }[]) {
      if (typeof line?.paymentLinkId !== 'string') continue;
      const quantity = Number.isInteger(line.quantity) && Number(line.quantity) > 0 ? Number(line.quantity) : 1;
      units[line.paymentLinkId] = (units[line.paymentLinkId] || 0) + quantity;
    }
  }
  const sales = [...net].filter(([, value]) => value > 0).map(([currency, value]) => money(value, currency)).join(' · ');
  return { count, sales, units };
}

export function buildGrowthOverview(input: GrowthOverviewInput) {
  const { mode: rawMode, current, previous, period } = input;
  const mode = (rawMode in OUTCOME ? rawMode : 'payment') as keyof typeof OUTCOME;
  const step = (report: Report, name: string) => report.checkoutSteps.find(s => s.step === name)?.sessions || 0;
  const now = paid(input.orders, period.start, period.end);
  const before = paid(input.orders, period.previousStart, period.start);
  const outcomeOf = (report: Report, orders: { count: number }) => mode === 'payment' ? orders.count : step(report, mode === 'whatsapp' ? 'whatsapp' : 'pay_click');
  const visits = current.totals.page_view.sessions;
  const previousVisits = previous.totals.page_view.sessions;
  const outcome = outcomeOf(current, now);
  const previousOutcome = outcomeOf(previous, before);
  // Visits count only consented shoppers; paid orders count everyone. More outcomes than visits is no conversion rate.
  const conversion = (made: number, seen: number) => seen && made <= seen ? round1(made / seen * 100) : null;
  const count = (id: string, label: string, value: number, was: number, detail: string | null = null): Kpi => ({ id, label, value, previous: was, delta: change(value, was), format: 'count', detail, note: null });
  const rate = conversion(outcome, visits);
  const previousRate = conversion(previousOutcome, previousVisits);
  const kpis: Kpi[] = [
    count('visits', 'Visitas', visits, previousVisits),
    count('productViews', 'Vieron productos', current.totals.product_view.sessions, previous.totals.product_view.sessions),
    count('addToCart', 'Añadieron al carrito', current.totals.add_to_cart.sessions, previous.totals.add_to_cart.sessions),
    count('checkouts', 'Pedidos iniciados', step(current, 'review'), step(previous, 'review')),
    count('outcome', OUTCOME[mode].kpi, outcome, previousOutcome, mode === 'payment' && now.sales ? `${now.sales} netos` : null),
    {
      id: 'conversion', label: 'Conversión', value: rate, previous: previousRate, delta: rate !== null && previousRate !== null ? round1(rate - previousRate) : null, format: 'percent', detail: null,
      note: visits && rate === null ? 'Hubo más resultados que visitas medidas: las visitas solo cuentan a quienes aceptaron la analítica.' : null,
    },
  ];

  const funnelSteps: [string, string, number][] = [
    ['visits', 'Visitas', visits], ['views', 'Vieron un producto', current.totals.product_view.sessions], ['adds', 'Añadieron al carrito', current.totals.add_to_cart.sessions],
    ['checkout', 'Iniciaron el pedido', step(current, 'review')], ['outcome', OUTCOME[mode].funnel, outcome],
  ];
  const funnel = funnelSteps.map(([id, label, sessions], index) => {
    const before = index ? funnelSteps[index - 1][2] : 0;
    return { id, label, sessions, share: share(sessions, visits), dropOff: index && before ? Math.max(0, round1((before - sessions) / before * 100)) : null };
  });

  const days = current.series.page_view.map(point => point.day);
  const series = (report: Report, type: keyof Report['series']) => report.series[type].map(point => point.sessions);
  const checkoutSeries = [
    { id: 'cart_open', label: 'Abrieron el carrito', values: series(current, 'cart_open') },
    mode === 'whatsapp'
      ? { id: 'whatsapp_click', label: 'Pedidos por WhatsApp', values: series(current, 'whatsapp_click') }
      : { id: 'pay_click', label: mode === 'payment' ? 'Tocaron «Pagar»' : 'Tocaron el botón final', values: series(current, 'pay_click') },
  ];

  const active = new Map(input.products.map(product => [product.id, product]));
  const tableRow = (productId: string, name: string, views: number, adds: number, addRate: number | null) => ({
    productId, name, views, adds, addRate, sold: now.units[productId] || 0, stock: active.get(productId)?.stock ?? null, active: active.has(productId),
  });
  const viewed = current.topProducts.filter(product => product.viewSessions > 0);
  const top = viewed.slice(0, 5).map(p => tableRow(p.productId, p.name, p.viewSessions, p.addSessions, p.addRate));
  const stats = new Map(current.topProducts.map(product => [product.productId, product]));
  const bottom = input.products
    .filter(product => !top.some(row => row.productId === product.id))
    .map(product => ({ product, stat: stats.get(product.id) }))
    .sort((a, b) => (a.stat?.viewSessions || 0) - (b.stat?.viewSessions || 0) || a.product.createdAt.getTime() - b.product.createdAt.getTime())
    .slice(0, 5)
    .map(({ product, stat }) => tableRow(product.id, product.name, stat?.viewSessions || 0, stat?.addSessions || 0, stat?.addRate ?? null));

  const deviceTotal = sum(input.devices.map(device => device.sessions));
  const devices = ['mobile', 'desktop'].map(device => {
    const row = input.devices.find(d => d.device === device) || { sessions: 0, addSessions: 0 };
    return { device, label: device === 'mobile' ? 'Celular' : 'Computadora', sessions: row.sessions, share: share(row.sessions, deviceTotal), addRate: row.sessions ? share(row.addSessions, row.sessions) : null };
  });
  const referrerTotal = Math.max(visits, sum(current.referrers.map(ref => ref.sessions)));
  // Hosts stay exactly as G1 stored them (plain host names); the dashboard renders them as text.
  const referrers = current.referrers.map(ref => ({ host: ref.host, label: ref.host === 'direct' ? 'Directo (sin enlace de origen)' : ref.host, sessions: ref.sessions, share: share(ref.sessions, referrerTotal) }));

  return {
    kpis, funnel,
    traffic: { days, current: series(current, 'page_view'), previous: series(previous, 'page_view') },
    checkout: {
      steps: current.checkoutSteps.filter(s => s.reachable).map(s => ({ step: s.step, label: stepLabel(s.step, mode), optional: s.optional, sessions: s.sessions, dropOff: s.dropOff })),
      series: checkoutSeries,
    },
    ctas: current.topCtas.map(cta => ({ target: cta.target, label: CTA_LABELS[cta.target] || cta.target, clicks: cta.clicks, sessions: cta.sessions })),
    products: { top, bottom },
    devices, referrers,
    weekly: weeklySummary(input, mode),
    hasData: visits > 0 || previousVisits > 0,
    unitsSold: now.units,
    paidOrders: now.count,
  };
}

/** The last 7 days against the 7 before, whatever period is on screen. */
function weeklySummary(input: GrowthOverviewInput, mode: keyof typeof OUTCOME) {
  const { current, previous, period } = input;
  const to = period.to;
  const from = addDays(to, -6);
  const weekStart = boliviaDayStart(from);
  const lastWeekStart = boliviaDayStart(addDays(from, -7));
  // The dense series of both periods, oldest first, cover at least 14 days whatever the period.
  const joined = (type: keyof Report['series']) => [...previous.series[type], ...current.series[type]].map(point => point.sessions);
  const weekOf = (type: keyof Report['series']) => { const all = joined(type); return [sum(all.slice(-7)), sum(all.slice(-14, -7))]; };
  const [visits, lastVisits] = weekOf('page_view');
  const [carts, lastCarts] = weekOf('add_to_cart');
  const week = paid(input.orders, weekStart, period.end);
  const lastWeek = paid(input.orders, lastWeekStart, weekStart);
  const [outcome, lastOutcome] = mode === 'payment' ? [week.count, lastWeek.count] : weekOf(mode === 'whatsapp' ? 'whatsapp_click' : 'pay_click');
  const range = `${Number(from.slice(8))}${from.slice(5, 7) === to.slice(5, 7) ? '' : ` ${MONTHS[Number(from.slice(5, 7)) - 1]}`}–${Number(to.slice(8))} ${MONTHS[Number(to.slice(5, 7)) - 1]}`;
  if (!visits && !outcome) {
    return { from, to, text: `Esta semana todavía no hubo visitas medidas ni ${mode === 'payment' ? 'ventas' : 'pedidos'}. Comparte el enlace de tu tienda para empezar.` };
  }
  const versus = (value: number, last: number) => {
    if (!last) return value ? 'la anterior: 0' : 'igual que la anterior';
    const delta = round1((value - last) / last * 100);
    return delta === 0 ? 'igual que la anterior' : `${delta > 0 ? '+' : '−'}${number.format(Math.abs(delta))} % frente a la anterior`;
  };
  const [one, many] = OUTCOME[mode].week;
  const sales = mode === 'payment' && week.sales ? ` por ${week.sales}` : '';
  const best = Object.entries(week.units).sort((a, b) => b[1] - a[1])[0];
  const bestName = best ? input.products.find(product => product.id === best[0])?.name : undefined;
  const text = `Esta semana (${range}): ${plural(visits, 'visita', 'visitas')} (${versus(visits, lastVisits)}), ${plural(carts, 'sesión con carrito', 'sesiones con carrito')} (${versus(carts, lastCarts)}) y ${plural(outcome, one, many)}${sales} (la semana anterior: ${number.format(lastOutcome)}).${mode === 'payment' && best && bestName ? ` Lo más vendido: «${bestName}» (${number.format(best[1])}).` : ''}`;
  return { from, to, text };
}
