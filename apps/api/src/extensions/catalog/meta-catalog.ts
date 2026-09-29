import type { ExtensionManifest } from '../extension';

export const metaCatalog: ExtensionManifest = {
  id: 'meta-catalog', name: 'Facebook e Instagram Shop', category: 'catalogs', tier: 'pro', logo: 'meta',
  summary: 'Vende con tu catálogo en Facebook e Instagram.', description: 'Publicamos tu catálogo en una dirección que Meta lee cada día, para etiquetar productos en Instagram y crear anuncios de catálogo.',
  docsUrl: 'https://www.facebook.com/business/help/125074381480892',
  settings: [],
  productFeed: { platform: 'meta', steps: ['Entra a Commerce Manager y crea un catálogo de comercio electrónico.', 'Orígenes de datos → Agregar artículos → Lista de datos → Programar actualizaciones.', 'Pega la dirección de tu catálogo y elige actualización diaria.'] },
};
