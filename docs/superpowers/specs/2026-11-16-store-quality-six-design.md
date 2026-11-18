# Store quality: photos, missed defects, menus, speed — design

Date: 2026-11-16 · Owner: «lets do 1 to 6» (my six recommendations after Miga Dorada, The Bake Lab and NOA VARGAS), photo source
«Curated library», menus «Keep 5», save point committed first (1a1b2ef3, cf8adffb, 79d46f05). Later round, not in this spec: how
YAPI reacts to changes merchants ask for (prices, products, colours, sections).

## What today showed

| Store | Pictures on home (desktop) | Time | Cost | Attempts |
|---|---|---|---|---|
| Miga Dorada r2 (8 product photos only) | 8 | — | — | — |
| The Bake Lab r2 (same 8 photos) | 9 | 34 min | $3.13 | 6 |
| The Bake Lab r3 (+18 brand photos, after cf8adffb) | 25 | 32 min | $2.82 | 6 |
| NOA VARGAS r2 (+16 atelier photos) | 23 | 35 min | $3.18 | 6 |

- Brand photos make the difference between «only product shots» and a rich page — but only when the merchant has them.
- The first full draft takes 10–11 min; the rest is fix rounds for defects, several of them caused by too few photos («same photo
  twice», «text-only band»).
- Defects that reached saved designs although checks and the look pass (desktop + phone) ran: the product cut-out over the
  headline (Bake Lab «RELLENAS HASTA EL CENTRO»), category tiles without a photo (Bake Lab Combos/Cajas), hero actions drawn as
  text links (NOA), a steps band with empty space under the numbers (NOA 01/02/03), a title squeezed into a narrow column
  (Bake Lab «Cinco maneras de empezar», 4 lines), the address/slogan repeated 3 times (Bake Lab r2), phone category tiles running
  off the screen (Bake Lab r3 run).
- Menus: 16 models; several look poor even after today's colour fix (stickers, index, need, thumb).

## Part 1 — every store gets enough photos (curated library)

**Library.** `apps/api/assets/photo-library/<sector>/` with photos and one `manifest.json` per sector:
`{ sector, label, keywords: string[], photos: [{ file, subject, shape: 'wide'|'tall'|'square', source, license: 'CC0' }] }`.
15 sectors to start: panadería y pastelería, café, comida y restaurante, bebidas, moda, novias y alta costura, joyería, belleza y
cuidado personal, mascotas, hogar y decoración, flores y plantas, libros y papelería, deporte y bienestar, tecnología, niños y
juguetes. About 15 photos each, chosen by hand from CC0 sources (rawpixel via Openverse, as for Bake Lab and NOA), no museum
art, no visible brands, at least 1000 px on the long side.

**Owner approval.** Each sector is shown as one contact sheet (artifact) before it ships; photos the owner rejects are replaced.

**Matching.** A store's sector comes from its own words: the onboarding «what», categories and product names against the
manifests' keywords (no model call). No match → no library photos (never a wrong sector).

**When.** At the start of a V2 build (`run`, before `storePhotos`): if the store has fewer than 12 usable uploads (images ≥ 400 px),
copy `14 − count` library photos (at least 6) into the store's uploads as normal `MediaAsset` rows, described as
«Foto de ambiente de la biblioteca pagosYa». Once per store: a store that already received library photos never gets more
automatically (the merchant can delete them).

**Telling the merchant.** The build's chat summary says «Agregué N fotos de ambiente de nuestra biblioteca; puedes cambiarlas o
quitarlas en Tienda › Medios.»

**Acceptance.** A store built from the bakery CSV alone (Miga's catalogue) gets ≥ 18 pictures on the desktop home.

## Part 2 — the defects that slip through (checks + look, desktop and phone)

Each miss above becomes a check in `source-template-qa-rules.ts` (findings the V2 free run blocks on via `FREE_ADVICE_BLOCKERS`),
plus one line in the look pass's checklist (`v2-look.ts`), so the model's eyes and the rules agree:

| Rule | Catches |
|---|---|
| `covered-text` (extended) | a product cut-out or photo over headline letters — today transparent cut-outs slip past |
| `photo-less-tile` | a tile/card in a row of tiles that has no photo while its siblings have one |
| `hero-actions` | hero calls to action that are plain text links instead of buttons |
| `empty-section` (tuned) | a band whose items leave more than ~40% of their height empty (steps, numbers) |
| `squeezed-title` | a section title broken into 4+ lines on desktop, or one word per line |
| `repeated-facts` | the same address, phone or sentence shown 3+ times on the home |
| `phone-overflow` | anything wider than the 390 px phone screen, or tiles cut at the screen edge |

Each rule gets a unit case from the store that showed it (Bake Lab r2/r3, NOA r2 snapshots).

**Acceptance.** Re-checking the saved Bake Lab r3 and NOA r2 designs reports every defect listed above; the five benchmark rebuilds
(Part 4) save with none of them.

## Part 3 — five menus for new stores

`allowedMenus` offers only `mega`, `drawer`, `circles`, `overlay`, `dropdown` (the never-repeat history works within these five).
The kit keeps drawing all 16, so existing stores do not change. The direction prompt's menu list shrinks to the same five.

**Acceptance.** v2 spec: `allowedMenus([])` returns exactly the five; a saved design with `stickers` still renders.

## Part 4 — faster, cheaper builds

1. **Measure first.** Each build logs per stage and per attempt: minutes, tokens in/out, dollars, which rule caused the retry.
   Benchmark = 5 stores rebuilt with Parts 1–3 in place: The Bake Lab, NOA VARGAS, Miga Dorada (now with library photos),
   rhode, goodProtein. Report to the owner as one table.
2. **Then cut**, in this order, keeping each only if the benchmark improves: (a) problems a repair can fix without the model
   (repeated photo, a photo-less tile that has a spare photo, hero links → buttons) are repaired in code instead of costing a round;
   (b) a fix round sends only the sections with problems (already the case in free mode — check it holds for look findings);
   (c) the first draft caps the home at 11 sections.

**Target.** Median ≤ 20 min and ≤ $2 per store on the benchmark, with no more defects than before.

## Order

Part 3 (small) → Part 2 → Part 1 (library code first, then sectors as the owner approves them; bakery, bridal and café first,
since Miga/Bake Lab/NOA need them) → Part 4 benchmark → Part 4 cuts.

## Testing

- Unit: one spec file per change (owner 2026-11-06 «light checks»): v2 spec for menus, photo matching and library insertion;
  template-qa spec for each new rule.
- Live: the Part 4 benchmark is the live check for all parts — screenshots of desktop and phone for each store, defects counted by
  hand against the list above.
- API edits restart the watcher and kill running YAPI builds: no edits while a benchmark runs.

## Out of scope

- How YAPI handles merchants' change requests (prices, products, colours, sections) — next round, its own spec and test set.
- The dashboard redesign (playful/glass/ASCII puppy) — separate track, waiting on the owner's pick.
- Changing menus or photos of existing stores.
