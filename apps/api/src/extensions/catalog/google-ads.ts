import type { ExtensionManifest } from '../extension';

export const googleAds: ExtensionManifest = {
  id: 'google-ads', name: 'Google Ads', category: 'ads', tier: 'free', logo: 'googleads',
  summary: 'Mide las ventas que traen tus anuncios de Google.', description: 'Instalamos la etiqueta de Google Ads y, si nos das la etiqueta de conversión de compra, registramos cada venta. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://support.google.com/google-ads/answer/6095821?hl=es',
  settings: [
    { key: 'id', label: 'ID de conversión', type: 'text', required: true, placeholder: 'AW-123456789', pattern: /^AW-[0-9]{6,15}$/, normalize: value => value.trim().toUpperCase(), where: 'Google Ads → Objetivos → Conversiones → tu acción → Configuración de etiqueta.' },
    { key: 'purchaseLabel', label: 'Etiqueta de conversión de compra (opcional)', type: 'text', placeholder: 'AbC-D_efG-h12', pattern: /^[A-Za-z0-9_-]{6,40}$/, normalize: value => value.trim(), where: 'En el mismo fragmento, después de la barra: AW-123456789/esta-parte.' },
  ],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w.gtag('js',new Date());w.gtag('config',c.id);tag('https://www.googletagmanager.com/gtag/js?id='+c.id);if(c.purchaseLabel)on('purchase',function(p){w.gtag('event','conversion',{send_to:c.id+'/'+c.purchaseLabel,value:p.value,currency:p.currency,transaction_id:p.orderId})})}`,
};
