import { buildAnalyticsReport, type RollupRow } from '../store-analytics/store-analytics-report';
import { buildGrowthOverview, growthPeriods, type GrowthOverviewInput } from './growth-overview';

const row = (day: string, type: string, sessions: number, extra: Partial<RollupRow> = {}): RollupRow =>
  ({ day, type, productId: '', target: '', count: sessions, uniqueSessions: sessions, ...extra });
const names = new Map([['p1', 'Lámpara'], ['p2', 'Mesa'], ['p3', 'Silla']]);
const period = growthPeriods(new Date('2026-09-25T16:00:00Z'), 7);
const report = (rows: RollupRow[], from: string, to: string, mode = 'payment') => buildAnalyticsReport(rows, names, from, to, mode, { productLimit: 500 });
const order = (at: string, amount: number, patch: Record<string, unknown> = {}) => ({
  createdAt: new Date(at), amount, currency: 'BOB', partnerId: null, partnerCommissionBps: null,
  items: [{ paymentLinkId: 'p1', name: 'Lámpara', quantity: 2 }], paymentIntent: { status: 'SUCCEEDED', transactions: [] as { amount: number }[] }, ...patch,
});
const product = (id: string, createdAt = '2026-01-01T00:00:00Z') => ({ id, name: names.get(id)!, stock: 4, photos: 2, hasDescription: true, amount: 10000, currency: 'BOB', createdAt: new Date(createdAt) });

function input(patch: Partial<GrowthOverviewInput> = {}): GrowthOverviewInput {
  const mode = patch.mode || 'payment';
  return {
    days: 7, mode, period,
    current: report([
      row('2026-09-20', 'page_view', 25), row('2026-09-24', 'page_view', 15),
      row('2026-09-20', 'product_view', 18, { productId: 'p1' }), row('2026-09-21', 'product_view', 4, { productId: 'p2' }),
      row('2026-09-20', 'add_to_cart', 6, { productId: 'p1' }),
      row('2026-09-20', 'cart_open', 6), row('2026-09-20', 'checkout_step', 5, { target: 'review' }), row('2026-09-20', 'pay_click', 4), row('2026-09-20', 'whatsapp_click', 3),
      row('2026-09-20', 'cta_click', 9, { target: 'hero-cta' }),
      row('2026-09-20', '_device', 30, { target: 'mobile' }), row('2026-09-20', '_device', 10, { target: 'desktop' }),
      row('2026-09-20', '_referrer', 22, { target: 'instagram.com' }), row('2026-09-20', '_referrer', 18, { target: 'direct' }),
    ], period.from, period.to, mode),
    previous: report([row('2026-09-15', 'page_view', 20), row('2026-09-15', 'add_to_cart', 6, { productId: 'p1' })], period.previousFrom, period.previousTo, mode),
    orders: [
      order('2026-09-21T15:00:00Z', 10000), order('2026-09-22T15:00:00Z', 10000, { paymentIntent: { status: 'SUCCEEDED', transactions: [{ amount: 2500 }] } }),
      order('2026-09-22T16:00:00Z', 99999, { paymentIntent: { status: 'FAILED', transactions: [] } }),
      order('2026-09-14T15:00:00Z', 5000),
    ],
    products: [product('p1'), product('p2'), product('p3')],
    devices: [{ device: 'mobile', sessions: 30, addSessions: 3 }, { device: 'desktop', sessions: 10, addSessions: 3 }],
    ...patch,
  };
}
const kpi = (overview: ReturnType<typeof buildGrowthOverview>, id: string) => overview.kpis.find(k => k.id === id)!;

describe('growth overview', () => {
  it('uses Bolivia calendar days for the period and the one before it', () => {
    // 03:00 UTC on the 25th is still the 24th in Bolivia (UTC−4).
    expect(growthPeriods(new Date('2026-09-25T03:00:00Z'), 7)).toMatchObject({ from: '2026-09-18', to: '2026-09-24', previousFrom: '2026-09-11', previousTo: '2026-09-17' });
    expect(period.start.toISOString()).toBe('2026-09-19T04:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-26T04:00:00.000Z');
    expect(period.previousStart.toISOString()).toBe('2026-09-12T04:00:00.000Z');
    expect(growthPeriods(new Date('2026-09-25T16:00:00Z'), 90)).toMatchObject({ from: '2026-06-28', to: '2026-09-25' });
  });

  it('gives the payment KPIs with the previous period and deltas', () => {
    const overview = buildGrowthOverview(input());
    expect(kpi(overview, 'visits')).toMatchObject({ label: 'Visitas', value: 40, previous: 20, delta: 100 });
    expect(kpi(overview, 'productViews')).toMatchObject({ value: 22, previous: 0, delta: null });
    expect(kpi(overview, 'addToCart')).toMatchObject({ value: 6, previous: 6, delta: 0 });
    expect(kpi(overview, 'checkouts')).toMatchObject({ label: 'Pedidos iniciados', value: 5 });
    expect(kpi(overview, 'outcome')).toMatchObject({ label: 'Ventas pagadas', value: 2, previous: 1, delta: 100, detail: 'Bs 175,00 netos' });
    expect(kpi(overview, 'conversion')).toMatchObject({ format: 'percent', value: 5, previous: 5, delta: 0 });
  });

  it('refuses a conversion above what was measured and says why', () => {
    const overview = buildGrowthOverview(input({ current: report([row('2026-09-20', 'page_view', 1)], period.from, period.to) }));
    expect(kpi(overview, 'conversion')).toMatchObject({ value: null });
    expect(kpi(overview, 'conversion').note).toContain('aceptaron la analítica');
  });

  it('measures WhatsApp and external stores by their own final step, never by payments', () => {
    const whatsapp = buildGrowthOverview(input({ mode: 'whatsapp' }));
    expect(kpi(whatsapp, 'outcome')).toMatchObject({ label: 'Pedidos por WhatsApp', value: 3, detail: null });
    expect(whatsapp.funnel.map(step => step.label)).toEqual(['Visitas', 'Vieron un producto', 'Añadieron al carrito', 'Iniciaron el pedido', 'Pidieron por WhatsApp']);
    expect(whatsapp.checkout.steps.map(step => step.step)).toEqual(['cart_open', 'review', 'delivery', 'pay_click', 'whatsapp']);
    expect(JSON.stringify(whatsapp.checkout)).not.toMatch(/pag(o|ar)/i);
    const external = buildGrowthOverview(input({ mode: 'external' }));
    expect(kpi(external, 'outcome')).toMatchObject({ label: 'Clics en el botón final', value: 4 });
  });

  it('draws a funnel whose losses are never negative and absent after an empty step', () => {
    const overview = buildGrowthOverview(input({ current: report([row('2026-09-20', 'page_view', 10), row('2026-09-20', 'add_to_cart', 4, { productId: 'p1' })], period.from, period.to) }));
    expect(overview.funnel.map(step => [step.id, step.sessions, step.dropOff])).toEqual([
      ['visits', 10, null], ['views', 0, 100], ['adds', 4, null], ['checkout', 0, 100], ['outcome', 2, null],
    ]);
  });

  it('lays the traffic of both periods side by side, day by day', () => {
    const { traffic } = buildGrowthOverview(input());
    expect(traffic.days).toHaveLength(7);
    expect(traffic.current).toEqual([0, 25, 0, 0, 0, 15, 0]);
    expect(traffic.previous).toEqual([0, 0, 0, 20, 0, 0, 0]);
  });

  it('lists the most viewed and the least viewed active products, with units sold', () => {
    const { products, unitsSold } = buildGrowthOverview(input());
    expect(unitsSold).toEqual({ p1: 4 });
    expect(products.top.map(p => [p.productId, p.views, p.adds, p.sold])).toEqual([['p1', 18, 6, 4], ['p2', 4, 0, 0]]);
    expect(products.bottom.map(p => [p.productId, p.views])).toEqual([['p3', 0]]);
  });

  it('labels CTAs, devices and referrers (hosts untouched)', () => {
    const overview = buildGrowthOverview(input());
    expect(overview.ctas).toEqual([{ target: 'hero-cta', label: 'Botón principal (portada)', clicks: 9, sessions: 9 }]);
    expect(overview.devices).toEqual([
      { device: 'mobile', label: 'Celular', sessions: 30, share: 75, addRate: 10 },
      { device: 'desktop', label: 'Computadora', sessions: 10, share: 25, addRate: 30 },
    ]);
    expect(overview.referrers).toEqual([{ host: 'instagram.com', label: 'instagram.com', sessions: 22, share: 55 }, { host: 'direct', label: 'Directo (sin enlace de origen)', sessions: 18, share: 45 }]);
  });

  it('writes the weekly summary against the week before', () => {
    expect(buildGrowthOverview(input()).weekly).toEqual({
      from: '2026-09-19', to: '2026-09-25',
      text: 'Esta semana (19–25 sep): 40 visitas (+100 % frente a la anterior), 6 sesiones con carrito (igual que la anterior) y 2 ventas pagadas por Bs 175,00 (la semana anterior: 1). Lo más vendido: «Lámpara» (4).',
    });
    expect(buildGrowthOverview(input({ mode: 'whatsapp' })).weekly.text).toBe('Esta semana (19–25 sep): 40 visitas (+100 % frente a la anterior), 6 sesiones con carrito (igual que la anterior) y 3 pedidos por WhatsApp (la semana anterior: 0).');
    const silent = buildGrowthOverview(input({ current: report([], period.from, period.to), previous: report([], period.previousFrom, period.previousTo), orders: [] }));
    expect(silent.weekly.text).toBe('Esta semana todavía no hubo visitas medidas ni ventas. Comparte el enlace de tu tienda para empezar.');
    expect(silent.hasData).toBe(false);
  });

  it('reads the weekly summary from inside a longer period', () => {
    const long = growthPeriods(new Date('2026-09-25T16:00:00Z'), 30);
    const current = report([row('2026-09-12', 'page_view', 8), row('2026-09-20', 'page_view', 12)], long.from, long.to);
    const overview = buildGrowthOverview(input({ days: 30, period: long, current, previous: report([], long.previousFrom, long.previousTo) }));
    expect(overview.weekly.text).toMatch(/^Esta semana \(19–25 sep\): 12 visitas \(\+50 % frente a la anterior\)/);
  });
});
