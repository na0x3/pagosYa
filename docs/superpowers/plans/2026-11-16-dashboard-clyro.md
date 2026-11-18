# Dashboard in the Clyro look — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The merchant dashboard (every panel, the login and YAPI's welcome) wears the new pagosYa site's Clyro look: cream paper, ink
pills, Bricolage Grotesque titles, Onest text, the YAPI star as the only yellow.

**Architecture:** One new stylesheet `apps/merchant-dashboard/src/clyro.css`, linked after every other one, remaps the existing tokens
(`--pg-*`, `--pm-*`, `--calm-*`, `--bento-*`) and restyles the shell, the shared controls, the login and the welcome. The two
fonts are self-hosted woff2 files served like `instrument-serif.ttf`. `dashboard.js` stops mounting the koi on the login and
`yapi-welcome.mjs` stops mounting the butterflies. Unit tests read the CSS/HTML/JS as text (the `premium.test.mjs` pattern); a
Playwright script takes before/after screenshots of every screen at 1440 and 390 and reports sideways scroll.

**Tech Stack:** vanilla JS + CSS, `node --test` unit tests, Playwright (`@playwright/test`, already a dev dependency) for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-16-dashboard-clyro-design.md`

## Global Constraints

- Tokens: paper `#fdfcf6`, ink `#17191c`, ink-soft `#5d6066`, line `#e7e5dc`, slate `#233a4a`, night `#15191c`, yellow `#ffd82f` (only
  YAPI's star), green `#3f9d6b`, red `#d9534f`, surface `#ffffff`.
- Titles: Bricolage Grotesque 500, letter-spacing −0.05em, line-height 1.02. Everything else: Onest 400/500/600.
- Buttons: pills (`border-radius: 9999px`), primary ink with white text, secondary white with a line border, press scales to .97.
- Cards: white, 1px line border, radius 20px, faint shadow. Inputs: white, line border, radius 12px, ink focus ring.
- Pastel wash (exact, from the site): `radial-gradient(60% 55% at 12% 30%, #dcefe4 0%, transparent 70%), radial-gradient(55% 60% at 88% 22%, #f9e7da 0%, transparent 70%), radial-gradient(70% 50% at 50% 80%, #f6e1d3 0%, transparent 75%), #fdfcf6`.
- Motion: `cubic-bezier(0.22, 1, 0.36, 1)`, 160–300 ms; `prefers-reduced-motion` respected.
- Not changing: the Studio editor, storefronts, the API, behaviour, copy, layout order.
- Text contrast ≥ 4.5:1 on cream and white; no sideways scroll at 390; focus rings visible.
- Owner rules: light checks (the touched files' tests, `node --test <files>`, never the whole suite at once); pagosYaWeb is read
  only; never print the session token; work stays on `oct24-clean`, commit per task, no push.

## Review Focus

1. Status text (green/red) on white or soft tints — the spec's `#3f9d6b`/`#d9534f` are under 4.5:1 as text; text must use darker
   shades. Pinned by the contrast test in Task 1.
2. A panel that still paints the old blue (`#2563eb`, `rgb(37 99 235 …)`) or Instrument Serif because it hard-codes them instead of
   reading tokens. Pinned by the "no blue, no serif" test in Task 1 and the screen pass in Task 6.
3. The login without JavaScript-mounted animation must still be laid out (the old `.has-koi` rules no longer apply, the shader host
   stays empty). Pinned by Task 4's tests and screenshots.
4. Phone width: the frosted top-bar pill and the sidebar's horizontal scroller must not push the page sideways. Pinned by the
   screenshot script's `scrollWidth > innerWidth` check in Task 6.
5. Dark overlays that lean on the old dark welcome (`.yapi-welcome textarea` colour `#ececec`) become unreadable on cream. Pinned by
   Task 5's test on the welcome's text colours.

---

### Task 1: Fonts, `clyro.css` tokens, linked last

**Files:**
- Create: `apps/merchant-dashboard/fonts/bricolage-grotesque.woff2`, `apps/merchant-dashboard/fonts/onest.woff2`,
  `apps/merchant-dashboard/fonts/Clyro-fonts-OFL.txt`
- Create: `apps/merchant-dashboard/src/clyro.css`
- Create: `apps/merchant-dashboard/src/clyro.test.mjs`
- Create: `apps/merchant-dashboard/scripts/screens.mjs` (screenshot + overflow script, used for "before" now and "after" in Task 6)
- Modify: `apps/merchant-dashboard/index.html` (link after `yapi-welcome.css`), `apps/merchant-dashboard/server.mjs` (serve
  `/src/clyro.css` and the two fonts), `apps/merchant-dashboard/src/premium.test.mjs` (its "linked last" test now expects
  `premium.css` followed by the other links, not `</head>`)

**Interfaces:**
- Produces: CSS custom properties on `body.is-logged-in` and `body.is-logged-out`: `--cl-paper --cl-ink --cl-ink-soft --cl-line
  --cl-slate --cl-night --cl-yellow --cl-green --cl-red --cl-surface --cl-wash --cl-display --cl-body --cl-ease`, plus the remapped
  `--pg-*`/`--pm-*`/`--calm-*`. Later tasks only read these.
- Produces: `node scripts/screens.mjs <outDir>` — writes `<view>-desktop.jpg` / `<view>-phone.jpg` for `login`, `welcome`,
  `dashboard-overview`, `dashboard-products`, `dashboard-payments`, `dashboard-charge-links`, `dashboard-payouts`,
  `dashboard-marketing`, `dashboard-store-settings`, `dashboard-stores`, and prints one JSON line per shot with `overflow: true|false`.

- [ ] **Step 1: Before screenshots**

Write `scripts/screens.mjs` (token file path from `PAGOSYA_SESSION_FILE`, read, never printed):

```js
// node scripts/screens.mjs <outDir> — screenshots every dashboard screen at 1440 and 390 for the Clyro restyle
// (spec 2026-11-16) and reports sideways scroll. Session token from the JSON file in PAGOSYA_SESSION_FILE (never printed).
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const token = JSON.parse(readFileSync(process.env.PAGOSYA_SESSION_FILE, "utf8")).token;
const VIEWS = ["dashboard-overview", "dashboard-products", "dashboard-payments", "dashboard-charge-links", "dashboard-payouts",
  "dashboard-marketing", "dashboard-store-settings", "dashboard-stores"];
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const browser = await chromium.launch();
for (const [size, viewport] of Object.entries(SIZES)) {
  const anon = await browser.newPage({ viewport });
  await anon.goto("http://localhost:4323/", { waitUntil: "networkidle" }).catch(() => {});
  await anon.waitForTimeout(800);
  await anon.screenshot({ path: `${out}/login-${size}.jpg`, quality: 70 });
  console.log(JSON.stringify({ view: "login", size, overflow: await overflow(anon) }));
  await anon.close();
  const context = await browser.newContext({ viewport });
  await context.addInitScript((t) => { try { sessionStorage.setItem("pagosya_merchant_session", t); } catch {} }, token);
  const page = await context.newPage();
  await page.goto("http://localhost:4323/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const go = page.getByText("Ir a mi panel").first();
  if (await go.isVisible().catch(() => false)) {
    await page.screenshot({ path: `${out}/welcome-${size}.jpg`, quality: 70 });
    console.log(JSON.stringify({ view: "welcome", size, overflow: await overflow(page) }));
    await go.click(); await page.waitForTimeout(1200);
  }
  for (const view of VIEWS) {
    await page.evaluate((hash) => { location.hash = hash; }, view);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/${view}-${size}.jpg`, quality: 70, fullPage: size === "phone" });
    console.log(JSON.stringify({ view, size, overflow: await overflow(page) }));
  }
  await context.close();
}
await browser.close();
```

Run: `cd apps/merchant-dashboard && PAGOSYA_SESSION_FILE=<live.json> node scripts/screens.mjs <scratchpad>/clyro/before`
Expected: 20 JSON lines (welcome may be missing if it was already seen this visit), JPGs in `before/`.

- [ ] **Step 2: Write the failing test** — `src/clyro.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/clyro.test.mjs`
Expected: FAIL — `ENOENT … clyro.css` / link not found.

- [ ] **Step 4: Fonts** — resolve the current versions with `npm view @fontsource-variable/bricolage-grotesque version` and
`npm view @fontsource-variable/onest version`, then download (pinned versions) from
`https://cdn.jsdelivr.net/npm/@fontsource-variable/bricolage-grotesque@<v>/files/bricolage-grotesque-latin-wght-normal.woff2` and
`https://cdn.jsdelivr.net/npm/@fontsource-variable/onest@<v>/files/onest-latin-wght-normal.woff2` into
`fonts/bricolage-grotesque.woff2` and `fonts/onest.woff2`; `file` must say "Web Open Font Format (Version 2)". Write
`fonts/Clyro-fonts-OFL.txt` naming both families, their versions, source URLs and "SIL Open Font License 1.1".

- [ ] **Step 5: Serve them and link the sheet**

`server.mjs`, next to the Instrument Serif route:

```js
    if (requestUrl.pathname === "/fonts/bricolage-grotesque.woff2" || requestUrl.pathname === "/fonts/onest.woff2") {
      // The Clyro look's titles and text (spec 2026-11-16). SIL Open Font License: fonts/Clyro-fonts-OFL.txt.
      const font = await readFile(path.join(dirname, requestUrl.pathname.slice(1)));
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=604800" });
      res.end(font);
      return;
    }
```

…and add `"/src/clyro.css"` to the served `/src` list. `index.html`: `<link rel="stylesheet" href="/src/clyro.css">` after the
`yapi-welcome.css` link. `premium.test.mjs` first test: replace `<\/head>` in its regex with `\n<link rel="stylesheet" href="\/src\/yapi-welcome\.css">`.

- [ ] **Step 6: `src/clyro.css` tokens**

```css
/* The new pagosYa site's look (Clyro) on the whole panel, the login and YAPI's welcome — spec
   docs/superpowers/specs/2026-11-16-dashboard-clyro-design.md, values from pagosYaWeb globals.css `.cl`. Linked after every other
   sheet: it remaps the tokens calm.css and premium.css set, then restyles what reads no token. Studio is untouched. */
@font-face { font-family: "Bricolage Grotesque"; src: url("/fonts/bricolage-grotesque.woff2") format("woff2"); font-weight: 200 800; font-display: swap; }
@font-face { font-family: "Onest"; src: url("/fonts/onest.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }

body.is-logged-in, body.is-logged-out {
  --cl-paper: #fdfcf6; --cl-ink: #17191c; --cl-ink-soft: #5d6066; --cl-text-faint: #6b6d72; --cl-line: #e7e5dc; --cl-slate: #233a4a;
  --cl-night: #15191c; --cl-yellow: #ffd82f; --cl-surface: #ffffff;
  --cl-green: #3f9d6b; --cl-green-text: #2c7550; --cl-green-soft: #e6f3ec;
  --cl-red: #d9534f; --cl-red-text: #b13a36; --cl-red-soft: #fbeceb;
  --cl-ease: cubic-bezier(.22,1,.36,1);
  --cl-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --cl-body: "Onest", ui-sans-serif, system-ui, sans-serif;
  --cl-wash: radial-gradient(60% 55% at 12% 30%, #dcefe4 0%, transparent 70%), radial-gradient(55% 60% at 88% 22%, #f9e7da 0%, transparent 70%),
    radial-gradient(70% 50% at 50% 80%, #f6e1d3 0%, transparent 75%), #fdfcf6;
  --cl-shadow: 0 1px 2px rgb(23 25 28 / .04), 0 10px 30px -22px rgb(23 25 28 / .22);
  --cl-shadow-float: 0 10px 30px -18px rgb(23 25 28 / .35), 0 2px 8px rgb(23 25 28 / .05);
}
body.is-logged-in {
  --pg-font-sans: var(--cl-body); --pm-serif: var(--cl-display); --pm-ease: var(--cl-ease);
  --pm-bg: var(--cl-paper); --pm-glass: rgb(253 252 246 / .8); --pm-glass-strong: rgb(253 252 246 / .94); --pm-glass-edge: var(--cl-line);
  --pm-shadow-card: var(--cl-shadow); --pm-shadow-float: var(--cl-shadow-float); --pm-shadow-lift: var(--cl-shadow);
  --pm-hover: rgb(23 25 28 / .06); --pm-active: rgb(23 25 28 / .08); --pm-field: var(--cl-surface);
  --pg-bg: var(--cl-paper); --pg-surface: var(--cl-surface); --pg-surface-raised: var(--cl-surface); --pg-surface-muted: #f4f2ea; --workspace-sidebar: transparent;
  --pg-text: var(--cl-ink); --pg-text-muted: var(--cl-ink-soft); --pg-text-faint: var(--cl-text-faint);
  --pg-border: var(--cl-line); --pg-border-strong: #d6d3c6;
  --pg-ink: var(--cl-ink); --pg-ink-hover: #000; --pg-accent: var(--cl-ink); --pg-accent-soft: rgb(23 25 28 / .06);
  --pg-brand: var(--cl-ink); --pg-brand-hover: #000; --pg-brand-text: #fff;
  --pg-success: var(--cl-green-text); --pg-success-soft: var(--cl-green-soft); --pg-error: var(--cl-red-text); --pg-error-soft: var(--cl-red-soft);
  --pg-warning: #8a5a12; --pg-warning-soft: #fbf1df;
  --pg-focus-ring: rgb(23 25 28 / .18);
  --calm-radius: 20px; --calm-radius-sm: 12px; --calm-shadow: var(--cl-shadow); --calm-shadow-lg: var(--cl-shadow-float);
  background: var(--cl-paper); background-attachment: scroll; color: var(--cl-ink); font-family: var(--cl-body);
}
html:has(> body.is-logged-in), html:has(> body.is-logged-out) { background: #fdfcf6; }
```

(`--pg-warning #8a5a12` on white is 6.0:1. The ruling on green/red text shades is recorded in the ledger.)

- [ ] **Step 7: Run tests**

Run: `node --test src/clyro.test.mjs src/premium.test.mjs unit/served-modules.test.mjs`
Expected: PASS. If a contrast assertion fails, darken that token until it passes (ledger the value).

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-dashboard/{fonts,src/clyro.css,src/clyro.test.mjs,scripts/screens.mjs,index.html,server.mjs,src/premium.test.mjs}
git commit -m "feat(dashboard): Clyro look, part 1 — self-hosted Bricolage Grotesque + Onest and clyro.css remapping the panel's tokens"
```

---

### Task 2: Shell — sidebar, nav pill, top bar, YAPI bar, page titles

**Files:** Modify `apps/merchant-dashboard/src/clyro.css`, `apps/merchant-dashboard/src/clyro.test.mjs`

**Interfaces:** Consumes Task 1 tokens. Selectors already in the page: `.dashboard-sidebar`, `.dashboard-nav-button[aria-current="page"]`,
`body.is-logged-in > .topbar`, `.workspace-yapi`, `.workspace-yapi button.primary`, `.workspace-yapi-star`, `.workspace-header`,
`.workspace-title`, `.workspace-description`, `.panel .section-head h2`, `.ui-head h3`, `.overview-greeting`.

- [ ] **Step 1: Failing test** (append):

```js
test("shell: cream sidebar with an ink pill for the page, a frosted pill top bar, the YAPI bar as a white pill", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in \.dashboard-sidebar \{[^}]*background: var\(--cl-paper\);/);
  assert.match(s, /body\.is-logged-in \.dashboard-nav-button\[aria-current="page"\][^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in > \.topbar \{[^}]*border-radius: 999px;[^}]*backdrop-filter: blur\(20px\)/);
  assert.match(s, /body\.is-logged-in \.workspace-yapi \{[^}]*background: var\(--cl-surface\);[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in :is\(\.workspace-title, \.panel \.section-head h2, \.ui-head h3, \.overview-greeting\) \{[^}]*font-family: var\(--cl-display\);[^}]*font-weight: 500;[^}]*letter-spacing: -\.05em;/);
  assert.match(s, /body\.is-logged-in \.workspace-header \{[^}]*background: var\(--cl-wash\);/);
  // The one slate band per screen: Inicio's balance card.
  assert.match(s, /body\.is-logged-in \.overview-balance \{[^}]*background: var\(--cl-slate\);[^}]*color: #fff;/);
});
```

- [ ] **Step 2: Run** `node --test src/clyro.test.mjs` — Expected: FAIL on the new test only.

- [ ] **Step 3: Implement** (append to `clyro.css`):

```css
/* ── Shell ─────────────────────────────────────────────── */
body.is-logged-in .dashboard-sidebar { background: var(--cl-paper); border-right: 1px solid var(--cl-line); box-shadow: none;
  -webkit-backdrop-filter: none; backdrop-filter: none; }
body.is-logged-in .dashboard-nav-button { border-radius: 999px; color: var(--cl-ink-soft); font: 500 15px/1.2 var(--cl-body);
  transition: background-color .16s var(--cl-ease), color .16s var(--cl-ease); }
body.is-logged-in .dashboard-nav-button:hover { background: rgb(23 25 28 / .06); color: var(--cl-ink); }
body.is-logged-in .dashboard-nav-button[aria-current="page"],
body.is-logged-in .dashboard-nav-group > .dashboard-nav-button:not(.dashboard-nav-summary)[aria-current="page"] {
  background: var(--cl-ink); border-color: var(--cl-ink); color: #fff; box-shadow: none; border-radius: 999px; }
body.is-logged-in .dashboard-nav-button[aria-current="page"] .dashboard-nav-icon { color: #fff; }
body.is-logged-in > .topbar { margin: 10px auto 0; max-width: 64rem; border: 1px solid var(--cl-line); border-radius: 999px;
  background: rgb(253 252 246 / .8); box-shadow: var(--cl-shadow-float); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
body.is-logged-in .workspace-yapi { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 999px; box-shadow: var(--cl-shadow-float); }
body.is-logged-in .workspace-yapi button.primary { border-radius: 999px; }
body.is-logged-in :is(.workspace-title, .panel .section-head h2, .ui-head h3, .overview-greeting) {
  font-family: var(--cl-display); font-weight: 500; letter-spacing: -.05em; line-height: 1.02; color: var(--cl-ink); }
body.is-logged-in .workspace-title { font-size: clamp(34px, 4.4vw, 52px); }
body.is-logged-in .workspace-header { background: var(--cl-wash); border-radius: 28px; padding: 28px 28px 24px; }
body.is-logged-in .workspace-description { color: var(--cl-ink-soft); }
body.is-logged-in .overview-balance { background: var(--cl-slate); border-color: var(--cl-slate); color: #fff; }
body.is-logged-in .overview-balance :is(dt, dd, p, span, strong, small, a) { color: inherit; }
```

- [ ] **Step 4: Run** `node --test src/clyro.test.mjs` — Expected: PASS. Look at Inicio at 1440 and 390 (`node scripts/screens.mjs
<scratchpad>/clyro/t2`, open `dashboard-overview-*.jpg`): the top bar pill must not overflow at 390 (`overflow:false`). Where the
existing sheets win on specificity, raise the selector (e.g. `body.is-logged-in[data-dashboard-view]`) and update the test regex.

- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): Clyro look, part 2 — shell: cream sidebar, ink nav pill, frosted top bar, YAPI pill, Bricolage titles on the wash"`

---

### Task 3: Shared controls

**Files:** Modify `apps/merchant-dashboard/src/clyro.css`, `apps/merchant-dashboard/src/clyro.test.mjs`

**Interfaces:** Consumes Task 1 tokens. Existing selectors (from premium.css/ui-kit.css): `button:is(.primary, .secondary, .ghost)`,
`.button-like`, `.section-tabs`, `.ui-tabs`, `input/select/textarea`, `:is(.panel, .card)`, `th, td`, `.badge`, `.ui-pill`,
`dialog:not(.mcp-dialog)`, `.profile-menu`, `#error`, `#info`.

- [ ] **Step 1: Failing test**:

```js
test("controls: ink and white pills that press, segmented tabs, 12px fields with an ink ring, white 20px cards, soft status pills", () => {
  const s = css();
  assert.match(s, /body\.is-logged-in button\.primary[^{]*\{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in button:is\(\.secondary, \.ghost\)[^{]*\{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);/);
  assert.match(s, /:active \{ transform: scale\(\.97\); \}/);
  assert.match(s, /body\.is-logged-in :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\), select, textarea\) \{[^}]*border-radius: 12px;/);
  assert.match(s, /:focus-visible \{[^}]*box-shadow: 0 0 0 3px var\(--pg-focus-ring\);/);
  assert.match(s, /body\.is-logged-in :is\(\.panel, \.card\) \{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);[^}]*border-radius: 20px;/);
  assert.match(s, /body\.is-logged-in \.section-tabs \{[^}]*border-radius: 999px;/);
  assert.match(s, /body\.is-logged-in dialog:not\(\.mcp-dialog\) \{[^}]*border-radius: 20px;/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{[^}]*transform: none/);
  assert.match(s, /body\.is-logged-in :is\(\.overview-kpi dd, \.value, \.finance-total-value\) \{[^}]*font-family: var\(--cl-display\);/);
  assert.match(s, /body\.is-logged-in :is\(#error, #info\):not\(:empty\) \{[^}]*border-radius: 999px;/);
});
```

- [ ] **Step 2: Run** — Expected: FAIL on this test.

- [ ] **Step 3: Implement**:

```css
/* ── Controls ──────────────────────────────────────────── */
body.is-logged-in button.primary, body.is-logged-in .button-like.primary { background: var(--cl-ink); border: 1px solid var(--cl-ink); color: #fff;
  border-radius: 999px; font: 500 15px/1 var(--cl-body); box-shadow: none; transition: transform .16s var(--cl-ease), background-color .16s; }
body.is-logged-in button.primary:hover { background: #000; border-color: #000; }
body.is-logged-in button:is(.secondary, .ghost), body.is-logged-in .button-like:not(.primary) { background: var(--cl-surface); border: 1px solid var(--cl-line);
  color: var(--cl-ink); border-radius: 999px; font: 500 15px/1 var(--cl-body); box-shadow: none; transition: transform .16s var(--cl-ease), border-color .16s; }
body.is-logged-in button:is(.secondary, .ghost):hover { border-color: #cfccbf; background: var(--cl-surface); }
body.is-logged-in :is(button.primary, button.secondary, button.ghost, .button-like):active { transform: scale(.97); }
body.is-logged-in :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea) { background: var(--cl-surface);
  border: 1px solid var(--cl-line); border-radius: 12px; color: var(--cl-ink); font-family: var(--cl-body); box-shadow: none; }
body.is-logged-in :is(input, select, textarea):focus-visible { border-color: var(--cl-ink); outline: none; box-shadow: 0 0 0 3px var(--pg-focus-ring); }
body.is-logged-in :is(button, a, summary, [tabindex]):focus-visible { outline: 2px solid var(--cl-ink); outline-offset: 2px; }
body.is-logged-in :is(.panel, .card) { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 20px; box-shadow: var(--cl-shadow); }
body.is-logged-in .section-tabs { background: rgb(253 252 246 / .86); border: 1px solid var(--cl-line); border-radius: 999px; padding: 4px; box-shadow: none; }
body.is-logged-in .section-tabs :is(a, button)[aria-current="page"], body.is-logged-in .section-tabs :is(a, button)[aria-selected="true"] {
  background: var(--cl-ink); color: #fff; border-radius: 999px; }
body.is-logged-in :is(th) { color: var(--cl-ink-soft); font: 500 13px/1.3 var(--cl-body); letter-spacing: 0; text-transform: none; }
body.is-logged-in :is(th, td) { border-color: var(--cl-line); }
body.is-logged-in .badge { border-radius: 999px; font: 500 12.5px/1 var(--cl-body); }
body.is-logged-in dialog:not(.mcp-dialog), body.is-logged-in .profile-menu { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 20px;
  box-shadow: var(--cl-shadow-float); -webkit-backdrop-filter: none; backdrop-filter: none; }
body.is-logged-in :is(.overview-kpi dd, .value, .finance-total-value) { font-family: var(--cl-display); font-weight: 500; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
body.is-logged-in :is(#error, #info):not(:empty) { border-radius: 999px; border: 1px solid var(--cl-line); background: var(--cl-surface); box-shadow: var(--cl-shadow-float); font-family: var(--cl-body); }
body.is-logged-in #error:not(:empty) { color: var(--cl-red-text); }
@media (prefers-reduced-motion: reduce) { body.is-logged-in :is(button.primary, button.secondary, button.ghost, .button-like):active { transform: none; } }
```

- [ ] **Step 4: Run** `node --test src/clyro.test.mjs src/premium.test.mjs` — Expected: PASS. Screens: `node scripts/screens.mjs
<scratchpad>/clyro/t3`; check Tienda › Productos and Ajustes on desktop for buttons/tabs/fields. Fix specificity losses by raising
the selector, and keep the test regexes in step.

- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): Clyro look, part 3 — pill buttons, segmented tabs, fields, cards, tables, badges, dialogs"`

---

### Task 4: Login in the site's look

**Files:** Modify `apps/merchant-dashboard/src/dashboard.js:1215-1235` (startLoginShader), `apps/merchant-dashboard/index.html`
(remove the `<canvas class="login-pond" data-login-koi>`), `apps/merchant-dashboard/src/clyro.css`, `apps/merchant-dashboard/src/clyro.test.mjs`

**Interfaces:** Consumes Task 1 tokens. `startLoginShader()` / `stopLoginShader()` keep their names and callers; they no longer
mount anything. `login-shader.mjs` and `ascii-animals.mjs` stay on disk (spec), `yapi-welcome.mjs` keeps `mountAsciiAnimals` exported.

- [ ] **Step 1: Failing test**:

```js
test("login: no koi, no shader — cream wash, the yellow star, a Bricolage title and a white card with an ink pill", () => {
  const js = read("./dashboard.js");
  assert.doesNotMatch(html, /data-login-koi/);
  assert.doesNotMatch(js, /animal: "koi"/);
  assert.doesNotMatch(js, /mountLoginShader\(host\)/);
  const s = css();
  assert.match(s, /body\.is-logged-out \.login-split \{[^}]*background: var\(--cl-wash\);/);
  assert.match(s, /body\.is-logged-out \.login-hero \{[^}]*background: transparent;/);
  assert.match(s, /body\.is-logged-out \.login-hero-copy h1 \{[^}]*font-family: var\(--cl-display\);[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /body\.is-logged-out \.login-card \{[^}]*background: var\(--cl-surface\);[^}]*border-radius: 20px;/);
  assert.match(s, /body\.is-logged-out \.login-card button\.primary\.login-submit \{[^}]*background: var\(--cl-ink\);[^}]*border-radius: 999px;/);
});
```

- [ ] **Step 2: Run** — Expected: FAIL (`data-login-koi` still in the HTML).

- [ ] **Step 3: Implement**

`dashboard.js` — replace the koi block (comment + `LOGIN_POND` + `startLoginShader` body) with:

```js
  // The login wears the site's cream wash (spec 2026-11-16, Clyro): nothing to mount any more. The koi (ascii-animals.mjs) and
  // the mesh shader (login-shader.mjs) stay on disk; these two keep their callers.
  let disposeLoginShader = null;
  function startLoginShader() {}
  function stopLoginShader() { disposeLoginShader?.(); disposeLoginShader = null; }
```

`index.html` — delete the `<canvas class="login-pond" data-login-koi aria-hidden="true"></canvas>` line.

`clyro.css`:

```css
/* ── Login ─────────────────────────────────────────────── */
body.is-logged-out { background: var(--cl-paper); color: var(--cl-ink); font-family: var(--cl-body); }
body.is-logged-out .login-split { background: var(--cl-wash); min-height: 100dvh; }
body.is-logged-out .login-hero { background: transparent; color: var(--cl-ink); box-shadow: none; }
body.is-logged-out .login-hero-shader { display: none; }
body.is-logged-out .login-hero-copy h1 { font-family: var(--cl-display); font-weight: 500; letter-spacing: -.05em; line-height: 1.02; color: var(--cl-ink); text-shadow: none; }
body.is-logged-out .login-hero-copy p { color: var(--cl-ink-soft); text-shadow: none; }
body.is-logged-out .login-hero-cards li { background: rgb(255 255 255 / .7); border: 1px solid var(--cl-line); border-radius: 16px; box-shadow: none; }
body.is-logged-out .login-hero-cards strong { color: var(--cl-ink); font-family: var(--cl-display); font-weight: 500; letter-spacing: -.03em; }
body.is-logged-out .login-hero-cards span { color: var(--cl-ink-soft); }
body.is-logged-out .login-card { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 20px; box-shadow: var(--cl-shadow-float); color: var(--cl-ink); }
body.is-logged-out .login-card h2 { font-family: var(--cl-display); font-weight: 500; letter-spacing: -.05em; line-height: 1.02; color: var(--cl-ink); }
body.is-logged-out :is(.login-sub, .login-switch, .login-terms, .login-foot) { color: var(--cl-ink-soft); }
body.is-logged-out .login-card input:not([type="checkbox"]) { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 12px; color: var(--cl-ink); }
body.is-logged-out .login-card input:not([type="checkbox"]):focus { border-color: var(--cl-ink); box-shadow: 0 0 0 3px rgb(23 25 28 / .18); outline: none; }
body.is-logged-out .login-card button.primary.login-submit { background: var(--cl-ink); border: 1px solid var(--cl-ink); color: #fff; border-radius: 999px; font-weight: 500;
  transition: transform .16s var(--cl-ease), background-color .16s; }
body.is-logged-out .login-card button.primary.login-submit:hover { background: #000; }
body.is-logged-out .login-card button.primary.login-submit:active { transform: scale(.97); }
body.is-logged-out :is(.login-forgot, .login-switch button) { color: var(--cl-ink); }
```

- [ ] **Step 4: Run** `node --test src/clyro.test.mjs unit/login-shader.test.mjs unit/served-modules.test.mjs` — Expected: PASS.
Screens: login at 1440 and 390, `overflow:false`, form readable.

- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): Clyro look, part 4 — the login on the site's cream wash with the star, Bricolage title and a white card (koi retired)"`

---

### Task 5: YAPI's welcome in the site's look

**Files:** Modify `apps/merchant-dashboard/src/yapi-welcome.mjs` (stop mounting butterflies), `apps/merchant-dashboard/index.html`
(remove `<canvas class="yapi-welcome-sky">`), `apps/merchant-dashboard/src/clyro.css`, `apps/merchant-dashboard/src/clyro.test.mjs`

**Interfaces:** `showYapiWelcome({ root, greeting, onAsk, onClose })` keeps its signature and behaviour; `mountAsciiAnimals` stays exported.

- [ ] **Step 1: Failing test**:

```js
test("welcome: cream wash, the star, a Bricolage greeting and a white composer with dark text — no butterflies", () => {
  const welcome = read("./yapi-welcome.mjs");
  assert.doesNotMatch(welcome, /animal: "butterflies"/);
  assert.doesNotMatch(html, /class="yapi-welcome-sky"/);
  const s = css();
  assert.match(s, /\.yapi-welcome \{[^}]*background: var\(--cl-wash\);[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /\.yapi-welcome-greeting \{[^}]*font-family: var\(--cl-display\);[^}]*color: var\(--cl-ink\);[^}]*text-shadow: none;/);
  assert.match(s, /\.yapi-welcome-composer \{[^}]*background: var\(--cl-surface\);[^}]*border: 1px solid var\(--cl-line\);/);
  assert.match(s, /body\.is-logged-in \.yapi-welcome textarea \{[^}]*color: var\(--cl-ink\);/);
  assert.match(s, /\.yapi-welcome-send \{[^}]*background: var\(--cl-ink\);[^}]*color: #fff;/);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

`yapi-welcome.mjs`: delete the `let stopAnimals …` / `void mountAsciiAnimals(…butterflies…)` block and the `stopAnimals()` call in
`done`; update the header comment («ASCII butterflies … dark screen» → «the site's cream wash, the star, the greeting and one white
box (spec 2026-11-16, Clyro)»). `index.html`: delete `<canvas class="yapi-welcome-sky" aria-hidden="true"></canvas>`.

`clyro.css`:

```css
/* ── YAPI's welcome ────────────────────────────────────── */
.yapi-welcome { background: var(--cl-wash); color: var(--cl-ink); }
.yapi-welcome-star { filter: drop-shadow(0 10px 24px rgb(23 25 28 / .12)); }
.yapi-welcome-greeting { font-family: var(--cl-display); font-weight: 500; letter-spacing: -.05em; line-height: 1.02; color: var(--cl-ink); text-shadow: none;
  font-size: clamp(30px, 6vw, 48px); }
.yapi-welcome-composer { background: var(--cl-surface); border: 1px solid var(--cl-line); border-radius: 24px; box-shadow: var(--cl-shadow-float);
  -webkit-backdrop-filter: none; backdrop-filter: none; font-family: var(--cl-body); }
.yapi-welcome-liquid .yapi-welcome-composer { backdrop-filter: none; }
.yapi-welcome-composer::after { display: none; }
.yapi-welcome-composer:focus-within { border-color: var(--cl-ink); box-shadow: 0 0 0 3px rgb(23 25 28 / .12), var(--cl-shadow-float); }
body.is-logged-in .yapi-welcome textarea { color: var(--cl-ink); caret-color: var(--cl-ink); font-family: var(--cl-body); }
.yapi-welcome-composer textarea::placeholder { color: var(--cl-text-faint); }
.yapi-welcome-field svg { color: var(--cl-text-faint); }
.yapi-welcome-note { color: #8a5a12; }
.yapi-welcome-send { background: var(--cl-ink); color: #fff; }
.yapi-welcome-skip { color: var(--cl-ink-soft); font-family: var(--cl-body); }
.yapi-welcome-skip:hover { color: var(--cl-ink); background: rgb(23 25 28 / .06); }
.yapi-welcome :focus-visible { outline: 2px solid var(--cl-ink); }
```

- [ ] **Step 4: Run** `node --test src/clyro.test.mjs src/yapi-welcome.test.mjs unit/served-modules.test.mjs` — Expected: PASS.
Screens: the welcome at 1440 and 390.

- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): Clyro look, part 5 — YAPI's welcome on the cream wash with a white composer (butterflies retired)"`

---

### Task 6: Screen pass, after screenshots, contact sheets

**Files:** Modify `apps/merchant-dashboard/src/clyro.css` (+ its test for each fix), possibly `apps/merchant-dashboard/src/premium.css`
only where a rule there hard-codes blue (`#2563eb`, `rgb(37 99 235`, `#1d4ed8`) — replace by the matching token.

- [ ] **Step 1: After screenshots** — `node scripts/screens.mjs <scratchpad>/clyro/after`. Open every JPG. For each screen list what
still shows the old look (blue, serif, grey `#fafaf9` ground, square buttons, dark text-shadows) or breaks (`overflow:true`).
- [ ] **Step 2: Hard-coded blue** — failing test first:

```js
test("no panel paints the old blue", () => {
  for (const file of ["./premium.css", "./calm.css", "./ui-kit.css", "./dashboard.css"]) {
    assert.doesNotMatch(read(file), /#2563eb|#1d4ed8|rgb\(37 99 235/i, file);
  }
});
```

Run → FAIL on premium.css; replace each hit with `var(--pg-ink)` / `var(--pg-ink-hover)` / `var(--pg-accent-soft)`, and in
`premium.test.mjs` update the token assertion `'--pg-ink: #2563eb'` and the blue-wash regex to what premium.css now holds (premium's
own wash stays; clyro.css paints over it). Run → PASS.
- [ ] **Step 3: Each remaining finding** from Step 1 → one assertion in `clyro.test.mjs` (RED), the rule in `clyro.css` (GREEN).
- [ ] **Step 4: Run** `node --test src/clyro.test.mjs src/premium.test.mjs src/yapi-welcome.test.mjs unit/served-modules.test.mjs unit/login-shader.test.mjs`
and the screenshot script again — Expected: all PASS, every shot `overflow:false`.
- [ ] **Step 5: Contact sheets** — build `before.jpg` and `after.jpg` (desktop + phone grids) with sharp
(`apps/api/node_modules/sharp`) into the scratchpad; show both to the owner.
- [ ] **Step 6: Commit** — `git commit -m "feat(dashboard): Clyro look, part 6 — screen pass: no old blue, fixes from the before/after screenshots"`
