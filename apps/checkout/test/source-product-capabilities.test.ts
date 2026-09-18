import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceCanConfigureProduct, SOURCE_PRODUCT_OPTIONS_MARKER } from '../src/source-product-capabilities';
const variant = (id: string, options = [{ name: 'Color', value: 'Salvia' }]) => ({ id, name: id, amount: 8900, options });
describe('authored product route capability', () => {
  it('accepts real bounded options and named legacy variants', () => {
    expect(sourceCanConfigureProduct({ variants: [variant('sage'), variant('coral', [{ name: 'Color', value: 'Coral' }])], extras: [] })).toBe(true);
    expect(sourceCanConfigureProduct({ variants: [{ id: 'large', name: 'Grande', amount: 9000 }], extras: [] })).toBe(true);
  });
  it('keeps extras, ambiguous options, inconsistent groups and oversized matrices in the standard configurator', () => {
    expect(sourceCanConfigureProduct({ variants: [], extras: [{} as any] })).toBe(false);
    for (const variants of [[variant('a'), variant('b')], [variant('a'), variant('a')], [variant('a'), variant('b', [{ name: 'Size', value: 'M' }])], Array.from({ length: 65 }, (_, i) => variant(String(i)))]) {
      expect(sourceCanConfigureProduct({ variants, extras: [] })).toBe(false);
    }
  });
  it('requires the version present in the actual current commerce bundle', () => {
    const runtime = readFileSync(resolve(__dirname, '../../api/src/stores/source-kit/commerce.js'), 'utf8');
    expect(runtime).toContain(SOURCE_PRODUCT_OPTIONS_MARKER);
  });
});
