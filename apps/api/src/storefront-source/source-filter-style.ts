/** Spec 2026-10-21 sort & filter styles: the catalogue's filter style (config.js filterStyle), read by the kit
 *  (commerce-src/catalog/filters.js). Esencial rolls it with the dice; a YAPI-coded store gets one seeded by its id, kept
 *  across saves, and the merchant's words can change it. */
import { createHash } from 'node:crypto';
import { patchConfigFile, readConfigFile } from './store-look';

export const FILTER_STYLES = ['bar', 'chips', 'sidebar', 'browse'] as const;
export type FilterStyle = typeof FILTER_STYLES[number];
export const isFilterStyle = (value: unknown): value is FilterStyle => (FILTER_STYLES as readonly unknown[]).includes(value);
/** Browse (spec 2026-11-06, the Nike shop page) is asked for or picked for colour photos, never seeded: a store keeps its seed. */
export const SEEDED_FILTER_STYLES = ['bar', 'chips', 'sidebar'] as const;

export function seededFilterStyle(storeId: string): FilterStyle {
  return SEEDED_FILTER_STYLES[createHash('sha256').update(`filters:${storeId}`).digest().readUInt32BE(0) % SEEDED_FILTER_STYLES.length];
}

type ColourVariant = { name?: unknown; imageUrl?: unknown; imageUrls?: unknown };
/** Whether a product shows a colour strip in a browse catalogue (the kit's cardSwatches): two named options or more, each first
 *  photo its own. */
export function carriesColourPhotos(items: ReadonlyArray<{ variants?: unknown }>): boolean {
  return items.some(item => {
    const photos = new Set<string>();
    for (const variant of (Array.isArray(item.variants) ? item.variants : []) as ColourVariant[]) {
      const first = Array.isArray(variant?.imageUrls) && typeof variant.imageUrls[0] === 'string' ? variant.imageUrls[0] : variant?.imageUrl;
      if (typeof first === 'string' && first && typeof variant.name === 'string' && variant.name.trim()) photos.add(first);
    }
    return photos.size > 1;
  });
}

const FILTERS = /(?<!\p{L})filtros?(?!\p{L})/iu;
// Only words said about the filters count: «botones» or «al lado» elsewhere in the request («haz los botones más grandes y quita
// los filtros», «pon el buscador al lado de los filtros») never change the style (final review 2026-10-21).
const STYLE_WORDS: Array<[FilterStyle, RegExp]> = [
  ['sidebar', /(?<!\p{L})(a la izquierda|al costado|en una columna|columna lateral|barra lateral|lateral|sidebar)(?!\p{L})/iu],
  ['chips', /(?<!\p{L})(chips?|pastillas?|como botones|en botones)(?!\p{L})/iu],
  ['bar', /(?<!\p{L})(barra(?! lateral)|arriba del todo|en una fila|bot[oó]n de filtrar|caj[oó]n)(?!\p{L})/iu],
];
// Browse: the catalogue «como Nike» / «tipo tienda grande», or filters with a photo per colour — never a brand the store sells.
const BROWSE_LIKE = /(?<!\p{L})(como|estilo|tipo|igual que|parecid[oa] a)( (en|a|el de|la de))? (nike|adidas|zara|(una )?tienda grande)(?!\p{L})/iu;
const BROWSE_PHOTOS = /(?<!\p{L})filtros?(?!\p{L}).{0,60}fotos? (por|de cada) colou?r/iu;
/** The merchant's words name a filter style for the filters (in the same clause, «filtros» right before or after), or say nothing of one. */
export function instructionAsksFilterStyle(text: string): FilterStyle | undefined {
  if (BROWSE_LIKE.test(text) || BROWSE_PHOTOS.test(text)) return 'browse';
  for (const clause of text.split(/[,.;:!?\n]| y | e | pero /i)) {
    const at = clause.search(FILTERS);
    if (at < 0) continue;
    const after = clause.slice(at);
    for (const [style, words] of STYLE_WORDS) {
      const hit = words.exec(after);
      if (hit && hit.index <= 40) return style;
    }
    for (const [style, words] of STYLE_WORDS) {
      const hit = words.exec(clause.slice(0, at));
      if (hit && at - (hit.index + hit[0].length) <= 20) return style;
    }
  }
  return undefined;
}

/** config.js with the filter style: the merchant's ask, else this save's or the saved one, else the store's seeded style. */
export function withFilterStyleConfig<T extends { path: string; content: string }>(files: T[], previous: ReadonlyArray<{ path: string; content: string }>, asked: FilterStyle | undefined, storeId: string): T[] {
  const current = readConfigFile(files).filterStyle, saved = readConfigFile(previous).filterStyle;
  const style = asked ?? (isFilterStyle(current) ? current : isFilterStyle(saved) ? saved : seededFilterStyle(storeId));
  return patchConfigFile(files, config => ({ ...config, filterStyle: style }));
}
