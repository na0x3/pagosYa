import { sectionCompositions, SKETCH_COMPONENT_REGISTRY } from '@pagosya/shared-types';
import { structuredOutputSchema } from '../design-engine/structured-output';
import { CONTENT_GENERATION_GUIDE } from '../design-engine/design-prompts';
import { SOURCE_FONT_CATALOG, SOURCE_FONT_IDS } from '../source-font-catalog';
import { SOURCE_PRODUCT_PAGE_STYLES } from '../source-dna';
import { SOURCE_ICON_NAMES } from '../source-asset-library';
import { sourceResponseJson } from '../source-response';
import { drawSketchDirection, type SketchDirection } from './sketch-direction';
import { repairSketch, SKETCH_BLOCK_TYPES, SKETCH_STYLE_OPTIONS, SKETCH_WIDTHS } from './sketch-schema';
import { PRESET_IDS, PRODUCT_CARD_PRESETS } from '../source-product-card-presets';
import { ASSURANCE_ICONS } from '../product-theme';
import type { PageStructure } from './sketch-structure-draw';
import type { CatalogueDigest } from './sketch-catalogue-digest';
import type { SketchContext, SketchStyle, StoreSketch } from './sketch-schema';

/** The provider-facing side of sketch generation: a strict schema, a compact prompt, and a total
 * conversion — any response, including none at all, becomes a usable sketch via repairSketch. */

const string = { type: 'string' } as const;
const bg = { type: 'string', enum: ['paper', 'ink', 'accent', 'deep', 'pop', 'spot', 'wash', 'mid', 'tint-accent', 'tint-deep', 'tint-pop'] } as const;
const size = { type: 'string', enum: ['s', 'm', 'l', 'xl'] } as const;
const width = { type: 'string', enum: [...SKETCH_WIDTHS] } as const;
const alignment = { type: 'string', enum: ['start', 'center', 'end'] } as const;
const bool = { type: 'boolean' } as const;
const block = (type: string, props: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false,
  // Layout controls every block accepts. Strict mode requires every property in `required`, so the inert values
  // ('bleed', 'start', false) are how the model says "leave this alone" — repair drops them.
  properties: { id: string, type: { type: 'string', enum: [type] }, bg, size, width, nav: string, align: alignment, flip: bool, swap: bool, composition: { type: 'string', enum: ['auto', ...sectionCompositions(type)] }, ...props },
  required: ['id', 'type', 'bg', 'size', 'width', 'nav', 'align', 'flip', 'swap', 'composition', ...Object.keys(props)],
});

export const SKETCH_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    palette: { type: 'object', additionalProperties: false, properties: { paper: string, ink: string, accent: string, deep: string, pop: string, spot: string, wash: string, mid: string }, required: ['paper', 'ink', 'accent', 'deep', 'pop', 'spot', 'wash', 'mid'] },
    fonts: { type: 'object', additionalProperties: false, properties: { display: string, text: string }, required: ['display', 'text'] },
    scale: size,
    // The page's shape language. 'auto' defers to the direction drawn for this generation, so the model only
    // overrides the dimensions it has an opinion about (strict mode has no optional properties).
    style: { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Object.entries(SKETCH_STYLE_OPTIONS).map(([key, values]) => [key, { type: 'string', enum: [...values, 'auto'] }])),
      required: Object.keys(SKETCH_STYLE_OPTIONS) },
    product: { type: 'object', additionalProperties: false, properties: {
      preset: { type: 'string', enum: [...PRESET_IDS] },
      layout: { type: 'string', enum: [...SOURCE_PRODUCT_PAGE_STYLES] },
      media: { type: 'string', enum: ['left', 'right'] },
      assurances: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: { type: 'string', enum: [...ASSURANCE_ICONS] }, title: string, detail: string }, required: ['icon', 'title', 'detail'] } },
    }, required: ['preset', 'layout', 'media', 'assurances'] },
    account: { type: 'object', additionalProperties: false, properties: { layout: { type: 'string', enum: ['split', 'center'] }, kicker: string, title: string, lead: string, perks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, text: string }, required: ['icon', 'text'] } }, photo: string, bg }, required: ['layout', 'kicker', 'title', 'lead', 'perks', 'photo', 'bg'] },
    blocks: { type: 'array', maxItems: 20, items: { anyOf: [
      block('announce', { left: string, right: string }),
      block('split', { kicker: string, headline: string, body: string, cta: string, cta2: string, href: string, pills: { type: 'array', items: string }, stats: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { value: string, label: string }, required: ['value', 'label'] } }, boxes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, title: string, text: string }, required: ['icon', 'title', 'text'] } }, sticker: string, tag: string, photo: string }),
      block('hero', { photos: { type: 'array', maxItems: 4, items: string }, variant: { type: 'string', enum: ['photo-right', 'full-bleed', 'stacked'] }, headline: string, sub: string, cta: string, cta2: string, trust: string, badge: string, note: string, sticker: string, caption: string, photo: string }),
      block('steps', { kicker: string, title: string, note: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, title: string, text: string }, required: ['icon', 'title', 'text'] } } }),
      block('marquee', { text: string, glyph: { type: 'string', enum: ['·', '✦', '•', '◆', '★'] } }),
      block('catalog', { kicker: string, title: string, seeAll: string, badges: { type: 'array', items: string }, stripLeft: string, stripRight: string, cardRatio: { type: 'string', enum: ['4-3', '1-1', '3-4'] }, cardDesc: { type: 'boolean' }, cardAdd: { type: 'boolean' } }),
      block('collections', { kicker: string, title: string, note: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: string, text: string, photo: string, href: string }, required: ['title', 'text', 'photo', 'href'] } } }),
      block('story', { kicker: string, title: string, paragraphs: { type: 'array', items: string }, photo: string }),
      block('reviews', { kicker: string, title: string, ratingValue: string, ratingSource: string, handle: string, quotes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { text: string, name: string, place: string }, required: ['text', 'name', 'place'] } }, photos: { type: 'array', items: string } }),
      block('faq', { kicker: string, title: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { q: string, a: string }, required: ['q', 'a'] } } }),
      block('banner', { kicker: string, headline: string, cta: string, href: string, sticker: string }),
      block('gallery', { kicker: string, title: string, photos: { type: 'array', items: string } }),
      block('newsletter', { kicker: string, variant: { type: 'string', enum: ['center', 'split'] }, form: { type: 'string', enum: ['pill', 'stacked', 'underline', 'card'] }, title: string, note: string, cta: string, photo: string }),
      block('footer', { tagline: string, wordmark: { type: 'string', enum: ['giant', 'plain'] } }),
    ] } },
  },
  required: ['palette', 'fonts', 'scale', 'style', 'product', 'account', 'blocks'],
} as { type: 'object'; additionalProperties: false; properties: Record<string, any>; required: string[] };

/** One product as a line the model can quote: only what the digest actually carries. Prices arrive already
 * formatted ("45.00 BOB"), so they are printed as they are. */
function productLine(item: CatalogueDigest['items'][number]): string {
  const parts = [
    item.name,
    item.price ? (item.discountPercent ? `${item.price} (-${item.discountPercent}%)` : item.price) : undefined,
    item.soldOut ? 'agotado' : undefined,
    item.category,
    item.description,
    item.options?.length ? `opciones: ${item.options.join(' / ')}` : undefined,
    item.facts?.length ? `datos: ${item.facts.join('; ')}` : undefined,
    item.tags?.length ? `etiquetas: ${item.tags.join(', ')}` : undefined,
  ];
  return `- ${parts.filter(Boolean).join(' · ')}`;
}

/** The catalogue used to be declared one block's business ("el bloque catalog los muestra solo"), so every other
 * band was written from the brief alone and came out as virtue copy about nothing. Here it is the subject of the
 * whole page; and a store with no products is told to say little truthfully rather than fill bands with mood. */
function catalogueLines(catalogue: CatalogueDigest, mode: 'page' | 'edit'): string[] {
  const { totals, items } = catalogue;
  if (!totals.count) {
    return [mode === 'page'
      ? 'Todavía no hay productos cargados. Escribí una página CORTA y honesta: la tienda está por abrir. NO inventes una selección, un catálogo curado, productos ni reseñas de clientes que no existen. Decir poco con verdad es mejor que llenar bandas con humo.'
      : 'Todavía no hay productos cargados: no inventes productos, una selección ni reseñas.'];
  }
  const range = totals.priceLow && totals.priceHigh ? `, de ${totals.priceLow} a ${totals.priceHigh}` : '';
  const categories = totals.categories.length ? `; categorías: ${totals.categories.join(', ')}` : '';
  const head = `LO QUE ESTA TIENDA VENDE (${totals.count} productos${range}${categories}${items.length < totals.count ? `; acá van ${items.length} de muestra` : ''}):`;
  if (mode === 'edit') return [head, ...items.map(productLine), 'Si el texto menciona productos, que sean estos; nada de relleno que valdría para cualquier tienda.'];
  return [
    CONTENT_GENERATION_GUIDE,
    head,
    ...items.map(productLine),
    'ESTO ES EL TEMA DE TODA LA PÁGINA, no sólo del bloque catalog. Cada banda con texto tiene que decir algo que sólo esta tienda podría decir: nombrá un producto, una categoría, un precio, un material, una opción. El story usa sólo datos conocidos; no inventes procesos, materiales ni políticas. Un FAQ sin datos debe explicar cómo explorar el catálogo. El banner invita a ver productos sin inventar urgencia.',
    'PROHIBIDO el relleno de virtud, que sería verdad en cualquier tienda: nada de "calidad que se nota", "hecho con amor", "una selección pensada", "objetos que conversan entre sí". Si no sabés algo concreto sobre un producto, escribí menos, no escribas humo.',
  ];
}

export function sketchPrompt(input: { storeName: string; purpose: 'shop' | 'service'; instruction: string; brief: unknown; photos: Array<{ path: string; description?: string }>; catalogue: CatalogueDigest; direction?: SketchDirection; structure: PageStructure }): string {
  const direction = input.direction ?? drawSketchDirection();
  return [
    `Tienda: ${input.storeName} (${input.purpose === 'shop' ? 'vende productos' : 'ofrece servicios'}).`,
    `Pedido del comercio: ${input.instruction}`,
    `Brief: ${JSON.stringify(input.brief)}`,
    ...catalogueLines(input.catalogue, 'page'),
    input.photos.length
      ? `Fotos disponibles (usa EXACTAMENTE estas rutas, nunca inventes otras). Asigná las fotos por rol y composición, sin repetirlas por obligación. Packshots para productos; fotografía de ambiente para heroes y narrativa. hero.photos contiene imágenes adicionales para floating-media o collage: ${input.photos.map(photo => photo.description ? `${photo.path} (${photo.description})` : photo.path).join(' · ')}`
      : 'No hay fotos subidas: deja photo como "" y photos como [].',
    // The skeleton is data, not advice: every earlier attempt to steer the page's shape through prose converged on one answer.
    'LA PÁGINA YA TIENE SU FORMA. Estas son sus bandas, en orden. Llená cada una con contenido real usando su id. NO inventes bandas: cualquier bloque con un id que no esté en esta lista se descarta. Si una banda no tenés con qué llenarla honestamente, omitila y la página se cierra sola.',
    ...input.structure.slots.map(slot => `- ${slot.id}: ${slot.type} · tamaño ${slot.size} · ancho ${slot.width}${slot.media ? ' · lleva foto' : ''}`),
    'El color apoya la dirección global: no hay cantidad mínima de bandas saturadas. Usa escala, composición y fotografía para crear ritmo; no alternes fondos por obligación.',
    'Elige sólo secciones útiles para esta marca y sus datos. Prefiere 5–8 secciones fuertes, sin añadir announce, marquee, split ni wordmark sólo porque existen.',
    `Variantes disponibles: ${JSON.stringify(SKETCH_COMPONENT_REGISTRY.map(({ id, type, variant, purpose, needs, mobile }) => ({ id, type, variant, purpose, needs, mobile })))}. composition auto conserva la elección del plan creativo.`,
    `NAVEGACIÓN: nav es la palabra con la que esta banda aparece en el menú de arriba, escrita por vos y con la voz del negocio ("LA IDEA", "CÓMO DISFRUTARLA", "OFERTA"), hasta 24 caracteres. Dejá "" en las bandas que no van al menú y en las que prefieras la etiqueta genérica. Un menú que dice Productos, Colecciones y Nosotros es el mismo menú que tiene cualquier tienda.`,
    `AJUSTES DE CADA BANDA: el tamaño, el ancho y si lleva foto ya vienen en la lista de arriba y no se negocian: copiá en size y width lo que figura ahí. Lo tuyo es align (start, center, end: mueve el texto), flip (espeja la foto en hero, split, story y newsletter) y swap (pone el botón fantasma primero en hero y split). Si no querés tocar algo: align "start", flip false, swap false.`,
    `style es el LENGUAJE DE FORMAS de toda la página: ${Object.entries(SKETCH_STYLE_OPTIONS).map(([key, values]) => `${key} (${values.join('/')})`).join(', ')}. Elegilo para que acompañe al rubro y a la dirección creativa — una carnicería brutalista no lleva botones pill redondeados. Poné "auto" en las dimensiones que no te importen y el diseño las elige.`,
    `DIRECCIÓN CREATIVA DE ESTA GENERACIÓN (${direction.name}) — interprétala con los colores, fuentes y bloques concretos de esta tienda:`,
    ...direction.lines.map(line => `- ${line}`),
    CONTENT_GENERATION_GUIDE,
    'Escribí un hero con jerarquía fuerte y una acción clara. Usa trust, stats, badges y garantías sólo cuando sus datos existan en el comercio; si no, vacíos. Sin números, reseñas ni promesas inventadas.',
    SITE_SHAPE_RULE,
    COLLECTION_HREF_RULE,
    'Kickers, stickers y cajas son opcionales: no llenes todas las bandas de adornos. La densidad y la escala obedecen la dirección de marca. Las secciones deben contar cosas distintas.',
    `Fuentes disponibles (ids exactos): ${SOURCE_FONT_IDS.join(', ')}. Personalidades: ${SOURCE_FONT_CATALOG.slice(0, 12).map(font => `${font.id}=${font.personality.join('/')}`).join('; ')}.`,
    `account es la página de ingreso y registro de clientes (el formulario lo pone la plataforma): kicker y title con la voz de la marca (ej. "Bienvenido de vuelta al laboratorio"), lead de una línea, 3 perks con ícono Lucide y texto corto y honesto (seguir pedidos, guardar direcciones, ofertas primero), layout split o center, photo de las disponibles o "".`,
    `product elige la ficha de producto (la dibuja la plataforma). preset es su piel: ${PRESET_IDS.map(id => `${id} (${PRODUCT_CARD_PRESETS[id].when})`).join('; ')}; elige el que mejor le quede a lo que vende ESTA tienda, plain solo si ninguno encaja. layout es su composición: editorial (equilibrada), dense (especificaciones al lado de la compra), image-led (galería dominante), story-led (texto e historia DEBAJO de la foto), conversion (comida y bebida, suplementos, belleza y cuidado personal, gadgets: la foto con una columna de 3 íconos de beneficios al lado, beneficios con ✓ antes del botón y el precio dentro del botón; úsala por defecto en esos rubros). media pone la foto a la izquierda o a la derecha en escritorio: varía entre tiendas, no uses siempre left. product.assurances: 0-3 garantías REALES y cortas de esta tienda para la ficha (title ≤40, detail ≤80, icon de la lista), p. ej. "Horneado del día · salimos del horno a las 7am". Solo hechos que el comercio pueda cumplir: nada de envíos gratis, plazos o certificaciones inventadas, y nunca menciones pagosYa ni "pago seguro" (la entrega y el pago los añade la plataforma sola). Déjalo [] si no hay nada honesto que decir.`,
    `Íconos: el bloque steps lleva un ícono Lucide por paso (cualquier nombre de lucide.dev, ej.: ${SOURCE_ICON_NAMES.slice(0, 24).join(', ')}).`,
    'Colores en hex #rrggbb con buen contraste. Textos en el idioma solicitado por el comercio, español por defecto; honestos, sin inventar precios ni promesas.',
  ].join('\n');
}

/** A sketch is ONE page plus the platform's fixed pages, and it cannot grow another. Asked for "a page about X" the
 * model used to add a band and then write copy promising an inner page that was never built, so the shopper read
 * about a page that did not exist and the card that offered it led to the catalog. The rule names both halves:
 * build the band, link to it, and describe it as what it is. */
const SITE_SHAPE_RULE = 'EL SITIO ES UNA SOLA PÁGINA más las páginas fijas de la plataforma (productos.html, checkout.html). NO podés crear páginas nuevas. Si el pedido es "que lleve a otra página o pestaña con más detalle", poné ese contenido en una banda de ESTA página y enlazá la tarjeta a esa banda. NUNCA escribas que algo tiene "página propia", "página interna" ni "otra pestaña": nombrá el destino por lo que realmente es.';
const COLLECTION_HREF_RULE = 'collections[].href es a dónde lleva cada tarjeta: "#skb-<id>" de una banda de ESTA página, productos.html o checkout.html. Dejalo "" y la tarjeta usa el destino por defecto. Un ancla que no corresponda a ninguna banda se descarta y la tarjeta queda sin enlace propio, así que escribí el id exacto.';

/** The edit prompt for chat-on-sketch: the whole current sketch travels; the model returns the whole edited sketch. */
export function sketchEditPrompt(input: { sketch: StoreSketch; instruction: string; targetBlockId?: string; photos: Array<{ path: string; description?: string }>; catalogue: CatalogueDigest }): string {
  return [
    'Edita este boceto de tienda y devuelve el boceto COMPLETO actualizado como JSON estricto según el esquema.',
    `Boceto actual: ${JSON.stringify(input.sketch)}`,
    `Pedido del comercio: ${input.instruction}`,
    input.targetBlockId ? `Edita únicamente el bloque ${input.targetBlockId}; conserva los demás sin cambios.` : 'Cambia solo lo que el pedido requiere; conserva el resto sin cambios.',
    input.photos.length ? `Fotos disponibles (solo estas rutas): ${input.photos.map(photo => photo.description ? `${photo.path} (${photo.description})` : photo.path).join(' · ')}` : 'No añadas fotos nuevas.',
    ...catalogueLines(input.catalogue, 'edit'),
    SITE_SHAPE_RULE,
    COLLECTION_HREF_RULE,
    'PALETA: paper, ink, accent, deep y pop son obligatorios. spot, wash y mid son tres colores más que podés usar o dejar en "": spot es un segundo color vivo (un sticker, una marquesina, un botón secundario), wash es un campo claro suave distinto del papel, y mid es un tono intermedio entre accent y deep. Están porque las tiendas con identidad propia usan de diez a dieciséis colores, no cinco. Usalos sólo si esta marca los pide; tres colores sin razón no son una identidad.',
    'Textos honestos en el idioma del comercio, español por defecto; colores hex con buen contraste.',
  ].filter(Boolean).join('\n');
}

export function sketchFromResponse(body: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle; structure?: PageStructure }): { sketch: StoreSketch; notes: string[]; parsed: boolean } {
  let value: unknown;
  try { value = sourceResponseJson(body); } catch { value = undefined; }
  const parsed = structuredOutputSchema(SKETCH_JSON_SCHEMA).safeParse(value).success;
  return { ...repairSketch(parsed ? value : undefined, ctx, defaults), parsed };
}

/** The photos a sketch may show: bundled images whose confirmed role allows display.
 * Reference material, unused uploads and unknown roles never reach a storefront. */
export function sketchPhotoAllowlist(
  assets: Array<{ path: string }>,
  legend: Array<{ original: string; path: string }>,
  uses: Array<{ url: string; role?: string; description?: string }>,
): Array<{ path: string; description?: string }> {
  const FORBIDDEN = new Set(['reference', 'unused', 'unknown']);
  return assets
    .filter(asset => /\.(png|jpe?g|webp|avif)$/i.test(asset.path))
    .flatMap(asset => {
      const original = legend.find(entry => entry.path === asset.path)?.original;
      const use = original ? uses.find(entry => entry.url === original) : undefined;
      if (use?.role && FORBIDDEN.has(use.role)) return [];
      return [{ path: asset.path, ...(use?.description ? { description: use.description } : {}) }];
    });
}
