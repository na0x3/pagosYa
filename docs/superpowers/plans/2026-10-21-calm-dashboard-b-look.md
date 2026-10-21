# Calm dashboard — Part B: Calm, roomy, glass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant dashboard feel like granola.ai — warm, spacious, soft and premium — with glass on the floating layers and slow, gentle motion.

**Architecture:** One new stylesheet, `src/premium.css`, linked after every other dashboard stylesheet. It remaps the existing `--pg-*`/`--calm-*` tokens (so every rule already written in `calm.css`/`ui-kit.css` moves at once), then restyles the shell (floating glass sidebar and top bar, a roomy reading column, serif page titles, glass pill tabs), the shared controls, and the motion. Headings use Instrument Serif, already in the repo under OFL, copied into `fonts/` and served by `server.mjs`. Nothing else in the markup changes except the link tag.

**Tech Stack:** CSS only (plus one server route); `node:test` regex tests in the existing style; Chrome screenshots for the visual pass.

**Spec:** `docs/superpowers/specs/2026-10-21-calm-dashboard-yapi-immersive-design.md` — Part B and "Owner update to Part B".

## Global Constraints

- Glass (`backdrop-filter`) only on floating layers: top bar, sidebar, section pills, menus/popovers, dialogs, and (Part C) YAPI. Content cards stay solid white.
- No sharp corners: cards 20px, large containers 28px, fields 14px, buttons/tabs/badges full pills.
- Yellow (`--pg-brand`) stays reserved for YAPI. Actions use the ink colour.
- Motion: entering ~500ms `cubic-bezier(.22,1,.36,1)`, hover/press ~200ms; nothing bounces. `prefers-reduced-motion: reduce` removes movement.
- Readable: body text ≥ 15px on desktop, muted text contrast ≥ 4.5:1 on the page background.
- The Studio iframes (Diseño, Medios, Integraciones…) are not restyled here; note any visible clash in the final report.
- Unit tests: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`. E2E stays green.

## Review Focus

1. Phone width (390px): sidebar becomes the existing off-canvas menu; glass and padding must not cause horizontal scroll.
2. Browsers without `backdrop-filter` — glass layers fall back to near-opaque surfaces, text stays readable.
3. Long content pages (Clientes › Correos, Ajustes) — the wider gaps must not push primary actions off screen or break sticky save bars.
4. Dialogs opened from any page (create store, session profile, account delete) — glass dialog keeps its form legible.
5. Reduced motion — no page-enter rise, no staggered cards.

---

### Task 1: Font and stylesheet in place

**Files:** Create `apps/merchant-dashboard/fonts/instrument-serif.ttf` (copy of `examples/independent-cafe/assets/instrument-serif.ttf`), `apps/merchant-dashboard/fonts/InstrumentSerif-OFL.txt`; create `src/premium.css`; modify `index.html` (link), `server.mjs` (font route + `/src/premium.css` allowlist); test `src/premium.test.mjs`.

- [ ] Test: `index.html` links `/src/premium.css` after `onboarding-walkthrough.css`; `server.mjs` serves `/fonts/instrument-serif.ttf` and allowlists `/src/premium.css`; `premium.css` declares `@font-face { font-family: "Instrument Serif"; src: url("/fonts/instrument-serif.ttf") … font-display: swap }`.
- [ ] Run → FAIL. Implement. Run → PASS. `curl -I :4323/fonts/instrument-serif.ttf` → 200 font/ttf. Commit.

### Task 2: Tokens and page

**Files:** `src/premium.css`; test `src/premium.test.mjs`.

- [ ] Test: `:root` defines `--pm-serif`, `--pm-ease: cubic-bezier(.22,1,.36,1)`, `--pm-glass`, `--pm-blur`; remaps `--pg-bg`, `--pg-border`, `--calm-radius: 20px`, `--calm-radius-sm: 14px`; `body.is-logged-in` gets the tinted background; `.workspace-title` uses `var(--pm-serif)`.
- [ ] Implement:

```css
:root {
  --pm-serif: "Instrument Serif", ui-serif, Georgia, "Times New Roman", serif;
  --pm-ease: cubic-bezier(.22,1,.36,1);
  --pm-bg: #f6f4ef;
  --pm-glass: rgb(255 255 255 / .62);
  --pm-glass-strong: rgb(255 255 255 / .82);
  --pm-glass-edge: rgb(255 255 255 / .75);
  --pm-blur: saturate(1.5) blur(22px);
  --pm-shadow-float: 0 24px 60px -28px rgb(40 36 28 / .28), 0 2px 10px rgb(40 36 28 / .05);
  --pm-shadow-card: 0 1px 2px rgb(40 36 28 / .04), 0 10px 30px -18px rgb(40 36 28 / .14);
  --pg-bg: var(--pm-bg); --pg-surface: #fff; --pg-surface-raised: #f2efe8; --workspace-sidebar: transparent;
  --pg-text: #1d1b17; --pg-text-muted: #5f5b53; --pg-text-faint: #7d786e;
  --pg-border: rgb(40 36 28 / .08); --pg-border-strong: rgb(40 36 28 / .14);
  --pg-ink: #23211c; --pg-ink-hover: #3a3730; --pg-accent-soft: #f2efe8;
  --calm-radius: 20px; --calm-radius-sm: 14px;
  --calm-shadow: var(--pm-shadow-card); --calm-shadow-lg: var(--pm-shadow-float);
}
body.is-logged-in {
  background:
    radial-gradient(1100px 700px at 8% -10%, rgb(205 222 190 / .55), transparent 60%),
    radial-gradient(900px 600px at 100% 0%, rgb(246 222 196 / .45), transparent 60%),
    radial-gradient(1000px 800px at 60% 110%, rgb(214 220 236 / .40), transparent 60%),
    var(--pm-bg) fixed;
  font-size: 15px;
}
body.is-logged-in .workspace-title { font: 400 44px/1.05 var(--pm-serif); letter-spacing: -.01em; }
body.is-logged-in .workspace-description { font-size: 15px; margin-top: 8px; color: var(--pg-text-muted); }
body.is-logged-in :is(.panel .section-head h2, .ui-head h3, .overview-greeting) { font-family: var(--pm-serif); font-weight: 400; letter-spacing: 0; }
```

- [ ] Run → PASS. Commit.

### Task 3: Floating glass shell and roomy column

**Files:** `src/premium.css`; test `src/premium.test.mjs`.

- [ ] Test: `.dashboard-sidebar` and `.topbar` use `backdrop-filter: var(--pm-blur)` with `var(--pm-glass)`; `.dashboard-workspace` has `max-width: 1080px`; `.section-tabs` is glass; an `@supports not` block falls back to `--pm-glass-strong`.
- [ ] Implement (desktop ≥ 901px; phone keeps the existing off-canvas sidebar, only restyled):

```css
@media (min-width: 901px) {
  body.is-logged-in .dashboard-shell { grid-template-columns: 252px minmax(0, 1fr); gap: 56px; padding: 16px 32px 0 16px; }
  body.is-logged-in .dashboard-sidebar { position: sticky; top: 16px; height: calc(100vh - 32px); border-radius: 28px; padding: 20px 14px; }
}
body.is-logged-in .dashboard-sidebar { background: var(--pm-glass); -webkit-backdrop-filter: var(--pm-blur); backdrop-filter: var(--pm-blur); border: 1px solid var(--pm-glass-edge); box-shadow: var(--pm-shadow-float); }
body.is-logged-in .dashboard-nav { gap: 4px; padding-top: 18px; }
body.is-logged-in .dashboard-nav-button { min-height: 42px; padding: 0 14px; border-radius: 999px; font-size: 15px; font-weight: 500; color: var(--pg-text-muted); transition: background-color .2s var(--pm-ease), color .2s var(--pm-ease); }
body.is-logged-in .dashboard-nav-button:hover { background: rgb(255 255 255 / .6); color: var(--pg-text); }
body.is-logged-in .dashboard-nav-button[aria-current="page"] { background: #fff; color: var(--pg-text); box-shadow: 0 1px 2px rgb(40 36 28 / .06), 0 6px 16px -10px rgb(40 36 28 / .25); border-color: transparent; }
body.is-logged-in > .topbar { position: sticky; top: 12px; z-index: 30; margin: 12px auto 0; width: min(1080px, calc(100% - 32px)); height: 56px; padding: 0 10px 0 14px; border-radius: 999px; background: var(--pm-glass); -webkit-backdrop-filter: var(--pm-blur); backdrop-filter: var(--pm-blur); border: 1px solid var(--pm-glass-edge); box-shadow: var(--pm-shadow-float); }
body.is-logged-in .dashboard-workspace { max-width: 1080px; padding: 48px 0 160px; }
body.is-logged-in .workspace-header { margin-bottom: 28px; }
body.is-logged-in .section-tabs { display: inline-flex; gap: 4px; padding: 5px; margin: 0 0 36px; border-radius: 999px; background: var(--pm-glass); -webkit-backdrop-filter: var(--pm-blur); backdrop-filter: var(--pm-blur); border: 1px solid var(--pm-glass-edge); box-shadow: var(--pm-shadow-card); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
body.is-logged-in .section-tab { padding: 9px 16px; font-size: 14.5px; white-space: nowrap; }
body.is-logged-in .section-tab[aria-current="page"] { background: #fff; border-color: transparent; box-shadow: 0 1px 2px rgb(40 36 28 / .06), 0 6px 14px -10px rgb(40 36 28 / .3); }
body.is-logged-in :is(.profile-menu, [popover]) { background: var(--pm-glass-strong); -webkit-backdrop-filter: var(--pm-blur); backdrop-filter: var(--pm-blur); border: 1px solid var(--pm-glass-edge); border-radius: 20px; box-shadow: var(--pm-shadow-float); }
body.is-logged-in dialog { border: 1px solid var(--pm-glass-edge); border-radius: 28px; background: var(--pm-glass-strong); -webkit-backdrop-filter: var(--pm-blur); backdrop-filter: var(--pm-blur); box-shadow: var(--pm-shadow-float); }
body.is-logged-in dialog::backdrop { background: rgb(40 36 28 / .18); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  body.is-logged-in :is(.dashboard-sidebar, .topbar, .section-tabs, .profile-menu, dialog) { background: var(--pm-glass-strong); }
}
```

- [ ] Visual check at 1440 and 390 (screenshots); fix overlaps the screenshots show, each fix added to `premium.css` and a line in the ledger. Commit.

### Task 4: Roomy, soft controls and surfaces

**Files:** `src/premium.css`; test `src/premium.test.mjs`.

- [ ] Test: buttons are pills ≥ 40px; inputs/selects/textarea 44px min-height with `border-radius: 14px`; `.panel` padding 28px and radius 20px; table cells 16px vertical padding; `.badge` pill.
- [ ] Implement:

```css
body.is-logged-in :is(.panel, .card) { border-radius: 20px; border-color: transparent; box-shadow: var(--pm-shadow-card); padding: 28px; }
body.is-logged-in :is(.overview-grid, .cards) { gap: 20px; }
body.is-logged-in button:is(.primary, .secondary, .ghost), body.is-logged-in .button-like { min-height: 40px; padding: 0 18px; border-radius: 999px; font-size: 14.5px; font-weight: 550; transition: background-color .2s var(--pm-ease), border-color .2s var(--pm-ease), transform .2s var(--pm-ease); }
body.is-logged-in button.primary { background: var(--pg-ink); border-color: var(--pg-ink); color: #fff; }
body.is-logged-in button.primary:hover { background: var(--pg-ink-hover); }
body.is-logged-in button:is(.primary, .secondary, .ghost):active { transform: scale(.98); }
body.is-logged-in :is(input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), select, textarea) { min-height: 44px; padding: 10px 14px; border: 1px solid var(--pg-border-strong); border-radius: 14px; background: #fff; font-size: 15px; transition: border-color .2s var(--pm-ease), box-shadow .2s var(--pm-ease); }
body.is-logged-in :is(input, select, textarea):focus-visible { outline: none; border-color: var(--pg-ink); box-shadow: 0 0 0 4px rgb(35 33 28 / .08); }
body.is-logged-in textarea { min-height: 96px; }
body.is-logged-in table { border-collapse: separate; border-spacing: 0; }
body.is-logged-in :is(th, td) { padding: 16px 14px; border-bottom: 1px solid var(--pg-border); }
body.is-logged-in th { font-size: 12.5px; font-weight: 550; color: var(--pg-text-faint); text-transform: none; letter-spacing: 0; }
body.is-logged-in tr:last-child td { border-bottom: 0; }
body.is-logged-in .badge { border-radius: 999px; padding: 4px 10px; font-size: 12.5px; font-weight: 550; }
body.is-logged-in .ui-tab { border-radius: 999px; padding: 8px 16px; }
body.is-logged-in .ui-head-icon { border-radius: 12px; border-color: transparent; background: var(--pg-surface-raised); }
body.is-logged-in .overview-kpi dd { font: 400 34px/1.1 var(--pm-serif); }
```

- [ ] Visual check of every section at 1440 and 390; fix what is still cramped (each fix in `premium.css`, ledgered). Commit.

### Task 5: Slow, gentle motion

**Files:** `src/premium.css`; test `src/premium.test.mjs`.

- [ ] Test: `.page-entering` uses `pm-enter` 520ms `var(--pm-ease)`; `@keyframes pm-enter` from `opacity: 0; transform: translateY(8px)`; staggered `animation-delay` on children 2–5; `@media (prefers-reduced-motion: reduce)` sets `animation: none` for those.
- [ ] Implement:

```css
@keyframes pm-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
body.is-logged-in .page-entering { animation: pm-enter 520ms var(--pm-ease) both; }
body.is-logged-in .page-entering :is(.panel, .card, .overview-kpi) { animation: pm-enter 560ms var(--pm-ease) both; }
body.is-logged-in .page-entering :is(.panel, .card, .overview-kpi):nth-child(2) { animation-delay: 40ms; }
body.is-logged-in .page-entering :is(.panel, .card, .overview-kpi):nth-child(3) { animation-delay: 80ms; }
body.is-logged-in .page-entering :is(.panel, .card, .overview-kpi):nth-child(4) { animation-delay: 120ms; }
body.is-logged-in .page-entering :is(.panel, .card, .overview-kpi):nth-child(5) { animation-delay: 160ms; }
@media (prefers-reduced-motion: reduce) {
  body.is-logged-in :is(.page-entering, .page-entering .panel, .page-entering .card, .page-entering .overview-kpi) { animation: none; }
  body.is-logged-in :is(.dashboard-nav-button, .section-tab, button, input, select, textarea) { transition: none; }
}
```

- [ ] Run → PASS. Commit.

### Task 6: Whole-suite check and live review

- [ ] Unit suite and Playwright suite green (`--workers=3` locally).
- [ ] Screenshots of all seven sections at 1440×900 and 390×844; compare against the Granola notes in the spec (warm off-white, space, soft cards, serif headings, glass floating layers). Record what still looks off in the ledger and fix it in this task.
- [ ] Final review of Part A + B together (fresh reviewer), then Part C plan.
