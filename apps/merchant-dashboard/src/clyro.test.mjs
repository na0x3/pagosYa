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
  assert.match(s, /body\.is-logged-in \{[^}]*background: var\(--cl-wash-page\);/);
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
  assert.match(s, /body\.is-logged-in \.dashboard-sidebar \{[^}]*background: var\(--cl-glass\);/);
  assert.match(s, /body\.is-logged-in \.dashboard-nav-button\[aria-current="page"\][^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in > \.topbar \{[^}]*border-radius: 999px;[^}]*backdrop-filter: var\(--cl-blur\)/);
  assert.match(s, /body\.is-logged-in \.workspace-yapi \{[^}]*border-radius: 999px;[^}]*background: var\(--cl-glass-strong\);/);
  assert.match(s, /body\.is-logged-in :is\(\.workspace-title, \.panel \.section-head h2, \.ui-head h3, \.overview-greeting\) \{[^}]*font-family: var\(--cl-display\);[^}]*font-weight: 500;[^}]*letter-spacing: -\.05em;/);
  assert.match(s, /body\.is-logged-in \.workspace-header \{[^}]*background: none;/);
  // The one slate band per screen: Inicio's «Tu cuenta» card.
  assert.match(s, /body\.is-logged-in \.panel\.overview-account \{[^}]*background: rgb\(35 58 74 \/ \.9\);[^}]*color: #fff;/);
});

test("controls: ink and white pills that press, segmented tabs, 12px fields with an ink ring, white 20px cards, soft status pills", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in button\.primary[^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in :is\(button\.secondary, button\.ghost, \.button-like\.ghost\) \{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);/);
  assert.match(s, /:active \{ transform: scale\(\.97\); \}/);
  // Low weight on purpose (as premium.css): the YAPI bar's and the welcome's own textareas must still win.
  assert.match(s, /body\.is-logged-in :is\(input:where\(:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\):not\(\[type=range\]\):not\(\.ui-switch\)\), select, textarea\) \{[^}]*border-radius: 12px;/);
  assert.match(s, /body\.is-logged-in :is\(input, select, textarea\):focus-visible \{[^}]*box-shadow: 0 0 0 3px var\(--pg-focus-ring\);/);
  assert.match(s, /body\.is-logged-in :is\(\.panel, \.card\) \{[^}]*border-radius: 20px;[^}]*background: var\(--cl-glass\);/);
  assert.match(s, /body\.is-logged-in \.section-tabs \{[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in \.section-tab\[aria-current="page"\] \{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;/);
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\)[^{]*\{[^}]*border-radius: 20px;/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{[^}]*transform: none/);
  assert.match(s, /body\.is-logged-in :is\(\.overview-kpi dd, \.value, \.finance-total-value\) \{[^}]*font-family: var\(--cl-display\);/);
  assert.match(s, /body\.is-logged-in :is\(#error, #info\):not\(:empty\) \{[^}]*border-radius: 16px;/);
});

test("login: no koi, no shader — cream wash, the yellow star, a Bricolage title and a white card with an ink pill", () => {
  const js = read("./dashboard.js");
  assert.doesNotMatch(read("../index.html"), /data-login-koi/);
  assert.doesNotMatch(js, /animal: "koi"/);
  assert.doesNotMatch(js, /mountLoginShader\(host\)/);
  const s = css();
  assert.match(s, /body\.is-logged-out \.login-split \{[^}]*background: var\(--cl-wash-page\);/);
  assert.match(s, /body\.is-logged-out \.login-hero \{[^}]*background: transparent;/);
  assert.match(s, /body\.is-logged-out \.login-hero-copy h1 \{[^}]*font-family: var\(--cl-display\);[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /body\.is-logged-out \.login-card \{[^}]*border-radius: 20px;/);
  assert.match(s, /body\.is-logged-out \.login-card button\.primary\.login-submit \{[^}]*background: var\(--cl-ink\);[^}]*border-radius: 999px;/);
});

test("login: the Google button is never wider than the card it sits in (a 390px phone has ~300px inside the card)", () => {
  assert.match(read("./dashboard.js"), /width: Math\.min\(320, document\.getElementById\("merchantGoogleButton"\)\.clientWidth \|\| 320\)/);
});

test("welcome: cream wash, the star, a Bricolage greeting and a white composer with dark text — no butterflies", () => {
  const welcome = read("./yapi-welcome.mjs");
  assert.doesNotMatch(welcome, /animal: "butterflies"/);
  assert.doesNotMatch(read("../index.html"), /class="yapi-welcome-sky"/);
  const s = css();
  assert.match(s, /\.yapi-welcome \{[^}]*background: var\(--cl-wash-page\);[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /\.yapi-welcome-greeting \{[^}]*font-family: var\(--cl-display\);[^}]*color: var\(--cl-ink\);[^}]*text-shadow: none;/);
  assert.match(s, /\.yapi-welcome-composer \{[^}]*background: var\(--cl-glass-strong\);[^}]*border: 1px solid var\(--cl-glass-edge\);/);
  // Before body takes .is-logged-in too: the welcome opens first.
  assert.match(s, /\n\.yapi-welcome-composer textarea \{[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /\.yapi-welcome-send \{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;/);
});

test("welcome: the focused field draws no box of its own — the composer's ink border is the focus mark", () => {
  assert.match(css(), /\n\.yapi-welcome-composer textarea:is\(:focus, :focus-visible\) \{ outline: none; border: 0; box-shadow: none; \}/);
});

test("no panel paints the old blue", () => {
  for (const file of ["./premium.css", "./calm.css", "./ui-kit.css", "./dashboard.css"]) {
    assert.doesNotMatch(read(file), /#2563eb|#1d4ed8|rgb\(37 99 235/i, file);
  }
});

// Owner 2026-11-16 («make it more glassmorphism»): a soft colour wash behind the whole page, the surfaces frosted glass over it.
test("glass: the page carries the wash, and sidebar, top bar, cards, tabs, dialogs and the YAPI bar are frosted glass", () => {
  const s = css();
  for (const token of ["--cl-glass: rgb(255 255 255 / .5)", "--cl-glass-strong: rgb(255 255 255 / .8)", "--cl-glass-edge: rgb(255 255 255 / .75)",
    "--cl-blur: blur(22px) saturate(160%)", "--cl-wash-page:"]) assert.ok(s.includes(token), token);
  assert.match(s, /body\.is-logged-in \{[^}]*background: var\(--cl-wash-page\);[^}]*background-attachment: fixed;/);
  for (const selector of [/body\.is-logged-in \.dashboard-sidebar \{/, /body\.is-logged-in > \.topbar \{/, /body\.is-logged-in :is\(\.panel, \.card\) \{/,
    /body\.is-logged-in \.section-tabs \{/, /body\.is-logged-in \.overview-kpis \{/, /body\.is-logged-in dialog:not\(\.mcp-dialog\)[^{]*\{/, /body\.is-logged-in \.workspace-yapi \{/]) {
    const rule = new RegExp(selector.source + "[^}]*").exec(s)?.[0] ?? "";
    assert.match(rule, /background: var\(--cl-glass(-strong)?\);/, selector.source);
    assert.match(rule, /backdrop-filter: var\(--cl-blur\);/, selector.source);
    assert.match(rule, /border: 1px solid var\(--cl-glass-edge\);/, selector.source);
  }
  assert.match(s, /body\.is-logged-in \.workspace-header \{[^}]*background: none;/);
  assert.match(s, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{[^]*--cl-glass: rgb\(255 255 255 \/ \.94\)/);
  assert.match(s, /body\.is-logged-out \.login-card \{[^}]*background: var\(--cl-glass-strong\);[^}]*backdrop-filter: var\(--cl-blur\);/);
  assert.match(s, /\.yapi-welcome-composer \{[^}]*background: var\(--cl-glass-strong\);[^}]*backdrop-filter: var\(--cl-blur\);/);
});

test("glass: titles and descriptions read on the bare wash, and every text token reads on frost over its deepest colours", () => {
  const blobs = ["#c9e9d6", "#f8d5c0", "#dcdff5"];
  // Page titles and descriptions sit straight on the wash.
  for (const ground of blobs) for (const text of ["--cl-ink", "--cl-ink-soft"]) {
    const value = ratio(token(text), ground);
    assert.ok(value >= 4.5, `${text} on ${ground}: ${value.toFixed(2)}`);
  }
  // Everything else sits in a card: white at the glass alpha over the deepest blob.
  const alpha = Number(/--cl-glass: rgb\(255 255 255 \/ (\.\d+)\)/.exec(css())[1]);
  const frost = (hex) => "#" + [1, 3, 5].map((i) => Math.round(255 * alpha + parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("");
  for (const ground of blobs.map(frost)) for (const text of ["--cl-ink", "--cl-ink-soft", "--cl-text-faint", "--cl-green-text", "--cl-red-text"]) {
    const value = ratio(token(text), ground);
    assert.ok(value >= 4.5, `${text} on frost ${ground}: ${value.toFixed(2)}`);
  }
  assert.ok(blobs.every((blob) => css().includes(blob)), "the wash uses these colours");
});

test("Inicio's store card is glass like the panels", () => {
  assert.match(css(), /body\.is-logged-in \.overview-store \{[^}]*background: var\(--cl-glass\);[^}]*backdrop-filter: var\(--cl-blur\);/);
});

// Final review 2026-11-16: the slate card's white text must not reach the payout-hold warning (white on pale pink).
test("on the slate «Tu cuenta» card the payout-hold warning keeps its own red on pink", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.panel\.overview-account :is\(h2, dt, dd, p:not\(\.payout-hold-banner\), a\) \{ color: inherit; \}/);
  assert.match(s, /body\.is-logged-in \.panel\.overview-account \.payout-hold-banner \{[^}]*background: var\(--cl-red-soft\);[^}]*color: var\(--cl-red-text\);/);
});

// Final review 2026-11-16: an ink focus ring vanishes on dark surfaces (the slate card, the dark «Conecta tu IA» dialog).
test("keyboard focus stays visible on the slate card and the dark MCP dialog", () => {
  assert.match(css(), /body\.is-logged-in :is\(\.panel\.overview-account, \.mcp-dialog\) :focus-visible \{ outline-color: #fff; \}/);
});
