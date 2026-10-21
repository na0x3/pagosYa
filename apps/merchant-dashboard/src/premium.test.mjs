import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const css = () => readFileSync(new URL('./premium.css', import.meta.url), 'utf8');

test('premium.css is linked last and the serif is served', () => {
  assert.match(html, /<link rel="stylesheet" href="\/src\/onboarding-walkthrough\.css">\n<link rel="stylesheet" href="\/src\/premium\.css">/);
  assert.match(server, /"\/src\/premium\.css"/);
  assert.match(server, /requestUrl\.pathname === "\/fonts\/instrument-serif\.ttf"/);
  assert.match(css(), /@font-face \{ font-family: "Instrument Serif"; src: url\("\/fonts\/instrument-serif\.ttf"\) format\("truetype"\); font-display: swap; \}/);
});
