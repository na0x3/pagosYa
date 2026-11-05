/** Dropdown menu spec 2026-10-21: the store menu (config.js header.menu), checked at save and drawn by the kit
 *  (commerce-src/header/store-menu.js). Links name targets, never URLs, so a menu can only point at what the store has;
 *  the kit resolves them against the live store. Without groups the kit builds the menu from the categories and pages. */
import { patchConfigFile, readConfigFile } from './store-look';

export const STORE_MENU_STYLES = ['panel', 'dropdowns'] as const;
export type StoreMenuStyle = typeof STORE_MENU_STYLES[number];
export type StoreMenuLink = { label?: string; to: string };
export type StoreMenuTile = { title: string; image: string; to: string };
/** `direct` (spec 2026-11-05 creates anything): a one-link entry drawn as a plain link in the bar, not a dropdown. */
export type StoreMenuGroup = { label: string; links: StoreMenuLink[]; tilesTitle?: string; tiles?: StoreMenuTile[]; footer?: { label: string; to: string }; direct?: true };
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
  // The pages YAPI made (spec 2026-11-05 creates anything), from store-data.
  const storeData = files.find(file => file.path === 'components/store-data.tsx')?.content ?? '';
  const extra = /export const extraPages: any\[\] = (\[.*\]);/.exec(storeData)?.[1];
  let listed: unknown = [];
  try { listed = extra ? JSON.parse(extra) : []; } catch { listed = []; }
  for (const page of (Array.isArray(listed) ? listed : []) as Array<{ slug?: unknown; name?: unknown }>)
    if (typeof page.slug === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(page.slug) && typeof page.name === 'string') targets.set(`extra:${page.slug}`, page.name);
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
    const direct = group.direct === true && links.length === 1 ? { direct: true as const } : {};
    return [{ label: name, ...direct, links, ...(tiles.length ? { ...(tilesTitle ? { tilesTitle } : {}), tiles } : {}), ...(footerTo && footerLabel ? { footer: { label: footerLabel, to: footerTo } } : {}) }];
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
/** A clause that asks for something besides the menu: another part of the store, or an action of its own. */
const OTHER_PART = /(?<!\p{L})(secci[oó]n(es)?|p[aá]ginas?|redise\p{L}*|banners?|fotos?|im[aá]genes?|colou?r(es)?|fuentes?|tipograf\p{L}*|textos?|t[ií]tulos?|portada|hero|tarjetas?|botones?|logos?|fondo|precios?|productos? nuevos?|rese[nñ]as?)(?!\p{L})/iu;
const ACTION = /(?<!\p{L})(cambi\p{L}*|quit\p{L}*|elimin\p{L}*|agreg\p{L}*|a[nñ]ad\p{L}*|pon\p{L}*|crea\p{L}*|haz|hazl\p{L}*|sub\p{L}*|reemplaz\p{L}*|muev\p{L}*|borr\p{L}*)(?!\p{L})/iu;
export function instructionOnlyAboutStoreMenu(text: string): boolean {
  const clauses = text.split(CLAUSES).map(part => part.trim()).filter(part => part && !FILLER.test(part));
  // What the menu holds («y las marcas», «cada una con su enlace») is still the menu (owner 2026-10-22: goodProtein's dropdown
  // went to a full design edit and failed twice); a clause naming another part or an action of its own is another change.
  return clauses.some(clause => ABOUT_MENU.test(clause)) && clauses.every(clause => ABOUT_MENU.test(clause) || (!OTHER_PART.test(clause) && !ACTION.test(clause)));
}
/** Looser: «agrega Accesorios al menú». Counts only for a store whose menu already exists. */
export const instructionTouchesStoreMenu = (text: string) => MENU_ASK.test(text) || MENU_TOUCH.test(text);

/** Esencial's dice record (variants.menu) as the config the kit reads; `none` or no record means no menu. */
export function menuFromVariant(variant: unknown, groups: unknown, ctx: StoreMenuContext): StoreMenu | undefined {
  return checkStoreMenu({ style: variant, groups }, ctx) ?? undefined;
}

/** YAPI creates anything (spec 2026-11-05): the menu follows the pages YAPI made — each linked where its `menu` says (the bar, as a
 *  one-link `direct` entry, or a named dropdown; a name with no dropdown = the bar), renamed with the page, and the links of pages no
 *  longer there removed. A store without a menu gets one; the kit draws its own entries before direct links. */
export function withExtraPageLinks(menu: StoreMenu | undefined, pages: ReadonlyArray<{ slug: string; name: string; menu: string }>): { menu: StoreMenu; refused: string[] } {
  const refused: string[] = [];
  const slugs = new Set(pages.map(page => page.slug));
  let groups: StoreMenuGroup[] = (menu?.groups ?? []).map(group => ({ ...group, links: group.links.filter(link => !link.to.startsWith('extra:') || slugs.has(link.to.slice(6))) }))
    .filter(group => group.links.length);
  for (const page of pages) {
    const to = `extra:${page.slug}`;
    const link = { label: page.name.slice(0, STORE_MENU_LIMITS.label).trim(), to };
    const inGroup = page.menu ? groups.find(group => !group.direct && group.label.toLowerCase() === page.menu.toLowerCase()) : undefined;
    // One place only: out of every other entry first.
    groups = groups.map(group => group === inGroup ? group : { ...group, links: group.links.filter(entry => entry.to !== to || (!inGroup && group.direct === true)) }).filter(group => group.links.length);
    if (inGroup) {
      const at = inGroup.links.findIndex(entry => entry.to === to);
      if (at >= 0) inGroup.links[at] = link;
      else if (inGroup.links.length >= STORE_MENU_LIMITS.links) refused.push(`«${inGroup.label}» ya tiene ${STORE_MENU_LIMITS.links} enlaces: no puse «${page.name}» ahí.`);
      else inGroup.links.push(link);
      continue;
    }
    const direct = groups.find(group => group.direct && group.links[0]?.to === to);
    if (direct) { direct.label = link.label; direct.links = [link]; continue; }
    if (groups.length >= STORE_MENU_LIMITS.groups) { refused.push(`Tu menú ya tiene ${STORE_MENU_LIMITS.groups} entradas: no puse «${page.name}» en la barra. Pídeme ponerla dentro de un desplegable.`); continue; }
    groups.push({ label: link.label, links: [link], direct: true });
  }
  return { menu: { style: menu?.style ?? 'dropdowns', groups }, refused };
}
