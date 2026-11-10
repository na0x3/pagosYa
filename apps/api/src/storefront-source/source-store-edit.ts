/* YAPI edits everything (spec docs/superpowers/specs/2026-11-03-yapi-edit-everything-design.md §2): next to the home's sections, the
 * template quick edit reads the store's own data — about, contact, policies, the merchant's FAQ questions, the announcement, the
 * footer line, social links, the signup popup, the catalogue title and the products — and answers exact operations on it. This pure
 * module draws that digest, checks the operations and turns them into one change the caller writes (database and files), plus
 * the words of the reply. */
import { policyTextProblem } from './source-agent-policies';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { STORE_FAQ_LIMITS, STORE_POLICY_KEYS, type StoreFaqEntry, type StorePolicies } from '../stores/store-presentation';
import type { ProductVariant } from '../payment-links/product-variants';
import { isFilterStyle, type FilterStyle } from './source-filter-style';
import type { MasterPart } from './source-master';
import { nextPopupLook, POPUP_LOOK_NAMES, readPopupLook, type PopupLookId } from '../store-popups/popup-looks';

export const STORE_PARTS = ['about', 'contact', 'policy', 'faq', 'announcement', 'header', 'footer', 'social', 'popup', 'catalog', 'product'] as const;
export type StorePart = typeof STORE_PARTS[number];
export const STORE_FIELDS = ['tagline', 'text', 'phone', 'email', 'whatsapp', ...STORE_POLICY_KEYS, 'add', 'set', 'remove', 'instagram', 'tiktok', 'facebook', 'youtube', 'x',
  'on', 'off', 'title', 'button', 'discount', 'name', 'price', 'description', 'photo', 'filters', 'color', 'style', 'redesign', 'undo', 'game', 'prize', 'question', 'prizes'] as const;
export type StoreOp = { part: StorePart; field: string; at: number; title: string; value: string };

export type StoreEditProduct = { id: string; name: string; amount: number; description: string; imageUrls: string[]; options: boolean;
  /** YAPI creates anything part 2 (spec 2026-11-05): the catalog fields the chat may change; absent when the rows could not be read. */
  stock?: number | null; categoryId?: string | null; currency?: string; variants?: ProductVariant[] };
export type StoreEditCategory = { id: string; name: string; count: number };
export type StoreEditCode = { id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number; active: boolean; emails: boolean; assistant: boolean };
export type StoreEditState = {
  tagline: string; aboutText: string; contactPhone: string; contactEmail: string;
  /** The floating WhatsApp button (owner 2026-11-08); absent reads as on, the column's default. */
  whatsappButton?: boolean;
  policies: StorePolicies; faq: StoreFaqEntry[];
  /** The store-data words the template Shell draws (copy.announcement, copy.tagline). */
  announcement: string; footer: string;
  links: Array<{ label: string; url: string }>;
  /** designed: the store has its own popup design (spec 2026-11-08); previous: there is one to go back to. */
  popup: { on: boolean; title: string; text: string; button: string; discount: number; look?: PopupLookId; previous?: boolean };
  /** The catalogue page's title, or null when the store has no such page to edit. */
  catalogTitle: string | null;
  /** Browse catalogue (spec 2026-11-06): the catalogue's filter style (config.js filterStyle), when it has one. */
  filterStyle?: string;
  /** Miga Dorada 2026-11-07: the header, bar and footer colours of their own (store-data look.parts); a part left out shows its theme's. */
  parts?: Partial<Record<MasterPart, string>>;
  /** The footer's look (store-data variants.footer) and the looks the template offers; absent when it has none to choose. */
  footerStyle?: string; footerStyles?: readonly string[];
  products: StoreEditProduct[];
  /** Part 2: archived products (to bring back), the categories in their order and the discount codes, active first. */
  archived?: Array<{ id: string; name: string }>;
  categories?: StoreEditCategory[];
  codes?: StoreEditCode[];
};
/** A photo the merchant may name: attached to this message, or one of the store's own. */
export type StoreEditPhoto = { url: string; from: 'mensaje' | 'producto' | 'tienda'; product?: string;
  /** Sweep 2026-11-06: the name this photo's bundled copy has in a template (assets/image-<sha256 12>.<ext>), to know it is already shown. */
  bundled?: string };

export type StoreChange = {
  store?: Partial<Record<'tagline' | 'aboutText' | 'contactPhone' | 'contactEmail', string | null>>;
  /** Store.whatsappButton, when the chat turned the floating WhatsApp button on or off. */
  whatsappButton?: boolean;
  /** The whole policies JSON to save (texts + faq), when any of it changed. */
  policies?: StorePolicies & { faq?: StoreFaqEntry[] };
  copy?: { announcement?: string; tagline?: string };
  /** The whole link list to save, when it changed. */
  links?: Array<{ label: string; url: string }>;
  popup?: { signupEnabled?: boolean; signupTitle?: string; signupBody?: string; signupButton?: string; discount?: number };
  /** Spec 2026-11-08: the popup design — a new one (optionally with a chosen photo), its photo only, or one step back. */
  popupLook?: { action: 'look'; look: PopupLookId } | { action: 'photo'; photo: string } | { action: 'undo' };
  /** Spec 2026-11-09 popup games: a game on/off, the top prize, or the tap question (null = none). */
  popupGame?: { game?: 'scratch' | 'wheel' | 'off'; topPrize?: number; question?: { text: string; answers: string[] } | null; prizes?: Array<{ percent: number; chance?: number }> };
  catalogTitle?: string;
  filterStyle?: FilterStyle;
  /** Part colours to save over the theme's: #rrggbb, or "" to give the part back to the theme. */
  parts?: Partial<Record<MasterPart, string>>;
  footerStyle?: string;
  products: Array<{ id: string; name?: string; amount?: number; description?: string; imageUrls?: string[] }>;
};

/** The footer looks the template offers, as the merchant reads them («el pie de página ahora …»). */
export const FOOTER_STYLE_WORDS: Record<string, string> = { columns: 'tiene columnas con tus páginas y tu contacto', bigname: 'muestra el nombre de tu tienda bien grande arriba',
  minimal: 'es una sola línea sencilla', twotone: 'tiene tu marca en un recuadro de color', column: 'es una tarjeta sobre la foto de tu tienda', band: 'es del color principal de tu tienda',
  bignav: 'tiene tus páginas en letras grandes', card: 'es una tarjeta de esquinas redondas', centered: 'está centrado', mega: 'tiene columnas y la suscripción a un lado',
  photo: 'tiene una foto de tu tienda a un lado', signup: 'invita a suscribirse en grande', ticker: 'tiene tu frase pasando en una cinta',
  visit: 'invita a visitarte, con tu dirección en grande', wordmark: 'termina con el nombre de tu tienda gigante' };
const PART_WORDS: Record<MasterPart, string> = { header: 'el encabezado', announce: 'la cinta de arriba', footer: 'el pie de página' };
/** «#abc», «#AABBCC» → «#aabbcc»; null when it is not a colour. */
export function hexColour(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  return /^#[0-9a-f]{3}$/.test(text) ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` : null;
}

const FILTER_STYLE_WORDS: Record<FilterStyle, string> = { bar: 'los filtros en una barra arriba', chips: 'los filtros como botones',
  sidebar: 'los filtros en una columna a la izquierda', browse: 'filtros a la izquierda que se pueden ocultar y las fotos de cada color en los productos, como Nike' };
export const STORE_CAPS = { tagline: 160, aboutText: 4000, announcement: 120, footer: 160, catalogTitle: 60, productName: 120, productDescription: 500,
  popupTitle: 100, popupText: 500, popupButton: 60 } as const;
const POLICY_NAME: Record<string, string> = { delivery: 'Envíos y entregas', returns: 'Cambios y devoluciones', privacy: 'Privacidad', terms: 'Términos y condiciones' };
const NETWORKS: Record<string, { label: string; url: (handle: string) => string; host: RegExp }> = {
  instagram: { label: 'Instagram', url: handle => `https://instagram.com/${handle}`, host: /(^|\.)instagram\.com$/i },
  tiktok: { label: 'TikTok', url: handle => `https://www.tiktok.com/@${handle}`, host: /(^|\.)tiktok\.com$/i },
  facebook: { label: 'Facebook', url: handle => `https://facebook.com/${handle}`, host: /(^|\.)(facebook|fb)\.com$/i },
  youtube: { label: 'YouTube', url: handle => `https://youtube.com/@${handle}`, host: /(^|\.)(youtube\.com|youtu\.be)$/i },
  x: { label: 'X', url: handle => `https://x.com/${handle}`, host: /(^|\.)(x|twitter)\.com$/i },
};

export const oneLine = (value: unknown, cap: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, cap).trim();
export const block = (value: unknown, cap: number) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, cap).trim();
export const safe = (value: string) => SAFE_TEXT_PATTERN.test(value);
export const short = (value: string, cap = 60) => value.length > cap ? `${value.slice(0, cap - 1).trim()}…` : value;
// «Bs 1.950», «Bs 25,50»: thousands with a dot and decimals with a comma, as prices are written in Bolivia.
export const bs = (cents: number) => { const [whole, part] = (cents / 100).toFixed(2).split('.'); return `Bs ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${part === '00' ? '' : `,${part}`}`; };

/** «Bs 25», «25,50», «25.5» → cents; null when it is not a price. */
export function priceCents(value: string): number | null {
  // «1.950» and «1,950,50» carry thousands separators (how prices are written in Bolivia): a 3-digit group after a dot or comma.
  let text = String(value).replace(/bs\.?|bob/gi, '').replace(/\s+/g, '');
  const thousands = /^(\d{1,3}(?:([.,])\d{3})+)(?:([.,])(\d{1,2}))?$/.exec(text);
  if (thousands && thousands[2] !== thousands[3]) text = `${thousands[1].replace(/[.,]/g, '')}${thousands[4] ? `,${thousands[4]}` : ''}`;
  const match = text.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

/** A network handle («@marca», «marca») or its full link → the link; null when it is neither. */
export function socialUrl(network: string, value: string): string | null {
  const spec = NETWORKS[network];
  if (!spec) return null;
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) {
    try { const url = new URL(text); return spec.host.test(url.hostname) ? url.href : null; } catch { return null; }
  }
  const handle = text.replace(/^@/, '').replace(/^(?:www\.)?[a-z]+\.com\/@?/i, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9._-]{1,60}$/.test(handle) ? spec.url(handle) : null;
}

/** The store as the model reads it. Long texts are cut (the model rewrites from what it sees, so policies show their start). */
export function storeDigest(state: StoreEditState, photos: readonly StoreEditPhoto[]) {
  return {
    nosotros: { frase: state.tagline, texto: short(state.aboutText, 1500) },
    contacto: { telefono: state.contactPhone, correo: state.contactEmail, botonWhatsapp: state.whatsappButton !== false && Boolean(state.contactPhone) },
    politicas: Object.fromEntries(STORE_POLICY_KEYS.map(key => [key, short(state.policies[key] ?? '', 600)])),
    preguntas: state.faq.map((entry, at) => ({ at, pregunta: entry.q, respuesta: short(entry.a, 300) })),
    cinta: state.announcement,
    pie: state.footer,
    redes: state.links.map(link => ({ red: link.label, url: link.url })),
    popup: { encendido: state.popup.on, titulo: state.popup.title, texto: state.popup.text, boton: state.popup.button, ...(state.popup.discount ? { descuento: state.popup.discount } : {}), ...(state.popup.look ? { estilo: POPUP_LOOK_NAMES[state.popup.look] } : {}) },
    ...(state.catalogTitle !== null ? { catalogo: state.catalogTitle } : {}),
    ...(state.filterStyle ? { filtros: state.filterStyle } : {}),
    colores: { encabezado: state.parts?.header ?? 'el de la plantilla', cinta: state.parts?.announce ?? 'el de la plantilla', pie: state.parts?.footer ?? 'el de la plantilla' },
    ...(state.footerStyle && state.footerStyles?.length ? { pie_estilo: { actual: state.footerStyle,
      otros: state.footerStyles.filter(id => id !== state.footerStyle && FOOTER_STYLE_WORDS[id]).map(id => ({ id, como: FOOTER_STYLE_WORDS[id] })) } } : {}),
    productos: state.products.slice(0, 40).map((product, at) => ({ at, nombre: product.name, precio: bs(product.amount), descripcion: short(product.description, 160),
      ...(product.stock !== undefined ? { stock: product.stock === null ? 'sin límite' : product.stock } : {}),
      ...(product.categoryId ? { categoria: state.categories?.find(category => category.id === product.categoryId)?.name ?? '' } : {}),
      ...(product.variants?.some(variant => variant.options?.length) ? { grupos: product.variants.find(variant => variant.options?.length)!.options!.map(option => option.name) } : {}),
      ...(product.variants?.length ? { opciones: product.variants.map(variant => ({ nombre: variant.name, precio: bs(variant.amount), stock: variant.stock == null ? 'sin límite' : variant.stock })) }
        : product.options ? { opciones: true } : {}) })),
    ...(state.archived?.length ? { archivados: state.archived.slice(0, 20).map((product, at) => ({ at, nombre: product.name })) } : {}),
    ...(state.categories ? { categorias: state.categories.map((category, at) => ({ at, nombre: category.name, productos: category.count })) } : {}),
    ...(state.codes ? { codigos: state.codes.slice(0, 20).map((code, at) => ({ at, codigo: code.code, descuento: code.type === 'PERCENT' ? `${code.value} %` : bs(code.value),
      activo: code.active, correos: code.emails, asistente: code.assistant })) } : {}),
    fotos: photos.map((photo, at) => ({ ref: `f${at}`, de: photo.from, ...(photo.product ? { producto: photo.product } : {}) })),
  };
}

export const STORE_EDIT_PROMPT = `
La tienda también tiene datos propios en «tienda» (no son secciones de la portada). Los cambias con «store», operaciones
{ part, field, at, title, value } (los que no se usan: at -1, title ""):
- about: field tagline (la frase corta de la tienda) o text (la página «Nosotros»: su historia, en párrafos separados por una línea
  vacía). value = el texto nuevo completo; si el comercio dio sus palabras, úsalas.
- contact: field phone o email; value "" lo quita. field whatsapp, value "on" u "off": el botón flotante de WhatsApp de la tienda
  («agrega WhatsApp», «quita el botón de WhatsApp»); usa el teléfono de contacto.
- policy: field delivery (Envíos y entregas), returns (Cambios y devoluciones), privacy o terms. value = la política completa,
  en texto simple, con los datos que dio el comercio y sin inventar plazos ni precios. value "" la quita.
- faq: las «preguntas frecuentes» propias del comercio (la página de preguntas frecuentes). field add (title = pregunta, value =
  respuesta), set (at = cuál; title y value nuevos) o remove (at). Nunca inventes una respuesta que el comercio no dio ni está en
  los datos de la tienda: si pide una pregunta sin su respuesta, no la agregues y pon en «ask» una pregunta corta pidiéndole la
  respuesta (por ejemplo: ¿Qué respuesta le pongo a la pregunta «¿Hacen arreglos?»?). «ask» es "" en todo otro caso.
- announcement: field text = la cinta de arriba de todas las páginas (una frase corta, «Envío gratis desde Bs 200»); "" la quita.
- footer: field tagline = la frase del pie de página. field style = cómo se ve el pie: value = un id de «pie_estilo.otros». «haz el
  pie más bonito», «mejora el footer» = style (el que mejor quede con la tienda), y si quieres también su frase. «el nombre grande
  abajo», «que diga [nombre de la tienda] bien grande» = style bigname o wordmark; nunca pongas el nombre de la tienda como frase.
- header, announcement o footer: field color = el color de fondo de esa parte («colores»: header = el encabezado, la barra con el
  logo y el menú; announcement = la cinta; footer = el pie de página). value = el color en hex #rrggbb («rosado» → un rosado
  suave como #f4c2cc, «verde oscuro» → #1d3b2a; un color en hex que dio el comercio, tal cual); title = el color en palabras, como
  lo dijo el comercio («rosado»); value "" vuelve al color de la plantilla. Solo cambia esa parte: el color principal de la tienda
  no cambia y nunca va a «rest». La letra se ajusta sola para que se lea.
- social: field instagram, tiktok, facebook, youtube o x; value = el usuario (@marca) o el enlace; "" lo quita.
- popup: la ventana de suscripción. field on / off; title, text o button (sus textos); discount (value = el porcentaje, 5 a 50).
  field redesign = otro estilo de ventana («rediseña la ventana», «cambia el estilo de la ventana»). field style = un estilo por
  nombre (value = clasica, portada, cartel, postal, revista o etiqueta; «ventana tipo postal»). field photo = «cambia la foto de la
  ventana» (value = una foto de «fotos», f0, f1…; «esta foto» = la primera con de "mensaje"). field undo = «vuelve a la ventana anterior».
  field game = un juego en la ventana (value scratch = «rasca y gana», wheel = «ruleta», off = sin juego). field prize = el premio mayor del
  juego (value «25 %»). field prizes = todos los premios (value «10, 15, 20, 30», o con probabilidades «10:60, 30:40»). field question = la pregunta del juego (value «pregunta|respuesta|respuesta…», 2 a 4 respuestas, o «sin pregunta»).
- catalog: field title = el título de la página de todos los productos. field filters = cómo se filtra el catálogo («filtros»):
  bar (botón de filtrar y barra arriba), chips (filtros como botones), sidebar (columna de filtros a la izquierda) o browse (la
  tienda grande, «como Nike»: columna de filtros, «Ocultar filtros», «Recoger hoy» y las fotos de cada color en los productos).
- product: at = el número del producto; field name, price (value = el precio, «25,50»), description o photo (value = una foto de
  «fotos», f0, f1…). Un producto con opciones no cambia de precio aquí: sus opciones cambian con option-price en «catalogo».
Cambiar una foto de una sección: op photo en «ops» (at, item como en text; field photo o photo2; value = f0, f1…). «esta foto»
o «la foto que te mando» = la primera foto con de "mensaje".
Una página (Nosotros, Contacto, Envíos, Preguntas frecuentes, Políticas) se escribe con «store», nunca con una sección nueva de la
portada, salvo que el comercio pida la sección en la portada.
La ficha de producto («ficha»: las secciones debajo del botón de compra, iguales para todos los productos) se edita con text,
remove, move y photo con page = "product"; las secciones de la portada llevan page = "home".`;

export function storeOpSchema() {
  return { type: 'object', additionalProperties: false, required: ['part', 'field', 'at', 'title', 'value'], properties: {
    part: { type: 'string', enum: [...STORE_PARTS] }, field: { type: 'string', enum: [...STORE_FIELDS] }, at: { type: 'integer' }, title: { type: 'string' }, value: { type: 'string' } } };
}

/** The model's store operations, checked: known parts and fields only. */
export function readStoreOps(raw: unknown): StoreOp[] {
  return (Array.isArray(raw) ? raw : []).filter((op): op is StoreOp => Boolean(op) && typeof op === 'object' && (STORE_PARTS as readonly string[]).includes((op as StoreOp).part)
    && (STORE_FIELDS as readonly string[]).includes((op as StoreOp).field)).map(op => ({ part: op.part, field: op.field, at: Number.isInteger(op.at) ? op.at : -1, title: String(op.title ?? ''), value: String(op.value ?? '') }));
}

/** A photo reference («f2») → its url, or undefined. */
export function photoRef(value: string, photos: readonly StoreEditPhoto[]): string | undefined {
  const match = /^f(\d{1,3})$/i.exec(value.trim());
  return match ? photos[Number(match[1])]?.url : undefined;
}

/** The operations applied to the store's data. Every refusal says why; nothing is written that Ajustes or the product editor would
 *  refuse. */
export function applyStoreOps(state: StoreEditState, ops: readonly StoreOp[], photos: readonly StoreEditPhoto[] = []): { change: StoreChange; done: string[]; refused: string[] } {
  const change: StoreChange = { products: [] };
  const done: string[] = [];
  const refused: string[] = [];
  const policies: StorePolicies = { ...state.policies };
  let faq = state.faq.map(entry => ({ ...entry }));
  let policiesChanged = false;
  let links = state.links.map(link => ({ ...link }));
  let linksChanged = false;
  const product = (at: number) => Number.isInteger(at) && at >= 0 && at < Math.min(40, state.products.length) ? state.products[at] : undefined;
  const productChange = (id: string) => { let entry = change.products.find(item => item.id === id); if (!entry) { entry = { id }; change.products.push(entry); } return entry; };
  const setStore = (key: keyof NonNullable<StoreChange['store']>, value: string | null) => { change.store = { ...(change.store ?? {}), [key]: value }; };
  // A part's own colour (Miga Dorada 2026-11-07); the words say the colour as the merchant did.
  const partColour = (part: MasterPart, op: StoreOp) => {
    const name = oneLine(op.title, 40);
    const said = name && safe(name) ? name : '';
    if (!op.value.trim()) {
      if (!state.parts?.[part]) return;
      change.parts = { ...(change.parts ?? {}), [part]: '' };
      done.push(`${PART_WORDS[part]} volvió al color de la plantilla`);
      return;
    }
    const hex = hexColour(op.value);
    if (!hex) { refused.push(`No entendí el color para ${PART_WORDS[part]}: dime el color en palabras («rosado», «verde oscuro»).`); return; }
    if (state.parts?.[part] === hex) { done.push(`${PART_WORDS[part]} ya es ${said || 'de ese color'}`); return; }
    change.parts = { ...(change.parts ?? {}), [part]: hex };
    done.push(`${PART_WORDS[part]} ahora es ${said || 'del color que pediste'}`);
  };

  for (const op of ops) {
    switch (op.part) {
      case 'about': {
        if (op.field === 'tagline') {
          const value = oneLine(op.value, STORE_CAPS.tagline);
          if (!safe(value) || value === state.tagline) break;
          setStore('tagline', value || null);
          done.push(value ? `la frase de tu tienda ahora dice «${short(value)}»` : 'quité la frase de tu tienda');
        } else if (op.field === 'text') {
          const value = block(op.value, STORE_CAPS.aboutText);
          if (!safe(value) || value === state.aboutText) break;
          setStore('aboutText', value || null);
          done.push(value ? 'escribí tu página «Nosotros»' : 'vacié tu página «Nosotros»');
        }
        break;
      }
      case 'contact': {
        const value = oneLine(op.value, 254);
        if (op.field === 'phone') {
          if (value && !/^\+?[0-9][0-9 ()-]{5,24}$/.test(value)) { refused.push(`No cambié el teléfono: «${short(value, 30)}» no parece un número.`); break; }
          if (value === state.contactPhone) break;
          setStore('contactPhone', value || null);
          done.push(value ? `el teléfono de contacto ahora es ${value}` : 'quité el teléfono de contacto');
        } else if (op.field === 'email') {
          if (value && !/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(value)) { refused.push(`No cambié el correo: «${short(value, 40)}» no parece un correo.`); break; }
          if (value === state.contactEmail) break;
          setStore('contactEmail', value || null);
          done.push(value ? `el correo de contacto ahora es ${value}` : 'quité el correo de contacto');
        } else if (op.field === 'whatsapp') {
          const on = !/^(?:off|no|false|0)$/i.test(value);
          const phone = change.store?.contactPhone !== undefined ? change.store.contactPhone : state.contactPhone;
          if (on && !phone) { refused.push('Para mostrar el botón de WhatsApp necesito tu número: dímelo y lo agrego.'); break; }
          if (on === (state.whatsappButton !== false)) {
            // Already on, but the store had no number until this message: the button shows now.
            if (on && !state.contactPhone) done.push('agregué el botón de WhatsApp');
            break;
          }
          change.whatsappButton = on;
          done.push(on ? 'agregué el botón de WhatsApp' : 'quité el botón de WhatsApp');
        }
        break;
      }
      case 'policy': {
        if (!(STORE_POLICY_KEYS as readonly string[]).includes(op.field)) break;
        const key = op.field as typeof STORE_POLICY_KEYS[number];
        const value = block(op.value, 6000);
        const problem = value ? policyTextProblem(value) : null;
        if (problem) { refused.push(`No cambié «${POLICY_NAME[key]}»: ${problem}`); break; }
        if (value === (policies[key] ?? '')) break;
        if (value) policies[key] = value; else delete policies[key];
        policiesChanged = true;
        done.push(value ? `escribí tu página «${POLICY_NAME[key]}»` : `quité tu página «${POLICY_NAME[key]}»`);
        break;
      }
      case 'faq': {
        const q = oneLine(op.title, STORE_FAQ_LIMITS.question);
        const a = block(op.value, STORE_FAQ_LIMITS.answer);
        if (op.field === 'add') {
          if (!q || !a || !safe(q) || !safe(a)) { refused.push('Para agregar una pregunta necesito la pregunta y su respuesta.'); break; }
          if (faq.some(entry => entry.q.toLowerCase() === q.toLowerCase())) { refused.push(`Ya tienes la pregunta «${short(q)}»: pídeme cambiar su respuesta.`); break; }
          if (faq.length >= STORE_FAQ_LIMITS.entries) { refused.push(`Tus preguntas frecuentes ya tienen ${STORE_FAQ_LIMITS.entries}: quita una antes de agregar otra.`); break; }
          faq.push({ q, a });
          policiesChanged = true;
          done.push(`agregué la pregunta «${short(q)}» a tus preguntas frecuentes`);
        } else if (op.field === 'set') {
          const entry = faq[op.at];
          if (!entry) break;
          const next = { q: q && safe(q) ? q : entry.q, a: a && safe(a) ? a : entry.a };
          if (next.q === entry.q && next.a === entry.a) break;
          faq = faq.map((old, at) => at === op.at ? next : old);
          policiesChanged = true;
          done.push(`cambié la pregunta «${short(next.q)}»`);
        } else if (op.field === 'remove') {
          const entry = faq[op.at];
          if (!entry) break;
          faq = faq.filter(old => old !== entry);
          policiesChanged = true;
          done.push(`quité la pregunta «${short(entry.q)}»`);
        }
        break;
      }
      case 'header': {
        if (op.field === 'color') partColour('header', op);
        break;
      }
      case 'announcement': {
        if (op.field === 'color') {
          if (!state.announcement && !change.copy?.announcement) { refused.push('Tu tienda no tiene cinta arriba: dime qué frase poner en ella y le pongo ese color.'); break; }
          partColour('announce', op);
          break;
        }
        if (op.field !== 'text') break;
        const value = oneLine(op.value, STORE_CAPS.announcement);
        if (!safe(value) || value === state.announcement) break;
        change.copy = { ...(change.copy ?? {}), announcement: value };
        done.push(value ? `la cinta de arriba ahora dice «${short(value)}»` : 'quité la cinta de arriba');
        break;
      }
      case 'footer': {
        if (op.field === 'color') { partColour('footer', op); break; }
        if (op.field === 'style') {
          const style = op.value.trim().toLowerCase();
          if (!state.footerStyle || !state.footerStyles?.includes(style) || !FOOTER_STYLE_WORDS[style] || style === state.footerStyle) break;
          change.footerStyle = style;
          done.push(`el pie de página ahora ${FOOTER_STYLE_WORDS[style]}`);
          break;
        }
        if (op.field !== 'tagline') break;
        const value = oneLine(op.value, STORE_CAPS.footer);
        if (!safe(value) || value === state.footer) break;
        change.copy = { ...(change.copy ?? {}), tagline: value };
        done.push(value ? `la frase del pie de página ahora dice «${short(value)}»` : 'quité la frase del pie de página');
        break;
      }
      case 'social': {
        const spec = NETWORKS[op.field];
        if (!spec) break;
        const mine = (link: { label: string; url: string }) => link.label.toLowerCase() === spec.label.toLowerCase() || (() => { try { return spec.host.test(new URL(link.url).hostname); } catch { return false; } })();
        if (!op.value.trim()) {
          if (!links.some(mine)) break;
          links = links.filter(link => !mine(link));
          linksChanged = true;
          done.push(`quité tu ${spec.label}`);
          break;
        }
        const url = socialUrl(op.field, op.value);
        if (!url) { refused.push(`No agregué tu ${spec.label}: «${short(op.value.trim(), 40)}» no parece un usuario ni un enlace de ${spec.label}.`); break; }
        if (links.some(link => mine(link) && link.url === url)) break;
        const at = links.findIndex(mine);
        if (at >= 0) links[at] = { label: spec.label, url }; else links.push({ label: spec.label, url });
        linksChanged = true;
        done.push(`tu ${spec.label} (${url.replace(/^https?:\/\/(www\.)?/, '')}) ya está en el pie de página`);
        break;
      }
      case 'popup': {
        const popup = { ...(change.popup ?? {}) };
        if (op.field === 'on' || op.field === 'off') {
          const on = op.field === 'on';
          // Already so: said, so a request never goes unanswered (live 2026-11-03, Miga's popup was on at 10 %).
          if (on === state.popup.on && popup.signupEnabled === undefined) { done.push(on ? 'tu ventana de suscripción ya estaba encendida' : 'tu ventana de suscripción ya estaba apagada'); break; }
          popup.signupEnabled = on;
          done.push(on ? 'encendí la ventana de suscripción' : 'apagué la ventana de suscripción');
        } else if (op.field === 'title' || op.field === 'text' || op.field === 'button') {
          const cap = op.field === 'title' ? STORE_CAPS.popupTitle : op.field === 'text' ? STORE_CAPS.popupText : STORE_CAPS.popupButton;
          const value = oneLine(op.value, cap);
          if (!safe(value) || (op.field !== 'text' && !value) || value === state.popup[op.field]) break;
          popup[op.field === 'title' ? 'signupTitle' : op.field === 'text' ? 'signupBody' : 'signupButton'] = value;
          done.push(`${op.field === 'title' ? 'el título' : op.field === 'text' ? 'el texto' : 'el botón'} de la ventana de suscripción ahora dice «${short(value)}»`);
        } else if (op.field === 'discount') {
          const percent = Number(String(op.value).replace(/[^\d]/g, ''));
          if (!Number.isInteger(percent) || percent < 5 || percent > 50) { refused.push('El descuento de bienvenida va de 5 % a 50 %.'); break; }
          if (percent === state.popup.discount && state.popup.on) { done.push(`tu ventana de suscripción ya regala un ${percent} % de descuento`); break; }
          popup.discount = percent;
          if (!state.popup.on) popup.signupEnabled = true;
          done.push(`la ventana de suscripción regala un código de ${percent} % de descuento`);
        } else if (op.field === 'redesign' || op.field === 'style') {
          // Spec 2026-11-09 popup looks: «rediseña la ventana» = the next look; «ventana tipo postal» = that look.
          const look = op.field === 'redesign' ? nextPopupLook(state.popup.look) : readPopupLook(op.value);
          if (!look) { refused.push('Los estilos de la ventana son: Clásica, Portada, Cartel, Postal, Revista y Etiqueta.'); break; }
          if (look === state.popup.look) { done.push(`tu ventana de suscripción ya tiene el estilo ${POPUP_LOOK_NAMES[look]}`); break; }
          change.popupLook = { action: 'look', look };
          done.push(`tu ventana de suscripción ahora tiene el estilo ${POPUP_LOOK_NAMES[look]}`);
        } else if (op.field === 'photo') {
          const url = photoRef(op.value, photos);
          if (!url) { refused.push('No encontré esa foto para la ventana de suscripción. Mándamela o dime cuál de tus fotos uso.'); break; }
          change.popupLook = { action: 'photo', photo: url };
          done.push('cambié la foto de tu ventana de suscripción');
        } else if (op.field === 'undo') {
          if (!state.popup.previous) { refused.push('Tu ventana de suscripción no tiene un estilo anterior al que volver.'); break; }
          change.popupLook = { action: 'undo' };
          done.push('volví al estilo anterior de tu ventana de suscripción');
        } else if (op.field === 'game') {
          // Spec 2026-11-09 popup games: rasca y gana or ruleta, everyone wins one of four real discounts.
          const game = op.value.trim().toLowerCase();
          if (!['scratch', 'wheel', 'off'].includes(game)) { refused.push('Los juegos son rasca y gana y ruleta.'); break; }
          change.popupGame = { ...change.popupGame, game: game as 'scratch' | 'wheel' | 'off' };
          // A game asked for on a switched-off popup switches the popup on (else nobody would ever see it).
          if (game !== 'off' && !state.popup.on) popup.signupEnabled = true;
          done.push(game === 'off' ? 'quité el juego de tu ventana de suscripción'
            : `tu ventana de suscripción ahora es ${game === 'scratch' ? 'un rasca y gana' : 'una ruleta'} con premios de 5 %, 10 %, 15 % y 20 % de descuento`);
        } else if (op.field === 'prize') {
          const percent = Number(String(op.value).replace(/[^\d]/g, ''));
          if (!Number.isInteger(percent) || percent < 5 || percent > 50) { refused.push('El premio mayor va de 5 % a 50 %.'); break; }
          change.popupGame = { ...change.popupGame, topPrize: percent };
          done.push(`el premio mayor de tu juego ahora es ${percent} % de descuento`);
        } else if (op.field === 'prizes') {
          // Owner 2026-11-09: «que la ruleta tenga 10, 15, 20 y 30 %», optionally with each chance («10:60, 30:40»).
          const parts = op.value.split(/[,;y]+/).map(part => part.trim()).filter(Boolean).map(part => { const [p, c] = part.split(':').map(x => x.replace(/[^\d]/g, '')); return { percent: Number(p), ...(c ? { chance: Number(c) } : {}) }; });
          const withChance = parts.filter(p => p.chance !== undefined).length;
          const ok = parts.length >= 2 && parts.length <= 6 && parts.every(p => Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 50) && new Set(parts.map(p => p.percent)).size === parts.length
            && (withChance === 0 || (withChance === parts.length && parts.reduce((sum, p) => sum + (p.chance ?? 0), 0) === 100));
          if (!ok) { refused.push('Los premios van de 2 a 6, cada uno de 1 % a 50 %, sin repetir; si das las probabilidades, deben sumar 100.'); break; }
          const sorted = [...parts].sort((a, b) => a.percent - b.percent);
          change.popupGame = { ...change.popupGame, prizes: sorted };
          const list = sorted.map(p => withChance ? `${p.percent} % (${p.chance} % de las veces)` : `${p.percent} %`);
          done.push(`tu juego ahora da ${list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list.at(-1)}` : list[0]} de descuento${withChance ? '' : ' (los premios grandes salen menos)'}`);
        } else if (op.field === 'question') {
          const value = op.value.trim();
          if (/^sin pregunta$/i.test(value)) { change.popupGame = { ...change.popupGame, question: null }; done.push('quité la pregunta del juego'); break; }
          const [text, ...answers] = value.split('|').map(part => oneLine(part, 80));
          const clean = answers.filter(Boolean).map(answer => answer.slice(0, 40));
          if (!text || !safe(text) || clean.length < 2 || clean.length > 4 || !clean.every(safe)) { refused.push('Escribe la pregunta y 2 a 4 respuestas.'); break; }
          change.popupGame = { ...change.popupGame, question: { text, answers: clean } };
          done.push(`el juego ahora pregunta «${short(text)}»`);
        }
        if (Object.keys(popup).length) change.popup = popup;
        break;
      }
      case 'catalog': {
        if (op.field === 'filters') {
          const style = op.value.trim().toLowerCase();
          if (!isFilterStyle(style)) break;
          if (style === state.filterStyle) { done.push(`tu catálogo ya tiene ${FILTER_STYLE_WORDS[style]}`); break; }
          change.filterStyle = style;
          done.push(`tu catálogo ahora tiene ${FILTER_STYLE_WORDS[style]}`);
          break;
        }
        if (op.field !== 'title') break;
        if (state.catalogTitle === null) { refused.push('Tu tienda no tiene una página de catálogo con título para cambiar.'); break; }
        const value = oneLine(op.value, STORE_CAPS.catalogTitle).replace(/[{}<>]/g, '').trim();
        if (!value || !safe(value) || value === state.catalogTitle) break;
        change.catalogTitle = value;
        done.push(`la página de productos ahora se titula «${value}»`);
        break;
      }
      case 'product': {
        const item = product(op.at);
        if (!item) break;
        if (op.field === 'name') {
          const value = oneLine(op.value, STORE_CAPS.productName);
          if (!value || !safe(value) || value === item.name) break;
          productChange(item.id).name = value;
          done.push(`«${short(item.name, 40)}» ahora se llama «${value}»`);
        } else if (op.field === 'price') {
          if (item.options) { refused.push(`«${short(item.name, 40)}» tiene opciones: cambia sus precios en Productos o dime el precio de cada opción.`); break; }
          const cents = priceCents(op.value);
          if (cents === null) { refused.push(`No cambié el precio de «${short(item.name, 40)}»: «${short(op.value, 20)}» no es un precio.`); break; }
          if (cents === item.amount) break;
          productChange(item.id).amount = cents;
          done.push(`«${short(item.name, 40)}» ahora cuesta ${bs(cents)}`);
        } else if (op.field === 'description') {
          const value = block(op.value, STORE_CAPS.productDescription);
          if (!value || !safe(value) || value === item.description) break;
          productChange(item.id).description = value;
          done.push(`cambié la descripción de «${short(item.name, 40)}»`);
        } else if (op.field === 'photo') {
          const url = photoRef(op.value, photos);
          if (!url) { refused.push(`No cambié la foto de «${short(item.name, 40)}»: mándame la foto en el mensaje.`); break; }
          if (item.imageUrls[0] === url) break;
          productChange(item.id).imageUrls = [url, ...item.imageUrls.filter(old => old !== url)].slice(0, 10);
          done.push(`«${short(item.name, 40)}» tiene foto nueva`);
        }
        break;
      }
    }
  }
  if (policiesChanged) change.policies = { ...policies, ...(faq.length ? { faq } : {}) };
  if (linksChanged) change.links = links.slice(0, 20);
  return { change, done, refused };
}

/** Whether the change writes anything. */
export const storeChangeEmpty = (change: StoreChange) => !change.store && change.whatsappButton === undefined && !change.policies && !change.copy && !change.links && !change.popup && !change.popupLook && !change.popupGame && change.catalogTitle === undefined && change.filterStyle === undefined && !change.parts && change.footerStyle === undefined && !change.products.length;

const CATALOG_TITLE = /(<h1 className="es-catalog-page__title">)([^<{}]*)(<\/h1>)/;
const CATALOG_FILE = 'components/page-productos.tsx';
/** The catalogue page's title in the store's files, or null when there is none to edit. */
export function readCatalogTitle(files: ReadonlyArray<{ path: string; content: string }>): string | null {
  const match = CATALOG_TITLE.exec(files.find(file => file.path === CATALOG_FILE)?.content ?? '');
  return match ? match[2].trim() : null;
}
/** The files with the catalogue page's new title (the text inside its h1 only). */
export function withCatalogTitle<T extends { path: string; content: string }>(files: T[], title: string): T[] {
  const clean = title.replace(/[{}<>]/g, '').trim();
  return files.map(file => file.path === CATALOG_FILE && CATALOG_TITLE.test(file.content) ? { ...file, content: file.content.replace(CATALOG_TITLE, (_, open: string, __: string, close: string) => `${open}${clean}${close}`) } : file);
}
