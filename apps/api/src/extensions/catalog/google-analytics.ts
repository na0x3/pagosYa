import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const googleAnalytics: ExtensionManifest = {
  id: 'google-analytics', name: 'Google Analytics 4', category: 'analytics', tier: 'free', logo: 'googleanalytics',
  summary: 'Mide de dónde vienen tus visitas y qué compran.', description: 'Conecta tu propiedad GA4: registramos visitas y compras en todas las páginas de tu tienda, solo si el comprador acepta las estadísticas.',
  docsUrl: 'https://support.google.com/analytics/answer/12270356?hl=es',
  settings: [{ key: 'id', label: 'ID de medición', type: 'text', required: true, placeholder: 'G-ABC1234567', pattern: ANALYTICS_ID_PATTERNS.analyticsGa4Id, normalize: value => value.trim().toUpperCase(), where: 'Administrar → Flujos de datos → tu flujo web → ID de medición.' }],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w.gtag('js',new Date());w.gtag('config',c.id);tag('https://www.googletagmanager.com/gtag/js?id='+c.id);on('purchase',function(p){w.gtag('event','purchase',{transaction_id:p.orderId,value:p.value,currency:p.currency})})}`,
};
