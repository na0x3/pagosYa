# YAPI Asks First, Varied Templates, «Descubre» Photos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a new store's first build YAPI asks up to 4 questions about what is missing. The template pick then chooses the
least-used of 3 style-fit candidates, so two stores of the same rubro differ. Header dropdown groups with no photos («Descubre»)
show the store's story photo and two products.

**Architecture:**
- **Intake.** A pure module (`source-intake.ts`) holds the facts, prompt, schema and normalisation. A dialogue method
  (`intakeStep`) makes one structured model call. `firstBuild` either asks (saving a `clarification` + `intake` message) or
  builds with the first words plus the answers. A pending intake on the last YAPI message routes the merchant's next message back
  to `firstBuild`.
- **Template pick.** It returns 3 candidates. The server counts `metadata.templatePick` on recent first-build replies and takes
  the least used.
- **Menu.** The kit's `resolveStoreMenuGroups` gains a photo fallback for groups that end with no tiles.

**Tech Stack:** NestJS + Prisma (apps/api), Jest (`--maxWorkers=2`, named files only), storefront kit (plain JS concatenated by
`tools/build-commerce.mjs`, tested through jsdom in apps/api).

**Spec:** `docs/superpowers/specs/2026-11-04-yapi-asks-first-design.md`

## Global Constraints

- Flag `YAPI_INTAKE=1` → `app.yapiIntake`. Off by default, on in the dev `apps/api/.env`.
- At most **4** questions (`INTAKE_MAX = 4`). Every question offers the chip **«Créala ya»**.
- Topics: `what` · `look` · `musts` · `photos`. Never ask a topic twice; never ask what the facts already answer.
- A failed intake check (model error/timeout, unreadable answer) builds at once. A `SourceProviderQuotaException` is rethrown as
  everywhere else.
- Link flows (website copy, product link, listing screenshot) and `setupAction: 'product-photo'` never get the intake.
- Template pick: a template the merchant names wins; 1–2 products → `unico`; otherwise the least-used of up to 3 model candidates,
  where a tie keeps the model's order. Counted over the newest 300 ASSISTANT messages with `metadata.templatePick`.
- «Descubre» fallback: at most 3 tiles. The historia tile only uses `store.aboutImageUrl` or `store.bannerUrl`, never a product
  photo. Products with a badge come first.
- Before saving any file under `apps/api/src` (spec files too), check that no `StoreSourceChatJob` is RUNNING or QUEUED:
  `cd apps/api && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.storeSourceChatJob.count({where:{status:{in:['RUNNING','QUEUED']}}}).then(n=>{console.log('busy',n);return p.\$disconnect()})"`.
  nest --watch restarts on save and kills running YAPI jobs.
- Never edit with `sed -i` under `apps/api/src` (the watcher stops compiling that file). Never run `tsc --noEmit` without
  `--incremental false`.
- Jest: name spec files, always `--maxWorkers=2`, never pass a folder.
- Kit edits: edit `packages/storefront-kit/commerce-src/`, then `node packages/storefront-kit/tools/build-commerce.mjs`, then
  `pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- Commits stage only this plan's files or hunks. Many files in the tree carry other uncommitted work (`git status` shows only
  untracked `examples/` today, but check before each commit).
- Copy is Spanish, in YAPI's voice, with no exclamation-mark hype.

## Review Focus

1. **A reply that is only photos (empty text) mid-intake.** It must count as an answer «(fotos)», and the photos must join the
   build. Test in Task 3.
2. **«Créala ya» as the very first message.** It must build at once without asking. Test in Task 3.
3. **A store that is already built, with an old pending intake message in its history.** It must never be routed into the
   intake (`pendingIntake` returns null when revision > 0). Test in Task 1.
4. **The product-link / listing-screenshot first build.** It must not be interrupted by questions (`firstBuild(..., false)`).
   Test in Task 3.
5. **A model answer with an unknown topic, a repeated topic, no question, or options already containing «Créala ya».** It must
   yield «ready» or a clean question with exactly one «Créala ya» chip at the end. Test in Task 1.

---

### Task 1: The intake module (pure)

**Files:**
- Create: `apps/api/src/storefront-source/source-intake.ts`
- Test: `apps/api/src/storefront-source/source-intake.spec.ts`

**Interfaces:**
- Produces:
  - `INTAKE_TOPICS`, `IntakeTopic`, `INTAKE_MAX`, `BUILD_NOW`
  - `IntakeAnswer = { topic: IntakeTopic; question: string; answer: string }`
  - `IntakeState = { pending: boolean; words: string; request?: string; photos: string[]; asked: IntakeTopic[]; answers: IntakeAnswer[]; question?: { topic: IntakeTopic; text: string } }`
  - `IntakeFacts`, `IntakeTurn = { understood: string; reply: string; ready: boolean; topic: IntakeTopic | 'none'; question: string; options: string[] }`
  - `intakeFacts(input: IntakeFactsInput): IntakeFacts`
  - `normalizeIntake(raw: unknown, state: IntakeState, facts: IntakeFacts): IntakeTurn | null`
  - `wantsBuildNow(text: string): boolean`
  - `intakeInstruction(state: IntakeState): string`
  - `intakeMessage(turn: IntakeTurn, first: boolean): string`
  - `pendingIntake(messages: Array<{ role: string; metadata?: unknown }>, revision: number): IntakeState | null`
  - `INTAKE_PROMPT: string`, `INTAKE_SCHEMA`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-intake.spec.ts
import { BUILD_NOW, INTAKE_SCHEMA, intakeFacts, intakeInstruction, intakeMessage, normalizeIntake, pendingIntake, wantsBuildNow, type IntakeState } from './source-intake';

const state = (extra: Partial<IntakeState> = {}): IntakeState => ({ pending: true, words: 'hola quiero mi tienda para vender laminas', photos: [], asked: [], answers: [], ...extra });
const facts = intakeFacts({ name: 'Láminas Lu', onboarding: { what: 'laminas de arte', story: '' }, products: [{ name: 'Café', imageUrls: ['/v1/uploads/a.jpg'] }, { name: 'Té', imageUrls: [] }],
  zones: 0, locations: [], codes: [], links: [], contactPhone: null });

describe('intake facts', () => {
  it('summarises the catalogue and the settings the questions depend on', () => {
    expect(facts).toEqual({ tienda: 'Láminas Lu', vende: 'laminas de arte', historia: '', productos: 2, conFoto: ['Café'], sinFoto: ['Té'], fotos: 1,
      envios: false, recojo: false, codigo: '', whatsapp: false, instagram: false });
    const full = intakeFacts({ name: 'X', onboarding: {}, products: [], zones: 1, locations: [{ pickupEnabled: true }], codes: ['HOLA10'],
      links: [{ label: 'Instagram', url: 'https://instagram.com/x' }], contactPhone: '+59170000000' });
    expect(full).toMatchObject({ envios: true, recojo: true, codigo: 'HOLA10', whatsapp: true, instagram: true });
  });
});

describe('normalizeIntake', () => {
  const ask = { understood: 'láminas de arte para decorar', reply: '', ready: false, topic: 'look', question: '¿Cómo quieres que se vea?', options: ['Tranquila', 'Colorida', 'Créala ya'] };

  it('keeps one question with «Créala ya» exactly once, at the end', () => {
    expect(normalizeIntake(ask, state(), facts)).toEqual({ ...ask, options: ['Tranquila', 'Colorida', BUILD_NOW] });
  });

  it('is ready when the model says so, at the cap, or on a topic already asked', () => {
    expect(normalizeIntake({ ...ask, ready: true }, state(), facts)?.ready).toBe(true);
    expect(normalizeIntake(ask, state({ asked: ['what', 'look', 'musts', 'photos'] }), facts)?.ready).toBe(true);
    expect(normalizeIntake(ask, state({ asked: ['look'] }), facts)?.ready).toBe(true);
  });

  it('re-asks the pending topic only with a one-line reply to a merchant question', () => {
    const pending = state({ asked: ['look'], question: { topic: 'look', text: '¿Cómo quieres que se vea?' } });
    expect(normalizeIntake({ ...ask, reply: 'Sí, puedes cambiarlo después.' }, pending, facts)).toMatchObject({ ready: false, topic: 'look', reply: 'Sí, puedes cambiarlo después.' });
  });

  it('never asks for photos when every product has one and there are three or more', () => {
    const covered = intakeFacts({ name: 'X', onboarding: {}, products: [{ name: 'A', imageUrls: ['1', '2'] }, { name: 'B', imageUrls: ['3'] }], zones: 0, locations: [], codes: [], links: [], contactPhone: null });
    expect(normalizeIntake({ ...ask, topic: 'photos' }, state(), covered)?.ready).toBe(true);
  });

  it('an unknown topic, an empty question or an unreadable answer is ready (or null)', () => {
    expect(normalizeIntake({ ...ask, topic: 'budget' }, state(), facts)?.ready).toBe(true);
    expect(normalizeIntake({ ...ask, question: '  ' }, state(), facts)?.ready).toBe(true);
    expect(normalizeIntake(null, state(), facts)).toBeNull();
    expect(INTAKE_SCHEMA.properties.topic.enum).toEqual(['what', 'look', 'musts', 'photos', 'none']);
  });
});

describe('the words of the build', () => {
  it('«créala ya» and its variants, never an ordinary answer', () => {
    for (const text of ['Créala ya', 'creala ya!', 'ya', 'dale', 'hazla ya', 'así está bien', 'no más preguntas']) expect(wantsBuildNow(text)).toBe(true);
    for (const text of ['ya tengo fotos', 'Colorida', 'envíos a todo Bolivia']) expect(wantsBuildNow(text)).toBe(false);
  });

  it('the first words plus each real answer, «Créala ya» left out', () => {
    const done = state({ answers: [{ topic: 'look', question: '¿Cómo quieres que se vea?', answer: 'Colorida' }, { topic: 'musts', question: '¿Haces envíos?', answer: 'Créala ya' }] });
    expect(intakeInstruction(done)).toBe('hola quiero mi tienda para vender laminas\n\nRespuestas del comercio:\n- ¿Cómo quieres que se vea? → Colorida');
    expect(intakeInstruction(state())).toBe('hola quiero mi tienda para vender laminas');
  });

  it('the first question opens with what YAPI understood; a reply goes first', () => {
    const turn = { understood: 'láminas de arte para decorar', reply: '', ready: false, topic: 'look' as const, question: '¿Cómo quieres que se vea?', options: [] };
    expect(intakeMessage(turn, true)).toBe('Entendí: láminas de arte para decorar.\n\n¿Cómo quieres que se vea?');
    expect(intakeMessage(turn, false)).toBe('¿Cómo quieres que se vea?');
    expect(intakeMessage({ ...turn, reply: 'Sí, se puede.' }, false)).toBe('Sí, se puede.\n\n¿Cómo quieres que se vea?');
  });
});

describe('pendingIntake', () => {
  const open = { role: 'ASSISTANT', metadata: { intake: state() } };
  it('reads the open intake from YAPI\'s newest message on an unbuilt store only (review focus 3)', () => {
    expect(pendingIntake([{ role: 'USER', metadata: {} }, open], 0)).toEqual(state());
    expect(pendingIntake([open, { role: 'USER', metadata: {} }], 0)).toEqual(state());
    expect(pendingIntake([open], 2)).toBeNull();
    expect(pendingIntake([open, { role: 'ASSISTANT', metadata: { sourceRevision: 1 } }], 0)).toBeNull();
    expect(pendingIntake([{ role: 'ASSISTANT', metadata: { intake: state({ pending: false }) } }], 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-intake.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './source-intake'`.

- [ ] **Step 3: Write the module**

```ts
// apps/api/src/storefront-source/source-intake.ts
/** Spec 2026-11-04 (owner «lets make yapi keep asking questions until he is ready to make the store»): before a new store's first
 *  build YAPI asks, one at a time, only what its words, catalogue and settings leave open — what it sells and to whom, the look,
 *  the must-haves, photos — at most four times, always with «Créala ya». Pure parts here; the call is
 *  SourceConversationService.intakeStep, the turn is SourceChatService.askBeforeBuild. */

export const INTAKE_TOPICS = ['what', 'look', 'musts', 'photos'] as const;
export type IntakeTopic = typeof INTAKE_TOPICS[number];
export const INTAKE_MAX = 4;
export const BUILD_NOW = 'Créala ya';

export type IntakeAnswer = { topic: IntakeTopic; question: string; answer: string };
export type IntakeState = { pending: boolean; words: string; request?: string; photos: string[]; asked: IntakeTopic[]; answers: IntakeAnswer[]; question?: { topic: IntakeTopic; text: string } };
export type IntakeFacts = { tienda: string; vende: string; historia: string; productos: number; conFoto: string[]; sinFoto: string[]; fotos: number;
  envios: boolean; recojo: boolean; codigo: string; whatsapp: boolean; instagram: boolean };
export type IntakeTurn = { understood: string; reply: string; ready: boolean; topic: IntakeTopic | 'none'; question: string; options: string[] };
export type IntakeFactsInput = { name: string; onboarding: { what?: string; story?: string }; products: Array<{ name: string; imageUrls: string[] }>;
  zones: number; locations: Array<{ pickupEnabled?: boolean }>; codes: string[]; links: Array<{ label: string; url: string }>; contactPhone: string | null };

export function intakeFacts(input: IntakeFactsInput): IntakeFacts {
  const withPhoto = input.products.filter(product => product.imageUrls.length);
  return {
    tienda: input.name, vende: (input.onboarding.what ?? '').slice(0, 600), historia: (input.onboarding.story ?? '').slice(0, 600), productos: input.products.length,
    conFoto: withPhoto.map(product => product.name).slice(0, 20), sinFoto: input.products.filter(product => !product.imageUrls.length).map(product => product.name).slice(0, 20),
    fotos: input.products.reduce((sum, product) => sum + product.imageUrls.length, 0),
    envios: input.zones > 0, recojo: input.locations.some(location => location.pickupEnabled === true), codigo: input.codes[0] ?? '',
    whatsapp: Boolean(input.contactPhone) || input.links.some(link => /wa\.me|whatsapp/i.test(link.url)), instagram: input.links.some(link => /instagram\.com/i.test(link.url)),
  };
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¡!¿?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** What the settings and the catalogue already answer, so the question is never asked. */
function factsAnswer(topic: IntakeTopic, facts: IntakeFacts) {
  if (topic === 'photos') return facts.productos > 0 && facts.sinFoto.length === 0 && facts.fotos >= 3;
  if (topic === 'musts') return (facts.envios || facts.recojo) && Boolean(facts.codigo) && facts.whatsapp;
  return false;
}

export function normalizeIntake(raw: unknown, state: IntakeState, facts: IntakeFacts): IntakeTurn | null {
  if (!raw || typeof raw !== 'object') return null;
  const answer = raw as Partial<Record<keyof IntakeTurn, unknown>>;
  const understood = clean(answer.understood, 200).replace(/\.$/, '');
  const reply = clean(answer.reply, 240);
  const ready: IntakeTurn = { understood, reply: '', ready: true, topic: 'none', question: '', options: [] };
  if (answer.ready === true || state.asked.length >= INTAKE_MAX) return ready;
  const topic = (INTAKE_TOPICS as readonly string[]).includes(String(answer.topic)) ? answer.topic as IntakeTopic : null;
  const repeat = Boolean(topic && reply && state.question?.topic === topic);
  if (!topic || (state.asked.includes(topic) && !repeat) || factsAnswer(topic, facts)) return ready;
  const question = clean(answer.question, 240);
  if (!question) return ready;
  const options = [...new Set((Array.isArray(answer.options) ? answer.options : []).map(option => clean(option, 40)).filter(option => option && fold(option) !== fold(BUILD_NOW)))].slice(0, 4);
  return { understood, reply: repeat ? reply : '', ready: false, topic, question, options: [...options, BUILD_NOW] };
}

const BUILD_NOW_EXACT = new Set(['ya', 'dale', 'listo', 'hazla', 'creala', 'construyela', 'asi esta bien', 'eso es todo', 'no se nada mas']);
export function wantsBuildNow(text: string) {
  const words = fold(text);
  return BUILD_NOW_EXACT.has(words) || /\b(?:creala|crealo|hazla|construyela|armala) ya\b|\bno (?:mas|hagas mas) preguntas\b|\bya no preguntes\b/.test(words);
}

export function intakeInstruction(state: IntakeState) {
  const lines = state.answers.filter(answer => answer.answer.trim() && !wantsBuildNow(answer.answer)).map(answer => `- ${answer.question} → ${answer.answer.trim()}`);
  return lines.length ? `${state.words}\n\nRespuestas del comercio:\n${lines.join('\n')}` : state.words;
}

export function intakeMessage(turn: IntakeTurn, first: boolean) {
  return [turn.reply, first && turn.understood ? `Entendí: ${turn.understood}.` : '', turn.question].filter(Boolean).join('\n\n');
}

/** The open intake on YAPI's newest message, while the store has no revision; null otherwise. */
export function pendingIntake(messages: ReadonlyArray<{ role: string; metadata?: unknown }>, revision: number): IntakeState | null {
  if (revision > 0) return null;
  const last = [...messages].reverse().find(message => message.role === 'ASSISTANT');
  const intake = (last?.metadata as { intake?: IntakeState } | null | undefined)?.intake;
  return intake && intake.pending === true && typeof intake.words === 'string' && Array.isArray(intake.asked) && Array.isArray(intake.answers) ? intake : null;
}

export const INTAKE_PROMPT = `Eres YAPI, el diseñador de tiendas de pagosYa. Un comercio quiere su tienda nueva y todavía no la construiste.
Antes de construirla, decide si te falta algo importante. Lees «palabras» (su primer mensaje), «respuestas» (lo que ya contestó),
«preguntado» (temas ya preguntados), «pendiente» (la pregunta que hiciste por última vez) y «hechos» (su catálogo y ajustes).
Temas, en este orden de importancia:
- what: qué vende y para quién. Falta solo si no se entiende qué vende o a quién le vende.
- look: cómo quiere que se vea (tranquila, colorida, elegante, divertida, un color, una tienda que le guste). Falta si no dijo nada del estilo.
- musts: lo que no puede faltar para vender: envíos o recojo, un código de bienvenida, su WhatsApp. Falta si los hechos no lo muestran y no lo dijo.
- photos: fotos. Falta solo si hay productos sin foto («sinFoto») o menos de 3 fotos en total.
Reglas:
- Una sola pregunta, corta, en español, de tú, cálida y sin exclamaciones. Nombra lo concreto (sus productos sin foto, su ciudad).
- Nunca preguntes un tema que ya está en «preguntado» ni algo que ya dijo o que los hechos ya muestran.
- «options»: de 2 a 4 respuestas cortas para tocar (máximo 4 palabras cada una). Para look: «Tranquila», «Colorida», «Elegante», «Divertida» o «Elige tú».
  Para photos: «Te las mando», «Sigue sin fotos». No incluyas «Créala ya»: se agrega solo.
- Si la última respuesta es «no sé», «elige tú» o similar, ese tema queda delegado: pasa al siguiente.
- Si la última respuesta es una pregunta del comercio, contéstala en «reply» en una frase y repite la pregunta pendiente con el mismo «topic».
  Si no, «reply» es "".
- «understood»: lo que entendiste del negocio en pocas palabras (p. ej. «láminas de arte para decorar, en Cochabamba»), sin punto final.
- ready=true cuando ya no falta nada importante (topic «none», question ""). Un mensaje detallado casi siempre está listo o necesita una sola pregunta.
Responde solo el JSON.`;

export const INTAKE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['understood', 'reply', 'ready', 'topic', 'question', 'options'],
  properties: {
    understood: { type: 'string' }, reply: { type: 'string' }, ready: { type: 'boolean' },
    topic: { type: 'string', enum: ['what', 'look', 'musts', 'photos', 'none'] }, question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
  },
} as const;
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-intake.spec.ts --maxWorkers=2`
Expected: PASS (all tests). If `wantsBuildNow('ya')` fails, check that `fold` strips punctuation before the set lookup.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-intake.ts apps/api/src/storefront-source/source-intake.spec.ts
git commit -m "feat(intake): what YAPI still needs before a new store's first build — facts, prompt, normalised turn"
```

---

### Task 2: The intake call and its switch

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type next to `yapiTemplatePick: boolean;` ~line 152; value next to
  `yapiTemplatePick: process.env.YAPI_TEMPLATE_PICK === '1',` ~line 543)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (new method after `briefChecklist`, ~line 557)
- Modify: `apps/api/.env` (add `YAPI_INTAKE=1` next to `YAPI_TEMPLATE_PICK=1`). This is a local file: do not commit it.
- Test: `apps/api/src/storefront-source/source-conversation-intake.spec.ts` (create)

**Interfaces:**
- Consumes: `INTAKE_PROMPT`, `INTAKE_SCHEMA`, `IntakeFacts`, `IntakeAnswer`, `IntakeTopic` from Task 1.
- Produces:
  - `SourceConversationService.intakeStep(merchantId: string, input: { storeId: string; facts: IntakeFacts; words: string; answers: IntakeAnswer[]; asked: IntakeTopic[]; pending?: { topic: IntakeTopic; text: string } }): Promise<unknown | null>`
    returns the parsed JSON (not normalised), or null.
  - Config key `app.yapiIntake: boolean`.

- [ ] **Step 1: Check no YAPI job is running** (command in Global Constraints). Expected: `busy 0`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/storefront-source/source-conversation-intake.spec.ts
import { SourceConversationService } from './source-conversation.service';
import { INTAKE_PROMPT } from './source-intake';

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
const respondWith = (answer: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }) });
function setup() {
  const config: any = { get: jest.fn((key: string) => key === 'app.openAi.apiKey' ? 'test-key' : key === 'app.openAi.enabled' ? true : 'gpt-5.6-sol') };
  return new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: jest.fn() } as any, config);
}
const facts = { tienda: 'Láminas Lu', vende: '', historia: '', productos: 1, conFoto: [], sinFoto: ['Café'], fotos: 0, envios: false, recojo: false, codigo: '', whatsapp: false, instagram: false };

it('asks the model once with the intake prompt and returns its JSON', async () => {
  const answer = { understood: 'láminas', reply: '', ready: false, topic: 'look', question: '¿Cómo quieres que se vea?', options: ['Tranquila'] };
  respondWith(answer);
  const out = await setup().intakeStep('m1', { storeId: 's1', facts, words: 'quiero vender laminas', answers: [], asked: [] });
  expect(out).toEqual(answer);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.instructions).toBe(INTAKE_PROMPT);
  expect(body.text.format.name).toBe('store_intake');
  expect(JSON.parse(body.input[0].content[0].text)).toMatchObject({ palabras: 'quiero vender laminas', hechos: facts, preguntado: [] });
});

it('null after two failed attempts, so the store is built anyway', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  jest.useFakeTimers({ advanceTimers: true });
  await expect(setup().intakeStep('m1', { storeId: 's1', facts, words: 'x', answers: [], asked: [] })).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Run the test to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-conversation-intake.spec.ts --maxWorkers=2`
Expected: FAIL — `intakeStep is not a function`.

- [ ] **Step 4: Add the config key**

In `apps/api/src/config/configuration.ts`, next to the `yapiTemplatePick` type line:

```ts
  /** Spec 2026-11-04: YAPI asks what is missing before a new store's first build (source-intake.ts). */
  yapiIntake: boolean;
```

and next to the `yapiTemplatePick` value line:

```ts
    yapiIntake: process.env.YAPI_INTAKE === '1',
```

Add `YAPI_INTAKE=1` to `apps/api/.env` under `YAPI_TEMPLATE_PICK=1`. Do this before saving `configuration.ts`, so that the
watcher's restart reads it.

- [ ] **Step 5: Add `intakeStep`**

In `source-conversation.service.ts`, add the import:

```ts
import { INTAKE_PROMPT, INTAKE_SCHEMA, type IntakeAnswer, type IntakeFacts, type IntakeTopic } from './source-intake';
```

and insert this method right after `briefChecklist`:

```ts
  /** Spec 2026-11-04 (owner «keep asking questions until he is ready»): what a new store still needs before its first build, as
   *  one structured answer that source-intake.ts normalises. Null when both attempts fail: the store is then built at once. */
  async intakeStep(merchantId: string, input: { storeId: string; facts: IntakeFacts; words: string; answers: IntakeAnswer[]; asked: IntakeTopic[]; pending?: { topic: IntakeTopic; text: string } }): Promise<unknown | null> {
    const model = sourceConversationModel(undefined, this.config.get<string>('app.openAi.conversationModel'));
    const provider = sourceProvider(this.config, model);
    const facts = { palabras: input.words.slice(0, 4000), respuestas: input.answers.map(answer => ({ pregunta: answer.question, respuesta: answer.answer.slice(0, 600) })),
      preguntado: input.asked, ...(input.pending ? { pendiente: input.pending } : {}), hechos: input.facts };
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now(); let body: any = null; let status = 'FAILED';
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({ model, store: false, instructions: INTAKE_PROMPT,
            input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(facts) }] }],
            text: { format: { type: 'json_schema', name: 'store_intake', strict: true, schema: INTAKE_SCHEMA } },
            reasoning: { effort: 'low' }, max_output_tokens: 1200 }),
        });
        body = await response.json().catch(() => null);
        checkSourceProviderQuota(response.status, body, provider.name);
        const answer = response.ok ? sourceResponseJson(body) : null;
        if (answer && typeof answer === 'object') { status = 'COMPLETED'; return answer; }
      } catch (error) {
        if (error instanceof SourceProviderQuotaException) throw error;
        this.logger.warn(JSON.stringify({ stage: 'intake', attempt, reason: ((error as Error)?.message || '').slice(0, 200) }));
      } finally { await this.metering?.record(input.storeId, 'source-intake', model, body, Date.now() - started, status); }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return null;
  }
```

- [ ] **Step 6: Run the test and make sure it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-conversation-intake.spec.ts --maxWorkers=2`
Expected: PASS. If the response parsing fails, compare with `source-conversation.service.spec.ts:14`, which uses the same
response shape.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-conversation-intake.spec.ts
git commit -m "feat(intake): the intake call (one structured answer) behind YAPI_INTAKE"
```

Before committing, check `git diff --cached` touches only these hunks. If `source-conversation.service.ts` or
`configuration.ts` carry other uncommitted work, stage from HEAD plus exact replacements, never `-U0` hunks.

---

### Task 3: Ask before the first build, then build with the answers

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts`
  - imports;
  - `firstBuild` (~line 652);
  - new private methods `intakeOn`, `intakeFactsFor`, `askBeforeBuild` beside `firstBuild`;
  - continuation route in `send()` right after the `workflow` is created (~line 1374), before the `current.revision` shipping
    block;
  - the product-link call of `firstBuild` (~line 1896).
- Test: `apps/api/src/storefront-source/source-chat-intake.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1 (`IntakeState`, `IntakeTopic`, `INTAKE_MAX`, `normalizeIntake`, `wantsBuildNow`, `intakeInstruction`,
  `intakeMessage`, `pendingIntake`, `intakeFacts`), Task 2 (`dialogue.intakeStep`, `app.yapiIntake`).
- Produces:
  - The ASSISTANT question message metadata: `{ progress, clarification: { prompt: string, options: Array<{ label, value }> }, intake: IntakeState }`.
  - `firstBuild(..., setupAction?: string, intake?: IntakeState | false)`, where `false` skips the intake.

- [ ] **Step 1: Check no YAPI job is running.** Expected: `busy 0`.

- [ ] **Step 2: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-chat-intake.spec.ts
import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

jest.mock('./source-master-check', () => ({ masterLayoutFindings: jest.fn().mockResolvedValue([]) }));

/** Spec 2026-11-04 §1: YAPI asks what is missing before a new store's first build. */
let chat: SourceChatService, prisma: any, applyMaster: jest.Mock, intakeStep: jest.Mock, config: Map<string, unknown>, messages: any[];
const question = (topic: string, text: string, options: string[] = ['Tranquila', 'Colorida']) => ({ understood: 'láminas de arte para decorar', reply: '', ready: false, topic, question: text, options });
const ready = { understood: 'láminas de arte', reply: '', ready: true, topic: 'none', question: '', options: [] };
beforeEach(() => {
  messages = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Láminas Lu', logoUrl: null, contactPhone: null, locations: [], onboarding: { what: 'laminas de arte' }, _count: { paymentLinks: 0 },
      paymentLinks: [{ name: 'Café', imageUrls: [] }], promoCodes: [], links: [] }), update: jest.fn() },
    deliveryZone: { count: jest.fn().mockResolvedValue(0) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn(), delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockImplementation(async ({ where }) => messages.filter(m => m.threadId === where.threadId && m.role === where.role).reverse()) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  applyMaster = jest.fn().mockImplementation(async (_m, _s, _r, filler) => { await filler({ storeName: 'Láminas Lu', products: ['Café'], photos: [] }); return { revision: 1, label: 'Plantilla: Esencial' }; });
  intakeStep = jest.fn();
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiSkeletons', false], ['app.yapiMasterPolish', true], ['app.yapiPersonalTouch', false], ['app.yapiPeppaRedesign', false], ['app.yapiIntake', true]]);
  const generation = { generate: jest.fn(), newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn(), interruptedPreview: jest.fn() } as any;
  chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation,
    { decide: jest.fn(), fillMaster: jest.fn().mockResolvedValue(null), intakeStep } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});
const first = (instruction: string, assetUrls: string[] = []) => chat.send('m1', 's1', { revision: 0, instruction, assetUrls, setupAction: 'generate', requestId: uuid() }) as Promise<any>;
const reply = (instruction: string, assetUrls: string[] = []) => chat.send('m1', 's1', { revision: 0, instruction, assetUrls, requestId: uuid() }) as Promise<any>;

it('asks first: one question with chips and «Créala ya», nothing built yet', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea tu tienda?'));
  const out = await first('hola quiero mi tienda para vender laminas');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(out.assistantMessage.content).toBe('Entendí: láminas de arte para decorar.\n\n¿Cómo quieres que se vea tu tienda?');
  expect(out.assistantMessage.metadata.clarification.options.map((option: any) => option.label)).toEqual(['Tranquila', 'Colorida', 'Créala ya']);
  expect(out.assistantMessage.metadata.intake).toMatchObject({ pending: true, asked: ['look'], question: { topic: 'look' } });
  expect(intakeStep.mock.calls[0][1].facts).toMatchObject({ sinFoto: ['Café'], envios: false });
});

it('a chip answer (no setupAction) goes back to the questions, then builds with every answer', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea tu tienda?')).mockResolvedValueOnce(ready);
  await first('hola quiero mi tienda para vender laminas');
  const out = await reply('Colorida');
  expect(intakeStep.mock.calls[1][1].answers).toEqual([{ topic: 'look', question: '¿Cómo quieres que se vea tu tienda?', answer: 'Colorida' }]);
  expect(applyMaster).toHaveBeenCalledTimes(1);
  expect(out.assistantMessage.content).toMatch(/^Listo, ya tengo lo que necesito\./);
  expect(out.followUp.instruction).toContain('Respuestas del comercio:\n- ¿Cómo quieres que se vea tu tienda? → Colorida');
});

it('«Créala ya» builds without asking again', async () => {
  intakeStep.mockResolvedValueOnce(question('look', '¿Cómo quieres que se vea?'));
  await first('quiero vender laminas');
  await reply('Créala ya');
  expect(intakeStep).toHaveBeenCalledTimes(1);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('«créala ya» as the very first message builds at once (review focus 2)', async () => {
  await first('Créala ya');
  expect(intakeStep).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a reply of photos only counts as an answer and the photos join the build (review focus 1)', async () => {
  intakeStep.mockResolvedValueOnce(question('photos', '¿Me mandas fotos de Café?', ['Te las mando'])).mockResolvedValueOnce(ready);
  await first('quiero vender laminas');
  await reply('', ['/v1/uploads/11111111-1111-1111-1111-111111111111.jpg']);
  expect(intakeStep.mock.calls[1][1].answers.at(-1)).toMatchObject({ topic: 'photos', answer: '(fotos)' });
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('stops at four questions', async () => {
  for (const topic of ['what', 'look', 'musts', 'photos']) intakeStep.mockResolvedValueOnce(question(topic, `¿${topic}?`));
  await first('quiero vender laminas');
  for (const answer of ['a', 'b', 'c']) await reply(answer);
  expect(applyMaster).not.toHaveBeenCalled();
  await reply('d');
  expect(intakeStep).toHaveBeenCalledTimes(4);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a failed check builds at once; switched off, nothing is asked', async () => {
  intakeStep.mockResolvedValueOnce(null);
  await first('quiero vender laminas');
  expect(applyMaster).toHaveBeenCalledTimes(1);
  config.set('app.yapiIntake', false); applyMaster.mockClear(); messages = [];
  await first('quiero vender laminas');
  expect(intakeStep).toHaveBeenCalledTimes(1);
  expect(applyMaster).toHaveBeenCalledTimes(1);
});

it('a product-link first build is never interrupted (review focus 4)', async () => {
  const workflow = { report: jest.fn(), finish: jest.fn(), value: {} };
  const userMessage = { id: 'u', threadId: 't1', content: 'https://example.com/producto', metadata: {} };
  await (chat as any).firstBuild('m1', 's1', 't1', userMessage, workflow, { answers: {} }, 0, [], userMessage.content, undefined, '', undefined, false);
  expect(intakeStep).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run the tests and make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-intake.spec.ts --maxWorkers=2`
Expected: FAIL. The first test sees `applyMaster` called, because no intake exists yet.

- [ ] **Step 4: Imports and helpers in `source-chat.service.ts`**

Add to the imports:

```ts
import { INTAKE_MAX, intakeFacts, intakeInstruction, intakeMessage, normalizeIntake, pendingIntake, wantsBuildNow, type IntakeState, type IntakeTopic } from './source-intake';
```

Add these private methods right above `private async firstBuild(`:

```ts
  private intakeOn() { return this.config.get<boolean>('app.yapiIntake') === true && Boolean((this.dialogue as { intakeStep?: unknown }).intakeStep); }

  /** Spec 2026-11-04 §1: the catalogue and settings the questions depend on (what is already there is never asked). */
  private async intakeFactsFor(storeId: string) {
    const [store, zones] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: storeId }, select: { name: true, onboarding: true, locations: true, contactPhone: true,
        paymentLinks: { where: { status: 'ACTIVE' }, select: { name: true, imageUrls: true }, take: 60 }, promoCodes: { select: { code: true }, take: 3 }, links: { select: { label: true, url: true } } } }).catch(() => null),
      Promise.resolve(this.prisma.deliveryZone?.count({ where: { storeId } })).catch(() => 0),
    ]);
    const s = (store ?? {}) as { name?: string; onboarding?: { what?: string; story?: string } | null; locations?: unknown; contactPhone?: string | null;
      paymentLinks?: Array<{ name: string; imageUrls: string[] }>; promoCodes?: Array<{ code: string }>; links?: Array<{ label: string; url: string }> };
    return intakeFacts({ name: s.name ?? '', onboarding: s.onboarding ?? {}, products: s.paymentLinks ?? [], zones: Number(zones) || 0,
      locations: Array.isArray(s.locations) ? s.locations as Array<{ pickupEnabled?: boolean }> : [], codes: (s.promoCodes ?? []).map(code => code.code),
      links: s.links ?? [], contactPhone: s.contactPhone ?? null });
  }

  /** Spec 2026-11-04 §1: one question when something is still missing (saved with its chips and the intake so far); null when it
   *  is time to build — ready, four asked, «Créala ya», or the check failed. */
  private async askBeforeBuild(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, state: IntakeState) {
    const last = state.answers.at(-1);
    if (state.asked.length >= INTAKE_MAX || wantsBuildNow(last ? last.answer : state.words)) return null;
    const facts = await this.intakeFactsFor(storeId);
    const raw = await Promise.resolve(this.dialogue.intakeStep!(merchantId, { storeId, facts, words: state.words, answers: state.answers, asked: state.asked, ...(state.question ? { pending: state.question } : {}) }))
      .catch(error => { if (error instanceof SourceProviderQuotaException) throw error; return null; });
    const turn = normalizeIntake(raw, state, facts);
    if (!turn || turn.ready || turn.topic === 'none') return null;
    const topic = turn.topic as IntakeTopic;
    const next: IntakeState = { ...state, pending: true, asked: state.asked.includes(topic) ? state.asked : [...state.asked, topic], question: { topic, text: turn.question } };
    await workflow.finish('completed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: intakeMessage(turn, !state.question),
      metadata: { progress: workflow.value, clarification: { prompt: turn.question, options: turn.options.map(label => ({ label, value: label })) }, intake: next } as never } });
    this.productLogger.log(JSON.stringify({ event: 'intake_question', storeId, topic, asked: next.asked.length }));
    return { userMessage, assistantMessage, setup: null };
  }
```

- [ ] **Step 5: The intake at the top of `firstBuild`**

Change the signature's tail from `..., replyPrefix = '', setupAction?: string)` to
`..., replyPrefix = '', setupAction?: string, intake?: IntakeState | false)`. Insert as the first lines of the body:

```ts
    // Spec 2026-11-04 §1: before a new store's first build, YAPI asks what is still missing; the build then reads the first words
    // with every answer. A link flow (product link, listing screenshot) passes false and is never interrupted.
    if (intake !== false && revision === 0 && this.intakeOn()) {
      const state: IntakeState = intake ?? { pending: true, words: instruction, ...(merchantRequest ? { request: merchantRequest } : {}), photos: chatPhotos, asked: [], answers: [] };
      const asked = await this.askBeforeBuild(merchantId, storeId, threadId, userMessage, workflow, state);
      if (asked) return asked;
      if (state.answers.length) {
        const words = intakeInstruction(state);
        userMessage = { ...userMessage, content: words };
        instruction = words;
        chatPhotos = state.photos.slice(0, 8);
        merchantRequest = state.request ? words : undefined;
        replyPrefix = `Listo, ya tengo lo que necesito. ${replyPrefix}`;
      }
    }
```

`firstBuild` reassigns `userMessage`, `instruction`, `chatPhotos`, `merchantRequest` and `replyPrefix` here. They are plain
parameters, so this compiles. If the linter flags `no-param-reassign`, copy them into `let` locals at the top instead.

- [ ] **Step 6: The answer route in `send()`**

Right after the `const workflow = createSourceProgress(...)` statement and before the
`// Owner 2026-10-31 (switching templates later)` comment:

```ts
    // Spec 2026-11-04 §1: the merchant's reply to YAPI's question before the first build goes back to the questions, whatever the
    // Studio sent with it (a chip tap carries no setupAction). Photos sent with it join the build.
    const openIntake = !input.personalTouch && !input.resumeWords && this.intakeOn() ? pendingIntake(history.messages, current.revision) : null;
    if (openIntake) {
      const answer = input.instruction.trim() || ((input.assetUrls || []).length ? '(fotos)' : '');
      const state: IntakeState = { ...openIntake, photos: [...new Set([...openIntake.photos, ...(input.assetUrls || [])])].slice(0, 24),
        answers: [...openIntake.answers, { topic: openIntake.question?.topic ?? 'what', question: openIntake.question?.text ?? '', answer }] };
      await workflow.report('interpreting');
      return await this.firstBuild(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, state.photos.slice(0, 8), state.words, state.request, '', 'generate', state);
    }
```

- [ ] **Step 7: The product-link build skips the intake**

At the `firstBuild` call after the conversation step (~line 1896, the one passing `productRequest ?? ownRequest, productNote`),
append two arguments:

```ts
        return await this.firstBuild(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, chatPhotos, input.instruction, productRequest ?? ownRequest, productNote, undefined, productImport ? false : undefined);
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-intake.spec.ts src/storefront-source/source-chat-master.spec.ts --maxWorkers=2`
Expected: both PASS. The master spec has no `app.yapiIntake`, so its first builds must be unchanged.

- [ ] **Step 9: Type-check the touched files**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json 2>&1 | grep -E "source-(chat\.service|intake|conversation\.service)" | head`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-intake.spec.ts
git commit -m "feat(intake): YAPI asks what is missing before a new store's first build, then builds with every answer"
```

Stage only this task's hunks if `source-chat.service.ts` carries other uncommitted work (check `git diff --stat` first).

---

### Task 4: Three style-fit candidates, the least used wins

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-pick.ts`
  - `TEMPLATE_PICK_PROMPT`;
  - `templatePickSchema`;
  - replace `readTemplatePick` with `readTemplatePicks`;
  - add `leastUsedPick`.
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts`
  - `pickTemplate` returns `Array<{ id; reason }> | null`;
  - change its `readTemplatePick` import and use.
- Modify: `apps/api/src/storefront-source/source-chat.service.ts`
  - `pickStoreTemplate` (~line 466): candidates + `templateUses()`;
  - `useMasterTemplate`'s reply metadata (~line 456): `templatePick`.
- Test: `apps/api/src/storefront-source/source-template-pick.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Produces:
  - `readTemplatePicks(answer: unknown, templates: readonly PickableTemplate[]): Array<{ id: string; reason: string }>`;
  - `leastUsedPick(candidates: ReadonlyArray<{ id: string; reason: string }>, uses: ReadonlyMap<string, number>): { id: string; reason: string } | null`;
  - first-build reply metadata `templatePick: string`.

- [ ] **Step 1: Check no YAPI job is running.** Expected: `busy 0`.

- [ ] **Step 2: Write the failing tests**

In `source-template-pick.spec.ts`:
- Change the import to `import { fallbackTemplatePick, leastUsedPick, pickableTemplates, readTemplatePicks, templatePickSchema, templateSwitchRequest } from './source-template-pick';`.
- Replace the test `'keeps a known answer and its reason, drops an unknown one'` with:

```ts
  it('keeps up to three known, distinct candidates in order, with their reasons', () => {
    const templates = pickableTemplates([manifest('mordisco'), manifest('pecas'), manifest('grano'), manifest('sorbo')]);
    expect(readTemplatePicks({ plantillas: [{ plantilla: 'pecas', porque: '  Va con tu   piel. ' }, { plantilla: 'otra', porque: 'x' }, { plantilla: 'pecas', porque: 'y' }, { plantilla: 'grano', porque: '' }, { plantilla: 'sorbo', porque: '' }, { plantilla: 'mordisco', porque: '' }] }, templates))
      .toEqual([{ id: 'pecas', reason: 'Va con tu piel.' }, { id: 'grano', reason: '' }, { id: 'sorbo', reason: '' }]);
    expect(readTemplatePicks(null, templates)).toEqual([]);
    expect(templatePickSchema(['a', 'b']).properties.plantillas.items.properties.plantilla.enum).toEqual(['a', 'b']);
  });

  it('takes the least used candidate; a tie keeps the model order (spec 2026-11-04 §2: two art stores both got Muro)', () => {
    const candidates = [{ id: 'muro', reason: 'a' }, { id: 'calma', reason: 'b' }, { id: 'diario', reason: 'c' }];
    expect(leastUsedPick(candidates, new Map([['muro', 2], ['calma', 1]]))).toEqual({ id: 'diario', reason: 'c' });
    expect(leastUsedPick(candidates, new Map([['muro', 1], ['calma', 1], ['diario', 1]]))).toEqual({ id: 'muro', reason: 'a' });
    expect(leastUsedPick([], new Map())).toBeNull();
  });
```

In `source-chat-master.spec.ts`, inside `describe('YAPI picks the themed template for a new store ...')`, add:

```ts
  it('of three candidates, the one fewer stores already use, and the reply records it (spec 2026-11-04 §2)', async () => {
    withPick(jest.fn().mockResolvedValue([{ id: 'grano', reason: 'Café que tuesta en casa.' }, { id: 'sorbo', reason: 'Bebidas de la casa.' }, { id: 'horno', reason: 'Horneado.' }]));
    const used = [{ metadata: { templatePick: 'grano' } }, { metadata: { templatePick: 'grano' } }, { metadata: { templatePick: 'horno' } }];
    prisma.storeAgentMessage.findMany.mockImplementation(async ({ where }: any) => where.metadata ? used : messages.filter(m => m.threadId === where.threadId && m.role === where.role).reverse());
    const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
    expect(applyMaster.mock.calls[0][4]).toBe('sorbo');
    expect(out.assistantMessage.content).toContain('Elegí la plantilla Sorbo: bebidas de la casa.');
    expect(out.assistantMessage.metadata.templatePick).toBe('sorbo');
  });
```

The existing tests that mock `pickTemplate` with a single `{ id, reason }` object stay as they are. The chat service still
accepts that shape.

- [ ] **Step 3: Run the tests and make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-pick.spec.ts src/storefront-source/source-chat-master.spec.ts --maxWorkers=2`
Expected: FAIL — `readTemplatePicks`/`leastUsedPick` not exported; the chat test gets `grano`.

- [ ] **Step 4: Prompt, schema, reader and least-used in `source-template-pick.ts`**

Replace `TEMPLATE_PICK_PROMPT`, `templatePickSchema` and `readTemplatePick` with:

```ts
export const TEMPLATE_PICK_PROMPT = `Eres YAPI, el diseñador de pagosYa. Una tienda nueva necesita su plantilla: propone las TRES de «plantillas» que mejor le quedan, la mejor primero.
Cada plantilla es una tienda completa (encabezado, portada, página de producto, pie) con un estilo; su «rubro» dice para qué negocio se pensó, pero
el contenido se llena con los productos y las palabras de esta tienda, así que una plantilla de otro rubro sirve cuando su forma le queda a este
catálogo (una tienda de láminas puede vestirse con una de moda calma o de diario; una de libros con una editorial). Nunca propongas una cuyas
secciones necesitan lo que esta tienda no tiene (tallas para una panadería, una carta para ropa).
Elige por el negocio y el estilo: qué vende (sus palabras y los nombres de sus productos), para quién, y cómo quiere verse. Si sus palabras o sus
respuestas dicen un estilo («Colorida», «Tranquila», «Elegante», «Divertida», un color, una tienda que le gusta), ese estilo manda sobre el rubro.
«secciones» es cuántas secciones tiene su portada. Si el comercio pide una tienda completa o con muchas secciones, prefiere las de 10 o más.
«porque»: una sola frase corta en español, para el comerciante, que diga por qué esa plantilla va con su negocio (sin halagos ni promesas).
Tres plantillas distintas. Responde solo el JSON.`;

export function templatePickSchema(ids: readonly string[]) {
  return {
    type: 'object', additionalProperties: false, required: ['plantillas'],
    properties: { plantillas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['plantilla', 'porque'],
      properties: { plantilla: { type: 'string', enum: [...ids] }, porque: { type: 'string', maxLength: 220 } } } } },
  } as const;
}

/** The model's candidates, checked: known templates, each once, at most three, with a short reason. */
export function readTemplatePicks(answer: unknown, templates: readonly PickableTemplate[]): Array<{ id: string; reason: string }> {
  const list = Array.isArray((answer as { plantillas?: unknown } | null)?.plantillas) ? (answer as { plantillas: unknown[] }).plantillas : [];
  const out: Array<{ id: string; reason: string }> = [];
  for (const entry of list) {
    const raw = (entry ?? {}) as { plantilla?: unknown; porque?: unknown };
    const id = String(raw.plantilla ?? '');
    if (!templates.some(template => template.id === id) || out.some(pick => pick.id === id)) continue;
    out.push({ id, reason: String(raw.porque ?? '').replace(/\s+/g, ' ').trim().slice(0, 220) });
    if (out.length === 3) break;
  }
  return out;
}

/** Spec 2026-11-04 §2 (owner: «las de arte usaron la misma»): of the candidates, the one fewer stores already wear; a tie keeps
 *  the model's order. */
export function leastUsedPick(candidates: ReadonlyArray<{ id: string; reason: string }>, uses: ReadonlyMap<string, number>) {
  let best: { id: string; reason: string } | null = null;
  for (const candidate of candidates) if (!best || (uses.get(candidate.id) ?? 0) < (uses.get(best.id) ?? 0)) best = candidate;
  return best;
}
```

- [ ] **Step 5: `pickTemplate` returns the candidates**

In `source-conversation.service.ts`:
- Change the import of `readTemplatePick` to `readTemplatePicks`.
- Change the return type of `pickTemplate` to `Promise<Array<{ id: string; reason: string }> | null>`.
- Replace the success line inside its loop with:

```ts
        if (response.ok) { const read = readTemplatePicks(sourceResponseJson(body), input.templates); if (read.length) { status = 'COMPLETED'; return read; } }
```

Raise its `max_output_tokens` from 800 to 1200 (three reasons).

- [ ] **Step 6: `pickStoreTemplate` takes the least used, and the reply records it**

In `source-chat.service.ts`, add `leastUsedPick` to the existing import from `./source-template-pick`. Add this method above
`pickStoreTemplate`:

```ts
  /** Spec 2026-11-04 §2: how many recent new stores started on each template (the first-build reply's metadata.templatePick). */
  private async templateUses() {
    const rows = await Promise.resolve(this.prisma.storeAgentMessage.findMany({ where: { role: 'ASSISTANT', metadata: { path: ['templatePick'], string_starts_with: '' } },
      orderBy: { createdAt: 'desc' }, take: 300, select: { metadata: true } })).catch(() => [] as Array<{ metadata: unknown }>);
    const uses = new Map<string, number>();
    for (const row of rows ?? []) { const id = (row.metadata as { templatePick?: unknown } | null)?.templatePick; if (typeof id === 'string') uses.set(id, (uses.get(id) ?? 0) + 1); }
    return uses;
  }
```

In `pickStoreTemplate`, replace the two lines from `const answer = await Promise.resolve(this.dialogue.pickTemplate?.(...` through
`const pick = answer ?? fallbackTemplatePick(input.businessWords, templates);` with:

```ts
    const answer = await Promise.resolve(this.dialogue.pickTemplate?.(merchantId, { storeId, storeName: input.storeName, what: input.what, story: input.story, request: input.request, products: input.products, templates }))
      .catch(error => { if (error instanceof SourceProviderQuotaException) throw error; return null; }) ?? null;
    // Spec 2026-11-04 §2: up to three candidates (a single answer still reads), the least used wins.
    const candidates = (Array.isArray(answer) ? answer : answer ? [answer] : []).filter(candidate => templates.some(template => template.id === candidate.id));
    const pick = candidates.length ? leastUsedPick(candidates, await this.templateUses()) : fallbackTemplatePick(input.businessWords, templates);
```

and change its log line's `by: answer ? 'yapi' : ...` to
`by: candidates.length ? 'yapi' : pick ? 'words' : 'none', candidates: candidates.map(candidate => candidate.id)`.

In `useMasterTemplate`, in the reply's `metadata: { progress: workflow.value, sourceSetup: ..., sourceRevision: saved.revision, label: saved.label }`
(~line 456), add `...(templatePick ? { templatePick: templatePick.id } : {})`.

The `switchTemplate` path calls `pickStoreTemplate` too. It keeps working, since `exclude` already filters `templates`.

- [ ] **Step 7: Run the tests and make sure they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-pick.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-chat-intake.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 8: Type-check**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json 2>&1 | grep -E "source-(chat\.service|template-pick|conversation\.service)" | head`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/storefront-source/source-template-pick.ts apps/api/src/storefront-source/source-template-pick.spec.ts apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(templates): YAPI proposes three style-fit templates from any rubro and the least used wins"
```

---

### Task 5: «Descubre» gets the story photo and two products

**Files:**
- Modify: `packages/storefront-kit/commerce-src/header/store-menu.js`
  - CSS: one rule for the price;
  - new helpers `storeMenuStorePhoto`, `storeMenuDiscoverTiles` after `storeMenuLinkPhoto`;
  - `resolveStoreMenuGroups` uses them when a group has no tiles;
  - the tile markup shows a price.
- Generated: `packages/storefront-kit/kit/commerce.js` (by the build script) and the Studio bundle (by `build:studio`).
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Consumes (already in the kit's shared scope, used by this file today): `products()`, `pageHref`, `config`, `store`, `money`,
  `price`, `storeMenuTarget`, `storeMenuPhoto`, `escape`.
- Produces: tiles of shape `{ href, title, image, price? }`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('store menu', ...)` in `source-commerce-store-menu.spec.ts`:

```ts
  // Spec 2026-11-04 §3 (Canasta Viva: «Descubre» was four words over an empty panel).
  it('a group with no photo of its own shows the story photo, then two products with a badge first', async () => {
    const data = { ...DATA, aboutText: 'Horneamos cada mañana.', aboutImageUrl: '/v1/uploads/historia.jpg',
      items: [item('a', 'C1'), { ...item('b', 'c2'), badge: 'Más vendido' }, item('c', 'c3')] };
    const { all } = await open({ data, menu: { style: 'dropdowns', groups: [{ label: 'Descubre', links: [{ to: 'page:about' }, { to: 'page:contact' }] }] } });
    expect(all('.pym-tiles img').map(img => img.getAttribute('src'))).toEqual(['https://api.test/v1/uploads/historia.jpg', 'https://api.test/b.jpg', 'https://api.test/a.jpg']);
    const tiles = all('.pym-tiles a');
    expect(tiles[0].textContent).toContain('Nuestra historia');
    expect(tiles[1].getAttribute('href')).toContain('id=b');
    expect(tiles[1].querySelector('.pym-price').textContent).toMatch(/Bs/);
  });

  it('without the store\'s own photo there is no story tile; without any photo, links only', async () => {
    const data = { ...DATA, aboutText: 'Horneamos cada mañana.' };
    const first = await open({ data, menu: { style: 'dropdowns', groups: [{ label: 'Descubre', links: [{ to: 'page:about' }] }] } });
    expect(first.all('.pym-tiles img').map(img => img.getAttribute('src'))).toEqual(['https://api.test/a.jpg', 'https://api.test/b.jpg']);
    const bare = { ...data, items: DATA.items.map(entry => ({ ...entry, imageUrls: [] })) };
    const second = await open({ data: bare, menu: { style: 'dropdowns', groups: [{ label: 'Descubre', links: [{ to: 'page:about' }] }] } });
    expect(second.all('.pym-tiles')).toHaveLength(0);
    expect(second.all('.pym-links a').map(a => a.textContent)).toEqual(['Nuestra historia']);
  });
```

- [ ] **Step 2: Rebuild the kit and run the tests to make sure they fail**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts --maxWorkers=2`
Expected: the two new tests FAIL (no `.pym-tiles` in the Descubre group); the others PASS.

- [ ] **Step 3: Helpers after `storeMenuLinkPhoto`**

```js
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeMenuStorePhoto(url) {
    if (typeof url !== 'string' || !url.trim()) return '';
    try { return storeMenuPhoto(/^\/v1\//.test(url.trim()) && config.apiBaseUrl ? new URL(url.trim(), config.apiBaseUrl).href : url.trim()); } catch { return ''; }
  }
  /** Spec 2026-11-04 §3 (Canasta Viva: «Descubre» was four words over an empty panel): a group with no photo of its own shows the
   *  store's own photo on «Nuestra historia» (never a product photo) and up to two products, badged ones first. */
  function storeMenuDiscoverTiles(group) {
    const tiles = [];
    const about = (Array.isArray(group.links) ? group.links : []).some(link => link && link.to === 'page:about') ? storeMenuTarget('page:about') : null;
    const story = about ? storeMenuStorePhoto(store.aboutImageUrl) || storeMenuStorePhoto(store.bannerUrl) : '';
    if (about && story) tiles.push({ href: about.href, title: about.label, image: story });
    const shown = products().filter(item => storeMenuPhoto((item.imageUrls || [])[0]));
    for (const item of [...shown.filter(entry => entry.badge), ...shown.filter(entry => !entry.badge)].slice(0, 2)) {
      tiles.push({ href: pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)), title: String(item.name || '').slice(0, 28),
        image: storeMenuPhoto(item.imageUrls[0]), price: money(price(item), item.currency || 'BOB') });
    }
    return tiles;
  }
```

- [ ] **Step 4: Use them in `resolveStoreMenuGroups`, and show the price**

In `resolveStoreMenuGroups`, after the `const tiles = ...slice(0, 3);` statement and before `const footerTarget`, add:

```js
      const shownTiles = tiles.length ? tiles : storeMenuDiscoverTiles(group);
```

In the returned object, replace `tilesTitle: tiles.length ? String(group.tilesTitle || '') : '', tiles,` with
`tilesTitle: shownTiles.length ? String(group.tilesTitle || '') : '', tiles: shownTiles,`.

In `renderStoreMenu`'s tile markup, change `<span>${escape(tile.title)}</span>` to
`<span>${escape(tile.title)}</span>${tile.price ? `<small class="pym-price">${escape(tile.price)}</small>` : ''}`.

In `STORE_MENU_CSS`, after the `.pym-tiles img{...}` rule, add:

```css
    .pym-price{font-size:13px;opacity:.75}
```

If `money` or `price` is not in scope (the build fails or the test shows `money is not defined`), check the concatenation order
in `packages/storefront-kit/tools/build-commerce.mjs`. `shared/state.js` must come before `header/store-menu.js`; it already
defines `money`, `price` and `products`.

- [ ] **Step 5: Rebuild and run the tests**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts --maxWorkers=2`
Expected: PASS (all tests, the old ones included).

- [ ] **Step 6: Rebuild the Studio's bundled kit**

Run: `pnpm --filter @pagosya/merchant-dashboard run build:studio`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/storefront-kit/commerce-src/header/store-menu.js packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): a menu group with no photos shows the store's story photo and two products («Descubre»)"
```

Add the Studio build output to the commit only if it is tracked: `git status --short apps/merchant-dashboard`.

---

### Task 6: Live check on the dev stack

**Files:**
- Uses `apps/api/scripts/create-full-store-demo.ts` as it is. The `libros`, `laminas`, `canasta` and `miga` keys plus the
  `[copy]` argument make fresh stores.
- Notes: `.superpowers/sdd/2026-11-04-readiness/intake-live.md` (create; not committed).

- [ ] **Step 1: Make sure the API runs the new code**

Check `grep -c "intake" apps/api/dist/src/storefront-source/source-chat.service.js`. Expected: more than 0.
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/v1/health` should not give `000`.

- [ ] **Step 2: Fresh stores, one-liner merchants**

```bash
cd apps/api
for k in libros laminas; do DEMO_MERCHANT_EMAIL=pruebas2@pagosya.bo npx ts-node --transpile-only scripts/create-full-store-demo.ts $k q1; done
cd ../../examples/full-stores-2026-11-02
cp libros/first.txt libros-q1/first.txt; cp laminas/first.txt laminas-q1/first.txt
LIVE=live-p2.json node send.cjs libros-q1 --first
```

Read YAPI's question with
`node -e "const{PrismaClient}=require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');const p=new PrismaClient();const id=require('./libros-q1/demo.json').storeId;p.storeAgentMessage.findFirst({where:{thread:{storeId:id},role:'ASSISTANT'},orderBy:{createdAt:'desc'}}).then(m=>{console.log(m.content,'\n',JSON.stringify(m.metadata.clarification));return p.\$disconnect()})"`.
Answer by sending a chip's text: `LIVE=live-p2.json node send.cjs libros-q1 Colorida`. Repeat until the build starts.
Expected: 2–4 questions, no topic twice, «Créala ya» on each, then «Listo, ya tengo lo que necesito.» and a built store.

- [ ] **Step 3: Rich brief and settings-filled store**

- `miga q5`: Miga's long brief; copy `miga-p2/first.txt` without its last «Usa la plantilla Grano.» line. Expected: at most one
  question.
- `canasta q1`: it has a delivery zone and pickup set. Expected: no shipping question, and a photos question naming «Bolsa fresh
  essentials» or «Carrito de frutas frescas».

- [ ] **Step 4: Two art stores in a row get different templates**

Finish `laminas-q1`. Then make `laminas q2` and answer «Créala ya» to its first question. Check each store's theme with
`node layout.cjs laminas-q1` and `node layout.cjs laminas-q2`. Expected: two different themes.

- [ ] **Step 5: «Descubre» with photos**

Open Canasta Viva (`7m3y5kq6`) in the dashboard at 1280 and hover «DESCUBRE». Expected: two product tiles beside the links. The
demo store has no about or banner photo, so it gets no historia tile.

- [ ] **Step 6: Write the notes and report**

In `.superpowers/sdd/2026-11-04-readiness/intake-live.md`, record:
- each store's questions, word for word;
- the number asked;
- the template picked;
- anything wrong.

Fix real defects with a failing test first, in the owning task's spec file. Report to the owner with the question transcripts.
