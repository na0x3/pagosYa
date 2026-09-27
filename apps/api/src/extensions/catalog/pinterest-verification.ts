import type { ExtensionManifest } from '../extension';

export const pinterestVerification: ExtensionManifest = {
  id: 'pinterest-verification', name: 'Pinterest (verificación)', category: 'seo', tier: 'free', logo: 'pinterest',
  summary: 'Reclama tu dominio en Pinterest.', description: 'Agregamos la etiqueta de Pinterest para que tus Pines muestren tu marca y veas sus estadísticas.',
  docsUrl: 'https://help.pinterest.com/es/business/article/claim-your-website',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef', pattern: /^[a-f0-9]{32}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1').toLowerCase(), where: 'Pinterest → Configuración → Cuentas reclamadas → Sitios web → Agregar etiqueta HTML.' }],
  verificationMeta: { name: 'p:domain_verify', settingKey: 'token' },
};
