import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const googleTagManager: ExtensionManifest = {
  id: 'google-tag-manager', name: 'Google Tag Manager', category: 'analytics', tier: 'free', logo: 'googletagmanager',
  summary: 'Administra tus etiquetas de medición desde un contenedor.', description: 'Instalamos tu contenedor web en todas las páginas de tu tienda; desde Tag Manager decides qué etiquetas corren. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://marketingplatform.google.com/about/tag-manager/',
  settings: [{ key: 'id', label: 'ID del contenedor', type: 'text', required: true, placeholder: 'GTM-ABCD123', pattern: ANALYTICS_ID_PATTERNS.analyticsGtmId, normalize: value => value.trim().toUpperCase(), where: 'Arriba del panel, junto al nombre del contenedor.' }],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});tag('https://www.googletagmanager.com/gtm.js?id='+c.id);on('purchase',function(p){w.dataLayer.push({event:'purchase',ecommerce:{transaction_id:p.orderId,value:p.value,currency:p.currency}})})}`,
};
