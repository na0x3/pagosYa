import type { StoreItem } from './api';

/** Versioned parity with the portable commerce runtime. Extras continue through
 * the standard configurator until that runtime supports their pricing rules. */
export const SOURCE_PRODUCT_OPTIONS_MARKER = 'pagosya-product-options:v1';
export function sourceCanConfigureProduct(product: Pick<StoreItem, 'variants' | 'extras'>): boolean {
  if (product.extras?.length) return false;
  const variants = product.variants;
  if (!variants?.length) return true;
  if (!Array.isArray(variants) || variants.length > 256 || variants.some(v => !v || typeof v !== 'object')) return false;
  const structured = variants.some(v => v.options?.length);
  const ids = new Set(), combinations = new Set();
  let names: string[] = [];
  for (const variant of variants) {
    const options = structured ? variant.options : [{ name: 'Opción', value: variant.name }];
    if (!variant.id || ids.has(variant.id) || !Number.isSafeInteger(variant.amount) || variant.amount < 0 || !Array.isArray(options) || !options.length || options.length > 6) return false;
    ids.add(variant.id);
    if (options.some(o => typeof o?.name !== 'string' || !o.name.trim() || typeof o.value !== 'string' || !o.value.trim()) || new Set(options.map(o => o.name)).size !== options.length) return false;
    if (!names.length) names = options.map(o => o.name);
    if (options.length !== names.length || options.some((o, index) => o.name !== names[index])) return false;
    const key = JSON.stringify(options.map(o => o.value));
    if (combinations.has(key)) return false;
    combinations.add(key);
  }
  return true;
}
