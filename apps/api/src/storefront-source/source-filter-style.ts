/** Spec 2026-10-21 sort & filter styles: the catalogue's filter style (config.js filterStyle), read by the kit
 *  (commerce-src/catalog/filters.js). Esencial rolls it with the dice; a YAPI-coded store gets one seeded by its id, kept
 *  across saves, and the merchant's words can change it. */
import { createHash } from 'node:crypto';
import { patchConfigFile, readConfigFile } from './store-look';

export const FILTER_STYLES = ['bar', 'chips', 'sidebar'] as const;
export type FilterStyle = typeof FILTER_STYLES[number];
export const isFilterStyle = (value: unknown): value is FilterStyle => (FILTER_STYLES as readonly unknown[]).includes(value);

export function seededFilterStyle(storeId: string): FilterStyle {
  return FILTER_STYLES[createHash('sha256').update(`filters:${storeId}`).digest().readUInt32BE(0) % FILTER_STYLES.length];
}

const FILTERS = /(?<!\p{L})filtros?(?!\p{L})/iu;
// Only words said about the filters count: «botones» or «al lado» elsewhere in the request («haz los botones más grandes y quita
// los filtros», «pon el buscador al lado de los filtros») never change the style (final review 2026-10-21).
const STYLE_WORDS: Array<[FilterStyle, RegExp]> = [
  ['sidebar', /(?<!\p{L})(a la izquierda|al costado|en una columna|columna lateral|barra lateral|lateral|sidebar)(?!\p{L})/iu],
  ['chips', /(?<!\p{L})(chips?|pastillas?|como botones|en botones)(?!\p{L})/iu],
  ['bar', /(?<!\p{L})(barra(?! lateral)|arriba del todo|en una fila|bot[oó]n de filtrar|caj[oó]n)(?!\p{L})/iu],
];
/** The merchant's words name a filter style for the filters (in the same clause, «filtros» right before or after), or say nothing of one. */
export function instructionAsksFilterStyle(text: string): FilterStyle | undefined {
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
