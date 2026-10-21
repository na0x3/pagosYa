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

test('tokens: warm page, soft lines, rounder corners, serif titles', () => {
  const s = css();
  for (const token of ['--pm-serif: "Instrument Serif"', '--pm-ease: cubic-bezier(.22,1,.36,1)', '--pm-glass:', '--pm-blur:', '--calm-radius: 20px', '--calm-radius-sm: 14px', '--pg-bg: var(--pm-bg)', '--pg-border: rgb(40 36 28 / .08)']) assert.ok(s.includes(token), token);
  assert.match(s, /body\.is-logged-in \{\n\s+background:\n\s+radial-gradient/);
  assert.match(s, /body\.is-logged-in \.workspace-title \{ font: 400 44px\/1\.05 var\(--pm-serif\)/);
});

test('shell: floating glass sidebar and top bar, a roomy column, glass pills, menus and dialogs', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.dashboard-sidebar \{ background: var\(--pm-glass\); -webkit-backdrop-filter: var\(--pm-blur\); backdrop-filter: var\(--pm-blur\);/);
  assert.match(s, /body\.is-logged-in > \.topbar \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /body\.is-logged-in \.dashboard-workspace \{[^}]*max-width: 1080px/);
  assert.match(s, /body\.is-logged-in \.section-tabs \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /body\.is-logged-in dialog \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
});
