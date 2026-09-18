export interface ExternalIntegration {
  id: string;
  name: string;
  category: string;
  logo: string;
  description: string;
  url: string;
  guide: string;
  setup: string;
}

export const externalIntegrations: ExternalIntegration[] = [
  { id: 'tiktok-ads', name: 'TikTok Ads', category: 'Publicidad', logo: 'tiktok', description: 'Lleva tus productos a nuevas audiencias con anuncios en TikTok.', url: 'https://ads.tiktok.com/', guide: 'https://ads.tiktok.com/business/en-US/blog/get-started-with-tiktok-pixel', setup: 'Crea tu cuenta publicitaria y configura TikTok Pixel para medir las visitas y conversiones de tu tienda.' },
  { id: 'meta-ads', name: 'Meta Ads', category: 'Publicidad', logo: 'meta', description: 'Administra campañas para Facebook e Instagram desde Meta.', url: 'https://adsmanager.facebook.com/', guide: 'https://www.facebook.com/business/ads', setup: 'Prepara tu cuenta publicitaria en Meta y configura sus eventos para medir los resultados de tus campañas.' },
  { id: 'instagram-ads', name: 'Instagram Ads', category: 'Publicidad', logo: 'instagram', description: 'Promociona tu tienda en el feed, Stories y Reels de Instagram.', url: 'https://adsmanager.facebook.com/', guide: 'https://www.facebook.com/business/ads/instagram-ad', setup: 'Vincula tu cuenta profesional de Instagram a Meta y selecciona las ubicaciones de Instagram al crear tu campaña.' },
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analítica', logo: 'googleanalytics', description: 'Comprende de dónde vienen tus visitas y cómo interactúan con tu tienda.', url: 'https://analytics.google.com/', guide: 'https://support.google.com/analytics/answer/12270356?hl=es', setup: 'Crea una propiedad GA4 y un flujo web. Su ID de medición identifica la etiqueta que debes instalar en tu tienda.' },
  { id: 'meta-business-suite', name: 'Meta Business Suite', category: 'Analítica', logo: 'meta', description: 'Consulta estadísticas de Facebook e Instagram y administra tus publicaciones.', url: 'https://business.facebook.com/', guide: 'https://www.facebook.com/business/tools/meta-business-suite', setup: 'Añade tus páginas de Facebook y tu cuenta de Instagram para consultar sus estadísticas en Meta Business Suite.' },
  { id: 'google-ads', name: 'Google Ads', category: 'Publicidad', logo: 'googleads', description: 'Llega a clientes que buscan tus productos en Google y YouTube.', url: 'https://ads.google.com/', guide: 'https://ads.google.com/home/', setup: 'Configura tu cuenta de Google Ads y sus conversiones antes de evaluar las ventas que generan tus anuncios.' },
  { id: 'google-tag-manager', name: 'Google Tag Manager', category: 'Analítica', logo: 'googletagmanager', description: 'Organiza las etiquetas de medición y publicidad de tu sitio.', url: 'https://tagmanager.google.com/', guide: 'https://marketingplatform.google.com/about/tag-manager/', setup: 'Crea un contenedor web e instala sus fragmentos en tu sitio. Desde ese contenedor puedes administrar tus etiquetas.' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'Atención al cliente', logo: 'whatsapp', description: 'Atiende consultas y comparte tu catálogo por WhatsApp.', url: 'https://business.whatsapp.com/', guide: 'https://business.whatsapp.com/', setup: 'Configura tu perfil de empresa y tu catálogo en WhatsApp Business para atender a tus clientes.' },
];
