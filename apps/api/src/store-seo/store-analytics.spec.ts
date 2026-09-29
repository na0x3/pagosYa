import { ANALYTICS_ID_PATTERNS, normalizeAnalyticsId } from './store-analytics';

// The consent-gated head these IDs fed now lives in extensions/storefront-head.spec.ts.
it('rejects the separator characters an attacker would need', () => {
  for (const value of ['G-ABC<script>', 'G-ABC"', "G-ABC'", 'G-ABC 123', 'G-ABC\n123', 'G-ABC/*']) {
    expect(ANALYTICS_ID_PATTERNS.analyticsGa4Id.test(value)).toBe(false);
  }
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
