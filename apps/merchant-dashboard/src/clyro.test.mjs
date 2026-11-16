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
