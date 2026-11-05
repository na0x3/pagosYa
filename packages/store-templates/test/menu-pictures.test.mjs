import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner 2026-11-05 («if there is dropdown menu it should have pictures in it»): no template's menu look hides the dropdown's photos.
const css = readFileSync(new URL('../templates/esencial/styles/globals.css', import.meta.url), 'utf8');

test('no menu look hides the dropdown pictures', () => {
  const hiding = [...css.matchAll(/\[data-es-theme="([a-z0-9-]+)"\] (?:\.pym-tiles|:is\([^)]*\.pym-tiles[^)]*\))\{[^}]*display:none/g)].map(match => match[1]);
  assert.deepEqual(hiding, []);
});

test('the bar and card looks lay the pictures out as a row', () => {
  for (const theme of ['broadcast', 'sorbo', 'calma', 'focal', 'shrine']) {
    assert.match(css, new RegExp(`\\[data-es-theme="${theme}"\\] \\.pym-tiles ul\\{[^}]*grid-template-columns:repeat\\(3`), theme);
  }
});
