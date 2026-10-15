# Store voice: YAPI writes text that belongs to the store (spec 2026-10-14)

## Why

The owner (2026-10-14): "i want more coherence with the language of yapi, like i want him to like write text that is not generic and has coherence with the actual store."

The home pages of the 2026-10-14 live-check stores (Café Remanso `sgcbdd0w`, Chispa Láminas `wu5f1a4n`, Brújula Consultores `2cchr29v`) show the problem:

- **Brief echoed instead of written from.** Café Remanso repeats «leer, trabajar y conversar… luz suave, mesas de madera» three times.
- **Missing data narrated to customers:**
  - «La sucursal o dirección de retiro todavía debe confirmarse»
  - «Los detalles de formatos y materiales aún no están publicados»
  - «La información de la tienda aparecerá aquí»
  - «Aún no hay datos de contacto publicados»
  - «La plataforma mostrará su disponibilidad cuando esté definida»
- **Platform mechanics as content.** Brújula has «Elige / Añade / Revisa / Completa — Continúa al pago mediante pagosYa».
- **Some lines are good**, and show what is possible: «Hacemos paredes menos serias», «No hacemos paredes calladas», «Media mañana, bien hecha».

### Root causes (research 2026-10-14)

**YAPI has little real material.**
- The Sep-5 author (`design-engine/sep5-author.ts:77-141`) receives a brief whose `businessInformation`/`visualDirection` are YAPI's own chat summary (`source-chat.service.ts:449-453`), not the merchant's words.
- Only the current message is passed verbatim (`:472`).
- Store Brain is added only to the agent path's `taskPrompt` (`source-generation.service.ts:609-610`).
- Photos arrive as bare paths: `assetLegend` maps URLs to paths, with no description.

**Nothing critiques wording.**
- The Sep-5 review (`sep5-author.ts:200-213`) checks layout and keeps the copy.
- The empty-word list (`SOURCE_TELLS_SELF_CHECK`, `source-signature.ts:75`) reaches only the agent path.
- `specificityReport` (`sketch/sketch-specificity.ts`) is eval-only.

**The kit prints placeholders.**
- Standard pages print «Esta información aún no está disponible.» (`packages/storefront-kit/kit/commerce.js:1576`).
- The hedged-copy fix exists only in the template-keep brief (`source-chat.service.ts:56`).

**Earlier specs said the same.** 2026-10-04 page-grammar-and-real-copy: "a store with nothing to say should say less, not fill the gap with mood". The 2026-10-11 playbook `tone` per kind never grew an actual avoid list.

### Owner decisions (brainstorming 2026-10-14)

**Sources of specifics.** All four are allowed:
- ask the merchant better;
- use what is already known;
- YAPI proposes and the merchant confirms;
- YAPI may invent.

**What may be invented.**
- **Texture** (scenes, feelings, small observations that cannot be wrong) is invented freely.
- **Plausible facts** may also be invented, as tracked assumptions:
  - each is listed in «Datos que YAPI supuso»;
  - each must be confirmed or dropped before publishing.
- **Never invented**, even as assumptions:
  - named reviews or quotes;
  - health or results claims;
  - prices or discounts.

**Order.** Specs for all three owner requests first: store controls (written), this voice spec, then business tools.

## Parts

1. **Better material in.**
2. **The voice sheet** (`voice.json`).
3. **Writing rules and the kit's empty states.**
4. **The copy check and review rewrite.**
5. **Assumed facts:** marking, «Datos que YAPI supuso», the publish gate.

### 1. Better material in

**Kind questions in onboarding.**
- The onboarding `story` step (`apps/api/src/stores/store-onboarding.ts`, `ONBOARDING_STEPS`) becomes 2–3 short questions chosen by business kind. Every answer is optional.
- The questions live in the playbook beside each kind's `tone` (`design-engine/playbook.ts`), as `questions: string[]`, Spanish, at most 3 per kind. Examples:
  - **café:** «¿Qué pide todo el mundo?», «¿Qué tiene tu local que no tenga otro?»
  - **dairy or farm:** «¿De dónde viene la leche?», «¿Cada cuánto entregan?»
  - **services:** «¿Qué problema resuelves primero?», «¿Cómo es una primera reunión contigo?»
  - **prints or crafts:** «¿Qué te inspira?», «¿En qué papel imprimes?»
- Answers are stored word for word on the onboarding record as `answers: Array<{ question: string; answer: string }>` (max 6, 400 characters each, clamped like `story`).

**Kind questions in chat.**
- YAPI asks at most one kind question when the sheet (part 2) has fewer than 3 merchant-sourced specifics.
- It never blocks or delays a build waiting for the answer.

**Verbatim words.** The author and the sheet call receive the merchant's own messages from this store's chat thread (latest first, up to 2,000 characters), the onboarding answers and the `what`/`story` text unchanged. They are marked as data, not instructions, like other merchant text.

**Store Brain.** `loadStoreKnowledge` reaches the sheet call and the Sep-5 author, with the same data-only framing as `source-generation.service.ts:610`.

**Photo descriptions.**
- The first time an upload is used in a build, a short vision call writes one line saying what it shows, e.g. «latte con arte de hoja en taza azul, mesa de madera clara».
- The line is cached on the upload (by digest), so it is never described twice.
- `assetLegend` entries gain the description.
- A failed description leaves the bare path, as today.

### 2. The voice sheet

`voice.json` is a project file beside `frame-draw.json`, sanitized like `config.look`:

```ts
type StoreVoice = {
  version: 1;
  voice: string;                                    // one sentence, ≤ 200 chars
  specifics: Array<{ id: string; text: string; source: 'merchant' | 'product' | 'photo' | 'brain' }>; // ≤ 8
  texture: string[];                                // ≤ 5 invented images, ≤ 120 chars each
  assumed: Array<{ id: string; text: string; kind: 'origin' | 'number' | 'history' | 'process' | 'place'; status: 'assumed' | 'confirmed' }>; // ≤ 6
  words: { products?: string; customers?: string; order?: string; team?: string }; // the store's own nouns
  avoid: string[];                                  // ≤ 20 phrases (shared list + kind list are added by code, not stored)
};
```

**How it is written.**
- One call writes the sheet during the design stage, in parallel with the style cards. It adds no wait.
- Its inputs:
  - the part 1 material;
  - the kind's `tone` and avoid list;
  - the voice sheets of the six most recent sibling and same-kind stores, as "voices to differ from".

**What the sanitizer rejects.**
- `assumed` entries that are named reviews or quotes, health or results claims, or prices or discounts. This is pattern-based: currency and percent amounts, «testimonio», «dijo», medical and results verbs.
- Duplicate ids.
- Anything over the limits.

**Who reads it:**
- the Sep-5 author and review;
- the product-page writer (`apps/api/src/product-content/product-page-writer.ts`);
- the email kit designer (`apps/api/src/store-emails/email-kit-designer.ts`);
- the chat notes (`reviewMessage`);
- the store-controls call, whose `words.order` becomes the controls' cart word.

**Lifetime.**
- **Redesigns** keep the sheet; only the look changes.
- **A chat request about tone** («habla más formal», «más divertido») updates `voice`, saves the sheet, and rewrites the text in the same edit.
- **A new first build** (setupAction `generate`/`restart`) writes a new sheet.

### 3. Writing rules and the kit's empty states

These rules are added to `sep5AuthorPrompt` and `sep5ReviewPrompt`:

1. **Write from the sheet, not the brief.** A sentence may share at most 6 consecutive words with the merchant's text.
2. **Never narrate missing data.** This rules out phrases like «aún no», «todavía no está configurado», «se confirmará», «aparecerá aquí» and «no hay … publicados». If something is missing, say what is there (the city instead of an address) or leave the block out.
3. **Each section carries one idea only this store could say**, built on a specific or a texture line.
4. **No platform mechanics as content.** Never explain cart or checkout steps or name pagosYa in body copy; the kit and footer already do that.
5. **Assumed facts may appear only from the sheet's `assumed` list**, wrapped as `<span data-assumed="<id>">…</span>`.
6. **Use the store's `words`** for products, customers and the order.

**Kit standard pages** (`commerce.js:1502-1576`):
- An empty block is hidden instead of printing «Esta información aún no está disponible.».
- The FAQ lists only questions the store can answer: pickup only if pickup is set up, delivery only if delivery is set up, payment always.
- A page left with no block at all shows one sentence from the sheet's `voice` and a link home, instead of placeholder text.

### 4. The copy check and review rewrite

`apps/api/src/storefront-source/copy-check.ts` is pure: files plus the sheet plus sibling text in, findings out. It reads the visible text of every page (no scripts or styles, header excluded) and flags:

- **`avoid`:** phrases from the shared list, the kind's list or the sheet's `avoid`. The shared list starts with:
  - calidad que se nota
  - hecho con amor
  - Descubre
  - Eleva
  - Vive la experiencia
  - sin apuro
  - a otro nivel
  - experiencia única
  - pasión por
  - lo mejor para ti

  It merges `SOURCE_TELLS_SELF_CHECK` and the `sketch-specificity` FILLER list.
- **`echo`:** 7 or more consecutive words copied from the merchant's text.
- **`repeat`:** the same sentence twice on the site, or found on the six most recent sibling stores.
- **`missing`:** the narration patterns from rule 2.
- **`unsourced`:**
  - a number, year, distance or origin phrase that appears in neither the sources nor the sheet and is not wrapped in `data-assumed`;
  - a `data-assumed` id missing from the sheet;
  - a money amount that is not a real product or tier price.

**When it runs and what happens.**
- **Revision N** saves as written. The check never blocks a build.
- **The background review** receives the findings as a list («línea: …; problema: frase genérica; reescribe con un specific de la hoja») and rewrites those lines in N+1. This depends on part 1 of `2026-10-14-store-controls-design.md` (the review stage fix).
- **Findings still present after the review** are logged as `copy_findings` with counts per kind, and joined to the review's notes.

### 5. Assumed facts

**«Datos que YAPI supuso»**
- **Where:** the Studio sidebar, and a count on the store card in Mi tienda.
- **Each row shows:**
  - the fact;
  - the pages it appears on;
  - three actions.
- **The actions:**
  - **Confirmar** sets `status: 'confirmed'`. The fact stays as written and moves to `specifics` with source `merchant` on the next save.
  - **Editar** takes the true text from the merchant. Every `data-assumed="<id>"` occurrence is replaced in a normal save, with no model call, and the fact is marked confirmed.
  - **Quitar** removes the entry. A short YAPI edit (the local chat edit path) rewrites each sentence that used it, then saves.

**The publish gate.**
- The existing version checks (`source-publishing.controller.ts`, `versions/:revision/checks`) gain a blocking check: any `assumed` entry with `status: 'assumed'` blocks publishing.
- The message lists the facts with the same three actions.
- Drafts, previews and «Ver en navegador» are never blocked.

## Testing

**Unit tests:**
- `copy-check.ts`, with fixtures from the 2026-10-14 stores:
  - Café Remanso's brief echo;
  - Chispa's «aún no están publicados»;
  - Brújula's checkout steps.
- the sheet sanitizer, including the never-assumed patterns;
- the `data-assumed` consistency check;
- the playbook kind questions;
- the onboarding answers merge.

**Kit test:** standard pages hide empty blocks, and the FAQ shows only answerable questions.

**Generation tests:**
- the sheet call runs in parallel with the style cards;
- the author and review prompts include the sheet and the rules;
- findings reach the review;
- a tone request updates the sheet;
- Editar replaces every occurrence without a model call;
- Quitar runs the local edit;
- the publish check blocks only while assumptions are pending.

## Live check

Uses the ChatGPT plan and needs owner approval, the same method as 2026-10-14. It rebuilds the same three businesses as new stores and compares their text with tonight's.

Success criteria:
1. No phrase from the avoid lists.
2. No missing-data narration.
3. No sentence repeated across the three stores.
4. Every fact-like line is sourced or listed in «Datos que YAPI supuso».
5. Each store's sheet has at least 3 merchant-sourced specifics when onboarding answers were given.
6. The owner gets the before and after text side by side to read.

## Not in this spec

- **Business tools** (subscription forms, price calculators) are the next spec.
- **Store controls** are covered by `2026-10-14-store-controls-design.md`; they read `words.order` from this sheet.
