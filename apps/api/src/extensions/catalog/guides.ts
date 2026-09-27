import type { ExtensionCategory } from '../extension';

/** External tools with nothing to install: shown under "Guías", never counted as extensions. */
export const GUIDES: Array<{ id: string; name: string; category: ExtensionCategory; logo: string | null; summary: string; url: string; guide: string }> = [
  { id: 'meta-business-suite', name: 'Meta Business Suite', category: 'ads', logo: 'meta', summary: 'Consulta estadísticas de Facebook e Instagram y administra tus publicaciones.', url: 'https://business.facebook.com/', guide: 'https://www.facebook.com/business/tools/meta-business-suite' },
  { id: 'instagram-ads', name: 'Instagram Ads', category: 'ads', logo: 'instagram', summary: 'Promociona tu tienda en el feed, Stories y Reels de Instagram.', url: 'https://adsmanager.facebook.com/', guide: 'https://www.facebook.com/business/ads/instagram-ad' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'messaging', logo: 'whatsapp', summary: 'Atiende consultas y comparte tu catálogo desde la app de WhatsApp Business.', url: 'https://business.whatsapp.com/', guide: 'https://business.whatsapp.com/' },
];
