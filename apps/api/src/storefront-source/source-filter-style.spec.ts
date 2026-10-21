import { FILTER_STYLES, instructionAsksFilterStyle, seededFilterStyle, withFilterStyleConfig } from './source-filter-style';

/** Spec 2026-10-21 sort & filter styles: which style a store gets, and the chat words that change it. */
const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};\n` });
const read = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(file => file.path === 'config.js')!.content.match(/= (.*);/)![1]);

describe('filter style', () => {
  it.each([
    ['filtros como chips', 'chips'], ['pon los filtros en chips arriba', 'chips'], ['pon una barra de filtros arriba', 'bar'],
    ['filtros a la izquierda', 'sidebar'], ['quiero los filtros en una columna al costado', 'sidebar'], ['cambia el color del botón', undefined],
  ])('%s → %s', (text, expected) => expect(instructionAsksFilterStyle(text)).toBe(expected));
  it('a store id always seeds the same style, and stores differ', () => {
    expect(seededFilterStyle('store-1')).toBe(seededFilterStyle('store-1'));
    expect(new Set(Array.from({ length: 30 }, (_, i) => seededFilterStyle(`s${i}`)))).toEqual(new Set(FILTER_STYLES));
  });
  it('a first save seeds, a later save keeps the saved style, and words change it', () => {
    const seeded = read(withFilterStyleConfig([config({ dna: {} })], [], undefined, 'store-1'));
    expect(seeded.filterStyle).toBe(seededFilterStyle('store-1'));
    const kept = read(withFilterStyleConfig([config({ dna: {} })], [config({ filterStyle: 'chips' })], undefined, 'store-1'));
    expect(kept.filterStyle).toBe('chips');
    const asked = read(withFilterStyleConfig([config({ dna: {}, filterStyle: 'chips' })], [], 'sidebar', 'store-1'));
    expect(asked.filterStyle).toBe('sidebar');
  });
});
