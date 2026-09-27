import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const metaPixel: ExtensionManifest = {
  id: 'meta-pixel', name: 'Meta Pixel', category: 'ads', tier: 'free', logo: 'meta',
  summary: 'Mide tus anuncios de Facebook e Instagram.', description: 'Tu pixel registra visitas y compras para que Meta optimice tus anuncios. Instagram usa este mismo pixel. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://www.facebook.com/business/help/952192354843755',
  settings: [{ key: 'id', label: 'ID del pixel', type: 'text', required: true, placeholder: '123456789012345', pattern: ANALYTICS_ID_PATTERNS.analyticsMetaPixelId, normalize: value => value.trim(), where: 'Events Manager → Orígenes de datos → tu pixel.' }],
  storefrontLoader: `function(c,tag,on){if(!w.fbq){var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};w._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];tag('https://connect.facebook.net/en_US/fbevents.js');}w.fbq('init',c.id);w.fbq('track','PageView');on('purchase',function(p){w.fbq('track','Purchase',{value:p.value,currency:p.currency},{eventID:p.orderId})})}`,
};
