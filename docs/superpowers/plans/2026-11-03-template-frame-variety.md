# Template frame variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner prefers inline work, [[feedback_inline_over_subagents]]). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the 35 themed templates stop looking alike and stop feeling buggy — each gets its own footer, buttons, product card,
product page and cover, copied from real, good-looking stores, while keeping today's quality and look rules.

**Architecture:** every themed template is a preset over Esencial (`packages/store-templates/templates/<id>/template.json`,
`extends: "esencial"`). Variety lives in Esencial as new *variants* (footer, button, card, pdp) that a preset picks by name, plus
the preset's own `layout`. New variants = markup in `esencial/components/{Shell,library,product}.tsx` + CSS in
`esencial/styles/globals.css` + the name in the variant enums (`esencial/template.json` `variants`, API `LIBRARY_CARDS`). A
measurement test enforces caps so the variety never drifts back.

**Tech Stack:** TSX templates (rendered by the Studio prepare step), plain CSS, `node --test` for store-templates, jest for apps/api,
playwright for reference capture and template screenshots (`.superpowers/sdd/2026-10-31-34-templates/template-shot.ts`).

**Spec:** `docs/superpowers/specs/2026-11-03-template-frame-variety-design.md`

## Owner additions (2026-11-03, after the spec)
- «casi todos los botones se parecen por ejemplo de las tiendas de dulces, los footers, etc, agarra referencias reales de buenos
  footers, bonitas secciones» → **buttons are in scope**, and every new part is copied from a *real* store (theme demos we already
  captured + ~30 well-designed real stores captured fresh), never invented.
- «todo se parece haz más diversidad, bonitas» → variety is the goal, beauty the bar.
- «i feel like some websites are kind of buggy» → **Task 0 bug sweep** before any new part, and every task re-checks.

## Global Constraints
- Keep what works: no existing variant's look changes; templates only *switch* to new variants.
- Owner look rules: calm colours, normal-size cards ([[feedback_calm_colours]]); no dark text-only bands; no text-only sections;
  no photo groups of 3+ unless asked; energy = motion + type + one accent.
- Every footer keeps: `data-pagosya-pages` nav (exactly one, inside `<footer>`), the signup block when the home has no
  `newsletter-split`, the legal line, logo or name. Every card keeps the kit slots: `data-product-field="image|name|price|badge|options|save"`,
  `data-product-add`, `data-product-link`.
- 1280 and 390 wide, no sideways scroll; motion still under `prefers-reduced-motion`.
- Caps (test-enforced): footer ≤ 4 templates, card ≤ 4, button look ≤ 5, pdp ≤ 6, (header, footer, card, pdp) unique, each of
  the five fillers ≤ 10 homes, each cover ≤ 6 homes, home Jaccard overlap ≤ 0.20 (today exactly 0.200).
- Never `sed -i` an apps/api file ([[feedback_sed_i_breaks_api_watcher]]); `tsc` only with `--incremental false`.
- Existing stores are not migrated.

## Review Focus
1. A footer variant with no phone/city/tagline/logo still lays out (empty columns collapse, no orphan headings).
2. A card style on a product with no second photo, no badge, no options, sold out — no empty boxes, add button reachable on touch.
3. Long store names (30+ chars) in `wordmark`/`marquee` footers and long product names in `overlay`/`list` cards — no overflow at 390.
4. A button variant on dark grounds (hero over photo, accent bands, themed dark footers) keeps contrast.
5. A pdp variant with a single product photo (carousel/grid-2) — no empty grid cell or dead arrows.
Each is checked in the task that owns the part.

---

### Task 0: Bug sweep (owner: «some websites are kind of buggy»)

**Files:** `.superpowers/sdd/2026-11-03-template-frame-variety/sweep.ts` (wraps `template-shot.ts`), fixes in esencial CSS/TSX or
preset json.

- [ ] Shoot all 35 templates (home + `PAGE=product.html`) at 1280/390; record per template: page errors / console errors, horizontal
  overflow (`scrollWidth > innerWidth`), elements wider than the viewport, overlapping header/announce, empty sections (height < 40
  or no visible text/img), images that failed to load, QA rule hits (`evaluateHomeWriterRules`). → `sweep.md` table.
- [ ] Look at the 390 full-page shots of every template (contact sheets), list visual bugs the numbers miss.
- [ ] Fix each bug at its root (one commit per cause), re-shoot, table clean. Ask the owner which store(s) felt buggy and add them.

### Task 1: Real references + ledger

**Files:**
- Create: `.superpowers/sdd/2026-11-03-template-frame-variety/capture.cjs`
- Create: `.superpowers/sdd/2026-11-03-template-frame-variety/real/<site>/{footer-d.png,footer-m.png,buttons.json,buttons-d.png,card-d.png}`
- Create: `.superpowers/sdd/2026-11-03-template-frame-variety/ledger.md`

- [ ] Write `capture.cjs`: for each `name=url` argument open the page at 1440×900 and 390×844, remove fixed popups/cookie bars
  (same selector list as `frames.cjs`), scroll to bottom to load lazy parts, screenshot `<footer>` (or the last
  `.shopify-section`) to `footer-d.png`/`footer-m.png`; collect the most prominent `a,button` styled as buttons (computed
  `border-radius, padding, font-family, font-weight, font-size, text-transform, letter-spacing, background, color, border,
  box-shadow`) to `buttons.json` and crop the first two to `buttons-d.png`; crop the first product card to `card-d.png`.
- [ ] Run it on the theme demos (`../2026-10-31-34-templates/demo-urls.json`) and on real stores by category —
  dulces: sugarfina, bonbonbon, behave, smartsweets, candyclub; comida: graza, omsom, flybyjing, drinkolipop, brightland, fishwife;
  moda: everlane, kotn, sezane, satisfyrunning; belleza: rhodeskin, glossier, summerfridays, meritbeauty; hogar: fromourplace,
  greatjonesgoods, parachutehome; tecnología: nothing.tech, ridge; mascotas: wildone, maxbone; niños: lovevery, tonies;
  deporte: tracksmith. Sites that block the headless browser are dropped (logged).
- [ ] Contact sheets per part, look at them, write `ledger.md`: one row per template — reference store(s), and the footer / button /
  card / pdp / cover it will use, within the caps, each new variant named with the real store it is copied from.

### Task 2: The variety test (fails today)

**Files:** Create `packages/store-templates/test/template-variety.test.mjs`

- [ ] Write the test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const templates = require('../index.js');

// Template frame variety (owner 2026-11-03 «todo se parece haz más diversidad»): the 35 themed templates must not share the same
// footer, buttons, card, product page or cover. Spec docs/superpowers/specs/2026-11-03-template-frame-variety-design.md.
const themed = () => templates.loadTemplates().map(entry => entry.manifest)
  .filter(m => m.preset && m.hidden !== true && m.extends === 'esencial' && m.reference);
const PRODUCT_SECTIONS = ['products-grid', 'products-tabs', 'products-slider'];
const frame = m => {
  const v = m.preset.variants ?? {};
  const layout = m.preset.layout ?? [];
  return {
    id: m.id,
    header: v.header ?? 'centered',
    footer: v.footer ?? 'columns',
    button: v.button ?? 'pill',
    card: layout.find(s => PRODUCT_SECTIONS.includes(s.type))?.card || 'classic',
    pdp: v.pdp ?? 'gallery-left',
    cover: layout[0]?.type ?? 'none',
    types: new Set(layout.map(s => s.type)),
  };
};
const atMost = (part, cap) => {
  const counts = {};
  for (const f of themed().map(frame)) (counts[f[part]] ??= []).push(f.id);
  for (const [value, ids] of Object.entries(counts)) assert.ok(ids.length <= cap, `${part} «${value}» on ${ids.length} templates (max ${cap}): ${ids.join(', ')}`);
};

test('no footer on more than 4 templates', () => atMost('footer', 4));
test('no product card on more than 4 templates', () => atMost('card', 4));
test('no button look on more than 5 templates', () => atMost('button', 5));
test('no product page on more than 6 templates', () => atMost('pdp', 6));
test('no cover on more than 6 homes', () => atMost('cover', 6));
test('no two templates share header, footer, card and product page', () => {
  const seen = new Map();
  for (const f of themed().map(frame)) {
    const key = [f.header, f.footer, f.card, f.pdp].join('|');
    assert.ok(!seen.has(key), `${f.id} and ${seen.get(key)} share ${key}`);
    seen.set(key, f.id);
  }
});
test('the five common filler sections sit on at most 10 homes each', () => {
  for (const type of ['story-split', 'categories-tiles', 'newsletter-split', 'press-quotes', 'products-slider']) {
    const ids = themed().map(frame).filter(f => f.types.has(type)).map(f => f.id);
    assert.ok(ids.length <= 10, `${type} on ${ids.length} homes: ${ids.join(', ')}`);
  }
});
test('homes stay different (average section overlap ≤ 0.20)', () => {
  const all = themed().map(frame);
  let sum = 0, pairs = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i].types, b = all[j].types;
    const shared = [...a].filter(t => b.has(t)).length;
    sum += shared / new Set([...a, ...b]).size; pairs++;
  }
  assert.ok(sum / pairs <= 0.2, `average overlap ${(sum / pairs).toFixed(3)}`);
});
```

- [ ] Run: `cd packages/store-templates && node --test test/template-variety.test.mjs` → FAIL (footer 27, card, button, pdp, cover,
  fillers). Commit: `test(templates): variety caps for footer, buttons, card, product page and covers (fails today)`.
- [ ] Add a case per new variant family that every value a preset names is in Esencial's `variants` enum (`esencial/template.json`).

### Task 3: Buttons

**Files:** `esencial/styles/globals.css` (next to `.es[data-es-button=…]` ~line 583), `esencial/template.json` (`button` enum),
preset `variants.button`.

- [ ] Add button looks copied from Task 1's `buttons.json` (names ours; each rule names its source store in a comment), e.g.
  `shadow` (hard offset shadow, candy/playful), `outline` (2px outline, fills on hover), `arrow` (label + round arrow chip), `caps`
  (square, uppercase tracked, thin), `chunky` (thick border + 3px bottom edge), `glow` (soft tinted fill), plus the unused
  `underline`/`dashed`. Each styles `.es-btn`, `.es-btn--accent`, `.es-card__bar`, cart/checkout pay buttons like the existing
  `soft`/`square` rules, keeps ≥ 44px tap target and a visible focus ring (Review Focus 4).
- [ ] Button board (all looks × paper/accent/deep/photo grounds) at 1280/390 vs `buttons-d.png`; assign per ledger (sweet and food
  stores no longer all `pill`); button cap PASS; store-templates suite green. Commit.

### Task 4: Footers

**Files:** `esencial/components/Shell.tsx` (`Footer`), esencial CSS (footer block ~line 440), `esencial/template.json` (`footer`),
preset json; themed overrides (`[data-es-theme=…] .es-footer`) stay.

- [ ] Add variants from the ledger (`mega`, `centered`, `band`, `signup`, `wordmark`, `card`, `split-contact`, `marquee`, …), each
  copied from its named real footer. Markup changes only where CSS cannot do it (`wordmark`/`marquee` reuse the `bigname` word
  paragraph; `signup` moves `.es-footer__news` above the grid; `split-contact` puts contact first, large).
- [ ] Render each at 1280/390 with full data, with no phone/city/tagline (Review Focus 1) and a 32-char name (3).
- [ ] `node --test test/info-nav-slot.test.mjs test/starters.test.mjs test/esencial.test.mjs` green; switch per ledger; footer cap
  PASS. Commit.

### Task 5: Product cards

**Files:** `esencial/components/library.tsx` (`LIBRARY_CARDS`, `CardTemplate`), `apps/api/src/storefront-source/source-section-library.ts`
(`LIBRARY_CARDS` — must match), esencial CSS (`.lb-card[data-lb-card=…]`), preset layouts (`card` on products sections).

- [ ] Add `overlay`, `line`, `portrait`, `swatch`, `badge`, `polaroid`, `round-add`, `list` (and any the ledger adds), copied from
  `card-d.png` references; touch always shows the add button.
- [ ] API spec case: a library answer with `card: 'polaroid'` keeps it; an unknown card falls back to the default.
- [ ] Render with demo and sparse products (Review Focus 2, 3); switch per ledger; card cap PASS;
  `npx jest src/storefront-source/source-section-library.spec.ts` green. Commit.

### Task 6: Product pages

**Files:** `esencial/components/product.tsx`, esencial CSS (`.es-pdp[data-es-pdp=…]` ~line 453), `esencial/template.json` (`pdp`).

- [ ] Add `centered`, `grid-2`, `carousel` from `../2026-10-31-34-templates/pdp-refs`; one-photo products render without empty
  cells or dead arrows (Review Focus 5). Assign `stacked`/`fashion` too; pdp cap PASS. Commit.

### Task 7: Homes — fillers and covers

**Files:** preset `layout` arrays in `templates/<id>/template.json`.

- [ ] Per the ledger, replace fillers with the section the reference shows there (existing library types first), move covers to the
  reference's cover type until every cap passes and overlap ≤ 0.20. No new text-only sections or dark text bands.
- [ ] Re-shoot every changed template, QA output clean. Commit.

### Task 8: Verify and show the owner

- [ ] `cd packages/store-templates && node --test test/*.test.mjs` green; apps/api touched specs with `--maxWorkers=2`.
- [ ] Re-run Task 0's sweep on all 35: clean.
- [ ] Before/after board of all 35 (home top + footer + card + pdp) at 1280 and 390 → `…/after/`.
- [ ] Live: one new store on 3 different templates through the chat (`pnpm dev:chatgpt`), screenshots side by side.
- [ ] Update memory `project_template_frame_variety.md`.
