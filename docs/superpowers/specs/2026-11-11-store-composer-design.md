# Store composer: a home per brand inside its template

Date: 2026-11-11. Status: design approved in chat, written spec awaiting owner review.
Save point before this work: tag `benchmark/templates-2026-11-11` (code), `.superpowers/benchmarks/templates-2026-11-11.api.env`
(settings), `.backups/pagosya-2026-11-11T17-58-07-424Z.dump` (database), `.backups/uploads-2026-11-11` (photos).

## Why

Stores built on the same template look alike. Since 2026-11-05 a template store's first build runs the section library in **fill
mode** (`LIBRARY_FILL_PROMPT`): the template's exact sections, in the template's order, with only words and photos written for the
store. Two stores on Tacón differ only in words, photos and the drawn font pair. The comparison page of 232 stores
(https://claude.ai/artifact/EJuvrCzGVaQ5Pa3kNFvubb) shows the most repeated templates: Merienda 12, Gumdrop 9, Pancita, Pecas, Tacón,
Neón and Mimo 8 each.

What was tried and rejected, and must not come back:
- 2026-11-05 writer on templates (sol writes `components/home.tsx`). The owner said «it looks nothing like shrine pro», and BOXY «got
  really bad». The model threw away the template's home and wrote bare inline-colour bands, text-only sections, and a `<style>` that
  hid catalogue photos.
- Free layout in general. Quality comes from sections tested once.

## Owner decisions (2026-11-11)

1. **A — same template, different home.** The header, menu, footer, product cards, product page, fonts and feel of the template stay.
   The home is composed for each brand from sections that fit the template.
2. **First build only.** Existing stores are not changed. A «rediseña mi portada» chat request is out of scope.
3. **Signature sections plus a composed home.** Each template has 2–3 signature sections that always appear. The rest is composed.
4. **Approach 1: compose, look, correct.** One composition by a strong model, checked by code, built, photographed, and reviewed by
   the model with eyes, up to 3 rounds.
5. **Budget:** up to $8–10 per store is fine. Hard cap $10.

## The flow

Behind a new switch `YAPI_COMPOSER=1` (off → today's fill mode, unchanged). It runs in `SourceChatService.sectionLibrary` when the
input is a first design (`firstDesign`) on a pooled template store, in place of the fill call.

1. **Template choice.** Unchanged: the YAPI pick or the random draw from `YAPI_TEMPLATE_POOL`, then `drawPresetChoices`. The font
   pair and drawn variant parts stay drawn by code, seeded by the store id.
2. **Composer input.**
   - The store facts (`buildLibraryFacts`), with photos sent as images, as the library already does.
   - The template's signature sections, with their looks.
   - The catalogue narrowed to the sections that fit this template (see «Section fit»).
   - The summaries (see «Too similar») of the last 6 homes built on the same template.
3. **Compose.** The model (`YAPI_COMPOSER_MODEL`, default `gpt-5.6-sol`) answers with `blocks`, the existing library answer shape:
   type, look, band, words, photo indexes, items.
   - It picks the sections, their order, each section's look, the cover, the bands, the words and the photos.
   - It is told that the signature sections must appear, with a look of its choice; the cover stays first.
   - The prompt is the free composer's `LIBRARY_PROMPT` plus a composer block saying what to keep, what fits and what recent homes
     look like.
4. **Code check.** `validateLibraryLayout` as today, which already covers photos once, no photo groups, real data only and roles in
   order. The new rules are in «Code check rules». A failed check sends the answer back once with the exact reasons. A second
   failure falls back to fill mode.
5. **Build and photograph.** The candidate home is built in memory (`projects.prepare`, no revision saved) and rendered at 1280 and
   390 wide, full page, with the same Playwright capture the writer review uses.
6. **Review with eyes.** The reviewer (same model) gets the two captures, plus small captures of up to 4 recent same-template homes,
   and answers through a `report` tool.
   - Problems come from `HOME_REVIEW_PROBLEMS` (agent/home-writer-review.ts), plus one new kind: «se parece a la tienda X».
   - Each problem carries a **change** from a closed list:
     - `swap` — section i becomes type t (must fit the template);
     - `look` — section i gets look l;
     - `move` — section i goes to position j;
     - `photo` — section i gets photo k;
     - `band` — section i gets band b;
     - `remove` — section i, never a signature section.
   - The reviewer never writes code, CSS or free markup.
   - The code applies the changes, re-runs the code check, rebuilds and re-captures. A `swap` asks the composer for that one section's
     words, the way a quick-edit «add» does today.
   - Up to 3 review rounds. A round with no problems ends the loop.
7. **Save.** The last version that passed the code check is saved as one revision, through the same refill path fill mode uses
   today. It is the best one, since every round only applies changes the code accepted. The label is «Portada compuesta por YAPI».

## Section fit

- A one-off build script renders every non-decor library section (about 80) inside every template (34 + Merienda, Burbuja, Neón,
  Mimo). It uses the template's demo store data, at 1280 and 390.
- The automatic checks are the ones `check-store-quality.ts` already measures: no sideways scroll, no broken image, photo present
  where the section needs one, readable text (the writer's contrast check), and a height between 120 and 2400 px.
- A section in the template's own home always fits.
- Tone rule, existing: calm templates never get cover-poster, cover-ribbon or statement-sticker.
- The output is `packages/store-templates/templates/esencial/section-fit.json`: `{ "<templateId>": ["<sectionType>", …] }`,
  committed. An owner veto is an entry in a `vetoed` list in the same file.
- A gallery page (an artifact, one row per template) shows every fitting section for the owner to review. A section the owner marks
  is vetoed for that template.

## Signature sections

- A new optional field in each template's preset, in `packages/store-templates/templates/<id>/template.json`: `signature: ["<sectionType>", …]`, 2–3 entries.
- The first entry is the template's cover type.
- Proposed automatically: the template's cover, plus the 1–2 sections in its own home that carry the most theme-scoped CSS
  (`[data-es-theme="<id>"] .lb-…` rules in globals.css). Examples: Neón's campaign strip, Palo Alto's stage.
- The owner approves or edits them on the same gallery page before the composer is switched on.
- A template without `signature` keeps fill mode, even with the switch on.

## Too similar

A home's summary is: the cover type and look, the ordered list of section types, each section's look, and the bands.

A candidate is **too close** to a recent same-template home when both are true:
- the same cover type and look;
- the longest common subsequence of section types is at least 60% of the shorter list.

The cover (type and look) may also not repeat the one used by the last 2 stores on the same template.

The recent homes are read from the latest revision of the 6 most recently created stores whose `brief.templateId` matches. The code
reads them from `store-data.tsx` `layout`; no stored index is needed.

The composer is told what it repeated: «la portada y 7 de 10 secciones en el mismo orden que la tienda X».

## Code check rules (new, on top of `validateLibraryLayout`)

- Every signature section type is present exactly once; the cover is first.
- Every section type is in `section-fit.json` for this template, or in the template's own home.
- Not too close to any recent same-template home (above).
- 7 to 12 sections. The main products grid appears exactly once, among the first three (existing rule).
- Existing owner rules stay blocking: no text-only sections, no group of 3 or more photos, no dark text-only bands, calm colours.

## Failure handling and budget

- The composer call fails, or its answer fails the check twice → fill mode, as today. The merchant sees nothing different.
- A build or capture fails → save the last valid version without a review. Log `composer_review_skipped`.
- The review call fails → save the current valid version.
- Budget: `providerMicroUsd` summed over the composer's calls for this store. At $10 the loop stops and saves the best valid version.
  A ChatGPT-plan run is unmetered in credits but still records provider usage, so the same cap applies.
- Each step writes a `composer` line to the YAPI trace (`.superpowers/yapi-trace.jsonl`): stage, rounds, problems, cost, outcome.

## Cost and time (estimates)

| Step | Cost | Time |
|---|---|---|
| Compose | $0.50–1 | 1–2 min |
| Each review round | $0.30–0.60 | about 1 min, plus about 30 s build and capture |
| **Typical store** | **$2–5** | **5–10 min** (fill mode today: about 4 min) |

## Testing

**Unit (light checks: one spec file per run):**
- Signature present and cover first.
- Every section in the fit list.
- The too-close measure: same cover plus 60% order → too close; other cover → fine.
- Each review change applied, and a signature section refused for `remove`.
- Two failed checks → fill mode.
- Budget cap → stop with the best valid version.

**Section fit:** the build script's output is checked into the repo. A spec asserts every pooled template has a fit list and a
signature.

**Live test:**
- Remolino, Oh Belly, Cuadrízate, BOXY and rhode on their usual catalogues.
- Plus three different brands forced onto Merienda, the most repeated template.

**Comparison page:** today's version next to the composed version for each test store, and the three Merienda stores side by side.

**Success:**
- The owner judges the three Merienda stores as different from each other and still recognisably Merienda.
- No fixed check fails.
- Cost is under $10 per store.

## Out of scope

- Existing stores.
- «Rediseña mi portada» from the chat.
- The product page, menu pages, header, footer and cards.
- New library sections. That is a follow-up if the fit table shows too few sections for some templates.
- Composing three candidates and judging them (approach 3). It can be added later if approach 1 falls short.

## Files expected to change

- `apps/api/src/storefront-source/source-section-library.ts`: the composer prompt block, the new check rules, the home summary and
  too-close measure.
- `apps/api/src/storefront-source/source-chat.service.ts` (`sectionLibrary`): the composer path behind the switch, the review loop,
  the fallback.
- `apps/api/src/storefront-source/agent/home-writer-review.ts`: the review report gains the change list and «se parece a…». Or a
  sibling `composer-review.ts`, if the writer's review must stay unchanged.
- `apps/api/src/config/configuration.ts`: `YAPI_COMPOSER`, `YAPI_COMPOSER_MODEL`, `YAPI_COMPOSER_MAX_USD`.
- `packages/store-templates/templates/<id>/template.json` for each pooled template (signatures), and
  `packages/store-templates/templates/esencial/section-fit.json` (new).
- `apps/api/scripts/section-fit.ts` (new, the one-off render and check script).
