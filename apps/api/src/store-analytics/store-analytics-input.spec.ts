import { BadRequestException } from '@nestjs/common';
import { deviceClass, normalizeAnalyticsBatch, referrerHost } from './store-analytics-input';
import { ANALYTICS_EVENT_TYPES, ANALYTICS_TRACK_LABELS, ANALYTICS_CHECKOUT_STEPS } from './store-analytics.constants';

const SESSION = '3b241101-e2bb-4255-8caf-4136c566a962';
const batch = (events: unknown[], extra: Record<string, unknown> = {}) => normalizeAnalyticsBatch({ sessionId: SESSION, events, ...extra });

describe('analytics allow-lists', () => {
  it('names exactly the G1 events, labels and checkout steps', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual(['page_view', 'cta_click', 'product_card_impression', 'product_card_click', 'product_view', 'add_to_cart', 'cart_open', 'checkout_step', 'pay_click', 'whatsapp_click', 'contact_submit', 'search']);
    expect([...ANALYTICS_TRACK_LABELS]).toEqual(['hero-cta', 'nav-cart', 'nav-catalog', 'card', 'add', 'checkout', 'pay', 'whatsapp', 'contact', 'promo', 'social', 'newsletter']);
    expect([...ANALYTICS_CHECKOUT_STEPS]).toEqual(['review', 'delivery', 'contact', 'payment']);
  });
});

describe('normalizeAnalyticsBatch', () => {
  it.each([
    ['no body', undefined],
    ['no session', { events: [{ type: 'page_view' }] }],
    ['a v1 uuid', { sessionId: 'a8098c1a-f86e-11da-bd1a-00112444be1e', events: [{ type: 'page_view' }] }],
    ['events not an array', { sessionId: SESSION, events: { type: 'page_view' } }],
    ['no events', { sessionId: SESSION, events: [] }],
    ['21 events', { sessionId: SESSION, events: Array.from({ length: 21 }, () => ({ type: 'page_view' })) }],
  ])('refuses a malformed envelope: %s', (_name, body) => {
    expect(() => normalizeAnalyticsBatch(body)).toThrow(BadRequestException);
  });

  it('keeps a valid event of every type and drops only the invalid ones', () => {
    const { events } = batch([
      { type: 'page_view', path: 'index.html' },
      { type: 'nope' },
      { type: 'cta_click', target: 'hero-cta' },
      { type: 'cta_click' },
      { type: 'cta_click', target: 'buy-now' },
      { type: 'product_card_impression', productId: 'lamp_1' },
      { type: 'product_card_click', productId: 'lamp_1' },
      { type: 'product_view', productId: 'lamp_1' },
      { type: 'product_view' },
      { type: 'add_to_cart', productId: 'bad id!' },
      { type: 'add_to_cart', productId: 'lamp_1' },
      { type: 'cart_open' },
      { type: 'checkout_step', step: 'delivery' },
      { type: 'checkout_step', step: 'shipping' },
      { type: 'pay_click' },
      { type: 'whatsapp_click' },
      { type: 'contact_submit' },
      { type: 'search' },
      'page_view',
      null,
    ]);
    expect(events.map(e => e.type)).toEqual(['page_view', 'cta_click', 'product_card_impression', 'product_card_click', 'product_view', 'add_to_cart', 'cart_open', 'checkout_step', 'pay_click', 'whatsapp_click', 'contact_submit', 'search']);
    expect(events.find(e => e.type === 'checkout_step')).toEqual({ type: 'checkout_step', productId: null, target: 'delivery', path: null });
    expect(events.find(e => e.type === 'cta_click')).toEqual({ type: 'cta_click', productId: null, target: 'hero-cta', path: null });
  });

  it('drops unknown fields and never passes free text through', () => {
    const { events } = batch([{ type: 'search', target: 'zapatos rojos', email: 'a@b.co', at: 1, productId: 'x' }, { type: 'cart_open', target: 'hero-cta', step: 'review' }]);
    expect(events).toEqual([{ type: 'search', productId: null, target: null, path: null }, { type: 'cart_open', productId: null, target: null, path: null }]);
  });

  it('keeps a cta product only when well formed, and a path only when it is a page file', () => {
    const { events } = batch([
      { type: 'cta_click', target: 'add', productId: 'lamp_1', path: 'product.html' },
      { type: 'page_view', path: '../../etc/passwd' },
      { type: 'page_view', path: 'index.html?utm=x' },
      { type: 'page_view', path: 'nuestra-historia.html' },
    ]);
    expect(events.map(e => [e.productId, e.path])).toEqual([['lamp_1', 'product.html'], [null, null], [null, null], [null, 'nuestra-historia.html']]);
  });

  it('reduces the referrer to its host', () => {
    expect(batch([{ type: 'page_view' }], { referrer: 'https://WWW.Instagram.com/p/x?utm=1' }).referrerHost).toBe('instagram.com');
    expect(batch([{ type: 'page_view' }]).referrerHost).toBeNull();
  });
});

describe('referrerHost', () => {
  it.each([
    ['https://l.facebook.com/l.php?u=x', 'l.facebook.com'],
    ['instagram.com', 'instagram.com'],
    ['WWW.GOOGLE.COM', 'google.com'],
    ['javascript:alert(1)', null],
    ['https://user:pass@evil.test/', 'evil.test'],
    ['not a host', null],
    [42, null],
    ['a'.repeat(300) + '.com', null],
  ])('%s → %s', (value, expected) => {
    expect(referrerHost(value)).toBe(expected);
  });

  // Contract for G2: a referrer (and so every `referrers[].host` the read API returns) is a plain lower-case host name
  // or 'direct' — letters, digits, dots and hyphens only. G2 must still render it as text, never as HTML or a link.
  it.each([
    'https://ex<script>.com/', '<img src=x onerror=alert(1)>.com', 'https://evil.test/"><svg onload=alert(1)>', 'evil.test\u0000.com',
    'https://bücher.de/', 'data:text/html,<b>x</b>', 'https://[::1]/', 'https://127.0.0.1/', ' https://evil.test ',
  ])('reduces %j to a plain host name or nothing', value => {
    const host = referrerHost(value);
    if (host !== null) expect(host).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('deviceClass', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36', 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'mobile'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126 Safari/537.36', 'desktop'],
    [undefined, 'desktop'],
  ])('%s → %s', (agent, expected) => {
    expect(deviceClass(agent)).toBe(expected);
  });
});
