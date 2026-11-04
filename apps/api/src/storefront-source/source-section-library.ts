/* Section library (spec docs/superpowers/specs/2026-10-31-section-library.md): YAPI picks sections from the Esencial library,
 * orders them and fills their words and photos; the layout itself is template code, tested once. This module is pure: the
 * catalogue the model reads, its answer schema, and the validation that turns an answer into a safe store-data `layout` — every
 * block's needs are met by the store's real facts, every photo is the store's and shown once, every product exists. */

import { isPlayfulBusiness } from './home-directions';
import { libraryTitleStyle, type TitleStyle } from './source-title-style';

export type LibraryRole = 'cover' | 'strip' | 'products' | 'story' | 'benefits' | 'proof' | 'promo' | 'info' | 'closing';
export type LibraryNeeds = { photos?: number; items?: [number, number]; products?: [number, number]; product?: boolean; categories?: number;
  reviews?: boolean; code?: boolean; location?: boolean; services?: boolean; itemPhotos?: number; mood?: 'bold';
  /** 34 templates (2026-10-31): a date the merchant named (countdown), the store's own social account, real products pinned on a
   *  photo, outlets and words the merchant gave (press), a text the section cannot do without. */
  date?: boolean; social?: boolean; pins?: boolean; press?: boolean; text?: boolean;
  /** Points on a close-up photo, each with a note (detail-hotspots, lively one-product stores 2026-11-03). */
  spots?: boolean;
  /** before-after: the merchant's own words speak of a before and an after (new sections 2026-11-04). */
  pair?: boolean };
export type LibrarySection = { id: string; role: LibraryRole; use: string; needs: LibraryNeeds; looks?: string[];
  /** Only inside a template's fixed home (34 templates): never offered when YAPI composes a home freely. */
  templateOnly?: boolean;
  /** Decoration with nothing to write (a wave edge): a template keeps it even when the answer leaves it out. */
  decor?: boolean };

/** What each section is for, in the words the model reads (Spanish, like every YAPI prompt). */
export const LIBRARY_CATALOG: readonly LibrarySection[] = [
  { id: 'cover-split', role: 'cover', use: 'Portada: titular grande y botones a un lado, una foto enmarcada al otro; hasta 3 puntos breves con icono. La más versátil.', needs: { photos: 1, items: [0, 3] }, looks: ['frame', 'arch', 'circle'] },
  { id: 'hero-split', role: 'cover', use: 'Portada de tienda de un producto: la mejor foto de ambiente a un lado, al otro eyebrow (ciudad o categoría), titular grande, una o dos líneas y dos botones (cta «Ver el producto», cta2 «Ver colores»). items = hasta 3 etiquetas cortas sobre la foto (≤ 32 letras, solo hechos dados).', needs: { photos: 1, items: [0, 3] }, templateOnly: true },
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
  // Owner 2026-11-02 (one-product stores): the product's whole detail at the top of the home (the kit's gallery, options, «Agregar»).
  { id: 'product-hero', role: 'products', use: 'El producto completo arriba de todo: galería grande, precio, opciones y botón Agregar (product = su id). eyebrow = una línea corta de la tienda sobre el producto (envío, garantía). items = hasta 3 etiquetas que flotan sobre la foto (title ≤ 32 letras): solo hechos que el comercio dio (su ciudad de entrega, «Llega en caja», garantía); vacío si no hay. Solo en tiendas de un producto.', needs: { product: true, items: [0, 3] }, templateOnly: true },
  { id: 'variant-cards', role: 'products', use: 'Tarjetas de colores del producto (las dibuja la tienda desde sus variantes con foto). Solo title (corto, p. ej. «Elige tu color»).', needs: { product: true }, templateOnly: true },
  { id: 'detail-hotspots', role: 'story', use: 'Una foto de cerca del producto (photo: la que muestra un detalle: tela, textura, botones, terminación) con hasta 3 puntos «+». items: title = qué se ve en ese punto (≤ 60 letras), x, y = dónde está, en % del ancho y alto de la foto. title y text de la sección cortos. Sin una foto de detalle, deja la sección vacía.', needs: { photos: 1, items: [1, 3], spots: true }, templateOnly: true },
  { id: 'chips-marquee', role: 'proof', use: 'Dos filas de frases cortas que se deslizan, cada una con la foto del producto (photo). items: 6 a 10 title de ≤ 48 letras, solo hechos del producto o de la tienda (cómo llega, para qué sirve, colores que hay), nada inventado.', needs: { photos: 1, items: [6, 10] }, templateOnly: true },
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
  { id: 'faq-split', role: 'info', use: 'Preguntas frecuentes: titular a un lado, 3 a 6 preguntas con su respuesta al otro, de los datos reales (envíos, recojo, cambios, uso). look lines = líneas finas, sin fondos (tranquila).', needs: { items: [3, 6] }, looks: ['lines'] },
  { id: 'visit-store', role: 'info', use: 'Visítanos: foto y la dirección y el horario de la tienda (las filas las pone pagosYa).', needs: { location: true } },
  { id: 'closing-photo', role: 'closing', use: 'Cierre: foto a todo el ancho con una frase final y botón.', needs: { photos: 1 } },
  { id: 'closing-wordmark', role: 'closing', use: 'Cierre: foto, frase final y botón, y el nombre de la tienda enorme al final.', needs: {} },
  // 34 templates (2026-10-31): parts of the themes' fixed homes.
  { id: 'bar-note', role: 'strip', use: 'Una línea breve bajo el menú (title, 4 a 10 palabras): un dato real de la tienda.', needs: {}, templateOnly: true },
  { id: 'cover-stage', role: 'cover', use: 'Portada de foto completa con titular, texto y dos botones apilados; items con photo = fotos extra que se alternan.', needs: { photos: 1, items: [0, 2] }, templateOnly: true },
  { id: 'promo-countdown', role: 'promo', use: 'Oferta con cuenta regresiva hasta endsAt (fecha ISO). Solo si el comercio dijo hasta cuándo dura su oferta.', needs: { date: true }, templateOnly: true },
  { id: 'story-stack', role: 'story', use: '2 o 3 frases (items.title, 8 a 16 palabras) cada una con su foto, que pasan junto a las fotos fijas.', needs: { items: [2, 3], itemPhotos: 2 }, templateOnly: true },
  { id: 'statement-reveal', role: 'story', use: 'Un párrafo grande (text, 25 a 45 palabras) que se ilumina palabra por palabra; una frase de 2 o 3 palabras entre *asteriscos* va subrayada.', needs: { text: true }, templateOnly: true },
  { id: 'categories-list', role: 'products', use: 'Lista de categorías (items.title = nombre exacto, photo = una foto de esa categoría) junto a la foto de la que se señala.', needs: { categories: 2, items: [2, 6], itemPhotos: 2 }, templateOnly: true },
  { id: 'marquee-photo', role: 'promo', use: 'Foto a todo el ancho con 1 a 3 palabras que corren encima (items.title) y un botón.', needs: { photos: 1, items: [1, 3] }, templateOnly: true },
  { id: 'story-overlap', role: 'story', use: 'Dos fotos superpuestas (photo y photo2) junto a un titular y 2 a 4 puntos (items).', needs: { photos: 2, items: [0, 4] }, templateOnly: true },
  { id: 'promo-trio', role: 'promo', use: 'Tres columnas con título y enlace: con look single sobre una sola foto (photo); si no, cada una con su foto (items.photo).', needs: { items: [2, 3] }, looks: ['single', 'tiles'], templateOnly: true },
  { id: 'products-slider', role: 'products', use: 'Fila de productos que se desliza, con titular y botón a todos.', needs: {}, templateOnly: true },
  { id: 'social-posts', role: 'proof', use: 'Publicaciones de la tienda: fotos (items.photo) con su @cuenta y «Ver el look». Solo si la tienda enlazó su Instagram o TikTok.', needs: { social: true, items: [3, 8], itemPhotos: 3 }, templateOnly: true },
  { id: 'social-marquee', role: 'proof', use: 'Titular con una palabra en *asteriscos* (va en letra manuscrita) y fotos que corren con «síguenos» y la @cuenta. Solo con cuenta enlazada.', needs: { social: true, items: [3, 6], itemPhotos: 3 }, templateOnly: true },
  { id: 'shop-look', role: 'products', use: 'Foto con puntos sobre los productos que aparecen en ella (items.title = nombre exacto del producto; x, y = posición en % sobre la foto).', needs: { photos: 1, items: [1, 4], pins: true }, templateOnly: true },
  { id: 'checker-rows', role: 'benefits', use: '2 a 4 cualidades en mosaicos de color (items.title, items.text) que alternan con fotos de la tienda (items.photo).', needs: { items: [2, 4], itemPhotos: 2 }, templateOnly: true },
  { id: 'wave-divider', role: 'strip', use: 'Borde de olas entre secciones (decorativo, sin textos).', needs: {}, templateOnly: true, decor: true },
  { id: 'stats-rings', role: 'proof', use: '1 a 4 porcentajes que el comercio midió (items.value = el número, items.text = qué significa), cada uno en un anillo. Solo números que el comercio escribió.', needs: { items: [1, 4] }, templateOnly: true },
  { id: 'image-columns', role: 'story', use: '2 a 4 columnas de foto con título, una frase y un enlace (items con photo).', needs: { items: [2, 4], itemPhotos: 2 }, templateOnly: true },
  { id: 'statement-marquee', role: 'promo', use: 'Unas pocas palabras (title, 2 a 4 palabras) que corren enormes sobre una banda oscura, una frase (text) y un botón.', needs: {}, templateOnly: true },
  { id: 'photo-scroller', role: 'story', use: 'Fila de 3 a 8 fotos que se desliza, cada una con su frase debajo (items.photo, items.text).', needs: { items: [2, 8], itemPhotos: 2 }, templateOnly: true },
  { id: 'story-timeline', role: 'story', use: 'La historia de la tienda en 2 a 5 capítulos (lugares, años): items con photo, title y text, elegidos con pestañas. Solo hechos que el comercio contó.', needs: { items: [2, 5], itemPhotos: 2 }, templateOnly: true },
  { id: 'story-collage', role: 'story', use: 'Tres fotos superpuestas como copias sobre una mesa (photo, photo2, items.photo) junto a un titular, texto y dos botones.', needs: { photos: 2 }, templateOnly: true },
  { id: 'newsletter-split', role: 'info', use: 'Una foto junto a un panel de color con titular, texto y el formulario de novedades de la tienda.', needs: { photos: 1 }, templateOnly: true },
  { id: 'cover-shoppable', role: 'cover', use: 'Portada de foto completa con un + sobre cada producto que aparece en ella (items.title = nombre exacto, x, y = posición en %) y el titular abajo a la izquierda.', needs: { photos: 1, items: [0, 4], pins: true }, templateOnly: true },
  { id: 'cover-video', role: 'cover', use: 'El video de la tienda de fondo con un titular centrado (solo se ve si la tienda subió un video).', needs: {}, templateOnly: true },
  { id: 'categories-mosaic', role: 'products', use: 'Mosaico de 3 a 6 fotos con su nombre al centro y enlace (items con photo).', needs: { items: [3, 6], itemPhotos: 3 }, templateOnly: true },
  { id: 'icon-columns', role: 'benefits', use: '2 a 4 columnas con icono, título y una frase (items) de cualidades reales de la tienda.', needs: { items: [2, 4] }, templateOnly: true },
  { id: 'press-quotes', role: 'proof', use: 'Lo que dijo la prensa: items.title = el medio, items.text = su frase. Solo medios y frases que el comercio escribió.', needs: { items: [1, 5], press: true }, templateOnly: true },
  // New sections copied from real stores (spec docs/superpowers/specs/2026-11-04-new-sections-from-real-stores.md).
  { id: 'cover-duo', role: 'cover', use: 'Portada de dos fotos lado a lado hasta los bordes (photo y photo2), el titular encima de ambas y un botón blanco al pie de cada foto (cta/link en la primera, cta2/link2 en la segunda: «Mujer» / «Hombre», dos categorías o dos líneas). Para moda, hogar o dos públicos.', needs: { photos: 2 } },
  { id: 'promo-lines', role: 'promo', use: 'Dos tarjetas grandes de foto redondeadas (items = 2 con photo, title, text y link), cada una con una etiqueta redonda sobre la foto (items.value, 1 a 3 palabras: «Nuevo», «Sin azúcar», solo lo que el comercio dijo) y un botón debajo (cta). Dos líneas, dos sabores, dos colecciones.', needs: { items: [2, 2], itemPhotos: 2 } },
  { id: 'story-sunburst', role: 'story', use: 'Banda de color suave: titular, texto y botón a un lado; al otro la foto en un círculo con rayos de color que giran despacio (marcas tranquilas: anillos finos). Para lo que hace especial al producto: ingredientes, origen, cómo se hace. look rings = anillos finos en lugar de rayos (marcas tranquilas); left = la foto a la izquierda.', needs: { photos: 1 }, looks: ['rings', 'left'] },
  { id: 'perks-rows', role: 'benefits', use: 'Una foto enmarcada sobre un panel a rayas y, al lado, 2 a 4 filas con lo que gana el cliente al comprar aquí (items: title = el beneficio, text = una línea, value = una etiqueta corta como «Gratis» o «10% menos», link): suscripción, envío, recojo, un código. Solo beneficios que la tienda tiene de verdad.', needs: { photos: 1, items: [2, 4] } },
  { id: 'before-after', role: 'proof', use: 'Antes y después: dos fotos en un mismo marco (photo = antes, photo2 = después) que el cliente compara arrastrando una barra. Solo si el comercio habla de un antes y un después (limpieza, restauración, belleza, peluquería) y tiene esas dos fotos.', needs: { photos: 2, pair: true } },
];
const BY_ID = new Map(LIBRARY_CATALOG.map(section => [section.id, section]));
/** Sections whose items carry a short tag in `value` (spec docs/superpowers/specs/2026-11-04-new-sections-from-real-stores.md). */
const TAGGED = new Set(['promo-lines', 'perks-rows']);
/** The product card, from the same themes (owner 2026-10-31); the main grid carries it and the Shell shows it on every page. */
// Template frame variety (2026-11-03): ten more cards copied from real stores (esencial globals.css, «v:lbcard» blocks).
export const LIBRARY_CARDS = ['classic', 'ribbon', 'soft', 'framed', 'arch', 'overlay', 'line', 'portrait', 'swatch', 'badge', 'polaroid', 'round-add', 'list', 'scallop', 'caps'] as const;
export const LIBRARY_ICON_NAMES = ['leaf', 'sparkles', 'heart', 'droplet', 'sun', 'gift', 'clock', 'package', 'store', 'lock', 'zap', 'award', 'flame', 'sprout', 'gem',
  'recycle', 'smile', 'badge', 'check', 'hand', 'coffee', 'cookie', 'shirt', 'palette', 'card', 'phone', 'calendar', 'users', 'truck', 'shield', 'star', 'refresh', 'pin', 'message', 'mail'] as const;

/** The store as the composer sees it: only real facts; photos by index. */
export type LibraryFacts = {
  storeName: string; what: string; story: string; city: string; request: string; tone: 'calm' | 'bold';
  /** about: the product's own description, on a store of three products or fewer (one-product stores, 2026-11-02). */
  products: Array<{ id: string; name: string; category?: string; price?: string; about?: string }>;
  categories: string[];
  photos: Array<{ url: string; product?: string; category?: string }>;
  codes: Array<{ code: string; offer: string }>;
  services: Array<{ title: string; text: string; icon: string }>;
  location?: { name: string; address: string; hours?: string };
  reviews: number;
  /** The store's own Instagram or TikTok (from its links): social-* sections need it. */
  social?: { handle: string; url: string };
  /** 2026-11-02 (Miga Dorada: «¿Cuánto duran las cookies?» → «Consulta por WhatsApp»): what the merchant already wrote in their
   *  settings — delivery prices and times, policies, the notes they gave their assistant — for questions and steps. */
  notes?: string;
};

/** The answer schema (strict): every field is present; empty strings and -1 stand for «none». */
export function libraryAnswerSchema(photoCount: number) {
  const ids = LIBRARY_CATALOG.map(section => section.id);
  const looks = [...new Set(LIBRARY_CATALOG.flatMap(section => section.looks ?? [])), ''];
  const photo = { type: 'integer', minimum: -1, maximum: Math.max(0, photoCount - 1) };
  const item = { type: 'object', additionalProperties: false, required: ['title', 'text', 'icon', 'photo', 'link', 'value', 'x', 'y'], properties: {
    title: { type: 'string' }, text: { type: 'string' }, icon: { type: 'string', enum: [...LIBRARY_ICON_NAMES, ''] }, photo, link: { type: 'string' }, value: { type: 'string' },
    x: { type: 'number' }, y: { type: 'number' } } };
  const block = { type: 'object', additionalProperties: false,
    required: ['type', 'look', 'band', 'eyebrow', 'title', 'text', 'cta', 'link', 'cta2', 'link2', 'photo', 'photo2', 'items', 'products', 'product', 'code', 'card', 'endsAt'],
    properties: { type: { type: 'string', enum: ids }, look: { type: 'string', enum: looks }, band: { type: 'string', enum: ['paper', 'muted', 'accent', 'deep', ''] },
      eyebrow: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, cta: { type: 'string' }, link: { type: 'string' }, cta2: { type: 'string' }, link2: { type: 'string' },
      photo, photo2: photo, items: { type: 'array', items: item }, products: { type: 'array', items: { type: 'string' } }, product: { type: 'string' }, code: { type: 'string' }, card: { type: 'string', enum: [...LIBRARY_CARDS, ''] }, endsAt: { type: 'string' } } };
  return { type: 'object', additionalProperties: false, required: ['blocks', 'mood', 'titleStyle'], properties: { blocks: { type: 'array', items: block }, mood: { type: 'string', enum: ['colourful', 'calm'] }, titleStyle: { type: 'string', enum: ['burbuja', 'redonda', 'firme', 'poster'] } } };
}

/** Lively one-product stores (spec 2026-11-03): the mood YAPI chose for the product; a playful business (sweets, toys, parties) is
 *  always colourful; anything else not exactly «colourful» is calm. */
/** Chunky colour titles (spec 2026-11-03): what a library answer sets on a Único store — the mood and the title style; nothing elsewhere. */
export function libraryVariants(theme: string, answer: { mood?: unknown; titleStyle?: unknown } | null | undefined, facts: LibraryFacts): { mood: 'colourful' | 'calm'; titles: TitleStyle } | undefined {
  if (theme !== 'unico') return undefined;
  const playful = isPlayfulBusiness([facts.what, facts.request, ...facts.products.map(product => `${product.name} ${product.about ?? ''}`)].join('\n'));
  return { mood: libraryMood(answer, facts), titles: libraryTitleStyle(answer, playful) };
}

export function libraryMood(answer: { mood?: unknown } | null | undefined, facts: LibraryFacts): 'colourful' | 'calm' {
  if (isPlayfulBusiness([facts.what, facts.request, ...facts.products.map(product => `${product.name} ${product.about ?? ''}`)].join('\n'))) return 'colourful';
  return answer?.mood === 'colourful' ? 'colourful' : 'calm';
}

/** 34 templates: what changes when the store already wears a template — the answer only fills the template's own sections. */
export const LIBRARY_FILL_PROMPT = `MODO PLANTILLA (manda sobre las reglas de arriba): la tienda ya usa una plantilla completa (en «plantilla»: sus secciones en orden,
con palabras de ejemplo).
Responde «blocks» con EXACTAMENTE esas secciones, del mismo tipo y en el mismo orden; no agregues, quites ni cambies ninguna. Escribe
todo de nuevo con los datos y la voz de esta tienda (las palabras de ejemplo solo marcan el largo y el tono; nunca las copies), elige
las fotos de la tienda para cada sección y sus items (una foto puede repetirse UNA vez en la página, nunca dos veces en la misma
sección ni en dos secciones seguidas), y deja vacío (o sin items) lo que la tienda no puede respaldar: el código la quita.
look, band y card los pone la plantilla: déjalos vacíos. Escribe TODAS las secciones completas hasta la última (preguntas con sus
respuestas, puntos, columnas, títulos de categorías y productos exactos para los puntos de shop-look): una sección que mandas vacía
desaparece. Si te faltan fotos, deja photo en -1: el código pone una foto de la tienda.
- mood: «colourful» para productos alegres, de casa o de regalo que piden juego (un sofá nube, una bebida, juguetes, dulces); «calm» para productos serios o técnicos (herramientas, cuidado de la piel, salud, finanzas). Fuera de la plantilla Único no cambia nada.
- titleStyle: el estilo de los títulos según el producto: «burbuja» (juguetes, mascotas, dulces, snacks, fiestas, niños), «redonda» (casa, muebles, cocina, ropa de cama), «firme» (tecnología, belleza, herramientas), «poster» (deportes, bebidas, ropa urbana). Fuera de la plantilla Único no cambia nada.
- Etiquetas (product-hero items), frases (chips-marquee) y notas (detail-hotspots): solo hechos que están en los datos (lo que dijo el comercio, la descripción del producto, sus notas de entrega). Ningún plazo, número, premio o calificación que no esté escrito. Si no hay hechos, déjalos vacíos.`;

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
  steps-howto; las fotos de ambiente amplias en cover-full, cover-duo (dos de personas o lugares, verticales), story-overlay, promo-banner,
  closing-photo. Mira las fotos.
- Productos: nombres EXACTOS de la lista (products), y product = el id exacto. Categorías: nombres exactos (link category:Nombre).
- notes son datos reales que el comercio ya escribió (envíos, precios de envío, políticas, sus notas): úsalos para responder
  preguntas frecuentes y escribir pasos con datos concretos; nunca respondas «consulta por WhatsApp» si notes tiene la respuesta.
- Nada inventado: ni datos, ni cifras, ni premios, ni testimonios, ni ingredientes o beneficios que no estén en las palabras del
  comercio o en sus productos. compare-table solo con diferencias que el comercio dijo; si no hay, no la uses.
- reviews-*: solo si reviews > 0. promo-code y el código de cover-half: solo un código de la lista. visit-store: solo si hay dirección.
- Tono: marca tranquila (tone calm) → nada de cover-poster ni cover-ribbon, titulares en minúsculas con mayúscula inicial.
  Marca atrevida o divertida (tone bold) → puede usar cover-poster, cover-ribbon, strip-marquee look tilt, colores de banda accent y deep.
- Textos en español natural, con la voz de la marca y sus palabras: eyebrow 1 a 4 palabras; title 2 a 8 palabras; text 1 o 2 frases
  cortas; cta 1 a 3 palabras. Cada sección dice algo distinto: nunca repitas un titular ni una idea. Envío, recojo y pago ya
  los dice strip-services: no los repitas en beneficios, bento ni preguntas si esa franja va.
- link y link2: products, #productos, category:Nombre, product:id o whatsapp. Vacío = sin botón (deja cta vacío también).
- band: el fondo de la sección (paper, muted, accent, deep o vacío = el de la página). Alterna fondos; nunca dos seguidas con el mismo
  color de banda. accent y deep solo en secciones con foto, nunca en las de productos (sus tarjetas van sobre fondo claro).
- card (solo en la grilla principal, products-grid o products-tabs; vacío en las demás): la tarjeta de producto de toda la tienda.
  classic = foto, nombre y precio, sobria (moda, lujo, artesanal); ribbon = una cinta con la oferta corre sobre la foto y el precio
  anterior tachado (tiendas con ofertas, moda rápida, belleza); soft = tarjeta de color suave con botón «Agregar» (snacks, bebidas,
  dulces, marcas alegres); framed = foto enmarcada, nombre centrado y botón «Agregar al carrito» (cuidado personal, regalos, hogar).
- items.icon: uno de la lista; items.value solo en compare-table (yes/no), stats-rings (el número) y las etiquetas de promo-lines y
  perks-rows (1 a 3 palabras; ningún número que el comercio no escribió). items.x e items.y solo en
  los puntos sobre una foto (shop-look, cover-shoppable), en %; -1 en todo lo demás.
- Si el comercio pidió algo concreto para la portada (una sección, un tema, una oferta), cúmplelo con estas secciones.`;

export const TEXT_CAPS = { eyebrow: 40, title: 80, text: 240, cta: 28, cta2: 28, itemTitle: 56, itemText: 160 } as const;
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (value: unknown, cap: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, cap).trim();

type RawItem = { title?: string; text?: string; icon?: string; photo?: number; link?: string; value?: string; x?: number; y?: number };
type RawBlock = { template?: LayoutBlock; type?: string; look?: string; band?: string; eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: number; photo2?: number; items?: RawItem[]; products?: string[]; product?: string; code?: string; card?: string; endsAt?: string };
export type LayoutItem = { title: string; text?: string; icon?: string; photo?: string; link?: string; value?: string; x?: number; y?: number };
export type LayoutBlock = { type: string; look?: string; band?: string; eyebrow?: string; title?: string; text?: string; cta?: string; link?: string; cta2?: string; link2?: string;
  photo?: string; photo2?: string; items?: LayoutItem[]; products?: string[]; product?: string; code?: string; card?: string; endsAt?: string; handle?: string; social?: string };

/** A model answer → a layout the template can always draw. Photos come back as the store's own URLs (bundled by the caller). */
/** 34 templates (2026-10-31): `fixed` is a template's home — the answer only fills it. Its blocks keep their order, type, look, band
 *  and card; each takes the answer's first block of the same type (its words, photos, items); a block the answer left out, or that
 *  the store cannot back, goes. Nothing is added or moved. */
export function validateLibraryLayout(answer: { blocks?: RawBlock[] } | null | undefined, facts: LibraryFacts, options: { fixed?: LayoutBlock[]; now?: number } = {}): LayoutBlock[] {
  const fixedMode = Boolean(options.fixed?.length);
  const now = options.now ?? Date.now();
  const merchantWords = fold(`${facts.what} ${facts.story} ${facts.request}`);
  // Lively parts may also repeat the store's notes and its products' own descriptions (spec 2026-11-03).
  const backedWords = fold(`${merchantWords} ${facts.notes ?? ''} ${facts.products.map(product => product.about ?? '').join(' ')}`);
  const used = new Set<number>();
  const productByName = new Map(facts.products.map(product => [fold(product.name), product]));
  const productById = new Map(facts.products.map(product => [product.id, product]));
  const categoryByName = new Map(facts.categories.map(name => [fold(name), name]));
  // Owner 2026-10-31 (option 2): in a template a photo may show twice — never twice in one section, never in two neighbouring
  // sections; a freely composed home shows each photo once.
  const spots = new Map<number, number[]>();
  let here = 0;
  const takePhoto = (index: unknown): string | undefined => {
    const at = typeof index === 'number' ? index : -1;
    if (at < 0 || at >= facts.photos.length) return undefined;
    if (fixedMode) {
      const places = spots.get(at) ?? [];
      if (places.length >= 2 || places.includes(here) || places.includes(here - 1)) return undefined;
      // Owner 2026-11-02 («unused photos first»): a photo shows a second time only once every photo of the store has shown.
      if (places.length && facts.photos.some((_, other) => !(spots.get(other) ?? []).length)) return undefined;
      spots.set(at, [...places, here]);
    } else if (used.has(at)) return undefined;
    used.add(at);
    return facts.photos[at].url;
  };
  // Template mode (live check 2026-10-31: the model left every photo place after the 11th empty): a place the answer left without a
  // photo takes the store's least-shown photo the rule allows — one of the category named, when there is one.
  const pick = (category?: string): string | undefined => {
    if (!fixedMode) return undefined;
    const order = facts.photos.map((photo, at) => ({ at, shown: (spots.get(at) ?? []).length, match: category && photo.category && fold(photo.category) === fold(category) ? 0 : 1 }))
      .sort((a, b) => Math.sign(a.shown) - Math.sign(b.shown) || a.match - b.match || a.shown - b.shown || a.at - b.at);
    for (const { at } of order) { const url = takePhoto(at); if (url) return url; }
    return undefined;
  };
  const photoOf = (index: unknown, category?: string) => takePhoto(index) ?? pick(category);
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
  const answered = [...(answer?.blocks ?? [])];
  const sequence: RawBlock[] = fixedMode ? options.fixed!.flatMap(template => {
    const at = answered.findIndex(raw => raw.type === template.type);
    // Decoration (a wave edge) has nothing to write: the template's own block stays when the answer skipped it.
    if (at < 0) return BY_ID.get(template.type)?.decor ? [{ type: template.type, look: template.look ?? '', band: template.band ?? '', template }] : [];
    const [raw] = answered.splice(at, 1);
    return [{ ...raw, type: template.type, look: template.look ?? '', band: template.band ?? '', card: template.card ?? '', template }];
  }) : answered;
  for (const raw of sequence) {
    const section = BY_ID.get(String(raw.type ?? ''));
    if (!section || (section.templateOnly && !fixedMode)) continue;
    const needs = section.needs;
    if (needs.mood === 'bold' && facts.tone !== 'bold') continue;
    if (needs.reviews && facts.reviews <= 0) continue;
    if (needs.location && !facts.location) continue;
    if (needs.services && facts.services.length < 2) continue;
    if (needs.categories && facts.categories.length < needs.categories) continue;
    if (needs.social && !facts.social) continue;
    if (needs.pair && !(/\bantes\b/.test(merchantWords) && /\bdespues\b/.test(merchantWords))) continue;
    if (!fixedMode && blocks.some(block => block.type === section.id)) continue;
    // With the product on top and nothing else to sell, a row of products would only repeat it (it comes back once there are two).
    if (['products-slider', 'products-grid', 'products-tabs', 'products-cards'].includes(section.id) && facts.products.length < 2 && sequence.some(other => other.type === 'product-hero')) continue;
    // Live 2026-10-31 (Oh Belly): the ribbon cover already runs its words; a marquee after it is the same band twice.
    if (section.id === 'strip-marquee' && (answer?.blocks ?? []).some(other => other.type === 'cover-ribbon')) continue;
    // The main grid shows up to 8 products: on a smaller catalogue a hand-picked row only repeats it (Oh Belly, 5 products).
    if (!fixedMode && section.id === 'products-cards' && facts.products.length <= 8) continue;
    if (!fixedMode && section.role === 'cover' && blocks.some(block => BY_ID.get(block.type)?.role === 'cover')) continue;
    if (!fixedMode && section.role === 'products' && ['products-grid', 'products-tabs'].includes(section.id) && blocks.some(block => ['products-grid', 'products-tabs'].includes(block.type))) continue;
    const block: LayoutBlock = { type: section.id };
    if (section.id === 'products-grid' || section.id === 'products-tabs' || section.id === 'products-slider') block.card = (LIBRARY_CARDS as readonly string[]).includes(raw.card ?? '') ? raw.card : defaultCard(facts);
    // A template's own look wins (arch, caption, uneven, parallax…); a free answer may only use the section's listed looks.
    if (raw.look && (raw.template || section.looks?.includes(raw.look))) block.look = raw.look;
    // Owner rule 2026-10-29 (no section of only words on a plain ground), enforced on templates 2026-11-02: the icon columns stand
    // beside a photo, the category list shows its photos instead of the giant-letter stack, and the big paragraph has no photo to take.
    if (section.id === 'statement-reveal') continue;
    const besidePhoto = section.id === 'icon-columns';
    if (besidePhoto) block.look = 'side';
    if (section.id === 'categories-list' && block.look === 'stack') delete block.look;
    if (raw.band && ['paper', 'muted', 'accent', 'deep'].includes(raw.band)) block.band = raw.band;
    for (const field of ['eyebrow', 'title', 'text', 'cta', 'cta2'] as const) { const value = clip(raw[field], TEXT_CAPS[field]); if (value) block[field] = value; }
    const first = link(raw.link), second = link(raw.link2);
    if (block.cta) block.link = first ?? 'products'; else delete block.cta;
    // The split hero's second button always scrolls to its colour cards (the kit hides it when they do not draw).
    if (block.cta2 && second) block.link2 = second; else if (block.cta2 && section.id === 'cover-duo') block.link2 = 'products'; else if (section.id !== 'hero-split') delete block.cta2;
    // Photos: the section's own, then its items'; a section that needs more photos than it got is dropped (its photos freed).
    const before = new Set(used);
    here = blocks.length;
    const single = section.id === 'promo-trio' && raw.look === 'single';
    // Steps as numbered cards (Shapes «How it works») show no photo, so they take none.
    const photoless = section.id === 'steps-howto' && raw.look === 'cards';
    if (photoless) { /* no photo */ } else if ((needs.photos ?? 0) >= 1 || single || raw.template?.photo || besidePhoto || ['compare-table', 'faq-split', 'visit-store', 'promo-code', 'closing-wordmark', 'statement-inline'].includes(section.id)) {
      const photo = photoOf(raw.photo); if (photo) block.photo = photo;
    }
    if ((needs.photos ?? 0) >= 2 || section.id === 'statement-inline' || raw.template?.photo2) { const photo2 = photoOf(raw.photo2); if (photo2) block.photo2 = photo2; }
    const liveCap = section.id === 'product-hero' || section.id === 'hero-split' ? 32 : section.id === 'chips-marquee' ? 48 : section.id === 'detail-hotspots' ? 60 : 0;
    // Items: capped words, a known icon, an item photo where the section shows one, a value only in the comparison.
    const [minItems, maxItems] = needs.items ?? [0, 0];
    const itemPhoto = Boolean(needs.itemPhotos) || section.id === 'cover-stage' || (section.id === 'promo-trio' && !single) || Boolean(raw.template?.items?.some(item => item.photo));
    // Social posts are the store's own photos: the answer need not list them.
    const rawItems: RawItem[] = needs.social && (raw.items ?? []).length < (needs.items?.[0] ?? 0) ? Array.from({ length: needs.items![0] + 2 }, () => ({ title: 'post', photo: -1 })) : (raw.items ?? []);
    // A template's small category tiles (Maximize) show up to eight.
    let items: LayoutItem[] = rawItems.slice(0, raw.look === 'small' || raw.look === 'circles' ? 8 : Math.max(maxItems, needs.categories ? 4 : 0)).map(item => {
      const out: LayoutItem = { title: clip(item.title, TEXT_CAPS.itemTitle) };
      // Lively one-product parts (spec 2026-11-03): an item over its cap goes whole, never cut mid-word (an empty title is dropped below).
      if (liveCap && String(item.title ?? '').replace(/\s+/g, ' ').trim().length > liveCap) out.title = '';
      const text = clip(item.text, TEXT_CAPS.itemText); if (text) out.text = text;
      if (item.icon && (LIBRARY_ICON_NAMES as readonly string[]).includes(item.icon)) out.icon = item.icon;
      if (section.id === 'compare-table') out.value = item.value === 'yes' ? 'yes' : 'no';
      // A sticker (promo-lines) or a pill (perks-rows): a few words, and every number in it one the merchant wrote.
      if (TAGGED.has(section.id)) { const tag = clip(item.value, 22); if (tag && (tag.match(/\d+/g) ?? []).every(number => new RegExp(`(?<!\\d|\\d[.,])${number}(?!\\d|[.,]\\d)`).test(backedWords))) out.value = tag; }
      // A percentage ring shows only a number the merchant wrote («94%»).
      if (section.id === 'stats-rings') {
        // Rings: a percentage the merchant wrote («94%»). Boxes (Maximize): any figure the merchant wrote («500+», «4.8», «30 días»).
        const n = String(item.value ?? '').replace(/[^\d]/g, '');
        if (raw.look === 'boxes') { const figure = String(item.value ?? '').trim().slice(0, 12); const digits = figure.match(/\d+(?:[.,]\d+)?/)?.[0]; if (digits && merchantWords.includes(digits)) out.value = figure; }
        else if (n && new RegExp(`\\b${n}\\s*(%|por ciento)`).test(merchantWords)) out.value = n;
      }
      if (itemPhoto) { const photo = photoOf(item.photo, needs.categories ? String(item.title ?? '') : undefined); if (photo) out.photo = photo; }
      if (itemPhoto || section.id === 'promo-trio' || section.id === 'perks-rows') { const target = link(item.link); if (target) out.link = target; }
      if ((needs.pins || needs.spots) && Number(item.x) >= 0 && Number(item.y) >= 0) { out.x = Math.round(Math.min(94, Math.max(6, Number(item.x)))); out.y = Math.round(Math.min(94, Math.max(6, Number(item.y)))); }
      return out;
    }).filter(item => item.title);
    // Pins name real products; press is only the outlets and words the merchant wrote.
    // Pins name real products; items without a pin are the points beside the photo (Shrine's look side).
    if (needs.pins) items = items.filter(item => item.x === undefined || productByName.has(fold(item.title))).map(item => item.x === undefined ? item : ({ ...item, title: productByName.get(fold(item.title))!.name }));
    // Every number in a pill, chip or note is one the store wrote as a whole number (not digits inside a fee or a phone); a hotspot needs its point.
    if (liveCap) items = items.filter(entry => (entry.title.match(/\d+/g) ?? []).every(number => new RegExp(`(?<!\\d|\\d[.,])${number}(?!\\d|[.,]\\d)`).test(backedWords)));
    if (needs.spots) items = items.filter(entry => entry.x !== undefined).map(({ title, x, y }) => ({ title, x: x!, y: y! }));
    if (section.id === 'stats-rings') items = items.filter(item => item.value);
    // A marquee of outlet names (Symmetry) needs only the names; quotes must be the merchant's own words too.
    if (needs.press) items = items.filter(item => merchantWords.includes(fold(item.title)) && ((raw.look === 'marquee' || raw.look === 'row') || (Boolean(item.text) && merchantWords.includes(fold(item.text!).replace(/[«»"“”.]/g, '').trim()))));
    if (section.id === 'promo-trio' && !single) items = items.filter(item => item.photo);
    if (section.id === 'categories-list') items = items.filter(item => categoryByName.has(fold(item.title))).map(item => ({ ...item, title: categoryByName.get(fold(item.title))!, link: `category:${categoryByName.get(fold(item.title))}` }));
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
    if (needs.product || raw.template?.product) { const found = productById.get(String(raw.product ?? '')) ?? productByName.get(fold(String(raw.product ?? ''))); if (found) block.product = found.id; }
    // The colour cards always draw the store's own product (premium landing 2026-11-03).
    if (section.id === 'variant-cards' && !block.product && facts.products[0]) block.product = facts.products[0].id;
    // A one-product home (2026-11-02): the product on top is the store's own even when the answer named none.
    if (section.id === 'product-hero' && !block.product && facts.products[0]) block.product = facts.products[0].id;
    if (needs.code || section.id === 'cover-half') { const code = facts.codes.find(entry => fold(entry.code) === fold(String(raw.code ?? ''))); if (code) block.code = code.code; }
    if (section.id === 'visit-store' && facts.location && !block.title) block.title = facts.location.name;
    if (needs.social && facts.social) { block.handle = facts.social.handle; block.social = facts.social.url; }
    if (needs.date) { const ends = libraryOfferEnd(raw.endsAt, merchantWords, now); if (ends) block.endsAt = ends; }
    // Needs met, or the block goes (and gives its photos back).
    const photos = [block.photo, block.photo2].filter(Boolean).length;
    const ok = photos >= (photoless ? 0 : Math.min(needs.photos ?? 0, 2)) && (block.items?.length ?? 0) >= minItems && (!needs.itemPhotos || (block.items ?? []).filter(item => item.photo).length >= needs.itemPhotos)
      && (!needs.products || Boolean(block.products)) && (!needs.product || Boolean(block.product)) && (!needs.code || Boolean(block.code))
      && (section.id !== 'statement-inline' || ((block.title ?? '').split(' ').length >= 4 && Boolean(block.photo)))
      && (section.id !== 'cover-poster' || Boolean(block.title)) && (section.role !== 'cover' || Boolean(block.title))
      && (!needs.text || Boolean(block.text)) && (!needs.date || Boolean(block.endsAt)) && (!single || Boolean(block.photo))
      && (section.id !== 'promo-trio' || single || (block.items?.length ?? 0) >= 3) && (section.id !== 'bar-note' || Boolean(block.title)) && (!besidePhoto || Boolean(block.photo));
    if (!ok) {
      for (const at of [...used]) if (!before.has(at)) used.delete(at);
      for (const [at, places] of spots) spots.set(at, places.filter(place => place !== here));
      continue;
    }
    // Owner rule (no dark band of words alone): accent and deep only behind a photo or products.
    // Product cards are drawn for a light ground (Oh Belly live 2026-10-31: names and prices vanished on a deep grid band).
    if ((block.band === 'deep' || block.band === 'accent') && ['products-grid', 'products-tabs', 'products-cards', 'products-spotlight', 'products-lookbook'].includes(section.id)) delete block.band;
    if ((block.band === 'deep' || block.band === 'accent') && !block.photo && !block.products && !block.product && !(block.items ?? []).some(item => item.photo) && section.id !== 'categories-tiles' && !section.decor) delete block.band;
    blocks.push(block);
  }
  return fixedMode ? blocks : frameLayout(blocks, facts, used);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** A countdown runs only to a date the merchant wrote («hasta el 15 de noviembre»): the model's ISO date must be ahead (within 120
 *  days) and its day and month must appear in the merchant's own words. */
export function libraryOfferEnd(value: unknown, merchantWords: string, now: number): string | undefined {
  const at = Date.parse(String(value ?? ''));
  if (!Number.isFinite(at) || at <= now || at - now > 120 * 86_400_000) return undefined;
  // The day as written: a bare date («2026-11-30») is that day; a time in La Paz is read there (UTC-4).
  const days = [new Date(at), new Date(at - 4 * 3_600_000)];
  const named = days.some(date => new RegExp(`\\b${date.getUTCDate()}\\s*(de\\s+)?${MONTHS[date.getUTCMonth()]}`).test(merchantWords) || new RegExp(`\\b${date.getUTCDate()}/${date.getUTCMonth() + 1}\\b`).test(merchantWords));
  return named ? new Date(/T\d/.test(String(value)) ? at : at + 28 * 3_600_000 - 60_000).toISOString() : undefined;
}

const defaultCard = (facts: LibraryFacts) => facts.tone === 'bold' ? 'soft' : 'classic';

/** Owner 2026-11-02 («drop unfilled sections»; Brisa Portátil kept Conecta's «Nuestras marcas» and made-up brands when the library
 *  call kept too few blocks): a template home keeps only what was filled with the store's own words and photos. Without a filled
 *  cover it gets one from the store's name, what it sells and its first photo; without a product row, the live product grid. */
export function withoutDemoWords(filled: LayoutBlock[], template: LayoutBlock[], facts: LibraryFacts): LayoutBlock[] {
  const out = [...filled];
  const photo = facts.photos[0]?.url;
  // A one-product template: its product on top is the cover, and it is never missing.
  if (template.some(block => block.type === 'product-hero') && facts.products[0]) {
    if (!out.some(block => block.type === 'product-hero')) out.unshift({ type: 'product-hero', product: facts.products[0].id });
    return out;
  }
  if (!out.some(block => BY_ID.get(block.type)?.role === 'cover') && photo) {
    // The template's own cover when a title, words and one photo are all it needs; else the split cover, which takes any photo.
    const own = template.find(block => BY_ID.get(block.type)?.role === 'cover');
    const needs = own ? BY_ID.get(own.type)?.needs : undefined;
    const simple = own && needs && (needs.photos ?? 0) <= 1 && !(needs.items?.[0]) && !needs.itemPhotos && !needs.products && !needs.code && needs.mood !== 'bold';
    const text = clip(String(facts.what || facts.story).split(/(?<=[.!?])\s/)[0], TEXT_CAPS.text);
    out.unshift({ type: simple ? own!.type : 'cover-split', ...(simple && own!.look ? { look: own!.look } : {}), ...(simple && own!.band ? { band: own!.band } : {}),
      title: clip(facts.storeName, TEXT_CAPS.title), ...(text ? { text } : {}), cta: 'Ver productos', link: 'products', photo });
  }
  if (facts.products.length && !out.some(block => ['products-grid', 'products-tabs', 'products-slider'].includes(block.type))) {
    const at = out.findIndex(block => BY_ID.get(block.type)?.role === 'cover') + 1;
    out.splice(at, 0, { type: 'products-grid', title: facts.products.length === 1 ? facts.products[0].name.slice(0, TEXT_CAPS.title) : 'Productos', card: defaultCard(facts) });
  }
  return out;
}

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
  items: Array<{ id: string; name: string; categoryId?: string | null; amount?: unknown; imageUrls?: string[]; description?: string | null }>;
  categories: Array<{ id: string; name: string }>;
  locations?: Array<{ name: string; address?: string; pickupEnabled?: boolean; openingHours?: Array<{ day: number; open: string; close: string; closed: boolean }> }>;
  shippingEnabled?: boolean; shippingPickupEnabled?: boolean; contactPhone?: string | null;
  /** The merchant's other uploads (newest first): brand and lifestyle photos the catalogue does not carry. */
  uploads: string[];
  codes: Array<{ code: string; discountType: string; discountValue: number }>;
  reviews: number;
  /** The store's links (label + url): its Instagram or TikTok becomes the social sections' account. */
  links?: Array<{ label: string; url: string }>;
  /** Delivery zones, policies and the assistant's notes, as the merchant wrote them. */
  zones?: Array<{ name: string; fee: number; freeAbove: number | null; estimatedMinutes: number | null }>;
  policies?: Record<string, unknown>;
  assistantNotes?: string;
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
    // Owner 2026-11-02 (Brisa Portátil: «Para llevar / A tu ritmo» instead of its 5 speeds and 4000 mAh): a small catalogue's sections
    // are written from what each product says about itself.
    const about = input.items.length <= 3 ? clip(item.description, 600) : '';
    return { id: item.id, name: item.name, ...(category ? { category } : {}), ...(Number.isFinite(amount) && amount > 0 ? { price: `Bs ${Number.isInteger(amount) ? amount : amount.toFixed(2).replace('.', ',')}` } : {}), ...(about ? { about } : {}) };
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
    ...(librarySocial(input.links) ? { social: librarySocial(input.links)! } : {}),
    ...(libraryNotes(input) ? { notes: libraryNotes(input) } : {}),
  };
}

const money = (cents: number) => `Bs ${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2).replace('.', ',')}`;
const POLICY_NAMES: Record<string, string> = { delivery: 'Entregas', returns: 'Cambios y devoluciones', privacy: 'Privacidad', terms: 'Condiciones' };
/** The merchant's settings in plain lines: each delivery zone's price and time, the written policies, the assistant's notes. */
export function libraryNotes(input: Pick<LibraryStoreInput, 'zones' | 'policies' | 'assistantNotes'>): string {
  const time = (minutes: number | null) => !minutes ? '' : minutes < 120 ? `, en unos ${minutes} minutos` : minutes < 2880 ? `, en ${Math.round(minutes / 60)} horas` : `, en ${Math.round(minutes / 1440)} días`;
  const lines = [
    ...(input.zones ?? []).map(zone => `Envío ${zone.name}: ${zone.fee ? money(zone.fee) : 'gratis'}${zone.freeAbove ? `, gratis desde ${money(zone.freeAbove)}` : ''}${time(zone.estimatedMinutes)}.`),
    ...Object.entries(input.policies ?? {}).filter(([, text]) => typeof text === 'string' && text.trim()).map(([key, text]) => `${POLICY_NAMES[key] ?? key}: ${String(text).trim()}`),
    ...(input.assistantNotes?.trim() ? [`Notas del comercio: ${input.assistantNotes.trim()}`] : []),
  ];
  return lines.join('\n').slice(0, 2500);
}

/** The store's own Instagram or TikTok account from its links: «@name» and the address. */
export function librarySocial(links: LibraryStoreInput['links']): { handle: string; url: string } | undefined {
  for (const link of links ?? []) {
    const match = /^https?:\/\/(?:www\.)?(instagram\.com|tiktok\.com)\/@?([A-Za-z0-9._]{2,30})\/?(?:[?#].*)?$/i.exec(link.url.trim());
    if (match && !['p', 'reel', 'explore', 'accounts'].includes(match[2].toLowerCase())) return { handle: `@${match[2]}`, url: link.url.trim() };
  }
  return undefined;
}

/** An upload photo's own path (`/v1/uploads/…`), from a path or an absolute link to one; undefined for anything else. */
export const uploadOnly = (url: string) => {
  if (UPLOAD_PHOTO.test(url)) return url;
  try { const path = new URL(url).pathname; return UPLOAD_PHOTO.test(path) ? path : undefined; } catch { return undefined; }
};

/** Fix 3 (2026-11-02): why the store cannot back a section the merchant asked to add — said in the reply, before any model call.
 *  Null when its data needs are met (photos and words are the fill's to find). */
export function librarySectionBlocker(type: string, facts: LibraryFacts): string | null {
  const section = BY_ID.get(type);
  if (!section) return 'esa sección no está en mi biblioteca';
  const needs = section.needs;
  if (needs.reviews && facts.reviews <= 0) return 'aún no tienes reseñas publicadas';
  if (needs.location && !facts.location) return 'falta la dirección de tu tienda en Ajustes';
  if (needs.social && !facts.social) return 'falta enlazar tu Instagram o TikTok en los enlaces de tu tienda';
  if (needs.code && !facts.codes.length) return 'no tienes un código de descuento activo que se muestre en la tienda';
  if (needs.categories && facts.categories.length < needs.categories) return `necesita al menos ${needs.categories} categorías con productos`;
  if (needs.services && facts.services.length < 2) return 'aún no tienes envío ni recojo configurados';
  if (needs.mood === 'bold' && facts.tone !== 'bold') return 'va solo con marcas atrevidas';
  if (needs.pair && !/\bantes\b/.test(fold(`${facts.what} ${facts.story} ${facts.request}`))) return 'necesito que me cuentes qué cambia antes y después, y las dos fotos';
  if (needs.products && facts.products.length < needs.products[0]) return `necesita al menos ${needs.products[0]} productos`;
  if (needs.product && !facts.products.length) return 'aún no tienes productos';
  if ((needs.photos ?? 0) + (needs.itemPhotos ?? 0) > facts.photos.length) return 'no me alcanzan las fotos de tu tienda';
  return null;
}

/** Fix 6 (2026-11-02, goodProtein #12: the switch to Zancada dropped the FAQ): the sections a store had that its new template has
 *  not — the ones added after the old template (not part of its own home) and the questions, whose answers are the merchant's
 *  facts. Covers, main grids, closings and decoration stay with their template. */
export function carriedSections(oldLayout: readonly LayoutBlock[], oldTemplate: readonly LayoutBlock[], newLayout: readonly LayoutBlock[]): LayoutBlock[] {
  const own = new Set(oldTemplate.map(block => block.type));
  const there = new Set(newLayout.map(block => block.type));
  const seen = new Set<string>();
  return oldLayout.filter(block => {
    const section = BY_ID.get(block.type);
    if (!section || section.role === 'cover' || section.role === 'closing' || section.decor || ['products-grid', 'products-tabs', 'bar-note'].includes(block.type)) return false;
    if (there.has(block.type) || seen.has(block.type) || (own.has(block.type) && block.type !== 'faq-split')) return false;
    seen.add(block.type);
    return true;
  }).map(block => ({ ...block, ...(block.items ? { items: block.items.map(item => ({ ...item })) } : {}) }));
}

/** The carried sections put back on the new home, before its closing (or at the end), keeping their own order. */
export function withCarriedSections(layout: readonly LayoutBlock[], carried: readonly LayoutBlock[]): LayoutBlock[] {
  if (!carried.length) return [...layout];
  const last = layout.at(-1);
  const at = last && BY_ID.get(last.type)?.role === 'closing' ? layout.length - 1 : layout.length;
  return [...layout.slice(0, at), ...carried, ...layout.slice(at)];
}

/** Why a section the store could back on paper still did not survive the fill (the merchant's reply). */
export function libraryDropReason(type: string): string {
  return BY_ID.get(type)?.needs.date ? 'dime hasta qué fecha dura la oferta' : 'no me alcanzaron los datos o las fotos de tu tienda';
}
