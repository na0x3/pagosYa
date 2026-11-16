import { readConfigData, type V2Context } from './v2-context';

/** Owner 2026-11-15 («changing menu per store, its always the same»; «put all of them»): the store's menu is one of the kit's 16
 *  models (commerce-src/header/store-menu.js), chosen by the V2 direction per store and written into config.js header.menu. */
export type V2Menu = { model: string; groups: Array<{ label: string; note?: string; links: Array<{ to: string; note?: string }>; tiles?: Array<{ to: string; image: string }> }> };

/** The 16 kit menu models (spec 2026-11-15 store menu models), one line each on the stores they suit. */
export const V2_MENU_MODELS: readonly { id: string; fits: string }[] = [
  { id: 'tabs', fits: 'pestañas por grupo con fotos; tiendas con muchas categorías' },
  { id: 'mega', fits: 'enlaces + 3 fotos con el título encima; moda, artesanía, historias' },
  { id: 'overlay', fits: 'pantalla entera del color de la marca, letras enormes, la foto cambia; marcas divertidas con pocas páginas' },
  { id: 'dropdown', fits: 'panel chico bajo su enlace con una foto; catálogos cortos (café, panadería, helado)' },
  { id: 'drawer', fits: 'panel lateral oscuro con dos fotos; tiendas tranquilas y editoriales' },
  { id: 'split', fits: 'mitad foto grande de la tienda, mitad enlaces; muebles, hogar, restaurantes' },
  { id: 'index', fits: 'lista numerada con cuántos productos tiene cada categoría; libros, discos, papelería' },
  { id: 'dock', fits: 'barra flotante abajo con los grupos; marcas deportivas o tipo app' },
  { id: 'stickers', fits: 'cada enlace un sticker inclinado con su foto redonda; dulces, juguetes, niños' },
  { id: 'circles', fits: 'fotos redondas por categoría bajo el logo; flores, tortas, mascotas, cosmética' },
  { id: 'rail', fits: 'menú siempre abierto a la izquierda en pantallas anchas; joyería, arte, cerámica' },
  { id: 'bestsellers', fits: 'los 3 más vendidos con precio y Agregar dentro del menú; ropa, deporte' },
  { id: 'need', fits: 'grupos por lo que el cliente busca («Dormir mejor») con precio desde; bienestar, tés, suplementos' },
  { id: 'offer', fits: 'la oferta real de la tienda como foto en el menú; cosmética, regalos' },
  { id: 'search', fits: 'abre en un buscador grande con populares; tiendas con muchos productos' },
  { id: 'thumb', fits: 'cuatro botones fijos abajo en el celular; ropa y tiendas que se compran desde el teléfono' },
];

/** The models this merchant's other stores have not used; every model once all are used. */
export const allowedMenus = (used: readonly string[]): string[] => {
  const all = V2_MENU_MODELS.map(m => m.id);
  const free = all.filter(id => !used.includes(id));
  return free.length ? free : all;
};

export function v2MenuSchema(allowed: readonly string[]): object {
  const link = { type: 'object', additionalProperties: false, required: ['to', 'note'], properties: { to: { type: 'string' }, note: { type: 'string' } } };
  const tile = { type: 'object', additionalProperties: false, required: ['to', 'image'], properties: { to: { type: 'string' }, image: { type: 'string' } } };
  return { type: 'object', additionalProperties: false, required: ['model', 'groups'], properties: {
    model: { type: 'string', enum: [...allowed] },
    groups: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['label', 'note', 'links', 'tiles'],
      properties: { label: { type: 'string' }, note: { type: 'string' }, links: { type: 'array', minItems: 1, maxItems: 8, items: link }, tiles: { type: 'array', maxItems: 3, items: tile } } } } } };
}

/** The selling rules a menu must keep (spec rules 1, 2, 5, 6); the runtime guarantees the rest. */
export function menuProblems(menu: V2Menu, context: Pick<V2Context, 'photos'>): string[] {
  const out: string[] = [];
  if (menu.groups.length > 7) out.push(`El menú tiene ${menu.groups.length} grupos arriba: deja como mucho 7 enlaces arriba y pon el resto dentro de los grupos.`);
  for (const group of menu.groups) if (group.label.length > 28) out.push(`El grupo «${group.label.slice(0, 40)}» pasa de 28 letras: usa un nombre corto y claro.`);
  const known = new Set(context.photos.map(photo => photo.path)), seen = new Set<string>();
  for (const tile of menu.groups.flatMap(group => group.tiles ?? [])) {
    if (!known.has(tile.image)) out.push(`La foto ${tile.image} del menú no es de la tienda: usa solo las rutas de las fotos que te dan.`);
    else if (seen.has(tile.image)) out.push(`La foto ${tile.image} sale dos veces en el menú: cada foto una sola vez.`);
    seen.add(tile.image);
  }
  if (menu.groups.some(group => group.links.some(link => link.to.split('/').length > 2))) out.push('El menú tiene más de dos niveles: grupo → enlace, nada más.');
  return [...new Set(out)];
}

/** Final review 2026-11-15 (C1): the writer cannot change the menu, so the direction's menu is cleaned in code instead of failing the
 *  build — at most 7 groups, labels cut to 28 letters, only the store's photos and each once, links two levels deep at most. */
export function cleanMenu(menu: V2Menu, context: Pick<V2Context, 'photos'>): V2Menu {
  const known = new Set(context.photos.map(photo => photo.path)), seen = new Set<string>();
  return { model: menu.model, groups: menu.groups.slice(0, 7).map(group => ({
    ...group,
    label: group.label.slice(0, 28).trim(),
    links: group.links.filter(link => link.to.split('/').length <= 2),
    tiles: (group.tiles ?? []).filter(tile => known.has(tile.image) && !seen.has(tile.image) && seen.add(tile.image)),
  })).filter(group => group.label && group.links.length) };
}

/** config.js with the store's menu in header.menu; the rest of the config as it was. */
export function withStoreMenu<T extends { path: string; content: string }>(files: T[], menu: V2Menu): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = readConfigData([file as never]);
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, header: { ...(config.header ?? {}), menu: { model: menu.model, groups: menu.groups } } })};` };
  });
}
