import { buildAnalyticsReport, type RollupRow } from '../store-analytics/store-analytics-report';
import { buildGrowthInsights, selectInsights, type GrowthInsightInput } from './growth-insights';

const DAY = '2026-09-10';
const row = (type: string, count: number, sessions: number, extra: Partial<RollupRow> = {}): RollupRow =>
  ({ day: DAY, type, productId: '', target: '', count, uniqueSessions: sessions, ...extra });
const report = (rows: RollupRow[], mode = 'payment') => buildAnalyticsReport(rows, new Map([['p1', 'Lámpara'], ['p2', 'Mesa'], ['p3', 'Silla']]), '2026-08-27', '2026-09-25', mode, { productLimit: 500 });
const now = new Date('2026-09-25T16:00:00Z');
const periodStart = new Date('2026-08-27T04:00:00Z');
const product = (id: string, patch: Partial<GrowthInsightInput['products'][number]> = {}): GrowthInsightInput['products'][number] =>
  ({ id, name: { p1: 'Lámpara', p2: 'Mesa', p3: 'Silla' }[id] || id, stock: null, photos: 3, hasDescription: true, amount: 10000, currency: 'BOB', createdAt: new Date('2026-01-01T00:00:00Z'), ...patch });

function input(patch: Partial<GrowthInsightInput> = {}): GrowthInsightInput {
  const mode = patch.mode || 'payment';
  return {
    days: 30, mode, storeName: 'Casa Luz',
    store: { published: true, paused: false, hidden: false, verified: true, policies: { returns: true, delivery: true } },
    report: report([], mode), previousReport: report([], mode),
    products: [], unitsSold: {}, paidEver: 4, leads: { unread: 0, oldestUnreadAt: null, inPeriod: 0 }, devices: [],
    periodStart, now, ...patch,
  };
}
const ids = (all: ReturnType<typeof buildGrowthInsights>) => all.map(insight => insight.id);
const find = (all: ReturnType<typeof buildGrowthInsights>, id: string) => all.find(insight => insight.id === id);

describe('growth insights v2', () => {
  it('says nothing about a healthy store without data', () => {
    expect(buildGrowthInsights(input())).toEqual([]);
  });

  describe('blockers', () => {
    it('asks to publish an unpublished store, first, through the designer', () => {
      const [first] = buildGrowthInsights(input({ store: { ...input().store, published: false }, leads: { unread: 3, oldestUnreadAt: new Date('2026-09-20T00:00:00Z'), inPeriod: 3 } }));
      expect(first).toMatchObject({ id: 'unpublished', severity: 'high', action: { kind: 'settings', payload: { view: 'workspace' } } });
    });
    it('tells a paused store to reactivate in the designer and a hidden one where the switch lives', () => {
      expect(find(buildGrowthInsights(input({ store: { ...input().store, paused: true } })), 'paused')?.action.payload).toEqual({ view: 'workspace' });
      expect(find(buildGrowthInsights(input({ store: { ...input().store, hidden: true } })), 'paused')?.action.payload).toEqual({ view: 'store-settings', section: 'checkout' });
    });
    it('flags test-mode payments only for stores that take payments', () => {
      const unverified = { ...input().store, verified: false };
      expect(find(buildGrowthInsights(input({ store: unverified })), 'test-mode')?.action.payload).toEqual({ view: 'compliance' });
      expect(find(buildGrowthInsights(input({ mode: 'whatsapp', store: unverified })), 'test-mode')).toBeUndefined();
    });
  });

  describe('unread leads', () => {
    it('is medium while the oldest is fresh and high after a day, and opens the inbox', () => {
      const fresh = find(buildGrowthInsights(input({ leads: { unread: 1, oldestUnreadAt: new Date('2026-09-25T14:00:00Z'), inPeriod: 1 } })), 'unread-leads');
      expect(fresh).toMatchObject({ severity: 'medium', title: 'Tienes una consulta sin responder', action: { kind: 'inbox' } });
      expect(fresh?.evidence).toContain('2 horas');
      const old = find(buildGrowthInsights(input({ leads: { unread: 3, oldestUnreadAt: new Date('2026-09-22T12:00:00Z'), inPeriod: 3 } })), 'unread-leads');
      expect(old).toMatchObject({ severity: 'high', title: 'Tienes 3 consultas sin responder' });
      expect(old?.evidence).toContain('3 días');
    });
  });

  describe('first sale', () => {
    it('offers a YAPI review in payment mode when nothing was ever paid, never for WhatsApp stores', () => {
      const insight = find(buildGrowthInsights(input({ paidEver: 0, report: report([row('page_view', 30, 12)]) })), 'first-sale');
      expect(insight?.action.kind).toBe('yapi');
      expect(insight?.evidence).toContain('12 visitas en los últimos 30 días');
      expect(insight?.action.payload.instruction).toMatch(/antes de aplicar/);
      expect(find(buildGrowthInsights(input({ mode: 'whatsapp', paidEver: 0 })), 'first-sale')).toBeUndefined();
    });
  });

  describe('checkout drop-off', () => {
    it('names the step with the biggest loss, with numbers and the period', () => {
      const all = buildGrowthInsights(input({ report: report([row('cart_open', 40, 40), row('checkout_step', 12, 12, { target: 'review' }), row('pay_click', 10, 10), row('checkout_step', 9, 9, { target: 'contact' }), row('checkout_step', 8, 8, { target: 'payment' })]) }));
      const insight = find(all, 'checkout-drop:review');
      expect(insight).toMatchObject({ severity: 'high', action: { kind: 'yapi' } });
      expect(insight?.evidence).toBe('De 40 sesiones que abrieron el carrito, 28 no llegaron al resumen del pedido (70 %) en los últimos 30 días.');
      expect(all.filter(i => i.rule === 'checkout-drop')).toHaveLength(1);
    });
    it('stays quiet below 10 sessions or below a 50 % loss', () => {
      expect(ids(buildGrowthInsights(input({ report: report([row('cart_open', 9, 9)]) })))).toEqual([]);
      expect(ids(buildGrowthInsights(input({ report: report([row('cart_open', 100, 100), row('checkout_step', 51, 51, { target: 'review' }), row('pay_click', 51, 51), row('checkout_step', 51, 51, { target: 'contact' }), row('checkout_step', 51, 51, { target: 'payment' })]) })))).toEqual([]);
    });
    it('follows the checkout mode: WhatsApp stores hear about WhatsApp, never about payment', () => {
      const walk = [row('cart_open', 30, 30), row('checkout_step', 28, 28, { target: 'review' }), row('pay_click', 26, 26), row('whatsapp_click', 6, 6)];
      const all = buildGrowthInsights(input({ mode: 'whatsapp', report: report(walk, 'whatsapp') }));
      expect(find(all, 'checkout-drop:whatsapp')?.action).toMatchObject({ kind: 'settings', payload: { view: 'store-settings', section: 'checkout' } });
      expect(JSON.stringify(all)).not.toMatch(/pag(o|ar)/i);
      const payment = buildGrowthInsights(input({ report: report([row('cart_open', 30, 30), row('checkout_step', 28, 28, { target: 'review' }), row('pay_click', 26, 26), row('checkout_step', 24, 24, { target: 'contact' }), row('checkout_step', 5, 5, { target: 'payment' })]) }));
      expect(find(payment, 'checkout-drop:payment')?.action).toMatchObject({ kind: 'promo' });
    });
  });

  describe('views without adds', () => {
    const viewed = (views: number, adds: number, id = 'p1') => [row('product_view', views, views, { productId: id }), ...(adds ? [row('add_to_cart', adds, adds, { productId: id })] : [])];
    it('fires from 20 view sessions under a 3 % add rate', () => {
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(20, 0)) })), 'views-no-adds:p1')).toBeDefined();
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(19, 0)) })), 'views-no-adds:p1')).toBeUndefined();
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(34, 1)) })), 'views-no-adds:p1')).toBeDefined();
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(33, 1)) })), 'views-no-adds:p1')).toBeUndefined();
    });
    it('evidence has the numbers and the period', () => {
      const insight = find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(40, 1)) })), 'views-no-adds:p1');
      expect(insight?.evidence).toBe('40 sesiones vieron «Lámpara» en los últimos 30 días y solo 1 lo añadió al carrito (2,5 %).');
    });
    it('picks the action from what the product lacks', () => {
      const action = (patch: Partial<GrowthInsightInput['products'][number]>, others: GrowthInsightInput['products'] = []) =>
        find(buildGrowthInsights(input({ products: [product('p1', patch), ...others], report: report(viewed(25, 0)) })), 'views-no-adds:p1')?.action;
      expect(action({ stock: 0 })).toMatchObject({ kind: 'stock', payload: { productId: 'p1' } });
      expect(action({ photos: 0 })).toMatchObject({ kind: 'product', payload: { productId: 'p1', step: 'photos' } });
      expect(action({ photos: 1 })).toMatchObject({ kind: 'product', payload: { step: 'photos' } });
      expect(action({ hasDescription: false })).toMatchObject({ kind: 'product', payload: { step: 'description' } });
      expect(action({ amount: 30000 }, [product('p2', { amount: 10000 }), product('p3', { amount: 12000 })])).toMatchObject({ kind: 'product', payload: { step: 'price' } });
      expect(action({})).toMatchObject({ kind: 'yapi' });
    });
    it('estimates the gain only with the store\'s own average over at least 50 view sessions', () => {
      const alone = find(buildGrowthInsights(input({ products: [product('p1')], report: report(viewed(30, 0)) })), 'views-no-adds:p1');
      expect(alone?.impact).toBeNull();
      const withBase = find(buildGrowthInsights(input({ products: [product('p1'), product('p2')], report: report([...viewed(30, 0), ...viewed(30, 6, 'p2')]) })), 'views-no-adds:p1');
      expect(withBase?.impact).toBe('Estimación: si «Lámpara» llegara al promedio de tu tienda (10 %), serían unas 3 sesiones más con el producto en el carrito, con las mismas visitas.');
    });
    it('ignores deleted products', () => {
      expect(ids(buildGrowthInsights(input({ products: [], report: report(viewed(40, 0)) })))).toEqual([]);
    });
  });

  describe('calls to action without follow-through', () => {
    it('fires when fewer than a quarter of the sessions that tapped it took the next step', () => {
      const rows = (taps: number, views: number) => [row('cta_click', taps, taps, { target: 'hero-cta' }), row('product_view', views, views, { productId: 'p1' })];
      const insight = find(buildGrowthInsights(input({ products: [product('p1')], report: report(rows(20, 4)) })), 'cta-no-follow:hero-cta');
      expect(insight?.evidence).toBe('20 sesiones tocaron el botón principal de la portada en los últimos 30 días; en todo ese periodo, solo 4 sesiones abrieron un producto (20 %).');
      expect(insight?.action.kind).toBe('yapi');
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(rows(20, 5)) })), 'cta-no-follow:hero-cta')).toBeUndefined();
      expect(find(buildGrowthInsights(input({ products: [product('p1')], report: report(rows(14, 0)) })), 'cta-no-follow:hero-cta')).toBeUndefined();
    });
    it('compares the contact button with sent forms', () => {
      const insight = find(buildGrowthInsights(input({ report: report([row('cta_click', 16, 16, { target: 'contact' }), row('contact_submit', 1, 1)]) })), 'cta-no-follow:contact');
      expect(insight?.evidence).toContain('enviaron el formulario');
    });
  });

  describe('device gap', () => {
    it('compares add rates and estimates with the stronger device\'s rate', () => {
      const insight = find(buildGrowthInsights(input({ devices: [{ device: 'mobile', sessions: 100, addSessions: 1 }, { device: 'desktop', sessions: 40, addSessions: 4 }] })), 'device-gap');
      expect(insight).toMatchObject({ title: 'Tu tienda vende menos en el celular', action: { kind: 'yapi' } });
      expect(insight?.evidence).toBe('En el celular, 1 % de las visitas añade algo al carrito; en computadora, 10 % (últimos 30 días; 100 y 40 visitas).');
      expect(insight?.impact).toBe('Estimación: si el celular convirtiera como la computadora, serían unas 9 sesiones más con carrito en este periodo.');
    });
    it('needs 30 visits on each device and a real gap', () => {
      expect(buildGrowthInsights(input({ devices: [{ device: 'mobile', sessions: 29, addSessions: 0 }, { device: 'desktop', sessions: 40, addSessions: 4 }] }))).toEqual([]);
      expect(buildGrowthInsights(input({ devices: [{ device: 'mobile', sessions: 100, addSessions: 7 }, { device: 'desktop', sessions: 40, addSessions: 4 }] }))).toEqual([]);
    });
  });

  describe('referrer surge', () => {
    const refs = (sessions: number, host = 'instagram.com') => report([row('_referrer', sessions, sessions, { target: host }), row('_referrer', 90, 90, { target: 'direct' })]);
    it('fires at 20 sessions and twice the previous period, with a promo for that audience', () => {
      const insight = find(buildGrowthInsights(input({ report: refs(24), previousReport: refs(10) })), 'referrer-surge:instagram.com');
      expect(insight?.evidence).toBe('24 visitas llegaron desde instagram.com en los últimos 30 días, frente a 10 en los 30 días anteriores.');
      expect(insight?.action).toMatchObject({ kind: 'promo', payload: { code: 'INSTAGRAM' } });
      expect(find(buildGrowthInsights(input({ report: refs(24), previousReport: refs(13) })), 'referrer-surge:instagram.com')).toBeUndefined();
      expect(ids(buildGrowthInsights(input({ report: refs(19), previousReport: refs(0) })))).toEqual([]);
    });
    it('never treats direct visits as a referrer and keeps a strange host as plain data', () => {
      expect(buildGrowthInsights(input({ report: report([row('_referrer', 300, 300, { target: 'direct' })]) }))).toEqual([]);
      const odd = find(buildGrowthInsights(input({ report: refs(30, 'l.facebook.com') })), 'referrer-surge:l.facebook.com');
      expect(odd?.action.payload.code).toBe('FACEBOOK');
    });
  });

  describe('never viewed', () => {
    it('lists older products nobody opened when the store had at least 50 visits', () => {
      const products = [product('p1'), product('p2'), product('p3', { createdAt: new Date('2026-09-20T00:00:00Z') })];
      const insight = find(buildGrowthInsights(input({ products, report: report([row('page_view', 80, 60), row('product_view', 5, 5, { productId: 'p1' })]) })), 'never-viewed');
      expect(insight?.evidence).toBe('«Mesa» no fue visto ni una vez en los últimos 30 días, aunque tu tienda tuvo 60 visitas.');
      expect(insight?.action.payload.instruction).toContain('«Mesa»');
      expect(find(buildGrowthInsights(input({ products, report: report([row('page_view', 50, 49)]) })), 'never-viewed')).toBeUndefined();
    });
  });

  describe('low stock on sellers', () => {
    it('warns with days of stock left at the period pace, at most two products', () => {
      const products = [product('p1', { stock: 2 }), product('p2', { stock: 0 }), product('p3', { stock: 1 }), product('p4', { stock: 3 })];
      const all = buildGrowthInsights(input({ products, unitsSold: { p1: 6, p2: 9, p3: 1, p4: 2 } }));
      expect(all.filter(insight => insight.rule === 'low-stock').map(insight => insight.id)).toEqual(['low-stock:p2', 'low-stock:p1']);
      expect(find(all, 'low-stock:p2')).toMatchObject({ severity: 'high', impact: null, action: { kind: 'stock', payload: { productId: 'p2' } } });
      expect(find(all, 'low-stock:p1')?.evidence).toBe('Vendiste 6 unidades de «Lámpara» en los últimos 30 días y quedan 2.');
      expect(find(all, 'low-stock:p1')?.impact).toBe('Estimación: al ritmo de este periodo, se agota en unos 10 días.');
    });
    it('ignores unsold products and healthy stock', () => {
      expect(buildGrowthInsights(input({ products: [product('p1', { stock: 1 }), product('p2', { stock: 6 })], unitsSold: { p2: 4 } }))).toEqual([]);
    });
  });

  it('asks for photos, starting with the most viewed product without one', () => {
    const insight = find(buildGrowthInsights(input({ products: [product('p1', { photos: 0 }), product('p2', { photos: 0 })], report: report([row('product_view', 3, 3, { productId: 'p2' })]) })), 'weak-photos');
    expect(insight).toMatchObject({ title: '2 productos no tienen fotos', action: { kind: 'product', payload: { productId: 'p2', step: 'photos' } } });
  });

  it('asks for the missing policies once there are products', () => {
    const store = { ...input().store, policies: { returns: false, delivery: true } };
    expect(find(buildGrowthInsights(input({ store, products: [product('p1')] })), 'missing-policies')?.action.payload).toEqual({ view: 'store-settings', section: 'policies' });
    expect(buildGrowthInsights(input({ store }))).toEqual([]);
  });

  it('suggests answering leads with a proposal from three leads in the period', () => {
    const insight = find(buildGrowthInsights(input({ leads: { unread: 0, oldestUnreadAt: null, inPeriod: 3 } })), 'leads-to-proposal');
    expect(insight?.action).toMatchObject({ kind: 'proposal' });
    expect(insight?.action.payload.prompt).toContain('Casa Luz');
    expect(find(buildGrowthInsights(input({ leads: { unread: 0, oldestUnreadAt: null, inPeriod: 2 } })), 'leads-to-proposal')).toBeUndefined();
  });

  it('explains every insight and names the consent rule when analytics are involved', () => {
    const all = buildGrowthInsights(input({ products: [product('p1')], report: report([row('product_view', 25, 25, { productId: 'p1' })]) }));
    expect(all[0].why.length).toBeGreaterThan(0);
    expect(all[0].why.join(' ')).toContain('aceptaron la analítica');
  });

  describe('ranking and selection', () => {
    const busy = () => buildGrowthInsights(input({
      store: { published: true, paused: false, hidden: false, verified: false, policies: { returns: false, delivery: false } },
      products: [product('p1', { stock: 1, photos: 0 }), product('p2')], unitsSold: { p1: 3 },
      leads: { unread: 2, oldestUnreadAt: new Date('2026-09-20T00:00:00Z'), inPeriod: 4 },
      report: report([row('product_view', 30, 30, { productId: 'p2' })]),
    }));
    it('puts blockers first, then severity, then weight', () => {
      const all = busy();
      expect(all[0].id).toBe('test-mode');
      expect(all.map(insight => insight.severity)).toEqual([...all.map(insight => insight.severity)].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
      expect(all.length).toBeGreaterThan(5);
    });
    it('shows five, counts the rest, and hides dismissed and live-snoozed ones until the snooze ends', () => {
      const all = busy();
      const picked = selectInsights(all, [], now);
      expect(picked.insights).toHaveLength(5);
      expect(picked.moreInsights).toBe(all.length - 5);
      expect(picked.hiddenInsights).toBe(0);
      const states = [
        { insightId: 'test-mode', status: 'dismissed', until: null },
        { insightId: 'unread-leads', status: 'snoozed', until: new Date('2026-09-30T00:00:00Z') },
        { insightId: 'weak-photos', status: 'snoozed', until: new Date('2026-09-24T00:00:00Z') },
        { insightId: 'gone-rule', status: 'dismissed', until: null },
      ];
      const hidden = selectInsights(all, states, now);
      expect(hidden.insights.map(insight => insight.id)).not.toContain('test-mode');
      expect(hidden.insights.map(insight => insight.id)).not.toContain('unread-leads');
      // The expired snooze (weak-photos) and a state for an insight that no longer fires do not count as hidden.
      expect(hidden.hiddenInsights).toBe(2);
      expect(hidden.insights.length + hidden.moreInsights).toBe(all.length - 2);
    });
  });
});
