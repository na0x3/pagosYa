# YAPI Signature Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New YAPI stores grow a concept from the business itself (its "signature") and carry it through words and visuals, with an advisory self-check against the vibecoded look, without restricting YAPI or making today's behaviour worse.

**Architecture:**
- The design planner's three concepts gain an optional `signature`. It is normalised in code (never a reason to reject a plan) in a new focused module, `source-signature.ts`.
- The builder (agent) gets one direction paragraph and an advisory tells list in its existing screenshot step, plus an optional `finish.tellsKept`. That field is recorded on the run's agent attempt.
- An off switch `YAPI_SIGNATURE=off` removes every addition except the loosened beat headline.

**Tech Stack:** NestJS API (TypeScript), Jest + ts-jest, OpenAI-style strict JSON schemas, Playwright (eval only).

**Spec:** `docs/superpowers/specs/2026-10-09-yapi-signature-look-design.md`

## Global Constraints

- Owner: "no set rules for yapi for design". Every addition is direction or capability, never a ban, quota or catalogue of devices.
- Owner: "do not restrict yapi nor make what he is already doing worse".
- A signature problem never throws, never spends the paid planning repair, never fails a run; repairs go to `dnaOptions.repairs`.
- Saved revisions stay byte-identical: a concept gets `signature` only when the input had one.
- The tells list is never a `verify` finding, never blocks `finish`, adds no tool calls, and appears only when `creative` is true (new stores and redesigns).
- `tellsKept` is never required to succeed and never shown to merchants; ≤ 6 entries × 120 chars. Agent tools are strict and constant, so the `finish` schema always lists `tellsKept` (an empty array is a valid answer). The switch controls only whether the prompt asks for it and whether it is recorded.
- Limits: idea ≤ 200, source ≤ 200, device ≤ 300 chars; vocabulary ≤ 8 entries × 40 chars; carries ⊆ `layout.sections`.
- Kill switch: `YAPI_SIGNATURE=off` → `app.yapiSignature = false` (same pattern as `yapiSketchFirst`). Default on.
- Dev DB guard: never run `prisma migrate/diff/reset` (no schema change is needed here). Never `pnpm` inside `pagosYaWeb`.
- The pre-existing failing fingerprint test in `source-generation.service.spec.ts` is reported as-is, not "fixed" by this work.
- Commit on `feature/store-page-architecture` (the owner's live branch). Rollback tag: `checkpoint/before-signature-design-2026-10-09`.

## Review Focus

1. **A planner signature whose `carries` names sections that are not in its layout** (a common model slip) → those IDs are dropped and the plan is accepted. Covered in Task 1 and Task 2.
2. **`YAPI_SIGNATURE=off`** → the planner request has no `signature` in its schema or prompt, and the builder prompt has neither paragraph. Exactly today's behaviour. Covered in Task 3 and Task 4.
3. **A builder that calls `finish` without `tellsKept`** (older transcripts, the Anthropic adapter, edit runs) → finish succeeds and `finished` keeps its current shape. Covered in Task 5.
4. **A resumed run whose checkpoint design carries a signature while the switch is now off** → no signature line reaches the builder. Covered in Task 4 (`sourceSignatureTaskLine` with `enabled=false`).
5. **A saved design from before this work** (no signature, every beat with a headline) → validates and round-trips byte-identical. Covered in Task 2.

---

### Task 1: Signature module (type, schema, normaliser, prompt text) and the off switch

**Files:**
- Create: `apps/api/src/storefront-source/source-signature.ts`
- Create: `apps/api/src/storefront-source/source-signature.spec.ts`
- Modify: `apps/api/src/storefront-source/source-design.ts` (move `fitProse`, currently around lines 64–70, into the new module and import it back)
- Modify: `apps/api/src/config/configuration.ts` (interface near line 77; values near line 398)

**Interfaces:**
- Produces:
  - `type SourceSignature = { idea: string; source: string; vocabulary: string[]; device: string; carries: string[] }`
  - `SOURCE_SIGNATURE_SCHEMA` (strict JSON schema object)
  - `normalizeSourceSignature(value: unknown, sections: string[] | undefined, at: string): { signature?: SourceSignature; repairs: string[] }`
  - `fitProse(text: string, max: number): string` (moved, same behaviour)
  - `sourceSignatureTaskLine(concept: { signature?: SourceSignature } | undefined, enabled: boolean): string`
  - Prompt constants: `SOURCE_SIGNATURE_PLANNING`, `SOURCE_SIGNATURE_BUILDING`, `SOURCE_TELLS_SELF_CHECK`
  - Config key `app.yapiSignature: boolean`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/storefront-source/source-signature.spec.ts`:

```ts
import { fitProse, normalizeSourceSignature, sourceSignatureTaskLine, SOURCE_SIGNATURE_SCHEMA, SOURCE_SIGNATURE_PLANNING, SOURCE_SIGNATURE_BUILDING, SOURCE_TELLS_SELF_CHECK } from './source-signature';

const good = () => ({ idea: 'Un café de día que de noche es bar de vinilos: la tienda es un disco con dos caras.', source: 'El dueño pone vinilos después de las 20:00.', vocabulary: ['Tracklist', 'Cara A', 'Cara B'], device: 'Un disco que gira dibujado en CSS y etiquetas Cara A/B.', carries: ['opening', 'menu'] });

describe('normalizeSourceSignature', () => {
  it('keeps a valid signature verbatim and reports nothing', () => {
    expect(normalizeSourceSignature(good(), ['opening', 'menu', 'visit'], 'concepts[0]')).toEqual({ signature: good(), repairs: [] });
  });
  it('returns nothing and no repairs when there is no signature', () => {
    expect(normalizeSourceSignature(undefined, ['menu'], 'concepts[0]')).toEqual({ repairs: [] });
    expect(normalizeSourceSignature(null, ['menu'], 'concepts[0]')).toEqual({ repairs: [] });
  });
  it('drops a signature that is not an object or has no idea, and says why', () => {
    expect(normalizeSourceSignature('vinyl', ['menu'], 'concepts[1]')).toEqual({ repairs: ['concepts[1].signature: not an object, dropped'] });
    const result = normalizeSourceSignature({ ...good(), idea: '   ' }, ['menu'], 'concepts[1]');
    expect(result.signature).toBeUndefined();
    expect(result.repairs).toContain('concepts[1].signature: no idea, dropped');
  });
  it('keeps only carries that name planned sections', () => {
    const result = normalizeSourceSignature({ ...good(), carries: ['opening', 'ghost', 'menu', 'menu'] }, ['opening', 'menu'], 'concepts[2]');
    expect(result.signature!.carries).toEqual(['opening', 'menu']);
    expect(result.repairs).toEqual(['concepts[2].signature.carries: kept 2 of 4 section IDs']);
  });
  it('cuts long prose at a sentence and trims the vocabulary to eight short distinct entries', () => {
    // fitProse keeps a sentence only when it ends past half the limit, so the first sentence is ~115 chars.
    const sentence = 'Concepto ' + 'muy '.repeat(25) + 'claro.';
    const long = sentence + ' ' + 'x'.repeat(400);
    const words = ['Uno', 'uno', '', 'x'.repeat(41), 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];
    const result = normalizeSourceSignature({ ...good(), idea: long, vocabulary: words }, ['opening', 'menu'], 'concepts[0]');
    expect(result.signature!.idea).toBe(sentence);
    expect(result.signature!.vocabulary).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho']);
    expect(result.repairs).toEqual(expect.arrayContaining([expect.stringContaining('concepts[0].signature.idea'), expect.stringContaining('concepts[0].signature.vocabulary')]));
  });
  it('clears non-text fields instead of failing', () => {
    const result = normalizeSourceSignature({ ...good(), source: 42, device: undefined, vocabulary: 'Tracklist' }, ['opening', 'menu'], 'concepts[0]');
    expect(result.signature).toMatchObject({ source: '', device: '', vocabulary: [] });
  });
});

describe('signature prompt text and schema', () => {
  it('lists every field as required for strict mode and allows empty values', () => {
    expect(SOURCE_SIGNATURE_SCHEMA.required).toEqual(['idea', 'source', 'vocabulary', 'device', 'carries']);
    expect(SOURCE_SIGNATURE_SCHEMA.properties.idea).not.toHaveProperty('minLength');
    expect(SOURCE_SIGNATURE_SCHEMA.properties.vocabulary).not.toHaveProperty('minItems');
  });
  it('directs without banning anything', () => {
    for (const text of [SOURCE_SIGNATURE_PLANNING, SOURCE_SIGNATURE_BUILDING, SOURCE_TELLS_SELF_CHECK]) expect(text).not.toMatch(/\b(never use|forbidden|prohibid|must not use)\b/i);
    expect(SOURCE_SIGNATURE_PLANNING).toContain('restraint is a valid signature');
    expect(SOURCE_TELLS_SELF_CHECK).toContain('never blocks finishing');
    expect(SOURCE_TELLS_SELF_CHECK).toContain('tellsKept');
  });
  it('builds a task line only when enabled and a signature exists', () => {
    expect(sourceSignatureTaskLine({ signature: good() }, true)).toContain('Cara A · Cara B');
    expect(sourceSignatureTaskLine({ signature: good() }, false)).toBe('');
    expect(sourceSignatureTaskLine({}, true)).toBe('');
    expect(sourceSignatureTaskLine(undefined, true)).toBe('');
  });
  it('keeps fitProse behaviour', () => {
    expect(fitProse('Primera frase. Segunda parte larga', 20)).toBe('Primera frase.');
    expect(fitProse('uno dos tres cuatro', 10)).toBe('uno dos');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-signature.spec.ts`
Expected: FAIL with "Cannot find module './source-signature'".

- [ ] **Step 3: Write the module**

`apps/api/src/storefront-source/source-signature.ts`:

```ts
/** Signature look (spec 2026-10-09-yapi-signature-look-design): an idea grown from the business itself, carried in words
 * and visuals. Direction only: it is repaired in code and never fails a plan, a verify or a finish. */
export type SourceSignature = { idea: string; source: string; vocabulary: string[]; device: string; carries: string[] };

const SECTION_ID = /^[a-z][a-z0-9-]{0,47}$/;

/** Strict mode needs every field listed; none has a minimum, so the model is never forced to invent a device. */
export const SOURCE_SIGNATURE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'source', 'vocabulary', 'device', 'carries'], properties: {
    idea: { type: 'string', maxLength: 200 },
    source: { type: 'string', maxLength: 200 },
    vocabulary: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 } },
    device: { type: 'string', maxLength: 300 },
    carries: { type: 'array', maxItems: 12, items: { type: 'string', pattern: SECTION_ID.source } },
  },
};

/** Prose a little past a limit is a formatting slip: cut at a sentence, else a word. */
export function fitProse(text: string, max: number) {
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max * 0.5) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(' ');
  return (word >= max * 0.5 ? cut.slice(0, word) : cut).trim();
}

function prose(value: unknown, max: number, path: string, repairs: string[]) {
  if (typeof value !== 'string') { if (value !== undefined) repairs.push(`${path}: not text, cleared`); return ''; }
  const text = value.trim();
  if (text.length <= max) return text;
  repairs.push(`${path}: ${text.length} chars cut to ${max}`);
  return fitProse(text, max);
}

/** Repairs instead of rejecting: a weak signature costs nothing, a rejected plan costs the merchant a paid retry. */
export function normalizeSourceSignature(value: unknown, sections: string[] | undefined, at: string): { signature?: SourceSignature; repairs: string[] } {
  const repairs: string[] = [];
  if (value === undefined || value === null) return { repairs };
  if (typeof value !== 'object' || Array.isArray(value)) return { repairs: [`${at}.signature: not an object, dropped`] };
  const raw = value as Record<string, unknown>;
  const idea = prose(raw.idea, 200, `${at}.signature.idea`, repairs);
  if (!idea) return { repairs: [...repairs, `${at}.signature: no idea, dropped`] };
  const source = prose(raw.source, 200, `${at}.signature.source`, repairs);
  const device = prose(raw.device, 300, `${at}.signature.device`, repairs);
  const vocabulary: string[] = [];
  for (const word of Array.isArray(raw.vocabulary) ? raw.vocabulary : []) {
    const clean = typeof word === 'string' ? word.trim() : '';
    if (!clean || clean.length > 40) { repairs.push(`${at}.signature.vocabulary: dropped ${JSON.stringify(String(word).slice(0, 60))}`); continue; }
    if (!vocabulary.some(kept => kept.toLowerCase() === clean.toLowerCase())) vocabulary.push(clean);
  }
  if (vocabulary.length > 8) { repairs.push(`${at}.signature.vocabulary: ${vocabulary.length} entries cut to 8`); vocabulary.length = 8; }
  const ids = Array.isArray(raw.carries) ? raw.carries.filter((id): id is string => typeof id === 'string') : [];
  const carries = [...new Set(ids)].filter(id => sections ? sections.includes(id) : SECTION_ID.test(id));
  if (carries.length !== ids.length) repairs.push(`${at}.signature.carries: kept ${carries.length} of ${ids.length} section IDs`);
  return { signature: { idea, source, vocabulary, device, carries }, repairs };
}

/** The chosen signature restated for the builder; empty when the switch is off or the concept has none. */
export function sourceSignatureTaskLine(concept: { signature?: SourceSignature } | undefined, enabled: boolean): string {
  const signature = enabled ? concept?.signature : undefined;
  if (!signature) return '';
  return `\nSignature to carry: ${signature.idea}${signature.device ? ` Device: ${signature.device}` : ''}${signature.vocabulary.length ? ` Vocabulary: ${signature.vocabulary.join(' · ')}.` : ''}${signature.carries.length ? ` Shows in: ${signature.carries.join(', ')}.` : ''}`;
}

export const SOURCE_SIGNATURE_PLANNING = `SIGNATURE. Before choosing a layout, find each concept's idea in this business itself: its real story, place, craft, people, products or customs, never in its category alone (a pilates studio is not an idea; a studio in a converted printing house whose owner danced for fifteen years is). Write it as signature: idea (one sentence), source (the concrete fact from the brief, photos or reference it grows from), vocabulary (0–8 short words or phrases the navigation and section titles can speak in, in the merchant's language; empty when plain words serve better), device (one visual idea in your own words: drawn, typographic, photographic, structural or nearly invisible) and carries (the planned section IDs where it shows). The three concepts need different ideas, not three skins of one. A signature may be loud or quiet; restraint is a valid signature. It is direction for the build, not decoration to add everywhere.`;

export const SOURCE_SIGNATURE_BUILDING = `SIGNATURE. When the selected concept has a signature it is your through-line: build its device, use its vocabulary where it reads naturally in navigation and section titles, and let it reappear in the sections it names. It is direction, not a checklist; adapt it when a section or the merchant's words call for something else. A section does not need a heading when its content or device opens it better.`;

export const SOURCE_TELLS_SELF_CHECK = `While you look at those screenshots, weigh the habits that make generated sites look generated: the same fade or blur reveal on every section; a marquee added by reflex; a small label above every heading; three equal cards with icons in tinted circles; a centred hero with a "★ 5.0" pill badge; Inter or Playfair as the default instead of a choice; everything inside rounded cards with soft shadows; every section the same width and spacing; empty copy words (Descubre, Eleva, Vive la experiencia, Discover, Elevate, Experience). If one is there because it was the easy default rather than the concept's choice, change it and verify again; if the concept earned it, keep it and name it in finish.tellsKept (for example "marquesina: es el programa del circo"). This is your judgement, not a requirement: it never blocks finishing.`;
```

In `apps/api/src/storefront-source/source-design.ts`: delete the local `function fitProse(...) { ... }` (around lines 64–70) and add `import { fitProse } from './source-signature';` to the imports. Its other uses in the file stay as they are.

In `apps/api/src/config/configuration.ts`, next to `yapiSketchFirst`:

```ts
  /** Signature look: planner concepts carry a business-derived signature and the builder self-checks against vibecoded
   *  tells (spec 2026-10-09). Default on; YAPI_SIGNATURE=off returns to the previous prompts and schema. */
  yapiSignature: boolean;
```

and in the values object, after `yapiSketchFirst: process.env.YAPI_SKETCH_FIRST !== 'off',`:

```ts
    yapiSignature: process.env.YAPI_SIGNATURE !== 'off',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-signature.spec.ts src/storefront-source/source-design.spec.ts`
Expected: PASS. `source-design.spec.ts` still passes, which shows the `fitProse` move kept behaviour, including "trims prose slightly past the limit at a sentence".

- [ ] **Step 5: Typecheck and commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

```bash
git add apps/api/src/storefront-source/source-signature.ts apps/api/src/storefront-source/source-signature.spec.ts apps/api/src/storefront-source/source-design.ts apps/api/src/config/configuration.ts
git commit -m "feat(yapi): signature module — a business-derived concept, repaired in code and never failing a plan, plus the YAPI_SIGNATURE switch"
```

---

### Task 2: Concepts carry the signature; beat headlines become optional

**Files:**
- Modify: `apps/api/src/storefront-source/source-design.ts`:
  - `SourceDesignConcept` type, around line 28
  - beats schema, around line 47
  - `validateSourceDesign`, lines ~73–140
- Test: `apps/api/src/storefront-source/source-design.spec.ts`

**Interfaces:**
- Consumes: `normalizeSourceSignature`, `SourceSignature` from Task 1.
- Produces: `SourceDesignConcept.signature?: SourceSignature`. `validateSourceDesign` keeps its signature unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/source-design.spec.ts`:

```ts
describe('signature in concepts', () => {
  const narrativeProposal = () => {
    const value = proposal() as any;
    for (const concept of value.concepts) {
      concept.layout = { sections: ['opening', 'menu', 'visit'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
      concept.story = { promise: 'A clear reason to visit', eyebrow: '', headline: `${concept.name} para compartir hoy`, support: 'Una propuesta breve, clara y basada en los datos del negocio.', primaryAction: 'Ver menú', beats: [
        { section: 'opening', role: 'opening', headline: 'Empieza por una pausa', media: 'hero' },
        { section: 'menu', role: 'offer', headline: 'Elige algo rico', media: 'product' },
        { section: 'visit', role: 'action', headline: 'Encuentra tu momento', media: 'none' },
      ] };
      concept.motion = { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] };
    }
    return value;
  };
  const signature = { idea: 'La tienda es un disco con dos caras.', source: 'Vinilos después de las 20:00.', vocabulary: ['Cara A', 'Cara B'], device: 'Un disco que gira.', carries: ['opening', 'visit'] };

  it('keeps a valid signature on the concept', () => {
    const value = narrativeProposal(); value.concepts[1].signature = signature;
    expect(validateSourceDesign(value, 1, true, true).concepts[1].signature).toEqual(signature);
  });
  it('repairs a broken signature, reports it and still accepts the plan', () => {
    const value = narrativeProposal(); value.concepts[1].signature = { ...signature, carries: ['ghost', 'opening'] };
    value.concepts[2].signature = { ...signature, idea: '' };
    const repairs: string[] = [];
    const checked = validateSourceDesign(value, 1, true, true, { repairs });
    expect(checked.concepts[1].signature!.carries).toEqual(['opening']);
    expect('signature' in checked.concepts[2]).toBe(false);
    expect(repairs).toEqual(expect.arrayContaining(['concepts[1].signature.carries: kept 1 of 2 section IDs', 'concepts[2].signature: no idea, dropped']));
  });
  it('adds no signature key to a concept without one, so saved designs round-trip unchanged', () => {
    const value = narrativeProposal();
    const checked = validateSourceDesign(value, 1, true, true);
    expect(checked.concepts.some(concept => 'signature' in concept)).toBe(false);
    expect(JSON.stringify(validateSourceDesign(JSON.parse(JSON.stringify(checked)), 1, false, false))).toBe(JSON.stringify(checked));
  });
  it('accepts a beat that opens without a headline', () => {
    const value = narrativeProposal(); value.concepts[1].story.beats[2].headline = '';
    expect(validateSourceDesign(value, 1, true, true).concepts[1].story!.beats[2].headline).toBe('');
    delete value.concepts[1].story.beats[2].headline;
    expect(validateSourceDesign(value, 1, true, true).concepts[1].story!.beats[2].headline).toBe('');
    value.concepts[1].story.beats[2].headline = 'x'.repeat(101);
    expect(() => validateSourceDesign(value, 1, true, true)).toThrow('story.beats');
  });
  it('lets the schema send an empty beat headline', () => {
    const beat = (sourceDesignSchema.properties.concepts.items.properties as any).story.properties.beats.items.properties.headline;
    expect(beat).toEqual({ type: 'string', minLength: 0, maxLength: 100 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-design.spec.ts -t "signature in concepts"`
Expected: FAIL. The signature is missing from the result, the empty headline throws `story.beats`, and the schema still has `minLength: 1`.

- [ ] **Step 3: Implement**

In `source-design.ts`:

1. Add to the imports: `import { fitProse, normalizeSourceSignature, type SourceSignature } from './source-signature';` (merge with the `fitProse` import from Task 1).
2. Extend the concept type:
   ```ts
   export type SourceDesignConcept = Record<(typeof fields)[number], string> & { layout?: SourceDesignLayout; story?: SourceStoryPlan; motion?: SourceMotionChoreography; dna?: SourceDesignDna; composition?: SourceCompositionPlan; signature?: SourceSignature };
   ```
3. In `sourceDesignSchema`, in the **beats item** properties only (not `story.headline`), change `headline: { type: 'string', minLength: 1, maxLength: 100 }` to `headline: { type: 'string', minLength: 0, maxLength: 100 }`.
4. In `validateSourceDesign`, next to `const short = ...`, add:
   ```ts
   // A beat may open with its content or device instead of a heading (spec 2026-10-09): empty or absent is valid.
   const optionalShort = (text: unknown, max: number) => text === undefined || (typeof text === 'string' && text.trim().length <= max);
   ```
   In the beats check, replace `|| !short(beat?.headline, 100)` with `|| !optionalShort(beat?.headline, 100)`.
   In the `result.story = { ... beats: story.beats.map(...) }` mapping, replace `headline: beat.headline.trim()` with `headline: String(beat.headline ?? '').trim()`.
5. After the composition block (`if (dnaOptions.requireComposition || concept.composition !== undefined) { ... }`) and before `return result;`, add:
   ```ts
   // The signature is direction, never a reason to reject three finished concepts: repaired in code and reported.
   if (concept.signature !== undefined) {
     const normalized = normalizeSourceSignature(concept.signature, result.layout?.sections, `concepts[${index}]`);
     if (normalized.signature) result.signature = normalized.signature;
     dnaOptions.repairs?.push(...normalized.repairs);
   }
   ```

- [ ] **Step 4: Run the whole file**

Run: `cd apps/api && npx jest src/storefront-source/source-design.spec.ts`
Expected: PASS (new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-design.ts apps/api/src/storefront-source/source-design.spec.ts
git commit -m "feat(yapi): concepts keep a repaired signature; a section beat may open without a headline"
```

---

### Task 3: The planner asks for a signature (switchable)

**Files:**
- Modify: `apps/api/src/storefront-source/source-design-planner.ts`:
  - `explore` input type, ~lines 20–27
  - `conceptsSchema` clone, ~line 30
  - prompt, ~line 36
- Test: `apps/api/src/storefront-source/source-design-planner.spec.ts`

**Interfaces:**
- Consumes: `SOURCE_SIGNATURE_SCHEMA`, `SOURCE_SIGNATURE_PLANNING` (Task 1). `validateSourceDesign` already normalises signatures (Task 2).
- Produces: `SourceDesignPlanner.explore(input)` accepts `signature?: boolean` (absent = on).

- [ ] **Step 1: Write the failing tests**

Append to `source-design-planner.spec.ts` (it already defines `concepts`, `input()` and `afterEach(restoreAllMocks)`):

```ts
import { SOURCE_SIGNATURE_PLANNING } from './source-signature';

const completed = (value: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));

describe('signature planning', () => {
  it('asks for a signature on each concept by default and keeps the one returned', async () => {
    const signature = { idea: 'El menú es un disco.', source: 'Noches de vinilo.', vocabulary: ['Cara A'], device: 'Un disco.', carries: ['menu', 'ghost'] };
    const withSignature = concepts.map(concept => ({ ...concept, signature }));
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts: withSignature, selection: { index: 2, rationale: 'Cafetería con vinilos.' } }));
    const request = { ...input(), repairs: [] as string[] };
    const result = await new SourceDesignPlanner().explore(request);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const item = body.text.format.schema.properties.concepts.items;
    expect(item.required).toContain('signature');
    expect(item.properties.signature.required).toEqual(['idea', 'source', 'vocabulary', 'device', 'carries']);
    expect(body.input[0].content[0].text).toContain(SOURCE_SIGNATURE_PLANNING);
    expect(result.concepts[2].signature!.carries).toEqual(['menu']);
    expect(request.repairs).toContain('concepts[2].signature.carries: kept 1 of 2 section IDs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends exactly the previous schema and prompt when the switch is off', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts, selection: { index: 2, rationale: 'x' } }));
    await new SourceDesignPlanner().explore({ ...input(), signature: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const item = body.text.format.schema.properties.concepts.items;
    expect(item.required).not.toContain('signature');
    expect(item.properties).not.toHaveProperty('signature');
    expect(body.input[0].content[0].text).not.toContain('SIGNATURE.');
  });
  it('accepts a plan whose model omitted the signature without spending the repair', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts, selection: { index: 2, rationale: 'x' } }));
    const result = await new SourceDesignPlanner().explore(input());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.concepts.some(concept => 'signature' in concept)).toBe(false);
  });
});
```

Before writing these, check how existing tests in this file shape the mocked response (`{ concepts, selected }` vs `{ concepts, selection }`) and match it. The planner reads `candidate.selection.index`. `input()` sets `selected: 2`, so either shape resolves to index 2.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-design-planner.spec.ts -t "signature planning"`
Expected: FAIL. The schema has no `signature` and the prompt lacks `SIGNATURE.`.

- [ ] **Step 3: Implement**

In `source-design-planner.ts`:

1. Import: `import { SOURCE_SIGNATURE_PLANNING, SOURCE_SIGNATURE_SCHEMA } from './source-signature';`
2. Add to the `explore` input type, after `narrative?: boolean;`:
   ```ts
       /** Signature look (spec 2026-10-09); false is the YAPI_SIGNATURE=off switch. */
       signature?: boolean;
   ```
3. After `const narrative = input.narrative !== false;` add `const signature = input.signature !== false;`.
4. After the `if (!narrative) { ... }` block that edits `conceptsSchema`, add:
   ```ts
       if (signature) {
         conceptsSchema.items.properties.signature = SOURCE_SIGNATURE_SCHEMA;
         conceptsSchema.items.required.push('signature');
       }
   ```
5. In the `prompt` template, change `${SOURCE_COMPOSITION_PLAN_DIRECTION}\nYou are planning only.` to `${SOURCE_COMPOSITION_PLAN_DIRECTION}\n${signature ? `${SOURCE_SIGNATURE_PLANNING}\n` : ''}You are planning only.`

- [ ] **Step 4: Run the whole planner file**

Run: `cd apps/api && npx jest src/storefront-source/source-design-planner.spec.ts`
Expected: PASS. Existing tests still pass; they never assert the full schema, only `required` at the top level.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-design-planner.ts apps/api/src/storefront-source/source-design-planner.spec.ts
git commit -m "feat(yapi): the design planner grows each concept's signature from the business; off with YAPI_SIGNATURE=off"
```

---

### Task 4: The builder carries the signature and self-checks (creative runs only)

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.ts`:
  - `storefrontDirection`, lines ~9–17
  - `agentInstructions`, line 20 and step 5, line ~30
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`:
  - near `const autoRepairs` (~line 630): read the switch
  - planner call (~line 663): pass `signature`
  - after the "Implement this committed concept literally" assignment (~line 684): append the task line
  - `agentInstructions(...)` call (~line 1229): pass the switch
- Test: `apps/api/src/storefront-source/agent/agent-prompt.spec.ts`

**Interfaces:**
- Consumes: `SOURCE_SIGNATURE_BUILDING`, `SOURCE_TELLS_SELF_CHECK`, `sourceSignatureTaskLine` (Task 1). `explore({ signature })` (Task 3).
- Produces: `agentInstructions(stablePrompt, sitePurpose, isNew, creative = isNew, minutes = 6, signature = true)`. A new optional 6th positional parameter; existing callers are unchanged.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('agent instructions', ...)` in `agent/agent-prompt.spec.ts`:

```ts
  it('gives new stores and redesigns the signature direction and the advisory tells check', () => {
    const creative = agentInstructions('CONTRATOS', 'shop', true, true);
    expect(creative).toContain('SIGNATURE. When the selected concept has a signature');
    expect(creative).toContain('weigh the habits that make generated sites look generated');
    expect(creative).toContain('it never blocks finishing');
    const redesign = agentInstructions('CONTRATOS', 'service', false, true);
    expect(redesign).toContain('SIGNATURE.');
  });
  it('leaves local edits exactly as before', () => {
    const local = agentInstructions('CONTRATOS', 'shop', false, false);
    expect(local).not.toContain('SIGNATURE.');
    expect(local).not.toContain('look generated');
  });
  it('drops both additions when the switch is off', () => {
    const off = agentInstructions('CONTRATOS', 'shop', true, true, 6, false);
    expect(off).not.toContain('SIGNATURE.');
    expect(off).not.toContain('look generated');
    expect(off).toContain('REFERENCE-LED DESIGN');
    expect(agentInstructions('CONTRATOS', 'shop', true, true, 12, false)).toContain('12 minutes');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement the prompt**

In `agent/agent-prompt.ts`:

1. Import: `import { SOURCE_SIGNATURE_BUILDING, SOURCE_TELLS_SELF_CHECK } from '../source-signature';`
2. Change `function storefrontDirection(sitePurpose: SourceSitePurpose)` to `function storefrontDirection(sitePurpose: SourceSitePurpose, signature: boolean)`. Add `${signature ? `\n${SOURCE_SIGNATURE_BUILDING}` : ''}` immediately before the final line `Review the first screen and the path to the main action...`. Put it at the end of the preceding line's template text, so the existing lines keep their wording.
3. Change the signature to `export function agentInstructions(stablePrompt: string, sitePurpose: SourceSitePurpose, isNew: boolean, creative = isNew, minutes = 6, signature = true)`. Change `${creative ? storefrontDirection(sitePurpose) : ''}` to `${creative ? storefrontDirection(sitePurpose, signature) : ''}`.
4. In step 5 (the line starting `5. Call screenshot at 1280 and at 390 and look at them:`), append at the end of that line, inside the template: `${creative && signature ? ` ${SOURCE_TELLS_SELF_CHECK}` : ''}`

- [ ] **Step 4: Run the prompt tests**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts src/storefront-source/source-product-card-prompt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire the generation service**

In `source-generation.service.ts`:

1. Import: `import { sourceSignatureTaskLine } from './source-signature';`
2. Directly after `const autoRepairs: string[] = [];` (~line 630) add:
   ```ts
       // Signature look (spec 2026-10-09). Off restores the previous planner schema and builder prompts.
       const signatureOn = this.config.get<boolean>('app.yapiSignature') !== false;
   ```
3. In the planner call `await this.designPlanner.explore({ model, provider, apiKey, selected: exploration.selected, sitePurpose, narrative: narrativePlanning, ... })` (~line 663), add `signature: signatureOn,` next to `narrative: narrativePlanning,`.
4. Directly after the statement that starts `taskPrompt = \`Implement this committed concept literally.` (~line 684), add:
   ```ts
           taskPrompt += sourceSignatureTaskLine(chosen, signatureOn);
   ```
5. In the `agentInstructions(...)` call (~line 1229), change the trailing arguments `sitePurpose, isNew, isNew || redesign, runLimits.wallMs / 60_000)` to `sitePurpose, isNew, isNew || redesign, runLimits.wallMs / 60_000, signatureOn)`.

- [ ] **Step 6: Typecheck and run the service tests**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/storefront-source/source-generation.service.spec.ts`
Expected: tsc clean. In jest, the only failure allowed is the pre-existing fingerprint test. Before this task, run `git stash; npx jest src/storefront-source/source-generation.service.spec.ts; git stash pop` once and record its failing test names. After this task the set must be identical.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-prompt.ts apps/api/src/storefront-source/agent/agent-prompt.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): the builder carries the concept's signature and weighs vibecoded tells in its screenshot step, on new stores and redesigns only"
```

---

### Task 5: `finish.tellsKept`, recorded on the run's agent attempt

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-tools.ts`:
  - finish tool definition, line ~71
  - `AgentToolbox` fields near line 79
  - `case 'finish'`, ~line 393–406
- Modify: `apps/api/src/storefront-source/source-design-planner.ts:15` (`DesignPlanningAttempt` type)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (after `autoRepairs.push(...toolbox.repairs);`, ~line 1236)
- Test: `apps/api/src/storefront-source/agent/agent-tools.spec.ts`

**Interfaces:**
- Consumes: `signatureOn` (Task 4, same function scope in the service).
- Produces:
  - `AgentToolbox.tellsKept: string[]` (default `[]`)
  - `recordTellsKept(attempts: Array<{ phase?: string; tellsKept?: string[] }>, tells: string[]): void`
  - `DesignPlanningAttempt.tellsKept?: string[]`

- [ ] **Step 1: Write the failing tests**

In `agent/agent-tools.spec.ts`, add `recordTellsKept` to the existing import from `./agent-tools`. Inside the `describe` that holds `refuses finish until a clean verify ran after the last edit`, add the following. It reuses that file's `toolbox()`, `edit()` and the same verify sequence the neighbouring test uses to reach a clean draft; copy that sequence exactly from the neighbouring test.

```ts
  it('keeps the tells the builder chose to keep, bounded, without changing finished', async () => {
    const box = toolbox();
    // Reach a clean, verified draft exactly as 'refuses finish until a clean verify ran after the last edit' does.
    await box.run('edit_file', edit('Un respiro', 'Tu calma'));
    await box.run('verify', '{}');
    const tells = ['marquesina: es el programa del circo', '', 'x'.repeat(200), 'a', 'b', 'c', 'd', 'e', 'f'];
    expect((await box.run('finish', JSON.stringify({ summary: 'Cambié el título', sections: ['Portada'], status: 'completed', remaining: [], tellsKept: tells }))).output).toBe('ok');
    expect(box.finished).toEqual({ summary: 'Cambié el título', sections: ['Portada'] });
    expect(box.tellsKept).toEqual(['marquesina: es el programa del circo', 'x'.repeat(120), 'a', 'b', 'c', 'd']);
  });
  it('finishes without tellsKept exactly as before', async () => {
    const box = toolbox();
    await box.run('edit_file', edit('Un respiro', 'Tu calma'));
    await box.run('verify', '{}');
    expect((await box.run('finish', finish)).output).toBe('ok');
    expect(box.tellsKept).toEqual([]);
  });
  it('declares tellsKept on the finish tool', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'finish')!;
    expect((tool.parameters as any).properties.tellsKept).toEqual({ type: 'array', items: { type: 'string' } });
  });

describe('recordTellsKept', () => {
  it('puts the tells on the last agent attempt only, and does nothing when empty', () => {
    const attempts: Array<{ phase?: string; tellsKept?: string[] }> = [{ phase: 'design' }, { phase: 'agent' }, { phase: 'agent' }, { phase: 'review' }];
    recordTellsKept(attempts, []);
    expect(attempts.some(a => a.tellsKept)).toBe(false);
    recordTellsKept(attempts, ['marquesina: circo']);
    expect(attempts[2].tellsKept).toEqual(['marquesina: circo']);
    expect(attempts[1].tellsKept).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-tools.spec.ts`
Expected: FAIL. `recordTellsKept` is not exported and `tellsKept` is undefined.

- [ ] **Step 3: Implement**

In `agent/agent-tools.ts`:

1. Finish tool (line ~71): add `tellsKept: { type: 'array', items: text }` to its properties. Change the description to `'Termina: resumen para el comercio (español, 1–3 frases), la lista de secciones construidas y, si aplica, tellsKept (hábitos de sitio generado que mantuviste a propósito; puede ir vacío).'`
2. Next to `finished: { summary: string; sections: string[] } | null = null;` add:
   ```ts
     /** Spec 2026-10-09: the builder's own note on generated-site habits it kept on purpose. For evaluation only. */
     tellsKept: string[] = [];
   ```
3. In `case 'finish'`, directly after the line that assigns `this.finished = { summary: ..., sections: ... };` (the completed path), add:
   ```ts
           this.tellsKept = Array.isArray(args.tellsKept) ? args.tellsKept.map((tell: unknown) => String(tell).trim().slice(0, 120)).filter(Boolean).slice(0, 6) : [];
   ```
4. Export the helper (top level, near the other exports):
   ```ts
   /** Writes the builder's kept tells onto the run's last agent attempt, which is persisted with the generation. */
   export function recordTellsKept(attempts: Array<{ phase?: string; tellsKept?: string[] }>, tells: string[]) {
     if (!tells.length) return;
     const last = [...attempts].reverse().find(attempt => attempt.phase === 'agent');
     if (last) last.tellsKept = tells;
   }
   ```

In `source-design-planner.ts:15`, add `tellsKept?: string[];` to the `DesignPlanningAttempt` type, after `selectionSource?: ...`.

In `source-generation.service.ts`, add `recordTellsKept` to the existing import from `./agent/agent-tools`, then directly after `autoRepairs.push(...toolbox.repairs);` add:

```ts
        if (signatureOn) recordTellsKept(attempts, toolbox.tellsKept);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd apps/api && npx jest src/storefront-source/agent && npx tsc --noEmit -p tsconfig.json`
Expected: PASS and no type errors. The finish schema change also reaches `agent-model-anthropic.ts`; its spec must still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-tools.ts apps/api/src/storefront-source/agent/agent-tools.spec.ts apps/api/src/storefront-source/source-design-planner.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): finish.tellsKept records which generated-site habits the builder kept on purpose, saved on the agent attempt"
```

---

### Task 6: Tell report in the evaluation script

**Files:**
- Create: `apps/api/src/storefront-source/source-signature-report.ts`
- Create: `apps/api/src/storefront-source/source-signature-report.spec.ts`
- Modify: `apps/api/scripts/evaluate-yapi-agent.ts`: add a helper next to `specificityOf`, and print it after the `especificidad:` line (~line 95)

**Interfaces:**
- Consumes: `sourceEyebrowSections` (`source-design.ts`), `SOURCE_DESIGN_FILE` (`source-design.ts`), `SourceSignature` (Task 1).
- Produces: `signatureTellReport(files: SourceProjectFileDto[], signature?: SourceSignature): SignatureTellReport`, where
  `SignatureTellReport = { eyebrowSections: number; marquee: boolean; topRevealClass: { name: string; uses: number } | null; fonts: string[]; vocabularyFound: string[]; vocabularyMissing: string[] }`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/storefront-source/source-signature-report.spec.ts`:

```ts
import { signatureTellReport } from './source-signature-report';

const files = [
  { path: 'components/home.tsx', content: `<main><section className="reveal"><p className="eyebrow">Hecho cerca</p><h2>Cara A</h2></section><section className="reveal"><h2>Tracklist</h2></section><section className="reveal"><div className="marquee">café · vinilo</div></section></main>` },
  { path: 'styles/globals.css', content: `.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.2em} body{font-family:"Space Grotesk",sans-serif} h2{font-family:'Fraunces',serif} .x{font-family:var(--display)}` },
  { path: 'assets/a.webp', content: 'AAAA', encoding: 'base64' as const },
];

it('counts the tells a reviewer would see and checks the signature vocabulary', () => {
  const report = signatureTellReport(files as any, { idea: 'Un disco.', source: '', vocabulary: ['Cara A', 'Cara B', 'Tracklist'], device: '', carries: [] });
  expect(report.eyebrowSections).toBe(1);
  expect(report.marquee).toBe(true);
  expect(report.topRevealClass).toEqual({ name: 'reveal', uses: 3 });
  expect(report.fonts).toEqual(['Space Grotesk', 'Fraunces']);
  expect(report.vocabularyFound).toEqual(['Cara A', 'Tracklist']);
  expect(report.vocabularyMissing).toEqual(['Cara B']);
});

it('reports cleanly without a signature or markup', () => {
  expect(signatureTellReport([], undefined)).toEqual({ eyebrowSections: 0, marquee: false, topRevealClass: null, fonts: [], vocabularyFound: [], vocabularyMissing: [] });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-signature-report.spec.ts`
Expected: FAIL with "Cannot find module './source-signature-report'".

- [ ] **Step 3: Implement the report**

`apps/api/src/storefront-source/source-signature-report.ts`:

```ts
/** REPORTING ONLY (spec 2026-10-09 live evaluation): counts vibecoded tells in a candidate's source and whether the
 * signature's vocabulary landed. Never a gate, never rewrites anything. */
import { sourceEyebrowSections } from './source-design';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceSignature } from './source-signature';

export type SignatureTellReport = { eyebrowSections: number; marquee: boolean; topRevealClass: { name: string; uses: number } | null; fonts: string[]; vocabularyFound: string[]; vocabularyMissing: string[] };

const CLASS_ATTRIBUTE = /class(?:Name)?=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const REVEAL = /\b((?:reveal|fade|blur-in|slide-up|rise)[\w-]*|animate-[\w-]+)\b/g;

export function signatureTellReport(files: SourceProjectFileDto[], signature?: SourceSignature): SignatureTellReport {
  const text = files.filter(file => file.encoding !== 'base64');
  const markup = text.filter(file => /\.(html|tsx|jsx)$/.test(file.path)).map(file => file.content).join('\n');
  const css = text.filter(file => file.path.endsWith('.css')).map(file => file.content).join('\n');
  const reveals = new Map<string, number>();
  for (const attribute of markup.matchAll(CLASS_ATTRIBUTE)) {
    for (const match of (attribute[1] ?? attribute[2] ?? attribute[3] ?? '').matchAll(REVEAL)) reveals.set(match[1], (reveals.get(match[1]) ?? 0) + 1);
  }
  const top = [...reveals].sort((a, b) => b[1] - a[1])[0];
  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
    .map(match => match[1].split(',')[0].trim().replace(/^['"]|['"]$/g, ''))
    .filter(name => name && !name.startsWith('var(') && !['inherit', 'initial', 'unset'].includes(name)))];
  const lower = markup.toLowerCase();
  const vocabulary = signature?.vocabulary ?? [];
  return {
    eyebrowSections: sourceEyebrowSections(files),
    marquee: /marquee/i.test(markup + css),
    topRevealClass: top ? { name: top[0], uses: top[1] } : null,
    fonts,
    vocabularyFound: vocabulary.filter(word => lower.includes(word.toLowerCase())),
    vocabularyMissing: vocabulary.filter(word => !lower.includes(word.toLowerCase())),
  };
}
```

If `eyebrowSections` comes out other than 1 for the fixture, check `EYEBROW_CLASS`/`eyebrowCssClasses` in `source-design.ts`. Adjust the fixture's eyebrow markup to what that existing detector recognises (for example its `eyebrow` class with the small uppercase CSS), never the detector.

- [ ] **Step 4: Print it in the evaluation script**

In `apps/api/scripts/evaluate-yapi-agent.ts`:

1. Imports:
   ```ts
   import { SOURCE_DESIGN_FILE } from '../src/storefront-source/source-design';
   import { signatureTellReport } from '../src/storefront-source/source-signature-report';
   ```
2. Next to `specificityOf`, add:
   ```ts
   /** The selected concept's signature and the tells in the built source. REPORTING ONLY. */
   function tellsOf(candidate: any) {
     const files = Array.isArray(candidate?.files) ? candidate.files : [];
     let signature;
     try { const design = JSON.parse(files.find((file: { path: string }) => file.path === SOURCE_DESIGN_FILE)?.content ?? 'null'); signature = design?.concepts?.[design.selected]?.signature; } catch { signature = undefined; }
     return { signature, report: signatureTellReport(files, signature) };
   }
   ```
3. Directly after the `if (specificity) console.log(...)` line, add:
   ```ts
         const tells = tellsOf(result.candidate);
         console.log(`  firma: ${tells.signature ? `${tells.signature.idea} · vocabulario en página ${tells.report.vocabularyFound.length}/${tells.signature.vocabulary.length}` : 'ninguna'}`);
         console.log(`  señas: eyebrows ${tells.report.eyebrowSections} · marquesina ${tells.report.marquee ? 'sí' : 'no'} · reveal ${tells.report.topRevealClass ? `${tells.report.topRevealClass.name}×${tells.report.topRevealClass.uses}` : 'ninguno'} · fuentes ${tells.report.fonts.join(', ') || '—'} · mantuvo: ${attempts.flatMap((a: any) => a.tellsKept ?? []).join(' | ') || '—'}`);
   ```

- [ ] **Step 5: Run the test and typecheck the script**

Run: `cd apps/api && npx jest src/storefront-source/source-signature-report.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS. If `scripts/` is outside `tsconfig.json`, also run `npx tsc --noEmit --skipLibCheck --esModuleInterop --experimentalDecorators --emitDecoratorMetadata --target es2022 --module commonjs scripts/evaluate-yapi-agent.ts`. Expect no errors in the lines you added.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/source-signature-report.ts apps/api/src/storefront-source/source-signature-report.spec.ts apps/api/scripts/evaluate-yapi-agent.ts
git commit -m "feat(yapi): evaluation prints the chosen signature, its vocabulary on the page, and the vibecoded tells in each candidate"
```

---

### Task 7: Full suite, then the live before/after (owner approval required)

**Files:** none changed. Output goes to `.yapi-evaluation/signature-2026-10-09/`.

- [ ] **Step 1: Full API unit suite**

Run: `cd apps/api && npx jest 2>&1 | tail -40`
Expected: all green except the failures recorded in Task 4 Step 6 (the pre-existing fingerprint test). Report any other failure with its output and fix it before continuing.

- [ ] **Step 2: Stop and ask the owner**

The live runs spend the owner's ChatGPT plan (about 12 minutes per run, 6 runs). The evaluation script needs port 3001 free, but the owner's dev API is on 3001 right now, and stopping it changes their live app. Ask in chat, with these numbers, and wait for an explicit yes. Do not continue without it.

- [ ] **Step 3: Look up the three stores (read-only query)**

Known from the dev DB on 2026-10-09:
- Estudio Eje: `bench2-pilates` = `cmuw8byt300539ra8a4ngk3oy`
- Cafetería Ruta 7: `bench2-coffee` = `cmuw8bvy900019ra84cyl5bio`
- Both belong to merchant `cmuh0eezs000411tlde879610`.

The second pilates store, `pilts` (slug `z3pfb0nc`), needs its id and merchant. Get them read-only:

```bash
cd apps/api && node --env-file=.env -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.store.findFirst({where:{slug:'z3pfb0nc'},select:{id:true,merchantId:true,name:true}}).then(r=>{console.log(r);return p.\$disconnect()})"
```

- [ ] **Step 4: Run each store with the switch off, then on**

Use the same instruction for both runs of a store. Each instruction asks for a full redesign and supplies a distinct, concrete story:

- Estudio Eje: `Rediseña toda la tienda desde cero. Estudio Eje abrió en 2019 en una antigua imprenta de Sopocachi; Carla, la dueña, fue bailarina del Ballet Oficial quince años y da ella misma las clases de reformer. Grupos de máximo seis personas.`
- pilts: `Rediseña toda la tienda desde cero. pilts nació en la terraza de Mariana en Equipetrol durante la pandemia; hoy tiene cuatro reformer frente a los árboles y clases al amanecer con café al terminar.`
- Cafetería Ruta 7: `Rediseña toda la tienda desde cero. Cafetería Ruta 7 está en el kilómetro 7 de la carretera a los Yungas; los camioneros paran aquí desde 1994. Don Efraín tuesta café de Caranavi en casa y los domingos hay salteñas.`

For each store (`<S>` = slug label, `<STORE>`/`<MERCHANT>` = ids, `<TEXT>` = its instruction):

```bash
cd apps/api && mkdir -p ../../.yapi-evaluation/signature-2026-10-09
YAPI_SIGNATURE=off npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --merchant <MERCHANT> --store <STORE> --engine agent --runs 1 --instruction "<TEXT>" --shot ../../.yapi-evaluation/signature-2026-10-09/<S>-off.jpg --candidate-out ../../.yapi-evaluation/signature-2026-10-09/<S>-off --i-accept-costs | tee ../../.yapi-evaluation/signature-2026-10-09/<S>-off.log
npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --merchant <MERCHANT> --store <STORE> --engine agent --runs 1 --instruction "<TEXT>" --shot ../../.yapi-evaluation/signature-2026-10-09/<S>-on.jpg --candidate-out ../../.yapi-evaluation/signature-2026-10-09/<S>-on --i-accept-costs | tee ../../.yapi-evaluation/signature-2026-10-09/<S>-on.log
```

The script never saves or publishes; candidates stay on disk. Check the `on` log for a planner attempt (phase `design`) and a `firma:` line. If the redesign did not reach the planner, the instruction was not read as a redesign: report it, do not rephrase silently.

- [ ] **Step 5: Report to the owner**

Put the desktop screenshots side by side, off vs on per store, and include a table per run:

- status
- seconds
- model calls
- the `firma:` line
- the `señas:` line

Pass criteria from the spec:
- finish rate and failures no worse
- `on` wall time within ~15% of `off`
- the owner judges the `on` stores less vibecoded, and the two pilates stores clearly different from each other

If anything fails, recommend `YAPI_SIGNATURE=off` in `apps/api/.env` and describe what to adjust. Do not tune prompts without the owner.
