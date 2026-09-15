import { normalizeProductHighlights, PRODUCT_HIGHLIGHT_ICONS } from './product-highlights';

describe('product highlights', () => {
  it('keeps at most four approved rows with known icons', () => {
    expect(normalizeProductHighlights([
      { icon: 'fuel', label: '  Gasolina  ', detail: '  1.6 L  ' },
      { icon: 'car', label: 'Automático' },
      { icon: 'truck', label: 'Entrega', detail: 'A domicilio' },
      { icon: 'gauge', label: '0 a 100' },
      { icon: 'leaf', label: 'De más' },
    ])).toEqual([
      { icon: 'fuel', label: 'Gasolina', detail: '1.6 L' },
      { icon: 'car', label: 'Automático' },
      { icon: 'truck', label: 'Entrega', detail: 'A domicilio' },
      { icon: 'gauge', label: '0 a 100' },
    ]);
  });

  it('drops unknown icons, blank labels and repeated labels', () => {
    expect(normalizeProductHighlights([
      { icon: 'rocket', label: 'Inventado' },
      { icon: 'car', label: '   ' },
      { icon: 'car', label: 'Automático' },
      { icon: 'fuel', label: ' automático ' },
    ])).toEqual([{ icon: 'car', label: 'Automático' }]);
  });

  it('shortens long text and ignores missing input', () => {
    const [row] = normalizeProductHighlights([{ icon: 'leaf', label: 'L'.repeat(40), detail: 'D'.repeat(60) }]);
    expect(row.label).toHaveLength(24);
    expect(row.detail).toHaveLength(40);
    expect(normalizeProductHighlights(undefined)).toEqual([]);
    expect(normalizeProductHighlights(null)).toEqual([]);
    expect(normalizeProductHighlights([{ icon: 'leaf', label: 'Lino', detail: '   ' }])).toEqual([{ icon: 'leaf', label: 'Lino' }]);
  });

  it('offers icons for the catalogs pagosYa sells, named in lowercase kebab case', () => {
    expect(PRODUCT_HIGHLIGHT_ICONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PRODUCT_HIGHLIGHT_ICONS).size).toBe(PRODUCT_HIGHLIGHT_ICONS.length);
    expect(PRODUCT_HIGHLIGHT_ICONS.every(name => /^[a-z][a-z-]*[a-z]$/.test(name))).toBe(true);
    for (const name of ['car', 'fuel', 'truck', 'leaf', 'bolt', 'shield', 'ruler', 'clock']) expect(PRODUCT_HIGHLIGHT_ICONS).toContain(name);
  });
});
