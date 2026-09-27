import type { ExtensionManifest } from '../extension';

export const hotjar: ExtensionManifest = {
  id: 'hotjar', name: 'Hotjar', category: 'analytics', tier: 'free', logo: 'hotjar',
  summary: 'Mapas de calor, grabaciones y encuestas.', description: 'Entiende cómo navegan tus compradores con mapas de calor y grabaciones. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://help.hotjar.com/hc/es/articles/115009336727',
  settings: [{ key: 'id', label: 'ID del sitio', type: 'text', required: true, placeholder: '1234567', pattern: /^[0-9]{5,12}$/, normalize: value => value.trim(), where: 'Hotjar → Sitios y organizaciones → ID del sitio.' }],
  storefrontLoader: `function(c,tag){w.hj=w.hj||function(){(w.hj.q=w.hj.q||[]).push(arguments)};w._hjSettings={hjid:Number(c.id),hjsv:6};tag('https://static.hotjar.com/c/hotjar-'+c.id+'.js?sv=6')}`,
};
