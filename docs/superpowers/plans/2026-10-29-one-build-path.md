# One Build Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new store is built one way: the Esencial template as it was on Oct 22 2026 (commit `425e86af`, the version that built NOA VARGAS `vd115lxy` / `ewm6alv6` revision 1), filled by one call, then the data-only polish. No AI design step after it.

**Architecture:** The Esencial template files go back to `425e86af`, and four later template changes the owner keeps are applied on top: the footer newsletter, the newsletter/product-page/blog fixes, the closing-photo fixes, and the merchant video cover. The API stops choosing families, effects, modules and the «animada» look. The switches' code defaults become the one path: polish on, redesign / personal touch / skeletons off. Platform features (dropdown menus, filters, search, photo zoom, calm checkout, popups, collections, product pages, standard pages) live in the kit and the API and are untouched.

**Tech Stack:** Next.js-style TSX templates in `packages/store-templates` (tests: `node --test`), NestJS API in `apps/api` (tests: jest), the storefront kit in `packages/storefront-kit`.

**Spec:** the owner's decisions below (2026-10-29 conversation); there is no separate spec file.

## Owner decisions (2026-10-29)

- «stick to 1 plan»; «i like it better without the personal touch».
- Template + data-only polish is the only build path. Merchant requests after the build stay small edits by chat.
- «keep things like dropdown menus, and etc» — every platform feature stays.
- «i would want the templates that created this store» (NOA VARGAS rev 1, Oct 22 13:48 / 13:51) → **replace today's Esencial** with the Oct 22 one.
- Oct 27 extras: **keep the merchant video as cover**; «esencial only not families» → drop families, effects (bubbles, shapes, petals, steam, sparkles, confetti), the chunky sticker look and the hero photo crossfade.
- Fixes to the template come from template-only builds (Task 5), not from Andes/Atelier: their defects were in the sol redesign (rev 2), not in the template.

## Global Constraints

- Never run `prisma migrate`, `prisma db push` or `prisma migrate reset` (memory: dev DB guard). This plan needs no migration.
- Never edit files under `apps/api` while a YAPI job is RUNNING (saving restarts `nest --watch` and kills the job). Check first: `SELECT id, status FROM "StoreSourceChatJob" WHERE status = 'RUNNING';` must return no rows.
- Never use `sed -i` on files under `apps/api/src` (the watcher stops compiling them); use the Edit tool.
- Type-check the API with `npx tsc --noEmit --incremental false -p apps/api/tsconfig.json`, never plain `--noEmit`.
- Start the stack with `pnpm dev:chatgpt`, never `pnpm dev` (paid credits).
- Existing stores keep their own copied template files; nothing here rewrites a built store.
- Commit after each task, never push.

## Review Focus

1. **A store whose stored variants name a part the Oct 22 template no longer has** (family `pop`, footer `statement`, `heroFade: fade`) gets a chat edit: the refill must still save and render, ignoring the unknown part. Test in Task 3 Step 6.
2. **A bakery or sweets store** (`isTreatBusiness`) built today: no sticker look, no playful font, no animated DNA. Test in Task 3 Step 1.
3. **A clothing store** still gets the fashion cards, Mujer/Hombre collections, usual sizes and a dropdown menu on its first build: the platform features must survive the template swap. Test in Task 3 Step 1 (fill still carries `menu`) and Task 5 live check.
4. **A merchant who attaches a video**: it plays as the cover on the Oct 22 hero. Test in Task 2 Step 5 (template test from `d9b1361c`).
5. **The API started with no YAPI_* variables at all** (a fresh machine, production) builds the one path. Test in Task 4 Step 1.

---

### Task 1: Commit the pending agent-loop review fixes

The working tree holds review fixes from the agent-cost plan (`agent-loop.ts`, `agent-loop.spec.ts`, `source-agent-stage.ts`). The agent still runs every chat edit, so they stay.

**Files:**
- Modify (already modified, uncommitted): `apps/api/src/storefront-source/agent/agent-loop.ts`, `apps/api/src/storefront-source/agent/agent-loop.spec.ts`, `apps/api/src/storefront-source/source-agent-stage.ts`

**Interfaces:**
- Produces: `agentShouldContinue(outcome, { calls, wallMs, aborted, finished, clean })` — `clean` is new.

- [ ] **Step 1: Run the agent tests**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-loop.spec.ts`
Expected: PASS, every test, including «never continues a draft that already passed its checks».

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --incremental false -p apps/api/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-loop.ts apps/api/src/storefront-source/agent/agent-loop.spec.ts apps/api/src/storefront-source/source-agent-stage.ts
git commit -m "fix(yapi): a time stop continues like a step stop; a draft that passed its checks is never reopened"
```

---

### Task 2: Esencial back to Oct 22, with the kept additions

**Files:**
- Replace: `packages/store-templates/templates/esencial/**` (from `425e86af`)
- Modify: `packages/store-templates/templates/esencial/template.json`
- Modify: `packages/store-templates/index.js:109`
- Modify: `packages/store-templates/templates/{catalogo,maison,mesa,ritual,tecno,calle,taller,vitrina}/template.json` (add `"hidden": true`)
- Replace: `packages/store-templates/test/esencial.test.mjs` (from `425e86af`, then kept hunks)
- Modify: `packages/store-templates/test/starters.test.mjs`, `packages/store-templates/test/presets.test.mjs`

**Interfaces:**
- Produces: `templateManifest('esencial').master.variants` holds only the Oct 22 parts. The parts `family, heroFade, outline, sticker, popOrder, effect, confetti, module, heroShape, heroSize, heroPlain, heroFocus` are gone, and footer has no `statement|card|photo`.
- Produces: the starter-only palettes `cereza, limon, menta, chicle` and font `alegre` stay in the lists (flag `starterOnly: true`, never rolled for Esencial).
- Produces: hidden presets skip `validatePreset`.

A trial in a scratch copy (2026-10-29) showed exactly these failures after the swap: Vitrina's palette not in the list, Maison's `heroFade`, the palette count, Vitrina now hidden, and the footer newsletter. Each step below answers one of them.

- [ ] **Step 1: Restore the Oct 22 files**

```bash
git rm -r -q packages/store-templates/templates/esencial
git checkout 425e86af -- packages/store-templates/templates/esencial packages/store-templates/test/esencial.test.mjs
```

- [ ] **Step 2: Put back the starter-only list entries and the `starter` block**

Run this from the repo root (it reads HEAD's manifest and writes the restored one):

```bash
python3 - <<'EOF'
import json, subprocess
path = 'packages/store-templates/templates/esencial/template.json'
old = json.load(open(path))
head = json.loads(subprocess.check_output(['git', 'show', 'HEAD:' + path]))
for key in ('palettes', 'fonts'):
    have = {x['id'] for x in old['master'][key]}
    old['master'][key] += [x for x in head['master'][key] if x.get('starterOnly') and x['id'] not in have]
if 'starter' in head: old['starter'] = head['starter']
json.dump(old, open(path, 'w'), indent=2, ensure_ascii=False)
open(path, 'a').write('\n')
EOF
```

- [ ] **Step 3: Apply the four kept template changes**

```bash
for c in 06efc8e5 3f3ad199 78c2b5fb d9b1361c; do
  git diff $c^ $c -- packages/store-templates/templates/esencial packages/store-templates/test/esencial.test.mjs | git apply -3 --index || echo "CONFLICT in $c"
done
```

Expected: no `CONFLICT` line. If one appears, open the file with conflict markers. Keep the Oct 22 line plus the commit's added lines, and drop anything that mentions `family`, `effect`, `sticker`, `outline`, `heroFade` or `module`. Then run `git add` on the file.

What each one brings: `06efc8e5` newsletter entry in the footer (Shell.tsx + globals.css). `3f3ad199` the newsletter email typed in the page, product page photo beside text, readable blog list, spaced card price. `78c2b5fb` no photo row unless asked, closing photo never the hero, catalog keeps half its bottom space, headings never repeat. `d9b1361c` the merchant's video as the full-width cover.

- [ ] **Step 4: Hide the skeletons and starters; skip hidden presets' check**

```bash
python3 - <<'EOF'
import json
for t in ['catalogo', 'maison', 'mesa', 'ritual', 'tecno', 'calle', 'taller', 'vitrina']:
    p = f'packages/store-templates/templates/{t}/template.json'
    m = json.load(open(p)); m['hidden'] = True
    json.dump(m, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
EOF
```

In `packages/store-templates/index.js` line 109, change:

```js
  for (const { manifest } of entries) if (manifest.preset) validatePreset(manifest, entries.find(entry => entry.manifest.id === manifest.extends)?.manifest);
```

to:

```js
  // Owner 2026-10-29 («esencial only»): skeletons and starters are hidden and built on newer Esencial parts; only live presets are checked.
  for (const { manifest } of entries) if (manifest.preset && manifest.hidden !== true) validatePreset(manifest, entries.find(entry => entry.manifest.id === manifest.extends)?.manifest);
```

- [ ] **Step 5: Run the template tests and fix the three known test expectations**

Run: `cd packages/store-templates && node --test --test-reporter=tap test/*.test.mjs | grep -E '^# (pass|fail)|^\s*not ok'`

Expected failures, and the fix for each:

1. `esencial is the hidden master template` (20 !== 16). In `test/esencial.test.mjs`, replace the palette and font count lines with:
```js
  // Starter-only entries are Vitrina's; Esencial's own catalogue is what its dice roll.
  assert.equal(esencial.master.palettes.filter(p => !p.starterOnly).length, 16);
  assert.equal(esencial.master.fonts.filter(f => !f.starterOnly).length, 14);
```
2. `vitrina is built on Esencial…` in `test/starters.test.mjs`: the test reads `hidden` as undefined. Change that assertion to `assert.equal(vitrina.hidden, true);` and add above it the comment `// Owner 2026-10-29: starters are off; Vitrina stays for stores already built from it.`
3. `a preset has no source of its own…` in `test/presets.test.mjs`: its expected file list must equal `templateSourceFiles('esencial').map(f => f.path).sort().join(',')` for the restored template. If the test hard-codes the list, replace the literal with that expression.

Any other failure is a real regression from the swap. Fix the template file, not the test.

Run again. Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add -A packages/store-templates
git commit -m "feat(esencial): back to the Oct 22 template (NOA VARGAS rev 1) with footer newsletter, product page, closing-photo fixes and video cover; skeletons and starters hidden"
```

---

### Task 3: The API stops choosing families, effects, modules and the animated look

Check first that no YAPI job is RUNNING (Global Constraints).

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (imports lines 5, 10, 12; `useMasterTemplate` ~377–388 and the reply ~431; chat edits ~705–711 and ~1259)
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (imports 1–3; ~165–176, ~206–212, ~230, ~231 `playfulFont`)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (import line 1 `ANIMATED_DNA`)
- Modify: `apps/api/src/storefront-source/source-master.ts:27-34` (drop `animated`, `effects`, `module` from `MasterFill`; keep `family?` out too)
- Delete: `source-master-family.ts`, `source-master-effects.ts`, `source-master-module.ts`, `source-master-animated.ts` and their `.spec.ts`
- Test: `apps/api/src/storefront-source/source-chat-master.spec.ts`, `apps/api/src/storefront-source/source-templates.service.spec.ts` (or the spec that already tests `applyMaster`; find it with `grep -ln "applyMaster" apps/api/src/storefront-source/*.spec.ts`)

**Interfaces:**
- Consumes: Task 2's manifest (no family/effect parts).
- Produces: `MasterFill` without `family`, `animated`, `effects`, `module`. The filler passed to `applyMaster` returns the fill call's read plus `namedColours` only.

- [ ] **Step 1: Write the failing tests**

In `source-chat-master.spec.ts`, delete the two tests at ~866–882 («a first build asked to be animated…» and «a first build of an animated store carries the effect…») and the test at ~250 («an animated-store request on a master store is a data change…»). Add in their place:

```ts
// Owner 2026-10-29 («esencial only not families»): the first build is the Oct 22 Esencial — no family, effect, module or animated look,
// whatever the business sells or the merchant writes. Platform features (sizes, collections, menu) are untouched.
it('a first build carries no family, effects, module or animated look, even for a bakery that asks for «animada»', async () => {
  const reads: any[] = [];
  applyMaster.mockImplementation(async (_m, _s, _r, filler) => { reads.push(await filler({ storeName: 'Dulce Horno', products: ['Torta de chocolate', 'Galletas'], photos: ['https://x/p1.jpg'] })); return { revision: 1, label: 'Plantilla: Esencial' }; });
  fillMaster.mockResolvedValue({ copy: {}, menu: { style: 'dropdowns' } });
  const out = await send('Mi negocio se llama Dulce Horno.\nQué hacemos: pastelería y galletas.\nQuiero una tienda muy animada, como un menú.\nCrea mi tienda.');
  expect(reads[0]).not.toHaveProperty('family');
  expect(reads[0]).not.toHaveProperty('effects');
  expect(reads[0]).not.toHaveProperty('module');
  expect(reads[0]).not.toHaveProperty('animated');
  expect(reads[0]?.menu).toEqual({ style: 'dropdowns' });
  expect(out.assistantMessage.content).not.toContain('hazla animada');
});
```

In the spec that tests `SourceTemplatesService.applyMaster` (Review Focus 1 and 2), add:

```ts
// Owner 2026-10-29: a fill that still names an old family or effects (a stale caller, a stored fill) never reaches the variants.
it('applyMaster ignores family, effects and animated on a fill', async () => {
  const saved = await applyWith({ family: 'pop', effects: { effect: 'bubbles', confetti: 'on' }, animated: true } as any);
  const variants = storeDataVariants(saved);
  for (const part of ['family', 'effect', 'confetti', 'outline', 'sticker', 'module']) expect(variants).not.toHaveProperty(part);
});
```

`applyWith` and `storeDataVariants` stand for the helpers that spec already uses to call `applyMaster` and read the saved `store-data` variants. Use the existing ones under their real names; if the spec has none, build them from that spec's first `applyMaster` test and keep them local to the new test.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts -t "no family"`
Expected: FAIL — `reads[0]` has `family`.

- [ ] **Step 3: Remove the choosing code**

In `source-chat.service.ts` `useMasterTemplate`, delete the lines that compute `animated`, `effects`, `family` and `storeModule`, with their comments (~376–385). Replace the filler wrapper (~388) with:

```ts
    { const plain = filler; filler = async facts => { const read = await plain(facts); return read && namedColours.length ? { ...read, namedColours } : read; }; }
```

In the reply (~431), remove `${animated ? '' : ` ${ANIMATED_OFFER}`}`.

In the chat-edit path (~705–711), delete `lively` and `namedEffects` and the `if (lively) …` branch. In ~1259, delete the `asksForAnimatedStore(…) || Boolean(effectsFor(…).effect)` condition: the request then goes the normal way, a small edit. Remove the imports of `moduleFor`, `familyFor` and the `source-master-animated` names.

In `source-templates.service.ts`, delete the `fill?.animated` line (~165), the family block (~166–172), the effects line (~175), and the `dna` override (~176). Write `const dna = plan?.dna;` instead. Set `lively` (~209–211) to `{}`, drop `fill?.module` from `own` (~212), delete line ~230 (`own.module`), and set `playfulFont` to `undefined` (~231). Remove imports lines 1–3. In `source-templates.ts`, remove the `ANIMATED_DNA` import and any use of it. When you have deleted the modules, `grep -n ANIMATED_DNA` will find what's left.

In `source-master.ts`, remove `animated?`, `effects?` and `module?` (and `family?` if present) from `MasterFill`.

Delete the modules:

```bash
git rm apps/api/src/storefront-source/source-master-{family,effects,module,animated}.ts apps/api/src/storefront-source/source-master-{family,effects,module,animated}.spec.ts
```

- [ ] **Step 4: Type-check, then find what still refers to them**

Run: `npx tsc --noEmit --incremental false -p apps/api/tsconfig.json`
Expected: errors only where a deleted name is still used. Remove each such use the same way (the feature is gone, not replaced). Run again until clean.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-master src/storefront-source/source-templates --maxWorkers=2`
Expected: the two new tests PASS. Fix a failure that asserts a removed feature (family, effect, animated, module, sticker, outline) by deleting that assertion or test. Anything else is a regression; fix the code.

- [ ] **Step 6: The stale-variants refill (Review Focus 1)**

In the refill spec (`source-master-refill.spec.ts`), add:

```ts
// Owner 2026-10-29: stores built Oct 27–29 keep variants the Oct 22 template no longer reads; a chat edit still saves.
it('a refill keeps working when the stored variants name parts the template no longer has', () => {
  const state = { ...baseState, variants: { ...baseState.variants, family: 'pop', heroFade: 'fade', footer: 'statement', effect: 'bubbles' } };
  expect(() => refillWith(state, { headline: 'Nuevo título' })).not.toThrow();
});
```

`baseState` and `refillWith` stand for that spec's existing master-state fixture and refill call. Use them under their real names.

Run: `cd apps/api && npx jest src/storefront-source/source-master-refill.spec.ts`
Expected: PASS. If it throws, make `refillMasterFiles` ignore variant parts the manifest does not list.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/storefront-source
git commit -m "feat(yapi): the first build is plain Esencial — no families, effects, modules or animated look"
```

---

### Task 4: The one path is the default

**Files:**
- Modify: `apps/api/src/config/configuration.ts:511-517` (defaults) and the matching doc comments ~109–128
- Modify: `apps/api/.env` (owner's dev env)
- Test: `apps/api/src/config/configuration.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Produces: with no YAPI_* variables, `yapiMasterPolish === true`, and `yapiPeppaRedesign`, `yapiPersonalTouch`, `yapiSkeletons`, `yapiGuardedTouch`, `yapiStarters`, `yapiFreeFirst` are all `false`.

- [ ] **Step 1: Write the failing config test**

Add to `configuration.spec.ts`. Follow how that file already loads the config: reuse its existing env-reset helper, or set and restore `process.env` around the call as it does.

```ts
// Owner 2026-10-29 («stick to 1 plan»): with no YAPI switches set, a new store is Esencial + the data-only polish, nothing after it.
it('defaults to the one build path', () => {
  for (const key of ['YAPI_MASTER_POLISH', 'YAPI_PEPPA_REDESIGN', 'YAPI_PERSONAL_TOUCH', 'YAPI_SKELETONS', 'YAPI_GUARDED_TOUCH', 'YAPI_STARTERS', 'YAPI_FREE_FIRST']) delete process.env[key];
  const app = configuration().app;
  expect(app.yapiMasterPolish).toBe(true);
  expect(app.yapiPeppaRedesign).toBe(false);
  expect(app.yapiPersonalTouch).toBe(false);
  expect(app.yapiSkeletons).toBe(false);
  expect(app.yapiGuardedTouch).toBe(false);
  expect(app.yapiStarters).toBe(false);
  expect(app.yapiFreeFirst).toBe(false);
});
```

Run: `cd apps/api && npx jest src/config/configuration.spec.ts -t "one build path"`
Expected: FAIL on `yapiMasterPolish`.

- [ ] **Step 2: Change the defaults**

```ts
    yapiPersonalTouch: process.env.YAPI_PERSONAL_TOUCH === 'on',
    yapiPeppaRedesign: process.env.YAPI_PEPPA_REDESIGN === 'on',
    yapiMasterPolish: process.env.YAPI_MASTER_POLISH !== '0',
    yapiSkeletons: process.env.YAPI_SKELETONS === 'on',
```

Update the four doc comments to say «Default off since 2026-10-29 (one build path); …=on enables», or «Default on since 2026-10-29; YAPI_MASTER_POLISH=0 disables» for the polish.

- [ ] **Step 3: Pin the path in the chat spec**

In `source-chat-master.spec.ts`, set the one-path defaults in `beforeEach`. Replace the `config = new Map(...)` line with:

```ts
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiStylePick', true], ['app.yapiSkeletons', false],
    ['app.yapiMasterPolish', true], ['app.yapiPeppaRedesign', false], ['app.yapiPersonalTouch', false]]);
```

Add:

```ts
// Owner 2026-10-29: the only follow-up of a new store is the polish — never a redesign, a first design or a personal touch brief.
it('a new store\'s only follow-up is the data-only polish', async () => {
  const out = await send('Mi negocio se llama Café Buna.\nQuiero una página de recetas y un estilo propio.\nCrea mi tienda.');
  expect(out.followUp).toMatchObject({ polish: true, revision: 1 });
  expect(out.followUp.redesign).toBeUndefined();
  expect(out.followUp.firstDesign).toBeUndefined();
  expect(out.followUp.instruction.startsWith(MASTER_POLISH_BRIEF)).toBe(true);
});
```

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts src/config/configuration.spec.ts --maxWorkers=2`
Expected: the new tests PASS. Tests that were written for the personal touch, starters or the PEPPA redesign already set their switch on in their own body. If one relied on the old default, set its switch explicitly in that test.

- [ ] **Step 4: Align the owner's dev env**

In `apps/api/.env`, set `YAPI_PEPPA_REDESIGN=off`, `YAPI_MASTER_POLISH=1`, `YAPI_PERSONAL_TOUCH=off`, `YAPI_GUARDED_TOUCH=0`, `YAPI_STARTERS=off`, and add `YAPI_SKELETONS=off`. Leave every other line as it is. The file is not committed.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit --incremental false -p apps/api/tsconfig.json` — expected: no errors.

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/configuration.spec.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(yapi): one build path by default — Esencial + data-only polish; redesign, personal touch, skeletons and starters off"
```

---

### Task 5: Live check against the Oct 22 NOA, and the defect list

Needs the stack and ChatGPT plan quota. Ask the owner before starting it, because it builds stores on their dev account.

**Files:**
- Create: `examples/one-path-<name>/` records (written by the clone script)
- Create: `docs/superpowers/plans/2026-10-29-one-build-path-findings.md`

- [ ] **Step 1: Restart on the new code**

Note the ports in use (`lsof -iTCP -sTCP:LISTEN -P | grep node`). Stop the stack and start it with `pnpm dev:chatgpt`. Then rebuild the Studio with `pnpm build:studio` (it embeds the kit and template previews). Wait for the API on :3001 to answer `GET /v1/health`.

- [ ] **Step 2: Clone four catalogs**

```bash
cd apps/api
for pair in "NOA VARGAS Atelier:noa" "PEPPA please:peppa" "Remolino:remolino" "DooBoo:dooboo"; do
  npx ts-node --transpile-only scripts/clone-store-catalog.ts --from "${pair%%:*}" --record one-path-${pair##*:} --name "${pair%%:*} · one path"
done
```

Expected: four `examples/one-path-*/demo.json` files with new store ids.

- [ ] **Step 3: Build each one the real way**

Open each cloned store in the dashboard → YAPI, and send the merchant's first message as the owner would. For NOA use the Amboras prompt from 2026-10-29 (bridal / evening wear, quiet and editorial, size guide and policies). Attach the `~/Downloads/rg` photos except 8, 10 and 12. Wait for revision 1 (template) and revision 2 («Pulido de YAPI»). Never script the design (memory: test stores are designed by YAPI).

- [ ] **Step 4: Check and screenshot**

Run: `npx ts-node --transpile-only scripts/check-store-quality.ts <the four slugs>`. Read every line except the page-height bar (≥7000 px belongs to the Oct 28 long-page programme, not to the Oct 22 template). Screenshot revisions 1 and 2 of each at 1280 and 390 px. Put NOA's next to the Oct 22 NOA `vd115lxy` / `ewm6alv6` revision 1.

- [ ] **Step 5: Write the findings and add them to the comparison page**

Write in `2026-10-29-one-build-path-findings.md`, per store:
- what is wrong (broken, repeated photo, empty box, words that ignore the merchant)
- whether the template or the polish caused it
- whether a dropdown menu, filters, search, zoom, sizes and collections are present

List the size-guide and policy pages as asked-for-but-missing items: they are the next small plan, not this one. Add a «One build path (Oct 29)» section to the comparison page (https://claude.ai/artifact/5v5TAbCg1Y4tpyegmJFEsF) with the screenshots. Show the list to the owner before fixing anything in it.

- [ ] **Step 6: Commit the findings**

```bash
git add docs/superpowers/plans/2026-10-29-one-build-path-findings.md
git commit -m "docs(yapi): one build path live check — four stores, findings for the owner"
```
