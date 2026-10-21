import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectFullNav } from './full-nav.mjs';

test('injectFullNav marks <html> only when enabled', () => {
  const html = '<!doctype html>\n<html lang="es">\n<head></head>';
  assert.equal(injectFullNav(html, false), html);
  assert.match(injectFullNav(html, true), /<html lang="es" data-full-nav>/);
  assert.equal(injectFullNav(injectFullNav(html, true), true).match(/data-full-nav/g).length, 1);
});

test('server.mjs applies the switch from DASHBOARD_FULL_NAV', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /process\.env\.DASHBOARD_FULL_NAV === "1"/);
  assert.match(server, /injectFullNav\(injectLiveReload\(html\), fullNavEnabled\)/);
});

test('calm.css hides full-nav-only things unless the switch is on', () => {
  const css = readFileSync(new URL('./calm.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\[data-full-nav\]\) \[data-full-nav-only\] \{ display: none !important; \}/);
  assert.match(css, /html\[data-full-nav\] \.ask-yapi \{ display: none !important; \}/);
});
