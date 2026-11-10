# Home writer on chosen templates — design

Date: 2026-11-04 · Branch: oct24-clean · Status: awaiting owner review

## Why

The owner reviewed every saved revision of all 277 stores (revisions page https://claude.ai/artifact/F1MNKCNvFKzFbpbCdYGwC5).
The strongest homes came from the Oct 30 home writer (benchmark `benchmark/writer-footer-2026-10-30`) and from the sol agent.
Since Oct 31 a picked template is filled by the section library, and the writer never runs, so new stores read as assembled.

Owner, 2026-11-04:
- «can we do like oct 30 but with … templates from here?»
- «i dont care if cheap or costly i want good stores»
- picks: «sorbo, shrine pro, broadcast, calma, palo alto, symmetry, focal maybe alacena , gumdrop and motion»
- agreed: hide the model picker from merchants; test the writer on sol and on Claude Opus.

## What changes

1. **Template pool.** A new store's template comes only from these twelve: Sorbo, Shrine Pro, Broadcast, Calma, Palo Alto, Symmetry,
   Focal, Alacena, Gumdrop, Motion, Tacón (added by the owner after seeing NOA 3k4jxsel r8, «add it»), Pecas (added after Bruma
   96oiiqzj r11). YAPI's template pick (YAPI_TEMPLATE_PICK) chooses the best fit among them for the business.
   Config `YAPI_TEMPLATE_POOL` (comma list of template ids); empty = today's behaviour. `YAPI_TEMPLATE_RANDOM` (pick / all) draws
   within the pool. A pool that names Shrine Pro shows it even though the Shrine pair is otherwise hidden. A store selling one or
   two products still starts on Único (the one-product template), pool or not.

2. **The writer writes the home inside the template.** After the template is applied (rev 1), the follow-up is the home writer,
   not the section library (today: source-chat.service.ts ~447, the `sectionLibrary` follow-up). The template keeps: header and
   menu, footer, product cards, product page, cart, checkout, its theme CSS, its fonts. The writer changes only
   `components/home.tsx` and the five colours.
   - Footer: the template's own (twelve templates = twelve footers). `write_footer` is not offered on template stores.
   - Fonts: the template's pair stays (it is the template's identity). `set_tokens` on template stores takes colours only.
   - Colours: brand colours rule as on Oct 30 (accent or deep stays near the brand's own; never a black text-only band).

3. **Building blocks.** `read_chassis` on a template store also lists the template's tested sections with one example each
   (the template's own `layout` from template.json) and how to place one: `<LibraryHome layout={[{ type: 'cover-split', … }]} />`.
   The writer may mix them with its own JSX. The product-grid rule stays (catalog with sort and filter chips).

4. **Strongest settings.** Writer model `YAPI_HOME_WRITER_MODEL` = `gpt-5.6-sol` (test also `claude-opus-5-5`), reasoning high,
   limits 40 tool calls, 15 min wall (×2 on the ChatGPT plan, still inside the run deadline), 8 screenshots.

5. **Visual review before save.** When the writer calls `finish` on a clean check, a separate review call on the writer's own
   model (so the sol and Opus test arms each review themselves) gets the last check's full-page captures at 1280 and 390 and answers with blocking problems only, from a fixed list:
   text over a photo that is hard to read, light text on a light photo, a title touching or covered by an image or sticker,
   cut words, empty or broken images, a section that looks unfinished, two sections that look the same. Found problems return
   to the writer as «Debes corregir» and it continues. At most 2 review rounds; then the last clean draft saves.

6. **Fallback.** If the writer cannot save (3 failed attempts, or out of time with no clean draft), the store gets the template
   filled by the section library, as today, so a store is never left on the demo home.

7. **Model picker for merchants.** The Studio's «Modelo» select (`generationControls`, apps/merchant-studio/src/source-studio.ts)
   is shown only to the owner/dev (`app.showModelPicker`, on in dev .env). For merchants every request goes as `auto`, and `auto`
   uses the setup we choose per step. The API ignores a non-auto model from a merchant session without the flag.

## Not changing

- The other 22 templates stay in the code and in the switch-template chat flow; they are only out of the first-build pool.
- Stores without a template (template pick off) keep today's path.
- A template switch asked in the chat («cambia a la plantilla Pecas») is still filled by the section library.
- Intake questions (YAPI_INTAKE), photos, catalog, checkout.

## Test (owner looks before anything is switched on for everyone)

Five clones, each built twice (writer on sol, writer on Claude Opus 5.5) = 10 builds:
Remolino, Oh Belly, Cuadrízate, BOXY, rhode (rhode added so Shrine Pro meets a real beauty brand).
For each: which template YAPI picked and why, cost, time, review rounds, and the result next to the store's Oct 30 version,
published as a comparison page. The owner picks the model; it becomes `YAPI_HOME_WRITER_MODEL`.
Watch: art prints (Cuadrízate) have no matching template in the pool — see what YAPI picks.

## Open for the owner

- Footer: the template's footer (proposed) or the writer writes it as on Oct 30?
- Fonts: the template's (proposed) or the writer may change the heading font?

## Rollback

`benchmark/writer-footer-2026-10-30` tag + `.superpowers/benchmarks/writer-footer-2026-10-30.api.env`; or unset YAPI_TEMPLATE_POOL.
