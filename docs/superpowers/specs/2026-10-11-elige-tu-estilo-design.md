# Part C: "Elige tu estilo", with a first-store walkthrough

Status: draft for owner review, 2026-10-11.
Programme: `2026-10-10-choose-your-style-design.md` (part C of four). Part A (logo and favicon) and part B (themed fonts) are built. The business playbook (`2026-10-11-business-playbook-design.md`) is built and is the source of the calm style families used here.

## Why

Boosterpack's last step, "Choose your style", shows four real heroes built from the business's own words before the site exists. The merchant picks one, and the whole site follows it. pagosYa builds straight from the chat with no choice. Two things make the result weaker than it could be:

1. **The merchant never sees options.** The planner already invents three concepts per store and picks one itself (`source-design-planner.ts:43-54`). None of them is shown.
2. **The material is thin.** Creating a store asks only for a name and an optional logo (`apps/merchant-dashboard/index.html:391-400`). The merchant then lands in an empty Studio chat that asks one open question ("¿Qué ofrece tu negocio y a quién quieres llegar?"). Stores built from a name and a sentence look alike whatever the design engine does.

A third, technical, reason: today the three concepts **share one palette and one style family**. The playbook picks a family before planning, the dice draw one palette from it, and the planner builds every concept on that palette (`frame-draw.ts:358`). The concepts cannot offer calm next to bold, or different colours, so they could not be shown as distinct choices even if we wanted to.

## Owner decisions (2026-10-10 and 2026-10-11)

1. Each option is a **full rendered hero** (fonts, colours, photo, layout), not a font sample.
2. **Four** options: always **two calm and two bold**.
3. Heroes are **written by the model**, one small call per concept, in parallel.
4. Previews cost tokens, so the merchant **cannot ask for more**. They pick one of the four or tap "Elige tú".
5. The options appear **in the preview area of Studio**, with the chat beside them.
6. While the options are shown, the merchant **picks as shown**. Adjustments come after the store is built.
7. Shown for **new stores and full redesigns**. Small edits never show it.
8. A **first-store walkthrough**, one question per screen, gathers the material before the options. It is part C1 of this spec. The style step is C2. Both ship in this order.
9. **Two jobs**: a proposal job that ends waiting for the pick, then a normal build job. A templated hero is the fallback when a hero call fails.

## Goals

1. A merchant with no store goes through a short, easy walkthrough and ends with a real brief: name, what they do, logo, photos, up to five products, story and contact.
2. Before any full build, the merchant sees four distinct designs of their own store (two calm, two bold) and picks one.
3. The built store matches the card that was picked: same header, hero, palette, fonts and mode.
4. With both flags off, nothing changes.

Non-goals: regenerating options, editing a concept before the build, variants/inventory/shipping in the walkthrough, Google rating and review import (part D), and changing how small edits work.

## C1. The first-store walkthrough

### When it appears

The walkthrough appears only when the merchant has no store, behind the flag `ONBOARDING_WALKTHROUGH=1`. It replaces the "Crea tu primera tienda" modal in the merchant dashboard (title switch today at `src/dashboard.js:1296`) and fills the whole screen. From the second store on, the existing modal stays.

The "¿Vienes de Shopify?" link stays on the first step as an exit to the existing import dialog.

### Shape

The walkthrough shows one question per screen, with a progress bar at the top and the buttons "Atrás" and "Siguiente". Optional steps also show "Saltar". Enter advances. Large type, one column, and it works on a phone.

| # | Step | Required | Writes to |
|---|------|----------|-----------|
| 1 | "¿Cómo se llama tu negocio?" | yes | `POST /stores {name}`: the store is created here |
| 2 | "¿Qué vendes o a qué te dedicas?" (one sentence) | yes | `Store.onboarding.what` |
| 3 | Logo: "Subir" or "No tengo, YAPI te hace uno" | no | the existing logo upload (part A) |
| 4 | Photos: product, place or team, several by drag and drop | no | `POST v1/uploads` (`MediaAsset`), ids in `Store.onboarding.photos` |
| 5 | Products: up to five, each with name, price and an optional photo. Below them, "Tengo muchos: importar desde Shopify o CSV" and "Los agrego después" | no | the existing payment-link create endpoint; the import links open the existing dialogs |
| 6 | "Tu historia": since when, where, what only you do | no | `Store.onboarding.story` |
| 7 | Contact: WhatsApp and city | no | the store's real contact fields and `Store.onboarding.contact` |

The store is created in step 1, so every later upload and product belongs to an existing store and uses today's endpoints unchanged.

### State

`Store.onboarding` (new nullable `Json` column) holds:

```ts
{ version: 1, step: number, done: string[], skipped: string[], what?: string, story?: string, photos?: string[], contact?: { whatsapp?: string; city?: string }, finishedAt?: string }
```

Every step saves when the merchant presses "Siguiente" or "Saltar". On reload, a store whose `onboarding` has no `finishedAt` reopens the walkthrough at `step`.

### Hand-off to YAPI

On the last step:

1. The walkthrough builds the brief from the answers: the business sentence, the story, contact and city, with photos tagged by the step they came from.
2. It seeds the Studio setup draft (`SourceSetupDraft.answers.context` and `imageUses`, `source-setup.ts:5-21`) with that brief, so the chat starts from it and never asks again what was answered.
3. It starts the proposal job (C2), or, with the style flag off, today's generation.
4. It lands the merchant in the Studio workspace (`dashboard.js:1455-1460`), where the preview shows "Preparando tus estilos…".

## C2. The style step

### Four draws, not one

`frameForRun` today returns one draw (frame, design, palette, buttons) per run. A new `styleDraws` returns **four independent draws**, one per card:

| Card | Mode | Family and palette |
|---|---|---|
| 1 | calm | the kind's first playbook family, one of its palettes |
| 2 | calm | the kind's second playbook family, one of its palettes |
| 3 | bold | a palette from the full catalogue (`allPalettes()`), bold header and hero parts allowed |
| 4 | bold | as 3, with a different palette and a different hero |

Rules:

- Calm draws use the existing conventional limits (`CONVENTIONAL_HEADERS`, calm hero/footer/structure/photos/hover, the kind's angles). Bold draws lift them, exactly as `asksForBold` does today.
- The four draws avoid recent stores, as today (`recentForKind`), **and each other**: no two cards share a hero part or a palette.
- In a full redesign, the store's previous draw joins the history, as today, so no card gives the store its own hero back.
- For kind `general` (no playbook kind detected), the two calm cards take one family each from the two nearest kinds. Nearest means the second- and third-highest keyword scores in `detectKind`, and `services` and `crafts-home` when every score is zero.
- Fonts: calm cards use their family's font pairs. Bold cards draw a pair from the full 52-family catalogue (part B), and the two bold cards never share a display font.

### The planner fills four slots

`source-design-planner.ts` gains a four-slot mode. It still makes one structured call, but the prompt carries four slot directions, one per draw, in place of the one `planner` paragraph. It returns exactly four concepts, each built on its own slot's draw, and the concept gains three fields for the card:

- `cardName`: two or three words in the merchant's language, for example "Tostador de barrio"
- `vibe`: one paragraph, from the signature's idea
- `inspiration`: three to five bullets, taken from the merchant's own material (story, products, place)

The model still returns `selection.index` and `rationale`. That is YAPI's recommendation, used by "Elige tú".

Validation is per concept. A concept that fails `validateSourceDesign` is dropped. With two or three valid concepts, the cards show those. With one, the build starts directly with it. With none, the planner retries once, then falls back to today's flow (auto-pick and build), and the chat says "No pude preparar los estilos, armé uno por ti."

### Four heroes in parallel

For each valid concept, one small model call writes a **header and hero** as one self-contained HTML fragment with its CSS. It uses:

- the store's real name, inside `[data-store-name]`
- the logo: the uploaded one, or the part A typographic logo drawn in the concept's display font and colour
- one real photo, chosen by role: business photo first, then product photo
- a headline and one line of copy from the brief
- the concept's fonts as `@font-face` pointing at the self-hosted `assets/<id>.ttf` (part B), and its palette

The four calls run in parallel, and each card fills in as soon as its call returns.

**Fallback.** When a hero call fails or returns unusable HTML, that card gets a **templated hero**: one fixed header and hero layout, filled with the concept's fonts, palette, name, logo and photo. It needs no model call.

### Storage and the waiting state

The proposal job is a `StoreSourceChatJob`, like any generation. It ends with the new job status `AWAITING_STYLE`. The proposal is saved on its `StoreSourceGeneration`, in a new nullable `Json` column `proposal`:

```ts
{ version: 1, draws: Draw[4], design: SourceDesign /* the four concepts + selection */, heroes: Array<{ html: string; source: 'model' | 'template' }>, kind: string, redesign: boolean, createdAt: string }
```

The proposal stays until the merchant picks or asks for another full redesign. It never expires on its own. Reloading Studio while a proposal is waiting shows the cards again.

Both new columns (`Store.onboarding`, `StoreSourceGeneration.proposal`) ship in one migration. The owner applies it on dev. Agents never run `prisma migrate`, `diff` or `reset` against the dev database.

### The cards in Studio

These screens live in `apps/merchant-studio`, in the preview area. The chat stays beside them.

**While loading.** The preview shows "Preparando tus estilos…" with four empty cards that fill one by one. The chat says: "Te preparo 4 estilos para *{nombre}*: dos tranquilos y dos atrevidos."

**The grid.** The cards sit 2 × 2 on desktop and in one column on a phone. Each card shows:
- the hero, rendered at scale in a sandboxed iframe (`sandbox` without `allow-scripts`)
- `cardName`
- a small "Tranquilo" or "Atrevido" tag
- the two font names
- four palette dots

**Preview.** Tapping a card opens its hero full size, with a desktop/phone toggle. Beside it:
- **Vibe**: the paragraph
- **Inspiración**: the bullets
- **Tipografía**: both fonts with a sample ("Aa" and one line of the real copy)
- the button **"Usar este estilo"**

**"Elige tú"** sits below the grid. It picks `selection.index`, and the chat explains the choice in one sentence from `rationale`.

**Chat while waiting.** A message sent before picking gets the fixed reply "Primero elige un estilo; después lo ajustamos juntos." This reply costs no model call.

**After the pick.** The cards close, the preview returns to the normal build progress, and the chat says "Construyendo tu tienda con *{cardName}*…".

### Building from the pick

Picking calls a new endpoint, `POST v1/stores/:id/source-project/style-pick {generationId, index}`, or `{generationId, auto: true}` for "Elige tú". It starts a normal generation job with:

- `explore({ selected: index })`: the existing forced pick (`source-design-planner.ts:65-68`). Because the pick is forced, `preferFreshComposition` leaves it alone.
- the proposal's `design`, passed as the committed design, so the planner does not run again (the same path `retainedDesign` uses today)
- the picked slot's draw as this run's frame draw. It is saved to the frame-draw file, so later edits keep it and later stores avoid it.
- the picked hero, passed to the builder with the instruction to keep this header and hero exactly as given and build the rest of the store around them

What reaches the builder:

- **Sep-5 author** (the default in the owner's environment). Today it gets only the fonts (`sep5FontDirection`) and the signature from the concept, and it takes the palette from the run's own draw. It now gets the picked draw's palette and frame paragraph, the concept's fonts and signature, the mode (a bold card turns on the existing bold direction without the merchant saying "atrevido"), and the hero.
- **The non-Sep-5 path** already receives the whole concept ("Implement this committed concept literally"). It gains the picked draw and the hero.

**Retry.** If the build fails after the pick, the retry reuses the saved proposal and pick. It does not ask again or pay for the cards again.

### When the step appears

With `YAPI_STYLE_PICK=1`:

- **New store**: the first full generation of a store with no site, from the walkthrough or from the chat.
- **Full redesign**: the existing "Rediseñar sitio" request (`source-studio.ts:772`), plus any request the generation service already classifies as a fresh design. The current site stays published and visible until the new build finishes.

Small edits never show it. With the flag off, generation runs exactly as today.

## Errors, summarised

| Failure | Behaviour |
|---|---|
| Planner fails | Retry once, then today's flow (auto-pick and build), with a chat line saying so |
| Two or three valid concepts | Show those cards |
| One valid concept | Build directly with it |
| A hero call fails | Templated hero for that card |
| Build fails after the pick | Retry with the saved pick, no new cards |
| Upload or product step fails in the walkthrough | Inline error on that step, with "Saltar" still available. The store already exists. |

## Cost

- **Planner:** one call, as today, with a longer prompt (four slots) and four concepts out instead of three.
- **Heroes:** four small calls, each with the brief, one concept and the font and palette lines in, and one HTML fragment out.
- Estimated at 5–10 % of a full build (11–22 large calls). The live check measures the real number.
- In plan mode (ChatGPT bridge) no credits are charged. For metered merchants, the proposal is charged to the same generation budget as the build that follows.

## Testing

**Unit and service tests**

- `styleDraws`: four draws, two calm and two bold, one per calm family. The four never share a hero part or a palette, they avoid recent stores, and a redesign avoids the store's own previous draw. The `general` kind takes its two calm families from two different kinds.
- Planner four-slot mode: each concept honours its slot's draw and carries `cardName`, `vibe` and `inspiration`. Invalid concepts are dropped, and the two-or-three, one and none rules hold.
- Heroes: the templated fallback is used when a call fails. Card HTML is shown only in a sandbox without scripts.
- The job ends in `AWAITING_STYLE` with the proposal saved. `style-pick` starts a build with the forced index, the saved design and the picked draw. "Elige tú" uses `selection.index`. A retry after a failed build does not create new cards.
- Sep-5 prompt: the picked palette, fonts, mode and hero are present. With the flag off, the prompt is byte-identical to today's.
- Walkthrough: the store is created at step 1, steps are saved as done or skipped, a reload resumes at `step`, and the seeded setup draft contains the answers.
- Both flags off: no new prompt text, no new job status, the old create modal.

**Live check (owner's environment, ChatGPT plan)**

1. Run the walkthrough end to end for a new invented business with its own photos (programme section E).
2. Look at the four cards at 1440 and 390 px. Are they visibly different, two calm and two bold?
3. Pick one, and compare the built store with its card: same header, hero, colours and fonts.
4. Repeat with a full redesign of a test store, and with "Elige tú".
5. Read the real token use of the proposal (planner and heroes) against the build, from `StoreSourceGeneration.attempts`.

Nothing in the live check touches the owner's real stores. The redesign in step 4 uses a test store.
