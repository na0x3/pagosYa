/** Measurement ID patterns, shared by the store DTO and the extensions that replaced these columns (spec 2026-09-27). */

export type AnalyticsField = 'analyticsGa4Id' | 'analyticsGtmId' | 'analyticsMetaPixelId' | 'analyticsTiktokPixelId';

export const ANALYTICS_ID_PATTERNS: Record<AnalyticsField, RegExp> = {
  analyticsGa4Id: /^G-[A-Z0-9]{4,20}$/i,
  analyticsGtmId: /^GTM-[A-Z0-9]{4,20}$/i,
  analyticsMetaPixelId: /^[0-9]{8,20}$/,
  analyticsTiktokPixelId: /^[A-Z0-9]{10,30}$/i,
};

/** Providers print these IDs uppercase but merchants paste what they copied. */
export function normalizeAnalyticsId(field: AnalyticsField, value: string | null | undefined): string | null {
  const candidate = (value ?? '').trim().toUpperCase();
  return ANALYTICS_ID_PATTERNS[field].test(candidate) ? candidate : null;
}
