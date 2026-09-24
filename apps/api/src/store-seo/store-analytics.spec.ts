import { ANALYTICS_ID_PATTERNS, analyticsHead, normalizeAnalyticsId } from './store-analytics';

const store = (extra: Record<string, string | null>) => ({ slug: 'cafe', ...extra });

it('injects nothing when the merchant has configured no integration', () => {
  expect(analyticsHead(store({}))).toBe('');
  expect(analyticsHead(store({ analyticsGa4Id: null, analyticsGtmId: null, analyticsMetaPixelId: null, analyticsTiktokPixelId: null }))).toBe('');
});

// The storefront already asks for consent (privacy.js, which honours Global Privacy
// Control). Loading a provider before that answer would go behind the shopper's back,
// so the head carries a gate, never the provider's own script tag.
it('never loads a provider directly: the tag waits behind the consent gate', () => {
  const head = analyticsHead(store({ analyticsGa4Id: 'G-ABC1234567' }));
  expect(head).toContain('analyticsAllowed');
  expect(head).toContain('pagosya:privacy-change');
  expect(head).not.toMatch(/<script[^>]+src="https:\/\/www\.googletagmanager\.com/);
  expect(head).not.toContain('connect.facebook.net"');
});

it('tells the consent panel that this store has something to ask about', () => {
  expect(analyticsHead(store({ analyticsGa4Id: 'G-ABC1234567' }))).toContain('PAGOSYA_ANALYTICS_AVAILABLE');
  expect(analyticsHead(store({}))).not.toContain('PAGOSYA_ANALYTICS_AVAILABLE');
});

it('carries each configured ID and the store it belongs to', () => {
  const head = analyticsHead(store({ analyticsGa4Id: 'G-ABC1234567', analyticsGtmId: 'GTM-ABCD123', analyticsMetaPixelId: '123456789012345', analyticsTiktokPixelId: 'CJKLMNOP1234' }));
  for (const value of ['G-ABC1234567', 'GTM-ABCD123', '123456789012345', 'CJKLMNOP1234', '"cafe"']) expect(head).toContain(value);
});

it('stays removable: the whole fragment is one marked script', () => {
  const head = analyticsHead(store({ analyticsGa4Id: 'G-ABC1234567', analyticsMetaPixelId: '123456789012345' }));
  expect(head.match(/<script\b/g)).toHaveLength(1);
  expect(head).toContain('data-pagosya-analytics');
  expect(head.replace(/<script\b[^>]*\bdata-pagosya-analytics=[^>]*>[^]*?<\/script>/gi, '')).toBe('');
});

// These values reach a <script>, so a value that fails its pattern must never be
// interpolated — not even partially, and not even if a DTO let it through.
it('refuses to inject any value that does not match its pattern', () => {
  const hostile = {
    analyticsGa4Id: "G-1');alert(1);//",
    analyticsGtmId: 'GTM-</script><script>alert(1)</script>',
    analyticsMetaPixelId: '123);fetch("//evil")//',
    analyticsTiktokPixelId: "ABC'+document.cookie+'",
  };
  expect(analyticsHead(store(hostile))).toBe('');
  for (const value of Object.values(hostile)) expect(analyticsHead(store(hostile))).not.toContain(value);
});

it('closes the script even when the slug tries to end it early', () => {
  const head = analyticsHead({ slug: '</script><img onerror=alert(1)>', analyticsGa4Id: 'G-ABC1234567' });
  expect(head).not.toContain('</script><img');
  expect(head).toContain('\\u003c/script>');
  expect(head.match(/<\/script>/g)).toHaveLength(1);
});

it('rejects the separator characters an attacker would need', () => {
  for (const value of ['G-ABC<script>', 'G-ABC"', "G-ABC'", 'G-ABC 123', 'G-ABC\n123', 'G-ABC/*']) {
    expect(ANALYTICS_ID_PATTERNS.analyticsGa4Id.test(value)).toBe(false);
  }
  expect(analyticsHead(store({ analyticsGa4Id: 'G-ABC<script>' }))).toBe('');
});

it('accepts the real shapes each provider hands the merchant, case-insensitively', () => {
  expect(normalizeAnalyticsId('analyticsGa4Id', 'g-abc1234567')).toBe('G-ABC1234567');
  expect(normalizeAnalyticsId('analyticsGtmId', ' gtm-abcd123 ')).toBe('GTM-ABCD123');
  expect(normalizeAnalyticsId('analyticsMetaPixelId', ' 123456789012345 ')).toBe('123456789012345');
  expect(normalizeAnalyticsId('analyticsTiktokPixelId', 'cjklmnop1234')).toBe('CJKLMNOP1234');
});

it('treats an empty or invalid value as "not configured" rather than as an error', () => {
  expect(normalizeAnalyticsId('analyticsGa4Id', '')).toBeNull();
  expect(normalizeAnalyticsId('analyticsGa4Id', '   ')).toBeNull();
  expect(normalizeAnalyticsId('analyticsGa4Id', 'nonsense')).toBeNull();
  expect(normalizeAnalyticsId('analyticsMetaPixelId', '12')).toBeNull();
});
