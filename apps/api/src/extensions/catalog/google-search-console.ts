import type { ExtensionManifest } from '../extension';

export const googleSearchConsole: ExtensionManifest = {
  id: 'google-search-console', name: 'Google Search Console', category: 'seo', tier: 'free', logo: 'googlesearchconsole',
  summary: 'Verifica tu tienda en Google y mira cómo te encuentran.', description: 'Agregamos la etiqueta de verificación a tu tienda. Después, en Search Console ves tus búsquedas, clics y problemas de indexación.',
  docsUrl: 'https://support.google.com/webmasters/answer/9008080?hl=es',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc', pattern: /^[A-Za-z0-9_-]{20,100}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1'), where: 'Search Console → Añadir propiedad → Prefijo de URL → Etiqueta HTML → copia el valor de content (o pega la etiqueta completa).' }],
  verificationMeta: { name: 'google-site-verification', settingKey: 'token' },
};
