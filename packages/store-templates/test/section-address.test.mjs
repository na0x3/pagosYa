import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Point YAPI at a part of the page (final review 2026-11-05): a section with a fixed id («productos», «preguntas»…) after one that
// drew nothing was addressed by its position and the quick edit changed another section. Every section carries its layout number.
const library = readFileSync(new URL('../templates/esencial/components/library.tsx', import.meta.url), 'utf8');

test('every library section root says its layout number (data-lb-at)', () => {
  const roots = library.split('\n').filter(line => /<(section|div)\b[^>]*\bdata-lb=/.test(line));
  assert.ok(roots.length >= 9, `found ${roots.length} section roots`);
  for (const line of roots) assert.match(line, /data-lb-at=\{index\}/, line.trim().slice(0, 120));
});
