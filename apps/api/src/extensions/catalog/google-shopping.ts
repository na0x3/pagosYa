import type { ExtensionManifest } from '../extension';

export const googleShopping: ExtensionManifest = {
  id: 'google-shopping', name: 'Google Shopping', category: 'catalogs', tier: 'pro', logo: 'google',
  summary: 'Muestra tus productos en Google Shopping.', description: 'Publicamos tu catálogo en una dirección que Google Merchant Center lee cada día: precios, stock y fotos siempre al día.',
  docsUrl: 'https://support.google.com/merchants/answer/7439058?hl=es',
  settings: [],
  productFeed: { platform: 'google', steps: ['Entra a Google Merchant Center con tu cuenta de Google.', 'Productos → Añadir productos → Añadir desde un archivo → Añadir una URL.', 'Pega la dirección de tu catálogo y elige actualización diaria.'] },
};
