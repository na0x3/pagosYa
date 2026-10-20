// kit/commerce.js is generated from commerce-src/ (tools/build-commerce.mjs). These tests keep it that way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { GENERATED, PARTS, TARGET, buildCommerce, sourceFiles } from './build-commerce.mjs';

test('kit/commerce.js is exactly its commerce-src parts, concatenated in PARTS order', () => {
  // assert.ok, not assert.equal: a 4,000-line diff in the failure output helps nobody.
  assert.ok(readFileSync(TARGET, 'utf8') === buildCommerce(),
    'kit/commerce.js was edited by hand or not rebuilt. Edit packages/storefront-kit/commerce-src/… and run: node packages/storefront-kit/tools/build-commerce.mjs');
});

test('every part is listed once and every listed part exists', () => {
  assert.equal(new Set(PARTS).size, PARTS.length);
  assert.deepEqual(PARTS.filter(part => !GENERATED[part]).sort(), sourceFiles());
});

test('the checkout shell assets reach the runtime as a generated part before the overlay', () => {
  assert.ok(GENERATED['checkout/shell-assets.js'], 'generated part is declared');
  assert.ok(PARTS.indexOf('checkout/shell-assets.js') < PARTS.indexOf('checkout/shell.js'));
  assert.ok(PARTS.indexOf('checkout/shell.js') < PARTS.indexOf('checkout/overlay.js'));
  const built = buildCommerce();
  assert.match(built, /\n  const CHECKOUT_SHELL_CSS = ".*pya-checkout/);
  assert.match(built, /\n  const PAYMENT_LOGOS = \{"logos":/);
});

test('the built runtime parses as one classic script', () => {
  assert.doesNotThrow(() => new Script(buildCommerce(), { filename: 'commerce.js' }));
});
