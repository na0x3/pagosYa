# Business playbook and professional by default — YAPI knows what a real site of each kind of business looks like

Date: 2026-10-11 · Branch: `feature/store-page-architecture` · Status: approved in conversation, awaiting spec review
Builds on: frame draw (round 1, `2026-10-10-frame-hero-draw-design.md`) and design draw (round 2,
`2026-10-10-design-draw-round-2-design.md`). Speed fix shipped first (692fef30: review returns edits; ~7 min per store).

## Why

The owner compared our coffee stores with https://pagosya.boosterpack.xyz (Boosterpack built it for a real Peruvian
"PagosYa!" factoring company from a little context): "it looks like a real site, the footer with those structured links,
the whole page has real sense … all of it looks like a normal real website, with good colors, good typography", and:
"yapi should know which like style for each business, and also their version of yapi even built like a calculator
based on the type of the business".

Measured on that page at 1440 px: one 1296 px container (72 px margins); h1 78 px serif weight 400, line-height 1.12;
h2 54 px; body 19 px / 1.63; 108 px section padding; three close cream tones alternating plus one dark band;
7 sections (split hero → simulator → 4 steps → story split → lenders band → FAQ → contact with form and map);
header logo + 3 centred links + one outlined button; 4-column footer, 14 links, legal row (company, tax id, operator
address, licences); 0 `@keyframes`; 2 AI-generated photos.

Ours, on purpose since 2026-10-05: bold by default, a signature concept, giant poster type, unconventional headers
drawn by the dice (bottom pill, side rail, overlay, reveal, wordmark band). Different from each other, none reads as a
real company site. And `brief.businessType` holds the store *name* (round-2 store 4 saved category
"tostadero yungas"), so nothing knows the kind of business.

## Owner decisions (2026-10-11)

- Order: C speed (done) → A this playbook → B a working tool per business (separate spec; the playbook names it).
- Playbook = curated entries backed by studied reference sites. First version covers 8 kinds: café & food,
  bakery & sweets, clothing & accessories, beauty & personal care, professional services (incl. finance),
  fitness & wellness, crafts & home, flowers & gifts; everything else uses "general professional store".
- References: I propose a shortlist (4-5 candidates per kind, screenshots), the owner keeps 2-3 per kind.
- Approach: hybrid — content contract per kind (checked after the build) + 2-3 style families with exact values;
  YAPI writes freely inside them; the round-1/2 dice pick only within the family; a professional craft contract for
  every store; bold layouts only when the merchant asks.

## Design

### 1. Kind of business and the playbook entry

- **Detection.** The concept planner gets one new required output, `kind`, one of the 8 ids or `general`. A keyword
  check (café, cafetería, tostadero, panadería, pastelería, ropa, moda, salón, belleza, contador, abogado, financiera,
  gimnasio, yoga, pilates, artesanía, cerámica, florería, regalos…) runs on the merchant's own words and the catalogue;
  when they disagree the planner wins. A merchant's chat correction ("es una florería") wins over both.
  The kind is saved in `frame-draw.json` as `kind` and replaces round 2's `category` for repeat weighting.
- **Entry** — one data file per kind in `apps/api/src/storefront-source/design-engine/playbook/<kind>.ts`:
  - `kind`, `name`
  - `sections`: the content contract, each `{ id, must: string }` — what a real site of this kind always shows
    (café: what is sold with live prices, hours, location with map, pickup/delivery; services: what is offered,
    how it works, proof, FAQ, contact).
  - `styleFamilies` (2-3): `{ id, name, palettes: Palette[] (base tones + one accent, ≥ 4.5:1), fonts: Array<{ display, text }>
    (3-4 curated pairings from the font catalogue), radius, photoShape, buttons: string[] (kit button forms),
    spacing }`.
  - `tone`: how the copy speaks + words to avoid.
  - `footer`: what the footer lists, including a legal row from store data (name, NIT when set, address, hours).
  - `tool`: reserved for track B (empty).
  - `references`: the approved sites the entry was learned from.

### 2. How it shapes every build

- **Professional craft contract** (every store): one content container 1200-1320 px with 64-80 px margins; h1 56-80 px,
  h2 40-56 px, body 17-19 px / ~1.6; one section rhythm 88-120 px; calm alternating backgrounds, at most one dark band,
  hairline dividers; standard header (logo, 3-5 links, one action, cart); multi-column footer with legal row; phones:
  no sideways scroll, 44 px targets. In the author prompt **and** measured in the Sep-5 self-review (h1 > 96 px, no
  container, section padding outside the range → facts to fix).
- **Bold by default off**: `sep5BoldDefault` returns true only when the merchant asks for bold
  ("atrevida", "estilo póster", "llamativa"…); otherwise the craft contract applies.
- **Planner**: receives the kind's entry; builds concepts inside one style family; fonts from the family's pairings.
- **Author**: receives the content contract and the chosen family's exact values.
- **Dice (rounds 1-2)**: pick only among options that fit the family; headers only `centered-split`, `menu-button`,
  `info-bar`, `stacked`, `shrinking` unless the merchant asked for bold; palettes, buttons, photo treatments from the
  family's range; repeats avoided against recent stores of the same `kind`.
- **After-build check**: the self-review lists missing content-contract sections ("falta el horario"); fixed by an
  edit; advisory, never fails a build.

### 3. References, rollout, switches

- Reference study per kind: 4-5 candidates → owner keeps 2-3 → measured like the PagosYa! page (container, type
  sizes, rhythm, section order, footer, palette, fonts, any working tool) → entry written from the measurements.
- Build order: (1) craft contract + its checks + bold off; (2) detection + playbook loader + `general` entry;
  (3) the 8 entries from the study; (4) dice restricted to the family.
- Switch: `YAPI_PLAYBOOK=off` → today's behaviour (no kind, no playbook lines, dice unrestricted, bold default as
  before).

## Testing

- Detection on sample briefs for each kind; the planner's kind wins on disagreement; chat correction wins.
- Every entry loads; every palette ≥ 4.5:1; every font pairing exists in the font catalogue; every button id is a kit
  form.
- Craft facts flag a 200 px h1 and a page without a container, never a normal page (real-browser test).
- A café draft without hours gets a "falta el horario" fact.
- Dice never draw a bold header without a bold request; palettes come from the family.

Live (owner's plan, ~35 min): one store each for a coffee roaster, a clothing boutique, a bakery, a beauty salon and
an accountant. Pass: each reads as a real professional site of its kind, has every contract section, meets the craft
numbers; then two coffee shops differ in style family while both look like real café sites.

## Not in this round

The working tool per business (track B), AI-generated photos, real business facts from the web, a Studio style picker.

## Reference findings (2026-10-11, `docs/superpowers/research/2026-10-11-playbook-references.md`)

The 18 owner-approved references split into two shapes, so the craft contract has two profiles and each kind picks
one: **shop-led** (café-food, clothing, beauty, crafts-home, flowers-gifts, bakery-sweets when it sells online:
h1 28-48 px, body 14-16 px, white + one brand colour band, product grid early, square or pill buttons) and
**story-led** (services, fitness-wellness: h1 56-96 px, body 16-20 px, tinted alternating backgrounds, 96-144 px
rhythm). Both keep the 1140-1320 px container, the standard header and the multi-column footer with a legal row.
The self-review measures against the kind's profile. Supersedes the single "h1 56-80, body 17-19" in §2.

## Planning rulings (2026-10-11, plan `docs/superpowers/plans/2026-10-11-business-playbook.md`)

- Kind detection is keyword-based on the merchant's instruction, the brief and the catalogue names, run before the
  draw; the planner does not output `kind` (it runs after the draw and would need a schema change).
- The contract check reads the rendered page text with a per-section regex.
- The craft self-review measures h1 and body sizes against the profile; container width stays a prompt rule.
