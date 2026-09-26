# YAPI starts from Plantillas — design

Date: 2026-09-26. Status: designed with the owner in conversation, section by section (flow, uniqueness, ranking and
free adaptation, testing). This is item E of `2026-09-25-plantillas-design.md` §6.
Owner decisions: YAPI suggests three templates and the merchant picks (not a silent pick); the first result stays
close to the template and the merchant can ask for a more unique look; the first adaptation is free and the
uniqueness pass costs credits; YAPI **asks** whether to start from a template, and the flow adds as few buttons as
possible ("more buttons will make it more confusing").

## 1. What the merchant sees

1. The discovery conversation is unchanged except for one sentence. YAPI's second question (style and colors) ends
   with: *"¿Quieres que parta de una de nuestras plantillas o prefieres que diseñe desde cero?"* The merchant answers
   in words. No answer, or an unclear one, means templates.
2. When YAPI would start the first generation and the merchant wants templates, YAPI replies instead with a short
   message and **three preview cards** (desktop capture from `/plantillas/<id>.webp`, name, one line on why it fits).
   The card is the choice: tapping it sends it. Writing "la segunda", "Tostado" or similar also works.
3. The choice saves two versions in one request:
   - **v1, the template applied** — exactly today's free `Plantilla: <name>` apply (store name, products, photos).
   - **v2, the adaptation** — a free YAPI edit on v1: copy rewritten for the business, the brand's colors when the
     merchant gave them, sections that don't fit the business removed. Layout, fonts and structure stay.
   If the adaptation fails, v1 remains the current version and YAPI says so in plain words.
4. YAPI's message after the adaptation ends with: *"Si quieres que se vea más única, dímelo y la rediseño."* There is
   no button and no menu entry. When the merchant asks for it in any wording, YAPI runs the **uniqueness pass** (§4).
5. "Desde cero" runs today's first generation, charged as today.

Unchanged: stores whose purpose is service, portfolio or editorial (all 21 templates are `sitePurpose: "shop"`), the
explicit product-photo flow (`setupAction: 'product-photo'`), every store that already has a design, and the
Plantillas gallery in Mi tienda.

## 2. Conversation and API

`SourceConversationService.decide` (the model already reading the conversation) gains optional fields in its
structured decision:

- `startFrom: 'template' | 'scratch'` — what the merchant answered; absent when not discussed.
- `templateIds: string[]` (max 3) with `templateReasons: string[]` — its ranking when it is about to generate a new
  shop and the merchant wants templates.
- `chosenTemplateId: string` — when the merchant names or points to one of the three it offered.
- `rework: boolean` — when the merchant asks for a more unique look on a template-based store.

The template list (id, name, category, tags, description of all templates, from `@pagosya/store-templates`) is the
same for every merchant and goes in the cached instruction prefix, before `CONVERSATION_CACHE_ANCHOR`.

The second discovery question is server text (`SourceChatService.send`, the `discoveryReplies` gate); the template
sentence is appended there for shop purposes, so it is asked whatever the model writes. The conversation
instructions tell the model how to read the answer into `startFrom`.

`SourceChatService.send`, first site (`current.revision === 0`), shop purpose, not product-photo:

- decision `generate` and `startFrom !== 'scratch'` → do **not** generate. Validate `templateIds` against the
  registry (drop unknown and repeated ids); fill up to three with the fallback ranking (§3). Save an assistant
  message whose metadata carries `templateChoices: [{ id, name, reason }]` and the setup draft (summary, image uses,
  assets) exactly as a reply does today. Return it like a reply.
- a message that selects a template — `SendSourceMessageDto.templateId` (new, optional, validated against the
  registry and against the last `templateChoices`) from a tapped card, or `chosenTemplateId` from the decision —
  → `SourceTemplatesService.apply` (v1), then the adaptation (v2, §4) through `SourceGenerationService.generate`
  with `revision: 1`.

The Studio renders `templateChoices` inside the YAPI message as cards; tapping one sends
`{ instruction: 'Usar <name>', templateId }`. No other Studio control is added.

**Template marker.** `SourceProjectBriefDto` gains optional `templateId` (validated against the registry).
`assembleTemplateRevision` sets it; the chat path already carries the previous brief into every later generation
(`{ ...previousBrief }`), so it survives edits. It lives in the snapshot JSON: no database migration.

## 3. Ranking fallback

When the model returns fewer than three valid ids: score every template by matches between the conversation summary
(lowercased, accents folded) and its category label, tags and name; ties by manifest `order`; take the best not yet
chosen. With no matches at all, manifest `order` decides. Pure function in `source-template-ranking.ts`.

## 4. Adaptation and uniqueness pass

**Adaptation (free).** A normal edit run with a fixed brief, the conversation summary and image uses:
rewrite every visible text for this business in the merchant's language; apply the brand colors when given;
remove sections that don't apply; keep the template's layout, fonts, section order, photo frames and components.
It runs with a fixed spending cap. It is free once per store by construction: it only runs from a template choice on
a store with no design. The generation record is saved with `credits: 0`, so it counts nothing against the merchant;
the provider cost is still recorded by `AiUsageService`, so the owner sees what it costs. Reward credits are not
redeemed for it.

**Uniqueness pass (paid).** When `rework` is set and the brief has a `templateId`: a normal paid edit with the
existing estimate and confirmation, and a fixed brief: keep products, texts, photos and section order; change the
fonts (from the font catalog), palette, button and card forms, photo framing, decoration and the hero composition so
the store no longer reads as that template. Every run is a new version; restore works as today.

Both runs go through the same validation, repair and publication checks as any YAPI edit.

## 5. Testing

API unit (beside `source-chat.service.spec.ts` and the template specs):
- a first shop whose merchant wants templates gets `templateChoices`, and no generation runs;
- `startFrom: 'scratch'` generates as today; service/portfolio/editorial and product-photo are unchanged;
- unknown and repeated ids are dropped and the fallback fills to three; fallback scoring and order ties;
- `templateId` not among the offered choices is rejected; a typed choice resolves through `chosenTemplateId`;
- a choice saves v1 then v2, and v2's generation record has `credits: 0`;
- a failed adaptation leaves v1 current and a merchant-readable message;
- the brief's `templateId` survives a later edit; `rework` without a template marker is an ordinary edit;
- `rework` charges credits and sends the uniqueness brief.

Studio (`source-studio.test.ts`, `plantillas.spec.ts`): cards render inside the message; tapping sends the
`templateId`; no horizontal overflow at 390.

End to end, once, in the browser before calling it done: a new coffee store — conversation → three cards → Tostado →
adapted store → "hazla más única". Captures go to the owner.

## 6. Out of scope

Per-merchant limits on free adaptations (add if abuse shows up); templates for service, portfolio and editorial
sites; using templates in the product-photo flow; the MCP server (next spec); importing stores from other platforms.
