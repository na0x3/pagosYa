# YAPI asks first, varied templates, a filled «Descubre» menu — design

Date: 2026-11-04 · Branch: `oct24-clean` · Status: approved in chat, awaiting written-spec review

## Why

Owner, 2026-11-04, during the store-readiness run:

- «lets make yapi keep asking questions until he is ready to make the store with it» — today a new template store builds from
  the first message with zero questions (Canasta Viva, Láminas Lu «hola quiero mi tienda para vender laminas»), so YAPI guesses
  the look and the must-haves.
- «pero no parece que siempre las tiendas usan el mismo template? … las de arte usaron la misma» — Taller Lienzo and Láminas Lu
  both got Muro. The picker asks the model for the best template *of the business's rubro*; arte has 2 templates, libros 1,
  construcción 1, niños 2, so a small rubro always lands on the same one.
- Screenshot of Canasta Viva: the header «Descubre» dropdown is four text links over a wide empty panel.

## Decisions taken in chat

| Question | Answer |
|---|---|
| Ask when the first message is already detailed? | Only what is missing (a rich brief may get 0–1 questions) |
| What must YAPI know before building? | What you sell + who buys · the look · must-haves · photos |
| Most questions before building anyway | 4 |
| Approach | A — a readiness check right before the first build, capped by the server |
| Template variety | Top 3 by style from any rubro + the least used + the merchant's look answer, in the same plan |
| «Descubre» | Historia card with a store photo + up to 2 «Lo más pedido» products (max 3 tiles) |

Owner rules that still hold: always start from a template ([[feedback_always_from_template]]); a template the merchant names is
the one used; 1–2 products → Único; no text-only sections; calm colours.

## Part 1 — YAPI asks first

### What the merchant sees

1. The merchant sends the first message (with or without photos). YAPI does not build yet.
2. YAPI checks four topics against everything it already knows — the message, the onboarding answers (`onboarding.what`,
   `story`), the catalogue and the store settings:
   - **what** — what you sell and who buys. Skipped when the words say both.
   - **look** — chips «Tranquila», «Colorida», «Elegante», «Divertida», «Elige tú»; a colour or a reference store can be typed.
   - **musts** — e.g. «¿Haces envíos o solo recojo?», «¿Quieres un código de bienvenida?», «¿Tu WhatsApp para pedidos?».
     Skipped for what the settings already show (a delivery zone, a pickup address, a code, a WhatsApp link).
   - **photos** — only when products have no photo or there are very few: «Tus canastas Bolsa fresh y Carrito no tienen foto,
     ¿me las mandas?» with «Te las mando» / «Sigue sin fotos».
3. One question per message, in YAPI's voice. The first opens with one line of what it understood: «Entendí: láminas de arte
   para decorar, en Cochabamba.»
4. Every question carries a «Créala ya» chip. A typed answer counts like a chip; photos sent on the way join the build.
5. At ready, after 4 questions, or on «Créala ya», YAPI says «Listo, ya tengo lo que necesito» and the normal template build
   starts, seeing the first message plus every answer.
6. Edge cases:
   - «no sé» / a dodge counts as delegated, and YAPI moves on.
   - A merchant question mid-way gets a one-sentence answer plus the same question again, and does not count toward the 4.
   - If the check fails (model error, timeout), YAPI builds at once. Nobody is ever stuck.

### Pieces

- **`apps/api/src/storefront-source/source-intake.ts`** (pure, unit-tested)
  - `intakeFacts({ store, onboarding, products, settings })` → a short object:
    - store name, `what`, `story`;
    - product count; names with and without photos; total photos;
    - delivery zone yes/no, pickup address yes/no, welcome code, WhatsApp/Instagram links.
  - `INTAKE_PROMPT` + `INTAKE_SCHEMA` → `{ understood: string, ready: boolean, topic: 'what'|'look'|'musts'|'photos'|'none',
    question: string, options: string[≤4] }`.
  - `normalizeIntake(answer, state)` →
    - drops a topic already in `state.asked` or already answered by the facts (that topic becomes `ready` if nothing is left);
    - trims the options and appends «Créala ya»;
    - forces `ready` when `state.asked.length >= 4`.
  - `wantsBuildNow(text)` → «créala ya», «ya», «hazla», «así está bien», «no más preguntas»…
  - `intakeInstruction(state)` → the first words + `\n\nRespuestas del comercio:\n` + one `- <question> → <answer>` line per
    answer.
- **`SourceConversationService.intakeStep(merchantId, { storeId, facts, words, answers })`**
  - Same transport as `briefChecklist`: the conversation model, `reasoning: low`, strict JSON schema, one retry.
  - Metered as `source-intake`. Returns `null` on failure; a quota error still throws as elsewhere.
- **Hook in `source-chat.service.ts`**, in the template first-build branch (the one that calls `firstBuild` today, ~line 1475).
  - Runs when `app.yapiIntake` is on and the store has no revision yet, and either:
    - `setupAction === 'generate'` and there is no pending intake: start one; or
    - the last ASSISTANT message on the thread holds `metadata.intake` with `pending: true`: continue it, with or without a
      `setupAction` (a chip tap or a typed reply from the Studio).
  - **Each turn:**
    - append the reply to `answers` and any `assetUrls` to `photos`;
    - if `wantsBuildNow`, 4 asked, the check says ready, or the check failed → mark the intake done and call `firstBuild`
      with `instruction = intakeInstruction(state)`, `chatPhotos = state.photos`, `setupAction: 'generate'`, preceded by
      «Listo, ya tengo lo que necesito.»;
    - otherwise → save an ASSISTANT message with the question, `metadata.clarification = { prompt, options }` (the Studio
      already shows these as chips) and `metadata.intake = { pending: true, words, photos, asked, answers }`, then finish the
      progress.
  - A link in the first message (copy a site, a product link) keeps its own flow, as the branch does today.
- **Flag:** `YAPI_INTAKE=1` → `app.yapiIntake` (off by default; on in the dev `.env`).
- The Studio needs no change: chips come from the existing `clarification` metadata, and a tapped chip sends its text as the
  next message.

## Part 2 — Varied templates

- **`TEMPLATE_PICK_PROMPT` / `templatePickSchema`** (`source-template-pick.ts`) return **3 ranked candidates**
  (`plantillas: [{ id, porque }] ×3`, distinct, from the enum) instead of one.
  - The prompt changes from «el rubro manda» to: pick by what fits these products *and* the look. A template from another
    rubro is fine when its layout suits the catalogue (an art shop can wear Calma, Atelier, Diario); never one whose sections
    need things this store lacks (sizes for a bakery, a menu for clothes).
  - The look the merchant gave in the intake (or the words of the first message) leads the ranking.
- **Least used among the 3.**
  - `pickStoreTemplate` counts recent picks: ASSISTANT messages whose `metadata.templatePick` is set, newest 300.
  - It chooses the candidate used least; a tie goes to the model's order.
  - The first-build reply saves `metadata.templatePick = <id>` (new) so later stores can count it.
- **Unchanged:** a named template wins; 1–2 products → Único; «otra plantilla» switching. `fallbackTemplatePick` when the model
  fails.
- The reason told to the merchant stays one sentence (the chosen candidate's `porque`).

## Part 3 — «Descubre» menu with photos

- **`packages/storefront-kit/commerce-src/header/store-menu.js`**, in `resolveStoreMenuGroups`: a group that ends with no tiles
  (no authored tiles, no category or collection links with photos) gets up to 3 tiles:
  1. **Nuestra historia** — when the group links to `page:about`. The photo is the store's own, never a product photo:
     `store.aboutImageUrl`, else `store.bannerUrl` (both readable by the kit on every page). With neither, there is no historia
     tile. Only a real store photo (`storeMenuPhoto`).
  2. **Up to 2 «Lo más pedido» products** — products with a badge first, then catalogue order; photo + name + price; each links
     to its product page.
- A group with no usable photo keeps links only. Tiles YAPI authored for a group are used as they are.
- Rebuild order: `node packages/storefront-kit/tools/build-commerce.mjs`, then
  `pnpm --filter @pagosya/merchant-dashboard run build:studio`. Existing Esencial stores get it on load (the kit draws the menu).

## Testing

- **Unit specs:**
  - `source-intake.spec.ts`: facts; normalize (no repeated topic, «Créala ya» always present, ready at 4); `wantsBuildNow`;
    `intakeInstruction`.
  - `source-template-pick.spec.ts`: 3 distinct candidates; least used wins; a tie keeps the model order; named and one-product
    rules untouched.
  - Hook routing in an existing chat-service spec: a pending intake routes to the intake; «créala ya» → `firstBuild`; a check
    failure → `firstBuild`; 4 asked → `firstBuild`.
  - Kit: `source-commerce-store-menu.spec.ts` — the Descubre group gets the historia tile + 2 product tiles, links only without
    photos, authored tiles kept.
- Jest named files only, `--maxWorkers=2`.
- **Live check** (pruebas2 user, `create-full-store-demo.ts` + `send.cjs`):
  - fresh libros and láminas one-liners → 3–4 questions answered by chips;
  - Canasta → 1–2 questions;
  - Miga's long brief → at most 1;
  - two art stores in a row → different templates;
  - Canasta's «Descubre» shows photos at 1280.
- **Safety:** before saving any `apps/api/src` file, check no `StoreSourceChatJob` is RUNNING/QUEUED (nest --watch restarts
  kill YAPI runs).

## Out of scope

- New templates for small rubros.
- Migrating existing stores to other templates.
- Intake for stores that already have a revision (edits keep today's conversation step).
