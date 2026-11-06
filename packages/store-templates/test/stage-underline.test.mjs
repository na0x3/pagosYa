// Owner 2026-11-06 (Vórtice, Shrine): the cover-stage's hand-drawn underline rose 8 of its 20 units and crossed the bottom of an
// uppercase first word («ENTREGAMOS», «BATIDOS»). It stays low in its box, so it sits under the word, never across it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the stage underline stays in the lower part of its box', () => {
  const library = readFileSync(new URL('../templates/esencial/components/library.tsx', import.meta.url), 'utf8');
  const path = /className="lb-mark">\{first\}<svg viewBox="0 0 200 20"[^>]*><path d="([^"]+)"/.exec(library)?.[1];
  assert.ok(path, 'stage underline path found');
  // Absolute y of every point: M x y, then relative c (dx1 dy1 dx2 dy2 dx dy).
  const [, , y0, rest] = /^M(\S+) (\S+)c(.+)$/.exec(path).map(String);
  const d = rest.trim().split(/[\s,]+|(?=-)/).filter(Boolean).map(Number);
  const ys = [Number(y0), Number(y0) + d[1], Number(y0) + d[3], Number(y0) + d[5]];
  for (const y of ys) assert.ok(y >= 11, `point at y=${y} rises into the word`);
});
