import type { ExtensionManifest } from '../extension';

export const microsoftClarity: ExtensionManifest = {
  id: 'microsoft-clarity', name: 'Microsoft Clarity', category: 'analytics', tier: 'free', logo: null,
  summary: 'Mapas de calor y grabaciones de sesiones, gratis.', description: 'Mira dónde tocan tus compradores y en qué parte de la tienda se van. Clarity es gratuito. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://learn.microsoft.com/es-es/clarity/setup-and-installation/clarity-setup',
  settings: [{ key: 'id', label: 'ID del proyecto', type: 'text', required: true, placeholder: 'abcd1234ef', pattern: /^[a-z0-9]{6,20}$/, normalize: value => value.trim().toLowerCase(), where: 'Clarity → tu proyecto → Configuración → Descripción general → ID del proyecto.' }],
  storefrontLoader: `function(c,tag){w.clarity=w.clarity||function(){(w.clarity.q=w.clarity.q||[]).push(arguments)};tag('https://www.clarity.ms/tag/'+c.id)}`,
};
