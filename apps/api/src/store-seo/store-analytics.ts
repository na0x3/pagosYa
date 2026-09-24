/**
 * Merchant-supplied measurement IDs, turned into one consent-gated <head> script.
 *
 * Two rules shape this file.
 *
 * Safety: every value is typed by a merchant and ends up inside a <script> served to
 * shoppers. IDs are interpolated only after matching an allow-list pattern, and a value
 * that fails is treated as "not configured" rather than escaped and injected anyway.
 * The slug, which has no such pattern, travels as JSON with its script terminators
 * neutralised.
 *
 * Consent: the storefront already asks the shopper (packages/storefront-kit/kit/privacy.js,
 * which honours Global Privacy Control). So this emits no provider tag of its own — it
 * emits a gate that loads them only once PAGOSYA_PRIVACY reports consent, and that
 * listens for a later change of mind. If that layer is missing the gate stays shut.
 */

export type AnalyticsField = 'analyticsGa4Id' | 'analyticsGtmId' | 'analyticsMetaPixelId' | 'analyticsTiktokPixelId';

export const ANALYTICS_ID_PATTERNS: Record<AnalyticsField, RegExp> = {
  analyticsGa4Id: /^G-[A-Z0-9]{4,20}$/i,
  analyticsGtmId: /^GTM-[A-Z0-9]{4,20}$/i,
  analyticsMetaPixelId: /^[0-9]{8,20}$/,
  analyticsTiktokPixelId: /^[A-Z0-9]{10,30}$/i,
};

export type StoreAnalyticsSettings = Partial<Record<AnalyticsField, string | null>> & { slug: string };

/** Providers print these IDs uppercase but merchants paste what they copied. */
export function normalizeAnalyticsId(field: AnalyticsField, value: string | null | undefined): string | null {
  const candidate = (value ?? '').trim().toUpperCase();
  return ANALYTICS_ID_PATTERNS[field].test(candidate) ? candidate : null;
}

/** JSON inside a <script> only needs its terminators hidden to be inert. */
const embed = (value: unknown) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

export function analyticsHead(settings: StoreAnalyticsSettings): string {
  const ids = {
    ga4: normalizeAnalyticsId('analyticsGa4Id', settings.analyticsGa4Id),
    gtm: normalizeAnalyticsId('analyticsGtmId', settings.analyticsGtmId),
    meta: normalizeAnalyticsId('analyticsMetaPixelId', settings.analyticsMetaPixelId),
    tiktok: normalizeAnalyticsId('analyticsTiktokPixelId', settings.analyticsTiktokPixelId),
  };
  if (!Object.values(ids).some(Boolean)) return '';

  // PAGOSYA_ANALYTICS_AVAILABLE is what makes privacy.js open its panel unprompted:
  // there is now a real question to ask this shopper.
  const gate = `(function(){var s=${embed(settings.slug)},i=${embed(ids)},d=document,w=window,done=false;`
    + `w.PAGOSYA_ANALYTICS_AVAILABLE=true;w.PAGOSYA_ANALYTICS={slug:s,ids:i};`
    + `function tag(src){var e=d.createElement('script');e.async=true;e.src=src;(d.head||d.documentElement).appendChild(e);}`
    + `function start(){`
    + `if(done||!(w.PAGOSYA_PRIVACY&&w.PAGOSYA_PRIVACY.analyticsAllowed(s)))return;done=true;`
    + `if(i.ga4||i.gtm){w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};}`
    + `if(i.ga4){w.gtag('js',new Date());w.gtag('config',i.ga4);tag('https://www.googletagmanager.com/gtag/js?id='+i.ga4);}`
    + `if(i.gtm){w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});tag('https://www.googletagmanager.com/gtm.js?id='+i.gtm);}`
    + `if(i.meta){if(!w.fbq){var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};`
    + `w._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];tag('https://connect.facebook.net/en_US/fbevents.js');}`
    + `w.fbq('init',i.meta);w.fbq('track','PageView');}`
    + `if(i.tiktok){w.TiktokAnalyticsObject='ttq';var q=w.ttq=w.ttq||[];`
    + `q.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];`
    + `q.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};`
    + `for(var k=0;k<q.methods.length;k++)q.setAndDefer(q,q.methods[k]);`
    + `q.instance=function(t){for(var e=q._i[t]||[],n=0;n<q.methods.length;n++)q.setAndDefer(e,q.methods[n]);return e};`
    + `q.load=function(e){var r='https://analytics.tiktok.com/i18n/pixel/events.js';q._i=q._i||{};q._i[e]=[];q._i[e]._u=r;`
    + `q._t=q._t||{};q._t[e]=+new Date;q._o=q._o||{};q._o[e]={};tag(r+'?sdkid='+e+'&lib=ttq');};`
    + `q.load(i.tiktok);q.page();}}`
    + `start();w.addEventListener('pagosya:privacy-change',start);})();`;

  return `<script data-pagosya-analytics="gate">${gate}<\/script>`;
}
