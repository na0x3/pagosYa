/* YAPI edits everything (spec docs/superpowers/specs/2026-11-03-yapi-edit-everything-design.md §2): next to the home's sections, the
 * template quick edit reads the store's own data — about, contact, policies, the merchant's FAQ questions, the announcement, the
 * footer line, social links, the signup popup, the catalogue title and the products — and answers exact operations on it. This pure
 * module draws that digest, checks the operations and turns them into one change the caller writes (database and files), plus
 * the words of the reply. */
import { policyTextProblem } from './source-agent-policies';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { STORE_FAQ_LIMITS, STORE_POLICY_KEYS, type StoreFaqEntry, type StorePolicies } from '../stores/store-presentation';

export const STORE_PARTS = ['about', 'contact', 'policy', 'faq', 'announcement', 'footer', 'social', 'popup', 'catalog', 'product'] as const;
export type StorePart = typeof STORE_PARTS[number];
export const STORE_FIELDS = ['tagline', 'text', 'phone', 'email', ...STORE_POLICY_KEYS, 'add', 'set', 'remove', 'instagram', 'tiktok', 'facebook', 'youtube', 'x',
  'on', 'off', 'title', 'button', 'discount', 'name', 'price', 'description', 'photo'] as const;
export type StoreOp = { part: StorePart; field: string; at: number; title: string; value: string };

export type StoreEditProduct = { id: string; name: string; amount: number; description: string; imageUrls: string[]; options: boolean };
export type StoreEditState = {
  tagline: string; aboutText: string; contactPhone: string; contactEmail: string;
  policies: StorePolicies; faq: StoreFaqEntry[];
  /** The store-data words the template Shell draws (copy.announcement, copy.tagline). */
  announcement: string; footer: string;
  links: Array<{ label: string; url: string }>;
  popup: { on: boolean; title: string; text: string; button: string; discount: number };
  /** The catalogue page's title, or null when the store has no such page to edit. */
  catalogTitle: string | null;
  products: StoreEditProduct[];
};
/** A photo the merchant may name: attached to this message, or one of the store's own. */
export type StoreEditPhoto = { url: string; from: 'mensaje' | 'producto' | 'tienda'; product?: string };

export type StoreChange = {
  store?: Partial<Record<'tagline' | 'aboutText' | 'contactPhone' | 'contactEmail', string | null>>;
  /** The whole policies JSON to save (texts + faq), when any of it changed. */
  policies?: StorePolicies & { faq?: StoreFaqEntry[] };
  copy?: { announcement?: string; tagline?: string };
  /** The whole link list to save, when it changed. */
  links?: Array<{ label: string; url: string }>;
  popup?: { signupEnabled?: boolean; signupTitle?: string; signupBody?: string; signupButton?: string; discount?: number };
  catalogTitle?: string;
  products: Array<{ id: string; name?: string; amount?: number; description?: string; imageUrls?: string[] }>;
};

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

const oneLine = (value: unknown, cap: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, cap).trim();
const block = (value: unknown, cap: number) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, cap).trim();
const safe = (value: string) => SAFE_TEXT_PATTERN.test(value);
const short = (value: string, cap = 60) => value.length > cap ? `${value.slice(0, cap - 1).trim()}…` : value;
// «Bs 1.950», «Bs 25,50»: thousands with a dot and decimals with a comma, as prices are written in Bolivia.
const bs = (cents: number) => { const [whole, part] = (cents / 100).toFixed(2).split('.'); return `Bs ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${part === '00' ? '' : `,${part}`}`; };

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
    contacto: { telefono: state.contactPhone, correo: state.contactEmail },
    politicas: Object.fromEntries(STORE_POLICY_KEYS.map(key => [key, short(state.policies[key] ?? '', 600)])),
    preguntas: state.faq.map((entry, at) => ({ at, pregunta: entry.q, respuesta: short(entry.a, 300) })),
    cinta: state.announcement,
    pie: state.footer,
    redes: state.links.map(link => ({ red: link.label, url: link.url })),
    popup: { encendido: state.popup.on, titulo: state.popup.title, texto: state.popup.text, boton: state.popup.button, ...(state.popup.discount ? { descuento: state.popup.discount } : {}) },
    ...(state.catalogTitle !== null ? { catalogo: state.catalogTitle } : {}),
    productos: state.products.slice(0, 40).map((product, at) => ({ at, nombre: product.name, precio: bs(product.amount), descripcion: short(product.description, 160), ...(product.options ? { opciones: true } : {}) })),
    fotos: photos.map((photo, at) => ({ ref: `f${at}`, de: photo.from, ...(photo.product ? { producto: photo.product } : {}) })),
  };
}

export const STORE_EDIT_PROMPT = `
La tienda también tiene datos propios en «tienda» (no son secciones de la portada). Los cambias con «store», operaciones
{ part, field, at, title, value } (los que no se usan: at -1, title ""):
- about: field tagline (la frase corta de la tienda) o text (la página «Nosotros»: su historia, en párrafos separados por una línea
  vacía). value = el texto nuevo completo; si el comercio dio sus palabras, úsalas.
- contact: field phone o email; value "" lo quita.
- policy: field delivery (Envíos y entregas), returns (Cambios y devoluciones), privacy o terms. value = la política completa,
  en texto simple, con los datos que dio el comercio y sin inventar plazos ni precios. value "" la quita.
- faq: las «preguntas frecuentes» propias del comercio (la página de preguntas frecuentes). field add (title = pregunta, value =
  respuesta), set (at = cuál; title y value nuevos) o remove (at). Nunca inventes una respuesta que el comercio no dio ni está en
  los datos de la tienda: si pide una pregunta sin su respuesta, no la agregues y pon en «ask» una pregunta corta pidiéndole la
  respuesta (por ejemplo: ¿Qué respuesta le pongo a la pregunta «¿Hacen arreglos?»?). «ask» es "" en todo otro caso.
- announcement: field text = la cinta de arriba de todas las páginas (una frase corta, «Envío gratis desde Bs 200»); "" la quita.
- footer: field tagline = la frase del pie de página.
- social: field instagram, tiktok, facebook, youtube o x; value = el usuario (@marca) o el enlace; "" lo quita.
- popup: la ventana de suscripción. field on / off; title, text o button (sus textos); discount (value = el porcentaje, 5 a 50).
- catalog: field title = el título de la página de todos los productos.
- product: at = el número del producto; field name, price (value = el precio, «25,50»), description o photo (value = una foto de
  «fotos», f0, f1…). Un producto con opciones no cambia de precio aquí.
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
      case 'announcement': {
        if (op.field !== 'text') break;
        const value = oneLine(op.value, STORE_CAPS.announcement);
        if (!safe(value) || value === state.announcement) break;
        change.copy = { ...(change.copy ?? {}), announcement: value };
        done.push(value ? `la cinta de arriba ahora dice «${short(value)}»` : 'quité la cinta de arriba');
        break;
      }
      case 'footer': {
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
        }
        if (Object.keys(popup).length) change.popup = popup;
        break;
      }
      case 'catalog': {
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
export const storeChangeEmpty = (change: StoreChange) => !change.store && !change.policies && !change.copy && !change.links && !change.popup && change.catalogTitle === undefined && !change.products.length;

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
