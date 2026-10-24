# Starters and parts — YAPI builds from finished files (2026-10-24)

## Why

Every new store since 2026-10-19 saves revision 1 as «Plantilla: Esencial» (PEPPA, BOXY, NOA, goodProtein, RG Events,
Remolino, BAEK, Oh Belly, both 2026-10-23 comparison runs). Esencial's dice change colours, fonts and part variants, but
`esencial/components/home.tsx` always runs hero → grid → story → values → closing, so the first thing every merchant sees
reads as the same store. Today's YAPI then rewrites much of the look in a follow-up pass; when that pass fails (Oh Belly's
first try, 2026-10-23) the merchant keeps plain Esencial.

The owner does not want YAPI building from scratch (feedback 2026-10-22: «yapi desde cero siempre falla»). They want YAPI
to start from predetermined files, as Amboras does: every Amboras store is a fork of one finished, hand-debugged starter
repo, and their agent edits existing components minimally (research note
`docs/superpowers/research/2026-10-19-amboras-reverse-engineering.md`; learn from it, never copy its code).

## Decisions (owner, 2026-10-24)

| Question | Answer |
|---|---|
| What to build | C — several complete **starters** and a shared **parts shelf** |
| Where starters come from | C — the owner's approved stores first, new starters only for business types they do not cover |
| Who picks the starter | C — YAPI picks and builds at once; the merchant can switch with «Probar otro estilo» |
| How strictly YAPI uses parts | B — shelf first; YAPI writes its own section only when no part covers the request |
| Architecture | 1 — starters and parts are versioned folders in the repo (not Esencial settings, not reference stores in the DB) |

## Success criteria

- Two stores for different businesses look clearly different at their first save, before any YAPI follow-up.
- Live check: the 6 briefs (Oh Belly, Remolino, a café, fashion, tech, beauty) built twice pick at least 4 different
  starters, and no first save reads as «Plantilla: Esencial» unless the business fits nothing else.
- No starter or part is offered unless it passes the contract, phone/desktop, shopping and publish checks.

## 1. Starters

A starter is a complete store folder in `packages/store-templates/templates/<id>/`, the same shape as Esencial:
`template.json` (id, label, `kind: "starter"`, `fits`: business kinds, words and look tags, one-sentence description),
`components/` (Shell, home, product page, catalogue pages, checkout skin), `styles/`, demo photos.

Two fill kinds, by origin:

- **Esencial-based** (from PEPPA, BOXY, NOA): `template.json` has `extends: "esencial"` and `fill: "master"`. Their files
  keep Esencial's store-data structure under YAPI's edits, so the existing master fill writes words, palette, fonts and
  photos into `components/store-data.tsx`, and every Esencial path keeps working (store menu, fashion card, catalogue
  pages, filters, `readMasterState`, `refillMasterFiles`). Stores built from them keep `brief.templateId: "esencial"` plus
  `brief.starterId`.
- **Own-structure** (from Antojo Café, goodProtein #1): `fill: "slots"`. Every text is a named copy slot written by the
  fill call (the Plantillas mechanism: `readPlantillaCopy` / `refillPlantillaFiles`); colours and fonts are CSS variables
  the fill sets.

### Harvesting

A tool, `node packages/store-templates/tools/harvest-starter.mjs <storeId> <starterId>`, reads the store's latest
revision read-only and writes the starter folder:

1. copies the source files;
2. replaces store words with neutral demo words, store photos with our own demo photos (no third-party or brand
   images), brand colours with the starter's defaults;
3. lists every remaining occurrence of the store's name, products, city and contact details, and fails while any remain;
4. never writes to the database.

Then the starter is reviewed in the Studio and the owner approves its look before it is enabled (same gate as Esencial).

### First wave

| Starter | Source | Fill |
|---|---|---|
| from PEPPA please (`cmvgxe3tv000cf63cknnm93ka`, rev 18) | approved | master |
| from BOXY (`cmviri9o80001118u3utjb28g`, rev 14) | approved | master |
| from NOA VARGAS (`cmvi4x7xb0018rb8uvj9ddgzc`, rev 14) | approved | master |
| from Antojo Café (`cmvfjmn5q0001n4za72wlym58`, rev 2) | approved | slots |
| from goodProtein #1 (the store made by `create-goodprotein-demo.ts`; `cmvjj6qw90001yh30d069twvb` rev 6 «goodProtein con marcas» is the likely one — confirm before harvesting) | approved | slots |
| Esencial | existing | master — neutral fallback |
| tech / electronics, beauty / wellness, home / hardware | new, designed and owner-approved one by one | master or slots |

Starter ids are chosen at harvest time (short Spanish words like the presets). The 13 presets
(`docs/superpowers/specs/2026-10-22-plantillas-presets-design.md`) stay as colour/font flavours of the Esencial starter.

## 2. Picking and «Probar otro estilo»

**Picking.** The existing fill call receives the starter list (id + one-sentence fit) and returns one `starterId` with
the words; no extra model call. Code guard rails after the call:

- unknown id → Esencial;
- fashion catalogue (`isFashionStore`) → a fashion-capable starter (NOA or BOXY);
- merchant look words («minimalista», «lujo», «divertida», …) → the starter whose `fits` tags match;
- the same merchant's last 2 new stores do not repeat a starter unless only one fits the business.

The revision label becomes «Estilo: <starter label>». YAPI's follow-up pass (redesign or personal touch) runs on top as
today.

**«Probar otro estilo».** After the first build the Studio shows 2 next-best starters as cards with screenshots. Picking
one rebuilds from that starter, keeping the catalogue and the words YAPI wrote and redoing colours and photos for the new
layout; the previous revision stays in history; the follow-up pass runs again. Shown only while the store is still on its
first build — hidden once the merchant has asked for their own changes.

## 3. Parts shelf

A part is a folder in `packages/store-templates/parts/<id>/`:

- `part.json`: id, label, one-sentence purpose, `fits`, `needs` (photos / video / products / categories / colours), text
  slots with length caps;
- `Part.tsx` and `part.css`, written only against store variables (`--store-accent`, fonts, corners) so they take each
  starter's look;
- `preview.png` captured by the existing preview tool.

Products and prices always come from runtime mounts (`data-pagosya-catalog`, spotlight); a part never types a price or
makes its own add button.

**Tools for YAPI:**

- `list_parts(need?)` → parts that fit this store and request: id, purpose, needs, preview path;
- `add_part(id, page, after)` → copies the part to `components/parts/<id>.tsx` (+ CSS), imports it and places it on the
  page after the named section; refuses a part whose `needs` the store cannot meet.

YAPI then edits the part's words, photos and small styling with its normal edit tools.

**First shelf (~20 parts):** video hero, flavour wheel (Oh Belly); stats band, numbered list, polaroid + stamp, sticker
ring with facts (goodProtein #1); lookbook, journal/manifesto, size guide (NOA, BOXY); marquee band, story with photo,
values triplet, closing band (Esencial); written new: FAQ, reviews band, how-it-works steps, comparison table,
club/newsletter band, category tiles, pickup/location.

**Quality gate per part:** renders at 320, 390 and 1280 px with no overflow; reduced-motion fallback; readable contrast in
every starter; renders nothing when its data is missing. A failing part is not listed.

## 4. Shelf-first rule

- Prompt rule (shops and services): before writing a new section call `list_parts`; if a part fits, `add_part` and edit
  it; write your own section only when nothing fits, and keep it small.
- Progress log notes «usó una pieza: <id>» or «escribió una sección propia».
- Soft check in verify: a hand-written section of the same type as a shelf part (a second FAQ, a hand-made stats band)
  is flagged once as «hay una pieza para esto»; YAPI swaps it if it can. Never blocks finishing.
- Sections YAPI writes that the owner likes can be harvested into new parts with the same harvest approach.

## Rollout

Flags, each switchable on its own:

- `YAPI_STARTERS` — new stores pick from starters; off = Esencial as today.
- `YAPI_PARTS` — `list_parts` / `add_part` and the shelf-first rule.

Existing stores are untouched; only new builds and new edits see starters and parts.

Order: (1) harvest tool + PEPPA starter, owner approves the look; (2) the other four harvested starters; (3) picking +
«Probar otro estilo»; (4) parts shelf + tools + rule; (5) the 2–3 gap starters; (6) live check (6 briefs × 2).

## Testing

- Unit: picking guard rails; harvest de-branding (no brand words left, fails otherwise); `add_part` wiring and `needs`
  refusal; the soft check; prompt rule present for shops.
- Contract and preview checks for every starter and part (the existing contract spec covers starters as it covers
  presets).
- Live: ChatGPT plan only (`pnpm dev:chatgpt`), one run at a time, no running jobs before any `apps/api` save.

## Out of scope

- Restyling existing stores onto starters.
- Building from scratch (owner rule) — the scratch routes stay as they are today and are not extended.
- Copying any Amboras code.
