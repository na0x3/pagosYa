import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = () => read("./clyro.css");
const html = read("../index.html");
const server = read("../server.mjs");

// Spec 2026-11-16 (owner: «change the entirety of the dashboard to … like the new pagosya site»).
test("clyro.css is linked last, served, and its two fonts are self-hosted", () => {
  assert.match(html, /<link rel="stylesheet" href="\/src\/clyro\.css">\n<\/head>/);
  assert.match(server, /"\/src\/clyro\.css"/);
  for (const font of ["bricolage-grotesque", "onest"]) {
    assert.ok(existsSync(new URL(`../fonts/${font}.woff2`, import.meta.url)), font);
    assert.match(server, new RegExp(`"/fonts/${font}\\.woff2"`));
    assert.match(css(), new RegExp(`url\\("/fonts/${font}\\.woff2"\\) format\\("woff2"\\)`));
  }
});

test("tokens: the site's paper, ink, line, slate and wash; YAPI's yellow only as --cl-yellow", () => {
  const s = css();
  for (const token of ["--cl-paper: #fdfcf6", "--cl-ink: #17191c", "--cl-ink-soft: #5d6066", "--cl-line: #e7e5dc", "--cl-slate: #233a4a",
    "--cl-night: #15191c", "--cl-yellow: #ffd82f", "--cl-surface: #ffffff", "--cl-ease: cubic-bezier(.22,1,.36,1)",
    "--pg-bg: var(--cl-paper)", "--pg-ink: var(--cl-ink)", "--pg-accent: var(--cl-ink)", "--pg-border: var(--cl-line)",
    "--pg-brand: var(--cl-ink)", "--pg-brand-text: #fff", "--calm-radius: 20px", "--calm-radius-sm: 12px"]) assert.ok(s.includes(token), token);
  assert.ok(s.includes("radial-gradient(60% 55% at 12% 30%, #dcefe4 0%, transparent 70%)"));
});

test("no blue and no Instrument Serif survive in the signed-in page: clyro.css overrides both", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \{[^}]*background: var\(--cl-paper\);/);
  assert.match(s, /--pm-serif: var\(--cl-display\)/);
});

// WCAG 2.x relative luminance.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const token = (name) => new RegExp(`${name}: (#[0-9a-f]{6})`).exec(css())?.[1];

test("every text token reads at 4.5:1 or more on cream and on white", () => {
  for (const text of ["--cl-ink", "--cl-ink-soft", "--cl-text-faint", "--cl-green-text", "--cl-red-text"]) {
    for (const ground of ["--cl-paper", "--cl-surface"]) {
      const value = ratio(token(text), token(ground));
      assert.ok(value >= 4.5, `${text} on ${ground}: ${value.toFixed(2)}`);
    }
  }
  assert.ok(ratio("#ffffff", token("--cl-ink")) >= 4.5, "white on an ink pill");
  assert.ok(ratio("#ffffff", token("--cl-slate")) >= 4.5, "white on the slate band");
});

test("shell: cream sidebar with an ink pill for the page, a frosted pill top bar, the YAPI bar as a white pill", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.dashboard-sidebar \{[^}]*background: var\(--cl-paper\);/);
  assert.match(s, /body\.is-logged-in \.dashboard-nav-button\[aria-current="page"\][^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in > \.topbar \{[^}]*border-radius: 999px;[^}]*backdrop-filter: blur\(20px\)/);
  assert.match(s, /body\.is-logged-in \.workspace-yapi \{[^}]*background: var\(--cl-surface\);[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in :is\(\.workspace-title, \.panel \.section-head h2, \.ui-head h3, \.overview-greeting\) \{[^}]*font-family: var\(--cl-display\);[^}]*font-weight: 500;[^}]*letter-spacing: -\.05em;/);
  assert.match(s, /body\.is-logged-in \.workspace-header \{[^}]*background: var\(--cl-wash\);/);
  // The one slate band per screen: Inicio's «Tu cuenta» card.
  assert.match(s, /body\.is-logged-in \.panel\.overview-account \{[^}]*background: var\(--cl-slate\);[^}]*color: #fff;/);
});

test("controls: ink and white pills that press, segmented tabs, 12px fields with an ink ring, white 20px cards, soft status pills", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in button\.primary[^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in :is\(button\.secondary, button\.ghost, \.button-like\.ghost\) \{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);/);
  assert.match(s, /:active \{ transform: scale\(\.97\); \}/);
  // Low weight on purpose (as premium.css): the YAPI bar's and the welcome's own textareas must still win.
  assert.match(s, /body\.is-logged-in :is\(input:where\(:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\):not\(\[type=range\]\):not\(\.ui-switch\)\), select, textarea\) \{[^}]*border-radius: 12px;/);
  assert.match(s, /body\.is-logged-in :is\(input, select, textarea\):focus-visible \{[^}]*box-shadow: 0 0 0 3px var\(--pg-focus-ring\);/);
  assert.match(s, /body\.is-logged-in :is\(\.panel, \.card\) \{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);[^}]*border-radius: 20px;/);
  assert.match(s, /body\.is-logged-in \.section-tabs \{[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in \.section-tab\[aria-current="page"\] \{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;/);
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\)[^{]*\{[^}]*border-radius: 20px;/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{[^}]*transform: none/);
  assert.match(s, /body\.is-logged-in :is\(\.overview-kpi dd, \.value, \.finance-total-value\) \{[^}]*font-family: var\(--cl-display\);/);
  assert.match(s, /body\.is-logged-in :is\(#error, #info\):not\(:empty\) \{[^}]*border-radius: 16px;/);
});
