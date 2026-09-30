import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');

const SHELL = /export default function Shell\(\{ children \}: \{ children: ReactNode \}\)/;

// Standard store pages are rendered inside each template's Shell (spec 2026-09-30-store-page-architecture), so every
// template, now and future, must default-export a Shell that takes children.
test('every template default-exports a Shell that takes children', () => {
  for (const { dir, manifest } of templates.loadTemplates()) {
    const source = readFileSync(join(dir, 'components', 'Shell.tsx'), 'utf8');
    assert.match(source, SHELL, `${manifest.id}: Shell must be the default export and take children`);
  }
});

test('the contract rejects a Shell that ignores children or is not the default export', () => {
  assert.doesNotMatch('export default function Shell() {', SHELL);
  assert.doesNotMatch('export function Shell({ children }: { children: ReactNode }) {', SHELL);
});
