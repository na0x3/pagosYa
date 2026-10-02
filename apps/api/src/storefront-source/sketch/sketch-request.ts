import { SOURCE_FONT_CATALOG, SOURCE_FONT_IDS } from '../source-font-catalog';
import { sourceResponseJson } from '../source-response';
import { repairSketch, SKETCH_BLOCK_TYPES } from './sketch-schema';
import type { SketchContext, StoreSketch } from './sketch-schema';

/** The provider-facing side of sketch generation: a strict schema, a compact prompt, and a total
 * conversion — any response, including none at all, becomes a usable sketch via repairSketch. */

const string = { type: 'string' } as const;
const bg = { type: 'string', enum: ['paper', 'ink', 'accent', 'deep', 'pop'] } as const;
const size = { type: 'string', enum: ['s', 'm', 'l', 'xl'] } as const;
const block = (type: string, props: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false,
  properties: { id: string, type: { type: 'string', enum: [type] }, bg, size, ...props },
  required: ['id', 'type', 'bg', 'size', ...Object.keys(props)],
});

export const SKETCH_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    palette: { type: 'object', additionalProperties: false, properties: { paper: string, ink: string, accent: string, deep: string, pop: string }, required: ['paper', 'ink', 'accent', 'deep', 'pop'] },
    fonts: { type: 'object', additionalProperties: false, properties: { display: string, text: string }, required: ['display', 'text'] },
    scale: size,
    blocks: { type: 'array', items: { anyOf: [
      block('hero', { variant: { type: 'string', enum: ['photo-right', 'full-bleed', 'stacked'] }, headline: string, sub: string, cta: string, photo: string }),
      block('marquee', { text: string }),
      block('catalog', { kicker: string, title: string }),
      block('story', { title: string, paragraphs: { type: 'array', items: string }, photo: string }),
      block('reviews', { title: string, quotes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { text: string, name: string }, required: ['text', 'name'] } } }),
      block('faq', { title: string, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { q: string, a: string }, required: ['q', 'a'] } } }),
      block('banner', { headline: string, cta: string, href: string }),
      block('gallery', { title: string, photos: { type: 'array', items: string } }),
      block('newsletter', { title: string, note: string, cta: string }),
      block('footer', { tagline: string, wordmark: { type: 'string', enum: ['giant', 'plain'] } }),
    ] } },
  },
  required: ['palette', 'fonts', 'scale', 'blocks'],
} as { type: 'object'; additionalProperties: false; properties: Record<string, any>; required: string[] };

export function sketchPrompt(input: { storeName: string; purpose: 'shop' | 'service'; instruction: string; brief: unknown; photos: Array<{ path: string; description?: string }>; catalogNames: string[] }): string {
  return [
    `Tienda: ${input.storeName} (${input.purpose === 'shop' ? 'vende productos' : 'ofrece servicios'}).`,
    `Pedido del comercio: ${input.instruction}`,
    `Brief: ${JSON.stringify(input.brief)}`,
    input.catalogNames.length ? `Productos reales del catálogo (el bloque catalog los muestra solo): ${input.catalogNames.join(' · ')}` : 'Catálogo aún vacío.',
    input.photos.length
      ? `Fotos disponibles (usa EXACTAMENTE estas rutas, nunca inventes otras): ${input.photos.map(photo => photo.description ? `${photo.path} (${photo.description})` : photo.path).join(' · ')}`
      : 'No hay fotos subidas: no uses los campos photo/photos.',
    `Tipos de bloque: ${SKETCH_BLOCK_TYPES.join(', ')}. Un catálogo y un footer al final. 5-9 bloques, fondos de color variados (paper/accent/deep/pop) al estilo editorial: titulares enormes, secciones con bloques de color intensos, wordmark gigante en el footer.`,
    `Fuentes disponibles (ids exactos): ${SOURCE_FONT_IDS.join(', ')}. Personalidades: ${SOURCE_FONT_CATALOG.slice(0, 12).map(font => `${font.id}=${font.personality.join('/')}`).join('; ')}.`,
    'Colores en hex #rrggbb con buen contraste. Textos en español, honestos, sin inventar precios ni promesas.',
  ].join('\n');
}

export function sketchFromResponse(body: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[] } {
  let parsed: unknown;
  try { parsed = sourceResponseJson(body); } catch { parsed = undefined; }
  return repairSketch(parsed, ctx);
}
