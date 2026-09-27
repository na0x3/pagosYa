import type { ExtensionManifest } from '../extension';

export const bingWebmaster: ExtensionManifest = {
  id: 'bing-webmaster', name: 'Bing Webmaster Tools', category: 'seo', tier: 'free', logo: null,
  summary: 'Verifica tu tienda en Bing.', description: 'Agregamos la etiqueta de verificación de Bing para que veas cómo te encuentran en Bing y en los asistentes que usan sus resultados.',
  docsUrl: 'https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: '0123456789ABCDEF0123456789ABCDEF', pattern: /^[A-F0-9]{32}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1').toUpperCase(), where: 'Bing Webmaster Tools → Agregar sitio → Etiqueta meta HTML → valor de content.' }],
  verificationMeta: { name: 'msvalidate.01', settingKey: 'token' },
};
