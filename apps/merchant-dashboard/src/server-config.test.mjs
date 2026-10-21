import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectServerConfig } from './server-config.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('without settings the page stays as it is (local development)', () => {
  assert.equal(injectServerConfig(html, {}), html);
});

test('the API and checkout origins come from the server, escaped', () => {
  const out = injectServerConfig(html, { apiBase: 'https://api.pagosya.bo/v1', checkoutOrigin: 'https://pagosya.bo"><x' });
  assert.match(out, /<input id="apiBase" value="https:\/\/api\.pagosya\.bo\/v1">/);
  assert.match(out, /<input id="checkoutOrigin" style="width:220px;display:inline-block" value="https:\/\/pagosya\.bo&quot;&gt;&lt;x">/);
  assert.doesNotMatch(out, /localhost:3001/);
});

test('in production the developer options are gone and the page says so', () => {
  const out = injectServerConfig(html, { production: true });
  assert.match(out, /<details class="login-dev" hidden>/);
  assert.match(out, /<html lang="es" data-production>/);
});

test('server.mjs applies it, and the dashboard ignores a saved API base in production', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /injectServerConfig\(injectFullNav\(injectLiveReload\(html\), fullNavEnabled\), serverConfig\)/);
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /const savedApiBase = document\.documentElement\.hasAttribute\("data-production"\) \? null : sessionStorage\.getItem\("pagosya_merchant_api_base"\);/);
});
