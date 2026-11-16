import { beforeEach, expect, it } from 'vitest';
import { readRecent, rememberRecent, sellingConfig } from '../src/selling-config';

beforeEach(() => localStorage.clear());

it('remembers viewed products on this device only, newest first, once each, at most 8', () => {
  rememberRecent('sola', [{ type: 'product_view', productId: 'a' }, { type: 'page_view' }, { type: 'product_view', productId: 'b' }]);
  rememberRecent('sola', [{ type: 'product_view', productId: 'a' }, { type: 'product_view', productId: 'bad id!' }]);
  expect(readRecent('sola')).toEqual(['a', 'b']);
  for (let i = 0; i < 12; i++) rememberRecent('sola', [{ type: 'product_view', productId: 'p' + i }]);
  expect(readRecent('sola')).toHaveLength(8);
  expect(readRecent('other')).toEqual([]);
});

it('gives the store its selling switches and the products seen before, and nothing it cannot use', () => {
  expect(sellingConfig({ selling: { buyWord: 'Lo quiero' } }, ['a', 'b'])).toEqual({ selling: { buyWord: 'Lo quiero' }, recent: ['a', 'b'] });
  expect(sellingConfig({ selling: 'x' }, [])).toEqual({});
  expect(sellingConfig({}, ['a'])).toEqual({ recent: ['a'] });
});

it('survives garbage in storage', () => {
  localStorage.setItem('pagosya:recent:sola', '{nope');
  expect(readRecent('sola')).toEqual([]);
});
