/** Dropdown menu spec 2026-10-21: the store menu (config.js header.menu), checked at save and drawn by the kit
 *  (commerce-src/header/store-menu.js). Links name targets, never URLs, so a menu can only point at what the store has;
 *  the kit resolves them against the live store. Without groups the kit builds the menu from the categories and pages. */
import { patchConfigFile, readConfigFile } from './store-look';

export const STORE_MENU_STYLES = ['panel', 'dropdowns'] as const;
export type StoreMenuStyle = typeof STORE_MENU_STYLES[number];
export type StoreMenuLink = { label?: string; to: string };
export type StoreMenuTile = { title: string; image: string; to: string };
export type StoreMenuGroup = { label: string; links: StoreMenuLink[]; tilesTitle?: string; tiles?: StoreMenuTile[]; footer?: { label: string; to: string } };
export type StoreMenu = { style: StoreMenuStyle; groups?: StoreMenuGroup[] };
export type StoreMenuContext = { targets: Map<string, string>; photos: Set<string> };
export const STORE_MENU_LIMITS = { groups: 4, links: 12, tiles: 3, label: 28 } as const;
/** The info pages a menu may link; the kit shows each only when the store has something on it. */
const PAGE_NAMES: Record<string, string> = { about: 'Nuestra historia', contact: 'Contacto', shipping: 'Envíos y entregas', refund: 'Cambios y devoluciones', faq: 'Preguntas frecuentes' };

const ABSOLUTE = /^https?:\/\//i;
export function storeMenuContext(data: { categories?: Array<{ id: string; name: string; bannerUrl?: string | null }>; items?: Array<{ categoryId?: string | null; imageUrls?: string[] }>; collections?: Array<{ slug: string; name: string }> }, files: ReadonlyArray<{ path: string; content: string }>): StoreMenuContext {
  const items = data.items ?? [];
  const targets = new Map<string, string>([['all', 'Todos los productos'], ['new', 'Novedades']]);
  for (const category of data.categories ?? []) if (items.some(item => item.categoryId === category.id)) targets.set(`category:${category.id}`, category.name);
  for (const collection of data.collections ?? []) targets.set(`collection:${collection.slug}`, collection.name);
  for (const [page, name] of Object.entries(PAGE_NAMES)) targets.set(`page:${page}`, name);
  // A section anchor is a home id; it has no name of its own, so a link to it must carry a label.
  const index = files.find(file => file.path === 'index.html')?.content ?? '';
  for (const match of index.matchAll(/\sid\s*=\s*["']([\w-]{1,60})["']/g)) targets.set(`section:${match[1]}`, '');
  const photos = new Set<string>([...items.flatMap(item => item.imageUrls ?? []), ...(data.categories ?? []).map(category => category.bannerUrl ?? '')].filter(url => ABSOLUTE.test(url)));
  return { targets, photos };
}

export const storeMenuTargetList = (ctx: StoreMenuContext): Array<{ target: string; label: string }> => [...ctx.targets].map(([target, label]) => ({ target, label }));

const label = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, STORE_MENU_LIMITS.label).trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function checkStoreMenu(raw: unknown, ctx: StoreMenuContext): StoreMenu | null {
  const input = record(raw);
  const style = (STORE_MENU_STYLES as readonly string[]).includes(String(input.style)) ? input.style as StoreMenuStyle : null;
  if (!style) return null;
  const target = (value: unknown) => typeof value === 'string' && ctx.targets.has(value) ? value : null;
  const named = (to: string, given: unknown) => label(given) || ctx.targets.get(to) || '';
  const groups = list(input.groups).flatMap((entry): StoreMenuGroup[] => {
    const group = record(entry);
    const name = label(group.label);
    const links = list(group.links).flatMap(link => {
      const to = target(record(link).to);
      const text = to ? named(to, record(link).label) : '';
      return to && text ? [{ label: text, to }] : [];
    }).slice(0, STORE_MENU_LIMITS.links);
    if (!name || !links.length) return [];
    const tiles = list(group.tiles).flatMap(tile => {
      const { image, title } = record(tile);
      const to = target(record(tile).to);
      return to && typeof image === 'string' && ctx.photos.has(image) && named(to, title) ? [{ title: named(to, title), image, to }] : [];
    }).slice(0, STORE_MENU_LIMITS.tiles);
    const footerTo = target(record(group.footer).to);
    const footerLabel = footerTo ? named(footerTo, record(group.footer).label) : '';
    const tilesTitle = label(group.tilesTitle);
    return [{ label: name, links, ...(tiles.length ? { ...(tilesTitle ? { tilesTitle } : {}), tiles } : {}), ...(footerTo && footerLabel ? { footer: { label: footerLabel, to: footerTo } } : {}) }];
  }).slice(0, STORE_MENU_LIMITS.groups);
  return groups.length ? { style, groups } : { style };
}

/** config.js header.menu as saved (already checked); undefined without one. */
export function readStoreMenu(files: ReadonlyArray<{ path: string; content: string }>): StoreMenu | undefined {
  const menu = readConfigFile(files).header?.menu;
  return menu && (STORE_MENU_STYLES as readonly string[]).includes(menu.style) ? menu as StoreMenu : undefined;
}

/** config.js with header.menu set (or removed with null); a save without config.js takes the saved one first. */
export function withStoreMenuConfig<T extends { path: string; content: string }>(files: T[], previous: ReadonlyArray<{ path: string; content: string }>, menu: StoreMenu | null): T[] {
  const saved = previous.find(file => file.path === 'config.js');
  const withConfig = files.some(file => file.path === 'config.js') || !saved ? files : [...files, { ...saved } as unknown as T];
  return patchConfigFile(withConfig, config => {
    const { menu: _old, ...header } = config.header ?? {};
    return { ...config, header: menu ? { ...header, menu } : header };
  });
}

// «Menú» alone is a restaurant's word too («agrega postres al menú»): only phrases that name a navigation menu switch one on.
// «Dropdown» alone is a size picker too («el dropdown de tallas»): it counts only beside a menu or navigation word.
const MENU_ASK = /(?<!\p{L})(men[uú]s? desplegables?|desplegables? (?:arriba|en (?:la|el) (?:barra|encabezado|header))|men[uú]s? dropdowns?|dropdowns? (?:en (?:el|la) |del? )?(?:men[uú]|navegaci[oó]n|encabezado|header|barra)|mega ?men[uú]s?|men[uú]s? (?:con|de) (?:las |sus )?categor[ií]as|men[uú]s? de (?:navegaci[oó]n|la tienda))(?!\p{L})/iu;
const MENU_REMOVE = /(?<!\p{L})(no|ya no|nunca|quita|qu[ií]ta(?:le|lo)|elimina|saca|oculta|borra|remueve|sin)(?!\p{L})/iu;
/** «…menú desplegable, quítalo»: a removal said right after the ask, in the same sentence. */
const MENU_REMOVE_AFTER = /^[^.!?\n]{0,40}?(?<!\p{L})(qu[ií]talo|elim[ií]nalo|s[aá]calo|b[oó]rralo|oc[uú]ltalo|qu[ií]tala|elim[ií]nala)(?!\p{L})/iu;
const MENU_TOUCH = /(?<!\p{L})(?:al|del|en el|el) men[uú](?!\p{L})/iu;

/** The merchant's words ask for the store menu (true), ask to take it away (false), or say nothing of it. Only the clause that
 *  holds the ask is read: «elimina el banner y pon un menú desplegable» asks for one (final review 2026-10-21). */
export function instructionAsksStoreMenu(text: string): boolean | undefined {
  const asked = MENU_ASK.exec(text);
  if (!asked) return undefined;
  const before = text.slice(0, asked.index);
  const clause = before.slice(Math.max(...[',', '.', ';', ':', '!', '?', '\n', ' y ', ' e ', ' pero '].map(mark => { const at = before.lastIndexOf(mark); return at < 0 ? 0 : at + mark.length; })));
  return !(MENU_REMOVE.test(clause) || MENU_REMOVE_AFTER.test(text.slice(asked.index + asked[0].length)));
}
const CLAUSES = /[,.;:!?\n]| y | e | pero /i;
const FILLER = /^(?:por favor|porfa|gracias|ok|listo|hola|please)$/i;
const ABOUT_MENU = /(?<!\p{L})(men[uú]s?|desplegables?|dropdowns?|categor[ií]as?)(?!\p{L})/iu;
/** Every clause of the request is about the menu: a request that also asks for something else («agrega una sección de reseñas y
 *  un menú desplegable», «rediseña todo y ponle un menú») is a design edit that sets the menu after it (final review 2026-10-21). */
export function instructionOnlyAboutStoreMenu(text: string): boolean {
  const clauses = text.split(CLAUSES).map(part => part.trim()).filter(part => part && !FILLER.test(part));
  return clauses.length > 0 && clauses.every(clause => ABOUT_MENU.test(clause));
}
/** Looser: «agrega Accesorios al menú». Counts only for a store whose menu already exists. */
export const instructionTouchesStoreMenu = (text: string) => MENU_ASK.test(text) || MENU_TOUCH.test(text);

/** Esencial's dice record (variants.menu) as the config the kit reads; `none` or no record means no menu. */
export function menuFromVariant(variant: unknown, groups: unknown, ctx: StoreMenuContext): StoreMenu | undefined {
  return checkStoreMenu({ style: variant, groups }, ctx) ?? undefined;
}
