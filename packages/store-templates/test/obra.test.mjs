import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'obra', 'components');
const read = name => readFileSync(join(root, name), 'utf8');

// Templates only receive the store's name, tagline and city (source-templates.ts templateStoreDataFile), never a phone.
// A WhatsApp link would therefore have no number to point at: obra must not ship one.
test('obra never renders a WhatsApp link, since no phone reaches a template', () => {
  for (const file of ['Shell.tsx', 'home.tsx', 'product.tsx', 'checkout.tsx']) {
    assert.doesNotMatch(read(file), /wa\.me|whatsapp/i, `${file} mentions WhatsApp`);
  }
});

test('every "Cotizar" button scrolls to the services grid', () => {
  const shell = read('Shell.tsx');
  const home = read('home.tsx');
  assert.match(shell, /className="ob-getquote" href="index\.html#servicios"/);
  assert.match(home, /id="servicios"/);
  for (const label of ['Cotizar mi obra', 'Cotizar tu obra']) {
    assert.match(home, new RegExp(`href="#servicios">${label}<`), `"${label}" must link to #servicios`);
  }
});

test('a service card still shows its name and an add button when the price is empty', () => {
  const home = read('home.tsx');
  const card = home.match(/<template data-pagosya-product-template>([\s\S]*?)<\/template>/)[1];
  assert.match(card, /data-product-field="name"/);
  assert.match(card, /data-product-add/);
  // The price sits in its own element, so an empty or zero price leaves the card intact.
  assert.match(card, /<p className="ob-card__price" data-product-field="price" \/>/);
});
