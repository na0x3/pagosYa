import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const tiktokPixel: ExtensionManifest = {
  id: 'tiktok-pixel', name: 'TikTok Pixel', category: 'ads', tier: 'free', logo: 'tiktok',
  summary: 'Mide tus anuncios de TikTok.', description: 'Registra visitas y compras para medir y optimizar tus campañas en TikTok. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://ads.tiktok.com/help/article/get-started-pixel',
  settings: [{ key: 'id', label: 'ID del pixel', type: 'text', required: true, placeholder: 'CJKLMNOP1234', pattern: ANALYTICS_ID_PATTERNS.analyticsTiktokPixelId, normalize: value => value.trim().toUpperCase(), where: 'Administrador de anuncios → Herramientas → Eventos → Pixel de sitio web.' }],
  storefrontLoader: `function(c,tag,on){w.TiktokAnalyticsObject='ttq';var q=w.ttq=w.ttq||[];q.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];q.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var k=0;k<q.methods.length;k++)q.setAndDefer(q,q.methods[k]);q.instance=function(t){for(var e=q._i[t]||[],n=0;n<q.methods.length;n++)q.setAndDefer(e,q.methods[n]);return e};q.load=function(e){var r='https://analytics.tiktok.com/i18n/pixel/events.js';q._i=q._i||{};q._i[e]=[];q._i[e]._u=r;q._t=q._t||{};q._t[e]=+new Date;q._o=q._o||{};q._o[e]={};tag(r+'?sdkid='+e+'&lib=ttq');};q.load(c.id);q.page();on('purchase',function(p){w.ttq.track('CompletePayment',{value:p.value,currency:p.currency,event_id:p.orderId})})}`,
};
