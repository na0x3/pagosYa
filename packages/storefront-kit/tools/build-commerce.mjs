#!/usr/bin/env node
/**
 * Builds packages/storefront-kit/kit/commerce.js, the one runtime every store loads by name, from its parts in
 * packages/storefront-kit/commerce-src/. The runtime is a single IIFE whose top-level functions and state share one
 * scope, so the parts are not modules: each is a run of whole lines of that IIFE, and the build is their plain
 * concatenation in PARTS order, byte for byte (the first part opens the IIFE, the last one closes it).
 * kit/commerce.js stays checked in because the API (kitPath('commerce.js')), the Studio (`?raw` import) and saved
 * stores all read that path. Never edit it by hand: edit a part, then run this tool.
 *
 * Usage: node packages/storefront-kit/tools/build-commerce.mjs           write kit/commerce.js
 *        node packages/storefront-kit/tools/build-commerce.mjs --check   exit 1 when kit/commerce.js differs from the parts
 */
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = join(root, 'commerce-src');
export const TARGET = join(root, 'kit', 'commerce.js');

/** Concatenation order, which is execution order: top-level statements run in this order, and a `const`/`let` is in
 *  its temporal dead zone until its part has run. A new part goes where its code must run, not where it reads best. */
export const PARTS = [
  'shared/config-dna.js',
  'motifs/drawings.js',
  'shared/analytics.js',
  'shared/state.js',
  'catalog/offers.js',
  'cart/lines.js',
  'product/dialog-style.js',
  'product/setup.js',
  'product/bundles-related.js',
  'pages/policy-links.js',
  'account/pages.js',
  'pages/standard.js',
  'product/page.js',
  'checkout/page-setup.js',
  'cart/drawer.js',
  'motifs/placement.js',
  'checkout/overlay.js',
  'catalog/cards.js',
  'look/contrast-guard.js',
  'catalog/render.js',
  'templates/kit-templates.js',
  'cart/render.js',
  'contact/form.js',
  'rest.js',
];

/** Every .js file under commerce-src/, relative to it, with forward slashes, sorted. */
export function sourceFiles(dir = SOURCE_DIR) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => relative(dir, join(entry.parentPath ?? entry.path, entry.name)).split('\\').join('/'))
    .sort();
}

/** The runtime as the parts spell it. Throws when PARTS and the folder disagree or a part lacks its final newline. */
export function buildCommerce() {
  if (new Set(PARTS).size !== PARTS.length) throw new Error('commerce-src: a part is listed twice in PARTS');
  const files = sourceFiles();
  const unlisted = files.filter(file => !PARTS.includes(file));
  const missing = PARTS.filter(part => !files.includes(part));
  if (unlisted.length || missing.length) throw new Error(`commerce-src and PARTS disagree. Unlisted: ${unlisted.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`);
  return PARTS.map(part => {
    const text = readFileSync(join(SOURCE_DIR, part), 'utf8');
    if (!text.endsWith('\n')) throw new Error(`commerce-src/${part} must end with a newline`);
    return text;
  }).join('');
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  const built = buildCommerce();
  if (process.argv.includes('--check')) {
    if (readFileSync(TARGET, 'utf8') !== built) {
      console.error('kit/commerce.js differs from packages/storefront-kit/commerce-src. Edit the parts, then run: node packages/storefront-kit/tools/build-commerce.mjs');
      process.exit(1);
    }
    console.log(`kit/commerce.js matches ${PARTS.length} commerce-src parts.`);
  } else {
    writeFileSync(TARGET, built);
    console.log(`Wrote kit/commerce.js from ${PARTS.length} commerce-src parts.`);
  }
}
