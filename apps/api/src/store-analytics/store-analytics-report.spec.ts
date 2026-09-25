import { buildAnalyticsReport, type RollupRow } from './store-analytics-report';

const row = (day: string, type: string, count: number, uniqueSessions: number, extra: Partial<RollupRow> = {}): RollupRow =>
  ({ day, type, productId: '', target: '', count, uniqueSessions, ...extra });

describe('buildAnalyticsReport', () => {
  const rows: RollupRow[] = [
    row('2026-09-01', 'page_view', 10, 6), row('2026-09-03', 'page_view', 4, 3),
    row('2026-09-01', 'product_card_impression', 20, 5, { productId: 'lamp' }), row('2026-09-01', 'product_card_click', 3, 3, { productId: 'lamp' }),
    row('2026-09-01', 'product_view', 5, 4, { productId: 'lamp' }), row('2026-09-03', 'product_view', 2, 2, { productId: 'lamp' }),
    row('2026-09-01', 'add_to_cart', 3, 3, { productId: 'lamp' }),
    row('2026-09-01', 'product_view', 9, 8, { productId: 'desk' }),
    row('2026-09-01', 'add_to_cart', 1, 1, { productId: 'gone' }),
    row('2026-09-01', 'cta_click', 7, 5, { target: 'hero-cta' }), row('2026-09-03', 'cta_click', 2, 2, { target: 'hero-cta' }), row('2026-09-01', 'cta_click', 12, 4, { target: 'nav-cart' }),
    row('2026-09-01', '_device', 8, 4, { target: 'mobile' }), row('2026-09-01', '_device', 2, 2, { target: 'desktop' }),
    row('2026-09-01', '_referrer', 3, 3, { target: 'instagram.com' }), row('2026-09-01', '_referrer', 3, 3, { target: 'direct' }), row('2026-09-03', '_referrer', 1, 1, { target: 'instagram.com' }),
    row('2026-09-01', 'cart_open', 4, 4),
    row('2026-09-01', 'checkout_step', 3, 3, { target: 'review' }),
    row('2026-09-01', 'checkout_step', 1, 1, { target: 'delivery' }),
    row('2026-09-01', 'pay_click', 2, 2),
    row('2026-09-01', 'checkout_step', 2, 2, { target: 'contact' }),
  ];
  const names = new Map([['lamp', 'Lámpara'], ['desk', 'Mesa']]);
  const report = buildAnalyticsReport(rows, names, '2026-09-01', '2026-09-03');

  it('totals every event type, zero when absent', () => {
    expect(report.totals.page_view).toEqual({ count: 14, sessions: 9 });
    expect(report.totals.search).toEqual({ count: 0, sessions: 0 });
    expect(Object.keys(report.totals)).toHaveLength(12);
    expect(report).toMatchObject({ from: '2026-09-01', to: '2026-09-03', granularity: 'day' });
  });

  it('gives a dense daily series per type', () => {
    expect(report.series.page_view).toEqual([{ day: '2026-09-01', count: 10, sessions: 6 }, { day: '2026-09-02', count: 0, sessions: 0 }, { day: '2026-09-03', count: 4, sessions: 3 }]);
    expect(report.series.whatsapp_click.map(point => point.count)).toEqual([0, 0, 0]);
  });

  it('ranks products by views with card numbers and an add rate, naming deleted ones', () => {
    expect(report.topProducts).toEqual([
      { productId: 'desk', name: 'Mesa', impressions: 0, cardClicks: 0, views: 9, adds: 0, addRate: 0 },
      { productId: 'lamp', name: 'Lámpara', impressions: 20, cardClicks: 3, views: 7, adds: 3, addRate: 50 },
      { productId: 'gone', name: 'Producto eliminado', impressions: 0, cardClicks: 0, views: 0, adds: 1, addRate: null },
    ]);
  });

  it('lists CTAs, devices and referrers', () => {
    expect(report.topCtas).toEqual([{ target: 'nav-cart', clicks: 12, sessions: 4 }, { target: 'hero-cta', clicks: 9, sessions: 7 }]);
    expect(report.devices).toEqual([{ device: 'mobile', pageViews: 8, sessions: 4 }, { device: 'desktop', pageViews: 2, sessions: 2 }]);
    expect(report.referrers).toEqual([{ host: 'instagram.com', sessions: 4 }, { host: 'direct', sessions: 3 }]);
  });

  it('computes checkout drop-off from the previous required step (delivery is optional, never negative)', () => {
    expect(report.checkoutSteps).toEqual([
      { step: 'cart_open', optional: false, reachable: true, sessions: 4, dropOff: null },
      { step: 'review', optional: false, reachable: true, sessions: 3, dropOff: 25 },
      { step: 'delivery', optional: true, reachable: true, sessions: 1, dropOff: 66.7 },
      { step: 'pay_click', optional: false, reachable: true, sessions: 2, dropOff: 33.3 },
      { step: 'whatsapp', optional: false, reachable: false, sessions: 0, dropOff: null },
      { step: 'contact', optional: false, reachable: true, sessions: 2, dropOff: 0 },
      { step: 'payment', optional: false, reachable: true, sessions: 0, dropOff: 100 },
    ]);
    const empty = buildAnalyticsReport([], new Map(), '2026-09-01', '2026-09-01');
    expect(empty.checkoutSteps.map(step => step.dropOff)).toEqual([null, null, null, null, null, null, null]);
    expect(buildAnalyticsReport([row('2026-09-01', 'checkout_step', 5, 5, { target: 'review' })], new Map(), '2026-09-01', '2026-09-01').checkoutSteps[1].dropOff).toBeNull();
  });

  it('follows the store\'s checkout mode: a WhatsApp store ends at the WhatsApp click, an external one at the pay click', () => {
    const walk = [
      row('2026-09-01', 'cart_open', 10, 10), row('2026-09-01', 'checkout_step', 8, 8, { target: 'review' }),
      row('2026-09-01', 'pay_click', 8, 8), row('2026-09-01', 'whatsapp_click', 6, 6),
    ];
    const steps = (mode: string) => buildAnalyticsReport(walk, new Map(), '2026-09-01', '2026-09-01', mode).checkoutSteps
      .map(({ step, reachable, sessions, dropOff }) => [step, reachable, sessions, dropOff]);
    expect(steps('whatsapp')).toEqual([
      ['cart_open', true, 10, null], ['review', true, 8, 20], ['delivery', true, 0, 100], ['pay_click', true, 8, 0],
      ['whatsapp', true, 6, 25], ['contact', false, 0, null], ['payment', false, 0, null],
    ]);
    expect(steps('external')).toEqual([
      ['cart_open', true, 10, null], ['review', true, 8, 20], ['delivery', true, 0, 100], ['pay_click', true, 8, 0],
      ['whatsapp', false, 6, null], ['contact', false, 0, null], ['payment', false, 0, null],
    ]);
    // Integrated payments (and any mode this code does not know) walk to the secure payment form.
    expect(steps('payment').slice(4)).toEqual([['whatsapp', false, 6, null], ['contact', true, 0, 100], ['payment', true, 0, null]]);
    expect(steps('something-new')).toEqual(steps('payment'));
  });

  it('counts a session once per type and day from the rollup\'s (type, day) row, not once per product or label', () => {
    const star = { productId: '*', target: '*' };
    const oneShopper = buildAnalyticsReport([
      row('2026-09-01', 'product_view', 1, 1, { productId: 'a' }), row('2026-09-01', 'product_view', 1, 1, { productId: 'b' }), row('2026-09-01', 'product_view', 1, 1, { productId: 'c' }),
      row('2026-09-01', 'product_view', 3, 1, star),
      row('2026-09-01', 'cta_click', 1, 1, { target: 'hero-cta' }), row('2026-09-01', 'cta_click', 1, 1, { target: 'nav-cart' }), row('2026-09-01', 'cta_click', 2, 1, star),
    ], new Map(), '2026-09-01', '2026-09-02');
    expect(oneShopper.totals.product_view).toEqual({ count: 3, sessions: 1 });
    expect(oneShopper.totals.cta_click).toEqual({ count: 2, sessions: 1 });
    expect(oneShopper.series.product_view).toEqual([{ day: '2026-09-01', count: 3, sessions: 1 }, { day: '2026-09-02', count: 0, sessions: 0 }]);
    // The (type, day) row is not a product or a label.
    expect(oneShopper.topProducts.map(product => product.productId)).toEqual(['a', 'b', 'c']);
    expect(oneShopper.topCtas.map(cta => cta.target)).toEqual(['hero-cta', 'nav-cart']);
  });
});
