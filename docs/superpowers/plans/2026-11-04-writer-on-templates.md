# Home writer on chosen templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New stores start on one of the owner's twelve templates, and the Oct 30 home writer (on the strongest model, with a visual review) writes the home inside that template; merchants no longer pick the model.

**Architecture:** The template pick is narrowed to a configured pool. After a pooled template is applied, the chat queues the home writer instead of the section library. The writer detects a template store from `store-data` (`variants.theme`), keeps the template's footer and fonts, may place the template's tested sections through `<LibraryHome layout={…} />`, and before saving runs up to two review rounds on its own model over the last check's captures. A writer that cannot save hands the store to the section library. The Studio hides the model select unless the API says the picker is on; the API forces `auto` for merchant messages without it.

**Tech Stack:** NestJS (apps/api), TypeScript, Jest (+ Playwright captures inside writer tests), Studio (apps/merchant-studio, vanilla TS), store templates (packages/store-templates).

**Spec:** `docs/superpowers/specs/2026-11-04-writer-on-templates-design.md`

## Global Constraints

- Pool ids (exact): `sorbo,shrine,broadcast,calma,paloalto,symmetry,focal,alacena,gumdrop,motion,tacon,pecas`.
- `YAPI_TEMPLATE_POOL` empty → today's behaviour, unchanged.
- Único (`ONE_PRODUCT_TEMPLATE`) still wins for stores with 1–2 products.
- Template stores: the writer changes only `components/home.tsx` and the five colours; footer and fonts are the template's.
- Writer defaults: model `gpt-5.6-sol`, reasoning `high`, limits `{ toolCalls: 40, wallMs: 900_000, screenshots: 8 }` (×2 wall on the ChatGPT plan).
- Review: same model as the writer, at most 2 rounds, blocking problems only from the fixed list; a review that errors never blocks.
- Writer failure on a template store → section library follow-up (never the demo home).
- Merchant model: `auto` unless `YAPI_MODEL_PICKER=1`.
- Repo rules (owner memory): never run the whole API jest suite with default workers — run single spec files with `--runInBand`; never `tsc --noEmit` without `--incremental false`; never `sed -i` on API source files; saving `apps/api/src` restarts `nest --watch` and kills a running YAPI job, so check no job is RUNNING before editing; start the stack with `pnpm dev:chatgpt`.
- Spanish strings for merchants and the model; plain words, no technical terms in merchant-facing text.

## Review Focus

1. A pool id that is misspelled or not a pickable template (e.g. `palo-alto`) — expect it to be ignored, not to empty the pick; if the whole pool resolves to nothing, behave as if no pool is set. → Task 1 test.
2. A store whose `store-data` lacks `variants` or has `theme: 'none'` (Esencial) — expect the Oct 30 writer exactly (footer tool offered, fonts free). → Task 2 test.
3. The reviewer model answering with text and no `report` call, or invalid JSON — expect no problems (save proceeds), never a crash or a block. → Task 4 test.
4. The writer calls `finish` again right after a review found problems, without changing anything — expect a refusal that repeats the problems, not a second review of the same draft. → Task 4 test.
5. A merchant posting `model: 'claude-opus-5-5'` with the picker off — expect `auto` to reach `send()`; internal follow-ups (writer on sol) keep their model. → Task 6 test.

---

### Task 1: Template pool

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type block ~146–154, values ~544–548)
- Modify: `apps/api/src/storefront-source/source-template-pick.ts` (add after `randomPick`, ~line 74)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`pickStoreTemplate`, ~476–481)
- Test: `apps/api/src/config/configuration.spec.ts`, `apps/api/src/storefront-source/source-template-pick.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Produces: `app.yapiTemplatePool: string[]`; `inTemplatePool<T extends { id: string }>(templates: readonly T[], pool: readonly string[], keep?: readonly string[]): T[]`

- [ ] **Step 1: Write the failing tests**

In `source-template-pick.spec.ts` add (import `inTemplatePool` with the others):

```ts
describe('template pool (spec 2026-11-04 writer on templates §1)', () => {
  const list = [{ id: 'sorbo' }, { id: 'grano' }, { id: 'unico' }, { id: 'tacon' }];
  it('keeps only pooled templates, plus the ones always kept', () => {
    expect(inTemplatePool(list, ['sorbo', 'tacon'], ['unico']).map(t => t.id)).toEqual(['sorbo', 'unico', 'tacon']);
  });
  it('an empty pool changes nothing', () => {
    expect(inTemplatePool(list, []).map(t => t.id)).toEqual(['sorbo', 'grano', 'unico', 'tacon']);
  });
  it('a pool that matches nothing behaves as no pool (a typo never empties the pick)', () => {
    expect(inTemplatePool(list, ['palo-alto']).map(t => t.id)).toEqual(['sorbo', 'grano', 'unico', 'tacon']);
  });
  it('every id of the owner\'s pool is a real template', () => {
    const { templateManifest } = require('@pagosya/store-templates');
    for (const id of 'sorbo,shrine,broadcast,calma,paloalto,symmetry,focal,alacena,gumdrop,motion,tacon,pecas'.split(',')) expect(templateManifest(id)?.id).toBe(id);
  });
});
```

In `configuration.spec.ts` add a describe next to the home writer one:

```ts
describe('template pool', () => {
  const original = process.env.YAPI_TEMPLATE_POOL;
  afterEach(() => { if (original === undefined) delete process.env.YAPI_TEMPLATE_POOL; else process.env.YAPI_TEMPLATE_POOL = original; });
  it('reads a comma list, trimmed and lower-cased, empty when unset', () => {
    delete process.env.YAPI_TEMPLATE_POOL;
    expect(configuration().app.yapiTemplatePool).toEqual([]);
    process.env.YAPI_TEMPLATE_POOL = ' Sorbo, tacon ,,pecas';
    expect(configuration().app.yapiTemplatePool).toEqual(['sorbo', 'tacon', 'pecas']);
  });
});
```

In `source-chat-master.spec.ts`, inside `describe('YAPI picks the themed template for a new store …')`, add:

```ts
  it('with a pool, YAPI is offered only the pooled templates (Shrine Pro included) and Único stays for one product', async () => {
    config.set('app.yapiTemplatePool', ['sorbo', 'shrine', 'tacon']);
    const pickTemplate = jest.fn().mockResolvedValue({ id: 'sorbo', reason: 'Bebidas de la casa.' });
    withPick(pickTemplate);
    await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
    expect(pickTemplate.mock.calls[0][1].templates.map((template: { id: string }) => template.id).sort()).toEqual(['shrine', 'sorbo', 'tacon']);
    config.set('app.yapiTemplatePool', []);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-pick.spec.ts src/config/configuration.spec.ts --runInBand`
Expected: FAIL — `inTemplatePool is not a function`, `yapiTemplatePool` undefined.
Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts -t "with a pool" --runInBand`
Expected: FAIL — the offered templates include `grano`, `mordisco`…

- [ ] **Step 3: Implement**

`configuration.ts` — type block after `yapiTemplateRandom: string;`:

```ts
  /** Spec 2026-11-04 writer on templates §1: the owner's chosen templates (YAPI_TEMPLATE_POOL, comma list); empty = every template. */
  yapiTemplatePool: string[];
```

values block after `yapiTemplateRandom: …,`:

```ts
    yapiTemplatePool: [...new Set((process.env.YAPI_TEMPLATE_POOL ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean))],
```

`source-template-pick.ts` after `randomPick`:

```ts
/** Spec 2026-11-04 writer on templates §1 (owner: «sorbo, shrine pro, broadcast…»): a new store's template comes only from the
 *  owner's pool; `keep` (Único for one-product stores) always stays. A pool that matches none of these is ignored, so a typo
 *  in YAPI_TEMPLATE_POOL never leaves YAPI with nothing to pick. */
export function inTemplatePool<T extends { id: string }>(templates: readonly T[], pool: readonly string[], keep: readonly string[] = []): T[] {
  if (!pool.length || !templates.some(template => pool.includes(template.id))) return [...templates];
  return templates.filter(template => pool.includes(template.id) || keep.includes(template.id));
}
```

`source-chat.service.ts` — in `pickStoreTemplate`, replace the `hidden` line, the `oneProduct` line and the `templates` line with:

```ts
    const pool = this.config.get<string[]>('app.yapiTemplatePool') ?? [];
    // A pool that names Shrine Pro shows it; without a pool the Shrine pair stays hidden until the owner turns it on.
    const hidden = pool.length || this.config.get<boolean>('app.yapiShrineTemplates') === true ? new Set<string>() : new Set(['shrine', 'shrine2']);
    // Owner 2026-11-02 (Brisa Portátil: one AliExpress product got Conecta, a big tech catalogue): a store selling one or two products
    // starts on Único — the product whole at the top; a larger catalogue never gets it.
    const oneProduct = input.products.length > 0 && input.products.length <= 2;
    const templates = inTemplatePool(pickableTemplates(listTemplates(), hidden), pool, [ONE_PRODUCT_TEMPLATE])
      .filter(template => template.id !== input.exclude && (oneProduct || template.id !== ONE_PRODUCT_TEMPLATE));
```

Add `inTemplatePool` to the existing import from `./source-template-pick`. `config.get('app.yapiTemplatePool')` is `undefined` in specs that never set it; the `?? []` covers that.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-pick.spec.ts src/config/configuration.spec.ts --runInBand && npx jest src/storefront-source/source-chat-master.spec.ts -t "YAPI picks the themed template" --runInBand`
Expected: PASS (the «all» draw test still passes: no pool set there).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/configuration.spec.ts apps/api/src/storefront-source/source-template-pick.ts apps/api/src/storefront-source/source-template-pick.spec.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(templates): YAPI_TEMPLATE_POOL narrows the first-build pick to the owner's templates (spec 2026-11-04)"
```

---

### Task 2: The writer inside a template

**Files:**
- Modify: `apps/api/src/storefront-source/agent/home-writer-tools.ts`
- Modify: `apps/api/src/storefront-source/source-home-writer-stage.ts`
- Test: `apps/api/src/storefront-source/agent/home-writer-tools.spec.ts`, `apps/api/src/storefront-source/source-home-writer-stage.spec.ts`

**Interfaces:**
- Produces (home-writer-tools.ts): `type WriterTemplate = { id: string; name: string; layout: unknown[] }`; `homeWriterTools(opts: { footer: boolean }): readonly AgentToolDefinition[]`; `templateFonts(globalsCss: string): { heading: string; body: string } | null`; `templateBrief(template: WriterTemplate): string`; `HomeWriterToolbox` ctx gains `template?: WriterTemplate`.
- Produces (source-home-writer-stage.ts): `writerTemplate(files: readonly SourceProjectFileDto[]): WriterTemplate | null`; `homeWriterInstructions(opts?: { template?: string }): string`; `runHomeWriterLoop` input gains `template?: WriterTemplate`.

Fixture used by the tests (a real Sorbo store, as the Único specs build theirs):

```ts
const resolved = resolvePresetTemplate(templateManifest('sorbo')!, templateManifest);
const sorbo = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
// verified 2026-11-04: theme 'sorbo', 8 layout blocks, theme-block fonts dm-sans + space-mono, Shell with one <Footer />
```

- [ ] **Step 1: Write the failing tests**

In `home-writer-tools.spec.ts` (add `homeWriterTools, templateFonts` to the tools import, `resolvePresetTemplate` to the `../source-templates` import, `SOURCE_FONT_CATALOG` from `../source-font-catalog`):

```ts
// Spec 2026-11-04 writer on templates §2–3: inside a themed template the footer and fonts are the template's.
describe('HomeWriterToolbox on a template store (Sorbo)', () => {
  let sorbo: Awaited<ReturnType<typeof templateDemoRevision>>;
  beforeAll(async () => {
    const resolved = resolvePresetTemplate(templateManifest('sorbo')!, templateManifest);
    sorbo = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
  });
  const template = { id: 'sorbo', name: 'Sorbo', layout: [{ type: 'cover-split', title: 'Tómate un sorbo', photo: 'slot:in-p1' }, { type: 'products-slider', title: 'Los más pedidos', link: 'products' }] };
  const sorboBox = () => new HomeWriterToolbox({ workspace: new AgentWorkspace(sorbo.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base: sorbo, gate: async () => null, template });

  it('offers no footer tool', () => {
    expect(homeWriterTools({ footer: false }).map(t => t.name)).toEqual(['read_chassis', 'write_home', 'set_tokens', 'check', 'screenshot', 'finish']);
    expect(homeWriterTools({ footer: true }).map(t => t.name)).toContain('write_footer');
  });
  it('read_chassis names the template, its tested sections with an example each, and how to place them', async () => {
    const out = (await sorboBox().run('read_chassis', '{}')).output;
    expect(out).toContain('PLANTILLA Sorbo');
    expect(out).toContain("import { LibraryHome } from './library'");
    expect(out).toContain('- cover-split: {"type":"cover-split","title":"Tómate un sorbo","photo":"slot:in-p1"}');
    expect(out).not.toContain('PIE (');
  });
  it('set_tokens keeps the template\'s fonts whatever fonts it is given', async () => {
    const b = sorboBox();
    const before = templateFonts(b.workspace.read('styles/globals.css'));
    expect(before).toEqual({ heading: 'dm-sans', body: 'space-mono' });
    const other = SOURCE_FONT_CATALOG.find(font => font.id !== before!.heading && font.id !== before!.body)!.id;
    const out = (await b.run('set_tokens', JSON.stringify({ paper: '#fbf8f2', ink: '#1d2a22', muted: '#efe7da', accent: '#2f6b4a', deep: '#1f3a2b', heading: other, body: other }))).output;
    expect(out).toMatch(/^Colores guardados\. Las fuentes son de la plantilla Sorbo/);
    expect(templateFonts(b.workspace.read('styles/globals.css'))).toEqual(before);
  });
  it('write_footer is refused', async () => {
    expect((await sorboBox().run('write_footer', JSON.stringify({ content: 'export default function StoreFooter() { return <footer />; }' }))).output).toBe('Esta tienda usa el pie de su plantilla; no escribas uno.');
  });
});
```

(If the Sorbo theme block lists its faces in the other order, set the `before` expectation to what `templateFonts` returns on the untouched fixture — the point of the test is that it does not change.)

In `source-home-writer-stage.spec.ts` add (imports: `writerTemplate, homeWriterInstructions` from `./source-home-writer-stage`; `templateManifest, templateSourceFiles` from `@pagosya/store-templates`; `resolvePresetTemplate, templateDemoRevision` from `./source-templates`):

```ts
describe('writer on a template (spec 2026-11-04)', () => {
  jest.setTimeout(120_000);
  it('reads the template from store-data: id, name and its filled layout', async () => {
    const resolved = resolvePresetTemplate(templateManifest('sorbo')!, templateManifest);
    const sorbo = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
    const found = writerTemplate(sorbo.files);
    expect(found).toMatchObject({ id: 'sorbo', name: 'Sorbo' });
    expect(found!.layout).toHaveLength(8);
  });
  it('an Esencial store (no theme, or theme none) is not a template store', async () => {
    const esencial = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial'));
    expect(writerTemplate(esencial.files)).toBeNull();
    expect(writerTemplate([{ path: 'components/store-data.tsx', content: 'export const variants = {"theme":"none"} as const;' }] as never)).toBeNull();
    expect(writerTemplate([])).toBeNull();
  });
  it('on a template the instructions never ask for a footer and name the template', () => {
    const text = homeWriterInstructions({ template: 'Sorbo' });
    expect(text).not.toContain('write_footer');
    expect(text).toContain('plantilla Sorbo');
    expect(homeWriterInstructions()).toContain('write_footer');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-tools.spec.ts src/storefront-source/source-home-writer-stage.spec.ts --runInBand`
Expected: FAIL — `homeWriterTools`, `templateFonts`, `writerTemplate` not exported; `homeWriterInstructions` takes no options.

- [ ] **Step 3: Implement — home-writer-tools.ts**

After `FOOTER_PATH`:

```ts
/** Spec 2026-11-04 writer on templates: the themed template the store wears (its id, name and the sections it filled). */
export type WriterTemplate = { id: string; name: string; layout: unknown[] };
```

After `HOME_WRITER_TOOLS`:

```ts
/** On a template store the footer is the template's: no write_footer (spec 2026-11-04 §2). */
export function homeWriterTools(opts: { footer: boolean }): readonly AgentToolDefinition[] {
  return HOME_WRITER_TOOLS.filter(tool => opts.footer || tool.name !== 'write_footer');
}

/** The heading and body faces of the theme block (assets/<id>.ttf, heading first), or null when the block names none. */
export function templateFonts(globalsCss: string): { heading: string; body: string } | null {
  const start = globalsCss.indexOf(MASTER_THEME_START), end = globalsCss.indexOf(MASTER_THEME_END);
  const faces = start >= 0 && end > start ? [...globalsCss.slice(start, end).matchAll(/url\(assets\/([a-z0-9-]+)\.ttf\)/g)].map(match => match[1]) : [];
  return faces.length ? { heading: faces[0], body: faces[1] ?? faces[0] } : null;
}

/** What a template store's home may use besides the kit: the template's tested sections, each with the store's own example.
 *  Library photos resolve «slot:<key>» through store-data photos (library.tsx `slotted`). */
export function templateBrief(template: WriterTemplate): string {
  const examples = template.layout.slice(0, 14).map(block => `- ${String((block as { type?: unknown }).type ?? '')}: ${JSON.stringify(block)}`).join('\n');
  return `PLANTILLA ${template.name}: el encabezado, el menú, el pie, las tarjetas de producto y la ficha de producto son de la plantilla; no los cambies ni los imites. Sus fuentes se quedan; tú eliges los colores.
Secciones probadas de la plantilla — úsalas tal cual, cambia sus textos, o mézclalas con tus propias secciones:
import { LibraryHome } from './library' y <LibraryHome layout={[{ type: 'cover-split', … }]} /> con uno o varios bloques seguidos. Cada bloque va con los campos de su ejemplo.
Fotos de un bloque: "slot:<clave>" con una clave de photos (store-data) o la ruta de un archivo de fotos. Cada foto una sola vez en toda la portada.
Ejemplos (los de esta tienda ahora):
${examples}`;
}
```

Add `MASTER_THEME_END, MASTER_THEME_START` to the `../source-master` import.

Constructor ctx type: add `/** Spec 2026-11-04: the template the store wears; its footer and fonts stay. */ template?: WriterTemplate;`.

In `run()`:
- `write_footer` case, first line:
```ts
          if (this.ctx.template) return { output: 'Esta tienda usa el pie de su plantilla; no escribas uno.' };
```
- `set_tokens` case: replace the two lines `const fonts = …` and `const unknown = …` with:
```ts
          const kept = this.ctx.template ? templateFonts(this.workspace.read(GLOBALS)) : null;
          const fonts = kept ? [kept.heading, kept.body] : [String(args.heading), String(args.body)];
          const unknown = kept ? undefined : fonts.find(id => !SOURCE_FONT_CATALOG.some(font => font.id === id));
```
  and replace the final `return { output: \`Colores y fuentes guardados.…\` }` with:
```ts
          const fixedInk = ink.toLowerCase() !== colours.ink.toLowerCase() ? ` El texto no se leía sobre el fondo; usé ${ink}.` : '';
          return { output: kept ? `Colores guardados. Las fuentes son de la plantilla ${this.ctx.template!.name}; se mantienen.${fixedInk}` : `Colores y fuentes guardados.${fixedInk}` };
```
- `chassis()`: change the first part of the returned array to
```ts
    return [KIT_BRIEF, ...(this.ctx.template ? [templateBrief(this.ctx.template)] : []), ...(this.ctx.animated ? [HOME_MOTION_BRIEF] : []),
      ...(this.ctx.footer && !this.ctx.template ? [FOOTER_BRIEF, templateFooter ? `El pie actual de la plantilla (solo como referencia de los ganchos; el tuyo debe verse distinto):\n${templateFooter}` : ''] : []),
```
  keeping the remaining entries (store-data exports, photos, fonts, home, store-data excerpt) as they are.
- `KIT_BRIEF`: change «el pie lo escribes tú con write_footer» to «el pie lo escribes tú con write_footer, salvo en una tienda con plantilla».

- [ ] **Step 4: Implement — source-home-writer-stage.ts**

Replace `homeWriterInstructions` (the Esencial text stays word for word):

```ts
const HOME_WRITER_RULES = `Estilo (como Amboras): titulares de 72 px o más en escritorio con interlineado apretado, etiquetas pequeñas en mayúsculas (por ejemplo «01 / 04»), una portada amplia donde el texto tiene espacio, bandas del color de la marca, al menos 6 secciones (portada, productos con data-pagosya-catalog, historia, beneficios, preguntas, cierre).
Reglas que bloquean: cada foto una sola vez; nunca 3 fotos o más juntas; nunca una banda oscura (negra) solo con texto — usa una foto real, un fondo claro o el color de la marca; la portada muestra productos (data-pagosya-catalog, o data-pagosya-spotlight con ids reales).
Las bandas de la plantilla se pintan con --es-deep: si es casi negro, dale con set_tokens el color oscuro de la marca (un verde, un vino, un azul), nunca negro.
Los textos van como texto JSX literal (<h1>Deja que el aceite haga lo suyo.</h1>), nunca dentro de arreglos u objetos: así el comercio los edita con doble clic. Español natural; no inventes datos, precios, envíos ni certificaciones.
Productos, precios, fotos y logo vienen de './store-data'. Los consejos de check son opcionales; lo que dice «Debes corregir» no.`;

/** Spec 2026-10-29 §2–3: Amboras's recipe, our rules. Spec 2026-11-04: inside a template, only the home and the colours. */
export function homeWriterInstructions(opts: { template?: string } = {}): string {
  if (opts.template) return `Eres el diseñador de la PORTADA de una tienda pagosYa que usa la plantilla ${opts.template}. Solo cambias ${HOME_PATH} (completo, con write_home) y los colores (set_tokens; las fuentes son de la plantilla y se mantienen).
El encabezado, el menú, el pie, la ficha de producto, el carrito y el checkout son de la plantilla: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis (trae la portada actual y las secciones probadas de la plantilla); escribe la portada entera en una sola llamada; set_tokens con los colores de la marca; check (devuelve lo que debes corregir y las capturas de escritorio y celular); corrige; check; finish. Usa screenshot solo si necesitas otra vista.
Los textos de un bloque de <LibraryHome> van en sus campos; el resto como texto JSX literal.
${HOME_WRITER_RULES}`;
  return `Eres el diseñador de la PORTADA y el PIE de una tienda pagosYa. Solo cambias ${HOME_PATH} (completo, con write_home), ${FOOTER_PATH} (completo, con write_footer) y los colores y fuentes (set_tokens).
El encabezado, el menú, la ficha de producto, el carrito y el checkout son de la plataforma: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis (trae la portada actual); escribe la portada entera en una sola llamada; write_footer con el pie; set_tokens con los colores y las fuentes de la marca; check (devuelve lo que debes corregir y las capturas de escritorio y celular); corrige; check; finish. Usa screenshot solo si necesitas otra vista.
${HOME_WRITER_RULES}`;
}
```

(Compare against the current function: the Esencial branch must equal today's string exactly; adjust `HOME_WRITER_RULES` line breaks so it does.)

Add:

```ts
/** Spec 2026-11-04: the themed template a store wears (store-data variants.theme), with its filled layout; null for Esencial. */
export function writerTemplate(files: readonly SourceProjectFileDto[]): WriterTemplate | null {
  const state = readMasterState(files);
  const theme = String((state.variants as Record<string, unknown> | undefined)?.theme ?? '');
  if (!theme || theme === 'none') return null;
  const manifest = templateManifest(theme);
  return manifest ? { id: manifest.id, name: manifest.name, layout: state.layout } : null;
}
```

(import `templateManifest` from `@pagosya/store-templates`; `homeWriterTools, type WriterTemplate` from `./agent/home-writer-tools`.)

`runHomeWriterLoop`: add `template?: WriterTemplate` to `LoopInput`; pass `...(input.template ? { template: input.template } : {})` into the toolbox ctx; call `runAgent` with `tools: homeWriterTools({ footer: Boolean(input.footer) && !input.template })` and `instructions: homeWriterInstructions(input.template ? { template: input.template.name } : {})`.

`runHomeWriterStage`: after `const master = readMasterState(previousFiles);` add `const template = writerTemplate(previousFiles);`. Footer: compute `const footer = template ? undefined : (saved?.footer ?? …)` — concretely, in the saved branch use `footer: template ? undefined : (saved.footer ?? pickHomeFooter(storeId, recent?.footers ?? [], playful))`, and after `pickHomeDirection({ … })` wrap it as `{ ...pickHomeDirection({ … }), ...(template ? { footer: undefined } : {}) }`. In `homeWriterTask({ … })` pass `avoid: { fonts: template ? [] : [...current fonts expression], papers: … }`. Pass `...(template ? { template } : {})` and `footer: Boolean(choice.footer) && !template` to `runHomeWriterLoop`, and use `homeWriterInstructions(template ? { template: template.name } : {})` inside `sourcePromptCacheKey(…)`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-tools.spec.ts src/storefront-source/source-home-writer-stage.spec.ts --runInBand`
Expected: PASS, including every existing Esencial test (seven tools, footer musts, fonts free).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/agent/home-writer-tools.ts apps/api/src/storefront-source/agent/home-writer-tools.spec.ts apps/api/src/storefront-source/source-home-writer-stage.ts apps/api/src/storefront-source/source-home-writer-stage.spec.ts
git commit -m "feat(writer): inside a template the writer keeps its footer and fonts and may place its tested sections (spec 2026-11-04)"
```

---

### Task 3: Strongest writer settings

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (`yapiHomeWriterModel` default; new `yapiHomeWriterEffort`)
- Modify: `apps/api/src/storefront-source/agent/home-writer-tools.ts` (`HOME_WRITER_LIMITS`)
- Modify: `apps/api/src/storefront-source/source-home-writer-stage.ts` (effort; `homeWriterRunTimeout`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:735` (`runTimeout`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (writer model fallback `'gpt-5.6-terra'` → `'gpt-5.6-sol'`)
- Test: `apps/api/src/config/configuration.spec.ts`, `apps/api/src/storefront-source/source-home-writer-stage.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Produces: `app.yapiHomeWriterEffort: 'low' | 'medium' | 'high'`; `homeWriterRunTimeout(chatgptPlan: boolean): number`; `HOME_WRITER_REVIEW_MS = 360_000`.

- [ ] **Step 1: Write the failing tests**

`configuration.spec.ts` — in the existing home writer test change the default expectation `'gpt-5.6-terra'` to `'gpt-5.6-sol'` (title: «…and runs on sol unless a model is named»; for the named case set `YAPI_HOME_WRITER_MODEL = 'gpt-5.6-terra'` and expect `'gpt-5.6-terra'`), and add:

```ts
  it('reasons high unless YAPI_HOME_WRITER_EFFORT names another level', () => {
    const before = process.env.YAPI_HOME_WRITER_EFFORT;
    delete process.env.YAPI_HOME_WRITER_EFFORT;
    expect(configuration().app.yapiHomeWriterEffort).toBe('high');
    process.env.YAPI_HOME_WRITER_EFFORT = 'medium';
    expect(configuration().app.yapiHomeWriterEffort).toBe('medium');
    process.env.YAPI_HOME_WRITER_EFFORT = 'loud';
    expect(configuration().app.yapiHomeWriterEffort).toBe('high');
    if (before === undefined) delete process.env.YAPI_HOME_WRITER_EFFORT; else process.env.YAPI_HOME_WRITER_EFFORT = before;
  });
```

`source-home-writer-stage.spec.ts`:

```ts
describe('writer limits (spec 2026-11-04 §4)', () => {
  it('40 calls, 15 minutes, 8 screenshots', () => {
    expect(HOME_WRITER_LIMITS).toEqual({ toolCalls: 40, wallMs: 900_000, screenshots: 8 });
  });
  it('the run outlasts the writer\'s wall plus two reviews, twice the wall on the ChatGPT plan', () => {
    expect(homeWriterRunTimeout(false)).toBe(agentRunHeadroom(900_000) + HOME_WRITER_REVIEW_MS);
    expect(homeWriterRunTimeout(true)).toBe(agentRunHeadroom(1_800_000) + HOME_WRITER_REVIEW_MS);
  });
});
```

(imports: `HOME_WRITER_LIMITS` from `./agent/home-writer-tools`, `agentRunHeadroom` from `./agent/agent-loop`, `homeWriterRunTimeout, HOME_WRITER_REVIEW_MS` from `./source-home-writer-stage`.)

`source-chat-master.spec.ts`, `describe('the home page writer')`: in «with the switch on, the polish hands the store to the writer…» change `model: 'gpt-5.6-terra'` to `model: 'gpt-5.6-sol'` (the spec's config map does not set `app.yapiHomeWriterModel`, so the service fallback decides).

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/config/configuration.spec.ts src/storefront-source/source-home-writer-stage.spec.ts --runInBand && npx jest src/storefront-source/source-chat-master.spec.ts -t "home page writer" --runInBand`
Expected: FAIL — default model terra, no effort key, limits 24/360000/4, `homeWriterRunTimeout` missing, follow-up model terra.

- [ ] **Step 3: Implement**

`configuration.ts`: type `yapiHomeWriterEffort: 'low' | 'medium' | 'high';`; values:

```ts
    yapiHomeWriterModel: process.env.YAPI_HOME_WRITER_MODEL || 'gpt-5.6-sol',
    yapiHomeWriterEffort: (['low', 'medium', 'high'] as const).find(level => level === process.env.YAPI_HOME_WRITER_EFFORT) ?? 'high',
```

`home-writer-tools.ts`:

```ts
/** Spec 2026-11-04 §4 (owner: «i dont care if cheap or costly i want good stores»): the strongest settings. */
export const HOME_WRITER_LIMITS = { toolCalls: 40, wallMs: 900_000, screenshots: 8 };
```

`source-home-writer-stage.ts`:

```ts
/** Spec 2026-11-04 §5: room for two visual reviews after the writer's own wall. */
export const HOME_WRITER_REVIEW_MS = 360_000;
/** The generation run's deadline for a home writer run: the writer's wall (twice on the ChatGPT plan), its headroom and the reviews. */
export function homeWriterRunTimeout(chatgptPlan: boolean): number {
  return agentRunHeadroom(HOME_WRITER_LIMITS.wallMs * (chatgptPlan ? 2 : 1)) + HOME_WRITER_REVIEW_MS;
}
```

(import `agentRunHeadroom` alongside `agentWallWithin` from `./agent/agent-loop`). In `runHomeWriterStage` replace the effort line with `const effort = config.get<'low' | 'medium' | 'high'>('app.yapiHomeWriterEffort') ?? 'high';`.

`source-generation.service.ts:735`:

```ts
    const runTimeout = execution?.homeWriter ? homeWriterRunTimeout(chatgptPlan) : sep5Author ? 900_000 : agentEngine ? agentRunHeadroom(agentLimits(chatgptPlan).wallMs) : 240_000;
```

(import `homeWriterRunTimeout` from `./source-home-writer-stage`).

`source-chat.service.ts` (~1589): change the writer model fallback `?? 'gpt-5.6-terra'` to `?? 'gpt-5.6-sol'`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/api && npx jest src/config/configuration.spec.ts src/storefront-source/source-home-writer-stage.spec.ts src/storefront-source/agent/home-writer-tools.spec.ts --runInBand && npx jest src/storefront-source/source-chat-master.spec.ts -t "home page writer" --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config apps/api/src/storefront-source/agent/home-writer-tools.ts apps/api/src/storefront-source/source-home-writer-stage.ts apps/api/src/storefront-source/source-home-writer-stage.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(writer): sol, high reasoning, 40 calls / 15 min / 8 shots, run deadline covers the reviews (spec 2026-11-04)"
```

---

### Task 4: Visual review before save

**Files:**
- Create: `apps/api/src/storefront-source/agent/home-writer-review.ts`
- Create: `apps/api/src/storefront-source/agent/home-writer-review.spec.ts`
- Modify: `apps/api/src/storefront-source/agent/home-writer-tools.ts` (ctx `reviewer`, `check`, `finish`)
- Modify: `apps/api/src/storefront-source/source-home-writer-stage.ts` (build the reviewer)
- Test: `apps/api/src/storefront-source/agent/home-writer-tools.spec.ts`

**Interfaces:**
- Consumes: `AgentModel`, `AgentModelTurn`, `AgentToolDefinition` from `./agent-loop`.
- Produces: `type HomeReviewer = (images: string[]) => Promise<string[]>`; `createHomeReviewer(model: AgentModel): HomeReviewer`; `readHomeReview(turn: AgentModelTurn): string[]`; `HOME_REVIEW_TOOL`; `HOME_REVIEW_PROBLEMS`; `homeReviewInstructions(): string`; toolbox ctx `reviewer?: HomeReviewer; reviewRounds?: number`; toolbox field `reviews: number`.

- [ ] **Step 1: Write the failing tests**

`home-writer-review.spec.ts`:

```ts
import { createHomeReviewer, HOME_REVIEW_PROBLEMS, HOME_REVIEW_TOOL, readHomeReview } from './home-writer-review';

const call = (args: unknown) => ({ calls: [{ name: 'report', arguments: JSON.stringify(args), callId: 'c1' }] });

describe('home writer review (spec 2026-11-04 §5)', () => {
  it('reads each problem as one line: what, where, how to fix', () => {
    expect(readHomeReview(call({ problemas: [{ problema: HOME_REVIEW_PROBLEMS[0], donde: 'portada', arreglo: 'oscurece la foto o mueve el texto' }] })))
      .toEqual([`${HOME_REVIEW_PROBLEMS[0]} — portada: oscurece la foto o mueve el texto`]);
  });
  it('no report call, bad JSON or an unknown problem kind reads as no problems', () => {
    expect(readHomeReview({ calls: [], text: 'Se ve bien.' })).toEqual([]);
    expect(readHomeReview({ calls: [{ name: 'report', arguments: '{oops', callId: 'c' }] })).toEqual([]);
    expect(readHomeReview(call({ problemas: [{ problema: 'me gusta más azul', donde: 'pie', arreglo: 'azul' }] }))).toEqual([]);
  });
  it('sends both captures as images with the report tool and the review instructions', async () => {
    const model = jest.fn().mockResolvedValue(call({ problemas: [] }));
    expect(await createHomeReviewer(model)(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'])).toEqual([]);
    const input = model.mock.calls[0][0];
    expect(input.tools).toEqual([HOME_REVIEW_TOOL]);
    expect(input.transcript[0].content.filter((part: any) => part.type === 'input_image').map((part: any) => part.image_url)).toEqual(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB']);
  });
});
```

`home-writer-tools.spec.ts` — add (reuses `base`, `nextSourceFile`, `branded`; `GOOD_HOME` is the home string the existing test that reaches «Listo.» writes — read that test and lift its `write_home` content into a shared `const GOOD_HOME` at the top of the file):

```ts
describe('the visual review at finish (spec 2026-11-04 §5)', () => {
  const reviewBox = (reviewer: jest.Mock) => new HomeWriterToolbox({ workspace: new AgentWorkspace(base.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base, gate: async () => null, reviewer });
  const ready = async (b: HomeWriterToolbox) => { await branded(b); await b.run('write_home', JSON.stringify({ content: GOOD_HOME })); await b.run('check', '{}'); return b; };
  const changed = (n: string) => GOOD_HOME.replace('</Shell>', `<p style={{ margin: 0 }}>Gracias ${n}.</p></Shell>`);

  it('problems go back to the writer; finishing unchanged is refused; after a fix the second review passes and it saves', async () => {
    const reviewer = jest.fn().mockResolvedValueOnce(['título tocado o tapado por una imagen — portada: separa el título de la foto']).mockResolvedValueOnce([]);
    const b = await ready(reviewBox(reviewer));
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toMatch(/^Revisión visual — Debes corregir:/);
    expect(reviewer.mock.calls[0][0]).toHaveLength(2);
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toMatch(/^Todavía no corregiste lo que encontró la revisión/);
    expect(reviewer).toHaveBeenCalledTimes(1);
    await b.run('write_home', JSON.stringify({ content: changed('uno') })); await b.run('check', '{}');
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toBe('Listo.');
    expect(reviewer).toHaveBeenCalledTimes(2);
  });
  it('after two rounds the clean draft saves without a third review', async () => {
    const reviewer = jest.fn().mockResolvedValue(['palabras cortadas — portada: acorta el titular']);
    const b = await ready(reviewBox(reviewer));
    await b.run('finish', '{"summary":"x"}');
    await b.run('write_home', JSON.stringify({ content: changed('uno') })); await b.run('check', '{}');
    await b.run('finish', '{"summary":"x"}');
    await b.run('write_home', JSON.stringify({ content: changed('dos') })); await b.run('check', '{}');
    expect((await b.run('finish', '{"summary":"x"}')).output).toBe('Listo.');
    expect(reviewer).toHaveBeenCalledTimes(2);
  });
  it('a review that errors never blocks the save', async () => {
    const b = await ready(reviewBox(jest.fn().mockRejectedValue(new Error('provider down'))));
    expect((await b.run('finish', '{"summary":"x"}')).output).toBe('Listo.');
  });
  it('out of time with a clean draft, it saves even when the last review found problems', async () => {
    const b = await ready(reviewBox(jest.fn().mockResolvedValue(['palabras cortadas — portada: acorta'])));
    await b.run('finish', '{"summary":"x"}');
    expect(await b.acceptIfBuildable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-review.spec.ts --runInBand; npx jest src/storefront-source/agent/home-writer-tools.spec.ts -t "visual review" --runInBand`
Expected: FAIL — module not found; reviewer ignored (finish returns «Listo.» at once).

- [ ] **Step 3: Implement home-writer-review.ts**

```ts
import type { AgentModel, AgentModelTurn, AgentToolDefinition } from './agent-loop';

/** Spec 2026-11-04 §5: the only problems the review may block on (seen on BOXY dvgx25dl/eajm1flt and Láminas kvued320). */
export const HOME_REVIEW_PROBLEMS = [
  'texto difícil de leer sobre una foto',
  'texto claro sobre una foto clara',
  'título tocado o tapado por una imagen',
  'palabras cortadas',
  'imagen vacía o rota',
  'sección que se ve sin terminar',
  'dos secciones que se ven iguales',
] as const;

export const HOME_REVIEW_TOOL: AgentToolDefinition = {
  type: 'function', name: 'report', strict: true,
  description: 'Informa los problemas que bloquean (lista vacía si no hay ninguno).',
  parameters: { type: 'object', additionalProperties: false, required: ['problemas'], properties: { problemas: { type: 'array', maxItems: 6, items: {
    type: 'object', additionalProperties: false, required: ['problema', 'donde', 'arreglo'],
    properties: { problema: { type: 'string', enum: [...HOME_REVIEW_PROBLEMS] }, donde: { type: 'string' }, arreglo: { type: 'string' } } } } } },
};

export function homeReviewInstructions(): string {
  return `Revisas la portada de una tienda antes de publicarla. Recibes dos capturas de página entera: escritorio (1280 px) y celular (390 px).
Informa SOLO estos problemas, cuando se ven claramente: ${HOME_REVIEW_PROBLEMS.join('; ')}.
No opines de gustos, colores, fuentes ni textos. «donde»: la sección (por ejemplo «portada», «tercera sección», «pie»). «arreglo»: una frase concreta.
Si no hay ninguno, llama report con una lista vacía. Llama siempre report.`;
}

export type HomeReviewer = (images: string[]) => Promise<string[]>;

/** The review's answer as lines for the writer; anything unreadable is no problem (a review never blocks by failing). */
export function readHomeReview(turn: AgentModelTurn): string[] {
  const report = turn.calls.find(call => call.name === 'report');
  if (!report) return [];
  try {
    const list = (JSON.parse(report.arguments) as { problemas?: unknown }).problemas;
    return (Array.isArray(list) ? list : []).flatMap(entry => {
      const { problema, donde, arreglo } = (entry ?? {}) as Record<string, unknown>;
      return (HOME_REVIEW_PROBLEMS as readonly string[]).includes(String(problema)) && typeof donde === 'string' && typeof arreglo === 'string'
        ? [`${problema} — ${donde.trim()}: ${arreglo.trim()}`] : [];
    }).slice(0, 6);
  } catch { return []; }
}

export function createHomeReviewer(model: AgentModel): HomeReviewer {
  return async images => readHomeReview(await model({
    instructions: homeReviewInstructions(), tools: [HOME_REVIEW_TOOL],
    transcript: [{ role: 'user', content: [{ type: 'input_text', text: 'Capturas de la portada: primero escritorio, luego celular.' },
      ...images.map(image_url => ({ type: 'input_image', image_url, detail: 'high' }))] }],
  }));
}
```

- [ ] **Step 4: Implement the toolbox side (home-writer-tools.ts)**

Import `type HomeReviewer` from `./home-writer-review`. Ctx type: add `/** Spec 2026-11-04 §5: a look at the captures before saving, at most reviewRounds (2) times. */ reviewer?: HomeReviewer; reviewRounds?: number;`.

Fields: `reviews = 0;` `private lastImages: string[] = [];` `private reviewed: { version: number; problems: string[] } | null = null;`

`check` case: right after the captures loop add `this.lastImages = captures.map(capture => capture.image);`.

`finish` case: after the `draftIsClean` refusal, before `const diagnostic = await this.ctx.gate(…)`:

```ts
          if (this.reviewed?.problems.length && this.reviewed.version === this.workspace.version) {
            return { output: `Todavía no corregiste lo que encontró la revisión:\n- ${this.reviewed.problems.join('\n- ')}\nCorrige, llama check y luego finish.` };
          }
          if (this.ctx.reviewer && this.reviews < (this.ctx.reviewRounds ?? 2)) {
            this.reviews++;
            step('check', 'Revisando cómo se ve');
            const problems = await this.ctx.reviewer(this.lastImages).catch(() => [] as string[]);
            this.reviewed = { version: this.workspace.version, problems };
            if (problems.length) return { output: `Revisión visual — Debes corregir:\n- ${problems.join('\n- ')}\nCorrige con write_home o set_tokens, llama check y luego finish.` };
          }
```

`acceptIfBuildable` stays as it is: a clean last check still ships when time runs out.

- [ ] **Step 5: Build the reviewer in the stage (source-home-writer-stage.ts)**

Give `onTurn` a phase and build both models from one function:

```ts
  const onTurn = (phase: 'home-writer' | 'home-review') => async ({ body, durationMs, status }: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => {
    const tools = [...(Array.isArray(body?.output) ? body.output : []), ...(Array.isArray(body?.content) ? body.content : [])].filter((item: any) => item?.type === 'function_call' || item?.type === 'tool_use').map((item: any) => String(item.name));
    attempts.push({ model: plan.model, phase, durationMs, status, usage: sourceUsage(plan.model, body?.usage), tools });
    await prisma.storeSourceGeneration.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { attempts: attempts as unknown as Prisma.InputJsonValue } });
    await metering?.record(storeId, 'source-generation', plan.model, body, durationMs, status);
  };
  const makeModel = (phase: 'home-writer' | 'home-review') => agentProvider
    ? anthropicAgentModel({ endpoint: agentProvider.endpoint, apiKey: agentProvider.apiKey, model: plan.model, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), signal, onTurn: onTurn(phase) })
    : openAiAgentModel({ endpoint: provider.endpoint, apiKey, model: plan.model, providerName: provider.name, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), reasoningEffort: effort, signal, onTurn: onTurn(phase),
        promptCacheKey: sourcePromptCacheKey(phase, phase === 'home-review' ? homeReviewInstructions() : homeWriterInstructions(template ? { template: template.name } : {}), storeId) });
  const model = makeModel('home-writer');
  const reviewer = createHomeReviewer(makeModel('home-review'));
```

(imports: `createHomeReviewer, homeReviewInstructions, type HomeReviewer` from `./agent/home-writer-review`.) Add `reviewer?: HomeReviewer` to `LoopInput`, pass `reviewer` to `runHomeWriterLoop(…)`, and from there `...(input.reviewer ? { reviewer: input.reviewer } : {})` into the toolbox ctx. If `attempts`' element type rejects the new `'home-review'` phase string, widen the phase union where `SourceGenerationAttempt` is declared (source-generation-types.ts).

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-review.spec.ts src/storefront-source/agent/home-writer-tools.spec.ts src/storefront-source/source-home-writer-stage.spec.ts --runInBand`
Expected: PASS (existing tests build the toolbox without a reviewer, so `finish` behaves as before).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/agent/home-writer-review.ts apps/api/src/storefront-source/agent/home-writer-review.spec.ts apps/api/src/storefront-source/agent/home-writer-tools.ts apps/api/src/storefront-source/agent/home-writer-tools.spec.ts apps/api/src/storefront-source/source-home-writer-stage.ts apps/api/src/storefront-source/source-generation-types.ts
git commit -m "feat(writer): up to two visual reviews on the writer's own model before saving (spec 2026-11-04)"
```

---

### Task 5: Route pooled template stores to the writer

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (~447 first-build follow-up; ~1586–1595 polish follow-up builders; ~1622–1636 writer failure)
- Test: `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Consumes: `app.yapiTemplatePool` (Task 1), `writerTemplate` (Task 2).
- Produces: private `templateWriterOn(templateId: string): boolean`; private `writerFollowUp(revision: number, checklistWords?: string): SourceMessageInput`; private `libraryFollowUp(revision: number, checklistWords?: string): SourceMessageInput`.

- [ ] **Step 1: Write the failing tests**

In `describe('YAPI picks the themed template …')`:

```ts
  it('a pooled template goes to the home writer, not the section library (spec 2026-11-04 §2)', async () => {
    config.set('app.yapiTemplatePool', ['grano', 'sorbo']);
    config.set('app.yapiHomeWriter', true);
    config.set('app.yapiHomeWriterModel', 'gpt-5.6-sol');
    withPick(jest.fn().mockResolvedValue({ id: 'grano', reason: 'Café que tuesta en casa.' }));
    const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
    expect(out.followUp).toMatchObject({ homeWriter: true, firstDesign: true, redesign: true, personalTouch: true, revision: 1, model: 'gpt-5.6-sol' });
    expect(out.followUp.sectionLibrary).toBeUndefined();
    config.set('app.yapiTemplatePool', []);
  });
  it('without a pool the section library fills the template as before', async () => {
    config.set('app.yapiTemplatePool', []);
    withPick(jest.fn().mockResolvedValue({ id: 'grano', reason: 'x' }));
    expect((await send('Mi negocio se llama Café Buna.\nCrea mi tienda.')).followUp).toMatchObject({ sectionLibrary: true });
  });
```

In `describe('the home page writer')`:

```ts
  it('on a template store a writer that fails hands the store to the section library, never leaving the demo home', async () => {
    const templated = { snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [
      { path: 'components/store-data.tsx', content: `${storeData}\nexport const variants = {"theme":"sorbo"} as const;\nexport const layout = [{"type":"cover-split"}] as const;` },
      { path: 'components/home.tsx', content: 'export default function Home() { return 0; }' }, { path: 'components/Shell.tsx', content: shell }, { path: 'styles/globals.css', content: 'body{}' }] } };
    projects.version.mockImplementation(async () => templated);
    generate.mockRejectedValueOnce(new Error('YAPI no pudo terminar la portada: steps'));
    await expect(writer()).rejects.toMatchObject({ followUp: { sectionLibrary: true, revision: 3, checklistWords: 'Café de altura' } });
  });
```

(If `readMasterState` cannot read `variants` written this way, copy the exact `export const variants = …` line format from a real store-data — e.g. print it from the Task 2 Sorbo fixture — into the test.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts -t "pooled template|section library fills|on a template store" --runInBand`
Expected: FAIL — the follow-up is `sectionLibrary`; the failure follow-up is `briefCheck`.

- [ ] **Step 3: Implement**

Private helpers in `SourceChatService` (next to `templatePickOn`):

```ts
  /** Spec 2026-11-04 §2: a template from the owner's pool is written by the home writer, not filled by the section library. */
  private templateWriterOn(templateId: string) {
    const pool = this.config.get<string[]>('app.yapiTemplatePool') ?? [];
    return pool.includes(templateId) && this.config.get<boolean>('app.yapiHomeWriter') === true;
  }
  private writerFollowUp(revision: number, checklistWords?: string): SourceMessageInput {
    return { instruction: `${HOME_WRITER_BRIEF}${checklistWords ? `\n\nMensaje del comercio:\n${checklistWords}` : ''}`, revision, personalTouch: true, homeWriter: true, firstDesign: true, redesign: true,
      ...(checklistWords ? { checklistWords } : {}), requestId: randomUUID(), model: (this.config.get<string>('app.yapiHomeWriterModel') ?? 'gpt-5.6-sol') as SourceMessageInput['model'] };
  }
  private libraryFollowUp(revision: number, checklistWords?: string): SourceMessageInput {
    return { instruction: SECTION_LIBRARY_BRIEF, revision, personalTouch: true, sectionLibrary: true, ...(checklistWords ? { checklistWords } : {}), requestId: randomUUID(), model: 'auto' };
  }
```

Polish branch (~1586–1595): replace the inline `writerFollowUp` and `libraryFollowUp` closures with `const writerFollowUp = (revision: number) => this.writerFollowUp(revision, input.checklistWords);` and `const libraryFollowUp = (revision: number) => this.libraryFollowUp(revision, input.checklistWords);` (the `next` chain is unchanged).

First build (~447): replace the `templatePick ? { instruction: SECTION_LIBRARY_BRIEF, … }` branch so the expression reads:

```ts
    const checklist = this.checklistOn() && userMessage.content.trim() ? userMessage.content.trim().slice(0, 4000) : undefined;
    const followUp: SourceMessageInput | undefined = templatePick
      ? (this.templateWriterOn(templatePick.id) ? this.writerFollowUp(saved.revision, checklist) : this.libraryFollowUp(saved.revision, checklist))
      : written ? { … unchanged … }
```

Writer failure (~1631) — replace the two lines that read `latest` and throw:

```ts
          const latest = await this.projects.current(merchantId, storeId).catch(() => null);
          const revisionNow = latest?.revision ?? current.revision;
          // Spec 2026-11-04 §6: a template store is never left on its demo home — the section library fills it instead.
          const templated = writerTemplate(((previous.snapshot as unknown as SourceProjectSnapshot)?.files ?? []) as SourceProjectFileDto[]);
          throw new PersonalTouchSkipped('home writer kept the template', templated ? this.libraryFollowUp(revisionNow, input.checklistWords) : checkAfter(revisionNow));
```

(import `writerTemplate` from `./source-home-writer-stage`; `SourceProjectFileDto` from `./dto/save-source-project.dto` if not already imported. The library follow-up queues the check after itself, as it does today.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts --runInBand && npx jest src/storefront-source/source-chat-intake.spec.ts --runInBand`
Expected: PASS (intake still expects `sectionLibrary`: no pool set there).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(writer): pooled template stores go to the home writer; a failed writer hands them to the section library (spec 2026-11-04)"
```

---

### Task 6: Model picker only for the owner

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (`yapiModelPicker`)
- Modify: `apps/api/src/storefront-source/source-generation-policy.ts` (`merchantModelChoice`)
- Modify: `apps/api/src/storefront-source/source-projects.controller.ts` (constructor ~30, `message` ~75, `generate` ~111)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:295` (estimate carries `modelPicker`)
- Modify: `apps/merchant-studio/src/api.ts:593` (`SourceGenerationEstimate.modelPicker?: boolean`)
- Modify: `apps/merchant-studio/src/source-studio.ts` (~96 state; ~894 estimate handler; ~912 `generationControls`)
- Test: `apps/api/src/storefront-source/source-generation-policy.spec.ts` (create if it does not exist), `apps/api/src/config/configuration.spec.ts`

**Interfaces:**
- Produces: `app.yapiModelPicker: boolean`; `merchantModelChoice<T extends string | undefined>(model: T, pickerOn: boolean): T | 'auto'`; estimate field `modelPicker: boolean`.

- [ ] **Step 1: Write the failing tests**

`source-generation-policy.spec.ts` (append if the file exists):

```ts
import { merchantModelChoice } from './source-generation-policy';

describe('merchant model choice (spec 2026-11-04 §7)', () => {
  it('without the picker every merchant request is auto', () => {
    expect(merchantModelChoice('claude-opus-5-5', false)).toBe('auto');
    expect(merchantModelChoice('gpt-5.6-luna', false)).toBe('auto');
    expect(merchantModelChoice(undefined, false)).toBe('auto');
  });
  it('with the picker the choice passes through', () => {
    expect(merchantModelChoice('gpt-5.6-sol', true)).toBe('gpt-5.6-sol');
    expect(merchantModelChoice(undefined, true)).toBeUndefined();
  });
});
```

`configuration.spec.ts`:

```ts
describe('model picker', () => {
  it('is off unless YAPI_MODEL_PICKER=1', () => {
    const before = process.env.YAPI_MODEL_PICKER;
    delete process.env.YAPI_MODEL_PICKER;
    expect(configuration().app.yapiModelPicker).toBe(false);
    process.env.YAPI_MODEL_PICKER = '1';
    expect(configuration().app.yapiModelPicker).toBe(true);
    if (before === undefined) delete process.env.YAPI_MODEL_PICKER; else process.env.YAPI_MODEL_PICKER = before;
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-policy.spec.ts src/config/configuration.spec.ts --runInBand`
Expected: FAIL.

- [ ] **Step 3: Implement the API side**

`configuration.ts`: type `/** Spec 2026-11-04 §7: only the owner/dev sees the Studio's model select (YAPI_MODEL_PICKER=1). */ yapiModelPicker: boolean;`; value `yapiModelPicker: process.env.YAPI_MODEL_PICKER === '1',`.

`source-generation-policy.ts`:

```ts
/** Spec 2026-11-04 §7 (owner: «users can choose which model to use, or should i disable that?»): merchants never pick a model;
 *  their requests run on auto and we choose per step. The owner/dev keeps the picker (YAPI_MODEL_PICKER=1). */
export function merchantModelChoice<T extends string | undefined>(model: T, pickerOn: boolean): T | 'auto' {
  return pickerOn ? model : 'auto';
}
```

`source-projects.controller.ts`: add `private readonly config: ConfigService` to the constructor (import `ConfigService` from `@nestjs/config`; the config module is global) and `merchantModelChoice` from `./source-generation-policy`. Only the two merchant entry points change — internal follow-ups never pass through the controller, so the writer keeps sol:

```ts
  message(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() input: SendSourceMessageDto) {
    return this.chat.send(merchant.id, storeId, { ...input, model: merchantModelChoice(input.model, this.config.get<boolean>('app.yapiModelPicker') === true) } as SendSourceMessageDto);
  }
```

Apply the same spread to the DTO passed on by `generate` (~111). If a spec constructs `SourceProjectsController` directly, add a `{ get: () => true }` config stub as the new last argument.

`source-generation.service.ts:295`: add `modelPicker: this.config.get<boolean>('app.yapiModelPicker') === true` to the returned estimate object.

- [ ] **Step 4: Implement the Studio side**

`api.ts:593`: add `modelPicker?: boolean;` to `SourceGenerationEstimate`.

`source-studio.ts`:
- after `let chatgptPlanMode = false;` add `let modelPickerOn = false;`
- in the estimate handler, after the `nextPlanMode` lines:
```ts
        const nextPicker = result.modelPicker === true;
        if (!nextPicker) generationSettings.model = 'auto';
        if (modelPickerOn !== nextPicker) { modelPickerOn = nextPicker; render(); }
```
- `generationControls`: wrap the `<div class="source-generation-fields"><label>Modelo<select …>…</select></label></div>` part as `${modelPickerOn ? '<div class="source-generation-fields">…unchanged…</div>' : ''}` (a template literal inside the existing one), and wrap the sentence «El modelo elegido se usa para generar tu sitio; la conversación usa siempre un modelo económico. Un modelo avanzado vuelve a Auto tras unas horas.» the same way so merchants never read about a model they cannot choose.

- [ ] **Step 5: Run the tests, type-check the Studio, rebuild it**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-policy.spec.ts src/config/configuration.spec.ts --runInBand`
Expected: PASS.
Run: `cd apps/merchant-studio && npx tsc --noEmit --incremental false -p .`
Expected: no errors.
Rebuild the embedded Studio (the dashboard serves `apps/merchant-dashboard/public/studio`; use the build script in `apps/merchant-studio/package.json` that writes there) and confirm files under `public/studio` changed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config apps/api/src/storefront-source/source-generation-policy.ts apps/api/src/storefront-source/source-generation-policy.spec.ts apps/api/src/storefront-source/source-projects.controller.ts apps/api/src/storefront-source/source-generation.service.ts apps/merchant-studio/src apps/merchant-dashboard/public/studio
git commit -m "feat(studio): merchants no longer pick the model; YAPI_MODEL_PICKER=1 keeps it for the owner (spec 2026-11-04)"
```

---

### Task 7: Live test — 5 stores × sol and Opus

**Files:**
- Create (ledger, never under apps/api): `.superpowers/sdd/2026-11-04-writer-on-templates/` — `progress.md`, `livecheck.json`, helper scripts.
- Modify: `apps/api/.env` (copy it first to the ledger folder as `api.env.before`).

- [ ] **Step 1: Prepare**

- Confirm no YAPI job is RUNNING (`StoreSourceChatJob` rows with `status='RUNNING'`: 0).
- Back up `apps/api/.env` to `.superpowers/sdd/2026-11-04-writer-on-templates/api.env.before`.
- In `apps/api/.env` set `YAPI_TEMPLATE_POOL=sorbo,shrine,broadcast,calma,paloalto,symmetry,focal,alacena,gumdrop,motion,tacon,pecas`, `YAPI_HOME_WRITER=1`, `YAPI_HOME_WRITER_MODEL=gpt-5.6-sol`, `YAPI_HOME_WRITER_EFFORT=high`, `YAPI_MODEL_PICKER=1`; remove `YAPI_TEMPLATE_RANDOM` so YAPI picks the best fit. Config is read at API start: restart with `pnpm dev:chatgpt` (a `touch` does not restart the watcher).
- Check the build has the new code: `grep -rl homeWriterRunTimeout apps/api/dist | head -1` prints a file.

- [ ] **Step 2: Arm A (sol)**

For Remolino, Oh Belly, Cuadrízate, BOXY and rhode: clone the catalog of their Oct 30 stores (Remolino 2scg4aek, Oh Belly i20pm2rq, Cuadrízate ryqpc5kg, BOXY t4ugj8u0, rhode 7ow91p75) with `apps/api/scripts/clone-store-catalog.ts` onto the test user, name them «<Store> · plantillas sol», attach the brand photos from the `~/Downloads/<brand>` folders, and send the first message those Oct 30 stores got (read their first USER `StoreAgentMessage`). One store at a time. Record in `livecheck.json`: store id, template picked + reason, revisions, cost by phase (`StoreSourceGeneration.attempts`: `home-writer`, `home-review`), time, review rounds, and whether the writer saved or fell back to the library.

- [ ] **Step 3: Arm B (Opus)**

Set `YAPI_HOME_WRITER_MODEL=claude-opus-5-5`, restart, repeat Step 2 with «· plantillas opus» (bills the Anthropic key; the owner accepted the cost).

- [ ] **Step 4: Comparison page**

Render each new store's latest revision (home top at 1280 and full page) and its Oct 30 counterpart with the read-only renderer used for the revisions page (Nest application context + Playwright, as in `apps/api/scripts/check-store-quality.ts`), and publish one page: per store a row Oct 30 · sol · Opus, the template picked and why, cost, time, review rounds. Give the owner the link; the owner picks the model.

- [ ] **Step 5: Leave the dev env in the chosen state**

Set `YAPI_HOME_WRITER_MODEL` to the owner's pick; keep the pool; write the outcome to the ledger `progress.md` and to memory `project_writer_on_templates.md`.

---

## Self-review notes

- Spec §1 pool → Task 1; §2 writer in template (footer, fonts) → Task 2; §3 building blocks → Task 2 (`templateBrief`); §4 settings → Task 3; §5 review → Task 4; §6 fallback → Task 5; §7 picker → Task 6; Test → Task 7. Shrine visibility and Único → Task 1.
- Review Focus 1 → Task 1 «a pool that matches nothing»; 2 → Task 2 «an Esencial store … is not a template store»; 3 → Task 4 «no report call, bad JSON…»; 4 → Task 4 «finishing unchanged is refused»; 5 → Task 6 (`merchantModelChoice` at the controller only; the writer follow-up's model is set server-side in Task 5).
- Known risk not covered by tests: the ChatGPT-plan bridge's own request limits may stop a 15-minute writer run; Task 7 records any such cut.
