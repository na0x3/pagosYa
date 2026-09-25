# Motion Personalities — Implementation Plan (sub-project 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each store moves with its own personality (calm, snappy, playful, cinematic, from `dna.motion` → `<html data-dna-motion>`): the cart, the added notice, the add pulse, buttons, cards, reveals and the `@pagosya/ui` entrances take their durations, eases, distances, stagger and parallax strength from one set of `--motion-*` tokens. A store without `data-dna-motion` animates exactly as today.

**Architecture:** One token table, `MOTION_TOKENS` in `packages/storefront-kit/kit/commerce.js`, generates `:root[data-dna-motion=<p>]{--motion-*}` rules inside the existing DNA style element (`@layer pagosya-dna`, so authored unlayered CSS still wins). The tokens are **only defined for a personality**. Every use site writes `var(--motion-x, <today's literal>)`, so a store without the attribute resolves every fallback to today's value. `--ease-out`, `--ease-drawer` and `--kit-ease` become aliases of the settle ease under `:root[data-dna-motion]`. WAAPI code reads the computed token once per mount; `ui.tsx` carries a JS mirror of the table (`MOTION_PERSONALITIES`, pinned equal to the kit table by a test) for code that runs before `commerce.js` has added its style (React effects run before the deferred `commerce.js`) and for jsdom. The API holds the canonical table (`source-motion-tokens.ts`) and the prompt guidance; kit literals are pinned to it the way `DNA_VALUES` is pinned to `SOURCE_DNA_RUNTIME_ENUMS`.

**Tech Stack:** Kit runtime (vanilla JS, CSS custom properties, WAAPI), `@pagosya/ui` (React 19, motion), NestJS API, Jest (ts-jest), jsdom 25 (no `@layer` support), Playwright Chromium, esbuild (to run `ui.tsx` components in jsdom).

**Spec:** `docs/superpowers/specs/2026-09-24-motion-personalities-design.md` (binding); parent `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` §5 gate 3 (reduced motion stops it, nothing flashes more than 3×/s).

## Global Constraints

- **Invariant:** without `data-dna-motion`, every duration, ease, distance, stagger and strength equals today's literal (drawer 250/200ms, added 200ms, pulse 200ms at scale .96 with `cubic-bezier(.23,1,.32,1)`, card image hover 160ms, motion.js reveals 220ms/6px subtle and 280ms/10px expressive, EntranceGroup 320ms/20px/stagger 60, Reveal 500ms/28px, overlay menu 240/220ms, PageEntrance 900ms, BrandEntrance 1000ms, Parallax ×1). `--ease-out`/`--ease-drawer` stay undefined for such a store (authored `var(--ease-out, x)` keeps resolving to `x`).
- Two meanings of "motion" stay distinct: `PAGOSYA_CONFIG.motion` (off | subtle | expressive | auto, `data-pagosya-motion`) is the merchant's mode; `dna.motion` (`data-dna-motion`) is the personality. Mode `off` and `prefers-reduced-motion: reduce` disable everything for every personality.
- Overshoot/anticipation curves (`--motion-ease`, `--motion-ease-exit`; only playful's leave 0..1) are used **only on `transform`**, and never on surfaces anchored to a viewport edge (cart drawer/sheet/page, ribbon notice, overlay menu), where an overshoot opens a gap at the edge. Those use `--motion-ease-settle` / `--motion-ease-settle-exit` (added tokens, equal to the spec's curves except for playful).
- Cascade order unchanged: `@layer pagosya-commerce < pagosya-contact-base < pagosya-dna < unlayered authored CSS`. Authored `:root{--motion-base:…}` wins.
- The opening stays within 1000ms for every personality: EntranceGroup delay cap stays `1000 - itemDuration - 1`; a personality-derived entrance duration is clamped to 700–1000ms. Author-given durations keep today's clamps.
- Commit with pathspec only (`git commit -m … -- <paths>`), after checking `git diff --cached --name-only` and `git status --short`.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`.

## Review Focus

1. A store without `data-dna-motion` resolves every `--motion-*` fallback to today's literal (Chromium computed `transition` of `.cart-drawer`/`.cart-added`, jsdom WAAPI calls of the pulse, EntranceGroup and Reveal) → Tasks 1, 2, 4.
2. `--ease-out` stays undefined without a personality (authored `var(--ease-out, ease)` unchanged) → Task 1 test.
3. No `var(--motion-ease…)` overshoot/anticipation curve reaches a non-transform property or an edge-anchored panel → Task 2 static guard + pulse split test.
4. `ui.tsx` mirror and `commerce.js` table can't drift from the API table → Task 1/4 parity tests.
5. Reduced motion and mode `off` stop every animation for all 4 personalities → Task 5.
6. EntranceGroup and entrances stay within 1000ms for cinematic → Task 4 test.
7. Authored `:root{--motion-base}` overrides the personality → Task 1 Chromium test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-motion-tokens.ts` (create) | Canonical token table `SOURCE_MOTION_TOKENS`, prompt texts `SOURCE_MOTION_PERSONALITY_DIRECTION` (stable) and `sourceMotionPersonalityLine(p)` (per store). |
| `apps/api/src/storefront-source/source-motion-tokens.spec.ts` (create) | Pure table test; kit/ui parity; prompt text. |
| `apps/api/src/storefront-source/source-commerce-motion.spec.ts` (create) | jsdom (WAAPI calls, CSS text) and Chromium (resolved tokens, transitions, reveals, reduced motion) tests of the kit. |
| `apps/api/src/storefront-source/source-ui-motion.spec.ts` (create) | Bundles `ui.tsx` components with esbuild, runs them in jsdom, records `animate()` calls per personality. |
| `packages/storefront-kit/kit/commerce.js` (modify) | `MOTION_TOKENS`, token CSS in the DNA style, `motionValue()` reader, tokenized drawer/added/pulse/DNA transitions. |
| `packages/storefront-kit/kit/motion.js` (modify) | Reveals and card hover read the tokens. |
| `packages/storefront-kit/kit/ui.tsx` (modify) | `MOTION_PERSONALITIES` mirror, `motionToken()`/`motionEase()`, tokenized EntranceGroup, Reveal, overlay menu, Parallax, entrances and CSS. |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify) | Stable direction + per-store "Motion personality" line. |
| `apps/api/src/storefront-source/source-scorecard-capture.ts` (modify) | `page.motionTokens`: static count of authored `--motion-*` uses. |

---

### Task 1: The token table and its CSS

**Files:** create `source-motion-tokens.ts`, `source-motion-tokens.spec.ts`, `source-commerce-motion.spec.ts`; modify `commerce.js` (next to `DNA_CSS`, ~1869).

**Interfaces:**
- Produces: `SOURCE_MOTION_TOKENS: Record<'calm'|'snappy'|'playful'|'cinematic', { ease, settle, exit, settleExit: string; fast, base, slow, distance, stagger: number; parallax, press: number }>`.
- Produces (kit): `const MOTION_TOKENS = { … };` literal in `commerce.js` (same shape), CSS `:root[data-dna-motion=<p>]{--motion-ease;--motion-ease-settle;--motion-ease-exit;--motion-ease-settle-exit;--motion-fast;--motion-base;--motion-slow;--motion-distance;--motion-stagger;--motion-parallax;--motion-press-scale}` and `:root[data-dna-motion]{--ease-out:var(--motion-ease-settle);--ease-drawer:var(--motion-ease-settle)}`; `--kit-ease:var(--motion-ease-settle,cubic-bezier(.23,1,.32,1))`.

- [ ] **Step 1: Write the failing tests**
  - `source-motion-tokens.spec.ts`: the table has exactly the DNA personalities (`SOURCE_DNA_ENUMS.motion.personality`) and the spec's values (table in spec §2); `settle`/`settleExit` equal `ease`/`exit` except playful, whose settle curves stay inside 0..1 (parse the 4 numbers); every duration ≤ 900ms; `commerce.js` `MOTION_TOKENS` literal (regex + `runInNewContext`) equals the API table.
  - `source-commerce-motion.spec.ts` (Chromium, pattern of `source-commerce-cascade.spec.ts`): with `dna.motion='snappy'`, `getComputedStyle(documentElement)` gives `--motion-base` `200ms`, `--motion-ease` `cubic-bezier(.2,.9,.2,1)`, `--ease-out` equal to the settle curve; for each personality `--motion-base` equals the table; authored `:root{--motion-base:777ms}` wins; without DNA and with a DNA lacking `motion`, `--motion-base` and `--ease-out` are empty.
- [ ] **Step 2: Run, expect FAIL** (module missing; no `MOTION_TOKENS`; tokens empty).
- [ ] **Step 3: Implement** the API table and the kit literal + CSS generation inside `DNA_CSS` (only emitted for DNA stores).
- [ ] **Step 4: Run, expect PASS**; `pnpm --filter @pagosya/storefront-kit test`.
- [ ] **Step 5: Commit** `feat(kit): motion personality tokens keyed on data-dna-motion`.

### Task 2: Kit surfaces use the tokens (cart, added, pulse, DNA buttons and cards)

**Files:** modify `commerce.js` (shoppingStyle ~1246-1300, `addedFeedback` ~1226, `dnaButtonRules`, card rules ~1952-1963); tests in `source-commerce-motion.spec.ts`.

**Interfaces:**
- Produces: `motionValue(name, fallback)` in `commerce.js` — computed `--motion-<name>` (ms/s/px/unitless parsed), else `MOTION_TOKENS[personality]`, else `fallback`.
- Drawer: `transform var(--motion-base,250ms) var(--ease-drawer,…)`, `opacity var(--motion-fast,200ms) var(--ease-out,…)`, display/overlay `var(--motion-base,250ms)`; closing uses `--motion-ease-settle-exit` under a personality.
- Added: opacity/visibility `var(--motion-fast,200ms)`, transform `var(--motion-fast,200ms) var(--motion-ease,var(--ease-out,…))`; ribbon uses settle.
- Pulse: two animations — transform `scale(press)→1` with `--motion-ease`, opacity `.65→1` with settle; defaults 200ms, .96, `cubic-bezier(.23,1,.32,1)`.
- DNA buttons/cards: fast/base/slow tokens with today's literals as fallbacks; `--motion-ease` only on `transform`.

- [ ] **Step 1: Failing tests:** jsdom pulse (spy `Element.prototype.animate`): no DNA → both animations 200ms, `cubic-bezier(.23,1,.32,1)`, `scale(0.96)`; snappy → 120ms, `scale(0.96)`, ease `(.2,.9,.2,1)`; playful → the overshoot curve only on the transform-only animation, opacity animation on the settle curve, `scale(0.92)`. Static guard: every `var(--motion-ease` / `var(--motion-ease-exit` in `commerce.js`, `motion.js` and `ui.tsx` CSS is the timing function of a `transform` transition. Chromium: `.cart-drawer` computed `transition-duration` `0.25s, 0.2s, 0.25s, 0.25s` without DNA, `0.52s, 0.26s, 0.52s, 0.52s` for cinematic; `.cart-added` `0.2s…` / `0.12s…` (snappy).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new spec + `source-commerce-surfaces`, `source-commerce-cascade`, `source-commerce-dna`: PASS.
- [ ] **Step 5: Commit** `feat(kit): cart, added notice, pulse, buttons and cards move with the store's personality`.

### Task 3: motion.js reveals and card hover

**Files:** modify `motion.js`; tests in `source-commerce-motion.spec.ts` (Chromium: `commerce.js` + `motion.js`, element below the fold, scroll, read `el.getAnimations()[0].effect.getTiming()`).

- Reveal: subtle → `--motion-fast` (fallback 220) and half `--motion-distance` (fallback 6); expressive → `--motion-base` (280) and `--motion-distance` (10); ease `--ease-out` (settle alias; content never overshoots). Card image hover: `transform var(--motion-fast,160ms) var(--motion-ease,var(--ease-out,…))`.

- [ ] Steps 1-5 as above. Expected RED: cinematic expressive reveal 280ms instead of 520ms. Commit `feat(kit): scroll reveals follow the motion personality`.

### Task 4: `@pagosya/ui` reads the tokens

**Files:** modify `ui.tsx`; create `source-ui-motion.spec.ts` (esbuild bundle of a tiny entry importing `ui.tsx`, run in jsdom with `matchMedia`, `animate`, `IntersectionObserver` stubs; `data-dna-motion` on `<html>` or `PAGOSYA_CONFIG.dna.motion`).

**Interfaces:**
- Produces: `MOTION_PERSONALITIES` (mirror), `motionToken(name, fallback): number`, `motionEase(kind, fallback): string` — computed style, else mirror for the personality (attribute, else `PAGOSYA_CONFIG.dna.motion`), else fallback. Read once per mount inside effects.
- EntranceGroup: item `base` (320, clamp 120–600), distance (20, 0–40), stagger = prop ?? `stagger` token (60, clamp 0–120), delay cap unchanged. Reveal: `slow` (500, 200–900), distance (28). Overlay menu: open `base` (240, 120–400), close `fast` (220), close ease settle-exit. Parallax: strength × `parallax` (±160; mobile ±20). Entrances: omitted duration → `slow` clamped 700–1000 (fallback 900; Brand/Signature 1000). CSS: `--ui-ease: var(--motion-ease-settle, cubic-bezier(.22,1,.36,1))`, `ui-reveal` keyframe distance `var(--motion-distance,28px)`, lift/zoom/button transforms tokenized.

- [ ] **Step 1: Failing tests:** mirror equals API table; no personality → EntranceGroup 320ms/20px/stagger 60, Reveal 500ms/28px, BrandEntrance 1000ms; snappy → 200ms/8px/35ms and Reveal 320ms/8px; personality from `PAGOSYA_CONFIG.dna.motion` when the attribute is absent; for all 4 personalities EntranceGroup with 12 children and delay 600 ends before 1000ms and BrandEntrance ≤ 1000ms; explicit `stagger={40}` wins; Parallax renders `translateY(78px)` for cinematic strength 60.
- [ ] Steps 2-5. Commit `feat(ui): entrances, reveals, menu and parallax follow the motion personality`.

### Task 5: Reduced motion and mode off stop everything, for all 4

**Files:** tests in `source-commerce-motion.spec.ts` and `source-ui-motion.spec.ts`; code only if a test fails.

- [ ] For each personality: jsdom pulse with reduced motion or `motion:'off'` → no `animate`; ui bundle with reduced motion → no `animate`; Chromium with `reducedMotion:'reduce'` → `.cart-drawer`/`.cart-added` transitions `none`/`0s`; motion.js starts no reveal. These are expected to pass on first run (existing behaviour, now asserted for all 4) — say so in the ledger. Commit `test(kit): reduced motion and motion off stop every personality`.

### Task 6: Generation prompt and scorecard

**Files:** `source-generation.service.ts` (stable arrays next to `SOURCE_PURCHASE_CONTROL_FORM`; `taskPrompt` next to `Purchase control form`), `source-generation.service.spec.ts`, `source-scorecard-capture.ts` + spec.

- Stable: authored CSS/JS uses `var(--motion-fast|base|slow)`, `var(--motion-ease)` (transform only), `var(--motion-ease-settle)`, `var(--motion-distance)`, `var(--motion-stagger)` instead of literals, with fallbacks; in `@pagosya/ui` omit `duration`/`stagger` so the kit applies the personality. Per store: `Motion personality: <p>.`
- Scorecard: `page.motionTokens` = count of `var(--motion-` in authored files (kit and compiled excluded); `page['dna.motion']` recorded.
- [ ] RED: prompt lacks the line; `staticMotionTokens` missing. GREEN. Commit `feat(yapi): tell the build the store's motion personality and count authored motion tokens`.

### Task 7: Verification and browser probe

- [ ] `cd apps/api && npx jest storefront-source --runInBand`; `pnpm --filter @pagosya/checkout run test`; `pnpm --filter @pagosya/storefront-preview test`; `pnpm --filter @pagosya/storefront-kit test`; Studio Playwright `cross-sell-kit` + `checkout-layout`; api tsc; eslint on touched TS.
- [ ] Probe `/tmp/probe-sp6/probe.cjs` (Chromium, `reducedMotion:'no-preference'`): fixture store with `data-dna-motion` snappy vs cinematic (and none); measure the cart open transition (computed + `getAnimations()` on `.cart-drawer` after open) and a Reveal duration (component bundle). Record in the ledger.
