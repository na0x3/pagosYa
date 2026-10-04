import { SOURCE_FONT_CATALOG, SOURCE_FONT_IDS } from '../source-font-catalog';
import { SOURCE_ICON_NAMES } from '../source-asset-library';
import { sourceResponseJson } from '../source-response';
import { drawSketchDirection, type SketchDirection } from './sketch-direction';
import { repairSketch, SKETCH_BLOCK_TYPES, SKETCH_WIDTHS } from './sketch-schema';
import { PRESET_IDS, PRODUCT_CARD_PRESETS } from '../source-product-card-presets';
import { ASSURANCE_ICONS } from '../product-theme';
import type { PageStructure } from './sketch-structure-draw';
import type { SketchContext, SketchStyle, StoreSketch } from './sketch-schema';

/** The provider-facing side of sketch generation: a strict schema, a compact prompt, and a total
 * conversion — any response, including none at all, becomes a usable sketch via repairSketch. */

const string = { type: 'string' } as const;
const bg = { type: 'string', enum: ['paper', 'ink', 'accent', 'deep', 'pop', 'tint-accent', 'tint-deep', 'tint-pop'] } as const;
const size = { type: 'string', enum: ['s', 'm', 'l', 'xl'] } as const;
const width = { type: 'string', enum: [...SKETCH_WIDTHS] } as const;
const alignment = { type: 'string', enum: ['start', 'center', 'end'] } as const;
const bool = { type: 'boolean' } as const;
const block = (type: string, props: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false,
  // Layout controls every block accepts. Strict mode requires every property in `required`, so the inert values
  // ('bleed', 'start', false) are how the model says "leave this alone" — repair drops them.
  properties: { id: string, type: { type: 'string', enum: [type] }, bg, size, width, align: alignment, flip: bool, swap: bool, ...props },
  required: ['id', 'type', 'bg', 'size', 'width', 'align', 'flip', 'swap', ...Object.keys(props)],
});

export const SKETCH_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    palette: { type: 'object', additionalProperties: false, properties: { paper: string, ink: string, accent: string, deep: string, pop: string }, required: ['paper', 'ink', 'accent', 'deep', 'pop'] },
    fonts: { type: 'object', additionalProperties: false, properties: { display: string, text: string }, required: ['display', 'text'] },
    scale: size,
    // The page's shape language. 'auto' defers to the direction drawn for this generation, so the model only
    // overrides the dimensions it has an opinion about (strict mode has no optional properties).
    style: { type: 'object', additionalProperties: false, properties: {
      radius: { type: 'string', enum: ['soft', 'round', 'square', 'auto'] },
      buttons: { type: 'string', enum: ['pill', 'square', 'outline', 'auto'] },
      cards: { type: 'string', enum: ['bleed', 'inset', 'outline', 'auto'] },
      header: { type: 'string', enum: ['left', 'center', 'auto'] },
      footer: { type: 'string', enum: ['columns', 'center', 'auto'] },
    }, required: ['radius', 'buttons', 'cards', 'header', 'footer'] },
    product: { type: 'object', additionalProperties: false, properties: {
      preset: { type: 'string', enum: [...PRESET_IDS] },
      layout: { type: 'string', enum: ['editorial', 'dense', 'image-led', 'story-led'] },
      media: { type: 'string', enum: ['left', 'right'] },
      assurances: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: { type: 'string', enum: [...ASSURANCE_ICONS] }, title: string, detail: string }, required: ['icon', 'title', 'detail'] } },
    }, required: ['preset', 'layout', 'media', 'assurances'] },
    account: { type: 'object', additionalProperties: false, properties: { layout: { type: 'string', enum: ['split', 'center'] }, kicker: string, title: string, lead: string, perks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, text: string }, required: ['icon', 'text'] } }, photo: string, bg }, required: ['layout', 'kicker', 'title', 'lead', 'perks', 'photo', 'bg'] },
    blocks: { type: 'array', maxItems: 20, items: { anyOf: [
      block('announce', { left: string, right: string }),
      block('split', { kicker: string, headline: string, body: string, cta: string, cta2: string, href: string, pills: { type: 'array', items: string }, stats: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { value: string, label: string }, required: ['value', 'label'] } }, boxes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, title: string, text: string }, required: ['icon', 'title', 'text'] } }, sticker: string, tag: string, photo: string }),
      block('hero', { variant: { type: 'string', enum: ['photo-right', 'full-bleed', 'stacked'] }, headline: string, sub: string, cta: string, cta2: string, trust: string, badge: string, note: string, sticker: string, caption: string, photo: string }),
      block('steps', { kicker: string, title: string, note: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { icon: string, title: string, text: string }, required: ['icon', 'title', 'text'] } } }),
      block('marquee', { text: string, glyph: { type: 'string', enum: ['·', '✦', '•', '◆', '★'] } }),
      block('catalog', { kicker: string, title: string, seeAll: string, badges: { type: 'array', items: string }, stripLeft: string, stripRight: string, cardRatio: { type: 'string', enum: ['4-3', '1-1', '3-4'] }, cardDesc: { type: 'boolean' }, cardAdd: { type: 'boolean' } }),
      block('collections', { kicker: string, title: string, note: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: string, text: string, photo: string }, required: ['title', 'text', 'photo'] } } }),
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

export function sketchPrompt(input: { storeName: string; purpose: 'shop' | 'service'; instruction: string; brief: unknown; photos: Array<{ path: string; description?: string }>; catalogNames: string[]; direction?: SketchDirection; structure?: PageStructure }): string {
  const direction = input.direction ?? drawSketchDirection();
  return [
    `Tienda: ${input.storeName} (${input.purpose === 'shop' ? 'vende productos' : 'ofrece servicios'}).`,
    `Pedido del comercio: ${input.instruction}`,
    `Brief: ${JSON.stringify(input.brief)}`,
    input.catalogNames.length ? `Productos reales del catálogo (el bloque catalog los muestra solo): ${input.catalogNames.join(' · ')}` : 'Catálogo aún vacío.',
    input.photos.length
      ? `Fotos disponibles (usa EXACTAMENTE estas rutas, nunca inventes otras). REPÁRTELAS como una revista, nunca un muro de fotos: una en el hero, una por cada split, story y newsletter, una por categoría de collections y hasta 3 de clientes en reviews; gallery solo como tira corta de máximo 5: ${input.photos.map(photo => photo.description ? `${photo.path} (${photo.description})` : photo.path).join(' · ')}`
      : 'No hay fotos subidas: deja photo como "" y photos como [].',
    ...(input.structure ? [
      // The skeleton is data, not advice: every earlier attempt to steer the page's shape through prose converged on one answer.
      'LA PÁGINA YA TIENE SU FORMA. Estas son sus bandas, en orden. Llená cada una con contenido real usando su id. NO inventes bandas: cualquier bloque con un id que no esté en esta lista se descarta. Si una banda no tenés con qué llenarla honestamente, omitila y la página se cierra sola.',
      ...input.structure.slots.map(slot => `- ${slot.id}: ${slot.type} · tamaño ${slot.size} · ancho ${slot.width}${slot.media ? ' · lleva foto' : ''}`),
    ] : [`Tipos de bloque: ${SKETCH_BLOCK_TYPES.join(', ')}. Un catálogo y un footer al final.`]),
    'COLOR DE VERDAD: mínimo 3 bloques con fondo accent, deep o pop, y usa los fondos tint-accent/tint-deep/tint-pop (pasteles derivados de tu paleta) para bandas suaves entre bandas saturadas. Nunca dos bloques seguidos con el mismo fondo.',
    `FORMA DE CADA BANDA (esto es lo que hace que dos tiendas no se parezcan): width elige el ancho del contenido — bleed (de borde a borde, como siempre), wide (contenido centrado y ancho), narrow (columna editorial angosta, ideal para story y faq), offset-left / offset-right (contenido a un lado y aire al otro). VARÍA el ancho entre bandas vecinas: un muro de bleed es exactamente el boceto genérico que no queremos. align mueve el texto (start, center, end). flip espeja la foto en hero, split, story y newsletter. swap pone el botón fantasma primero en hero y split. Si no querés tocar algo: width "bleed", align "start", flip false, swap false.`,
    `style es el LENGUAJE DE FORMAS de toda la página: radius (soft/round/square), buttons (pill/square/outline), cards (bleed/inset/outline), header (left/center), footer (columns/center). Elegilo para que acompañe al rubro y a la dirección creativa — una carnicería brutalista no lleva botones pill redondeados. Poné "auto" en las dimensiones que no te importen y el diseño las elige.`,
    `DIRECCIÓN CREATIVA DE ESTA GENERACIÓN (${direction.name}) — interprétala con los colores, fuentes y bloques concretos de esta tienda:`,
    ...direction.lines.map(line => `- ${line}`),
    `Si hay hero: titular de 4-8 palabras con carácter, foto cuando haya, cta + cta2 (botón fantasma), trust con prueba social honesta (ej. "★ 4.8 · 2.400 pedidos · Envíos a todo el país") y caption corto bajo la foto (ej. "Caramelo salado · chispas · brownie").`,
    `VISTE CADA SECCIÓN (esto hace la página llena, no vacía): kicker corto y con voz en split, steps, collections, story, reviews, gallery, faq, newsletter y banner (sin símbolos: el ✦ lo pone el diseño; ej. "TU CAJA, TUS REGLAS"). En split además un tag de 2-4 palabras sobre la foto (ej. "CRUJIENTE + RELLENO"). Al menos un split lleva boxes: 2 cajitas de color con title corto y text de una línea (ej. "Regalos corporativos" · "Desde 25 cajas"; "Eventos" · "Mesas dulces y catering"). En steps y collections una note corta alineada a la derecha del título (ej. "Envíos martes a jueves · retiro en tienda"). En reviews cada cita lleva place (barrio o ciudad). Titulares tipo frase, con punto final.`,
    `Detalles cuando la energía lo pida: catalog con seeAll (ej. "VER TODO →"), collections con 2-3 categorías con foto, un split con stats honestos (peso, horas, ingredientes) y pills con variantes u ofertas reales, reviews con ratingValue/ratingSource solo si son reales, newsletter variant split con foto cuando haya foto libre.`,
    `Fuentes disponibles (ids exactos): ${SOURCE_FONT_IDS.join(', ')}. Personalidades: ${SOURCE_FONT_CATALOG.slice(0, 12).map(font => `${font.id}=${font.personality.join('/')}`).join('; ')}.`,
    `account es la página de ingreso y registro de clientes (el formulario lo pone la plataforma): kicker y title con la voz de la marca (ej. "Bienvenido de vuelta al laboratorio"), lead de una línea, 3 perks con ícono Lucide y texto corto y honesto (seguir pedidos, guardar direcciones, ofertas primero), layout split o center, photo de las disponibles o "".`,
    `product elige la ficha de producto (la dibuja la plataforma). preset es su piel: ${PRESET_IDS.map(id => `${id} (${PRODUCT_CARD_PRESETS[id].when})`).join('; ')}; elige el que mejor le quede a lo que vende ESTA tienda, plain solo si ninguno encaja. layout es su composición: editorial (equilibrada), dense (especificaciones al lado de la compra), image-led (galería dominante), story-led (texto e historia DEBAJO de la foto). media pone la foto a la izquierda o a la derecha en escritorio: varía entre tiendas, no uses siempre left. product.assurances: 0-3 garantías REALES y cortas de esta tienda para la ficha (title ≤40, detail ≤80, icon de la lista), p. ej. "Horneado del día · salimos del horno a las 7am". Solo hechos que el comercio pueda cumplir: nada de envíos gratis, plazos o certificaciones inventadas, y nunca menciones pagosYa ni "pago seguro" (la entrega y el pago los añade la plataforma sola). Déjalo [] si no hay nada honesto que decir.`,
    `Íconos: el bloque steps lleva un ícono Lucide por paso (cualquier nombre de lucide.dev, ej.: ${SOURCE_ICON_NAMES.slice(0, 24).join(', ')}).`,
    'Colores en hex #rrggbb con buen contraste. Textos en español, honestos, sin inventar precios ni promesas.',
  ].join('\n');
}

/** The edit prompt for chat-on-sketch: the whole current sketch travels; the model returns the whole edited sketch. */
export function sketchEditPrompt(input: { sketch: StoreSketch; instruction: string; targetBlockId?: string; photos: Array<{ path: string; description?: string }>; catalogNames: string[] }): string {
  return [
    'Edita este boceto de tienda y devuelve el boceto COMPLETO actualizado como JSON estricto según el esquema.',
    `Boceto actual: ${JSON.stringify(input.sketch)}`,
    `Pedido del comercio: ${input.instruction}`,
    input.targetBlockId ? `Edita únicamente el bloque ${input.targetBlockId}; conserva los demás sin cambios.` : 'Cambia solo lo que el pedido requiere; conserva el resto sin cambios.',
    input.photos.length ? `Fotos disponibles (solo estas rutas): ${input.photos.map(photo => photo.description ? `${photo.path} (${photo.description})` : photo.path).join(' · ')}` : 'No añadas fotos nuevas.',
    input.catalogNames.length ? `Productos reales: ${input.catalogNames.join(' · ')}` : '',
    'Textos honestos en español; colores hex con buen contraste.',
  ].filter(Boolean).join('\n');
}

export function sketchFromResponse(body: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle; structure?: PageStructure }): { sketch: StoreSketch; notes: string[]; parsed: boolean } {
  let value: unknown;
  try { value = sourceResponseJson(body); } catch { value = undefined; }
  const parsed = typeof value === 'object' && value !== null;
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
