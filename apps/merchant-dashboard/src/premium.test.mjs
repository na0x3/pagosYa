import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const css = () => readFileSync(new URL('./premium.css', import.meta.url), 'utf8');

test('premium.css is linked last and the serif is served', () => {
  assert.match(html, /<link rel="stylesheet" href="\/src\/premium\.css">\n<link rel="stylesheet" href="\/src\/yapi-welcome\.css">/);
  assert.match(server, /"\/src\/premium\.css"/);
  assert.match(server, /requestUrl\.pathname === "\/fonts\/instrument-serif\.ttf"/);
  assert.match(css(), /@font-face \{ font-family: "Instrument Serif"; src: url\("\/fonts\/instrument-serif\.ttf"\) format\("truetype"\); font-display: swap; \}/);
});

// Owner 2026-10-29: dark grey with a blue gradient; owner 2026-11-07: white by default, the blue only a faint wash.
test('tokens: white page with a faint blue wash, soft lines, rounder corners, serif titles', () => {
  const s = css();
  for (const token of ['--pm-serif: "Instrument Serif"', '--pm-ease: cubic-bezier(.22,1,.36,1)', '--pm-glass:', '--pm-blur:', '--calm-radius: 20px', '--calm-radius-sm: 14px', '--pg-bg: var(--pm-bg)', '--pm-bg: #fafaf9', 'color-scheme: light', '--pg-border: rgb(24 24 27 / .08)', '--pg-ink: #2563eb']) assert.ok(s.includes(token), token);
  assert.match(s, /body\.is-logged-in \{\n\s+background:\n\s+radial-gradient\(1100px 700px at 8% -10%, rgb\(37 99 235/);
  // Content surfaces read their colour from the tokens, never a hard-coded white.
  assert.doesNotMatch(s, /:is\(\.panel, \.card\) \{[^}]*background: #fff/);
  assert.match(s, /body\.is-logged-in \.workspace-title \{ font: 400 44px\/1\.05 var\(--pm-serif\)/);
});

test('shell: floating glass sidebar and top bar, a roomy column, glass pills, menus and dialogs', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.dashboard-sidebar \{ background: var\(--pm-glass\); -webkit-backdrop-filter: var\(--pm-blur\); backdrop-filter: var\(--pm-blur\);/);
  assert.match(s, /body\.is-logged-in > \.topbar \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /body\.is-logged-in \.dashboard-workspace \{[^}]*max-width: 1080px/);
  assert.match(s, /body\.is-logged-in \.section-tabs \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\) \{[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
});

test('controls and surfaces: pill buttons, soft 44px fields, roomy cards, rows and badges', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in :is\(\.panel, \.card\) \{[^}]*border-radius: 20px;[^}]*padding: 28px;/);
  assert.match(s, /body\.is-logged-in button:is\(\.primary, \.secondary, \.ghost\), body\.is-logged-in \.button-like \{[^}]*min-height: 40px;[^}]*border-radius: 999px;/);
  assert.match(s, /select, textarea\) \{[^}]*min-height: 44px;[^}]*border-radius: 14px;/);
  assert.match(s, /body\.is-logged-in :is\(th, td\) \{[^}]*padding: 16px 14px;/);
  assert.match(s, /body\.is-logged-in \.badge \{[^}]*border-radius: 999px;/);
});

test('the old marketing tab bar stays hidden, YAPI keeps its yellow, and the settings note names Clientes', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.marketing-tabs\[hidden\] \{ display: none !important; \}/);
  assert.match(s, /body\.is-logged-in \.workspace-yapi button\.primary \{ background: var\(--pg-brand\);/);
  assert.match(html, /Tus correos están en <a href="#dashboard-marketing" data-open-marketing-emails>Clientes › Correos<\/a>\./);
});

test('an empty pill bar stays hidden and a section head wraps instead of squeezing its title', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.section-tabs\[hidden\] \{ display: none; \}/);
  assert.match(s, /body\.is-logged-in \.panel \.section-head \{ flex-wrap: wrap; row-gap: 16px; \}/);
});

test('a section head keeps title and fold button on one line and gives its tools the full row below', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.panel \.section-head > \.section-toggle \{ order: 2; \}/);
  assert.match(s, /body\.is-logged-in \.panel \.section-head > :not\(:first-child\):not\(\.section-toggle\) \{ order: 3; flex-basis: 100%; \}/);
});

test('the phone icon rail keeps hiding labels, and the figures fit two columns on a phone', () => {
  const s = css();
  const base = s.match(/body\.is-logged-in \.dashboard-nav-button \{[^}]*\}/)?.[0] ?? '';
  assert.doesNotMatch(base, /font[:-]/, 'the base nav rule must not set a font size the rail sets to 0');
  assert.match(s, /@media \(min-width: 1000px\) \{[\s\S]*body\.is-logged-in \.dashboard-nav-button \{ font: 500 15px\/1\.2 var\(--pg-font-sans\); \}/);
  assert.match(s, /@media \(max-width: 699px\) \{ body\.is-logged-in \.overview-kpi dd \{ font-size: 24px; \} \}/);
});

test('on a phone a section head stacks its tools at full width', () => {
  assert.match(css(), /@media \(max-width: 699px\) \{\n\s+body\.is-logged-in \.panel \.section-head > :not\(:first-child\):not\(\.section-toggle\) \{ display: grid; gap: 10px; \}/);
});

test('the inventory import toggle is a pill', () => {
  assert.match(css(), /body\.is-logged-in \.catalog-import-disclosure > summary \{[^}]*border-radius: 999px;/);
});

test('plain links in the content are ink with a soft underline, not browser blue', () => {
  assert.match(css(), /body\.is-logged-in \.dashboard-workspace a:not\(\[class\]\) \{ color: var\(--pg-text\);/);
});

test('motion: pages and cards rise in slowly, staggered, and stay still with reduced motion', () => {
  const s = css();
  assert.match(s, /@keyframes pm-enter \{ from \{ opacity: 0; transform: translateY\(8px\); \} to \{ opacity: 1; transform: none; \} \}/);
  assert.match(s, /body\.is-logged-in \.page-entering \{ animation: pm-enter 520ms var\(--pm-ease\) both; \}/);
  assert.match(s, /:nth-child\(5\) \{ animation-delay: 160ms; \}/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{\n\s+body\.is-logged-in :is\(\.page-entering, \.page-entering \.panel, \.page-entering \.card, \.page-entering \.overview-kpi\) \{ animation: none; \}/);
});

test('the floating inset never applies to the full-screen Diseño view, where the sidebar slides away', () => {
  assert.match(css(), /body\.is-logged-in:not\(\[data-dashboard-view="workspace"\]\) \.dashboard-sidebar \{ top: var\(--pm-gap\); left: var\(--pm-gap\);/);
});

test('review fixes: the dark MCP dialog keeps its look, fields stay low-specificity, headings wrap on phones, pill fade respects reduced motion', () => {
  const s = css();
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\) \{/);
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\)::backdrop \{/);
  assert.doesNotMatch(s, /body\.is-logged-in :is\(input:not\(/, 'the field rule must not carry :not() specificity');
  assert.match(s, /body\.is-logged-in :is\(input:where\(:not\(\[type=checkbox\]\)/);
  assert.match(s, /@media \(max-width: 699px\) \{ body\.is-logged-in \.panel \.section-head h2 \{ white-space: normal; \} body\.is-logged-in \.panel \.section-head > :first-child \{ flex-shrink: 1; \} \}/);
  assert.match(s, /body\.is-logged-in :is\(#sectionTabs \.section-tab, \.dashboard-nav-button/);
});

test('YAPI: a glass dock pill, a glass ghost card for the flight, and a slow page dissolve', () => {
  const s = css();
  assert.match(s, /:not\(\[data-dashboard-view="store-settings"\]\) \.workspace-yapi \{[^}]*border-radius: 999px;[^}]*backdrop-filter: var\(--pm-blur\)/);
  assert.match(s, /body\.is-logged-in \.workspace-yapi-heading \{ display: flex;/);
  assert.match(s, /\.yapi-ghost \{[^}]*position: fixed;[^}]*pointer-events: none;/);
  assert.match(s, /::view-transition-old\(root\), ::view-transition-new\(root\) \{ animation-duration: 600ms;/);
});
