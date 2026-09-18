import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { PRODUCT_HIGHLIGHT_ICONS } from './product-highlight-icons';

it('offers exactly the icons the API accepts', () => {
  const source = readFileSync(new URL('../../api/src/payment-links/product-highlights.ts', import.meta.url), 'utf8');
  const list = source.slice(source.indexOf('PRODUCT_HIGHLIGHT_ICONS = ['), source.indexOf('] as const'));
  const names = [...list.matchAll(/'([a-z-]+)'/g)].map(match => match[1]);
  expect(names.length).toBeGreaterThan(0);
  expect(PRODUCT_HIGHLIGHT_ICONS).toEqual(names);
});
