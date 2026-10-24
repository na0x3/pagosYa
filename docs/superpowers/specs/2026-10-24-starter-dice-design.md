# Starter dice — finished looks that still vary, and a two-path comparison

Date: 2026-10-24 · Owner-approved design (chat, 2026-10-24) · Follows `2026-10-24-starters-and-parts-design.md`

## Why

Starters (Calle, Taller, Vitrina) were live-checked on 2026-10-24 and then switched off (`YAPI_STARTERS=off`): the owner
felt «las tiendas ya no van a ser random como antes». A starter skips Esencial's dice, so every clothing store opened as
the same Calle or Taller, and only words, photos and brand colours differed. The owner wants to keep the starters path and
then compare it against plain Esencial-random on real stores.

## Agreed understanding

- **Owner said:** continue with starters, but each starter rolls dice so two stores on the same starter do not come out the
  same; then try both paths and compare. Variation level: **medium**. Vitrina: **rebuild it on Esencial** so it can roll too.
  Test: **5 businesses × 2 paths, first build only**, then the full YAPI redesign on the 2 the owner picks.
- **Success:** two stores on the same starter look clearly different at first glance (cover, grid, cards, type, palette),
  and both still read as that starter (Taller: warm paper, serif, air; Calle: white, Bodoni, sharp; Vitrina: PEPPA's
  bold outlines, hard shadows, pills). The owner can choose between the two paths from side-by-side screenshots.

## 1. Dice inside each starter

- Each starter's `template.json` gains `starter.dice`: the parts that vary, each with a hand-picked list of 2–4 allowed
  ids, plus `palettes` and `fonts` lists. Parts not listed stay fixed at the starter's preset value.

  ```json
  "dice": {
    "hero": ["stack", "framed", "split-left"], "grid": ["side-title", "grid3"], "card": ["framed", "plain"],
    "story": ["split", "note", "quote"], "closing": ["accent", "photo"],
    "palettes": ["linen", "sand", "terracotta"], "fonts": ["gallery", "editorial", "literary"]
  }
  ```

- `applyMaster` with a starter no longer skips the dice. It calls the existing `rollVariants` with Esencial's settings
  **narrowed** to the starter's lists (`variants` catalogue = `starter.dice` parts only; `palettes`/`fonts` = the starter's
  lists), seeded by the store id, with the merchant's recent rolls (`recentMasterRolls`) so stores in a row do not repeat a
  cover/palette/font combination. The rolled parts are laid over the starter's preset variants; the preset keeps every
  part the dice do not name.
- Every rule the Esencial dice already apply still holds inside a starter: a cover that needs several photos is never
  rolled for a store without them; no gallery/collage of 3+ photos unless the merchant asked (`photoGroups`).
- The merchant's confirmed brand colours (or logo colours) still win over the rolled palette, as today.
- «Probar otro estilo» rolls the new starter's dice too, with the same seed rule as a first build.
- A starter without `starter.dice` behaves exactly as today (fixed preset) — a safe default for future starters.
- `packages/store-templates` validation: every id in `starter.dice` must exist in Esencial's catalogue for that part, every
  palette/font id must exist; a starter with `dice` must extend Esencial.

**Calle** and **Taller** keep every Esencial variant's CSS in their harvested `globals.css` (checked 2026-10-24), so they
can roll without file changes. Their dice lists are chosen so each option keeps the character; a list is screenshotted
option by option before it is enabled, and an option that breaks the look is dropped from the list.

## 2. Vitrina rebuilt on Esencial

- A new `templates/vitrina/` built from Esencial's current files (`extends: "esencial"`, master fill) plus a CSS layer with
  PEPPA please's character, read from today's `vitrina/styles/globals.css`: thick dark outlines (`--store-border:#171311`),
  hard offset shadows (3/6/8px), pill buttons, large card radius (30–42px), the moving band (Esencial's marquee), cream
  ground with red `#d7261e`, yellow `#ffe23d`, dark brown `#2a0f0c`, lilac `#e8d4f2`.
- New catalogue entries in Esencial's `template.json`, marked `"starterOnly": true` so Esencial's own dice never roll them:
  font pair **Alegre** (Fredoka headings + DM Sans body, both bundled with OFL licences like the other fonts) and 3–4 playful
  palettes (PEPPA's own plus variations). `rollVariants` for Esencial-random filters out `starterOnly` entries.
- Vitrina's dice: cover (dark rounded card / split / full), cards, grid, story, closing, palette among the playful ones.
  Outlines, shadows and pills are fixed.
- **Owner gate:** desktop + phone screenshots of the new Vitrina (and of a few dice rolls) are approved by the owner before
  it replaces the old one. Until then the old folder stays.
- On approval the old copy-slots Vitrina is replaced. The copy-slots starter code path stays (unused) for future starters.

## 3. The comparison

- **Businesses** (demo merchant, catalogues copied with `clone-store-catalog.ts`, which now copies photo files):
  1. BOXY — streetwear minimal (BOXY catalogue);
  2. a second clothing brand on BOXY's catalogue under another name, with an «de autor, hecho a mano» brief (no other
     clothing catalogue still has its photos; NOA VARGAS lost its files);
  3. PEPPA please — salsas;
  4. BAEK Korean Bakehouse — bakery;
  5. Atelier Maestros — paintings (nothing fits a starter: the Esencial fallback, as a control).
- **Path A:** `YAPI_STARTERS=on` (starters with dice). **Path B:** `YAPI_STARTERS=off` (Esencial random, plan card; the
  script taps «Construir»). Each business is built once per path with the same brief; store names carry « · A » / « · B ».
- Switching paths needs an API restart (the switch is read at boot): path A's five run first, the API is restarted once
  with the switch off for path B's five, then the switch goes back to the owner's choice.
- Only revision 1: the follow-up redesign each build queues is cancelled at once (no ChatGPT-plan quota spent on it).
- **Output:** a comparison page with A vs B screenshots (desktop and phone home) per business, opened in the owner's
  browser. The owner then picks 2 stores for the full YAPI redesign.

## Testing

- `rollVariants`/starter dice: a starter's roll only uses its lists; parts outside `dice` keep the preset; two seeds give
  different looks; recent rolls are avoided; multi-photo covers never rolled without photos; brand colours win.
- `applyMaster` with a starter + dice: rolled variants saved, label «Estilo: …», `brief.starterId` kept.
- Esencial random never rolls a `starterOnly` font or palette.
- Template package: `starter.dice` validation; the new Vitrina passes the five store contract checks.
- Visual: every option in each starter's dice list rendered once (desktop + phone) before enabling.

## Out of scope

- The parts shelf (Plan 2) and new starters for other trades (Plan 3).
- Making the swap cards clickable during the follow-up redesign (open item from the live check).
- Committing the earlier uncommitted plan-card / PEPPA-redesign work the starter code sits on.
