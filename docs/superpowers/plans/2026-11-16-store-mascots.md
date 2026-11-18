# Store mascots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** YAPI's star family summarises the store in real numbers on Inicio (four glass cards) and on YAPI's welcome (up to three
speech bubbles).

**Architecture:** One pure module `apps/merchant-dashboard/src/store-mascots.mjs` (summary items, star SVG per mood, two renderers),
wired from `dashboard.js` `renderOverview()`/`showRestock()`, plus a `summary(html)` method on the welcome handle. Styles in a
«Mascots» section of `src/clyro.css`.

**Tech Stack:** vanilla JS/CSS, `node --test`, Playwright screenshots (`scripts/screens.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-16-store-mascots-design.md`

## Global Constraints

- Colours: sales mint `#bfe5cf`, orders peach `#f6c9ae`, visits lilac `#cfd3f2`, stock apricot `#f3d9a6`; faces ink `#17191c`.
- Moods: `happy`, `sleepy`, `worried`. Amounts only through the panel's `money(cents)`.
- Spanish copy exactly as the spec; singular/plural right («1 pago exitoso», «2 pagos exitosos»).
- No API change; light checks (touched files' tests only); commit per task on `oct24-clean`, no push.

## Review Focus

1. Finances not loaded yet (`lastFinances` null) — nothing renders, no «0» lies. Pinned in Task 1 (`storeSummary(null…)` → []).
2. Hidden amounts — the sales sentence shows `money()`'s dots. Task 1 test.
3. Store names / product names with `<`/`&` — escaped. Task 1 test.
4. Welcome opened before the finances arrive — the bubbles fill in when they do. Task 3 wiring (`welcome?.summary` in renderMascots).
5. Phone width — the four cards wrap to two columns, no sideways scroll. Task 2 screenshots.

---

### Task 1: `store-mascots.mjs` — summary, star SVG, renderers

**Files:** Create `src/store-mascots.mjs`, `src/store-mascots.test.mjs`; Modify `server.mjs` (serve `/src/store-mascots.mjs`).

**Produces:** `storeSummary({ finances, money, lowStock, steps })` → `Array<{ kind, mood, text, label, view }>` (`[]` when
`finances` is null); `mascotSvg(kind, mood)` → `<svg class="mascot mascot--{kind} is-{mood}" …>`; `renderMascotCards(items)` → `<li>`s;
`renderMascotBubbles(items, max = 3)` → bubbles, worried > happy > sleepy.

Tests (RED first), then the module: no finances → []; zero everything → sales/orders/visits sleepy, stock happy «Todo al día»;
sales 75030 cents with `money` → «Este mes vendiste 750.30 BOB.»; hidden money → dots; paymentCount 1 vs 2 plural; views 1 vs 12;
lowStock 3 items → worried «3 productos casi agotados: First.»; no low stock + pending step → worried «Te falta: Configura la
facturación (SIN).» with that step's view; names escaped; svg per mood differs (smile path / closed-eye path / wavy path); bubbles
order worried first and cap at 3. Run: `node --test src/store-mascots.test.mjs unit/served-modules.test.mjs`.

### Task 2: Inicio row

**Files:** Modify `index.html` (after `#overviewGreeting`: `<ul class="mascot-row" id="overviewMascots" aria-label="Tu tienda hoy" hidden></ul>`),
`src/dashboard.js` (import; `lastLowStock` set in `showRestock`; `lastSetupSteps` kept in `renderOverview`; `renderMascots()` called at
the end of both), `src/clyro.css` («Mascots» section: glass cards, 4 → 2 columns ≤ 720px, a small wiggle on hover), `src/clyro.test.mjs`.
Test: markup present, renderMascots wired, CSS row/grid/glass rules. Screens: Inicio desktop + phone, `overflow:false`.

### Task 3: Welcome bubbles

**Files:** Modify `index.html` (`<div class="yapi-welcome-mascots" data-welcome-mascots aria-live="polite"></div>` between greeting
and composer), `src/yapi-welcome.mjs` (handle gains `summary: (html) => …`), `src/dashboard.js` (`renderMascots` calls
`welcome?.summary(renderMascotBubbles(items))`; `maybeWelcome` passes the last items right after opening), `src/clyro.css` (bubbles,
pop-in hop, reduced motion), tests in `src/clyro.test.mjs`. Screens: welcome desktop + phone.

### Task 4: Check + notes

All touched tests, screenshots of Inicio and the welcome at 1440/390, memory note.
