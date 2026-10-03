# Boceto Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a store's current revision has `sketch.json`, the Studio shows only the Boceto (with YAPI as a right-panel tab using the selected block as context); "Generar sitio" asks once, then saves the site without `sketch.json`, and the normal Studio takes over for good.

**Architecture:** The phase is derived, not stored: `sketch.json` present ⇔ boceto. The API gains a deterministic `POST sketch/build` and a smarter keep rule for `sketch.json` in `SourceProjectsService.save`. The Studio derives `bocetoOpen` from the phase, docks the existing agent panel on the right when the Boceto panel's YAPI tab is open, and wires Boceto block selection into the existing chat selection chip.

**Tech Stack:** NestJS + Jest (apps/api), vanilla TS + Vitest/jsdom (apps/merchant-studio).

**Spec:** `docs/superpowers/specs/2026-10-03-boceto-phase-design.md`

## Global Constraints

- Build label, verbatim: `Sitio generado desde el boceto`.
- Confirmation copy, verbatim: `Tu boceto se convertirá en sitio web. Después ya no podrás editarlo por bloques; podrás pedirle cambios a YAPI y ver el código.` Buttons `Cancelar` / `Generar sitio`.
- Success toast, verbatim: `Sitio generado desde tu boceto. Revísalo y publícalo cuando quieras.`
- Build failure copy: `No se pudo generar. Inténtalo de nuevo.`; 409 copy: `El boceto cambió. Revisa la versión más reciente y vuelve a generar.`
- Chat selection for a block: `{ sectionId: 'skb-<blockId>', label: <TYPE_LABEL> }`; the account page (`id 'account'`) is never a chat target.
- Never run `prisma migrate/diff/reset`; no schema change is needed.
- The owner's dev servers read this working tree; after Studio changes run `pnpm run build:studio` in apps/merchant-dashboard.

## Review Focus

1. A merchant uploads a photo in the Boceto (`Foto añadida al boceto`) → the store must stay a boceto (pinned in Task 1).
2. Generar sitio pressed with an unsaved Boceto edit pending → the edit must be in the built site (pinned in Task 3: `flush()` before `build`).
3. Generar sitio while another tab already saved a newer revision → 409, the merchant stays in the Boceto with the 409 copy (pinned in Task 4).
4. The merchant clears the block chip, then keeps editing in Diseño → the chip must not reappear until they pick a block again (pinned in Task 3: `selected` only fires on change).
5. The right panel is tucked while the YAPI tab is open → the docked chat must disappear with it (pinned in Task 3).

---

### Task 1: API — keep `sketch.json` on saves that leave the page untouched

**Files:**
- Modify: `apps/api/src/storefront-source/source-projects.service.ts` (`save`, ~line 149)
- Test: `apps/api/src/storefront-source/source-projects.service.spec.ts` (`describe('sketch.json lifecycle (sketch-first C1)')`)

**Interfaces:**
- Produces: `SourceProjectsService.save` keeps `sketch.json` when `label === 'Boceto editado'` **or** every `nextSourceFile` path in `input.files` matches the base revision's (`input.revision`) bytes and the set of component paths is identical.

- [ ] **Step 1: Write the failing tests** (append inside the existing lifecycle describe; the harness's `input()` files are not components, so add one)

```ts
  const component = { path: 'components/home.tsx', content: 'export default function Home() { return <main />; }' };
  const boceto = () => ({ ...input(), label: 'Boceto editado', files: [...input().files, component, { path: 'sketch.json', content: '{"blocks":[]}' }] });
  it('a save that leaves the page components untouched keeps the boceto (photo upload, asset roles)', async () => {
    const { service, read } = setup();
    await service.save('m1', 's1', boceto());
    await service.save('m1', 's1', { ...boceto(), revision: 1, label: 'Foto añadida al boceto', files: [...boceto().files, { path: 'assets/new.jpg', content: 'abcd', encoding: 'base64' as const }] });
    expect(read().versions[1].snapshot.files.some((f: any) => f.path === 'sketch.json')).toBe(true);
  });
  it('a save that changes a page component still drops the boceto', async () => {
    const { service, read } = setup();
    await service.save('m1', 's1', boceto());
    await service.save('m1', 's1', { ...boceto(), revision: 1, label: 'Edición de components/home.tsx', files: boceto().files.map(f => (f.path === component.path ? { ...f, content: f.content.replace('<main />', '<main>x</main>') } : f)) });
    expect(read().versions[1].snapshot.files.some((f: any) => f.path === 'sketch.json')).toBe(false);
  });
```

- [ ] **Step 2: Run to verify the first fails**

Run: `cd apps/api && npx jest src/storefront-source/source-projects.service.spec.ts -t "sketch.json lifecycle"`
Expected: "keeps the boceto" FAILS (sketch.json dropped); the other passes.

- [ ] **Step 3: Implement** (replace the single strip line in `save`; import `nextSourceFile` from `./source-next` if not already imported)

```ts
    // sketch.json may only travel with a save that derives the components from it (a Boceto edit or a generation
    // that just assembled them) or that leaves them byte-identical (a photo upload, asset roles): then the sketch
    // still describes the page. Any other save edited the components directly, so a carried-over sketch would be
    // stale and a later Boceto save would silently revert those edits.
    if (!generation && input.label !== 'Boceto editado' && input.files.some(file => file.path === 'sketch.json') && !(await this.componentsUnchanged(merchantId, storeId, input))) {
      input = { ...input, files: input.files.filter(file => file.path !== 'sketch.json') };
    }
```

and add the private helper next to `save`:

```ts
  /** True when every page component (`nextSourceFile`) of the save is byte-identical to the base revision's. */
  private async componentsUnchanged(merchantId: string, storeId: string, input: SaveSourceProjectDto): Promise<boolean> {
    if (!input.revision) return false;
    const base = await this.version(merchantId, storeId, input.revision).catch(() => null);
    const before = new Map(((base?.snapshot as { files?: SourceProjectFileDto[] } | undefined)?.files ?? []).filter(file => nextSourceFile(file.path)).map(file => [file.path, file.content]));
    const after = input.files.filter(file => nextSourceFile(file.path));
    return after.length === before.size && after.every(file => before.get(file.path) === file.content);
  }
```

- [ ] **Step 4: Run the whole spec**

Run: `cd apps/api && npx jest src/storefront-source/source-projects.service.spec.ts`
Expected: all PASS (the existing "plain save strips" test still passes: revision 0 has no base).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-projects.service.ts apps/api/src/storefront-source/source-projects.service.spec.ts
git commit -m "fix(boceto): photo uploads and asset roles no longer end the boceto"
```

### Task 2: API — `POST sketch/build` turns the boceto into the site

**Files:**
- Modify: `apps/api/src/storefront-source/sketch-studio.service.ts` (add `build`)
- Modify: `apps/api/src/storefront-source/sketch-studio.controller.ts` (route + DTO)
- Test: `apps/api/src/storefront-source/sketch-studio.service.spec.ts`

**Interfaces:**
- Produces: `SketchStudioService.build(merchantId: string, storeId: string, input: { revision: number }): Promise<{ revision: number }>`; route `POST v1/stores/:storeId/source-project/sketch/build` body `{ revision: number }`.

- [ ] **Step 1: Write the failing tests** (append to the spec; `setup()` already provides a boceto snapshot at revision 3)

```ts
describe('build ("Generar sitio")', () => {
  it('saves the assembled site without sketch.json, keeping assets and runtime', async () => {
    const { service, projects } = setup();
    expect(await service.build('m', 's', { revision: 3 })).toEqual({ revision: 4 });
    const input = projects.save.mock.calls[0][2];
    expect(input.label).toBe('Sitio generado desde el boceto');
    expect(input.files.some((f: any) => f.path === 'sketch.json')).toBe(false);
    expect(input.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('data-skb-group');
    expect(input.files.some((f: any) => f.path === 'assets/a.jpg')).toBe(true);
    expect(input.files.some((f: any) => f.path === 'commerce.js')).toBe(true);
  });
  it('refuses a stale revision and a store that is already a site', async () => {
    const { service, projects } = setup();
    await expect(service.build('m', 's', { revision: 2 })).rejects.toThrow('El boceto cambió');
    const plain = setup(false);
    await expect(plain.service.build('m', 's', { revision: 3 })).rejects.toThrow('ya es un sitio');
    expect(projects.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/sketch-studio.service.spec.ts -t build`
Expected: FAIL with "service.build is not a function".

- [ ] **Step 3: Implement** (service, after `update`)

```ts
  /** "Generar sitio": the boceto becomes the site, for good. Same deterministic assembly as a Boceto save, saved
   * without sketch.json, so every later save edits the site directly and the Studio leaves the boceto phase. */
  async build(merchantId: string, storeId: string, input: { revision: number }): Promise<{ revision: number }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    if (!snapshot || revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    const stored = snapshot.files.find(file => file.path === SKETCH_FILE)?.content;
    if (!stored) throw new BadRequestException('Esta tienda ya es un sitio.');
    const ctx = await this.context(merchantId, storeId, snapshot);
    let parsed: unknown;
    try { parsed = JSON.parse(stored); } catch { parsed = undefined; }
    const { sketch } = repairSketch(parsed, ctx);
    const files = await withSourceIcons([
      ...snapshot.files.filter(file => !nextSourceFile(file.path) && file.path !== SKETCH_FILE),
      ...assembleSketch(sketch, ctx),
    ]);
    const saved = await this.projects.save(merchantId, storeId, { revision, label: 'Sitio generado desde el boceto', brief: snapshot.brief, files });
    return { revision: saved.revision };
  }
```

Controller (same pattern as `UpdateSketchDto`):

```ts
class BuildSketchDto {
  @IsInt() @Min(1) revision!: number;
}
```

```ts
  @Post('sketch/build')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  build(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: BuildSketchDto) {
    return this.sketches.build(merchant.id, storeId, body);
  }
```

- [ ] **Step 4: Run the spec and typecheck**

Run: `cd apps/api && npx jest src/storefront-source/sketch-studio.service.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch-studio.service.ts apps/api/src/storefront-source/sketch-studio.controller.ts apps/api/src/storefront-source/sketch-studio.service.spec.ts
git commit -m "feat(boceto): Generar sitio saves the boceto as the site, for good"
```

### Task 3: Studio Boceto panel — [Diseño | YAPI] tabs, selection out, flush, no ✕ without close

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts`
- Modify: `apps/merchant-studio/src/source-boceto.css`
- Modify: `apps/merchant-studio/src/api.ts` (add `buildSketch`)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Produces on `Mount`: `yapi?: (visible: boolean) => void` (tabs render only when given; called whenever "the docked chat should show" changes = YAPI tab active and right panel not tucked), `selected?: (block: { id: string; label: string } | null) => void` (called only when the selected block id changes; the account page reports `null`).
- Produces on the panel: `flush(): Promise<void>` (finishes any queued or running save).
- Produces on `MerchantStudioApi`: `buildSketch(storeId: string, body: { revision: number }): Promise<{ revision: number }>`.
- The inspector's ✕ renders only when `close` is given.

- [ ] **Step 1: Write the failing tests** (append to `source-boceto.test.ts`)

```ts
const mountWith = async (extra: Record<string, unknown>) => {
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), ...extra } as any);
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  return panel;
};

it('phase: the right panel offers Diseño | YAPI; YAPI docks the chat and tucking hides it', async () => {
  const yapi = vi.fn();
  await mountWith({ yapi });
  expect(host.querySelector('.bct-close')).toBeNull();
  (host.querySelector('[data-boceto-tab="yapi"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(true);
  expect(host.querySelector('.bct-panel.is-yapi .bct-props')).toBeNull();
  (host.querySelector('[data-boceto-dock="inspector"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(false);
  (host.querySelector('.bct-tab--right') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(true);
  (host.querySelector('[data-boceto-tab="design"]') as HTMLElement).click();
  expect(yapi).toHaveBeenLastCalledWith(false);
  expect(host.querySelector('.bct-panel .bct-section')).not.toBeNull();
});

it('phase: the selected block is reported once per change, as chat context', async () => {
  const selected = vi.fn();
  const panel = await mountWith({ selected });
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteSelect('intro', 'copy');
  panel.remoteSelect('cat', '');
  panel.remoteSelect('nope', '');
  expect(selected.mock.calls.map(call => call[0])).toEqual([{ id: 'intro', label: 'Portada' }, { id: 'cat', label: 'Catálogo' }, null]);
});

it('phase: flush() saves a pending edit right away', async () => {
  const panel = await mountWith({});
  (panel as any).remoteText('intro', 'headline', 'Último cambio');
  await panel.flush();
  expect(putSketch.mock.calls.at(-1)[1].sketch.blocks[0].headline).toBe('Último cambio');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts -t phase`
Expected: FAIL (`.bct-close` present / no `[data-boceto-tab]` / `flush` undefined).

- [ ] **Step 3: Implement**

In `source-boceto.ts`:
- `Mount` type: add `yapi?: (visible: boolean) => void; selected?: (block: { id: string; label: string } | null) => void`.
- State: `let rightTab: 'design' | 'yapi' = 'design'; let reportedBlock: string | null = null; let reportedYapi = false;`
- In `dock()`, `--bct-right` is `0px` when tucked, `360px` when `rightTab === 'yapi' && opts?.yapi`, else `300px`.
- After `dock()` in `draw()`:

```ts
    const yapiVisible = Boolean(opts.yapi) && rightTab === 'yapi' && !tucked.inspector;
    if (yapiVisible !== reportedYapi) { reportedYapi = yapiVisible; opts.yapi?.(yapiVisible); }
```

- Inspector header: replace `[el('h2', { text: 'Diseño' }), statusNode, dockButton('inspector', false), close]` with tabs when `opts.yapi` is given, and the ✕ only when `opts.close` is given:

```ts
    const heading = opts.yapi
      ? el('div', { className: 'bct-tabs' }, (['design', 'yapi'] as const).map(tab => {
          const button = el('button', { type: 'button', className: `bct-tabs__tab${rightTab === tab ? ' is-on' : ''}`, text: tab === 'design' ? 'Diseño' : 'YAPI' });
          button.dataset.bocetoTab = tab;
          button.setAttribute('aria-pressed', String(rightTab === tab));
          button.addEventListener('click', () => { rightTab = tab; draw(); opts?.resized?.(); });
          return button;
        }))
      : el('h2', { text: 'Diseño' });
    root.append(el('header', { className: 'bct-head' }, [heading, statusNode, dockButton('inspector', false), ...(opts.close ? [close] : [])]));
    const yapiTab = Boolean(opts.yapi) && rightTab === 'yapi';
    if (yapiTab) root.classList.add('is-yapi');
```

  and wrap the inspector body (the picker / `bct-props` / page section branches) in `if (!yapiTab) { … }`.
- Exclude the tab buttons from the locked-disable sweep: selector `'input,select,button:not(.bct-close):not([data-boceto-dock]):not([data-boceto-tab])'`.
- In `syncSelection()`, after building `selection`:

```ts
    const block = selectedBlock();
    const blockId = block && block.id !== 'account' ? block.id : null;
    if (blockId !== reportedBlock) {
      reportedBlock = blockId;
      opts?.selected?.(blockId && block ? { id: blockId, label: TYPE_LABEL[block.type] || block.type } : null);
    }
```

- Return object: add `flush: () => flushSave(),`.

In `source-boceto.css` (append):

```css
/* Diseño | YAPI: the right panel's two faces. With YAPI on, only the header stays; the Studio docks its chat below. */
.bct-tabs { display: flex; gap: 2px; background: #383838; border-radius: 6px; padding: 2px; }
.bct-tabs__tab { border: 0; background: transparent; color: #bdbdbd; border-radius: 4px; padding: 4px 10px; font: inherit; font-weight: 600; cursor: pointer; }
.bct-tabs__tab.is-on { background: #4d4d4d; color: #fff; }
.bct-panel.is-yapi { bottom: auto; padding: 0; overflow: hidden; width: var(--bct-right, 360px); }
.studio-workspace.is-boceto.is-boceto-yapi .agent-panel { display: grid; position: fixed; top: 47px; right: 0; bottom: 0; width: var(--bct-right, 360px); z-index: 40; border-left: 1px solid #3c3c3c; }
```

In `api.ts` (after `putSketch`):

```ts
  buildSketch(storeId: string, body: { revision: number }): Promise<{ revision: number }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch/build`, { method: "POST", body: JSON.stringify(body) });
  }
```

- [ ] **Step 4: Run the panel tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts && npx tsc --noEmit`
Expected: all PASS (the tuck test still sees `--bct-right` 300px when no `yapi` is given).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.css apps/merchant-studio/src/api.ts apps/merchant-studio/src/source-boceto.test.ts
git commit -m "feat(boceto): Diseño | YAPI tabs, block selection as chat context, flush before build"
```

### Task 4: Studio — the boceto phase drives the Studio; Generar sitio confirms and builds

**Files:**
- Modify: `apps/merchant-studio/src/source-studio.ts` (`render`, `bind`, boceto mount options, toolbar)
- Modify: `apps/merchant-studio/src/source-boceto.css` (confirm dialog)
- Test: `apps/merchant-studio/src/source-studio.test.ts`

**Interfaces:**
- Consumes: `Mount.yapi`, `Mount.selected`, `panel.flush()`, `api.buildSketch` (Task 3); `POST sketch/build` (Task 2).

- [ ] **Step 1: Write the failing tests** (append to `source-studio.test.ts`; import `ApiError` from `./api`)

```ts
const sketchVersion: SourceVersion = { ...version, snapshot: { ...version.snapshot, files: [...version.snapshot.files, { path: 'sketch.json', content: '{}' }] } };
const sketchBody = { revision: 2, sketch: { palette: { paper: '#ffffff', ink: '#111111', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' }, fonts: { display: 'anton', text: 'manrope' }, scale: 'm', blocks: [{ id: 'intro', type: 'hero', variant: 'photo-right', headline: 'Hola', sub: '', cta: 'Ver', bg: 'paper', size: 'l' }] }, photos: [], fonts: ['anton'] };
const bocetoStore = () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2, versions: [sketchVersion], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(sketchVersion);
  vi.spyOn(MerchantStudioApi.prototype, 'getSketch').mockResolvedValue(sketchBody as any);
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
};

it('boceto phase: only the Boceto, no code or preview modes and no way out but Generar sitio', async () => {
  bocetoStore();
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull());
  for (const id of ['#source-preview-tab', '#source-code-tab', '#source-select-mode', '#source-boceto-tab']) expect(app.querySelector(id)).toBeNull();
  expect(app.querySelector('#source-boceto-generate')).not.toBeNull();
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
  expect(app.querySelector('.bct-close')).toBeNull();
});

it('boceto phase: the YAPI tab docks the chat with the selected block as its chip', async () => {
  bocetoStore();
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
  (app.querySelector('[data-boceto-tab="yapi"]') as HTMLElement).click();
  expect(app.querySelector('.studio-workspace.is-boceto-yapi')).not.toBeNull();
  (app.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('[data-selection-chip]')?.textContent).toContain('Portada'));
});

it('Generar sitio asks first, then builds and leaves the boceto for good', async () => {
  bocetoStore();
  const build = vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockResolvedValue({ revision: 3 });
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-generate')).not.toBeNull());
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  expect(app.querySelector('.boceto-confirm')?.textContent).toContain('ya no podrás editarlo por bloques');
  (app.querySelector('[data-boceto-confirm="cancel"]') as HTMLElement).click();
  expect(app.querySelector('.boceto-confirm')).toBeNull();
  expect(build).not.toHaveBeenCalled();
  const site = { ...version, revision: 3 };
  vi.mocked(MerchantStudioApi.prototype.sourceState).mockResolvedValue({ revision: 3, versions: [site], nextBefore: null });
  vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(site);
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(build).toHaveBeenCalledWith('s1', { revision: 2 }));
  await vi.waitFor(() => expect(app.querySelector('.studio-workspace.is-boceto')).toBeNull());
  expect(app.querySelector('#source-code-tab')).not.toBeNull();
  expect(app.querySelector('#source-boceto-tab')).toBeNull();
  expect(app.textContent).toContain('Sitio generado desde tu boceto');
});

it('Generar sitio on a stale revision keeps the merchant in the boceto with a clear note', async () => {
  bocetoStore();
  vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockRejectedValue(new ApiError('El boceto cambió. Recarga.', 409));
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-generate')).not.toBeNull());
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(app.textContent).toContain('El boceto cambió. Revisa la versión más reciente y vuelve a generar.'));
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-studio.test.ts`
Expected: the four new tests FAIL (the Studio opens in Vista previa; `#source-boceto-tab` present; no confirm).

- [ ] **Step 3: Implement** in `source-studio.ts`

State (next to `let bocetoOpen = false;`):

```ts
  // The boceto phase is the store's, not a toggle: a current revision with sketch.json is still a boceto.
  let bocetoYapi = false, bocetoConfirm = false, bocetoFitted = false;
  const bocetoPhase = () => Boolean(version?.snapshot.files.some(file => file.path === 'sketch.json'));
```

At the top of `render()`, before `const inBoceto = …`:

```ts
    if (bocetoPhase() && !productPhoto) { bocetoOpen = true; mode = 'preview'; } else { bocetoOpen = false; bocetoYapi = false; bocetoConfirm = false; }
```

Workspace class: `studio-workspace${inBoceto ? ' is-boceto' : ''}${inBoceto && bocetoYapi ? ' is-boceto-yapi' : ''}`.

Toolbar (non-boceto branch): delete the `<button id="source-boceto-tab" …>Boceto</button>` (the site phase never offers it).

After the toast markup, render the confirmation when `inBoceto && bocetoConfirm`:

```ts
${inBoceto && bocetoConfirm ? `<div class="boceto-confirm" role="dialog" aria-modal="true" aria-labelledby="boceto-confirm-title"><div class="boceto-confirm__card"><h2 id="boceto-confirm-title">Generar sitio</h2><p>Tu boceto se convertirá en sitio web. Después ya no podrás editarlo por bloques; podrás pedirle cambios a YAPI y ver el código.</p><div class="boceto-confirm__actions"><button type="button" class="button" data-boceto-confirm="cancel">Cancelar</button><button type="button" class="button button--publish" data-boceto-confirm="go">Generar sitio</button></div></div></div>` : ''}
```

Boceto mount options: remove `close`; add

```ts
      yapi: visible => { bocetoYapi = visible; app.querySelector('.studio-workspace')?.classList.toggle('is-boceto-yapi', visible); if (visible) focusComposer(); },
      selected: block => {
        if (!bocetoOpen) return;
        if (block) selection.set({ sectionId: `skb-${block.id}`, label: block.label }); else selection.clear();
        renderSelection();
      },
```

After `bind(); updateChecks();` in `render()`:

```ts
    if (inBoceto && !bocetoFitted) { bocetoFitted = true; requestAnimationFrame(() => fitCanvas()); }
    if (!inBoceto) bocetoFitted = false;
```

In `bind()`: delete the `#source-boceto-tab` listener; replace the `#source-boceto-generate` listener with:

```ts
    app.querySelector('#source-boceto-generate')?.addEventListener('click', () => { if (busy) return; bocetoConfirm = true; render(); });
    app.querySelector('[data-boceto-confirm="cancel"]')?.addEventListener('click', () => { bocetoConfirm = false; render(); });
    app.querySelector('[data-boceto-confirm="go"]')?.addEventListener('click', () => {
      bocetoConfirm = false;
      void action(async () => {
        await bocetoPanel.flush();
        try { await api.buildSketch(storeId, { revision: state.revision }); }
        catch (failure) {
          if (failure instanceof ApiError && failure.status === 409) { await load(); toast = 'El boceto cambió. Revisa la versión más reciente y vuelve a generar.'; return; }
          throw new Error('No se pudo generar. Inténtalo de nuevo.');
        }
        page = 'index.html'; mode = 'preview';
        await load();
        toast = 'Sitio generado desde tu boceto. Revísalo y publícalo cuando quieras.';
      });
    });
```

(`ApiError` is already imported in `source-studio.ts`; `action()` shows a thrown error's message.)

CSS (append to `source-boceto.css`):

```css
.boceto-confirm { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(0,0,0,.45); }
.boceto-confirm__card { width: min(420px, calc(100vw - 32px)); background: #fff; color: #111; border-radius: 12px; padding: 20px; box-shadow: 0 24px 80px rgba(0,0,0,.35); font: 14px/1.5 Inter, system-ui, sans-serif; }
.boceto-confirm__card h2 { margin: 0 0 8px; font-size: 17px; }
.boceto-confirm__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
```

- [ ] **Step 4: Run all Studio tests and typecheck**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-studio.ts apps/merchant-studio/src/source-boceto.css apps/merchant-studio/src/source-studio.test.ts
git commit -m "feat(boceto): sketch stores open only in the Boceto; Generar sitio confirms and builds"
```

### Task 5: Rebuild and verify in the owner's app

- [ ] **Step 1:** `cd apps/merchant-dashboard && pnpm run build:studio`; confirm the API watcher restarted (`lsof -tiTCP:3001` start time after the API commits).
- [ ] **Step 2:** In Chrome (hard reload ⌘⇧R), open The Bake Lab: it lands in the Boceto with no Vista previa/Código/Seleccionar; the YAPI tab docks the chat; selecting Portada shows the chip; "Subir foto" keeps the store in the Boceto.
- [ ] **Step 3:** Open Generar sitio's dialog and cancel. **Do not confirm on the owner's stores without asking**: generating is final.
- [ ] **Step 4:** Report results; update `HANDOFF.md` only if the owner asks.
