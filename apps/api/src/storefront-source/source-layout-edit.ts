/* Template quick edits (spec docs/superpowers/specs/2026-11-01-template-quick-edits.md §1): a template store's home draws its
 * `layout` only, so a words, remove or move request changes those blocks. The model answers exact operations on the numbered
 * sections it was shown; this pure module turns them into a safe layout and the words of the reply. Photos are left alone. */
import { LIBRARY_CATALOG, TEXT_CAPS, type LayoutBlock, type LibraryRole } from './source-section-library';
import { photoRef, readStoreOps, storeOpSchema, type StoreEditPhoto, type StoreOp } from './source-store-edit';

export type LayoutTextField = 'eyebrow' | 'title' | 'text' | 'cta' | 'cta2';
/** YAPI edits everything (spec 2026-11-03): `page` = the product page's sections (productLayout) instead of the home; `photo` swaps a
 *  photo the section already shows (field photo | photo2, or an item's photo) for one of the numbered photos (value f0, f1…). */
export type LayoutOp = { op: 'text' | 'remove' | 'move' | 'add' | 'photo'; at: number; field: LayoutTextField | 'photo' | 'photo2' | ''; item: number; value: string; to: number; type?: string; page?: LayoutPage };
/** Spec 2026-11-05 (owner: «cambia nosotros a algo más bonito … solo eso»): the menu pages that may carry the template's sections
 *  (store-data `pageLayouts`), each edited on its own. */
export const MENU_PAGES = ['about', 'contact', 'faq', 'shipping'] as const;
export type MenuPage = typeof MENU_PAGES[number];
export type LayoutPage = 'home' | 'product' | MenuPage;
export const MENU_PAGE_NAMES: Record<MenuPage, string> = { about: 'Nosotros', contact: 'Contacto', faq: 'Preguntas frecuentes', shipping: 'Envíos' };
const isMenuPage = (page: unknown): page is MenuPage => (MENU_PAGES as readonly unknown[]).includes(page);
const MENU_PAGE_URLS: Record<MenuPage, string> = { about: 'nosotros.html', contact: 'contacto.html', faq: 'faq.html', shipping: 'envios.html' };
const MENU_PAGE_WORDS = /\b(nosotros|qui[eé]nes somos|contacto|cont[aá]ctanos|preguntas|faq|env[ií]os?|entregas|p[aá]ginas?)\b/i;

/** Minor 2026-11-05 (every quick edit sent the menu pages and their section list): the pages that ride in the quick edit — the ones
 *  with sections always, every page and the new-section list (`offer`) only when the request names a page or one is open; null = none. */
export function menuPagesFor(pages: Record<MenuPage, LayoutBlock[]>, request: string, currentPage?: string): { pages: Partial<Record<MenuPage, LayoutBlock[]>>; offer: boolean } | null {
  const open = String(currentPage ?? '').replace(/^\/+/, '').split(/[?#]/)[0];
  if (MENU_PAGE_WORDS.test(request) || MENU_PAGES.some(page => MENU_PAGE_URLS[page] === open)) return { pages, offer: true };
  const built = Object.fromEntries(MENU_PAGES.filter(page => pages[page]?.length).map(page => [page, pages[page]])) as Partial<Record<MenuPage, LayoutBlock[]>>;
  return Object.keys(built).length ? { pages: built, offer: false } : null;
}
export type LayoutEditRead = { ops: LayoutOp[]; store: StoreOp[]; rest: string };
/** Fix 3 (2026-11-02): a section the merchant asked for, from the library, before the section `to` showed (-1 = before the closing). */
export type LayoutAdd = { type: string; to: number; about: string };
export type LayoutDigestSection = { at: number; type: string; name: string; eyebrow?: string; title?: string; text?: string; cta?: string; cta2?: string; items?: Array<{ title: string; text?: string; foto?: true }>;
  /** The photo places the section shows (never the photos themselves). */
  fotos?: Array<'photo' | 'photo2'> };

const FIELDS: readonly LayoutTextField[] = ['eyebrow', 'title', 'text', 'cta', 'cta2'];
const ROLE = new Map(LIBRARY_CATALOG.map(section => [section.id, section.role]));
const MAIN_GRIDS = new Set(['products-grid', 'products-tabs']);
// What a merchant may add to a template home: any library section but a second cover or main grid, decoration and the menu note.
const ADDABLE = LIBRARY_CATALOG.filter(section => section.role !== 'cover' && !MAIN_GRIDS.has(section.id) && !section.decor && section.id !== 'bar-note');
const ADDABLE_IDS = new Set(ADDABLE.map(section => section.id));
const MAX_ADDS = 2;
// A menu page may also start with a cover: «Nosotros» built from nothing reads like the template's home (spec 2026-11-05).
const PAGE_ADDABLE = LIBRARY_CATALOG.filter(section => !MAIN_GRIDS.has(section.id) && !section.decor && section.id !== 'bar-note');
const PAGE_ADDABLE_IDS = new Set(PAGE_ADDABLE.map(section => section.id));
const MAX_PAGE_ADDS = 5;
// However many requests build it, a menu page stays a page, not a second home (minor 2026-11-05).
const MAX_PAGE_SECTIONS = 8;
// What the merchant calls each kind of section; the reply names a section by its own title first.
const ROLE_NAME: Record<LibraryRole, string> = { cover: 'la portada', strip: 'la franja', products: 'los productos', story: 'la historia', benefits: 'los beneficios',
  proof: 'las reseñas', promo: 'la promoción', info: 'la información', closing: 'el cierre' };
const FIELD_NAME: Record<LayoutTextField, string> = { eyebrow: 'la línea pequeña', title: 'el título', text: 'el texto', cta: 'el botón', cta2: 'el segundo botón' };
const ITEM_CAP = { title: TEXT_CAPS.itemTitle, text: TEXT_CAPS.itemText } as const;
const clip = (value: unknown, cap: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, cap).trim();
const isCover = (block: LayoutBlock) => ROLE.get(block.type) === 'cover';
const kindOf = (block: LayoutBlock) => ROLE_NAME[ROLE.get(block.type) ?? 'story'];
const nameIn = (block: LayoutBlock) => block.title ? `«${block.title}»` : kindOf(block);
// Where a words change happened: the cover by its kind (its old title would read as the new one), any other section by its title.
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const placeIn = (block: LayoutBlock) => isCover(block) ? 'la portada' : block.title ? `la sección «${block.title}»` : kindOf(block);

/** The sections a request may add, as the model reads them; a menu page's list also has the covers. */
export function addableSections(page: 'home' | 'menu' = 'home'): Array<{ id: string; use: string }> {
  return (page === 'menu' ? PAGE_ADDABLE : ADDABLE).map(({ id, use }) => ({ id, use }));
}

/** The home as the model reads it: numbered sections, what kind each is and its current words. */
export function layoutDigest(layout: readonly LayoutBlock[]): LayoutDigestSection[] {
  return layout.map((block, at) => {
    const section: LayoutDigestSection = { at, type: block.type, name: kindOf(block) };
    for (const field of FIELDS) if (block[field]) section[field] = block[field];
    if (block.items?.length) section.items = block.items.map(item => ({ title: item.title, ...(item.text ? { text: item.text } : {}), ...(item.photo ? { foto: true as const } : {}) }));
    const places = (['photo', 'photo2'] as const).filter(field => block[field]);
    if (places.length) section.fotos = places;
    return section;
  });
}

export const LAYOUT_EDIT_PROMPT = `Eres YAPI y editas una tienda pagosYa hecha con una plantilla. La portada es la lista «secciones»
(numeradas con at, de arriba abajo, con sus textos actuales; «fotos» dice qué fotos muestra); «nuevas» son las secciones ya
diseñadas que se pueden agregar. El comercio pide un cambio. Respondes «ops» con los cambios exactos de las secciones, «store» con
los de los datos de la tienda y «rest» con lo que estas operaciones no pueden hacer.

Operaciones de «ops» (todos los campos van siempre; los que no se usan: field "", item -1, value "", to -1, type "", page "home"):
- text: cambia un texto de la sección at. field = eyebrow (línea pequeña sobre el título), title, text, cta (texto del botón) o cta2.
  item = -1 para el texto de la sección; o el número del punto (items, desde 0) para cambiar su title o su text. value = el texto
  nuevo; si el comercio dio las palabras, cópialas exactas. value vacío quita ese texto.
- remove: quita la sección at.
- move: pone la sección at en el lugar de la sección to (to = 0 es arriba del todo; la última sección = al final).
- add: agrega una sección NUEVA cuando el comercio pide algo que la portada no tiene (una guía, preguntas frecuentes, pasos, una
  comparación, una oferta, su historia, reseñas…). type = el id de «nuevas» que mejor lo muestra; to = el número de la sección
  ANTES de la cual va (-1 = al final, antes del cierre); value = en una frase, qué debe mostrar según el pedido (sus temas, sus
  palabras). at = -1. Sus textos y fotos se escriben después con los datos de la tienda. Como mucho 2 secciones nuevas por pedido.
  Si la portada ya tiene una sección que hace eso, cambia sus textos en vez de agregar otra.

Páginas del menú: «paginas» trae Nosotros (about), Contacto (contact), Preguntas frecuentes (faq) y Envíos (shipping) con sus
secciones (numeradas con at, como la portada; [] = hoy solo muestra su texto). Un cambio de una de esas páginas lleva page = about,
contact, faq o shipping; sus at son los de esa página; nunca cambies la portada ni otra página por ese pedido. «Haz Nosotros más
bonita», «cambia nosotros a algo más lindo», «que contacto se vea mejor»: si la página tiene pocas secciones, agrégale de 3 a 5
con add y su page (una sola portada cover-*, que va primero; luego historia, beneficios, pasos o un cierre con foto), escogidas de
«nuevas_paginas» y prefiriendo los tipos de «plantilla» (las secciones que usa la portada de esta plantilla); si ya tiene, cambia
sus textos o fotos. Como mucho 5 secciones nuevas por página y pedido. Su texto de la página (store about) no cambia por eso.
Una página que no viene en «paginas» no es parte de este pedido; sin «nuevas_paginas» no agregues secciones a ninguna página del menú.

Reglas:
- Usa solo los números de «secciones» (o de la página del menú que pidió). Cambia solo lo que el comercio pidió; nunca reescribas lo demás.
- «el titular», «el título principal», «el texto grande de arriba» = el title de la portada (la primera sección cover-*). «el botón»
  sin más = el cta de la portada.
- Una sección se reconoce por su título actual o por lo que muestra (preguntas, reseñas, productos, beneficios…).
- Escribe en español natural, con la voz de la tienda, del largo de los textos que ya tiene.
- rest: lo que el comercio pidió y no se hace con estas operaciones — colores, letras, el menú, cómo se ve una sección, una sección
  que ninguna de «nuevas» puede mostrar, una página nueva, direcciones de locales, formas de pago, una foto que no mandó —, con sus
  propias palabras. "" si todo se hizo con ops y store.
- Si nada del pedido se hace con ops ni con store: ops = [], store = [] y rest = el pedido entero.`;

export function layoutEditSchema() {
  const op = { type: 'object', additionalProperties: false, required: ['op', 'at', 'field', 'item', 'value', 'to', 'type', 'page'], properties: {
    op: { type: 'string', enum: ['text', 'remove', 'move', 'add', 'photo'] }, at: { type: 'integer' }, field: { type: 'string', enum: [...FIELDS, 'photo', 'photo2', ''] },
    item: { type: 'integer' }, value: { type: 'string' }, to: { type: 'integer' }, type: { type: 'string', enum: [...PAGE_ADDABLE_IDS, ''] }, page: { type: 'string', enum: ['home', 'product', ...MENU_PAGES] } } };
  return { type: 'object', additionalProperties: false, required: ['ops', 'store', 'rest'], properties: { ops: { type: 'array', items: op }, store: { type: 'array', items: storeOpSchema() }, rest: { type: 'string' } } };
}

/** The model's answer, checked: known operations only, and the rest trimmed. Null when there is no answer. */
export function readLayoutEdit(answer: unknown): LayoutEditRead | null {
  if (!answer || typeof answer !== 'object') return null;
  const raw = answer as { ops?: unknown; store?: unknown; rest?: unknown };
  const ops = (Array.isArray(raw.ops) ? raw.ops : []).filter((op): op is LayoutOp => Boolean(op) && ['text', 'remove', 'move', 'add', 'photo'].includes((op as LayoutOp).op)
    && Number.isInteger((op as LayoutOp).at))
    // The home is the default page; only the product page and the menu pages are marked.
    .map(op => { const { page, ...rest } = op; return page === 'product' || isMenuPage(page) ? { ...rest, page } : rest; });
  return { ops, store: readStoreOps(raw.store), rest: String(raw.rest ?? '').replace(/\s+/g, ' ').trim() };
}

/** The sections a request adds, checked: a known addable section the home does not have yet, at most two. The caller fills each
 *  (words and photos from the store's facts) and hands the filled blocks back to applyLayoutOps. */
export function layoutAdds(layout: readonly LayoutBlock[], ops: readonly LayoutOp[], page: LayoutPage = 'home'): { adds: LayoutAdd[]; refused: string[] } {
  const adds: LayoutAdd[] = [];
  const refused: string[] = [];
  // The product page takes no new section; a menu page (spec 2026-11-05) up to five, one of them a cover.
  if (page === 'product') return { adds, refused };
  const menu = isMenuPage(page);
  const allowed = menu ? PAGE_ADDABLE_IDS : ADDABLE_IDS;
  const where = menu ? `Tu página «${MENU_PAGE_NAMES[page]}»` : 'Tu portada';
  for (const op of ops.filter(entry => entry.op === 'add' && (entry.page ?? 'home') === page)) {
    const type = String(op.type ?? '');
    // The schema offers covers for the menu pages; on the home one is said, never dropped silently (review 2026-11-05).
    if (!menu && ROLE.get(type) === 'cover') { refused.push('Tu tienda ya tiene su portada arriba: pídeme cambiar sus textos o su foto.'); continue; }
    if (!allowed.has(type) || adds.some(add => add.type === type)) continue;
    const there = layout.find(block => block.type === type);
    if (there) { refused.push(`${where} ya tiene ${nameIn(there)}: pídeme cambiar sus textos.`); continue; }
    if (ROLE.get(type) === 'cover' && [...layout, ...adds].some(block => ROLE.get(block.type) === 'cover')) { refused.push(`${where} lleva una portada, no dos.`); continue; }
    if (menu && layout.length + adds.length >= MAX_PAGE_SECTIONS) {
      refused.push(`${where} ya tiene ocho secciones, el máximo de una página: quita una o pídeme cambiar las que tiene.`);
      break;
    }
    if (adds.length >= (menu ? MAX_PAGE_ADDS : MAX_ADDS)) {
      refused.push(menu ? `Agrego hasta cinco secciones por pedido en ${where.replace('Tu', 'tu')}: pídeme las demás después.` : 'Agrego hasta dos secciones por pedido: pídeme la siguiente después.');
      break;
    }
    adds.push({ type, to: Number.isInteger(op.to) && op.to >= 0 && op.to < layout.length ? op.to : -1, about: clip(op.value, 300) });
  }
  return { adds, refused };
}

/** The operations applied to the home. Ops name the sections by the numbers the model saw, whatever was removed or moved first.
 *  The cover and the main grid stay, the cover stays on top and keeps its title, and an item always keeps its title. */
export function applyLayoutOps(layout: readonly LayoutBlock[], allOps: readonly LayoutOp[], added: ReadonlyArray<{ to: number; block: LayoutBlock }> = [],
  options: { page?: LayoutPage; photos?: readonly StoreEditPhoto[] } = {}): { layout: LayoutBlock[]; done: string[]; refused: string[] } {
  // Spec 2026-11-03: the ops of one page (the home unless marked); the product page's sections are named «de la ficha», a menu
  // page's «de la página «Nosotros»» (spec 2026-11-05).
  const page = options.page ?? 'home';
  const ops = allOps.filter(op => (op.page ?? 'home') === page);
  const where = page === 'product' ? ' de la ficha de producto' : isMenuPage(page) ? ` de la página «${MENU_PAGE_NAMES[page]}»` : '';
  // The product page's sections are named «… de la ficha de producto» right where the reply names them.
  const placeOf = (block: LayoutBlock) => `${placeIn(block)}${where}`;
  const nameOf = (block: LayoutBlock) => `${nameIn(block)}${where}`;
  const blocks = layout.map(block => ({ ...block, ...(block.items ? { items: block.items.map(item => ({ ...item })) } : {}) }));
  const done: string[] = [];
  const refused: string[] = [];
  const known = (at: number) => Number.isInteger(at) && at >= 0 && at < blocks.length;
  // Words first, on the blocks as they were shown.
  for (const op of ops.filter(entry => entry.op === 'text')) {
    if (!known(op.at) || !(FIELDS as readonly string[]).includes(op.field)) continue;
    const block = blocks[op.at];
    const field = op.field as LayoutTextField;
    if (Number.isInteger(op.item) && op.item >= 0) {
      const item = block.items?.[op.item];
      if (!item || (field !== 'title' && field !== 'text')) continue;
      const value = clip(op.value, ITEM_CAP[field]);
      if (value === (item[field] ?? '')) continue;
      if (!value && field === 'title') { refused.push(`No dejé sin título un punto de ${nameOf(layout[op.at])}.`); continue; }
      if (value) item[field] = value; else delete item.text;
      done.push(value ? `${field === 'title' ? 'el título' : 'el texto'} del punto ${op.item + 1} de ${placeOf(layout[op.at])} ahora dice «${value}»` : `quité el texto del punto ${op.item + 1} de ${placeOf(layout[op.at])}`);
      continue;
    }
    const value = clip(op.value, TEXT_CAPS[field]);
    if (value === (block[field] ?? '')) continue;
    if (!value && field === 'title' && isCover(block)) { refused.push('No dejé la portada sin título.'); continue; }
    if (value) block[field] = value; else delete block[field];
    if (field === 'cta') { if (value) block.link = block.link || 'products'; else delete block.link; }
    if (field === 'cta2') { if (value) block.link2 = block.link2 || 'products'; else delete block.link2; }
    done.push(value ? `${FIELD_NAME[field]} de ${placeOf(layout[op.at])} ahora dice «${value}»` : `quité ${FIELD_NAME[field]} de ${placeOf(layout[op.at])}`);
  }
  // Photos (spec 2026-11-03): a photo the section already shows, swapped for one of the numbered photos; never a new photo place.
  for (const op of ops.filter(entry => entry.op === 'photo')) {
    if (!known(op.at)) continue;
    const block = blocks[op.at];
    const url = photoRef(op.value, options.photos ?? []);
    if (!url) { refused.push(`No cambié la foto de ${placeOf(layout[op.at])}: mándame la foto en el mensaje.`); continue; }
    if (Number.isInteger(op.item) && op.item >= 0) {
      const item = block.items?.[op.item];
      if (!item?.photo) { refused.push(`${upper(placeOf(layout[op.at]))} no muestra una foto en ese punto.`); continue; }
      if (item.photo === url) continue;
      item.photo = url;
      done.push(`cambié la foto del punto ${op.item + 1} de ${placeOf(layout[op.at])}`);
      continue;
    }
    const field = op.field === 'photo2' ? 'photo2' : 'photo';
    if (!block[field]) { refused.push(`${upper(placeOf(layout[op.at]))} no muestra una foto ahí.`); continue; }
    if (block[field] === url) continue;
    block[field] = url;
    done.push(`cambié la ${field === 'photo2' ? 'segunda foto' : 'foto'} de ${placeOf(layout[op.at])}`);
  }
  // Then removals and moves, by the blocks' first numbers.
  let order = blocks.map((_, at) => at);
  for (const op of ops.filter(entry => entry.op === 'remove')) {
    if (!known(op.at) || !order.includes(op.at)) continue;
    const block = layout[op.at];
    // A menu page may lose any section, its cover too: emptied, it shows its text again (review 2026-11-05).
    if (isCover(block) && !isMenuPage(page)) { refused.push('No quité la portada: es lo primero que ve tu cliente.'); continue; }
    if (MAIN_GRIDS.has(block.type)) { refused.push('No quité la grilla de productos: la tienda la necesita para vender.'); continue; }
    order = order.filter(at => at !== op.at);
    done.push(`quité ${nameOf(block)}`);
  }
  for (const op of ops.filter(entry => entry.op === 'move')) {
    if (!known(op.at) || !known(op.to) || op.at === op.to || !order.includes(op.at)) continue;
    const block = layout[op.at];
    if (isCover(block)) { refused.push('No moví la portada: va siempre arriba.'); continue; }
    const without = order.filter(at => at !== op.at);
    const cover = without.findIndex(at => isCover(layout[at]));
    let place = without.indexOf(op.to);
    if (place < 0) continue;
    if (op.at < op.to) place += 1;
    // Nothing goes above the cover.
    place = Math.max(place, cover + 1);
    const next = [...without.slice(0, place), op.at, ...without.slice(place)];
    if (next.join() === order.join()) continue;
    order = next;
    done.push(`moví ${nameOf(block)}`);
  }
  // Last, the new sections (filled by the caller): before the section they were asked before, else before the closing; never
  // above the cover.
  const pageAdds: string[] = [];
  for (const { to, block } of added) {
    const at = blocks.push(block) - 1;
    const closing = order.length && ROLE.get(blocks[order.at(-1)!].type) === 'closing' ? order.length - 1 : order.length;
    let place = to >= 0 && order.includes(to) ? order.indexOf(to) : closing;
    // A menu page's new cover (the only place one can be added) goes on top.
    place = isCover(block) ? 0 : Math.max(place, order.findIndex(index => isCover(blocks[index])) + 1);
    order = [...order.slice(0, place), at, ...order.slice(place)];
    const name = block.title ? `la sección «${block.title}»` : kindOf(block);
    if (isMenuPage(page)) { pageAdds.push(name); continue; }
    // «agregué la sección «A» y la sección «B»», not «agregué … y agregué …».
    done.push(`${done.at(-1)?.startsWith('agregué') ? '' : 'agregué '}${name}`);
  }
  if (pageAdds.length && isMenuPage(page)) {
    const list = pageAdds.length > 1 ? `${pageAdds.slice(0, -1).join(', ')} y ${pageAdds.at(-1)}` : pageAdds[0];
    done.push(`agregué ${list} a tu página «${MENU_PAGE_NAMES[page]}»`);
  }
  return { layout: order.map(at => blocks[at]), done, refused };
}

/** The reply: what changed, then what YAPI would not do and why. */
export function layoutEditReply(done: readonly string[], refused: readonly string[]): string {
  const list = done.length > 1 ? `${done.slice(0, -1).join(', ')} y ${done.at(-1)}` : done[0] ?? '';
  return [list ? `Listo: ${list}.` : '', ...refused, list ? 'Revisa la vista previa.' : ''].filter(Boolean).join(' ');
}
