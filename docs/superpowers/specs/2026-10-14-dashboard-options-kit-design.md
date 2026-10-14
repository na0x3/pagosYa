# Dashboard options kit — design

**Date:** 2026-10-14
**Status:** approved in chat, awaiting spec review
**App:** `apps/merchant-dashboard` (vanilla JS, no framework)

## Why

The owner wants the dashboard's settings screens to read like Amboras
(admin.amboras.com: Emails → Staff, Gift cards, Inventory): premium line
icons, options laid out sideways, very little text.

Our page shell already matches Amboras. The gap is inside the panels, and
the root cause is that every panel invented its own controls:

- five tab styles: `settings-tabs`, `cobros-filters`, `proposals-filters`,
  `subs-tabs`, `mcp-tabs`
- five on/off styles: `checkbox-row`, `cobro-toggle`, `email-list-switch`,
  `email-content-switch`, `promo-code-email-toggle`
- no icon set; option rows carry no icons
- option rows stack in one column with two-line explanations

Amboras looks premium because one kit is used the same way everywhere.

Naming: classes use the `ui-` prefix so they are never confused with the
`@pagosya/storefront-kit` package.

## What the owner said vs. what we assume

Said: options like the Amboras screenshots, premium icons, options
organised sideways, not much text; dashboard first, product pages later.

Assumed (confirmed in chat): no behaviour changes — screens that save with
"Guardar cambios" keep it, switches that save instantly keep doing so.
Visual and copy only; no API or schema changes.

## Success

- One icon set and one shared kit; every converted screen uses only `ui-`
  classes for section heads, switches, option grids, choice cards and tabs.
- In Ajustes → General, the checkout mode and both switches fit on one
  screen at 1440×900.
- Every option helper line is one line (~8 words) at desktop width.
- Dashboard unit and e2e suites stay green; desktop and 390px phone checked
  in the browser for each converted screen.

## Design

### 1. Icons — `src/icons.mjs`

About 40 Lucide icons vendored as SVG child markup, with the ISC licence
notice at the top of the file. One export:

```js
icon(name, { size = 18, label } = {}) // → "<svg …>" string
```

Stroke 1.5, `currentColor`, `aria-hidden="true"` unless `label` is given.
An unknown name throws. A unit test scans `src/` for `icon("…")` calls and
asserts every name exists. No npm dependency.

### 2. Kit — `src/ui-kit.css`

Loaded after `workspace-design.css`. Uses existing `--pg-*` tokens only.

| Piece | Markup | Notes |
|---|---|---|
| Section head | `.ui-head` > `.ui-head-icon`, `h3`, `p`, optional `.ui-count` | Icon box 36px, 1px border, radius 10px; count pill on the right |
| Switch | `<input type="checkbox" role="switch" class="ui-switch">` | Native checkbox, `appearance:none`, 36×20 pill; keeps existing ids and `data-*`; visible focus ring |
| Option grid | `.ui-options` > `label.ui-option` (switch, icon, `strong`, `small`) | 3 columns ≥1100px, 2 ≥700px, 1 below |
| Choice cards | `.ui-choices` > `label.ui-choice` (radio, icon, `strong`, `small`) | Side by side; selected card gets a dark border |
| Pill tabs | `.ui-tabs` > `button.ui-tab[role=tab]` (optional icon) | Replaces the five tab styles; selected = raised white pill |
| Inline switch | `label.ui-inline-switch` > `.ui-switch`, short label | For row-level toggles ("Cerrado", "Activo") |
| Pills | `.ui-pills` > `label.ui-pill` (radio, label) | Small presets ("7 días", "Formal"); replaces `cobro-preset` and `proposal-pill` |
| Stat card | `.ui-stat` > label, number, corner icon | For summary rows (cobros, proposals, contracts) |

Small helpers in `src/ui-kit.mjs` build these strings
(`uiHead`, `uiOption`, `uiSwitch`, `uiChoice`, `uiPill`, `uiStat`) so panels
don't hand-copy markup. The icon drawings live in a generated
`src/icon-paths.mjs` (from `lucide-static`, already in the repo for apps/api,
via `scripts/build-icons.mjs`); `src/icons.mjs` draws them.

### 3. Copy

Each option keeps a title and one helper line of about eight words.
Caveats that matter appear only when they apply, using the conditional
notes the screens already have (for example `data-payment-requirement` for
KYC and NIT). If removed helper text carries a rule the merchant must
know, it moves to a conditional note rather than disappearing.

### 4. Screens, in order

1. **Ajustes** (`store-settings.mjs`, settings tabs in `index.html`) —
   section heads with icons; checkout mode as choice cards; visibility and
   low-stock as switches in an option grid; location pickup / delivery /
   closed / unlimited as switches; pill tabs. Owner reviews live before
   step 2.
2. **Correos** (`email-list-panel.mjs`, `email-content-panel.mjs`)
3. **Cobrar** (`cobros-panel.mjs`)
4. **Suscripciones** (`subscriptions-panel.mjs`)
5. **Contratos** and **Propuestas** (`contracts-panel.mjs`, `proposals-panel.mjs`)
6. **Asistente** (`assistant-panel.mjs`)
7. **Descuentos** (promo toggles in `dashboard.js`)

Old per-panel classes are deleted from their CSS once their screen is
converted, so the drift cannot come back.

### 5. Out of scope

Storefront product pages (separate programme; it starts by fixing the
local storefront on :5175, which currently answers "Tienda o página no
disponible" for published stores). The merchant Studio. Any behaviour,
API or database change.

## Testing

- Unit: `src/icons.test.mjs` (every used name exists; output is a valid
  SVG string) and `src/ui-kit.test.mjs` (helpers escape text, switches
  carry `role="switch"`). Existing `src/*.test.mjs` stay green; assertions
  change only where they check copy we shortened.
- E2E: `apps/merchant-dashboard/tests` stay green; selectors use ids and
  `data-*`, which the kit keeps.
- Visual: each screen checked in the browser at 1440px and 390px before
  the next one starts.
