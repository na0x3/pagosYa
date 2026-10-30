# Home Page Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a new Esencial store's polish, a small agent rewrites only its home page and colour/font tokens, Amboras style, with the template home as the automatic fallback.

**Architecture:**
- **Inherits:** the writer is a new follow-up job (`homeWriter`) queued after the polish. It calls `generate()` directly, skipping the chat's conversation call and the design planner. `generate()` routes it to a new lean stage (`runHomeWriterStage`), which inherits the run row, provider, metering, quota retry, acceptance gate and save.
- **Reuses:** the stage drives the existing `runAgent` loop with its own five tools (`HomeWriterToolbox`).
- **Checks:** only a few things block (rendering, missing photos, dead anchors, overflow, invisible text, no products, a photo twice, 3+ photos in a row, black text-only bands); size and length are advice.
- **Fallback:** if the writer fails, the job swallows the error, so revision 2 (template home + polish) stays the store.

**Tech Stack:** NestJS API (`apps/api`), TypeScript, Jest, Playwright sandbox (`withVisualSandbox`), OpenAI Responses agent model (ChatGPT-plan bridge in dev).

**Spec:** `docs/superpowers/specs/2026-10-29-home-page-writer-design.md`

## Global Constraints

- Switch `YAPI_HOME_WRITER`, default off (`=1` turns it on). With it off, nothing changes.
- The writer may change only `components/home.tsx` and the master-theme block in `styles/globals.css`. Shell, product, checkout, catalog pages, account and `components/store-data.tsx` are never written.
- Limits: 24 tool calls, 6-minute wall clock (`360_000` ms), 4 screenshots; reasoning = `app.yapiFirstDesignEffort` (default `low`).
- Model: `app.yapiHomeWriterModel` from `YAPI_HOME_WRITER_MODEL`, default `gpt-5.6-terra`.
- Blocking checks:
  - page errors
  - `Imagen no disponible`
  - `Enlace a sección inexistente`
  - horizontal overflow
  - invisible text
  - unresolved colour variables
  - hidden catalog
  - no product on the home
  - a photo used twice
  - 3+ photos side by side
  - a black/near-black text-only band
- Header/menu errors from the capture (`Encabezado…`) are ignored in this mode.
- Brand-tinted bands are allowed. «Black» means near-neutral (RGB spread < 24) and relative luminance < 0.05.
- Advice, never blocking:
  - largest desktop heading < 72 px
  - fewer than 6 home sections
  - cover text box < 40 % of the cover width
- Words go in as literal JSX text, so Studio inline editing keeps working (`source-visual-edit.ts` treats literal JSX text in `components/*.tsx` as editable fields; checked 2026-10-29).
- Never run the full api jest suite with default workers; run the named spec files only, `--runInBand`.
- Never use `sed -i` on `apps/api/src` files while the stack runs (it stops `nest --watch`); use the Edit tool.
- Subagents never run prisma migrate/diff/reset. This plan needs no migration.
- `tsc` check: `npx tsc --noEmit --incremental false -p tsconfig.json` (plain `--noEmit` breaks the API watcher's buildinfo).

## Review Focus

1. **A store with no photos at all.** The writer must still produce a home that passes (type-led cover), and the `photo twice` / `3+ photos` checks must not fire on an empty list. Test in Task 3.
2. **The model calls `write_home` with a file that drops `<Shell>`.** The workspace refuses it (`SHELL_DROPPED`), and the refusal reaches the model as tool output, not a thrown error. Test in Task 4.
3. **`set_tokens` with a font id not in the catalog, or ink unreadable on paper.** Refused or fixed with the reason, and the globals.css block outside the theme markers stays byte-identical. Test in Task 4.
4. **The writer fails (quota, steps, provider).**
   - A quota failure goes back to the queue (first-design retry).
   - Any other failure leaves revision 2 as the store, with no error message in the chat, and the brief check still runs.

   Test in Task 6.
5. **A long run's transcript.** Only the newest `write_home` keeps its full file; older ones become the fixed stub, and the stub is byte-identical on every later turn (cache-stable). Test in Task 1.

---

### Task 1: The loop takes its own tool list and check tool, and evicts superseded home writes

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-loop.ts`
- Modify: `apps/api/src/storefront-source/agent/agent-tools.ts:24` (AgentToolName union)
- Modify (only if it types `tools` as `typeof AGENT_TOOLS`): `apps/api/src/storefront-source/agent/agent-model-anthropic.ts`
- Test: `apps/api/src/storefront-source/agent/agent-loop.spec.ts`

**Interfaces:**
- Produces:
  - `AgentToolDefinition` (type) = `typeof AGENT_TOOLS[number] | { type: 'function'; name: string; description: string; parameters: object; strict: true }`
  - `AgentModel` input `tools: readonly AgentToolDefinition[]`
  - `AgentLoopToolbox` (type): `{ steps: AgentStep[]; run(name: string, rawArgs: string): Promise<{ output: string; image?: string; images?: string[] }>; draftIsClean(): boolean; lastVerify: { hard?: boolean } | null; finished: unknown; stopped: { summary: string } | null }`
  - `runAgent` input: `toolbox: AgentLoopToolbox`, plus `tools?: readonly AgentToolDefinition[]` (default `AGENT_TOOLS`) and `verifyTool?: string` (default `'verify'`)
  - `AgentToolName` gains `'read_chassis' | 'write_home' | 'set_tokens' | 'check'`
  - `AGENT_HOME_STUB = 'versión anterior de components/home.tsx reemplazada por una más nueva'`

- [ ] **Step 1: Write the failing tests.** Append inside `describe('runAgent', …)` in `agent-loop.spec.ts`, and add `AGENT_HOME_STUB` to its import from `./agent-loop`:

```ts
  describe('custom tools', () => {
    const fn = (name: string) => ({ type: 'function' as const, name, description: name, parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] }, strict: true as const });
    it('offers the given tools and treats the named check tool like verify', async () => {
      const seen: string[][] = [];
      const box = { steps: [], finished: null as unknown, stopped: null, lastVerify: { hard: false } as { hard?: boolean } | null,
        draftIsClean: () => false,
        run: async (name: string) => ({ output: name === 'check' ? 'Consejo: titular pequeño' : 'ok' }) };
      const model: AgentModel = async ({ tools }) => { seen.push(tools.map(t => t.name)); return { calls: [call('check', {})] }; };
      const out = await runAgent({ model, toolbox: box, tools: [fn('check'), fn('finish')], verifyTool: 'check', instructions: 'x', opening: [], limits: { toolCalls: 10, wallMs: 60_000 } });
      expect(seen[0]).toEqual(['check', 'finish']);
      // A soft finding seen twice ships the draft (reason soft), exactly as verify does today.
      expect(out).toEqual({ status: 'limit', reason: 'soft' });
    });
  });

  describe('home writes', () => {
    const write = (id: string, content: string) => ({ type: 'function_call', call_id: id, name: 'write_home', arguments: JSON.stringify({ content }) });
    it('keeps only the newest write_home in full, with a stable stub for older ones', () => {
      const compact = agentTranscriptCompactor(0);
      const t: unknown[] = [{ role: 'user', content: [{ type: 'input_text', text: 'tarea' }] }, write('a', 'A'.repeat(5000)), { type: 'function_call_output', call_id: 'a', output: 'ok' }];
      expect(JSON.stringify(compact(t))).toContain('A'.repeat(5000));
      t.push(write('b', 'B'.repeat(5000)), { type: 'function_call_output', call_id: 'b', output: 'ok' });
      const first = compact(t) as any[];
      expect(first[1].arguments).toBe(JSON.stringify({ content: AGENT_HOME_STUB }));
      expect(first[3].arguments).toContain('B'.repeat(5000));
      t.push({ type: 'function_call_output', call_id: 'x', output: 'later' });
      expect((compact(t) as any[])[1]).toEqual(first[1]);
    });
  });
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-loop.spec.ts -t "custom tools|home writes" --runInBand`
Expected: FAIL. `AGENT_HOME_STUB` is not exported, and `tools`/`verifyTool` are unknown.

- [ ] **Step 3: Implement**

In `agent-tools.ts:24`, append to the union:

```ts
  /* Spec 2026-10-29 home page writer */ | 'read_chassis' | 'write_home' | 'set_tokens' | 'check';
```

In `agent-loop.ts`, replace the `AgentModel` type and add the two types:

```ts
export type AgentToolDefinition = typeof AGENT_TOOLS[number] | { type: 'function'; name: string; description: string; parameters: object; strict: true };
export type AgentModel = (input: { instructions: string; transcript: unknown[]; tools: readonly AgentToolDefinition[] }) => Promise<AgentModelTurn>;
/** What the loop needs from a toolbox: AgentToolbox, or the home writer's (spec 2026-10-29). */
export type AgentLoopToolbox = { steps: AgentStep[]; run(name: string, rawArgs: string): Promise<{ output: string; image?: string; images?: string[] }>; draftIsClean(): boolean; lastVerify: { hard?: boolean } | null; finished: unknown; stopped: { summary: string } | null };
```

In `runAgent`:
- Change the input's `toolbox: AgentToolbox` to `toolbox: AgentLoopToolbox; tools?: readonly AgentToolDefinition[]; verifyTool?: string`.
- Add the two lines and the new `ask`:

```ts
  const tools = input.tools ?? AGENT_TOOLS;
  const verifyTool = input.verifyTool ?? 'verify';
  const ask = () => input.model({ instructions: input.instructions, transcript: compact(transcript), tools: closing ? tools.filter(tool => tool.name === 'finish') : tools });
```

- Replace both `call.name === 'verify'` with `call.name === verifyTool`.
- Keep the `AgentStep` import for the type. `toolbox.lastVerify?.hard` and `toolbox.stopped.summary` already fit the new type.

Add the stub:

```ts
/** Spec 2026-10-29 (home writer): a whole-file write replaced by a newer one is resent as this fixed line. */
export const AGENT_HOME_STUB = 'versión anterior de components/home.tsx reemplazada por una más nueva';
```

In `staleIndexes`, superseded `write_home` calls are stale at once:

```ts
  let latestHome = -1;
  transcript.forEach((item, i) => { if (item.type === 'function_call' && item.name === 'write_home') latestHome = i; });
  return transcript.flatMap((item, i) => (i > 0 && i < latestImage && hasImage(item))
    || (item.type === 'function_call' && item.name === 'write_home' && i < latestHome)
    || (i < transcript.length - 12 && item.type === 'function_call_output' && calls.get(item.call_id) === 'read_file' && typeof item.output === 'string' && item.output.length > 1200) ? [i] : []);
```

In `evicted`, first line:

```ts
  if (item.type === 'function_call') return { ...item, arguments: JSON.stringify({ content: AGENT_HOME_STUB }) };
```

If `agent-model-anthropic.ts` types its `tools` as `typeof AGENT_TOOLS`, change it to `readonly AgentToolDefinition[]` (import the type from `./agent-loop`). `agent-model.ts` already declares `tools: unknown`.

- [ ] **Step 4: Run them to make sure they pass, plus the loop and model specs and tsc**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-loop.spec.ts src/storefront-source/agent/agent-model.spec.ts src/storefront-source/agent/agent-model-anthropic.spec.ts --runInBand`
Expected: PASS.
Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-loop.ts apps/api/src/storefront-source/agent/agent-loop.spec.ts apps/api/src/storefront-source/agent/agent-tools.ts apps/api/src/storefront-source/agent/agent-model-anthropic.ts
git commit -m "feat(yapi): the agent loop takes its own tools and check, and resends only the newest whole home write"
```

---

### Task 2: One theme block from five colours and two catalog fonts

**Files:**
- Modify: `apps/api/src/storefront-source/source-master.ts:83-108`
- Test: `apps/api/src/storefront-source/source-master-theme-block.spec.ts` (new)

**Interfaces:**
- Produces: `masterThemeBlock(colours: Record<MasterColour, string>, headingFont: string, bodyFont: string): string`.
  - It returns the full `MASTER_THEME_START … MASTER_THEME_END` block.
  - It throws `TypeError` for a font id outside `SOURCE_FONT_CATALOG`.
  - It replaces unreadable ink/muted as `masterColours` does.
- `masterThemeCss(settings, look)` output stays byte-identical (it delegates).

- [ ] **Step 1: Write the failing test**

```ts
import { templateManifest } from '@pagosya/store-templates';
import { SOURCE_FONT_IDS } from './source-font-catalog';
import { masterThemeBlock, masterThemeCss, MASTER_THEME_START, MASTER_THEME_END } from './source-master';

describe('masterThemeBlock', () => {
  const [heading, body] = SOURCE_FONT_IDS;
  const colours = { paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33' };
  it('writes the variables and both font faces from catalog ids', () => {
    const block = masterThemeBlock(colours, heading, body);
    expect(block.startsWith(MASTER_THEME_START) && block.endsWith(MASTER_THEME_END)).toBe(true);
    expect(block).toContain('--es-paper:#f4efe6');
    expect(block).toContain('--es-deep:#2f4a33');
    expect(block).toContain(`url(assets/${heading}.ttf)`);
    expect(block).toContain(`url(assets/${body}.ttf)`);
  });
  it('replaces ink that cannot be read on the paper', () => {
    expect(masterThemeBlock({ ...colours, ink: '#f0ebe2' }, heading, body)).not.toContain('--es-ink:#f0ebe2');
  });
  it('refuses a font outside the catalog', () => {
    expect(() => masterThemeBlock(colours, 'comic-sans', body)).toThrow(TypeError);
  });
  it('leaves masterThemeCss unchanged for every palette and font pair', () => {
    const settings = templateManifest('esencial')!.master! as any;
    for (const palette of settings.palettes) for (const pair of settings.fonts) {
      const css = masterThemeCss(settings, { palette: palette.id, fonts: pair.id, colors: {} });
      expect(css).toContain(MASTER_THEME_START);
      expect(css).toContain(`url(assets/${pair.heading}.ttf)`);
    }
  });
});
```

Before Step 3, record the current `masterThemeCss` output for every palette × pair into the scratchpad. The fourth test proves the structure; the byte-identical claim is checked in Step 4 with a one-off node script:

```bash
cd apps/api && npx ts-node -T -e "const {templateManifest}=require('@pagosya/store-templates');const {masterThemeCss}=require('./src/storefront-source/source-master');const s=templateManifest('esencial').master;console.log(JSON.stringify(s.palettes.flatMap(p=>s.fonts.map(f=>masterThemeCss(s,{palette:p.id,fonts:f.id,colors:{}})))))" > "$SCRATCH/theme-before.json"
```

(`$SCRATCH` = this session's scratchpad directory.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-master-theme-block.spec.ts --runInBand`
Expected: FAIL, `masterThemeBlock` is not exported.

- [ ] **Step 3: Implement.** In `source-master.ts`, split the fix-up out of `masterColours` and build both outputs from one block function:

```ts
/** Unreadable ink or muted are replaced; the accent and deep get their own readable text colour. */
function readableColours(merged: Record<MasterColour, string>) {
  const ink = contrastRatio(merged.paper, merged.ink) >= 4.5 ? merged.ink : bestInkFor(merged.paper, merged.ink);
  // The footer, empty cart and hovers put ink on muted: a muted the ink cannot be read on becomes a tint of the paper.
  const muted = contrastRatio(merged.muted, ink) >= 4.5 ? merged.muted : mixHex(merged.paper, ink, 0.06);
  return { ...merged, ink, muted, onAccent: bestInkFor(merged.accent, '#ffffff'), onDeep: bestInkFor(merged.deep, '#ffffff') };
}
```

`masterColours` keeps its lines up to `const merged = …` and ends with `return readableColours(merged);`.

```ts
/** Spec 2026-10-29 (home writer): the theme block from five colours and two catalog fonts. */
export function masterThemeBlock(colours: Record<MasterColour, string>, headingFont: string, bodyFont: string): string {
  const c = readableColours(colours);
  const vars = `:root{--es-paper:${c.paper};--es-ink:${c.ink};--es-muted:${c.muted};--es-accent:${c.accent};--es-deep:${c.deep};--es-on-accent:${c.onAccent};--es-on-deep:${c.onDeep};`
    + `--es-heading:'${catalogFont(headingFont).family}',Georgia,serif;--es-body:'${catalogFont(bodyFont).family}',system-ui,sans-serif;`
    + `--store-background:var(--es-paper);--store-foreground:var(--es-ink);--store-accent:var(--es-accent);--store-accent-foreground:var(--es-on-accent);`
    // Sort & filter styles spec 2026-10-21: kit pages (checkout fallback, info pages) read these, so they show the store's fonts.
    + `--store-heading-font:var(--es-heading);--store-body-font:var(--es-body)}`;
  return [MASTER_THEME_START, face(headingFont), bodyFont !== headingFont ? face(bodyFont) : '', vars, MASTER_THEME_END].filter(Boolean).join('\n');
}

export function masterThemeCss(settings: MasterSettings, look: MasterLook): string {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  const c = masterColours(settings, look);
  return masterThemeBlock({ paper: c.paper, ink: c.ink, muted: c.muted, accent: c.accent, deep: c.deep }, pair.heading, pair.body);
}
```

`readableColours` on already-readable colours returns them unchanged (ink ≥ 4.5 stays; muted ≥ 4.5 against that ink stays), so the delegated output is identical.

- [ ] **Step 4: Run it to make sure it passes, then check byte-identity**

Run: `cd apps/api && npx jest src/storefront-source/source-master --runInBand`
Expected: PASS.
Re-run the Step 1 script into `$SCRATCH/theme-after.json`, then `cmp "$SCRATCH/theme-before.json" "$SCRATCH/theme-after.json"`.
Expected: no output (identical).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-master-theme-block.spec.ts
git commit -m "refactor(esencial): one theme block from five colours and two catalog fonts"
```

---

### Task 3: The writer's page rules and its check verdict

**Files:**
- Create: `apps/api/src/storefront-source/agent/home-writer-checks.ts`
- Modify: `apps/api/src/storefront-source/agent/agent-capture.ts:45` (one optional last parameter)
- Test: `apps/api/src/storefront-source/agent/home-writer-checks.spec.ts`

**Interfaces:**
- Produces:
  - `evaluateHomeWriterRules(): string[]`: browser-side, no imports or closures, run with `page.evaluate`. Lines start with `BLOQUEA: ` or `CONSEJO: `.
  - `homeWriterVerdict(captures: Array<{ width: number; errors: string[] }>): { blocking: string[]; advice: string[] }`
  - `captureAgentDraft(snapshot, width, signal?, entry?, requirements?, profile?, mediaPolicy?, extraChecks: Array<() => string[]> = [])`: each check runs with `page.evaluate` just before the screenshot, and its lines are pushed to `errors`.

- [ ] **Step 1: Write the failing tests**

```ts
import { chromium, type Browser } from 'playwright';
import { evaluateHomeWriterRules, homeWriterVerdict } from './home-writer-checks';

jest.setTimeout(60_000);
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
const rules = async (body: string, width = 1280) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;font-family:sans-serif">${body}</body></html>`);
  const out = await page.evaluate(evaluateHomeWriterRules);
  await page.close();
  return out;
};
const img = (fill: string) => `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23${fill}'/%3E%3C/svg%3E" style="width:300px;height:220px">`;
const product = '<div data-product-id="p1"><a href="product.html?c=p1">Aceite</a></div>';
const blocking = (lines: string[]) => lines.filter(l => l.startsWith('BLOQUEA: '));

describe('evaluateHomeWriterRules', () => {
  it('blocks a near-black band with only words, but not a brand-green one', async () => {
    const black = await rules(`<main><section style="background:#111;color:#fff;height:400px"><h2>Hola</h2></section>${product}</main>`);
    expect(blocking(black).some(l => /banda oscura/i.test(l))).toBe(true);
    const green = await rules(`<main><section style="background:#2d4a2b;color:#fff;height:400px"><h2>Hola</h2></section>${product}</main>`);
    expect(green.some(l => /banda oscura/i.test(l))).toBe(false);
  });
  it('blocks the same photo twice and three photos side by side; product photos do not count', async () => {
    expect(blocking(await rules(`<main><section>${img('111')}</section><section>${img('111')}</section>${product}</main>`)).some(l => /misma foto/i.test(l))).toBe(true);
    expect(blocking(await rules(`<main><section style="display:flex">${img('111')}${img('222')}${img('333')}</section>${product}</main>`)).some(l => /3 fotos o más/i.test(l))).toBe(true);
    expect(blocking(await rules(`<main><div data-pagosya-catalog style="display:flex"><div data-product-id="a">${img('111')}</div><div data-product-id="b">${img('111')}</div><div data-product-id="c">${img('222')}</div></div></main>`))).toEqual([]);
  });
  it('blocks a home with no product; a store with no photos and an empty catalog passes', async () => {
    expect(blocking(await rules('<main><section><h1>Hola</h1></section></main>')).some(l => /ningún producto/i.test(l))).toBe(true);
    expect(blocking(await rules('<main><section><h1 style="font-size:96px">Hola</h1></section><div data-pagosya-catalog></div></main>'))).toEqual([]);
  });
  it('advises on a small headline and a short page at desktop width only', async () => {
    const small = await rules(`<main><section><h1 style="font-size:40px">Hola</h1></section>${product}</main>`);
    expect(small.some(l => l.startsWith('CONSEJO: ') && /72/.test(l))).toBe(true);
    expect(small.some(l => l.startsWith('CONSEJO: ') && /6 secciones/.test(l))).toBe(true);
    expect((await rules(`<main><section><h1 style="font-size:40px">Hola</h1></section>${product}</main>`, 390)).some(l => /72/.test(l))).toBe(false);
  });
});

describe('homeWriterVerdict', () => {
  it('sorts capture errors into blocking and advice, and drops header and soft lines', () => {
    const v = homeWriterVerdict([
      { width: 1280, errors: ['TypeError: x is undefined', 'Encabezado incompleto: menú no se ve. Vuelve a mostrarlo.', 'Imagen no disponible: assets/a.jpg', 'CONSEJO: Usa 6 secciones o más.', 'BLOQUEA: La misma foto aparece dos veces: a.jpg.', 'Texto encima de un botón: a / b. Muévelo para que no se toquen.'] },
      { width: 390, errors: ['Encabezado: el menú del teléfono está cerrado pero se ve.', 'La página desborda horizontalmente.', 'El catálogo está oculto. Mantén visible data-pagosya-catalog.', 'CONSEJO: Usa 6 secciones o más.'] },
    ]);
    expect(v.blocking).toEqual(['(1280) TypeError: x is undefined', '(1280) Imagen no disponible: assets/a.jpg', '(1280) La misma foto aparece dos veces: a.jpg.', '(390) La página desborda horizontalmente.', '(390) El catálogo está oculto. Mantén visible data-pagosya-catalog.']);
    expect(v.advice).toEqual(['Usa 6 secciones o más.']);
  });
});
```

If `playwright` is imported under another name in this repo's API specs (check `git grep -l "from 'playwright" apps/api/src | head -3`), use that import.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-checks.spec.ts --runInBand`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement `home-writer-checks.ts`**

```ts
/* Spec 2026-10-29 home page writer §3: few checks block, the rest is advice. Header and menu lines are dropped: the writer
 * cannot touch the Shell, and Test B (2026-10-29) spent its steps on them. */

/** Runs in the page (page.evaluate): no imports, no closures. Lines start with BLOQUEA: or CONSEJO:. */
export function evaluateHomeWriterRules(): string[] {
  const out: string[] = [];
  const main = document.querySelector('main') || document.body;
  const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel';
  const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 40 && r.height > 40 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
  const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
  const lum = (c: number[]) => [c[0], c[1], c[2]].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const photos = Array.from(main.querySelectorAll('img,video')).filter(el => visible(el) && !el.closest(productish) && !el.closest('header,footer'));

  // A band painted near-black (neutral and dark) that carries only words: owner rule 2026-10-22. Brand colours pass.
  for (const band of Array.from(main.children)) {
    if (!visible(band) || band.matches(productish)) continue;
    const bg = rgb(getComputedStyle(band).backgroundColor);
    if (bg.length < 3 || (bg.length > 3 && bg[3] < 0.5)) continue;
    const neutral = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 24;
    const words = (band.textContent || '').trim();
    if (neutral && lum(bg) < 0.05 && !band.querySelector('img,video,picture') && words) out.push(`BLOQUEA: Banda oscura solo con texto («${words.slice(0, 40)}»). Dale una foto real, un fondo claro o el color de la marca.`);
  }
  // Each photo once.
  const seen = new Map<string, number>();
  for (const el of photos) { const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || ''; if (src) seen.set(src, (seen.get(src) || 0) + 1); }
  for (const [src, count] of seen) if (count > 1) out.push(`BLOQUEA: La misma foto aparece dos veces: ${(src.split('/').pop() || src).slice(0, 60)}. Usa cada foto una sola vez.`);
  // Three or more photos side by side in one container: owner rule 2026-10-15.
  const holder = (el: Element) => (el.closest('figure') ?? el).parentElement;
  const counts = new Map<Element, number>();
  for (const el of photos) { const parent = holder(el); if (parent) counts.set(parent, (counts.get(parent) || 0) + 1); }
  if ([...counts.values()].some(count => count >= 3)) out.push('BLOQUEA: Hay un grupo de 3 fotos o más juntas. Deja como máximo dos fotos juntas.');
  // The home shows products.
  if (!main.querySelector('[data-pagosya-catalog],[data-product-id],[data-pagosya-product],[data-pagosya-spotlight],a[href*="product.html"]')) out.push('BLOQUEA: La portada no muestra ningún producto. Incluye la grilla de productos (data-pagosya-catalog).');

  if (window.innerWidth >= 1000) {
    const sizes = Array.from(main.querySelectorAll('h1,h2')).filter(visible).map(h => parseFloat(getComputedStyle(h).fontSize));
    if (!sizes.length || Math.max(...sizes) < 72) out.push('CONSEJO: El titular más grande mide menos de 72 px en escritorio; Amboras usa titulares de 72 px o más.');
    const sections = Array.from(main.children).filter(visible).length;
    if (sections < 6) out.push(`CONSEJO: La portada tiene ${sections} secciones; usa 6 secciones o más para que la página tenga recorrido.`);
    const h1 = main.querySelector('h1');
    const cover = h1?.closest('section') ?? null;
    const box = h1?.parentElement ?? null;
    if (cover && box && box !== cover && box.getBoundingClientRect().width < 0.4 * cover.getBoundingClientRect().width) out.push('CONSEJO: El texto de la portada ocupa menos del 40 % del ancho; dale más espacio.');
  }
  return out;
}

const HEADER = /^Encabezado/;
const ADVICE = /^CONSEJO: /;
/** Lines from captureAgentDraft that break the page; everything else it reports is ignored in this mode. */
const BLOCKING = [/^BLOQUEA: /, /^Imagen no disponible/, /^Enlace a sección inexistente/, /desborda horizontalmente/, /^Texto casi invisible/, /^Variables de color sin valor/, /^El catálogo está oculto/];
/** The capture's own soft lines (sticky, text over a button, process or catalog copy, illustrations, strips): dropped here. */
const KNOWN_SOFT = /^(?:«|Texto encima|Texto del proceso|Texto permanente|Ilustración|Hay |Evita |Demasiad)/;

/** Capture errors (any width) → what must be fixed and what is only advice. Page script errors (pageerror) block. */
export function homeWriterVerdict(captures: Array<{ width: number; errors: string[] }>): { blocking: string[]; advice: string[] } {
  const blocking: string[] = [], advice: string[] = [];
  for (const { width, errors } of captures) for (const line of errors) {
    if (HEADER.test(line)) continue;
    if (ADVICE.test(line)) { const text = line.replace(ADVICE, ''); if (!advice.includes(text)) advice.push(text); continue; }
    if (BLOCKING.some(rule => rule.test(line)) || (!KNOWN_SOFT.test(line) && /Error\b|is not|undefined|null/.test(line))) blocking.push(`(${width}) ${line.replace(/^BLOQUEA: /, '')}`);
  }
  return { blocking, advice };
}
```

Then read the `evaluateStripRuns` output lines (`source-media-design.ts`) and the other `errors.push` strings in `captureAgentDraft`. Make sure each soft one starts with a prefix in `KNOWN_SOFT` (extend the regex if needed) and that none of them matches the page-error test. Add one `homeWriterVerdict` assertion per real soft string you find. This pins the list.

In `agent-capture.ts`, add the parameter and run the checks just before `const shot = await page.screenshot(…)`:

```ts
export async function captureAgentDraft(snapshot: Awaited<ReturnType<typeof agentPreviewSnapshot>>, width: 1280 | 820 | 390, signal?: AbortSignal, entry = 'index.html', requirements: AgentRequirement[] = [], profile: ValidationProfile = 'normal', mediaPolicy?: SourceMediaPolicy, extraChecks: Array<() => string[]> = []): Promise<AgentShot> {
```

```ts
    // Spec 2026-10-29: the home writer's own page rules.
    for (const check of extraChecks) errors.push(...await page.evaluate(check));
    const shot = await page.screenshot({ type: 'png', fullPage: true, timeout: 12_000 });
```

- [ ] **Step 4: Run them to make sure they pass, plus the capture spec**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-checks.spec.ts src/storefront-source/agent/agent-capture --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/agent/home-writer-checks.ts apps/api/src/storefront-source/agent/home-writer-checks.spec.ts apps/api/src/storefront-source/agent/agent-capture.ts
git commit -m "feat(yapi): the home writer's page rules — few that block, the rest advice"
```

---

### Task 4: The writer's toolbox

**Files:**
- Create: `apps/api/src/storefront-source/agent/home-writer-tools.ts`
- Test: `apps/api/src/storefront-source/agent/home-writer-tools.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `AgentLoopToolbox`, `AgentToolDefinition`
  - from Task 2: `masterThemeBlock`
  - from Task 3: `evaluateHomeWriterRules`, `homeWriterVerdict`, the `captureAgentDraft` `extraChecks` parameter
  - existing: `AgentWorkspace` (`write`, `read`, `files`, `changedPaths`, `version`), `agentPreviewSnapshot`, `withMasterTheme`, `SOURCE_FONT_CATALOG`
- Produces:
  - `HOME_PATH = 'components/home.tsx'`
  - `HOME_WRITER_LIMITS = { toolCalls: 24, wallMs: 360_000, screenshots: 4 }`
  - `HOME_WRITER_TOOLS: readonly AgentToolDefinition[]` (names in order: `read_chassis`, `write_home`, `set_tokens`, `check`, `screenshot`, `finish`)
  - `class HomeWriterToolbox implements AgentLoopToolbox`, built with `new HomeWriterToolbox({ workspace, base, gate, signal? })`, where `gate: (files) => Promise<string | null>` returns null when saveable and a diagnostic otherwise
  - members:
    - `workspace`
    - `steps`
    - `lastVerify: { version; clean; hard } | null`
    - `finished: { summary: string } | null`
    - `stopped: null`
    - `run(name, rawArgs)`
    - `draftIsClean()`
    - `acceptIfBuildable(): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

```ts
import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { MASTER_THEME_END, MASTER_THEME_START } from '../source-master';
import { AgentWorkspace } from './agent-workspace';
import { HomeWriterToolbox, HOME_PATH, HOME_WRITER_TOOLS } from './home-writer-tools';

jest.setTimeout(240_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial')); });
const box = (gate: () => Promise<string | null> = async () => null) => {
  const authored = base.files.filter(f => nextSourceFile(f.path));
  return new HomeWriterToolbox({ workspace: new AgentWorkspace(authored, { redesign: true, lockedShell: true }), base, gate });
};
const tokens = (font: string) => JSON.stringify({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33', heading: font, body: font });

describe('HomeWriterToolbox', () => {
  it('offers exactly the six tools', () => {
    expect(HOME_WRITER_TOOLS.map(t => t.name)).toEqual(['read_chassis', 'write_home', 'set_tokens', 'check', 'screenshot', 'finish']);
  });
  it('read_chassis names the kit parts, the store data, the fonts and the current home', async () => {
    const out = (await box().run('read_chassis', '{}')).output;
    expect(out).toContain('data-pagosya-catalog');
    expect(out).toContain('./store-data');
    expect(out).toMatch(/fuentes: [a-z0-9-]+ \(/);
    expect(out).toContain(`--- ${HOME_PATH} ---`);
  });
  it('write_home replaces the home, and a home without <Shell> is refused as output', async () => {
    const b = box();
    const home = b.workspace.read(HOME_PATH);
    expect((await b.run('write_home', JSON.stringify({ content: home.replace('export default function Home', 'export default function Home /* nuevo */') }))).output).toMatch(/^Portada escrita y compilada/);
    expect(b.workspace.changedPaths()).toEqual([HOME_PATH]);
    expect((await b.run('write_home', JSON.stringify({ content: 'export default function Home() { return <main>hola</main>; }' }))).output).toMatch(/Shell/);
    expect(b.workspace.read(HOME_PATH)).toContain('/* nuevo */');
  });
  it('write_home reports a compile error as output', async () => {
    const out = (await box().run('write_home', JSON.stringify({ content: `import Shell from './Shell';\nexport default function Home() { return <Shell><main>{nope(</main></Shell>; }` }))).output;
    expect(out).toMatch(/no compila/);
  });
  it('set_tokens rewrites only the theme block, and refuses an unknown font without changing anything', async () => {
    const b = box();
    const before = b.workspace.read('styles/globals.css');
    expect((await b.run('set_tokens', tokens('comic-sans'))).output).toMatch(/no está en el catálogo/);
    expect(b.workspace.read('styles/globals.css')).toBe(before);
    const font = (await b.run('read_chassis', '{}')).output.match(/fuentes: ([a-z0-9-]+) \(/)![1];
    expect((await b.run('set_tokens', tokens(font))).output).toMatch(/^Colores y fuentes guardados/);
    const after = b.workspace.read('styles/globals.css');
    expect(after).toContain('--es-paper:#f4efe6');
    expect(after.split(MASTER_THEME_START).length).toBe(2);
    const rest = (css: string) => css.slice(css.indexOf(MASTER_THEME_END));
    expect(rest(after)).toBe(rest(before));
  });
  it('check on the template home has nothing blocking; finish goes through the gate', async () => {
    const b = box();
    expect((await b.run('finish', JSON.stringify({ summary: 'x' }))).output).toMatch(/llama check/);
    expect((await b.run('check', '{}')).output).not.toMatch(/Debes corregir/);
    expect(b.draftIsClean()).toBe(true);
    expect((await b.run('finish', JSON.stringify({ summary: 'Nueva portada.' }))).output).toMatch(/^Listo/);
    expect(b.finished).toEqual({ summary: 'Nueva portada.' });
    const refused = box(async () => 'El build falló: x');
    await refused.run('check', '{}');
    expect((await refused.run('finish', JSON.stringify({ summary: 's' }))).output).toContain('El build falló');
    expect(refused.finished).toBeNull();
  });
  it('stops screenshots after four', async () => {
    const b = box();
    for (let i = 0; i < 4; i++) expect((await b.run('screenshot', JSON.stringify({ width: 390 }))).image).toBeTruthy();
    expect((await b.run('screenshot', JSON.stringify({ width: 390 }))).output).toMatch(/No quedan capturas/);
  });
  it('acceptIfBuildable ships a changed draft whose last check was clean, and nothing else', async () => {
    const untouched = box();
    await untouched.run('check', '{}');
    expect(await untouched.acceptIfBuildable()).toBe(false);
    const b = box();
    await b.run('write_home', JSON.stringify({ content: b.workspace.read(HOME_PATH).replace('export default function Home', 'export default function Home /* y */') }));
    expect(await b.acceptIfBuildable()).toBe(false);
    await b.run('check', '{}');
    expect(await b.acceptIfBuildable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-tools.spec.ts --runInBand`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement `home-writer-tools.ts`**

```ts
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { masterThemeBlock, withMasterTheme } from '../source-master';
import type { AgentLoopToolbox, AgentToolDefinition } from './agent-loop';
import { agentPreviewSnapshot, captureAgentDraft, type AgentPreviewBase } from './agent-capture';
import type { AgentStep } from './agent-tools';
import type { AgentWorkspace } from './agent-workspace';
import { evaluateHomeWriterRules, homeWriterVerdict } from './home-writer-checks';

/* Spec 2026-10-29 home page writer: Amboras's recipe on the locked Esencial chassis — one home file and the tokens. */
export const HOME_PATH = 'components/home.tsx';
export const HOME_WRITER_LIMITS = { toolCalls: 24, wallMs: 360_000, screenshots: 4 };
const GLOBALS = 'styles/globals.css';
const strictTool = (name: string, description: string, properties: Record<string, object>): AgentToolDefinition =>
  ({ type: 'function', name, description, parameters: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) }, strict: true });
const text = { type: 'string' };
const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

export const HOME_WRITER_TOOLS: readonly AgentToolDefinition[] = [
  strictTool('read_chassis', 'Lee lo que la portada puede usar: partes del kit, datos de la tienda (store-data), fotos, fuentes y la portada actual.', {}),
  strictTool('write_home', 'Escribe components/home.tsx COMPLETO (reemplaza el archivo). Mantén <Shell>. Los textos van como texto JSX literal.', { content: text }),
  strictTool('set_tokens', 'Fija los 5 colores de la tienda (hex) y dos fuentes del catálogo (ids de read_chassis).', { paper: hex, ink: hex, muted: hex, accent: hex, deep: hex, heading: text, body: text }),
  strictTool('check', 'Comprueba la portada en escritorio y celular: lo que debes corregir y los consejos.', {}),
  strictTool('screenshot', 'Captura la portada para mirarla (máximo 4 en total).', { width: { type: 'integer', enum: [1280, 390] } }),
  strictTool('finish', 'Termina: resumen para el comercio en español, 1–2 frases simples, sin términos técnicos.', { summary: text }),
];

/** What the kit and the template give the home; the writer composes with these instead of inventing commerce parts. */
const KIT_BRIEF = `PARTES DISPONIBLES (no inventes otras partes de comercio):
- import Shell from './Shell' — envuelve SIEMPRE toda la portada: <Shell>…</Shell> (encabezado, menú, carrito y pie son de la plataforma).
- import { Parallax, Reveal } from '@pagosya/ui' — <Reveal> anima al entrar; <Parallax> mueve una foto al hacer scroll.
- Grilla de productos: un elemento con el atributo data-pagosya-catalog (el kit dibuja tarjetas, precios y el botón de agregar). Puede quedar vacío.
- Un producto destacado: <div data-pagosya-spotlight="ID"></div> con un id real de los productos.
- import { FeatureSlot } from './features' — secciones listas (preguntas, newsletter, marquee, pasos), como en la portada actual.
- Clases de la plantilla en styles/globals.css (.es-section, .es-h2, .es-display, .es-link, …) y style={{…}} para tamaños y espacios.`;

export class HomeWriterToolbox implements AgentLoopToolbox {
  steps: AgentStep[] = [];
  lastVerify: { version: number; clean: boolean; hard: boolean } | null = null;
  finished: { summary: string } | null = null;
  stopped = null;
  private shots = 0;
  constructor(private readonly ctx: { workspace: AgentWorkspace; base: AgentPreviewBase; signal?: AbortSignal; gate: (files: SourceProjectFileDto[]) => Promise<string | null> }) {}
  get workspace() { return this.ctx.workspace; }
  draftIsClean() { return Boolean(this.lastVerify?.clean && this.lastVerify.version === this.workspace.version); }

  async run(name: string, rawArgs: string): Promise<{ output: string; image?: string }> {
    let args: Record<string, unknown>;
    try { args = JSON.parse(rawArgs || '{}'); } catch { return { output: 'Argumentos JSON no válidos.' }; }
    const step = (kind: AgentStep['kind'], label: string, thumbnail?: string) => { this.steps.push({ kind, label, at: Date.now(), ...(thumbnail ? { thumbnail } : {}) }); };
    try {
      switch (name) {
        case 'read_chassis': step('read_chassis', 'Leyendo la tienda'); return { output: this.chassis() };
        case 'write_home': {
          const written = this.workspace.write(HOME_PATH, String(args.content ?? ''));
          if (!written.ok) return { output: written.message };
          step('write_home', 'Escribiendo la portada');
          try { await agentPreviewSnapshot(this.ctx.base, this.workspace.files()); }
          catch (error) { return { output: `Portada escrita, pero no compila: ${(error as Error).message.slice(0, 1500)}` }; }
          return { output: 'Portada escrita y compilada. Llama check o screenshot.' };
        }
        case 'set_tokens': {
          const fonts = [String(args.heading), String(args.body)];
          const unknown = fonts.find(id => !SOURCE_FONT_CATALOG.some(font => font.id === id));
          if (unknown) return { output: `La fuente ${unknown} no está en el catálogo; usa un id de read_chassis.` };
          const colours = { paper: String(args.paper), ink: String(args.ink), muted: String(args.muted), accent: String(args.accent), deep: String(args.deep) };
          const block = masterThemeBlock(colours, fonts[0], fonts[1]);
          const written = this.workspace.write(GLOBALS, withMasterTheme(this.workspace.read(GLOBALS), block));
          if (!written.ok) return { output: written.message };
          step('set_tokens', 'Eligiendo colores y fuentes');
          const ink = /--es-ink:([^;]+);/.exec(block)?.[1] ?? colours.ink;
          return { output: `Colores y fuentes guardados.${ink.toLowerCase() !== colours.ink.toLowerCase() ? ` El texto no se leía sobre el fondo; usé ${ink}.` : ''}` };
        }
        case 'check': {
          step('check', 'Comprobando la portada');
          const snapshot = await agentPreviewSnapshot(this.ctx.base, this.workspace.files());
          const captures: Array<{ width: number; errors: string[] }> = [];
          for (const width of [1280, 390] as const) captures.push(await captureAgentDraft(snapshot, width, this.ctx.signal, 'index.html', [], 'normal', undefined, [evaluateHomeWriterRules]));
          const verdict = homeWriterVerdict(captures);
          this.lastVerify = { version: this.workspace.version, clean: !verdict.blocking.length, hard: verdict.blocking.length > 0 };
          return { output: [verdict.blocking.length ? `Debes corregir:\n- ${verdict.blocking.join('\n- ')}` : 'Nada que corregir.',
            verdict.advice.length ? `Consejos (opcionales):\n- ${verdict.advice.join('\n- ')}` : ''].filter(Boolean).join('\n') };
        }
        case 'screenshot': {
          if (this.shots >= HOME_WRITER_LIMITS.screenshots) return { output: 'No quedan capturas. Usa check y termina.' };
          this.shots++;
          const width = args.width === 390 ? 390 : 1280;
          const shot = await captureAgentDraft(await agentPreviewSnapshot(this.ctx.base, this.workspace.files()), width, this.ctx.signal);
          step('screenshot', width === 390 ? 'Mirando en celular' : 'Mirando en escritorio', shot.thumbnail);
          return { output: `Captura de ${width === 390 ? 'celular' : 'escritorio'} adjunta.`, image: shot.image };
        }
        case 'finish': {
          if (!this.draftIsClean()) return { output: 'Antes de terminar, llama check sobre la versión actual y corrige lo que bloquea.' };
          const diagnostic = await this.ctx.gate(this.workspace.files());
          if (diagnostic) { this.lastVerify = { version: this.workspace.version, clean: false, hard: true }; return { output: `La tienda no se puede guardar todavía: ${diagnostic.slice(0, 1500)}` }; }
          this.finished = { summary: String(args.summary ?? '').trim() || 'Diseñé una portada nueva para tu tienda.' };
          step('finish', 'Listo');
          return { output: 'Listo.' };
        }
        default: return { output: `Herramienta desconocida: ${name}.` };
      }
    } catch (error) { return { output: `Falló ${name}: ${(error as Error).message.slice(0, 800)}` }; }
  }

  /** Out of steps or time: a changed draft whose last check had nothing blocking still ships through the gate. */
  async acceptIfBuildable(): Promise<boolean> {
    if (this.finished) return true;
    if (!this.workspace.changedPaths().length || !this.draftIsClean()) return false;
    if (await this.ctx.gate(this.workspace.files())) return false;
    this.finished = { summary: 'Diseñé una portada nueva para tu tienda.' };
    return true;
  }

  private chassis(): string {
    const data = this.workspace.files().find(file => file.path === 'components/store-data.tsx')?.content ?? '';
    const exports = [...data.matchAll(/export const (\w+)/g)].map(match => match[1]);
    const photos = this.ctx.base.files.filter(file => file.path.startsWith('assets/') && /\.(jpe?g|png|webp|mp4)$/i.test(file.path)).map(file => file.path);
    const fonts = SOURCE_FONT_CATALOG.map(font => `${font.id} (${font.family}, ${font.role})`).join(', ');
    return [KIT_BRIEF,
      `import { … } from './store-data' — exporta: ${exports.join(', ')}. Productos, precios, fotos y logo salen de ahí; nunca los escribas a mano.`,
      `Archivos de fotos: ${photos.join(', ') || 'ninguno (portada solo tipográfica)'}`,
      `fuentes: ${fonts}`,
      `--- ${HOME_PATH} ---\n${this.workspace.read(HOME_PATH)}`,
      `--- components/store-data.tsx (extracto) ---\n${data.slice(0, 6000)}`,
    ].join('\n\n');
  }
}
```

If the template home itself comes back with a blocking finding in the `check` test (for example, a photo the demo uses twice), fix the real cause in the rule or the template. Never weaken the test. Name the cause in the commit message.

- [ ] **Step 4: Run them to make sure they pass**

Run: `cd apps/api && npx jest src/storefront-source/agent/home-writer-tools.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/agent/home-writer-tools.ts apps/api/src/storefront-source/agent/home-writer-tools.spec.ts
git commit -m "feat(yapi): the home writer's toolbox — read the chassis, write the whole home, set tokens, check, look, finish"
```

---

### Task 5: The writer stage inside generate()

**Files:**
- Create: `apps/api/src/storefront-source/source-home-writer-stage.ts`
- Modify: `apps/api/src/storefront-source/source-generation-types.ts:49` (`GenerateExecution.homeWriter?: boolean`; add `'home-writer'` to the attempt phase union if it is closed)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:613` (no exploration) and the stage branch at ~1394
- Modify: `apps/api/src/config/configuration.ts` (`yapiHomeWriter`, `yapiHomeWriterModel`)
- Modify: `apps/api/src/config/configuration.spec.ts`
- Test: `apps/api/src/storefront-source/source-home-writer-stage.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 1: `runAgent` `tools`/`verifyTool`
  - from Task 4: `HomeWriterToolbox`, `HOME_WRITER_TOOLS`, `HOME_WRITER_LIMITS`, `HOME_PATH`
  - existing: `AgentStageContext` (`source-agent-stage.ts:41`), `agentOpening`, `openAiAgentModel`, `anthropicAgentModel`, `sourceUsage`
- Produces:
  - `homeWriterInstructions(): string`
  - `runHomeWriterLoop(input: { model: AgentModel; files; base; gate; task: string; images?: unknown[]; signal?; limits?; onStep? }): Promise<{ accepted: boolean; outcome: AgentRunResult; summary: string; changed: string[]; steps: AgentStep[] }>`
  - `runHomeWriterStage(context: AgentStageContext): Promise<void>`
  - config `app.yapiHomeWriter: boolean` (`YAPI_HOME_WRITER === '1'`) and `app.yapiHomeWriterModel: string` (`YAPI_HOME_WRITER_MODEL || 'gpt-5.6-terra'`)

- [ ] **Step 1: Write the failing tests**

`source-home-writer-stage.spec.ts`:

```ts
import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { nextSourceFile } from './source-next';
import { homeWriterInstructions, runHomeWriterLoop } from './source-home-writer-stage';
import { HOME_PATH } from './agent/home-writer-tools';

jest.setTimeout(240_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial')); });
let n = 0;
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args), callId: `h${n++}` });
const authored = () => base.files.filter(f => nextSourceFile(f.path));

describe('home writer stage', () => {
  it('tells the model the rules that matter', () => {
    const text = homeWriterInstructions();
    for (const rule of [/<Shell>/, /texto JSX literal/i, /72 px/, /una sola vez/i, /banda oscura/i, /data-pagosya-catalog/, /read_chassis/]) expect(text).toMatch(rule);
  });
  it('a run that writes, checks and finishes hands back only the home', async () => {
    const home = authored().find(f => f.path === HOME_PATH)!.content.replace('export default function Home', 'export default function Home /* writer */');
    const turns = [{ calls: [call('read_chassis', {})] }, { calls: [call('write_home', { content: home })] }, { calls: [call('check', {})] }, { calls: [call('finish', { summary: 'Nueva portada.' })] }];
    let i = 0;
    const out = await runHomeWriterLoop({ model: async () => turns[Math.min(i++, turns.length - 1)], files: authored(), base, gate: async () => null, task: 'Gramiyaa' });
    expect(out).toMatchObject({ accepted: true, summary: 'Nueva portada.', changed: [HOME_PATH] });
  });
  it('a run that never gets a clean check is not accepted, so the template home stays', async () => {
    const bad = `import Shell from './Shell';\nexport default function Home() { return <Shell><main><section><h1>Sin productos</h1></section></main></Shell>; }`;
    const out = await runHomeWriterLoop({ model: async () => ({ calls: [call('write_home', { content: bad })] }), files: authored(), base, gate: async () => null, task: 'x', limits: { toolCalls: 3 } });
    expect(out.accepted).toBe(false);
  });
});
```

`configuration.spec.ts`: next to the `YAPI_FIRST_DESIGN_EFFORT` test, add a test in the same style. `YAPI_HOME_WRITER` unset → `yapiHomeWriter === false`; `'1'` → `true`; `'on'` → `false`. `YAPI_HOME_WRITER_MODEL` unset → `'gpt-5.6-terra'`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-home-writer-stage.spec.ts src/config/configuration.spec.ts --runInBand`
Expected: FAIL. The module is not found and the config keys are missing.

- [ ] **Step 3: Implement**

`configuration.ts`: type, next to `yapiFirstDesignEffort`:

```ts
  /** Spec 2026-10-29: after a new store's polish, a small agent rewrites only its home (YAPI_HOME_WRITER=1). */
  yapiHomeWriter: boolean;
  yapiHomeWriterModel: string;
```

values:

```ts
    yapiHomeWriter: process.env.YAPI_HOME_WRITER === '1',
    yapiHomeWriterModel: process.env.YAPI_HOME_WRITER_MODEL || 'gpt-5.6-terra',
```

`source-generation-types.ts`: add `/** Spec 2026-10-29: the run is the home page writer (source-home-writer-stage.ts). */ homeWriter?: boolean;` to `GenerateExecution`. If the attempt record's `phase` is a closed union, add `'home-writer'`.

`source-home-writer-stage.ts`:

```ts
import { BadGatewayException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { AgentWorkspace } from './agent/agent-workspace';
import { runAgent, type AgentModel, type AGENT_LIMITS } from './agent/agent-loop';
import { agentOpening } from './agent/agent-prompt';
import type { AgentPreviewBase } from './agent/agent-capture';
import type { AgentStep } from './agent/agent-tools';
import { openAiAgentModel } from './agent/agent-model';
import { anthropicAgentModel } from './agent/agent-model-anthropic';
import { HomeWriterToolbox, HOME_PATH, HOME_WRITER_LIMITS, HOME_WRITER_TOOLS } from './agent/home-writer-tools';
import { nextSourceFile } from './source-next';
import { sourceUsage } from './source-generation-policy';
import type { AgentStageContext } from './source-agent-stage';

/** Spec 2026-10-29 §2–3: Amboras's recipe, our rules. */
export function homeWriterInstructions(): string {
  return `Eres el diseñador de la PORTADA de una tienda pagosYa. Solo cambias ${HOME_PATH} (completo, con write_home) y los colores y fuentes (set_tokens).
El encabezado, el menú, el pie, la ficha de producto, el carrito y el checkout son de la plataforma: no los dibujes ni los imites. Toda la portada va dentro de <Shell>.
Orden: read_chassis; escribe la portada entera en una sola llamada; set_tokens si los colores o las fuentes de la marca lo piden; check; una captura de escritorio y una de celular; corrige; finish.
Estilo (como Amboras): titulares de 72 px o más en escritorio con interlineado apretado, etiquetas pequeñas en mayúsculas (por ejemplo «01 / 04»), una portada amplia donde el texto tiene espacio, bandas del color de la marca, al menos 6 secciones (portada, productos con data-pagosya-catalog, historia, beneficios, preguntas, cierre).
Reglas que bloquean: cada foto una sola vez; nunca 3 fotos o más juntas; nunca una banda oscura (negra) solo con texto — usa una foto real, un fondo claro o el color de la marca; la portada muestra productos (data-pagosya-catalog, o data-pagosya-spotlight con ids reales).
Los textos van como texto JSX literal (<h1>Deja que el aceite haga lo suyo.</h1>), nunca dentro de arreglos u objetos: así el comercio los edita con doble clic. Español natural; no inventes datos, precios, envíos ni certificaciones.
Productos, precios, fotos y logo vienen de './store-data'. Los consejos de check son opcionales; lo que dice «Debes corregir» no.`;
}

type LoopInput = { model: AgentModel; files: SourceProjectFileDto[]; base: AgentPreviewBase; gate: (files: SourceProjectFileDto[]) => Promise<string | null>; task: string;
  images?: unknown[]; signal?: AbortSignal; limits?: Partial<typeof AGENT_LIMITS>; onStep?: (step: AgentStep) => void | Promise<void> };

/** The writer's loop on its own: testable without a generation run. */
export async function runHomeWriterLoop(input: LoopInput) {
  const workspace = new AgentWorkspace(input.files, { redesign: true, lockedShell: true });
  const toolbox = new HomeWriterToolbox({ workspace, base: input.base, gate: input.gate, ...(input.signal ? { signal: input.signal } : {}) });
  const outcome = await runAgent({ model: input.model, toolbox, tools: HOME_WRITER_TOOLS, verifyTool: 'check', instructions: homeWriterInstructions(), signal: input.signal, onStep: input.onStep,
    limits: { ...HOME_WRITER_LIMITS, ...input.limits }, opening: agentOpening(input.task, input.files.filter(file => file.path === HOME_PATH), input.images ?? []) });
  const accepted = (outcome.status === 'finished' && Boolean(toolbox.finished)) || (!outcome.provider && outcome.reason !== 'cancelled' && !input.signal?.aborted && await toolbox.acceptIfBuildable());
  return { accepted, outcome, summary: toolbox.finished?.summary ?? '', changed: workspace.changedPaths(), steps: toolbox.steps };
}

/** Inside generate(): runs instead of runAgentStage for execution.homeWriter (spec 2026-10-29 §6). */
export async function runHomeWriterStage(context: AgentStageContext): Promise<void> {
  const { facts, live, acceptCandidate } = context;
  const { prisma, config, metering, storeId, runId, dto, plan, provider, apiKey, agentProvider, budget, signal, attempts, progress, previousFiles, oldFiles, assets, images, data } = facts;
  await progress?.('building');
  const base: AgentPreviewBase = { brief: dto.brief, files: [...previousFiles.filter(file => !assets.some(asset => asset.path === file.path)), ...assets] };
  // The same acceptance chain every build passes, in its lenient form (artwork and edit-scope rules are for chat edits).
  const gate = async (files: SourceProjectFileDto[]) => {
    live.generated = { label: 'Portada de YAPI', files: files.map(file => ({ ...file })) };
    live.lenient = true;
    try { await acceptCandidate(); return null; }
    catch (error) { return (error as Error).message; }
    finally { live.lenient = false; }
  };
  const onTurn = async ({ body, durationMs, status }: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => {
    const tools = [...(Array.isArray(body?.output) ? body.output : []), ...(Array.isArray(body?.content) ? body.content : [])].filter((item: any) => item?.type === 'function_call' || item?.type === 'tool_use').map((item: any) => String(item.name));
    attempts.push({ model: plan.model, phase: 'home-writer', durationMs, status, usage: sourceUsage(plan.model, body?.usage), tools });
    await prisma.storeSourceGeneration.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { attempts: attempts as unknown as Prisma.InputJsonValue } });
    await metering?.record(storeId, 'source-generation', plan.model, body, durationMs, status);
  };
  const effort = config.get<'low' | 'medium' | 'high'>('app.yapiFirstDesignEffort') ?? 'low';
  const model = agentProvider
    ? anthropicAgentModel({ endpoint: agentProvider.endpoint, apiKey: agentProvider.apiKey, model: plan.model, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), signal, onTurn })
    : openAiAgentModel({ endpoint: provider.endpoint, apiKey, model: plan.model, providerName: provider.name, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), reasoningEffort: effort, signal, onTurn });
  const task = `${dto.instruction}\n\nTienda: ${(data as { storeName?: string }).storeName ?? ''}`;
  const out = await runHomeWriterLoop({ model, files: oldFiles.filter(file => nextSourceFile(file.path)), base, gate, task, signal,
    images: images.map(image => ({ ...(image as object), detail: 'low' })),
    onStep: async step => { await progress?.detail?.({ label: step.label, ...(step.thumbnail ? { thumbnail: step.thumbnail } : {}) }); } });
  if (!out.accepted) throw new BadGatewayException(`YAPI no pudo terminar la portada${out.outcome.reason ? `: ${out.outcome.reason}` : ''}`);
  live.agentTheme = null; live.agentAccountTheme = null; live.agentMotifPack = undefined; live.agentPolicies = {};
  live.generated.label = 'Portada de YAPI';
  live.agentOutcome = { summary: out.summary, requirements: [], evidence: [], sections: [], steps: out.steps.map(({ thumbnail: _thumbnail, ...step }) => step) };
}
```

Check every destructured `facts` field against `AgentStageContext['facts']`. If one is missing (for example `images` or `data`), add it to that `Pick` list in `source-agent-stage.ts`; `generate()` already builds `facts` from them. Check the types of `live.agentOutcome` and `live.agentPolicies` and match them exactly.

`source-generation.service.ts`:
- Line 613: `const exploration = creative && !sketchFirst && !execution?.homeWriter ? this.exploreDesign() : null;`
- Before `} else if (agentEngine) {` (~1394):

```ts
      } else if (useNext && execution?.homeWriter) {
        // Spec 2026-10-29: the home page writer — one file and the tokens on the locked chassis, with its own five tools.
        await runHomeWriterStage({ facts, live, acceptCandidate, resume: { resumable, checkpoint, checkpointKey, requestKey, merchantRequest } });
```

Add `import { runHomeWriterStage } from './source-home-writer-stage';` next to line 141.

Then read `generate()` from the top to the stage branch. For each model call that runs before it on a redesign (voice sheet, photo descriptions, the sep5 author, brand read, style proposal, the frame/playbook if they call a model), add `&& !execution?.homeWriter` to its condition when the writer does not use its result. List each one in the commit message. The goal: the writer run's `attempts` only carry `phase: 'home-writer'`.

- [ ] **Step 4: Run them to make sure they pass, plus the neighbours and tsc**

Run: `cd apps/api && npx jest src/storefront-source/source-home-writer-stage.spec.ts src/config/configuration.spec.ts src/storefront-source/source-generation.service.spec.ts --runInBand`
Expected: PASS. For any failure in `source-generation.service.spec.ts`, re-run it on `git stash`. A failure that also happens there is pre-existing; name it in the commit message.
Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-home-writer-stage.ts apps/api/src/storefront-source/source-home-writer-stage.spec.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-agent-stage.ts apps/api/src/config/configuration.ts apps/api/src/config/configuration.spec.ts
git commit -m "feat(yapi): the home writer stage — generate() runs it for execution.homeWriter, with no planner"
```

---

### Task 6: Queue the writer after the polish; the template stays on failure

**Files:**
- Modify: `apps/api/src/storefront-source/dto/send-source-message.dto.ts:69` (`homeWriter?: boolean` on `SourceMessageInput`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (the polish branch's `next` at ~964, a new `homeWriter` branch right after the polish branch, a `homeWriter` method next to `masterPolish`)
- Modify: `apps/api/.env.example` if it exists (`YAPI_HOME_WRITER=0`, `YAPI_HOME_WRITER_MODEL=gpt-5.6-terra`)
- Test: the spec file that covers polish follow-ups. Find it with `git grep -l "polish: true" -- 'apps/api/src/*.spec.ts'`.

**Interfaces:**
- Consumes from Task 5: `GenerateExecution.homeWriter`, config `app.yapiHomeWriter` and `app.yapiHomeWriterModel`.
- Produces:
  - the follow-up `{ instruction, revision, personalTouch: true, homeWriter: true, firstDesign: true, redesign: true, requestId, model: <yapiHomeWriterModel>, checklistWords? }`
  - a writer result whose `followUp` is the brief check (`briefCheck: 1`) when `checklistWords` is set and the checklist is on
  - a failed writer: `PersonalTouchSkipped` carrying that check; a spent quota is rethrown unchanged

- [ ] **Step 1: Write the failing tests.** Read the polish tests in that spec file first: the service setup, the mocks for `generation.generate`, `projects.version`, `config.get`, and how a follow-up is asserted. Add a `describe('home writer (spec 2026-10-29)')` block with four tests in their style:
  1. `app.yapiHomeWriter` true, guarded touch off, checklist on: a polish run with `checklistWords: 'aceites'` returns `followUp` matching `{ homeWriter: true, firstDesign: true, redesign: true, model: 'gpt-5.6-terra', checklistWords: 'aceites' }`, with `revision` = the polished revision.
  2. `app.yapiHomeWriter` false: the same polish returns no `followUp.homeWriter`, and today's behaviour (the check follow-up) is unchanged.
  3. A writer run (`homeWriter: true`) whose `generate` rejects with `new Error('YAPI no pudo terminar la portada: steps')` rejects with a `PersonalTouchSkipped` whose `followUp` matches `{ briefCheck: 1, revision: <writer's input revision> }`. The user message it created is deleted, and no assistant message is created.
  4. A writer run whose `generate` rejects with `new SourceProviderQuotaException(…)` (use the constructor arguments the other quota tests use) rejects with that same exception.

  Plus a fifth: a writer run whose saved revision changed `components/Shell.tsx` calls `projects.restore` and rejects with `PersonalTouchSkipped`. Mock `projects.version` to return a snapshot where Shell differs.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd apps/api && npx jest <that spec file> -t "home writer" --runInBand`
Expected: FAIL.

- [ ] **Step 3: Implement**

`send-source-message.dto.ts`, in `SourceMessageInput` before `guardedTouch`:

```ts
  /** Spec 2026-10-29: the home page writer that follows the polish of a new master store. */
  homeWriter?: boolean;
```

`source-chat.service.ts`, next to `MASTER_POLISH_BRIEF`:

```ts
/** Spec 2026-10-29: what the home writer is asked; the merchant's first message follows it. */
const HOME_WRITER_BRIEF = 'Diseña la portada de esta tienda nueva al estilo de Amboras: titulares grandes, mucho recorrido, los colores de la marca, con sus fotos y productos reales.';
```

In the polish branch (~964), add and put first in `next`:

```ts
        // Spec 2026-10-29: with the home writer on, the polished store goes to the writer; the check follows the writer.
        const writerFollowUp = (revision: number): SourceMessageInput => ({ instruction: `${HOME_WRITER_BRIEF}${input.checklistWords ? `\n\nMensaje del comercio:\n${input.checklistWords}` : ''}`,
          revision, personalTouch: true, homeWriter: true, firstDesign: true, redesign: true, ...(input.checklistWords ? { checklistWords: input.checklistWords } : {}), requestId: randomUUID(),
          model: (this.config.get<string>('app.yapiHomeWriterModel') ?? 'gpt-5.6-terra') as SourceMessageInput['model'] });
        const writerOn = this.config.get<boolean>('app.yapiHomeWriter') === true;
        const next = (revision: number) => writerOn ? writerFollowUp(revision) : touchOn ? touchFollowUp(revision) : input.checklistWords && this.checklistOn() ? checkFollowUp(revision) : undefined;
```

Replace the existing `const next = …` line with this one. Right after the polish branch's closing `}`:

```ts
      if (input.homeWriter && previous) {
        const checkAfter = (revision: number) => input.checklistWords && this.checklistOn() ? { instruction: 'Revisión del pedido', revision, personalTouch: true, briefCheck: 1 as const,
          checklistWords: input.checklistWords, requestId: randomUUID(), model: 'auto' as const } satisfies SourceMessageInput : undefined;
        try {
          const written = await this.homeWriter(merchantId, storeId, thread.id, userMessage, workflow, input, previous, budget);
          const after = checkAfter(written.revision.revision);
          return after ? { ...written, followUp: after } : written;
        } catch (error) {
          // A spent quota goes back to the queue (FIRST_DESIGN_MAX_ATTEMPTS); anything else keeps the polished store.
          if (error instanceof SourceProviderQuotaException || MODEL_LIMIT.test(String((error as Error)?.message))) throw error;
          this.logger.warn(`home writer kept the template for ${storeId}: ${String((error as Error)?.message).slice(0, 300)}`);
          await this.prisma.storeAgentMessage.delete({ where: { id: userMessage.id } }).catch(() => undefined);
          throw new PersonalTouchSkipped('home writer kept the template', checkAfter(current.revision));
        }
      }
```

The method, next to `masterPolish`:

```ts
  /** Spec 2026-10-29: the home page writer — generate() with execution.homeWriter: no conversation call, no planner. */
  private async homeWriter(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, input: SourceMessageInput, previous: { snapshot: unknown }, budget: ReturnType<SourceGenerationService['newBudget']>) {
    const before = previous.snapshot as unknown as SourceProjectSnapshot;
    const revision = await withTemplateProfile(() => this.generation.generate(merchantId, storeId, { revision: input.revision, brief: before.brief, instruction: input.instruction, model: input.model,
      ...(input.assetUrls?.length ? { assetUrls: input.assetUrls } : {}) }, budget, [], workflow.report, { homeWriter: true, redesign: true, firstDesign: true }));
    if ('styleProposal' in revision) throw new Error('home writer: unexpected style proposal');
    // Spec §1: the writer changes only the home and the theme block; anything else undoes the run.
    const after = (await this.projects.version(merchantId, storeId, revision.revision)).snapshot as unknown as SourceProjectSnapshot;
    const strayed = after.files.filter(file => nextSourceFile(file.path) && !['components/home.tsx', 'styles/globals.css', 'components/store-data.tsx'].includes(file.path)
      && before.files.find(old => old.path === file.path)?.content !== file.content).map(file => file.path);
    if (strayed.length) { await this.projects.restore(merchantId, storeId, input.revision, revision.revision); throw new Error(`home writer changed ${strayed.join(', ')}`); }
    await workflow.finish('completed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: 'Diseñé una portada nueva para tu tienda, con tus fotos y tus productos. Revisa la vista previa.', metadata: { progress: workflow.value, sourceRevision: revision.revision } } });
    return { userMessage, assistantMessage, revision };
  }
```

Match these to the code as it is:
- the variable names at that point (`thread`, `current`, `budget`, `workflow`, `userMessage`)
- the `GenerateSourceProjectDto` field names
- `projects.restore`'s argument order: copy the call at the `lostByEdit` restore
- the import of `withTemplateProfile`: drop the wrapper if this file does not use it for builds

Import `SourceProviderQuotaException` (`./source-provider-error`), `MODEL_LIMIT` (`./source-validation-error`) and `nextSourceFile` (`./source-next`) if they are not imported.

The job runner already retries `input.firstDesign` jobs on a spent quota (`source-chat-jobs.service.ts:128,209`). The writer's input sets `firstDesign: true`, so test 4's rethrow is all it needs. It also already queues a `PersonalTouchSkipped`'s `followUp` (`:196`).

- [ ] **Step 4: Run them to make sure they pass, plus the chat-jobs spec and tsc**

Run: `cd apps/api && npx jest <that spec file> src/storefront-source/source-chat-jobs.service.spec.ts --runInBand`
Expected: PASS (no failures beyond the `git stash` baseline).
Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/dto/send-source-message.dto.ts apps/api/src/storefront-source/source-chat.service.ts <that spec file> apps/api/.env.example
git commit -m "feat(yapi): YAPI_HOME_WRITER queues the home writer after the polish; a failed writer keeps the template home"
```

---

### Task 7: Live check on four catalogs (owner gate)

**Files:**
- Modify: `apps/api/.env` (back it up first to `.superpowers/sdd/2026-10-29-home-page-writer/api.env.before`)
- Create: `docs/superpowers/plans/2026-10-29-home-page-writer-findings.md`

No code. Every number comes from the runs, never from estimates.

- [ ] **Step 1: Ask the owner before starting** (it spends ChatGPT plan quota and restarts the stack). Note the running ports (`lsof -nP -iTCP -sTCP:LISTEN | grep node`) and confirm that no YAPI job is RUNNING.
- [ ] **Step 2: Turn it on.**
  - Back up `apps/api/.env` and set `YAPI_HOME_WRITER=1`.
  - Start the stack with `pnpm dev:chatgpt` (never plain `pnpm dev`).
  - Confirm `apps/api/dist` has `storefront-source/source-home-writer-stage.js` and that its `configuration.js` reads `YAPI_HOME_WRITER`.
- [ ] **Step 3: Build four stores** the way the one-build-path live check did (`.superpowers/sdd/2026-10-29-one-build-path/progress.md`, Task 5: the chat-jobs API with a script-made dashboard session, and catalogs cloned with `apps/api/scripts/clone-store-catalog.ts`).
  - The stores: NOA (moodboard photos), Gramiyaa, PEPPA and DooBoo, with photos from the `~/Downloads` brand folders.
  - Wait for rev 1 (template), rev 2 (polish) and rev 3 (writer), or for the writer's run to fail and rev 2 to stay.
- [ ] **Step 4: Measure each store** from the writer run's `storeSourceGeneration` row (`attempts` with `phase: 'home-writer'`):
  - number of calls
  - minutes
  - input/output/cached tokens
  - cost
  - finished or kept the template, and the reason

  Confirm that the writer run has no attempts from another phase. Take phone and desktop screenshots of each home.
- [ ] **Step 5: Inline editing.** In the Studio, double-click one writer headline, change a word, and confirm that a new revision has the change.
- [ ] **Step 6: Compare and write the findings.**
  - **Compare:** put each store next to the Amboras Gramiyaa frames (re-extract from `~/Desktop/Screen Recording 2026-10-29 at 2.53.54 PM.mov` with `ffmpeg -vf fps=1/2`; the filename has a narrow space before «PM», so use a glob).
  - **Write** `2026-10-29-home-page-writer-findings.md` with:
    - the numbers table
    - the screenshot paths
    - what still differs (type size, page length, cover text box)
    - every check line that came up in more than one store
- [ ] **Step 7: Close out.**
  - Restore `apps/api/.env` unless the owner says to keep the switch on.
  - Commit the findings doc.
  - Stop. The owner decides whether `YAPI_HOME_WRITER=1` becomes the default.

```bash
git add docs/superpowers/plans/2026-10-29-home-page-writer-findings.md
git commit -m "docs: home page writer live check — four stores against Amboras"
```
