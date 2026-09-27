# YAPI Starts From Plantillas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new shop's first YAPI conversation offers three Plantillas instead of a from-scratch generation; the merchant's pick is applied and adapted for free, and a later "make it more unique" request reworks the look as a paid edit.

**Architecture:** The conversation model (already called on every chat message) gains four structured fields: `startFrom`, `templates`, `chosenTemplateId`, `rework`. `SourceChatService.send` turns a first-shop `generate` into a reply carrying `templateChoices`, turns a choice (tapped `templateId` or typed `chosenTemplateId`) into `SourceTemplatesService.apply` + a free `SourceGenerationService.generate` edit, and prefixes the uniqueness brief on `rework`. The brief carries `templateId` so later edits know the store came from a template. The Studio renders `templateChoices` as tappable cards inside the YAPI message.

**Tech Stack:** NestJS + Jest (apps/api), Vite + Vitest/jsdom (apps/merchant-studio), `@pagosya/store-templates` registry.

**Spec:** `docs/superpowers/specs/2026-09-26-yapi-from-templates-design.md`

## Global Constraints

- Only a store with no design (`current.revision === 0`), `sitePurpose === 'shop'`, not `setupAction: 'product-photo'` gets templates. Every other path behaves exactly as today.
- Template question (verbatim): `¿Quieres que parta de una de nuestras plantillas o prefieres que diseñe desde cero?`
- Post-adaptation sentence (verbatim): `Si quieres que se vea más única, dímelo y la rediseño.`
- No answer or an unclear answer to the template question means templates (`startFrom !== 'scratch'`).
- The adaptation is free: generation record `credits: 0`, no reward-credit redemption; provider cost is still metered by `AiUsageService`. Cap: `TEMPLATE_ADAPTATION_MAX_CREDITS = 20`.
- The uniqueness pass is a normal paid edit; no new button or menu entry anywhere.
- No database migration: `templateId` lives in the snapshot's brief JSON.
- All merchant-facing text is Spanish; code and comments English, matching surrounding files.
- Never run `prisma migrate`, `db push` or `reset`.

## Review Focus

1. A second tap (double-click, or tapping an old card after the store already has a design) must not apply a second template: rejected with a clear message, no `apply` call, nothing saved. (Task 5 test.)
2. After seeing the cards the merchant writes "mejor desde cero": today's generation runs, no cards again. (Task 4 test.)
3. After seeing the cards the merchant keeps talking without choosing ("que sea más verde"): YAPI offers a fresh set of three; nothing is applied. (Task 4 test.)
4. The adaptation's provider fails (timeout, quota, invalid output): the merchant keeps v1 and gets a readable message with no internal diagnostics. (Task 5 test.)
5. A `templateId` not among the last offered cards (tampered request, or cards from an earlier message) is rejected before any work, with no "request failed" message saved. (Task 5 test.)

---

### Task 1: Template ranking

**Files:**
- Create: `apps/api/src/storefront-source/source-template-ranking.ts`
- Test: `apps/api/src/storefront-source/source-template-ranking.spec.ts`

**Interfaces:**
- Produces: `export type TemplateChoice = { id: string; name: string; reason: string }` and `export function rankTemplates(summary: string, templates: readonly RankedTemplate[], suggested?: ReadonlyArray<{ id: string; reason: string }>): TemplateChoice[]` (always ≤ 3, no repeats, suggested first). `RankedTemplate = Pick<TemplateManifest, 'id' | 'name' | 'category' | 'description' | 'tags' | 'order'>`.

- [ ] **Step 1: Write the failing test**

```ts
import { rankTemplates } from './source-template-ranking';

const templates = [
  { id: 'tostado', name: 'Tostado', category: 'comida' as const, description: 'Café de especialidad con notas de sabor.', tags: ['café', 'tostador'], order: 10 },
  { id: 'miga', name: 'Miga', category: 'comida' as const, description: 'Panadería y pastelería.', tags: ['pan', 'panadería'], order: 20 },
  { id: 'huella', name: 'Huella', category: 'mascotas' as const, description: 'Todo para perros y gatos.', tags: ['perros', 'gatos'], order: 30 },
  { id: 'pixel', name: 'Pixel', category: 'tecnologia' as const, description: 'Tecnología y gadgets.', tags: ['tecnología'], order: 40 },
];

describe('rankTemplates', () => {
  it('keeps valid model suggestions first, drops unknown and repeated ids, and fills to three', () => {
    const choices = rankTemplates('Una cafetería de especialidad', templates, [
      { id: 'miga', reason: 'Pan artesanal para acompañar el café' }, { id: 'nope', reason: 'x' }, { id: 'miga', reason: 'otra vez' },
    ]);
    expect(choices.map(choice => choice.id)).toEqual(['miga', 'tostado', 'huella']);
    expect(choices[0]).toEqual({ id: 'miga', name: 'Miga', reason: 'Pan artesanal para acompañar el café' });
    expect(choices[1].reason).toBe('Café de especialidad con notas de sabor.');
  });

  it('scores by the summary words, accents folded, ties by order', () => {
    expect(rankTemplates('Vendemos juguetes y comida para PERROS y gatos', templates).map(choice => choice.id)[0]).toBe('huella');
    expect(rankTemplates('Tecnologia y cafe', templates).map(choice => choice.id).slice(0, 2)).toEqual(['tostado', 'pixel']);
  });

  it('falls back to manifest order when nothing matches, and never returns more than three', () => {
    expect(rankTemplates('zzz', templates).map(choice => choice.id)).toEqual(['tostado', 'miga', 'huella']);
    expect(rankTemplates('', templates, templates.map(t => ({ id: t.id, reason: 'r' })))).toHaveLength(3);
  });

  it('uses the description when a suggestion has a blank reason', () => {
    expect(rankTemplates('', templates, [{ id: 'pixel', reason: '  ' }])[0].reason).toBe('Tecnología y gadgets.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest source-template-ranking`
Expected: FAIL — `Cannot find module './source-template-ranking'`

- [ ] **Step 3: Write minimal implementation**

```ts
/** YAPI from Plantillas (spec 2026-09-26-yapi-from-templates-design.md §3): the three templates offered to a new shop.
 * The conversation model's suggestions come first; the rest is filled by word overlap with the conversation summary. */
import type { TemplateManifest } from '@pagosya/store-templates';

export type TemplateChoice = { id: string; name: string; reason: string };
export type RankedTemplate = Pick<TemplateManifest, 'id' | 'name' | 'category' | 'description' | 'tags' | 'order'>;

const words = (text: string) => new Set(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(word => word.length > 2));

export function rankTemplates(summary: string, templates: readonly RankedTemplate[], suggested: ReadonlyArray<{ id: string; reason: string }> = []): TemplateChoice[] {
  const byId = new Map(templates.map(template => [template.id, template]));
  const choices: TemplateChoice[] = [];
  for (const { id, reason } of suggested) {
    const template = byId.get(id);
    if (!template || choices.length === 3 || choices.some(choice => choice.id === id)) continue;
    choices.push({ id, name: template.name, reason: reason.trim().slice(0, 200) || template.description });
  }
  const said = words(summary);
  const score = (template: RankedTemplate) => [...words([template.name, template.category, ...template.tags, template.description].join(' '))]
    .filter(word => said.has(word)).length;
  const rest = templates.filter(template => !choices.some(choice => choice.id === template.id))
    .map(template => ({ template, score: score(template) }))
    .sort((a, b) => b.score - a.score || a.template.order - b.template.order);
  for (const { template } of rest) {
    if (choices.length === 3) break;
    choices.push({ id: template.id, name: template.name, reason: template.description });
  }
  return choices;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest source-template-ranking`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-ranking.ts apps/api/src/storefront-source/source-template-ranking.spec.ts
git commit -m "feat(api): rank the three Plantillas offered to a new shop — model suggestions first, then summary word overlap"
```

---

### Task 2: Template marker on the brief, and free generation runs

**Files:**
- Modify: `apps/api/src/storefront-source/dto/save-source-project.dto.ts:2-11` (`SourceProjectBriefDto`)
- Modify: `apps/api/src/storefront-source/source-templates.ts:111-115` (brief in `assembleTemplateRevision`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:230` (`execution` type), `:744` (credits), `:768` and `:772` (reward redemption)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts:55-59`, `apps/api/src/storefront-source/source-generation.service.spec.ts` (new test after line 575)

**Interfaces:**
- Produces: `SourceProjectBriefDto.templateId?: string` (matches `/^[a-z0-9-]{1,40}$/`); `assembleTemplateRevision(...).brief.templateId === manifest.id`; `SourceGenerationService.generate(..., execution?: { ...; free?: boolean })` — `free: true` saves and returns `generation.credits === 0` and redeems no reward credits.

- [ ] **Step 1: Write the failing tests**

In `source-templates.service.spec.ts`, replace the test at lines 55-59 with:

```ts
  it('keeps the store\'s own brief when it has one, marked with the template it came from', async () => {
    const brief = { sitePurpose: 'shop' as const, businessType: 'Cafetería', audience: 'Oficinistas', primaryAction: 'Pedir', visualDirection: 'Cálida' };
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: false, previousBrief: brief });
    expect(assembled.brief).toEqual({ ...brief, templateId: manifest.id });
  });
  it('marks a first site\'s default brief with the template', async () => {
    const assembled = await assembleTemplateRevision({ manifest, source: source(), storeId: 's', slug: 's', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true });
    expect(assembled.brief.templateId).toBe(manifest.id);
  });
```

In `source-generation.service.spec.ts`, directly after the test that ends near line 575 (`plans before coding, persists the server-selected concept…`), add:

```ts
  it('saves a free run with zero credits whatever the provider usage', async () => {
    jest.mocked(SourceDesignPlanner.prototype.explore).mockRestore();
    const { service, projects } = setup();
    const response = (value: any, outputTokens: number) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1000, output_tokens: outputTokens }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ concepts: design().concepts }, 500))
      .mockResolvedValueOnce(response({ label: 'Built', files: files(), design: { selected: 2, concepts: [] } }, 1000));
    const result = await service.generate('m', 's', input, undefined, [], undefined, { free: true });
    expect(result.generation.credits).toBe(0);
    expect(projects.save.mock.calls[0][3].data.credits).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest source-templates.service source-generation.service -t "template it came from|marks a first site|free run"`
Expected: FAIL — brief has no `templateId`; free run records `credits: 3`; TypeScript error on `{ free: true }`.

- [ ] **Step 3: Implement**

`dto/save-source-project.dto.ts` — add `Matches` to the `class-validator` import on line 2, and inside `SourceProjectBriefDto` after `visualDirection`:

```ts
  /** The Plantilla this design started from; carried through later edits so YAPI can rework it (spec 2026-09-26). */
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) templateId?: string;
```

`source-templates.ts` — replace the `const brief = …;` statement (lines 111-114) with:

```ts
  const brief = { ...(input.previousBrief ?? {
    sitePurpose: 'shop' as const, businessType: CATEGORY_BUSINESS[manifest.category], audience: `Clientes de ${data.storeName}`.slice(0, 500),
    primaryAction: 'Comprar en línea', visualDirection: `Plantilla ${manifest.name}: ${manifest.description}`.slice(0, 2000),
  }), templateId: manifest.id };
```

`source-generation.service.ts`:
- In the `execution?:` parameter type of `generate` (line 230), add `free?: boolean;` next to `candidate?: boolean;`.
- Line 744: a free run is zero credits:

```ts
    const credits = execution?.free ? 0 : successfulAttempts.every(attempt => attempt.usage) ? Math.min(maxCredits, Math.ceil(successfulAttempts.reduce((sum, attempt) => sum + attempt.usage!.providerMicroUsd, 0) / CREDIT_MICRO_USD)) : 0;
```

- Lines 768 and 772: skip the courtesy redemption for free runs (both lines become):

```ts
      receipt.rewardCreditsCovered = execution?.free ? 0 : await this.coverWithRewardCredits(merchantId, run.id, credits);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest source-templates.service source-generation.service source-project`
Expected: PASS, no new failures.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/dto/save-source-project.dto.ts apps/api/src/storefront-source/source-templates.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-templates.service.spec.ts apps/api/src/storefront-source/source-generation.service.spec.ts
git commit -m "feat(api): a template-based design remembers its Plantilla in the brief; generation runs can be free (zero credits, no reward redemption)"
```

---

### Task 3: The conversation model reads template intent

**Files:**
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (decision type ~line 30, `ConversationInput`, `decisionSchema` lines 57-67, `decide` context ~line 140, instructions line 165, normalization before `status = 'COMPLETED'` ~line 206)
- Test: `apps/api/src/storefront-source/source-conversation.service.spec.ts`

**Interfaces:**
- Consumes: `listTemplates()` from `@pagosya/store-templates`.
- Produces: `SourceConversationDecision` gains optional `startFrom?: 'template' | 'scratch' | 'unknown'`, `templates?: Array<{ id: string; reason: string }>`, `chosenTemplateId?: string`, `rework?: boolean`; after `decide` they are always set (`'unknown'`, `[]`, `''`, `false` when the model omits them). `ConversationInput.offeredTemplates?: Array<{ id: string; name: string }>`. Exported `SOURCE_TEMPLATE_CATALOG: string`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('Source conversation interpretation', …)`:

```ts
  it('offers every Plantilla by id in the instructions and requires the template fields', async () => {
    const { service } = setup();
    respond({ ...reply(), startFrom: 'template', templates: [{ id: 'tostado', reason: 'Café de especialidad' }], chosenTemplateId: '', rework: false });
    const result = await service.decide('merchant', { ...input(), offeredTemplates: [{ id: 'miga', name: 'Miga' }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.instructions).toContain('- tostado: Tostado');
    expect(body.text.format.schema.required).toEqual(expect.arrayContaining(['startFrom', 'templates', 'chosenTemplateId', 'rework']));
    expect(body.text.format.schema.properties.chosenTemplateId.enum).toEqual(expect.arrayContaining(['tostado', '']));
    expect(JSON.parse(body.input[0].content[2].text).offeredTemplates).toEqual([{ id: 'miga', name: 'Miga' }]);
    expect(result).toMatchObject({ startFrom: 'template', templates: [{ id: 'tostado', reason: 'Café de especialidad' }], chosenTemplateId: '', rework: false });
  });

  it('defaults the template fields when a provider omits or garbles them', async () => {
    const { service } = setup();
    respond({ ...reply(), startFrom: 'maybe', templates: 'tostado', rework: 'yes' });
    expect(await service.decide('merchant', input())).toMatchObject({ startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: false });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest source-conversation.service -t "Plantilla by id|defaults the template"`
Expected: FAIL — instructions lack the catalog; `required` lacks the fields.

- [ ] **Step 3: Implement**

Add the import at the top: `import { listTemplates } from '@pagosya/store-templates';`

Extend the decision type:

```ts
export type SourceConversationDecision = {
  action: 'reply' | 'generate';
  reply: string;
  summary: string;
  generationInstruction: string;
  imageUses: SourceImageUse[];
  /** YAPI from Plantillas (spec 2026-09-26): set by decide(); optional so older callers and fixtures stay valid. */
  startFrom?: 'template' | 'scratch' | 'unknown';
  templates?: Array<{ id: string; reason: string }>;
  chosenTemplateId?: string;
  rework?: boolean;
};
```

Add to `ConversationInput`: `offeredTemplates?: Array<{ id: string; name: string }>;`

After `const imageRoles = …`, add:

```ts
const templateIds = listTemplates().map(template => template.id);
/** The same for every merchant, so it sits in the cached instructions. */
export const SOURCE_TEMPLATE_CATALOG = `Plantillas: complete designer-made shops a NEW shop can start from. Exact ids:
${listTemplates().map(template => `- ${template.id}: ${template.name} (${template.category}; ${template.tags.join(', ')}) — ${template.description}`).join('\n')}
startFrom: for a new shop, "template" when the merchant wants to start from a Plantilla or leaves the choice to you, "scratch" when they ask for a design from scratch ("desde cero", "algo propio"), otherwise "unknown".
templates: when action=generate for a new shop, the three Plantillas that best fit this business, best first, each with a one-sentence reason in the merchant's language about why it fits; otherwise [].
chosenTemplateId: when the merchant picks one of offeredTemplates (by name, by position such as "la segunda", or by description), its id; otherwise "".
rework: true only when the merchant asks an existing store to look more unique, more different or less like its template ("hazla más única", "que no parezca plantilla"); otherwise false.`;
```

In `decisionSchema`: extend `required` to `['action', 'reply', 'summary', 'generationInstruction', 'imageUses', 'startFrom', 'templates', 'chosenTemplateId', 'rework']` and add to `properties`:

```ts
    startFrom: { type: 'string', enum: ['template', 'scratch', 'unknown'] },
    templates: { type: 'array', maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: ['id', 'reason'],
      properties: { id: { type: 'string', enum: templateIds }, reason: { type: 'string' } },
    } },
    chosenTemplateId: { type: 'string', enum: [...templateIds, ''] },
    rework: { type: 'boolean' },
```

In `decide`, add to `context` (after `browserReview`): `offeredTemplates: input.offeredTemplates || [],`

Change the `instructions` line (165) to include the catalog after the product-management instructions:

```ts
      const instructions = SOURCE_CONVERSATION_INSTRUCTIONS + '\n' + SOURCE_PRODUCT_MANAGEMENT_INSTRUCTIONS + '\n' + SOURCE_TEMPLATE_CATALOG + '\n' + sourceSitePurposePrompt(sourceSitePurpose(input.draft)) + (attempt ? '\nThe last reply was invalid. Return only a complete JSON decision matching the schema. imageUses must contain only current availableImageUrls, never historical URLs. Keep the response concise.' : '');
```

Directly before `status = 'COMPLETED';` add the normalization (unknown values degrade to "not said"; they never fail the conversation):

```ts
        decision.startFrom = decision.startFrom === 'template' || decision.startFrom === 'scratch' ? decision.startFrom : 'unknown';
        decision.templates = Array.isArray(decision.templates) ? decision.templates
          .filter(item => item && typeof item.id === 'string' && typeof item.reason === 'string').slice(0, 3) : [];
        decision.chosenTemplateId = typeof decision.chosenTemplateId === 'string' ? decision.chosenTemplateId : '';
        decision.rework = decision.rework === true;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest source-conversation.service source-generation.service`
Expected: PASS, including the existing strict-schema assertion in `source-generation.service.spec.ts:770`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-conversation.service.spec.ts
git commit -m "feat(api): the YAPI conversation reads template intent — start from a Plantilla or scratch, its top three, the merchant's pick, a rework request"
```

---

### Task 4: Chat asks and offers three cards

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (imports; constants after `referenceOnlyNotice`; `decide` input; after the discovery gate ~line 196; reply branch ~line 198-205)
- Test: `apps/api/src/storefront-source/source-chat.service.spec.ts`

**Interfaces:**
- Consumes: `rankTemplates`, `TemplateChoice` (Task 1); decision fields (Task 3).
- Produces: exported `TEMPLATE_QUESTION`; an assistant message whose `metadata.templateChoices: TemplateChoice[]` (length 3) alongside the usual `sourceSetup`. Module function `offeredTemplates(messages): TemplateChoice[]` (the latest assistant message's cards, else `[]`) used by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `source-chat.service.spec.ts` (the existing `setup()` returns a store at revision 1; these helpers switch to 0 and pre-seed two discovery replies so the gate is passed):

```ts
const discovered = () => [{ role: 'ASSISTANT', content: '¿Qué estilo quieres?', metadata: { sourceSetup: { step: 'conversation', answers: { context: 'Cafetería de especialidad en Santa Cruz' }, assetUrls: [], imageUses: [], discoveryReplies: 2, sitePurpose: 'shop' } } }];
const firstShop = (messages: any[] = discovered()) => { const env = setup(messages); env.projects.current.mockResolvedValue({ revision: 0 }); return env; };

it('asks whether to start from a template in the second discovery question of a new shop', async () => {
  const { service, projects, dialogue, messages } = setup([{ role: 'ASSISTANT', content: '¿Qué ofreces?', metadata: { sourceSetup: { step: 'conversation', answers: {}, assetUrls: [], imageUses: [], discoveryReplies: 1, sitePurpose: 'shop' } } }]);
  projects.current.mockResolvedValue({ revision: 0 });
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: '¿Qué estilo y colores quieres?', summary: 'Cafetería', generationInstruction: '', imageUses: [] });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Vendo café de especialidad' });
  expect(messages.at(-1).content).toContain(TEMPLATE_QUESTION);
});

it('offers three Plantillas instead of generating the first shop', async () => {
  const { service, dialogue, generation, messages } = firstShop();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería de especialidad', generationInstruction: 'Crea la tienda', imageUses: [], startFrom: 'unknown', templates: [{ id: 'tostado', reason: 'Hecha para café' }], chosenTemplateId: '', rework: false });
  const result = await service.send('m', 's', { ...request, revision: 0, instruction: 'Elige tú' });
  expect(generation.generate).not.toHaveBeenCalled();
  expect(result.revision).toBeUndefined();
  const choices = messages.at(-1).metadata.templateChoices;
  expect(choices).toHaveLength(3);
  expect(choices[0]).toEqual({ id: 'tostado', name: 'Tostado', reason: 'Hecha para café' });
  expect(messages.at(-1).metadata.sourceSetup.answers.context).toBe('Cafetería de especialidad');
});

it('generates from scratch when the merchant asks for it', async () => {
  const { service, dialogue, generation } = firstShop();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería', generationInstruction: 'Crea la tienda', imageUses: [], startFrom: 'scratch', templates: [], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Mejor desde cero' });
  expect(generation.generate).toHaveBeenCalledTimes(1);
});

it('offers a fresh set when the merchant keeps talking instead of choosing', async () => {
  const offered = [...discovered(), { role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'r' }], sourceSetup: discovered()[0].metadata.sourceSetup } }];
  const { service, dialogue, generation, messages } = firstShop(offered);
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería verde', generationInstruction: 'x', imageUses: [], startFrom: 'template', templates: [{ id: 'huerta', reason: 'Verde' }], chosenTemplateId: '', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'Que sea más verde' });
  expect(generation.generate).not.toHaveBeenCalled();
  expect(messages.at(-1).metadata.templateChoices[0].id).toBe('huerta');
  expect(dialogue.decide.mock.calls[0][1].offeredTemplates).toEqual([{ id: 'tostado', name: 'Tostado' }]);
});

it('keeps service sites and existing designs on today\'s path', async () => {
  const serviceSite = firstShop([{ ...discovered()[0], metadata: { sourceSetup: { ...discovered()[0].metadata.sourceSetup, sitePurpose: 'service' } } }]);
  serviceSite.dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Estudio', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: false });
  await serviceSite.service.send('m', 's', { ...request, revision: 0, instruction: 'Diseña' });
  expect(serviceSite.generation.generate).toHaveBeenCalledTimes(1);
  const existing = setup();
  existing.dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'x', imageUses: [], startFrom: 'template', templates: [{ id: 'tostado', reason: 'r' }], chosenTemplateId: '', rework: false });
  await existing.service.send('m', 's', { ...request, instruction: 'Cambia el título' });
  expect(existing.generation.generate).toHaveBeenCalledTimes(1);
});
```

Add `TEMPLATE_QUESTION` to the import from `./source-chat.service` at the top of the spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest source-chat.service -t "template|Plantillas|scratch|fresh set|today's path"`
Expected: FAIL — `TEMPLATE_QUESTION` is not exported; the first shop generates.

- [ ] **Step 3: Implement**

Imports in `source-chat.service.ts`:

```ts
import { listTemplates, templateManifest } from '@pagosya/store-templates';
import { rankTemplates, type TemplateChoice } from './source-template-ranking';
```

(`templateManifest` is used in Tasks 5-6; import it now.)

After `referenceOnlyNotice`, add:

```ts
export const TEMPLATE_QUESTION = '¿Quieres que parta de una de nuestras plantillas o prefieres que diseñe desde cero?';
const TEMPLATE_CHOICES_REPLY = 'Elegí estas 3 plantillas para tu negocio. Toca la que más te guste o dime cuál prefieres, y la adapto a tu tienda con tus productos.';

/** The cards on the latest assistant message; a choice is only valid against these. */
function offeredTemplates(messages: Array<{ role: string; metadata?: unknown }>): TemplateChoice[] {
  const last = [...messages].reverse().find(message => message.role === 'ASSISTANT');
  const choices = (last?.metadata as { templateChoices?: TemplateChoice[] } | undefined)?.templateChoices;
  return Array.isArray(choices) ? choices : [];
}
```

In `send`, in the `this.dialogue.decide(merchantId, { … })` input object, add `offeredTemplates: offeredTemplates(history.messages).map(({ id, name }) => ({ id, name })),`.

Right after the discovery-gate block `if (!productPhoto && !current.revision && discoveryReplies < 2) { … }` and before the `setupDraft = { sitePurpose, … }` line, add:

```ts
      const newShop = !productPhoto && !current.revision && sitePurpose === 'shop';
      // The second discovery question (discoveryReplies === 1) always offers the choice, whatever the model wrote.
      if (newShop && discoveryReplies === 1 && decision.action === 'reply' && !decision.reply.includes(TEMPLATE_QUESTION)) {
        decision.reply = `${decision.reply}\n\n${TEMPLATE_QUESTION}`;
      }
      let templateChoices: TemplateChoice[] | undefined;
      if (newShop && decision.action === 'generate' && decision.startFrom !== 'scratch') {
        templateChoices = rankTemplates(decision.summary, listTemplates(), decision.templates);
        decision.action = 'reply';
        decision.reply = TEMPLATE_CHOICES_REPLY;
        decision.generationInstruction = '';
      }
```

In the `if (decision.action === 'reply')` branch, the message metadata carries the cards:

```ts
          metadata: { sourceSetup: setupDraft, progress: workflow.value, ...(templateChoices ? { templateChoices } : {}) },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest source-chat.service`
Expected: PASS — new tests and all existing chat tests. The existing revision-0 test (`retains the selected website purpose…`) uses `sitePurpose: 'portfolio'`, so it still generates.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat.service.spec.ts
git commit -m "feat(api): a new shop's YAPI asks template or scratch, and offers three Plantilla cards instead of generating from nothing"
```

---

### Task 5: Choosing a card applies and adapts for free

**Files:**
- Modify: `apps/api/src/storefront-source/dto/send-source-message.dto.ts` (add `templateId`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (constructor; tap validation before the user message is saved; choice handling; new private `useTemplate`)
- Test: `apps/api/src/storefront-source/source-chat.service.spec.ts`

**Interfaces:**
- Consumes: `offeredTemplates` (Task 4), `SourceTemplatesService.apply(merchantId, storeId, templateId, revision)` (returns the saved version with `.revision` and `.label`), `generate(..., { free: true })` (Task 2), `decision.chosenTemplateId` (Task 3).
- Produces: `SendSourceMessageDto.templateId?: string`; `SourceChatService` constructor gains a 5th parameter `templates: SourceTemplatesService` (Nest injects it; it is already a provider in `storefront-source.module.ts`); exported `TEMPLATE_ADAPTATION_MAX_CREDITS = 20`; exported `TEMPLATE_UNIQUE_OFFER`.

- [ ] **Step 1: Write the failing tests**

In the spec's `setup()`, add a templates double and pass it as the 5th constructor argument:

```ts
  const templates: any = { apply: jest.fn().mockResolvedValue({ revision: 1, label: 'Plantilla: Tostado' }) };
  return { service: new SourceChatService(prisma, projects, generation, dialogue, templates), prisma, projects, generation, dialogue, templates, messages };
```

Then append:

```ts
const withCards = () => [...discovered(), { role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'r' }, { id: 'miga', name: 'Miga', reason: 'r' }, { id: 'huella', name: 'Huella', reason: 'r' }], sourceSetup: discovered()[0].metadata.sourceSetup } }];

it('applies a tapped card, then adapts it for free with the conversation summary', async () => {
  const { service, templates, generation, dialogue, messages } = firstShop(withCards());
  generation.generate.mockResolvedValue({ revision: 2, label: 'Tostado adaptada' });
  const result = await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado' });
  expect(dialogue.decide).not.toHaveBeenCalled();
  expect(templates.apply).toHaveBeenCalledWith('m', 's', 'tostado', 0);
  const [, , dto, budget, , , execution] = generation.generate.mock.calls[0];
  expect(dto).toMatchObject({ revision: 1, maxCredits: TEMPLATE_ADAPTATION_MAX_CREDITS, brief: { templateId: 'tostado', sitePurpose: 'shop', businessInformation: 'Cafetería de especialidad en Santa Cruz' } });
  expect(dto.instruction).toContain('Cafetería de especialidad en Santa Cruz');
  expect(dto.instruction).toMatch(/conserva el diseño de la plantilla/i);
  expect(budget).toBeInstanceOf(SourceRequestBudget);
  expect(execution).toEqual({ free: true });
  expect(result.revision.revision).toBe(2);
  expect(messages.at(-1).content).toContain(TEMPLATE_UNIQUE_OFFER);
  expect(messages.at(-1).metadata.sourceRevision).toBe(2);
});

it('applies a card the merchant names in words', async () => {
  const { service, templates, dialogue } = firstShop(withCards());
  dialogue.decide.mockResolvedValue({ action: 'reply', reply: 'Perfecto', summary: 'Cafetería', generationInstruction: '', imageUses: [], startFrom: 'template', templates: [], chosenTemplateId: 'miga', rework: false });
  await service.send('m', 's', { ...request, revision: 0, instruction: 'la segunda' });
  expect(templates.apply).toHaveBeenCalledWith('m', 's', 'miga', 0);
});

it('rejects a card that was not offered on the latest message, before saving anything', async () => {
  const { service, templates, generation, prisma } = firstShop(withCards());
  await expect(service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Pixel', templateId: 'pixel' })).rejects.toThrow('Elige una de las plantillas sugeridas');
  expect(templates.apply).not.toHaveBeenCalled();
  expect(generation.generate).not.toHaveBeenCalled();
  expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
});

it('rejects a second tap once the store has a design', async () => {
  const { service, projects, templates } = setup(withCards());
  projects.current.mockResolvedValue({ revision: 2 });
  await expect(service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Tostado', templateId: 'tostado' })).rejects.toThrow('ya tiene un diseño');
  expect(templates.apply).not.toHaveBeenCalled();
});

it('keeps the applied template when the adaptation fails, and says so plainly', async () => {
  const { service, generation, messages } = firstShop(withCards());
  generation.generate.mockRejectedValue(new BadGatewayException('upstream 502 invalid json at position 12'));
  const result = await service.send('m', 's', { ...request, revision: 0, instruction: 'Usar Tostado', templateId: 'tostado' });
  expect(result.revision.revision).toBe(1);
  expect(messages.at(-1).metadata.sourceRevision).toBe(1);
  expect(messages.at(-1).content).toContain('Tu tienda ya tiene la plantilla Tostado');
  expect(messages.at(-1).content).not.toContain('position 12');
});
```

Add `TEMPLATE_ADAPTATION_MAX_CREDITS, TEMPLATE_UNIQUE_OFFER` to the `./source-chat.service` import, and `import { SourceRequestBudget } from './source-request-budget';` at the top of the spec. The `projects.version` double already returns a brief; the adaptation reads it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest source-chat.service -t "card|adaptation fails|second tap"`
Expected: FAIL — `templateId` ignored; constants not exported.

- [ ] **Step 3: Implement**

`dto/send-source-message.dto.ts` — add `Matches` to the second `class-validator` import and a property on the class:

```ts
  /** A Plantilla card the merchant tapped in YAPI's message (spec 2026-09-26); must be one the last message offered. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) templateId?: string;
```

`source-chat.service.ts`:

Import: `import { SourceTemplatesService } from './source-templates.service';`

Constructor:

```ts
  constructor(private readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService, private readonly dialogue: SourceConversationService, private readonly templates: SourceTemplatesService) {}
```

Constants next to `TEMPLATE_QUESTION`:

```ts
export const TEMPLATE_ADAPTATION_MAX_CREDITS = 20;
export const TEMPLATE_UNIQUE_OFFER = 'Si quieres que se vea más única, dímelo y la rediseño.';
const TEMPLATE_ADAPTATION_BRIEF = 'Adapta esta tienda, creada desde una plantilla, al negocio descrito en el contexto acordado. Reescribe todos los textos visibles para este negocio, en el idioma del comercio. Si el comercio confirmó colores de marca, aplícalos a la paleta. Quita las secciones que no correspondan a este negocio. Conserva el diseño de la plantilla: estructura, orden de secciones, tipografías, marcos de fotos, componentes y composición. No rediseñes.';
```

In `send`, validate a tap **before** the thread upsert and user-message insert (right after the `if (allAssets.length > 24) throw …` line). The `catch` of `send` saves a "request failed, a retry may use credits" message before rethrowing, which would be wrong for a bad tap:

```ts
    const tappedChoice = input.templateId ? offeredTemplates(history.messages).find(offer => offer.id === input.templateId) : undefined;
    if (input.templateId && current.revision) throw new BadRequestException('Tu tienda ya tiene un diseño. Para cambiarlo por una plantilla, usa Mi tienda → Plantillas.');
    if (input.templateId && !tappedChoice) throw new BadRequestException('Elige una de las plantillas sugeridas en el último mensaje de YAPI.');
```

Inside `try {`, as the first statement after `const budget = …` and `const previous = …`:

```ts
      if (tappedChoice) return await this.useTemplate(merchantId, storeId, thread.id, userMessage, workflow, tappedChoice, setupDraft, allAssets, input.model);
```

After the decision is computed and the `referenceUrls … unavailable` block, add the typed path:

```ts
      const typedChoice = !current.revision && decision.chosenTemplateId
        ? offeredTemplates(history.messages).find(offer => offer.id === decision.chosenTemplateId) : undefined;
      if (typedChoice) return await this.useTemplate(merchantId, storeId, thread.id, userMessage, workflow, typedChoice, { ...setupDraft, answers: { context: decision.summary }, imageUses: decision.imageUses }, allAssets, input.model);
```

New private method on the class (use the type of `userMessage` as declared in `send`, i.e. the Prisma `StoreAgentMessage` returned by `storeAgentMessage.create`, so `send`'s return shape is unchanged):

```ts
  /** Spec 2026-09-26 §1.3: v1 is the template as applied today; v2 is a free adaptation. A failed adaptation keeps v1. */
  private async useTemplate(merchantId: string, storeId: string, threadId: string, userMessage: Awaited<ReturnType<PrismaService['storeAgentMessage']['create']>>, workflow: ReturnType<typeof createSourceProgress>, choice: TemplateChoice, draft: SourceSetupDraft, assetUrls: string[], model?: SendSourceMessageDto['model']) {
    await workflow.report('saving');
    const applied = await this.templates.apply(merchantId, storeId, choice.id, 0);
    const summary = draft.answers?.context || '';
    const imageUses = draft.imageUses || [];
    const v1 = await this.projects.version(merchantId, storeId, applied.revision);
    const brief = { ...(v1.snapshot as unknown as SourceProjectSnapshot).brief, sitePurpose: 'shop' as const, businessInformation: summary, templateId: choice.id };
    const cleared = { ...draft, assetUrls: [], prompt: undefined, pendingCatalogRequest: undefined };
    try {
      const revision = await this.generation.generate(merchantId, storeId, {
        revision: applied.revision, brief, model, maxCredits: TEMPLATE_ADAPTATION_MAX_CREDITS,
        instruction: `${sourceRequestExecutionPrompt(TEMPLATE_ADAPTATION_BRIEF, true)}\n\nContexto acordado:\n${summary}\nUso de las imágenes (respetar estos roles):\n${JSON.stringify(imageUses)}`,
        assetUrls: assetUrls.filter(url => !imageUses.some(use => use.url === url && use.role === 'unused')),
      }, new SourceRequestBudget(TEMPLATE_ADAPTATION_MAX_CREDITS), imageUses, workflow.report, { free: true });
      await workflow.finish('completed');
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId, channel: 'source', role: 'ASSISTANT',
        content: `Apliqué la plantilla ${choice.name} y la adapté a tu negocio: textos, colores y secciones. Revisa el resultado en la vista previa. ${TEMPLATE_UNIQUE_OFFER}`,
        metadata: { progress: workflow.value, sourceSetup: cleared, sourceRevision: revision.revision, label: revision.label },
      } });
      return { userMessage, assistantMessage, revision };
    } catch {
      await workflow.finish('completed');
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId, channel: 'source', role: 'ASSISTANT',
        content: `No pude adaptar la plantilla a tu negocio en este momento. Tu tienda ya tiene la plantilla ${choice.name} con tus productos; pídeme los cambios que quieras o vuelve a intentarlo.`,
        metadata: { progress: workflow.value, sourceSetup: cleared, sourceRevision: applied.revision, label: applied.label, adaptationFailed: true },
      } });
      return { userMessage, assistantMessage, revision: applied };
    }
  }
```

If TypeScript rejects `revision: applied` as a different type from the generation result in `send`'s inferred return union, widen with a local type alias for the shared fields the Studio reads (`revision`, `label`); do not cast to `any`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest source-chat.service && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/dto/send-source-message.dto.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat.service.spec.ts
git commit -m "feat(api): choosing a Plantilla card in YAPI applies it and adapts it to the business for free; a failed adaptation keeps the template"
```

---

### Task 6: "Hazla más única" reworks a template-based store

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (regular generation call ~line 218-222)
- Test: `apps/api/src/storefront-source/source-chat.service.spec.ts`

**Interfaces:**
- Consumes: `previousBrief.templateId` (Task 2), `decision.rework` (Task 3), `templateManifest` (imported in Task 4).
- Produces: exported `TEMPLATE_REWORK_BRIEF`, prefixed to the generation instruction when `rework` is true and the brief has a known `templateId`.

- [ ] **Step 1: Write the failing tests**

```ts
it('reworks a template-based store when the merchant asks for a more unique look, as a paid edit', async () => {
  const { service, projects, dialogue, generation } = setup();
  projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Plantilla', sitePurpose: 'shop', templateId: 'tostado' } } });
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'Rediseña', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
  await service.send('m', 's', { ...request, instruction: 'Hazla más única' });
  const [, , dto, , , , execution] = generation.generate.mock.calls[0];
  expect(dto.instruction).toContain(TEMPLATE_REWORK_BRIEF);
  expect(dto.brief.templateId).toBe('tostado');
  expect(execution?.free).toBeUndefined();
});

it('treats a rework request on a store without a template as an ordinary edit', async () => {
  const { service, dialogue, generation } = setup();
  dialogue.decide.mockResolvedValue({ action: 'generate', reply: '', summary: 'Café', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', templates: [], chosenTemplateId: '', rework: true });
  await service.send('m', 's', { ...request, instruction: 'Hazla más única' });
  expect(generation.generate.mock.calls[0][2].instruction).not.toContain(TEMPLATE_REWORK_BRIEF);
});
```

Add `TEMPLATE_REWORK_BRIEF` to the `./source-chat.service` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest source-chat.service -t "rework"`
Expected: FAIL — `TEMPLATE_REWORK_BRIEF` not exported.

- [ ] **Step 3: Implement**

Constant next to the others:

```ts
export const TEMPLATE_REWORK_BRIEF = 'El comercio pidió que su tienda se vea más única y menos como la plantilla de la que partió. Conserva los productos, los textos, las fotos y el orden de las secciones. Cambia las tipografías (del catálogo de fuentes), la paleta, la forma de botones y tarjetas, los marcos de las fotos, la decoración y la composición de la portada, para que la tienda ya no se reconozca como esa plantilla.';
```

In `send`, just before `const revision = await this.generation.generate(merchantId, storeId, {` on the regular path, add:

```ts
      const reworkTemplate = Boolean(current.revision && decision.rework && previousBrief?.templateId && templateManifest(previousBrief.templateId));
      const requested = reworkTemplate ? `${TEMPLATE_REWORK_BRIEF}\n\nPedido del comercio: ${input.instruction}` : input.instruction;
```

and in that call replace `sourceRequestExecutionPrompt(input.instruction, Boolean(current.revision))` with `sourceRequestExecutionPrompt(requested, Boolean(current.revision))`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest source-chat.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat.service.spec.ts
git commit -m "feat(api): asking YAPI for a more unique look reworks a template-based store's type, palette, shapes and hero while keeping its content"
```

---

### Task 7: Studio shows the cards inside YAPI's message

**Files:**
- Modify: `apps/merchant-studio/src/source-templates.ts` (new `renderTemplateChoices`)
- Modify: `apps/merchant-studio/src/source-templates.css` (card styles)
- Modify: `apps/merchant-studio/src/api.ts:312-314` (`sendSourceMessage` gains `templateId`)
- Modify: `apps/merchant-studio/src/source-studio.ts` (`send` signature line 255 and API call line 285; message render ~line 414; listeners ~line 646; busy-disable selector ~line 667)
- Test: `apps/merchant-studio/src/source-templates.test.ts`, `apps/merchant-studio/src/source-studio.test.ts`

**Interfaces:**
- Consumes: assistant `metadata.templateChoices: Array<{ id: string; name: string; reason: string }>` (Task 4); API `templateId` (Task 5).
- Produces: `renderTemplateChoices(choices, previewBase, off): string` with `[data-template-choice]` buttons carrying `data-template-name`.

- [ ] **Step 1: Write the failing tests**

In `source-templates.test.ts`, extend the import with `renderTemplateChoices` and add:

```ts
describe('template choices in a YAPI message', () => {
  const choices = [{ id: 'tostado', name: 'Tostado', reason: 'Hecha para café' }, { id: 'x', name: '<b>Evil</b>', reason: '"quoted"' }];
  const root = (off = false) => { const element = document.createElement('div'); element.innerHTML = renderTemplateChoices(choices, '/studio/', off); return element; };
  it('renders each choice as one tappable card with its preview, escaping text', () => {
    const cards = [...root().querySelectorAll<HTMLButtonElement>('[data-template-choice]')];
    expect(cards.map(card => card.dataset.templateChoice)).toEqual(['tostado', 'x']);
    expect(cards[0].querySelector('img')!.getAttribute('src')).toBe('/studio/plantillas/tostado.webp');
    expect(cards[0].textContent).toContain('Hecha para café');
    expect(cards[1].innerHTML).not.toContain('<b>');
    expect(cards[1].dataset.templateName).toBe('<b>Evil</b>');
  });
  it('disables the cards while busy', () => {
    expect([...root(true).querySelectorAll<HTMLButtonElement>('[data-template-choice]')].every(card => card.disabled)).toBe(true);
  });
});
```

In `source-studio.test.ts`, add:

```ts
it('sends the tapped Plantilla card as the choice', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', createdAt: '2026-09-26', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'Café' }, { id: 'miga', name: 'Miga', reason: 'Pan' }, { id: 'huerta', name: 'Huerta', reason: 'Verde' }] } },
  ] } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'Usar Miga' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Listo' } } as any);
  await mountSourceStudio(app);
  const card = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-choice="miga"]'); expect(found).toBeTruthy(); return found!; });
  card.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][1]).toBe('Usar Miga');
  expect(sent.mock.calls[0].at(-1)).toBe('miga');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-templates.test.ts src/source-studio.test.ts`
Expected: FAIL — `renderTemplateChoices` is not exported; no `[data-template-choice]` in the Studio.

- [ ] **Step 3: Implement**

`source-templates.ts` — after `renderTemplateGallery`:

```ts
export type TemplateChoice = { id: string; name: string; reason: string };

/** YAPI's three suggestions (spec 2026-09-26): the card itself is the choice, no separate button. */
export function renderTemplateChoices(choices: TemplateChoice[], previewBase: string, off: boolean): string {
  return `<div class="tpl-choices">${choices.map(choice => `<button type="button" class="tpl-choice" data-template-choice="${escape(choice.id)}" data-template-name="${escape(choice.name)}" ${off ? 'disabled' : ''}>
    <img src="${escape(previewBase)}plantillas/${escape(choice.id)}.webp" alt="" loading="lazy">
    <strong>${escape(choice.name)}</strong><span>${escape(choice.reason)}</span>
  </button>`).join('')}</div>`;
}
```

`source-templates.css` — append. Before writing, read the top of the file and reuse its existing color/border custom properties in place of the fallbacks below:

```css
.tpl-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
.tpl-choice { display: grid; gap: 4px; align-content: start; min-width: 0; padding: 6px; text-align: left; font: inherit; color: inherit; background: var(--pg-surface, #fff); border: 1px solid var(--pg-border, #d9d9d4); border-radius: 12px; cursor: pointer; }
.tpl-choice img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; object-position: top; border-radius: 8px; }
.tpl-choice span { font-size: .8rem; opacity: .75; }
.tpl-choice:hover:not(:disabled), .tpl-choice:focus-visible { border-color: currentColor; }
.tpl-choice:disabled { cursor: default; opacity: .6; }
@media (max-width: 560px) { .tpl-choices { grid-template-columns: 1fr; } .tpl-choice { grid-template-columns: 72px 1fr; align-items: center; } .tpl-choice img { grid-row: span 2; } }
```

`api.ts` — add `templateId?: string` as the last parameter of `sendSourceMessage` and spread it into the body: `...(templateId ? { templateId } : {})`.

`source-studio.ts`:
- Import `renderTemplateChoices` and `type TemplateChoice` from `./source-templates` (merge with any existing import from that module).
- `send` signature (line 255): add a 4th parameter `templateId?: string`, and pass it as the last argument: `api.sendSourceMessage(storeId, text, submittedUrls, state.revision, setup?.step, setupAction, generationSettings, browserReview, requestId, templateId)` (line 285).
- In the assistant message template (line 414), right after the `clarification-options` expression, add:

```ts
      ${!user && Array.isArray(metadata.templateChoices) ? renderTemplateChoices(metadata.templateChoices as TemplateChoice[], import.meta.env.BASE_URL, busy || dirty() || historical() || state.revision > 0) : ''}
```

- Next to the `[data-clarification]` listener (line 646):

```ts
    app.querySelectorAll<HTMLButtonElement>('[data-template-choice]').forEach(button => button.addEventListener('click', () => void send(`Usar ${button.dataset.templateName || ''}`, undefined, undefined, button.dataset.templateChoice)));
```

- Add `[data-template-choice]` to the busy-disable selector list at line 667.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, apart from any Studio test that also fails on commit `bec9d6e` (before Task 1); no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-templates.ts apps/merchant-studio/src/source-templates.css apps/merchant-studio/src/api.ts apps/merchant-studio/src/source-studio.ts apps/merchant-studio/src/source-templates.test.ts apps/merchant-studio/src/source-studio.test.ts
git commit -m "feat(studio): YAPI's three Plantilla suggestions render as tappable cards inside its message; tapping one sends the choice"
```

---

### Task 8: Verify end to end

**Files:** none changed unless a defect is found (fix it in the owning task's files, with a test, and commit).

- [ ] **Step 1: Full suites**

Run:
```bash
cd apps/api && npx jest src/storefront-source 2>&1 | tail -15
cd ../merchant-studio && npx vitest run src 2>&1 | tail -8
cd ../.. && pnpm lint 2>&1 | tail -8
```
Expected: all pass. A test that also fails on commit `bec9d6e` (before Task 1) is reported to the owner as pre-existing, not hidden.

- [ ] **Step 2: Refresh the dev environment the owner uses**

```bash
cd apps/merchant-dashboard && pnpm run build:studio
lsof -tiTCP:3001 -sTCP:LISTEN | xargs -I{} ps -o pid=,lstart=,command= -p {}
```
Expected: port 3001 is held by the `nest start --watch` child started after the last API commit. If not, ask the owner to restart `pnpm dev`; never start a second API in the background.

- [ ] **Step 3: Browser run**

In the merchant dashboard (port 4323), create a new store "Café Prueba". In YAPI: "Vendo café de especialidad en grano y molido" → answer the second question (which must end with the template question) with "cálido, tonos tierra, elige tú" → three cards appear (Tostado expected among them) → tap Tostado → the adapted store loads (texts about this café, not the template's demo copy) → write "hazla más única" → confirm the estimate → a reworked version loads. Capture desktop and 390 px screenshots of: the cards, the adapted store, the reworked store. In the store's generation history, the adaptation run shows 0 credits.

- [ ] **Step 4: Report**

Send the owner the captures and the adaptation run's credit line; list anything that looked wrong.
