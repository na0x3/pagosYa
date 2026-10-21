import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askYapiLine, BRAND_REQUEST } from './ask-yapi.mjs';

test('askYapiLine escapes and carries the request', () => {
  const html = askYapiLine({ text: 'Tus políticas <las> escribe YAPI.', request: 'Escribe "mis" políticas' });
  assert.match(html, /^<p class="ask-yapi">Tus políticas &lt;las&gt; escribe YAPI\. <button type="button" class="ask-yapi-link" data-ask-yapi="Escribe &quot;mis&quot; políticas">Pídele a YAPI →<\/button><\/p>$/);
  assert.match(BRAND_REQUEST, /colores/);
});

test('settings shows the two lines and the dashboard opens YAPI from any of them', () => {
  const settings = readFileSync(new URL('./store-settings.mjs', import.meta.url), 'utf8');
  assert.match(settings, /askYapiLine\(\{ text: "Tus políticas las escribe YAPI con tus datos\.", request: POLICY_REQUEST \}\)/);
  assert.match(settings, /askYapiLine\(\{ text: "Colores, tipografía y estilo los define YAPI\.", request: BRAND_REQUEST \}\)/);
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /const ask = event\.target\.closest\("\[data-ask-yapi\]"\);/);
  assert.match(js, /composeInYapi\(ask\.dataset\.askYapi, "ask"\)/);
  assert.match(js, /composeYapi: \(text\) => composeInYapi\(text, "growth"\)/);
});
