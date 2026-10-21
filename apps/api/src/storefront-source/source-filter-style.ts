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
const CHIPS = /(?<!\p{L})(chips?|pastillas?|botones)(?!\p{L})/iu;
const SIDEBAR = /(?<!\p{L})(a la izquierda|al costado|al lado|en una columna|columna lateral|barra lateral|lateral|sidebar)(?!\p{L})/iu;
const BAR = /(?<!\p{L})(barra(?! lateral)|arriba del todo|en una fila|bot[oó]n de filtrar|caj[oó]n)(?!\p{L})/iu;
/** The merchant's words name a filter style, or say nothing of one. */
export function instructionAsksFilterStyle(text: string): FilterStyle | undefined {
  if (!FILTERS.test(text)) return undefined;
  if (SIDEBAR.test(text)) return 'sidebar';
  if (CHIPS.test(text)) return 'chips';
  if (BAR.test(text)) return 'bar';
  return undefined;
}

/** config.js with the filter style: the merchant's ask, else this save's or the saved one, else the store's seeded style. */
export function withFilterStyleConfig<T extends { path: string; content: string }>(files: T[], previous: ReadonlyArray<{ path: string; content: string }>, asked: FilterStyle | undefined, storeId: string): T[] {
  const current = readConfigFile(files).filterStyle, saved = readConfigFile(previous).filterStyle;
  const style = asked ?? (isFilterStyle(current) ? current : isFilterStyle(saved) ? saved : seededFilterStyle(storeId));
  return patchConfigFile(files, config => ({ ...config, filterStyle: style }));
}
