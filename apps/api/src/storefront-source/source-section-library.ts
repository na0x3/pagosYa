/* Section library (spec docs/superpowers/specs/2026-10-31-section-library.md): YAPI picks sections from the Esencial library,
 * orders them and fills their words and photos; the layout itself is template code, tested once. This module is pure: the
 * catalogue the model reads, its answer schema, and the validation that turns an answer into a safe store-data `layout` — every
 * block's needs are met by the store's real facts, every photo is the store's and shown once, every product exists. */

export type LibraryRole = 'cover' | 'strip' | 'products' | 'story' | 'benefits' | 'proof' | 'promo' | 'info' | 'closing';
export type LibraryNeeds = { photos?: number; items?: [number, number]; products?: [number, number]; product?: boolean; categories?: number;
  reviews?: boolean; code?: boolean; location?: boolean; services?: boolean; itemPhotos?: number; mood?: 'bold' };
export type LibrarySection = { id: string; role: LibraryRole; use: string; needs: LibraryNeeds; looks?: string[] };

/** What each section is for, in the words the model reads (Spanish, like every YAPI prompt). */
export const LIBRARY_CATALOG: readonly LibrarySection[] = [
  { id: 'cover-split', role: 'cover', use: 'Portada: titular grande y botones a un lado, una foto enmarcada al otro; hasta 3 puntos breves con icono. La más versátil.', needs: { photos: 1, items: [0, 3] }, looks: ['frame', 'arch', 'circle'] },
  { id: 'cover-full', role: 'cover', use: 'Portada: la foto ocupa toda la pantalla y el texto va abajo a la izquierda. Solo con una foto ambiental amplia (escena, persona, lugar), nunca un producto sobre fondo blanco.', needs: { photos: 1 } },
  { id: 'cover-poster', role: 'cover', use: 'Portada afiche: una palabra enorme (el nombre o una palabra de 1 a 8 letras) a todo el ancho y la foto debajo. Solo marcas atrevidas o divertidas.', needs: { photos: 1, mood: 'bold' } },
  { id: 'cover-half', role: 'cover', use: 'Portada mitad foto, mitad color con el titular centrado; si hay un código de descuento activo puede mostrarlo. Buena para una oferta o un lanzamiento.', needs: { photos: 1 } },
  { id: 'cover-centered', role: 'cover', use: 'Portada tranquila: titular centrado y una foto ancha debajo. Para marcas serenas, de lujo o artesanales.', needs: { photos: 1 } },
  { id: 'cover-ribbon', role: 'cover', use: 'Portada divertida de color con la foto en un círculo y una cinta curva de palabras que se mueve abajo (items = 2 a 4 palabras). Solo marcas alegres (snacks, bebidas, dulces, juguetes).', needs: { photos: 1, items: [2, 4], mood: 'bold' } },
  { id: 'strip-marquee', role: 'strip', use: 'Franja de palabras que se desplaza (items = 3 a 6 palabras cortas: sabores, tonos, valores). Va justo después de la portada.', needs: { items: [3, 6] }, looks: ['solid', 'line', 'tilt'] },
  { id: 'strip-services', role: 'strip', use: 'Franja de servicios con iconos: envío, recojo, pago seguro, cambios. El texto lo pone pagosYa desde los datos reales de la tienda; tú solo eliges si va.', needs: { services: true } },
  { id: 'strip-badges', role: 'strip', use: 'Insignias redondas con icono de cualidades del producto (items = 3 a 6, 1 a 3 palabras cada una), solo cualidades que el comercio dijo o que están en sus productos.', needs: { items: [3, 6] } },
  { id: 'products-grid', role: 'products', use: 'La grilla principal de productos con buscador, filtros y orden. Obligatoria, una sola vez.', needs: {}, looks: ['grid4', 'grid3'] },
  { id: 'products-tabs', role: 'products', use: 'La grilla principal con pestañas por categoría arriba. En lugar de products-grid cuando hay 2 o más categorías.', needs: { categories: 2 } },
  { id: 'products-spotlight', role: 'products', use: 'Un producto destacado con su tarjeta de compra (product = su id) y hasta 3 puntos de por qué es especial.', needs: { product: true, items: [0, 3] } },
  { id: 'products-cards', role: 'products', use: 'De 2 a 4 productos elegidos (products = nombres exactos) en tarjetas de color con botón. «Los más pedidos», «Para regalar».', needs: { products: [2, 4] }, looks: ['soft', 'dashed'] },
  { id: 'products-lookbook', role: 'products', use: 'Una foto grande de ambiente con su titular y botón, y al lado de 2 a 3 productos (products = nombres exactos) para comprar ese look o esa rutina.', needs: { photos: 1, products: [2, 3] } },
  { id: 'categories-tiles', role: 'products', use: 'Mosaicos de categorías con foto (items = 2 a 4: title = nombre exacto de la categoría, photo = una foto de esa categoría).', needs: { categories: 2, items: [2, 4], itemPhotos: 2 } },
  { id: 'story-split', role: 'story', use: 'Historia: foto a un lado, titular, texto y botón al otro (look: left o right).', needs: { photos: 1 }, looks: ['left', 'right'] },
  { id: 'story-checker', role: 'story', use: 'Damero: dos bloques de color con texto (items = 2) que se alternan con dos fotos (photo y photo2).', needs: { photos: 2, items: [2, 2] } },
  { id: 'story-overlay', role: 'story', use: 'Foto a pantalla completa con titular arriba y 3 columnas cortas abajo (items = 3). Solo con una foto ambiental amplia.', needs: { photos: 1, items: [3, 3] } },
  { id: 'story-list', role: 'story', use: 'Titular y una lista numerada de 2 a 4 puntos con su texto, junto a una foto.', needs: { photos: 1, items: [2, 4] } },
  { id: 'statement-inline', role: 'story', use: 'Una frase grande centrada (title, 6 a 14 palabras) con dos fotos pequeñas en forma de píldora dentro del texto (photo y photo2).', needs: { photos: 2 } },
  { id: 'benefits-orbit', role: 'benefits', use: 'Cuatro beneficios con icono alrededor de una foto central (items = 4).', needs: { photos: 1, items: [4, 4] } },
  { id: 'benefits-bento', role: 'benefits', use: 'Mosaico: una foto y 3 tarjetas de beneficio con icono (items = 3).', needs: { photos: 1, items: [3, 3] } },
  { id: 'compare-table', role: 'benefits', use: 'Tabla «nosotros vs otros» (items = 3 a 6 filas; value = yes si los otros también lo tienen, no si no). Solo con diferencias reales que el comercio dijo.', needs: { items: [3, 6] } },
  { id: 'steps-howto', role: 'benefits', use: 'Cómo usarlo o cómo pedir: 3 o 4 pasos numerados junto a una foto.', needs: { photos: 1, items: [3, 4] } },
  { id: 'usecases', role: 'benefits', use: 'Dos momentos de uso, cada uno con su foto, título y texto (items = 2 con photo).', needs: { items: [2, 2], itemPhotos: 2 } },
  { id: 'reviews-cards', role: 'proof', use: 'Reseñas reales de clientes en tarjetas (las pone pagosYa). Solo si la tienda tiene reseñas publicadas.', needs: { reviews: true } },
  { id: 'reviews-wall', role: 'proof', use: 'Muro de reseñas reales en columnas. Solo si la tienda tiene reseñas publicadas.', needs: { reviews: true } },
  { id: 'promo-code', role: 'promo', use: 'Tarjeta de oferta con un código de descuento activo (code = el código exacto) que se copia con un toque, y botón.', needs: { code: true } },
  { id: 'promo-pair', role: 'promo', use: 'Dos mosaicos de foto lado a lado, cada uno con su título y enlace (items = 2 con photo; link = category:Nombre o products).', needs: { items: [2, 2], itemPhotos: 2 } },
  { id: 'promo-banner', role: 'promo', use: 'Banner de foto a todo el ancho con titular, texto y botón. Una colección, una temporada o un regalo.', needs: { photos: 1 } },
  { id: 'faq-split', role: 'info', use: 'Preguntas frecuentes: titular a un lado, 3 a 6 preguntas con su respuesta al otro, de los datos reales (envíos, recojo, cambios, uso).', needs: { items: [3, 6] } },
  { id: 'visit-store', role: 'info', use: 'Visítanos: foto y la dirección y el horario de la tienda (las filas las pone pagosYa).', needs: { location: true } },
  { id: 'closing-photo', role: 'closing', use: 'Cierre: foto a todo el ancho con una frase final y botón.', needs: { photos: 1 } },
  { id: 'closing-wordmark', role: 'closing', use: 'Cierre: foto, frase final y botón, y el nombre de la tienda enorme al final.', needs: {} },
];
const BY_ID = new Map(LIBRARY_CATALOG.map(section => [section.id, section]));
/** The product card, from the same themes (owner 2026-10-31); the main grid carries it and the Shell shows it on every page. */
export const LIBRARY_CARDS = ['classic', 'ribbon', 'soft', 'framed'] as const;
export const LIBRARY_ICON_NAMES = ['leaf', 'sparkles', 'heart', 'droplet', 'sun', 'gift', 'clock', 'package', 'store', 'lock', 'zap', 'award', 'flame', 'sprout', 'gem',
  'recycle', 'smile', 'badge', 'check', 'hand', 'coffee', 'cookie', 'shirt', 'palette', 'card', 'phone', 'calendar', 'users', 'truck', 'shield', 'star', 'refresh', 'pin', 'message', 'mail'] as const;

/** The store as the composer sees it: only real facts; photos by index. */
export type LibraryFacts = {
  storeName: string; what: string; story: string; city: string; request: string; tone: 'calm' | 'bold';
  products: Array<{ id: string; name: string; category?: string; price?: string }>;
  categories: string[];
  photos: Array<{ url: string; product?: string; category?: string }>;
  codes: Array<{ code: string; offer: string }>;
  services: Array<{ title: string; text: string; icon: string }>;
  location?: { name: string; address: string; hours?: string };
  reviews: number;
};

/** The answer schema (strict): every field is present; empty strings and -1 stand for «none». */
export function libraryAnswerSchema(photoCount: number) {
  const ids = LIBRARY_CATALOG.map(section => section.id);
  const looks = [...new Set(LIBRARY_CATALOG.flatMap(section => section.looks ?? [])), ''];
  const photo = { type: 'integer', minimum: -1, maximum: Math.max(0, photoCount - 1) };
  const item = { type: 'object', additionalProperties: false, required: ['title', 'text', 'icon', 'photo', 'link', 'value'], properties: {
    title: { type: 'string' }, text: { type: 'string' }, icon: { type: 'string', enum: [...LIBRARY_ICON_NAMES, ''] }, photo, link: { type: 'string' }, value: { type: 'string', enum: ['yes', 'no', ''] } } };
  const block = { type: 'object', additionalProperties: false,
    required: ['type', 'look', 'band', 'eyebrow', 'title', 'text', 'cta', 'link', 'cta2', 'link2', 'photo', 'photo2', 'items', 'products', 'product', 'code', 'card'],
    properties: { type: { type: 'string', enum: ids }, look: { type: 'string', enum: looks }, band: { type: 'string', enum: ['paper', 'muted', 'accent', 'deep', ''] },
      eyebrow: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, cta: { type: 'string' }, link: { type: 'string' }, cta2: { type: 'string' }, link2: { type: 'string' },
      photo, photo2: photo, items: { type: 'array', items: item }, products: { type: 'array', items: { type: 'string' } }, product: { type: 'string' }, code: { type: 'string' }, card: { type: 'string', enum: [...LIBRARY_CARDS, ''] } } };
  return { type: 'object', additionalProperties: false, required: ['blocks'], properties: { blocks: { type: 'array', items: block } } };
}

export const LIBRARY_PROMPT = `Eres el director de arte de una tienda online pagosYa. Armas su portada con secciones ya diseñadas (como un tema de Shopify):
eliges cuáles, su orden y escribes sus textos. No diseñas nada: el diseño ya está hecho.

Recibes los datos reales de la tienda (productos con id, categorías, fotos numeradas, códigos de descuento, servicios, dirección,
cantidad de reseñas, sus palabras y su pedido) y el catálogo de secciones. Respondes «blocks»: de 7 a 11 secciones en orden.

Reglas del orden: 1) la primera es una portada (role cover); 2) después, si quieres, una franja (role strip); 3) la grilla principal
(products-grid o products-tabs) va entre las tres primeras secciones y una sola vez; 4) en el medio, historia, beneficios, productos
destacados, ofertas e información, alternando: nunca dos secciones del mismo rol seguidas ni la misma sección dos veces; 5) la última
es un cierre (role closing).

Reglas de contenido:
- Usa cada foto UNA sola vez en toda la página (photo, photo2 e items.photo). -1 = sin foto. Una sección que pide foto la necesita.
  Las fotos de producto sobre fondo liso van en portadas enmarcadas (cover-split, cover-half, cover-centered), story-split, benefits-*,
  steps-howto; las fotos de ambiente amplias en cover-full, story-overlay, promo-banner, closing-photo. Mira las fotos.
- Productos: nombres EXACTOS de la lista (products), y product = el id exacto. Categorías: nombres exactos (link category:Nombre).
- Nada inventado: ni datos, ni cifras, ni premios, ni testimonios, ni ingredientes o beneficios que no estén en las palabras del
  comercio o en sus productos. compare-table solo con diferencias que el comercio dijo; si no hay, no la uses.
- reviews-*: solo si reviews > 0. promo-code y el código de cover-half: solo un código de la lista. visit-store: solo si hay dirección.
- Tono: marca tranquila (tone calm) → nada de cover-poster ni cover-ribbon, titulares en minúsculas con mayúscula inicial.
  Marca atrevida o divertida (tone bold) → puede usar cover-poster, cover-ribbon, strip-marquee look tilt, colores de banda accent y deep.
- Textos en español natural, con la voz de la marca y sus palabras: eyebrow 1 a 4 palabras; title 2 a 8 palabras; text 1 o 2 frases
  cortas; cta 1 a 3 palabras. Cada sección dice algo distinto: nunca repitas un titular ni una idea.
- link y link2: products, #productos, category:Nombre, product:id o whatsapp. Vacío = sin botón (deja cta vacío también).
- band: el fondo de la sección (paper, muted, accent, deep o vacío = el de la página). Alterna fondos; nunca dos seguidas con el mismo
  color de banda. accent y deep solo en secciones con foto, nunca en las de productos (sus tarjetas van sobre fondo claro).
- card (solo en la grilla principal, products-grid o products-tabs; vacío en las demás): la tarjeta de producto de toda la tienda.
  classic = foto, nombre y precio, sobria (moda, lujo, artesanal); ribbon = una cinta con la oferta corre sobre la foto y el precio
  anterior tachado (tiendas con ofertas, moda rápida, belleza); soft = tarjeta de color suave con botón «Agregar» (snacks, bebidas,
  dulces, marcas alegres); framed = foto enmarcada, nombre centrado y botón «Agregar al carrito» (cuidado personal, regalos, hogar).
- items.icon: uno de la lista; items.value solo en compare-table.
- Si el comercio pidió algo concreto para la portada (una sección, un tema, una oferta), cúmplelo con estas secciones.`;

const TEXT_CAPS = { eyebrow: 40, title: 80, text: 240, cta: 28, cta2: 28, itemTitle: 56, itemText: 160 } as const;
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (value: unknown, cap: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, cap).trim();

type RawItem = { title?: string; text?: string; icon?: string; photo?: number; link?: string; value?: string };
type RawBlock = { type?: string; look?: string; band?: string; eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: number; photo2?: number; items?: RawItem[]; products?: string[]; product?: string; code?: string; card?: string };
export type LayoutItem = { title: string; text?: string; icon?: string; photo?: string; link?: string; value?: string };
export type LayoutBlock = { type: string; look?: string; band?: string; eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: string; photo2?: string; items?: LayoutItem[]; products?: string[]; product?: string; code?: string; card?: string };

/** A model answer → a layout the template can always draw. Photos come back as the store's own URLs (bundled by the caller). */
export function validateLibraryLayout(answer: { blocks?: RawBlock[] } | null | undefined, facts: LibraryFacts): LayoutBlock[] {
  const used = new Set<number>();
  const productByName = new Map(facts.products.map(product => [fold(product.name), product]));
  const productById = new Map(facts.products.map(product => [product.id, product]));
  const categoryByName = new Map(facts.categories.map(name => [fold(name), name]));
  const takePhoto = (index: unknown): string | undefined => {
    const at = typeof index === 'number' ? index : -1;
    if (at < 0 || at >= facts.photos.length || used.has(at)) return undefined;
    used.add(at);
    return facts.photos[at].url;
  };
  const link = (value: unknown): string | undefined => {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;
    if (raw === 'products' || raw === '#productos' || raw === 'whatsapp') return raw;
    if (/^#lb-\d+$/.test(raw) || raw === '#preguntas' || raw === '#cierre') return raw;
    if (raw.startsWith('category:')) { const name = categoryByName.get(fold(raw.slice(9))); return name ? `category:${name}` : 'products'; }
    if (raw.startsWith('product:')) { const id = raw.slice(8); const found = productById.get(id) ?? productByName.get(fold(id)); return found ? `product:${found.id}` : 'products'; }
    return 'products';
  };
  const blocks: LayoutBlock[] = [];
  for (const raw of answer?.blocks ?? []) {
    const section = BY_ID.get(String(raw.type ?? ''));
    if (!section) continue;
    const needs = section.needs;
    if (needs.mood === 'bold' && facts.tone !== 'bold') continue;
    if (needs.reviews && facts.reviews <= 0) continue;
    if (needs.location && !facts.location) continue;
    if (needs.services && facts.services.length < 2) continue;
    if (needs.categories && facts.categories.length < needs.categories) continue;
    if (blocks.some(block => block.type === section.id)) continue;
    if (section.role === 'cover' && blocks.some(block => BY_ID.get(block.type)?.role === 'cover')) continue;
    if (section.role === 'products' && ['products-grid', 'products-tabs'].includes(section.id) && blocks.some(block => ['products-grid', 'products-tabs'].includes(block.type))) continue;
    const block: LayoutBlock = { type: section.id };
    if (section.id === 'products-grid' || section.id === 'products-tabs') block.card = (LIBRARY_CARDS as readonly string[]).includes(raw.card ?? '') ? raw.card : defaultCard(facts);
    if (raw.look && section.looks?.includes(raw.look)) block.look = raw.look;
    if (raw.band && ['paper', 'muted', 'accent', 'deep'].includes(raw.band)) block.band = raw.band;
    for (const field of ['eyebrow', 'title', 'text', 'cta', 'cta2'] as const) { const value = clip(raw[field], TEXT_CAPS[field]); if (value) block[field] = value; }
    const first = link(raw.link), second = link(raw.link2);
    if (block.cta) block.link = first ?? 'products'; else delete block.cta;
    if (block.cta2 && second) block.link2 = second; else delete block.cta2;
    // Photos: the section's own, then its items'; a section that needs more photos than it got is dropped (its photos freed).
    const before = new Set(used);
    if ((needs.photos ?? 0) >= 1 || ['compare-table', 'faq-split', 'visit-store', 'promo-code', 'closing-wordmark', 'statement-inline'].includes(section.id)) {
      const photo = takePhoto(raw.photo); if (photo) block.photo = photo;
    }
    if ((needs.photos ?? 0) >= 2 || section.id === 'statement-inline') { const photo2 = takePhoto(raw.photo2); if (photo2) block.photo2 = photo2; }
    // Items: capped words, a known icon, an item photo where the section shows one, a value only in the comparison.
    const [minItems, maxItems] = needs.items ?? [0, 0];
    let items: LayoutItem[] = (raw.items ?? []).slice(0, Math.max(maxItems, needs.categories ? 4 : 0)).map(item => {
      const out: LayoutItem = { title: clip(item.title, TEXT_CAPS.itemTitle) };
      const text = clip(item.text, TEXT_CAPS.itemText); if (text) out.text = text;
      if (item.icon && (LIBRARY_ICON_NAMES as readonly string[]).includes(item.icon)) out.icon = item.icon;
      if (section.id === 'compare-table') out.value = item.value === 'yes' ? 'yes' : 'no';
      if (needs.itemPhotos) { const photo = takePhoto(item.photo); if (photo) out.photo = photo; const target = link(item.link); if (target) out.link = target; }
      return out;
    }).filter(item => item.title);
    if (section.id === 'categories-tiles') items = items.filter(item => categoryByName.has(fold(item.title))).map(item => ({ ...item, title: categoryByName.get(fold(item.title))!, link: `category:${categoryByName.get(fold(item.title))}` }));
    if (needs.itemPhotos) items = items.filter(item => item.photo);
    if (section.id === 'strip-services') items = facts.services.slice(0, 4);
    if (section.id === 'visit-store' && facts.location) items = [{ title: 'Dirección', text: facts.location.address, icon: 'pin' }, ...(facts.location.hours ? [{ title: 'Horario', text: facts.location.hours, icon: 'clock' }] : [])];
    if (items.length) block.items = items;
    // Products by exact name; the spotlight by id (or a name the model gave instead).
    if (needs.products) {
      const names = [...new Set((raw.products ?? []).map(name => productByName.get(fold(String(name)))?.name).filter((name): name is string => Boolean(name)))].slice(0, needs.products[1]);
      if (names.length >= needs.products[0]) block.products = names;
    }
    if (needs.product) { const found = productById.get(String(raw.product ?? '')) ?? productByName.get(fold(String(raw.product ?? ''))); if (found) block.product = found.id; }
    if (needs.code || section.id === 'cover-half') { const code = facts.codes.find(entry => fold(entry.code) === fold(String(raw.code ?? ''))); if (code) block.code = code.code; }
    if (section.id === 'visit-store' && facts.location && !block.title) block.title = facts.location.name;
    // Needs met, or the block goes (and gives its photos back).
    const photos = [block.photo, block.photo2].filter(Boolean).length;
    const ok = photos >= Math.min(needs.photos ?? 0, 2) && (block.items?.length ?? 0) >= minItems && (!needs.itemPhotos || (block.items ?? []).filter(item => item.photo).length >= needs.itemPhotos)
      && (!needs.products || Boolean(block.products)) && (!needs.product || Boolean(block.product)) && (!needs.code || Boolean(block.code))
      && (section.id !== 'statement-inline' || ((block.title ?? '').split(' ').length >= 4 && Boolean(block.photo)))
      && (section.id !== 'cover-poster' || Boolean(block.title)) && (section.role !== 'cover' || Boolean(block.title));
    if (!ok) { for (const at of [...used]) if (!before.has(at)) used.delete(at); continue; }
    // Owner rule (no dark band of words alone): accent and deep only behind a photo or products.
    // Product cards are drawn for a light ground (Oh Belly live 2026-10-31: names and prices vanished on a deep grid band).
    if ((block.band === 'deep' || block.band === 'accent') && ['products-grid', 'products-tabs', 'products-cards', 'products-spotlight', 'products-lookbook'].includes(section.id)) delete block.band;
    if ((block.band === 'deep' || block.band === 'accent') && !block.photo && !block.products && !block.product && !(block.items ?? []).some(item => item.photo) && section.id !== 'categories-tiles') delete block.band;
    blocks.push(block);
  }
  return frameLayout(blocks, facts, used);
}

const defaultCard = (facts: LibraryFacts) => facts.tone === 'bold' ? 'soft' : 'classic';

/** The frame every page keeps: a cover first, the main grid early, a closing last; no two neighbours on the same band. */
function frameLayout(blocks: LayoutBlock[], facts: LibraryFacts, used: Set<number>): LayoutBlock[] {
  const free = () => { const at = facts.photos.findIndex((_, index) => !used.has(index)); if (at < 0) return undefined; used.add(at); return facts.photos[at].url; };
  let out = blocks.filter(block => BY_ID.get(block.type)?.role !== 'closing');
  const closing = blocks.find(block => BY_ID.get(block.type)?.role === 'closing');
  const coverAt = out.findIndex(block => BY_ID.get(block.type)?.role === 'cover');
  if (coverAt > 0) out = [out[coverAt], ...out.filter((_, index) => index !== coverAt)];
  if (coverAt < 0) { const photo = free(); out = [{ type: photo ? 'cover-split' : 'cover-centered', title: facts.storeName, ...(facts.what ? { text: clip(facts.what, TEXT_CAPS.text) } : {}), cta: 'Ver productos', link: 'products', ...(photo ? { photo } : {}) }, ...out]; }
  // The moving words belong under the cover (the catalogue says so); anywhere else they read as a stray band.
  const marqueeAt = out.findIndex(block => block.type === 'strip-marquee');
  if (marqueeAt > 1) out.splice(1, 0, out.splice(marqueeAt, 1)[0]);
  const gridAt = out.findIndex(block => block.type === 'products-grid' || block.type === 'products-tabs');
  const grid = gridAt >= 0 ? out.splice(gridAt, 1)[0] : { type: 'products-grid', title: 'Nuestros productos', cta: 'Ver todo', link: 'products', card: defaultCard(facts) };
  const after = out[1] && BY_ID.get(out[1].type)?.role === 'strip' ? 2 : 1;
  out.splice(after, 0, grid);
  // Two strips in a row, or the same role twice in a row, read as one long band: the second waits for a different neighbour.
  for (let index = 1; index < out.length; index++) {
    const role = BY_ID.get(out[index].type)?.role, previous = BY_ID.get(out[index - 1].type)?.role;
    if (role && role === previous && role !== 'products') { const [moved] = out.splice(index, 1); const slot = out.findIndex((block, at) => at > index && BY_ID.get(block.type)?.role !== role); if (slot > 0) out.splice(slot, 0, moved); else out.push(moved); }
  }
  out.push(closing ?? (() => { const photo = free(); return photo ? { type: 'closing-photo', title: facts.storeName, cta: 'Ver productos', link: 'products', photo } : { type: 'closing-wordmark', title: facts.storeName, cta: 'Ver productos', link: 'products' }; })());
  for (let index = 1; index < out.length; index++) if (out[index].band && out[index].band === out[index - 1].band) delete out[index].band;
  return out.slice(0, 12);
}

/** The catalogue and settings the composer reads, as the store has them now. */
export type LibraryStoreInput = {
  storeName: string; what: string; story: string; city: string; request: string; tone: 'calm' | 'bold';
  items: Array<{ id: string; name: string; categoryId?: string | null; amount?: unknown; imageUrls?: string[] }>;
  categories: Array<{ id: string; name: string }>;
  locations?: Array<{ name: string; address?: string; pickupEnabled?: boolean; openingHours?: Array<{ day: number; open: string; close: string; closed: boolean }> }>;
  shippingEnabled?: boolean; shippingPickupEnabled?: boolean; contactPhone?: string | null;
  /** The merchant's other uploads (newest first): brand and lifestyle photos the catalogue does not carry. */
  uploads: string[];
  codes: Array<{ code: string; discountType: string; discountValue: number }>;
  reviews: number;
};

const UPLOAD_PHOTO = /^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i;
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «lunes a viernes, 09:00 a 19:00 · sábado, 10:00 a 14:00»: consecutive days with the same hours read as one range. */
export function libraryHours(hours: NonNullable<LibraryStoreInput['locations']>[number]['openingHours']): string | undefined {
  const open = [1, 2, 3, 4, 5, 6, 0].map(day => hours?.find(entry => entry.day === day)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && !entry.closed && entry.open && entry.close));
  const runs: Array<{ from: number; to: number; open: string; close: string }> = [];
  for (const entry of open) {
    const last = runs.at(-1);
    if (last && last.open === entry.open && last.close === entry.close && (last.to + 1) % 7 === entry.day) last.to = entry.day;
    else runs.push({ from: entry.day, to: entry.day, open: entry.open, close: entry.close });
  }
  return runs.map(run => `${DAYS[run.from]}${run.to !== run.from ? ` a ${DAYS[run.to]}` : ''}, ${run.open} a ${run.close}`).join(' · ').replace(/^./, letter => letter.toUpperCase()) || undefined;
}

/** The store's real facts for the composer: photos are the merchant's own uploads (one per product first, then the rest), so the
 *  save can bundle any of them (the preview cannot load /v1/uploads). */
export function buildLibraryFacts(input: LibraryStoreInput, maxPhotos = 14): LibraryFacts {
  const categoryName = new Map(input.categories.map(category => [category.id, category.name]));
  const used = new Set(input.items.map(item => item.categoryId).filter(Boolean));
  const products = input.items.slice(0, 40).map(item => {
    const category = item.categoryId ? categoryName.get(item.categoryId) : undefined;
    // Amounts are cents (159,90 is 15990).
    const amount = Number(item.amount) / 100;
    return { id: item.id, name: item.name, ...(category ? { category } : {}), ...(Number.isFinite(amount) && amount > 0 ? { price: `Bs ${Number.isInteger(amount) ? amount : amount.toFixed(2).replace('.', ',')}` } : {}) };
  });
  const photos: LibraryFacts['photos'] = [];
  const add = (url: string | undefined, product?: string, category?: string) => {
    const path = url ? uploadOnly(url) : undefined;
    if (!path || photos.length >= maxPhotos || photos.some(photo => photo.url === path)) return;
    photos.push({ url: path, ...(product ? { product } : {}), ...(category ? { category } : {}) });
  };
  for (const item of input.items) add(item.imageUrls?.[0], item.name, item.categoryId ? categoryName.get(item.categoryId) : undefined);
  for (const url of input.uploads) add(url);
  for (const item of input.items) for (const url of item.imageUrls?.slice(1) ?? []) add(url, item.name, item.categoryId ? categoryName.get(item.categoryId) : undefined);
  const pickupAt = (input.locations ?? []).find(location => location.pickupEnabled && location.address);
  const located = pickupAt ?? (input.locations ?? []).find(location => location.address);
  const services: LibraryFacts['services'] = [
    ...(input.shippingEnabled ? [{ title: 'Envío a domicilio', text: input.city ? `Te lo llevamos en ${input.city}` : 'Te lo llevamos a tu puerta', icon: 'truck' }] : []),
    ...(input.shippingPickupEnabled && pickupAt ? [{ title: 'Recojo en tienda', text: pickupAt.name, icon: 'store' }] : []),
    { title: 'Pago seguro', text: 'Pagas en línea con pagosYa', icon: 'lock' },
    ...(input.contactPhone ? [{ title: 'Te atendemos', text: 'Escríbenos por WhatsApp', icon: 'message' }] : []),
  ];
  const offer = (code: LibraryStoreInput['codes'][number]) => code.discountType === 'PERCENT' ? `${code.discountValue}% de descuento` : `Bs ${code.discountValue} de descuento`;
  return {
    storeName: input.storeName, what: input.what.slice(0, 1500), story: input.story.slice(0, 1500), city: input.city, request: input.request.slice(0, 3000), tone: input.tone,
    products, categories: input.categories.filter(category => used.has(category.id)).map(category => category.name), photos,
    codes: input.codes.slice(0, 3).map(code => ({ code: code.code, offer: offer(code) })),
    services: services.length >= 2 ? services : [],
    ...(located?.address ? { location: { name: located.name, address: located.address, ...(libraryHours(located.openingHours) ? { hours: libraryHours(located.openingHours) } : {}) } } : {}),
    reviews: input.reviews,
  };
}

const uploadOnly = (url: string) => {
  if (UPLOAD_PHOTO.test(url)) return url;
  try { const path = new URL(url).pathname; return UPLOAD_PHOTO.test(path) ? path : undefined; } catch { return undefined; }
};
