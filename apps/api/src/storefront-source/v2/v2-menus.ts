import { readConfigData, type V2Context } from './v2-context';

/** Owner 2026-11-15 («changing menu per store, its always the same»; «put all of them»): the store's menu is one of the kit's 16
 *  models (commerce-src/header/store-menu.js), chosen by the V2 direction per store and written into config.js header.menu. */
export type V2Menu = { model: string; groups: Array<{ label: string; note?: string; links: Array<{ to: string; label?: string; note?: string }>; tiles?: Array<{ to: string; image: string }> }> };

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

/** Owner 2026-11-16 evening («i want the 16 menus again»): the five-menu cut (same morning, «Keep 5») made every fashion store
 *  pick «mega». All 16 are offered again; each store's design dresses its menu in its own theme (menuStyleBrief). */
export const V2_MENU_OFFERED: readonly string[] = V2_MENU_MODELS.map(model => model.id);

/** The parts each menu model draws (packages/storefront-kit/commerce-src/header/store-menu.js), for the design to style. The rail's
 *  panel is drawn as a drawer. */
const PANEL = '.pym-panel[data-model=%]';
const MENU_PARTS: Record<string, string[]> = {
  tabs: [PANEL, '.pym-tabs .pym-tab', '.pym-tab[aria-selected=true]', '.pym-links a', '.pym-note', '.pym-tiles a', '.pym-tiles img'],
  mega: [PANEL, '.pym-links a', '.pym-tiles a', '.pym-tiles img', '.pym-tile-title'],
  overlay: [PANEL, '.pym-links a', '.pym-hero-photo', '.pym-hero-photo img', '.pym-close'],
  dropdown: [PANEL, '.pym-links a', '.pym-note', '.pym-tiles a', '.pym-tiles img'],
  drawer: [PANEL, '.pym-links a', '.pym-tiles a', '.pym-tiles img', '.pym-close'],
  split: [PANEL, '.pym-links a', '.pym-hero-photo', '.pym-hero-photo img', '.pym-close'],
  index: [PANEL, '.pym-links a', '.pym-count', '.pym-note'],
  dock: ['.pym-dock', '.pym-dock button', PANEL, '.pym-links a'],
  stickers: [PANEL, '.pym-links a', '.pym-sticker-photo', '.pym-sticker-photo img'],
  circles: ['.pym-circles', '.pym-circles a', '.pym-circles img', '.pym-circles span', PANEL, '.pym-links a'],
  rail: ['.pym-rail', '.pym-rail .pym-links a', '.pym-rail-logo', '.pym-panel[data-model=drawer]'],
  bestsellers: [PANEL, '.pym-links a', '.pym-best', '.pym-best-title', '.pym-price', '.pym-add'],
  need: [PANEL, '.pym-need', '.pym-need img', '.pym-need-label', '.pym-need-from', '.pym-links a'],
  offer: [PANEL, '.pym-offer', '.pym-links a', '.pym-best', '.pym-price', '.pym-add'],
  search: [PANEL, '.pym-search input', '.pym-popular', '.pym-best', '.pym-price'],
  thumb: ['.pym-thumbbar', '.pym-thumbbar a', '.pym-thumbbar button', PANEL, '.pym-links a'],
};
export const menuParts = (model: string): string[] => (MENU_PARTS[model] ?? [PANEL, '.pym-links a']).map(part => part.replace('%', model));

/** What the design-system writer is told about the store's menu (owner 2026-11-16: «i want yapi to personalize the css of each menu
 *  with the thematic of each store, not just a blueprint»). The kit's sheet keeps the layout working; the design dresses it. */
export function menuStyleBrief(model: string): string {
  return `\n\nEL MENÚ DE ESTA TIENDA ES «${model}» (lo dibuja la plataforma; tú lo VISTES con el tema de esta tienda, no lo dejes de plantilla).
En styles/globals.css escribe entre 6 y 14 reglas para sus piezas: ${menuParts(model).join(' · ')}.
Que se note la marca: el fondo y el color del panel (de la paleta, nunca gris de sistema), la letra de los enlaces (la display de la tienda,
su tamaño, mayúsculas o cursiva, espaciado), cómo se marca el enlace activo o al pasar el mouse (subrayado dibujado, cambio de color,
desplazamiento suave), la forma de las fotos (radio, marco, filtro o borde de la marca), separadores y detalles del tema (una línea fina, un
número, un sello) y una entrada con movimiento corto (≤ 300 ms). Empieza cada selector con «html body » para ganar a la hoja de la
plataforma (por ejemplo «html body ${menuParts(model)[0]} { … }»); nada de !important. No cambies posiciones (position, inset, top), ni
display de los grupos, ni z-index: el panel tiene que seguir abriendo, cerrando y cabiendo en el teléfono.`;
}

/** The design dressed its menu: at least three rules on the model's parts (owner 2026-11-16, «not just a blueprint»). */
export function menuStyleProblem(css: string, model: string | undefined): string | null {
  if (!model) return null;
  const rules = [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1]).filter(selector => /\.pym-/.test(selector));
  return rules.length >= 3 ? null
    : `El menú «${model}» quedó de plantilla: en styles/globals.css viste sus piezas con el tema de la tienda (6 a 14 reglas, cada selector empieza con «html body »): ${menuParts(model).join(' · ')}.`;
}

/** The offered models this merchant's other stores have not used; all five once every one is used. */
export const allowedMenus = (used: readonly string[]): string[] => {
  const all = V2_MENU_MODELS.map(m => m.id).filter(id => V2_MENU_OFFERED.includes(id));
  const free = all.filter(id => !used.includes(id));
  return free.length ? free : all;
};

export function v2MenuSchema(allowed: readonly string[]): object {
  // Every link carries its label: section: and extra: targets have no name of their own (live 2026-11-16, Oh Belly r24 lost a group).
  const link = { type: 'object', additionalProperties: false, required: ['to', 'label', 'note'], properties: { to: { type: 'string' }, label: { type: 'string' }, note: { type: 'string' } } };
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
