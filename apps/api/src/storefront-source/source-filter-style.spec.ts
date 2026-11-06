import { FILTER_STYLES, SEEDED_FILTER_STYLES, carriesColourPhotos, instructionAsksFilterStyle, seededFilterStyle, withFilterStyleConfig } from './source-filter-style';

/** Spec 2026-10-21 sort & filter styles: which style a store gets, and the chat words that change it. */
const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};\n` });
const read = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(file => file.path === 'config.js')!.content.match(/= (.*);/)![1]);

describe('filter style', () => {
  it.each([
    ['filtros como chips', 'chips'], ['pon los filtros en chips arriba', 'chips'], ['pon una barra de filtros arriba', 'bar'],
    ['filtros a la izquierda', 'sidebar'], ['quiero los filtros en una columna al costado', 'sidebar'], ['cambia el color del botón', undefined],
    ['haz los botones más grandes y quita los filtros', undefined], ['pon el buscador al lado de los filtros', undefined],
    // Browse catalogue (spec 2026-11-06): the Nike shop page, asked by its likeness or by what it has.
    ['ponlo como Nike', 'browse'], ['quiero el catálogo estilo nike', 'browse'], ['filtros a la izquierda con fotos por color', 'browse'],
    ['el catálogo como una tienda grande', 'browse'], ['vendo zapatillas Nike y Adidas', undefined], ['pon una foto por color en la portada', undefined],
  ])('%s → %s', (text, expected) => expect(instructionAsksFilterStyle(text)).toBe(expected));
  it('a store id always seeds the same style, and stores differ', () => {
    expect(seededFilterStyle('store-1')).toBe(seededFilterStyle('store-1'));
    // Browse is asked for or picked for colour photos, never seeded: the seeded styles of existing stores stay as they were.
    expect(new Set(Array.from({ length: 30 }, (_, i) => seededFilterStyle(`s${i}`)))).toEqual(new Set(SEEDED_FILTER_STYLES));
    expect(FILTER_STYLES).toContain('browse');
  });
  it('a product carries colour photos with two colours or more, each with its own first photo', () => {
    const colour = (name: string, url?: string) => ({ name, options: [{ name: 'Color', value: name }], ...(url ? { imageUrls: [url] } : {}) });
    expect(carriesColourPhotos([{ variants: [colour('Rojo', '/a.jpg'), colour('Azul', '/b.jpg')] }])).toBe(true);
    expect(carriesColourPhotos([{ variants: [colour('Rojo', '/a.jpg'), colour('Azul', '/a.jpg')] }])).toBe(false);
    expect(carriesColourPhotos([{ variants: [colour('Rojo', '/a.jpg'), colour('Azul')] }, { variants: [] }, {}])).toBe(false);
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
