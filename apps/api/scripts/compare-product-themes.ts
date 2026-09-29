/**
 * Do two different businesses end up with different product pages? Compares two theme files written by
 * scripts/evaluate-yapi-agent.ts --theme-out (each { productCard, productCss }) and prints their distance
 * (product card settings that differ, plus one if only one has guarded CSS). Exits 1 when it is under the minimum.
 * Usage: npx ts-node --transpile-only scripts/compare-product-themes.ts chairs-1.json jewellery-1.json
 */
import { readFileSync } from 'node:fs';
import { productCardDistance, PRODUCT_CARD_MIN_DISTANCE } from '../src/storefront-source/product-card-distance';

const [first, second] = process.argv.slice(2);
if (!first || !second) { console.error('Usage: compare-product-themes.ts <a.json> <b.json>'); process.exit(2); }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const [a, b] = [read(first), read(second)];
const distance = productCardDistance(a, b);
for (const [name, theme] of [[first, a], [second, b]] as const) console.log(`${name}: ${Object.entries(theme.productCard).map(([key, value]) => `${key}=${value}`).join(' ')} · css ${theme.productCss ? 'sí' : 'no'}`);
console.log(`distancia ${distance} de 6 (mínimo ${PRODUCT_CARD_MIN_DISTANCE}): ${distance >= PRODUCT_CARD_MIN_DISTANCE ? 'distintas' : 'demasiado parecidas'}`);
process.exit(distance >= PRODUCT_CARD_MIN_DISTANCE ? 0 : 1);
