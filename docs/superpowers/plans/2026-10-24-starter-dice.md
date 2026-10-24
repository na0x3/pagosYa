# Starter Dice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starters (Calle, Taller, a rebuilt Vitrina) roll their own variety within their character, then a 5-business × 2-path comparison shows the owner starters-with-dice next to Esencial-random.

**Architecture:** Each starter's `template.json` gains `starter.dice` (allowed ids per varying part, plus palettes and fonts). `applyMaster` rolls the existing `rollVariants` over Esencial's settings narrowed to those lists and lays the roll over the starter's preset inside `assemble`. Vitrina is rebuilt from Esencial's files plus a PEPPA-character CSS layer, with a `starterOnly` font pair and palettes that Esencial-random never rolls. A script builds the comparison stores and another captures them side by side.

**Tech Stack:** NestJS API (TypeScript, Jest), `@pagosya/store-templates` (CommonJS, `node --test`), Playwright (captures), Postgres dev DB.

**Spec:** `docs/superpowers/specs/2026-10-24-starter-dice-design.md`

## Global Constraints

- Variation level is **medium**: 2–4 hand-picked ids per varying part; parts not listed in `starter.dice` stay at the starter's preset value.
- A starter without `starter.dice` behaves exactly as today (fixed preset, no dice).
- Esencial's own dice and the plan card's parts never offer a `starterOnly` palette or font pair.
- Merchant's confirmed brand colours (or logo colours) still win over a rolled palette.
- Multi-photo covers (`collage`, `strip`) never rolled without the photos; no photo group of 3+ unless the merchant asked.
- **Never edit files under `apps/api/src` while a YAPI job is QUEUED or RUNNING** (saving restarts `nest --watch` and kills the job). Check first:
  `cd apps/api && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:'postgresql://postgres:postgres@localhost:54329/pagosya'}}});p.\$queryRawUnsafe(\`select count(*)::int n from \"StoreSourceChatJob\" where status in ('QUEUED','RUNNING')\`).then(r=>{console.log(r[0].n);return p.\$disconnect()})"` → must print `0`.
- Type-check the API with `npx tsc --noEmit --incremental false -p .` (plain `--noEmit` breaks the API watcher).
- Never run the whole API jest suite with default workers; run the named spec files with `--maxWorkers=2`.
- Commits: `packages/store-templates/**` and new files are committed per task. API files that already carry earlier uncommitted work (`source-master-dice.ts`, `source-templates.service.ts`, `storefront-source.module.ts`, their specs, `source-chat-master.spec.ts`, `source-starter-pick.spec.ts`, `source-starters.controller.spec.ts`, `scripts/clone-store-catalog.ts`) are **left uncommitted** — list them in the task report instead.
- Start the dev stack only with `pnpm dev:chatgpt`; never plain `pnpm dev`.

## Review Focus

1. A starter whose dice list names a cover needing 3 photos, built for a store with 1 photo → the cover falls back to an allowed one-photo option, never a broken collage (Task 2 test).
2. A merchant with confirmed brand colours on a starter with dice → the brand colours win over the rolled palette (Task 3 test).
3. Esencial-random for a law firm → never gets `alegre` fonts or the playful palettes (Task 2 test on `esencialDiceSettings`, Task 3 test on the Esencial branch).
4. «Probar otro estilo» into a starter with dice → the new revision carries rolled variants, not the bare preset (the swap calls `applyMaster` with `starterId`, pinned by Task 3's first test).
5. Two stores on the same starter built one after another by the same merchant → the second does not repeat the first's cover/palette/fonts combination (Task 2 test with `recent`).

---

### Task 1: `starter.dice` and `starterOnly` in the template package

**Files:**
- Modify: `packages/store-templates/index.js:70-76` (starter validation) and `:91` (freeze)
- Modify: `packages/store-templates/index.d.ts:6-7,31` (types)
- Test: `packages/store-templates/test/starters.test.mjs`
- Create: `packages/store-templates/test/fixtures/starters-dice-bad/bad/` (copy of `test/fixtures/starters/dulce/` with a bad dice list)

**Interfaces:**
- Produces:
  - `interface TemplateStarterDice { readonly [part: string]: readonly string[] | undefined; readonly palettes?: readonly string[]; readonly fonts?: readonly string[] }`
  - `TemplateStarter.dice?: TemplateStarterDice`
  - `MasterPalette.starterOnly?: boolean`, `MasterFontPair.starterOnly?: boolean`

- [ ] **Step 1: Write the failing tests** (append to `starters.test.mjs`)

```js
// Starter dice (spec 2026-10-24-starter-dice §1): each varying part lists 2–4 ids; only a starter that extends a master rolls.
test('a starter dice list needs 2–4 ids per part and a master to extend', () => {
  assert.throws(() => loadTemplates(join(import.meta.dirname, 'fixtures', 'starters-dice-bad')), /starter\.dice/);
});

test('every dice id of a real starter exists in Esencial, and starter-only entries never sit in a preset', () => {
  const { listTemplates, templateManifest } = require('../index.js');
  const master = templateManifest('esencial').master;
  for (const manifest of listTemplates().filter(m => m.starter?.dice)) {
    const { palettes = [], fonts = [], ...parts } = manifest.starter.dice;
    for (const [part, ids] of Object.entries(parts)) for (const id of ids) assert.ok(master.variants[part]?.includes(id), `${manifest.id}: ${part}:${id}`);
    for (const id of palettes) assert.ok(master.palettes.some(p => p.id === id), `${manifest.id}: palette ${id}`);
    for (const id of fonts) assert.ok(master.fonts.some(f => f.id === id), `${manifest.id}: fonts ${id}`);
  }
  const starterOnly = new Set([...master.palettes, ...master.fonts].filter(entry => entry.starterOnly).map(entry => entry.id));
  for (const manifest of listTemplates().filter(m => m.preset && !m.starter)) {
    assert.ok(!starterOnly.has(manifest.preset.palette) && !starterOnly.has(manifest.preset.fonts), manifest.id);
  }
});
```

Make the fixture:

```bash
cd packages/store-templates/test/fixtures
mkdir -p starters-dice-bad && cp -R starters/dulce starters-dice-bad/bad
node -e "const f='starters-dice-bad/bad/template.json';const m=JSON.parse(require('fs').readFileSync(f,'utf8'));m.id='bad';m.starter.dice={hero:['full']};require('fs').writeFileSync(f,JSON.stringify(m,null,2)+'\n')"
```

- [ ] **Step 2: Run** `cd packages/store-templates && node --test test/starters.test.mjs` → FAIL (`starters-dice-bad` loads without throwing).

- [ ] **Step 3: Implement** — in `index.js`, inside the `if (manifest.starter !== undefined) {` block after the `order` check:

```js
    if (s.dice !== undefined) {
      if (!manifest.extends) fail(id, 'starter.dice', 'only a starter that extends a master can roll dice');
      if (!s.dice || typeof s.dice !== 'object' || Array.isArray(s.dice)) fail(id, 'starter.dice', 'must be an object of id lists');
      for (const [part, ids] of Object.entries(s.dice)) {
        const looks = part === 'palettes' || part === 'fonts';
        const ok = Array.isArray(ids) && ids.every(value => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value)) && new Set(ids).size === ids.length;
        const size = ok && (looks ? ids.length >= 1 && ids.length <= 6 : ids.length >= 2 && ids.length <= 4);
        if (!size) fail(id, `starter.dice.${part}`, looks ? 'must list 1-6 distinct ids' : 'must list 2-4 distinct ids');
      }
    }
```

and in the freeze at line 91 replace `starter: Object.freeze({ ...manifest.starter, fits: Object.freeze([...manifest.starter.fits]) })` with:

```js
starter: Object.freeze({ ...manifest.starter, fits: Object.freeze([...manifest.starter.fits]), ...(manifest.starter.dice ? { dice: Object.freeze(Object.fromEntries(Object.entries(manifest.starter.dice).map(([part, ids]) => [part, Object.freeze([...ids])]))) } : {}) })
```

In `index.d.ts` replace the three declarations with:

```ts
export interface MasterPalette { readonly id: string; readonly name: string; readonly paper: string; readonly ink: string; readonly muted: string; readonly accent: string; readonly deep: string; readonly starterOnly?: boolean }
export interface MasterFontPair { readonly id: string; readonly name: string; readonly heading: string; readonly body: string; readonly starterOnly?: boolean }
/** Starter dice (spec 2026-10-24-starter-dice): the parts a starter rolls, each with its allowed ids; palettes and fonts likewise. */
export interface TemplateStarterDice { readonly [part: string]: readonly string[] | undefined; readonly palettes?: readonly string[]; readonly fonts?: readonly string[] }
export interface TemplateStarter { readonly description: string; readonly fits: readonly string[]; readonly fashion?: boolean; readonly order: number; readonly dice?: TemplateStarterDice }
```

- [ ] **Step 4: Run** `node --test test/*.test.mjs` → all PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/index.js packages/store-templates/index.d.ts packages/store-templates/test/starters.test.mjs packages/store-templates/test/fixtures/starters-dice-bad
git commit -m "feat(templates): starter.dice lists and starter-only palettes/fonts"
```

---

### Task 2: Rolling a starter's dice

**Files:**
- Modify: `apps/api/src/storefront-source/source-master-dice.ts` (two exports appended)
- Test: `apps/api/src/storefront-source/source-master-dice.spec.ts` (append)

**Interfaces:**
- Consumes: `rollVariants(input)` (same file), `MasterSettings`, `TemplateStarterDice` (Task 1), `RecentRoll`, `MasterCharacter`, `MasterVariants`.
- Produces:
  - `esencialDiceSettings(settings: MasterSettings): MasterSettings` — the settings without `starterOnly` palettes and fonts.
  - `rollStarterDice(input: { seed: string; settings: MasterSettings; dice: TemplateStarterDice; character: MasterCharacter; photoCount: number; photoGroups?: boolean; recent: RecentRoll[]; categoryCount?: number }): { variants: Partial<MasterVariants>; palette?: string; fonts?: string }` — only the parts named in `dice`; `palette`/`fonts` only when `dice.palettes`/`dice.fonts` are given.

- [ ] **Step 0:** confirm 0 YAPI jobs (Global Constraints).
- [ ] **Step 1: Write the failing tests** (append; add the imports at the top of the file)

```ts
import { esencialDiceSettings, rollStarterDice } from './source-master-dice';
import { templateManifest } from '@pagosya/store-templates';

describe('starter dice (spec 2026-10-24-starter-dice §1)', () => {
  const master = templateManifest('esencial')!.master!;
  const calm = { tone: 'calm' as const, temperature: 'neutral' as const, lead: 'photo' as const, exclude: [] };
  const dice = { hero: ['stack', 'framed', 'split-left'], grid: ['side-title', 'grid3'], palettes: ['linen', 'sand', 'terracotta'], fonts: ['gallery', 'editorial', 'literary'] };
  const roll = (seed: string, extra: Partial<Parameters<typeof rollStarterDice>[0]> = {}) => rollStarterDice({ seed, settings: master, dice, character: calm, photoCount: 6, recent: [], ...extra });

  it('rolls only the parts and ids the starter lists', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const out = roll(seed);
      expect(Object.keys(out.variants).sort()).toEqual(['grid', 'hero']);
      expect(dice.hero).toContain(out.variants.hero);
      expect(dice.grid).toContain(out.variants.grid);
      expect(dice.palettes).toContain(out.palette);
      expect(dice.fonts).toContain(out.fonts);
    }
  });

  it('two stores get different looks', () => {
    const looks = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map(seed => JSON.stringify(roll(seed))));
    expect(looks.size).toBeGreaterThan(2);
  });

  it('never rolls a cover the store has no photos for', () => {
    const out = rollStarterDice({ seed: 'x', settings: master, dice: { hero: ['collage', 'strip', 'framed'] }, character: calm, photoCount: 1, recent: [] });
    expect(out.variants.hero).toBe('framed');
  });

  it('does not repeat the merchant’s last store when another combination is free', () => {
    const first = roll('same');
    const second = roll('same', { recent: [{ hero: first.variants.hero!, palette: first.palette!, fonts: first.fonts! }] });
    expect(`${second.variants.hero}|${second.palette}|${second.fonts}`).not.toBe(`${first.variants.hero}|${first.palette}|${first.fonts}`);
  });

  it('a dice list without palettes or fonts leaves the starter’s own', () => {
    const out = rollStarterDice({ seed: 'x', settings: master, dice: { hero: ['stack', 'framed'] }, character: calm, photoCount: 6, recent: [] });
    expect(out.palette).toBeUndefined();
    expect(out.fonts).toBeUndefined();
  });

  it('Esencial-random never sees starter-only palettes or fonts', () => {
    const withExtras = { ...master, palettes: [...master.palettes, { ...master.palettes[0], id: 'cereza', starterOnly: true }], fonts: [...master.fonts, { ...master.fonts[0], id: 'alegre', starterOnly: true }] };
    const plain = esencialDiceSettings(withExtras);
    expect(plain.palettes.map(p => p.id)).not.toContain('cereza');
    expect(plain.fonts.map(f => f.id)).not.toContain('alegre');
    expect(plain.palettes.filter(p => !p.starterOnly)).toHaveLength(master.palettes.filter(p => !p.starterOnly).length);
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-master-dice.spec.ts -t 'starter dice' --maxWorkers=2` → FAIL (exports missing).
- [ ] **Step 3: Implement** (append to `source-master-dice.ts`; add `import type { TemplateStarterDice } from '@pagosya/store-templates';`)

```ts
/** Spec 2026-10-24-starter-dice: palettes and fonts kept for starters are never rolled for plain Esencial stores. */
export function esencialDiceSettings(settings: MasterSettings): MasterSettings {
  return { ...settings, palettes: settings.palettes.filter(p => !p.starterOnly), fonts: settings.fonts.filter(f => !f.starterOnly) };
}

/** Spec 2026-10-24-starter-dice §1: a starter rolls only the parts it lists, among the ids it allows, with Esencial's rules. */
export function rollStarterDice(input: { seed: string; settings: MasterSettings; dice: TemplateStarterDice; character: MasterCharacter; photoCount: number;
  photoGroups?: boolean; recent: RecentRoll[]; categoryCount?: number }): { variants: Partial<MasterVariants>; palette?: string; fonts?: string } {
  const { palettes, fonts, ...parts } = input.dice;
  const catalogue = Object.fromEntries(Object.entries(parts).filter((entry): entry is [string, readonly string[]] => Array.isArray(entry[1]) && entry[1].length > 0));
  const narrowed: MasterSettings = { ...input.settings, variants: catalogue,
    palettes: palettes?.length ? input.settings.palettes.filter(p => palettes.includes(p.id)) : input.settings.palettes.slice(0, 1),
    fonts: fonts?.length ? input.settings.fonts.filter(f => fonts.includes(f.id)) : input.settings.fonts.slice(0, 1) };
  const rolled = rollVariants({ seed: input.seed, settings: narrowed, character: input.character, photoCount: input.photoCount, photoGroups: input.photoGroups,
    sections: [], recent: input.recent, categoryCount: input.categoryCount });
  const variants = Object.fromEntries(Object.keys(catalogue).map(part => [part, (rolled.variants as unknown as Record<string, string>)[part]])) as Partial<MasterVariants>;
  return { variants, ...(palettes?.length ? { palette: rolled.palette } : {}), ...(fonts?.length ? { fonts: rolled.fonts } : {}) };
}
```

- [ ] **Step 4: Run** the spec file → PASS; `npx tsc --noEmit --incremental false -p .` → clean.
- [ ] **Step 5:** do not commit (`source-master-dice.ts` carries earlier uncommitted work); list the two files in the task report.

---

### Task 3: `applyMaster` lays a starter's roll over its preset

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`assemble`, `applyMaster`)
- Modify: `apps/api/src/storefront-source/storefront-source.module.ts:41` (plan parts use `esencialDiceSettings`)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts` (the `describe('applyMaster from a starter'` block)

**Interfaces:**
- Consumes: `rollStarterDice`, `esencialDiceSettings` (Task 2); `TemplateStarter.dice` (Task 1).
- Produces: `assemble(…, dna?, starterRoll?: { variants: Partial<MasterVariants>; palette?: string; fonts?: string })` — applied **after** the preset.

- [ ] **Step 0:** confirm 0 YAPI jobs.
- [ ] **Step 1: Write the failing tests** — give the block's `starter()` helper a `dice` argument: change its signature to `function starter(brandConfirmed: Array<{ field: string; value: string }> = [], dice?: Record<string, string[]>)` and the fixture's `starter:` to `{ description: 'Postres y dulces.', fits: ['postres', 'dulces', 'tortas'], order: 1, ...(dice ? { dice } : {}) }`. Then add:

```ts
  it('a starter with dice saves a rolled look over its preset (spec 2026-10-24-starter-dice)', async () => {
    const real = jest.requireActual('@pagosya/store-templates');
    const master = real.templateManifest('esencial').master;
    const dice = { hero: ['framed', 'split-left'], palettes: [master.palettes[2].id, master.palettes[3].id], fonts: [master.fonts[2].id, master.fonts[3].id] };
    const { templates, saved, dulce } = starter([], dice);
    await templates.applyMaster('m1', 'store-1', 0, async () => ({ copy: { headline: 'Hola' } }), undefined, undefined, 'dulce');
    const state = readMasterState(saved().files);
    expect(dice.hero).toContain(state.variants?.hero);
    expect(dice.palettes).toContain(state.look?.palette);
    expect(dice.fonts).toContain(state.look?.fonts);
    expect(state.look?.palette).not.toBe(dulce.preset.palette);
    expect(saved().label).toBe('Estilo: Dulce');
    expect(saved().brief).toMatchObject({ starterId: 'dulce' });
  });

  it('brand colours still win over a rolled palette', async () => {
    const real = jest.requireActual('@pagosya/store-templates');
    const master = real.templateManifest('esencial').master;
    const { templates, saved } = starter([{ field: 'accent', value: '#123456' }], { hero: ['framed', 'split-left'], palettes: [master.palettes[2].id, master.palettes[3].id] });
    await templates.applyMaster('m1', 'store-1', 0, async () => null, undefined, undefined, 'dulce');
    expect(readMasterState(saved().files).look?.colors?.accent).toBe('#123456');
  });

  it('plain Esencial never rolls a starter-only palette or font', async () => {
    const dice = jest.requireActual('./source-master-dice');
    const rollSpy = jest.spyOn(dice, 'rollVariants');
    const { templates } = starter();
    await templates.applyMaster('m1', 'store-1', 0, async () => ({ copy: { headline: 'Hola' } }));
    const settings = rollSpy.mock.calls[0][0].settings;
    expect(settings.palettes.some((p: { starterOnly?: boolean }) => p.starterOnly)).toBe(false);
    expect(settings.fonts.some((f: { starterOnly?: boolean }) => f.starterOnly)).toBe(false);
    rollSpy.mockRestore();
  });
```

(The existing «builds from its own files … no dice» test keeps passing: a starter without `dice` is not rolled.)

- [ ] **Step 2: Run** `npx jest src/storefront-source/source-templates.service.spec.ts -t 'starter' --maxWorkers=2` → the first new test FAILS (palette equals the preset's).
- [ ] **Step 3: Implement**

In `assemble`, add the last parameter `starterRoll?: { variants: Partial<MasterVariants>; palette?: string; fonts?: string }` and replace the preset line with:

```ts
    if (preset) {
      fill = withPreset(preset, fill, Boolean(chosen.starter));
      variants = variants ? { ...variants, ...preset.variants } as MasterVariants : preset.variants as MasterVariants;
      // Starter dice (spec 2026-10-24-starter-dice): the roll goes over the starter's preset; the preset keeps every other part,
      // and the brand colours (look.colors) stay as withPreset left them.
      if (starterRoll) {
        variants = { ...variants, ...starterRoll.variants } as MasterVariants;
        fill = { ...fill, look: { ...(fill.look ?? {}), ...(starterRoll.palette ? { palette: starterRoll.palette } : {}), ...(starterRoll.fonts ? { fonts: starterRoll.fonts } : {}) } };
      }
    }
```

In `applyMaster`, change the Esencial dice branch's `settings: manifest.master` to `settings: esencialDiceSettings(manifest.master)`, and right before the `const files = …` line add:

```ts
    // Starter dice (spec 2026-10-24-starter-dice §1): a starter with dice rolls its own lists, seeded by the store.
    const starterRoll = starterManifest?.starter?.dice ? rollStarterDice({ seed: storeId, settings: manifest.master, dice: starterManifest.starter.dice,
      character: fill?.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] },
      photoCount: distinctPhotoCount([...facts.photos, filled?.heroPhoto, filled?.storyPhoto]), recent: await this.recentMasterRolls(storeId), categoryCount: facts.categoryCount }) : undefined;
```

then pass it as the last argument: `this.assemble(…, plan?.dna, starterRoll)`. Import `esencialDiceSettings, rollStarterDice` from `./source-master-dice`.

In `storefront-source.module.ts`, change `const esencialSettings = () => templateManifest(MASTER_TEMPLATE_ID)!.master!;` to `const esencialSettings = () => esencialDiceSettings(templateManifest(MASTER_TEMPLATE_ID)!.master!);` and add `esencialDiceSettings` to the existing `./source-master-dice` import.

- [ ] **Step 4: Run** `npx jest src/storefront-source/source-templates.service.spec.ts src/storefront-source/source-master-dice.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-starters.controller.spec.ts --maxWorkers=2` → PASS; tsc clean.
- [ ] **Step 5:** do not commit (files carry earlier uncommitted work); list them in the report.

---

### Task 4: Calle and Taller dice, checked option by option

**Files:**
- Modify: `packages/store-templates/templates/calle/template.json`, `packages/store-templates/templates/taller/template.json` (`starter.dice`)
- Create: `apps/api/src/storefront-source/source-starter-dice.tool.spec.ts` (capture tool, skipped unless `CAPTURE_STARTER_DICE=1`)

**Interfaces:**
- Consumes: `resolvePresetTemplate`, `templateDemoRevision` (`source-templates.ts`), `withVisualSandbox` (`source-visual-capture.ts`), `SourceProjectsService.prepare`.

- [ ] **Step 1: Add the dice lists**

`calle/template.json` → inside `"starter"`:

```json
"dice": { "hero": ["split-left", "split-right", "framed"], "grid": ["grid3", "side-title", "grid4"], "card": ["plain", "framed"],
  "story": ["split", "quote", "note"], "closing": ["accent", "dark"], "palettes": ["mono", "ink", "sand"], "fonts": ["luxury", "editorial", "gallery-sans"] }
```

`taller/template.json` → inside `"starter"`:

```json
"dice": { "hero": ["stack", "framed", "arch"], "grid": ["side-title", "grid3"], "card": ["framed", "plain"],
  "story": ["split", "note", "quote"], "closing": ["accent", "photo"], "palettes": ["linen", "sand", "terracotta"], "fonts": ["gallery", "editorial", "literary"] }
```

- [ ] **Step 2: Write the capture tool** (confirm 0 YAPI jobs before saving it)

```ts
/** Starter dice check (spec 2026-10-24-starter-dice §1): every option of each starter's dice, one at a time, desktop and phone,
 *  over the demo store, into examples/starter-dice/<starter>/<part>-<id>.png. A tool, not a test.
 *   CAPTURE_STARTER_DICE=1 npx jest source-starter-dice.tool --maxWorkers=1   (optionally STARTER_IDS=calle) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTemplates, templateManifest, templateSourceFiles, type TemplateManifest } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

const run = process.env.CAPTURE_STARTER_DICE === '1' ? it : it.skip;
const OUT = join(__dirname, '../../../../examples/starter-dice');
jest.setTimeout(1_800_000);

run('captures every starter dice option', async () => {
  const wanted = process.env.STARTER_IDS?.split(',').filter(Boolean);
  for (const manifest of listTemplates().filter(m => m.starter?.dice && (!wanted || wanted.includes(m.id)))) {
    const { palettes = [], fonts = [], ...parts } = manifest.starter!.dice!;
    type Option = { name: string; variants: Record<string, string>; palette?: string; fonts?: string };
    const options: Option[] = [
      ...Object.entries(parts).flatMap(([part, ids]) => (ids ?? []).map(id => ({ name: `${part}-${id}`, variants: { [part]: id } }))),
      ...palettes.map(id => ({ name: `palette-${id}`, variants: {}, palette: id })),
      ...fonts.map(id => ({ name: `fonts-${id}`, variants: {}, fonts: id })),
    ];
    mkdirSync(join(OUT, manifest.id), { recursive: true });
    for (const option of options) {
      const forced = { ...manifest, preset: { ...manifest.preset!, variants: { ...manifest.preset!.variants, ...option.variants },
        ...(option.palette ? { palette: option.palette } : {}), ...(option.fonts ? { fonts: option.fonts } : {}) } } as TemplateManifest;
      const resolved = resolvePresetTemplate(forced, templateManifest);
      const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...(await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.sourceId), resolved.preset)) });
      await withVisualSandbox(snapshot, '', undefined, false, async context => {
        for (const [suffix, width, height] of [['', 1280, 1400], ['-phone', 390, 1600]] as const) {
          const page = await context.newPage();
          await page.setViewportSize({ width, height: 900 });
          await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
          await page.evaluate(async () => { await document.fonts.ready; for (const img of Array.from(document.images)) img.loading = 'eager'; });
          await page.waitForTimeout(1200);
          writeFileSync(join(OUT, manifest.id, `${option.name}${suffix}.png`), await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width, height }, animations: 'disabled' }));
          await page.close();
        }
      });
    }
  }
});
```

- [ ] **Step 3:** Run `cd apps/api && CAPTURE_STARTER_DICE=1 STARTER_IDS=calle,taller npx jest source-starter-dice.tool --maxWorkers=1`. Look at every PNG (Read tool). Drop from the lists any option that breaks the starter's character (a hero whose photo vanishes on the phone, a grid that overflows, a palette that loses Taller's warm paper). Each part keeps ≥ 2 ids; if a part drops to 1, remove that part from `dice` (it stays fixed).
- [ ] **Step 4: Run** `cd packages/store-templates && node --test test/*.test.mjs` and `cd apps/api && npx jest src/storefront-source/source-templates-contract.spec.ts -t 'plantilla (calle|taller) ' --maxWorkers=1` → PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/templates/calle/template.json packages/store-templates/templates/taller/template.json apps/api/src/storefront-source/source-starter-dice.tool.spec.ts
git commit -m "feat(templates): Calle and Taller roll their own cover, grid, cards, story, closing, palette and fonts"
```

---

### Task 5: Vitrina rebuilt on Esencial (owner gate)

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (`master.palettes`, `master.fonts`: starter-only entries)
- Create: `packages/store-templates/templates/vitrina-nueva/` (`components/`, `styles/`, `demo/` copied from `templates/esencial/`, plus `template.json`)
- After approval: delete `packages/store-templates/templates/vitrina/`, rename `vitrina-nueva` → `vitrina`
- Modify after the swap: `apps/api/src/storefront-source/source-chat-master.spec.ts`, `apps/api/src/storefront-source/source-starter-pick.spec.ts`, `apps/api/src/storefront-source/source-starters.controller.spec.ts`

- [ ] **Step 1: Starter-only entries** — append to `esencial/template.json` `master.fonts`:

```json
{ "id": "alegre", "name": "Alegre", "heading": "fredoka", "body": "dm-sans", "starterOnly": true }
```

and to `master.palettes`:

```json
{ "id": "cereza", "name": "Cereza", "paper": "#fdf3e3", "ink": "#171311", "muted": "#e8d4f2", "accent": "#d7261e", "deep": "#2a0f0c", "starterOnly": true },
{ "id": "limon", "name": "Limón", "paper": "#fff8e1", "ink": "#1a1a1a", "muted": "#ffe23d", "accent": "#1f5fd1", "deep": "#10213f", "starterOnly": true },
{ "id": "menta", "name": "Menta", "paper": "#f1fbf4", "ink": "#14201a", "muted": "#c9f0d6", "accent": "#ff5a36", "deep": "#0f3b2a", "starterOnly": true },
{ "id": "chicle", "name": "Chicle", "paper": "#fff0f5", "ink": "#221018", "muted": "#ffd1e3", "accent": "#7b3fe4", "deep": "#2b0f3a", "starterOnly": true }
```

(`fredoka` and `dm-sans` are already in `apps/api/src/storefront-source/source-font-catalog.ts`.) Run `node --test test/*.test.mjs` → PASS (Task 1's test proves no preset uses them).

- [ ] **Step 2: The new folder**

```bash
cd packages/store-templates/templates
mkdir -p vitrina-nueva && cp -R esencial/components esencial/styles esencial/demo vitrina-nueva/
node -e "
const fs = require('fs');
const photos = JSON.parse(fs.readFileSync('esencial/template.json', 'utf8')).photos;
const manifest = {
  id: 'vitrina-nueva', name: 'Vitrina', category: 'comida', hidden: true,
  description: 'Marca alegre y atrevida: bordes gruesos, sombras duras, botones redondos y colores vivos.',
  tags: ['comida', 'dulces', 'alegre'], sitePurpose: 'shop', order: 201, curated: true, extends: 'esencial',
  preset: { palette: 'cereza', fonts: 'alegre', variants: { header: 'classic', announce: 'ticker', hero: 'type', grid: 'grid3', card: 'plain', story: 'split', values: 'icons',
    closing: 'accent', footer: 'bigname', pdp: 'gallery-left', pdpOrder: 'details-first', button: 'pill', corners: 'round', density: 'regular', texture: 'none',
    photos: 'rounded', cards: 'compact', offers: 'steps', bands: 'blocks', menu: 'panel', filters: 'chips' } },
  starter: { description: 'Productos hechos en pequeñas tandas con una marca alegre y atrevida: salsas, dulces, snacks, regalos.',
    fits: ['salsas', 'dulces', 'postres', 'snacks', 'regalos', 'alegre', 'picante', 'artesanal'], order: 1,
    dice: { hero: ['type', 'split-left', 'framed'], grid: ['grid3', 'grid4', 'feature'], card: ['plain', 'framed', 'bar'], story: ['split', 'quote', 'note'],
      closing: ['accent', 'newsletter', 'photo'], palettes: ['cereza', 'limon', 'menta', 'chicle'] } },
  photos,
};
fs.writeFileSync('vitrina-nueva/template.json', JSON.stringify(manifest, null, 2) + '\n');"
```

Append to `vitrina-nueva/styles/globals.css`:

```css
/* Vitrina (spec 2026-10-24-starter-dice §2): PEPPA please's character on Esencial — thick outlines, hard offset shadows, pills, round cards. */
.es{--vt-line:var(--es-ink);--vt-shadow:6px 6px 0 var(--vt-line)}
.es .es-header{border-bottom:2.5px solid var(--vt-line)}
.es .es-btn{border:2.5px solid var(--vt-line);border-radius:999px;box-shadow:3px 3px 0 var(--vt-line);font-weight:600;letter-spacing:0;text-transform:none}
.es .es-btn:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 var(--vt-line)}
.es .es-display,.es .es-h2{font-weight:700;letter-spacing:-.01em}
.es .es-hero[data-es-hero="type"]{margin:16px;border:2.5px solid var(--vt-line);border-radius:42px;background:var(--es-deep);color:var(--es-paper);box-shadow:8px 8px 0 var(--es-accent)}
.es .es-hero:not([data-es-hero="type"]) .es-hero__media img{border:2.5px solid var(--vt-line);border-radius:30px;box-shadow:var(--vt-shadow)}
.es .es-card{border:2.5px solid var(--vt-line);border-radius:30px;background:var(--es-paper);box-shadow:var(--vt-shadow);padding:12px;overflow:hidden}
.es .es-card__media{border-radius:20px;overflow:hidden}
.es .es-marquee{border-block:2.5px solid var(--vt-line);background:var(--es-accent);color:var(--es-paper)}
.es .es-closing{margin:24px 16px;border:2.5px solid var(--vt-line);border-radius:42px}
@media (max-width:760px){.es .es-hero[data-es-hero="type"]{margin:8px;border-radius:30px}.es .es-card{border-radius:24px;padding:8px}}
```

- [ ] **Step 3: Contract + captures.** Run `cd apps/api && npx jest src/storefront-source/source-templates-contract.spec.ts -t 'plantilla vitrina-nueva ' --maxWorkers=1` → PASS. Run `CAPTURE_TEMPLATE_PREVIEWS=1 TEMPLATE_IDS=vitrina-nueva npx jest source-templates-previews.tool --maxWorkers=1` and `CAPTURE_STARTER_DICE=1 STARTER_IDS=vitrina-nueva npx jest source-starter-dice.tool --maxWorkers=1`. Read every image; fix the CSS layer where outlines/shadows clip or text loses contrast on a palette; drop broken dice options as in Task 4.
- [ ] **Step 4: STOP — owner gate.** Show the owner `apps/merchant-studio/public/plantillas/vitrina-nueva.webp`, `vitrina-nueva-mobile.webp` and the dice captures under `examples/starter-dice/{vitrina-nueva,calle,taller}/`. Do not continue without approval.
- [ ] **Step 5: Swap (after approval).**

```bash
cd packages/store-templates/templates
git rm -r -q vitrina && mv vitrina-nueva vitrina
node -e "const fs=require('fs');const f='vitrina/template.json';const m=JSON.parse(fs.readFileSync(f,'utf8'));m.id='vitrina';delete m.hidden;fs.writeFileSync(f,JSON.stringify(m,null,2)+'\n')"
cd ../../../apps/merchant-studio/public/plantillas && mv vitrina-nueva.webp vitrina.webp && mv vitrina-nueva-mobile.webp vitrina-mobile.webp
```

Confirm 0 YAPI jobs, then update the three API specs that assumed Vitrina is copy-slots:
- `source-chat-master.spec.ts`: rename `a copy-slots starter is filled through its slots, and the reply and follow-up still come` to `a salsas brand starts from Vitrina on Esencial`; replace its two `applyMaster`/`applyPlantillaFilled` expectations with `expect(applyMaster).toHaveBeenCalledWith('m1', 's1', 0, expect.any(Function), undefined, undefined, 'vitrina'); expect(applyPlantillaFilled).not.toHaveBeenCalled();` and drop the `fillPlantilla` expectation (keep the reply assertions).
- `source-starter-pick.spec.ts`: in the real-list test expect `{ esencial: 'master', vitrina: 'master', calle: 'master', taller: 'master' }`.
- `source-starters.controller.spec.ts`: rename `a swap into a copy-slots starter writes the words again` to `a swap from Calle into Vitrina keeps the words`, and expect `expect(chat.rebuildFromStarter).toHaveBeenCalledWith('m', 's', expect.objectContaining({ id: 'vitrina', kind: 'master' }), 1, { copy: { headline: 'Ropa con calle' }, sections: [{ id: 'faq', title: 'Preguntas', items: [] }] }, { heroPhoto: 'assets/image-1d87bb3f91c7.jpg', storyPhoto: 'http://localhost:3001/v1/uploads/x.jpg', files: [{ path: 'assets/image-1d87bb3f91c7.jpg', content: 'aGVsbG8=', encoding: 'base64' }] });`.

Run `cd packages/store-templates && node --test test/*.test.mjs`, `cd apps/api && npx jest src/storefront-source/source-templates-contract.spec.ts -t 'plantilla vitrina ' --maxWorkers=1` and `npx jest src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-starter-pick.spec.ts src/storefront-source/source-starters.controller.spec.ts src/storefront-source/source-templates.service.spec.ts --maxWorkers=2` → PASS.

- [ ] **Step 6: Commit** (package + Studio pictures; the API specs stay uncommitted)

```bash
git add -A packages/store-templates/templates/esencial/template.json packages/store-templates/templates/vitrina apps/merchant-studio/public/plantillas/vitrina.webp apps/merchant-studio/public/plantillas/vitrina-mobile.webp
git commit -m "feat(templates): Vitrina rebuilt on Esencial — PEPPA's outlines, shadows and pills, rolling its own cover, cards and palette (owner-approved look)"
```

---

### Task 6: The A/B comparison

**Files:**
- Modify: `apps/api/scripts/clone-store-catalog.ts` (`--name` option)
- Create: `apps/api/scripts/starter-ab.mjs` (builds one path)
- Create: `apps/api/scripts/starter-ab-shots.mjs` (captures + comparison page)

**Interfaces:**
- State file `examples/starter-ab/state.json`: `{ "A": { "<key>": { "storeId": string, "revision": number, "label": string } }, "B": { … } }`.

- [ ] **Step 1: `--name`** — in `clone-store-catalog.ts`, after `const from = arg('from'), recordName = arg('record');` add `const name = arg('name');` and in `stores.create(...)` use `name: name ?? source.name`.

- [ ] **Step 2: `starter-ab.mjs`**

```js
// node scripts/starter-ab.mjs <A|B> — builds the five comparison stores for one path (spec 2026-10-24-starter-dice §3).
// Path A needs YAPI_STARTERS=on, path B YAPI_STARTERS=off in apps/api/.env, each with the API restarted first.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const path = process.argv[2];
if (!['A', 'B'].includes(path)) throw new Error('usage: starter-ab.mjs <A|B>');
const base = 'http://localhost:3001', root = join(import.meta.dirname, '../../../examples/starter-ab');
const BUSINESSES = [
  { key: 'boxy', from: 'BOXY', name: 'BOXY', brief: 'Crea la tienda de BOXY, nuestra marca de ropa urbana minimalista: poleras, polerones y gorras en blanco y negro, cortes amplios.' },
  { key: 'lana', from: 'BOXY', name: 'Lana Norte', brief: 'Crea la tienda de Lana Norte: prendas de autor hechas a mano en La Paz, cortes amplios en algodón y lana, piezas únicas.' },
  { key: 'peppa', from: 'PEPPA please', name: 'PEPPA please', brief: 'Crea la tienda de PEPPA please: salsas picantes artesanales hechas en pequeñas tandas, una marca alegre y atrevida.' },
  { key: 'baek', from: 'BAEK Korean Bakehouse', name: 'BAEK Korean Bakehouse', brief: 'Crea la tienda de BAEK Korean Bakehouse: panadería coreana de masa madre, croissants y cajas para cafeterías.' },
  { key: 'maestros', from: 'Atelier Maestros', name: 'Atelier Maestros', brief: 'Crea la tienda de Atelier Maestros: pinturas originales de artistas bolivianos, retratos y paisajes para coleccionistas.' },
];
mkdirSync(root, { recursive: true });
const stateFile = join(root, 'state.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { A: {}, B: {} };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const login = await fetch(`${base}/v1/dashboard/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo-aggregator@pagosya.bo', password: 'pagosYaDev123!' }) });
const h = { authorization: `Bearer ${(await login.json()).token}`, 'content-type': 'application/json' };
const api = (p, init = {}) => fetch(`${base}/v1/stores/${p}`, { headers: h, ...init }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitJob(storeId, id) {
  for (;;) { await sleep(8000); const job = await api(`${storeId}/source-project/chat-jobs/${id}`); if (!['QUEUED', 'RUNNING'].includes(job.status)) return job; }
}
async function cancelFollowUps(storeId) {
  await sleep(4000);
  const job = await api(`${storeId}/source-project/chat-jobs`);
  if (job?.id && ['QUEUED', 'RUNNING'].includes(job.status)) await api(`${storeId}/source-project/chat-jobs/${job.id}/cancel`, { method: 'POST' });
}
for (const b of BUSINESSES) {
  if (state[path][b.key]) continue;
  const record = `starter-ab-${path}-${b.key}`;
  const out = spawnSync('npx', ['ts-node', '--transpile-only', 'scripts/clone-store-catalog.ts', '--from', b.from, '--record', record, '--name', `${b.name} · ${path}`], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
  if (out.status !== 0) throw new Error(out.stderr.slice(-800));
  const { storeId } = JSON.parse(readFileSync(join(import.meta.dirname, '../../../examples', record, 'demo.json'), 'utf8'));
  const send = body => api(`${storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ model: 'auto', motion: 'auto', scrollFeel: 'soft', sitePurpose: 'shop', setupStep: 'conversation', maxCredits: 200, currentPage: 'index.html', revision: 0, assetUrls: [], requestId: randomUUID(), ...body }) });
  let job = await waitJob(storeId, (await send({ instruction: b.brief })).id);
  if (!job.lastCommittedRevision) {
    // Path B: the plan card waits for «Construir».
    const conversation = await api(`${storeId}/source-project/conversation`);
    const card = [...conversation.messages].reverse().find(m => m.role === 'ASSISTANT' && m.metadata?.plan);
    if (!card) throw new Error(`${b.key}: no revision and no plan card (${job.status} ${job.error ?? ''})`);
    job = await waitJob(storeId, (await send({ instruction: 'Construir', planId: card.id })).id);
  }
  await cancelFollowUps(storeId);
  const project = await api(`${storeId}/source-project`);
  const first = project.versions.find(v => v.revision === 1);
  state[path][b.key] = { storeId, revision: 1, label: first?.label ?? '?' };
  save();
  console.log(path, b.key, storeId, first?.label);
}
```

- [ ] **Step 3: `starter-ab-shots.mjs`** (Studio browser mode with API forwarding, proven in the 2026-10-24 live check)

```js
// node scripts/starter-ab-shots.mjs — A vs B home captures (desktop + phone) and examples/starter-ab/index.html.
import { chromium } from '../../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '../../../examples/starter-ab');
const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
const login = await fetch('http://localhost:3001/v1/dashboard/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo-aggregator@pagosya.bo', password: 'pagosYaDev123!' }) });
const { token } = await login.json();
const browser = await chromium.launch();
async function shot(storeId, revision, width, file) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/api/v1/**', async route => { const url = route.request().url().replace(/^https?:\/\/[^/]+\/api\/v1/, 'http://localhost:3001/v1'); await route.fulfill({ response: await route.fetch({ url }) }); });
  await page.addInitScript(t => sessionStorage.setItem('pagosya_merchant_session', t), token);
  await page.goto(`http://127.0.0.1:4323/studio/?browser=1&store=${storeId}&revision=${revision}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(root, file), fullPage: true, clip: { x: 0, y: 0, width, height: width > 600 ? 1600 : 1900 } });
  await page.close();
}
const keys = Object.keys(state.A);
for (const key of keys) for (const path of ['A', 'B']) {
  const s = state[path][key]; if (!s) continue;
  await shot(s.storeId, s.revision, 1280, `${key}-${path}.png`);
  await shot(s.storeId, s.revision, 390, `${key}-${path}-phone.png`);
}
await browser.close();
const row = key => `<section><h2>${key}</h2><div class="pair">${['A', 'B'].map(p => `<figure><figcaption>${p === 'A' ? 'A · estilos con dados' : 'B · Esencial al azar'} — ${state[p][key]?.label ?? ''}</figcaption><img src="${key}-${p}.png"><img src="${key}-${p}-phone.png"></figure>`).join('')}</div></section>`;
writeFileSync(join(root, 'index.html'), `<!doctype html><meta charset="utf-8"><title>A vs B</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f2}section{margin-bottom:48px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;display:grid;grid-template-columns:3fr 1fr;gap:8px;align-items:start}figcaption{grid-column:1/-1;font-weight:600}img{width:100%;border:1px solid #ddd;background:#fff}</style>${keys.map(row).join('')}`);
console.log('open', join(root, 'index.html'));
```

- [ ] **Step 4: Run path A.** Confirm 0 YAPI jobs. Set `YAPI_STARTERS=on` in `apps/api/.env`; restart the API by making a real edit to a comment in `src/storefront-source/source-starters.service.ts` (a bare `touch` does not restart the watcher) and wait until the `:3001` listener pid changes. Run `cd apps/api && node scripts/starter-ab.mjs A`. Expected: 5 lines; BOXY and Lana Norte on Calle and Taller, PEPPA and BAEK on Vitrina, Maestros «Plantilla: Esencial».
- [ ] **Step 5: Run path B.** Confirm 0 jobs, set `YAPI_STARTERS=off`, restart the same way, run `node scripts/starter-ab.mjs B`. Expected: 5 lines, labels «Plantilla: …».
- [ ] **Step 6: Captures.** `node scripts/starter-ab-shots.mjs`, then `open ../../examples/starter-ab/index.html`. Read a few PNGs to confirm photos loaded (no grey product boxes); if photos are missing, check the store's `imageUrls` files exist before blaming the capture.
- [ ] **Step 7: STOP — owner review.** Show the owner the comparison page; ask which path they prefer and which 2 stores get the full YAPI redesign. Leave `YAPI_STARTERS` at the owner's choice.
- [ ] **Step 8: Commit** the two new scripts only (`clone-store-catalog.ts` stays uncommitted):

```bash
git add apps/api/scripts/starter-ab.mjs apps/api/scripts/starter-ab-shots.mjs
git commit -m "chore(api): starter A/B comparison scripts — five businesses built per path, side-by-side captures"
```
