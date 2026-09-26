# Plantillas Preview & Swap, One Ajustes Page, pagosYa MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nicer Plantillas gallery with a live preview of each template on the merchant's own store and free swapping until the first real edit; one Ajustes page for all store settings; a remote MCP server so a merchant's own AI can build (not publish) their store.

**Architecture:** API: the brief gains a server-set `templateRevision`; a store is "untouched" while `current.revision === brief.templateRevision`. `SourceTemplatesService.preview` assembles without saving. `SourceChatService.applyTemplate` becomes the single entry for gallery picks and decides whether the free adaptation runs (YAPI-flow store, ≤ 4 `Plantilla:` versions). MCP: new `ApiKeyType.MCP` (`mk_live_…` keys), `McpApiKeyGuard`, a stateless Streamable-HTTP MCP endpoint at `POST /v1/mcp` built with `@modelcontextprotocol/sdk`, whose tools call existing services. Studio: gallery redesign + preview view; a `library=settings` page that opens the brand/shipping/domain dialogs. Dashboard: Ajustes moves to the sidebar's bottom, opens those dialogs in an overlay frame, and hosts "Conecta tu IA".

**Tech Stack:** NestJS + Prisma + Jest (apps/api), `@modelcontextprotocol/sdk` 1.30.0 + zod 3, Vite + Vitest (apps/merchant-studio), plain ES modules + node:test (apps/merchant-dashboard).

**Spec:** `docs/superpowers/specs/2026-09-26-templates-settings-mcp-design.md`

## Global Constraints

- Never run `prisma migrate dev`, `migrate reset`, `db push` or `migrate diff` against any database. The enum migration is a hand-written SQL file; the owner applies it with `prisma migrate deploy`. `prisma generate` is allowed.
- Free adaptation on template picks only for a store whose design came from the YAPI flow (brief has `businessInformation`) and while it has **≤ 4** versions labelled `Plantilla: …`.
- MCP is **build, not publish**: no tool publishes, unpublishes, buys domains, touches payments/refunds/payouts, keys or account settings. No MCP tool spends YAPI credits.
- MCP keys authenticate only `/v1/mcp`; key format `mk_live_<32 alnum>`.
- Merchant-facing text in Spanish; code and comments in English, matching surrounding files.
- The Studio's existing sandboxed preview (`sourcePreviewDocument` + `createPreviewImageLoader`) renders every preview; no new rendering path.
- pnpm is this repo's package manager (`pnpm --filter @pagosya/api add …`).

## Review Focus

1. A merchant previews several templates, then edits one text in the code editor, then opens Plantillas again: the gallery must now show the "tu diseño actual queda en el historial" note and the YAPI cards must be disabled. (Task 3 + Task 5 tests.)
2. A 5th template pick on a YAPI-flow store must apply without the free adaptation and say so; the 4th must still adapt. (Task 3 test.)
3. An MCP call with a secret (`sk_…`) key, a revoked MCP key, or another merchant's `storeId` must fail without leaking whether the store exists. (Task 8/9 tests.)
4. `write_design_files` on a stale revision must fail with a "re-read the files" message and save nothing. (Task 7/9 tests.)
5. The gallery at 390 px: chips scroll horizontally, cards one column, preview toolbar wraps, nothing overflows sideways. (Task 4 + Task 11 browser check.)

---

### Task 1: Template state on the brief

**Files:**
- Modify: `apps/api/src/storefront-source/dto/save-source-project.dto.ts` (`SourceProjectBriefDto`)
- Create: `apps/api/src/storefront-source/source-template-state.ts`
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`apply` sets `templateRevision`)
- Test: `apps/api/src/storefront-source/source-template-state.spec.ts`, `apps/api/src/storefront-source/source-templates.service.spec.ts`

**Interfaces:**
- Produces: `SourceProjectBriefDto.templateRevision?: number`; `templateUntouched(brief, currentRevision): boolean`; `countTemplateVersions(prisma, storeId): Promise<number>`; `FREE_TEMPLATE_ADAPTATIONS = 4`; `apply()` saves a brief whose `templateRevision === revision + 1`.

- [ ] **Step 1: Write the failing tests**

`source-template-state.spec.ts`:

```ts
import { countTemplateVersions, templateUntouched, FREE_TEMPLATE_ADAPTATIONS } from './source-template-state';

describe('template state', () => {
  it('is untouched only while the current revision is the one a template produced', () => {
    expect(templateUntouched({ templateId: 'tostado', templateRevision: 2 }, 2)).toBe(true);
    expect(templateUntouched({ templateId: 'tostado', templateRevision: 2 }, 3)).toBe(false);
    expect(templateUntouched({ templateRevision: 2 }, 2)).toBe(false);
    expect(templateUntouched(undefined, 0)).toBe(false);
  });
  it('counts template versions by their label', async () => {
    const count = jest.fn().mockResolvedValue(3);
    await expect(countTemplateVersions({ storeSourceVersion: { count } } as any, 's1')).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { storeId: 's1', label: { startsWith: 'Plantilla:' } } });
    expect(FREE_TEMPLATE_ADAPTATIONS).toBe(4);
  });
});
```

In `source-templates.service.spec.ts`, beside the existing apply tests, add (extract the apply tests' inline service setup into a `setupApply(revision)` helper in the same step, keeping existing tests unchanged):

```ts
  it('records which revision the template produced', async () => {
    const { service, projects } = setupApply(3);
    await service.apply('m', 's', 'tostado', 3);
    expect(projects.save.mock.calls[0][2].brief.templateRevision).toBe(4);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest source-template-state source-templates.service -t "untouched|template versions|records which revision"`
Expected: FAIL — module missing; `templateRevision` undefined.

- [ ] **Step 3: Implement**

DTO, after `templateId`: `@IsOptional() @IsInt() @Min(1) templateRevision?: number;`

`source-template-state.ts`:

```ts
/** Spec 2026-09-26 (templates/settings/MCP) §1.3: a store is untouched while its current revision is the one a
 * template produced; later edits carry the brief forward, so their revision no longer matches. */
import type { PrismaService } from '../prisma/prisma.service';

export const FREE_TEMPLATE_ADAPTATIONS = 4;

export function templateUntouched(brief: { templateId?: string; templateRevision?: number } | null | undefined, currentRevision: number) {
  return Boolean(brief?.templateId && brief.templateRevision && brief.templateRevision === currentRevision);
}

export function countTemplateVersions(prisma: Pick<PrismaService, 'storeSourceVersion'>, storeId: string) {
  return prisma.storeSourceVersion.count({ where: { storeId, label: { startsWith: 'Plantilla:' } } });
}
```

`source-templates.service.ts` `apply`: save `{ revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } }`.

- [ ] **Step 4: Verify** — `cd apps/api && npx jest source-template-state source-templates.service` → PASS.
- [ ] **Step 5: Commit** — `feat(api): a template-made revision is marked on the brief; untouched check and template-version count`

---

### Task 2: Template preview endpoint

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (new `preview`, shared private `assemble`)
- Modify: `apps/api/src/storefront-source/source-templates.controller.ts` (GET `:templateId/preview`)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts`

**Interfaces:**
- Produces: `SourceTemplatesService.preview(merchantId, storeId, templateId): Promise<SourceProjectSnapshot>` (never saves); `GET /v1/stores/:storeId/source-project/templates/:templateId/preview`.

- [ ] **Step 1: Failing tests**

```ts
  it('previews a template on the store without saving anything', async () => {
    const { service, projects } = setupApply(2);
    projects.prepare = jest.fn(async (input: any) => ({ schemaVersion: 1, brief: input.brief, files: input.files }));
    const snapshot = await service.preview('m', 's', 'tostado');
    expect(projects.save).not.toHaveBeenCalled();
    expect(projects.prepare).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, label: 'Plantilla: Tostado' }));
    expect(snapshot.files.some((file: any) => file.path === 'config.js')).toBe(true);
  });
  it('rejects an unknown template in preview', async () => {
    const { service } = setupApply(0);
    await expect(service.preview('m', 's', 'nope')).rejects.toThrow('Esa plantilla no existe.');
  });
```

- [ ] **Step 2: Verify failure** — `npx jest source-templates.service -t preview` → FAIL (`preview` is not a function).

- [ ] **Step 3: Implement** — extract from `apply` a private `assemble(merchantId, storeId, templateId)` returning `{ current, assembled }` (manifest lookup with the same NotFoundException, `current`, previous brief, `publicStores.getStorePublic`, `assembleTemplateRevision` with `firstRevision: current.revision === 0`). `apply` keeps its revision check (against `current.revision`) and save. Add:

```ts
  /** The template on this store as it would be saved, for the gallery's preview. Nothing is persisted. */
  async preview(merchantId: string, storeId: string, templateId: string) {
    const { current, assembled } = await this.assemble(merchantId, storeId, templateId);
    return this.projects.prepare({ revision: current.revision, ...assembled });
  }
```

Controller (in `SourceTemplatesApplyController`):

```ts
  @Get(':templateId/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @CompileBudget()
  preview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('templateId') templateId: string) {
    return this.templates.preview(merchant.id, storeId, templateId);
  }
```

- [ ] **Step 4: Verify** — `npx jest source-templates.service` → PASS.
- [ ] **Step 5: Commit** — `feat(api): preview a Plantilla on the merchant's own store without saving it`

---

### Task 3: One entry for gallery picks; swaps while untouched; free adaptation limit

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (tap/typed validation, `useTemplate` revision + limit, new `applyTemplate`)
- Modify: `apps/api/src/storefront-source/source-templates.controller.ts` (apply delegates to `SourceChatService.applyTemplate`)
- Test: `apps/api/src/storefront-source/source-chat.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `SourceChatService.applyTemplate(merchantId, storeId, templateId, revision): Promise<{ revision: number; label: string; adapted: boolean; … }>`; chat card taps/typed picks accepted when `current.revision === 0 || templateUntouched(brief, current.revision)`; `useTemplate` applies at the current revision and adapts only when the draft has a summary and `countTemplateVersions(...) <= FREE_TEMPLATE_ADAPTATIONS` (counted after the apply).

- [ ] **Step 1: Failing tests** (append to the chat spec; add `storeSourceVersion: { count: jest.fn().mockResolvedValue(1) }` to `setup()`'s prisma double):

```ts
describe('template swaps before any change', () => {
  const untouched = (templateRevision: number) => ({ snapshot: { brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P', sitePurpose: 'shop', templateId: 'tostado', templateRevision, businessInformation: 'Cafetería' } } });
  it('lets a card be tapped again while the store is untouched, and applies on top of the current revision', async () => {
    const { service, projects, templates } = setup(withCards());
    projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
    await service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Miga', templateId: 'miga' });
    expect(templates.apply).toHaveBeenCalledWith('m', 's', 'miga', 2);
  });
  it('refuses a card once the merchant edited the store', async () => {
    const { service, projects, templates } = setup(withCards());
    projects.current.mockResolvedValue({ revision: 3 }); projects.version.mockResolvedValue(untouched(2));
    await expect(service.send('m', 's', { ...request, revision: 3, instruction: 'Usar Miga', templateId: 'miga' })).rejects.toThrow('ya tiene un diseño');
    expect(templates.apply).not.toHaveBeenCalled();
  });
  it('adapts for free up to the 4th template version and not after', async () => {
    for (const [count, adapted] of [[4, true], [5, false]] as const) {
      const { service, projects, templates, generation, prisma, messages } = setup(withCards());
      projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
      templates.apply.mockResolvedValue({ revision: 3, label: 'Plantilla: Miga' }); prisma.storeSourceVersion.count.mockResolvedValue(count);
      generation.generate.mockResolvedValue({ revision: 4, label: 'x' });
      await service.send('m', 's', { ...request, revision: 2, instruction: 'Usar Miga', templateId: 'miga' });
      expect(generation.generate).toHaveBeenCalledTimes(adapted ? 1 : 0);
      if (!adapted) expect(messages.at(-1).content).toContain('pídeme que la adapte');
    }
  });
  it('gallery picks on a YAPI-flow untouched store go through the free adaptation', async () => {
    const { service, projects, templates, generation } = setup([]);
    projects.current.mockResolvedValue({ revision: 2 }); projects.version.mockResolvedValue(untouched(2));
    templates.apply.mockResolvedValue({ revision: 3, label: 'Plantilla: Miga' }); generation.generate.mockResolvedValue({ revision: 4, label: 'x' });
    const saved = await service.applyTemplate('m', 's', 'miga', 2);
    expect(generation.generate.mock.calls[0][6]).toEqual({ free: true });
    expect(saved).toMatchObject({ revision: 4, adapted: true });
  });
  it('gallery picks on a store without a YAPI conversation stay instant', async () => {
    const { service, projects, templates, generation } = setup([]);
    projects.current.mockResolvedValue({ revision: 5 }); projects.version.mockResolvedValue({ snapshot: { brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P' } } });
    templates.apply.mockResolvedValue({ revision: 6, label: 'Plantilla: Miga' });
    await expect(service.applyTemplate('m', 's', 'miga', 5)).resolves.toMatchObject({ revision: 6, adapted: false });
    expect(generation.generate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify failure** — `npx jest source-chat.service -t "swaps before any change"` → FAIL.

- [ ] **Step 3: Implement** in `source-chat.service.ts`:
  - Import `templateUntouched, countTemplateVersions, FREE_TEMPLATE_ADAPTATIONS` from `./source-template-state`.
  - Tap validation (still before any save): when `current.revision > 0`, load `(await this.projects.version(merchantId, storeId, current.revision)).snapshot.brief`; allowed when `!current.revision || templateUntouched(brief, current.revision)`; otherwise the existing "Tu tienda ya tiene un diseño…" error. The same condition replaces `!current.revision` on the typed-choice path.
  - `useTemplate(…)` gains a final `revision: number` argument (the current revision): `apply(merchantId, storeId, choice.id, revision)`; after applying, `const adapt = Boolean(draft.answers?.context) && await countTemplateVersions(this.prisma, storeId) <= FREE_TEMPLATE_ADAPTATIONS;`. When `!adapt`: finish, save the message `Apliqué la plantilla ${choice.name} con tus productos. Si quieres que use tus textos y colores, pídeme que la adapte.` and return `{ userMessage, assistantMessage, revision: applied }`. When adapting, the adaptation brief also gets `templateRevision: applied.revision + 1`.
  - New public method for the gallery:

```ts
  /** Gallery picks (spec 2026-09-26 §1.3): a YAPI-flow store that is still untouched is adapted like a card tap;
   * every other pick applies instantly, as before. */
  async applyTemplate(merchantId: string, storeId: string, templateId: string, revision: number) {
    const current = await this.projects.current(merchantId, storeId);
    if (current.revision !== revision) throw new ConflictException('El proyecto cambió. Recarga antes de aplicar la plantilla.');
    const manifest = templateManifest(templateId);
    if (!manifest) throw new NotFoundException('Esa plantilla no existe.');
    const brief = revision ? ((await this.projects.version(merchantId, storeId, revision)).snapshot as unknown as SourceProjectSnapshot).brief : undefined;
    const summary = brief?.businessInformation;
    if (!summary || !templateUntouched(brief, revision)) return { ...(await this.templates.apply(merchantId, storeId, templateId, revision)), adapted: false };
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: { updatedAt: new Date() } });
    const userMessage = await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'USER', content: `Usar ${manifest.name}`, metadata: { revision } } });
    const workflow = createSourceProgress(async () => {});
    const draft = { ...newSourceSetup(), answers: { context: summary } };
    const result = await this.useTemplate(merchantId, storeId, thread.id, userMessage, workflow, { id: manifest.id, name: manifest.name, reason: '' }, draft, [], revision);
    return { ...result.revision, adapted: result.revision.revision > revision + 1 };
  }
```

  - Controller `apply` → `this.chat.applyTemplate(merchant.id, storeId, templateId, input.revision)` (inject `SourceChatService` into `SourceTemplatesApplyController`).

- [ ] **Step 4: Verify** — `npx jest source-chat.service source-templates.service && npx tsc -p tsconfig.json --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(api): swap Plantillas freely until the first edit; YAPI-flow swaps adapt for free up to 4 template versions; gallery picks share the chat's path`

---

### Task 4: Gallery look

**Files:**
- Modify: `apps/merchant-studio/src/source-templates.ts` (`renderTemplateGallery`, category counts)
- Modify: `apps/merchant-studio/src/source-templates.css`
- Test: `apps/merchant-studio/src/source-templates.test.ts`

**Interfaces:** cards `[data-template-pick]` with desktop `img.tpl-card__desk` and phone `img.tpl-card__phone` (`plantillas/<id>-mobile.webp`); chips show counts.

- [ ] **Step 1: Failing tests**

```ts
  it('shows chip counts and a phone capture on every card', () => {
    const root = render();
    expect([...root.querySelectorAll('[data-template-category]')].map(chip => chip.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Todas 3', 'Belleza 1', 'Deporte y aire libre 2']);
    const card = root.querySelector('[data-template-pick="aurora"]')!;
    expect(card.querySelector('.tpl-card__desk')!.getAttribute('src')).toBe('/plantillas/aurora.webp');
    expect(card.querySelector('.tpl-card__phone')!.getAttribute('src')).toBe('/plantillas/aurora-mobile.webp');
  });
  it('titles the dialog as a choice, not a catalog', () => {
    expect(render().querySelector('h2')!.textContent).toBe('Elige una plantilla');
  });
```

Update the existing chip-text test to the labels with counts.

- [ ] **Step 2: Verify failure** — `cd apps/merchant-studio && npx vitest run src/source-templates.test.ts` → FAIL.

- [ ] **Step 3: Implement** — header `<h2>Elige una plantilla</h2><p>Tiendas completas con tus productos. Mira cómo queda la tuya antes de elegir.</p>` + icon close button (`aria-label="Cerrar"`); chips `${label} <span>${count}</span>`; card markup:

```html
<button type="button" class="tpl-card__pick" data-template-pick="${id}" aria-label="Ver ${name}">
  <span class="tpl-card__frame"><img class="tpl-card__desk" src="${base}plantillas/${id}.webp" alt="" loading="lazy"><img class="tpl-card__phone" src="${base}plantillas/${id}-mobile.webp" alt="" loading="lazy"></span>
  <span class="tpl-card__meta"><strong>${name}</strong><em>${categoryLabel}</em></span>
  <span class="tpl-card__desc">${description}</span>
</button>
```

CSS: dialog font = the Studio's sans UI stack (reuse `source-studio.css`'s body/sans variable if it defines one; otherwise `'Figtree', system-ui, sans-serif`); chips row `display:flex; flex-wrap:nowrap; overflow-x:auto`; frame `aspect-ratio:960/1275; position:relative; border-radius:14px; overflow:hidden`; phone `position:absolute; right:10px; bottom:10px; width:24%; aspect-ratio:390/844; border:3px solid #1d1b18; border-radius:10px`; desc two-line clamp; hover lift + shadow, none under `prefers-reduced-motion`; `@media (max-width:560px)` one column.

- [ ] **Step 4: Verify** — vitest file → PASS.
- [ ] **Step 5: Commit** — `feat(studio): Plantillas gallery — sans type, one scrolling chip row with counts, desktop+phone cards, two-line descriptions`

---

### Task 5: Live preview view, untouched swaps, cards while untouched

**Files:**
- Modify: `apps/merchant-studio/src/api.ts` (`templatePreview`; `applyTemplate` return gains `adapted`)
- Modify: `apps/merchant-studio/src/source-templates.ts` (`GalleryState.width`, `renderTemplatePreview`, open/navigate/apply)
- Modify: `apps/merchant-studio/src/source-studio.ts` (untouched → no history note; cards enabled while untouched)
- Test: `apps/merchant-studio/src/source-templates.test.ts`, `apps/merchant-studio/src/source-studio.test.ts`

**Interfaces:** `api.templatePreview(storeId, templateId): Promise<SourceSnapshot>`; `renderTemplatePreview(template, state): string` with `[data-template-prev]`, `[data-template-next]`, `[data-template-apply]`, `[data-template-back]`, `[data-template-width]`, `iframe.tpl-preview__frame`.

- [ ] **Step 1: Failing tests**

```ts
describe('template preview', () => {
  it('shows the chosen template with navigation, width toggle and apply', () => {
    const root = document.createElement('div');
    root.innerHTML = renderTemplatePreview(templates[1], { category: '', selected: 'cumbre', busy: false, error: '', hasSite: true, previewBase: '/', width: 'desktop' });
    for (const selector of ['[data-template-prev]', '[data-template-next]', '[data-template-apply]', '[data-template-back]', '[data-template-width]', 'iframe.tpl-preview__frame']) expect(root.querySelector(selector)).toBeTruthy();
    expect(root.textContent).toContain('queda guardado en el historial');
  });
  it('drops the history note while the store is untouched', () => {
    const root = document.createElement('div');
    root.innerHTML = renderTemplatePreview(templates[1], { category: '', selected: 'cumbre', busy: false, error: '', hasSite: false, previewBase: '/', width: 'phone' });
    expect(root.textContent).not.toContain('historial');
    expect(root.querySelector('.tpl-preview')!.classList.contains('tpl-preview--phone')).toBe(true);
  });
});
```

`source-studio.test.ts`: state revision 2, version brief `templateId: 'tostado', templateRevision: 2`, an assistant message with `templateChoices` → `[data-template-choice="miga"]` enabled; with `templateRevision: 1` → disabled.

- [ ] **Step 2: Verify failure** — vitest → FAIL.

- [ ] **Step 3: Implement**
  - `api.templatePreview` = GET `/stores/:storeId/source-project/templates/:templateId/preview`.
  - `GalleryState` gains `width: 'desktop' | 'phone'`; `hasSite` means "show the history note".
  - `renderTemplatePreview`: toolbar (Volver · name + category · ‹ › · Escritorio/Celular · Usar esta plantilla), `<div class="tpl-preview tpl-preview--${width}"><iframe class="tpl-preview__frame" title="Vista previa de ${name}" sandbox="allow-scripts"></iframe></div>`, history note only when `hasSite`, busy text "Aplicando…".
  - `openTemplateGallery`: picking a card renders the preview, then `api.templatePreview(storeId, id)` → `frame.srcdoc = sourcePreviewDocument(await loadImages(snapshot), 'index.html', {})` (`loadImages = createPreviewImageLoader(API_BASE_URL)`), only if still selected; errors → `state.error`. ‹ ›, ArrowLeft/ArrowRight move within the current category (wrapping). Apply switches the busy label to "Aplicando y adaptando…" after 2 s and closes on success.
  - `source-studio.ts`: `const untouched = () => Boolean(version?.snapshot?.brief?.templateId && version.snapshot.brief.templateRevision === state.revision);` → gallery `hasSite: state.revision > 0 && !untouched()`; YAPI card disable condition uses `state.revision > 0 && !untouched()`.

- [ ] **Step 4: Verify** — `npx vitest run src && npx tsc --noEmit -p tsconfig.json` → PASS.
- [ ] **Step 5: Commit** — `feat(studio): preview each Plantilla on your own store before choosing, browse with arrows, swap freely until the first edit`

---

### Task 6: One Ajustes page

**Files:**
- Modify: `apps/merchant-studio/src/main.ts` (route `library=settings`)
- Create: `apps/merchant-studio/src/source-settings-page.ts`, test `source-settings-page.test.ts`
- Modify: `apps/merchant-studio/src/source-studio.ts` (embedded brand/shipping/domain buttons post `view:'store-settings'` + `section`)
- Create: `apps/merchant-dashboard/src/settings-overlay.mjs`, test `apps/merchant-dashboard/unit/settings-overlay.test.mjs`
- Modify: `apps/merchant-dashboard/index.html` (nav item to the sidebar bottom; Ajustes rows Marca / Envíos y retiro / Dominio), `src/dashboard.js` (overlay + message routing)

**Interfaces:** Studio `mountSettingsPage(app, section)` opens the matching existing dialog (`openBrandProfile` / `openShippingSettings` / `openDomainShop`) and posts `{ type: 'pagosya:settings-closed', section }` to the parent when it closes. Dashboard `settingsOverlayUrl(storeId, section)`; `SETTINGS_SECTIONS = ['brand','shipping','domain']`; `openSettingsOverlay(storeId, section)`.

- [ ] **Step 1: Failing tests**

`unit/settings-overlay.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { settingsOverlayUrl, SETTINGS_SECTIONS } from "../src/settings-overlay.mjs";
test("each Ajustes section opens the Studio's own panel for the selected store", () => {
  assert.deepEqual(SETTINGS_SECTIONS, ["brand", "shipping", "domain"]);
  assert.equal(settingsOverlayUrl("s 1", "shipping"), "/studio/?embedded=1&library=settings&section=shipping&store=s%201");
  assert.throws(() => settingsOverlayUrl("s1", "payouts"), /sección/);
});
```

`source-settings-page.test.ts` (vitest, jsdom, `vi.mock('./brand-profile', …)` whose `openBrandProfile` appends a `<dialog>` and removes it after a tick): `mountSettingsPage(app, 'brand')` with `?store=s1` calls `openBrandProfile(expect.anything(), 's1')` and then `window.parent.postMessage` with `{ type: 'pagosya:settings-closed', section: 'brand' }`.

- [ ] **Step 2: Verify failure** — both → FAIL (missing modules).

- [ ] **Step 3: Implement**
  - `settings-overlay.mjs`: exports above; `openSettingsOverlay` appends one fixed full-viewport transparent `<iframe class="settings-overlay" title="Ajustes">`, removed on an origin-checked `pagosya:settings-closed` message; CSS in `dashboard.css`.
  - `source-settings-page.ts`: reads `store` from the URL; `document.body.classList.add('settings-overlay-page')` (transparent background); opens the dialog; a `MutationObserver` on `document.body` posts `pagosya:settings-closed` once the dialog is removed.
  - `main.ts`: `if (params.get('library') === 'settings') return (await import('./source-settings-page')).mountSettingsPage(app, params.get('section') as 'brand' | 'shipping' | 'domain');` before the existing library routes.
  - `source-studio.ts`: embedded handlers of `#source-brand`, `#source-shipping`, `#source-domain` post `{ type: 'pagosya:workspace', view: 'store-settings', section }`.
  - Dashboard: move the `data-dashboard-view="store-settings"` link out of the "Tu tienda" `<details>` to just before `</nav>`; add after `#storeSettingsRoot` a section "Marca, envíos y dominio" with three rows and buttons `data-settings-open="brand|shipping|domain"` ("Configurar"); `dashboard.js`: those buttons → `openSettingsOverlay(currentStoreId, section)`; the `pagosya:workspace` handlers' allowed views include `"store-settings"`, and a `section` opens the overlay after switching view.

- [ ] **Step 4: Verify** — `cd apps/merchant-dashboard && pnpm test:unit`; `cd ../merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json` → PASS.
- [ ] **Step 5: Commit** — `feat(dashboard): Ajustes is the one home for store settings — at the sidebar's bottom, with brand, shipping and domain; Studio shortcuts land there`

---

### Task 7: Multi-file edits

**Files:**
- Modify: `apps/api/src/storefront-source/source-projects.service.ts` (`editFiles`; `editFile` delegates)
- Test: `apps/api/src/storefront-source/source-projects.service.spec.ts`

**Interfaces:** `editFiles(merchantId, storeId, { revision, files: Array<{ path, content }> })` → saved revision; label `Edición de <path>` for one file, `Edición de N archivos` otherwise; each path an existing text file (a Next source file on Next stores); 1–20 files.

- [ ] **Step 1: Failing tests** — two files in one call → one `save` with both replaced and label `Edición de 2 archivos`; an unknown path → `BadRequestException('Selecciona un archivo de texto existente.')`, no save; 0 or 21 files → `BadRequestException`.
- [ ] **Step 2: Verify failure** — `npx jest source-projects.service -t editFiles` → FAIL.
- [ ] **Step 3: Implement** — `editFile`'s checks in a loop; `editFile(m, s, input)` = `editFiles(m, s, { revision: input.revision, files: [{ path: input.path, content: input.content }] })`.
- [ ] **Step 4: Verify** — `npx jest source-projects.service` → PASS.
- [ ] **Step 5: Commit** — `feat(api): save several design files as one revision`

---

### Task 8: MCP keys

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`enum ApiKeyType { PUBLISHABLE SECRET MCP }`)
- Create: `apps/api/prisma/migrations/20260926120000_api_key_type_mcp/migration.sql` containing `ALTER TYPE "ApiKeyType" ADD VALUE 'MCP';`
- Modify: `apps/api/src/auth/api-key.service.ts` (`prefixFor` → `mk` for MCP; `verify` accepts `mk`)
- Create: `apps/api/src/mcp/mcp-api-key.guard.ts`, `apps/api/src/mcp/mcp-keys.controller.ts`
- Test: the existing api-key service spec (or `apps/api/src/auth/api-key.service.spec.ts`), `apps/api/src/mcp/mcp-api-key.guard.spec.ts`, `apps/api/src/mcp/mcp-keys.controller.spec.ts`

**Interfaces:** `McpApiKeyGuard` sets `request.merchant`; `GET /v1/mcp/keys` (merchant session) → MCP keys only; `POST /v1/mcp/keys { label? }` → `{ id, fullKey, label, createdAt }` (`mk_live_…`, shown once); `DELETE /v1/mcp/keys/:id` → revoke, only this merchant's MCP keys.

- [ ] **Step 1: Failing tests** — issuing MCP yields `/^mk_live_[0-9A-Za-z]{32}$/`; `verify(mcpKey, 'MCP')` finds it, `verify(skKey, 'MCP')` → null; guard: no header → 401, MCP key → `request.merchant` set, secret key → 401; controller: list returns only `type === 'MCP'`; delete of a SECRET key id → 404.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — schema + migration SQL; `cd apps/api && npx prisma generate` (never `migrate`); `prefixFor`: `const kind = type === ApiKeyType.SECRET ? "sk" : type === ApiKeyType.MCP ? "mk" : "pk";`; `verify` regex `/^(?:sk|pk|mk)_(?:test|live)_[0-9A-Za-z]{32}$/`; guard mirrors `SecretApiKeyGuard` with `ApiKeyType.MCP`; controller with `MerchantAuthGuard` using `ApiKeyService.issue(merchantId, ApiKeyType.MCP, ApiKeyMode.LIVE, label)`, `list` filtered, `revoke` after an ownership + type check (`NotFoundException('No encontré esa clave.')`).
- [ ] **Step 4: Verify** — `npx jest api-key mcp && npx tsc -p tsconfig.json --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(api): MCP keys (mk_live_…) issued and revoked from the dashboard, accepted only by the MCP guard` — body notes the owner applies the migration with `prisma migrate deploy`.

---

### Task 9: MCP server and tools

**Files:**
- `pnpm --filter @pagosya/api add @modelcontextprotocol/sdk@1.30.0`
- Create: `apps/api/src/mcp/mcp.module.ts`, `mcp.controller.ts`, `mcp-tools.ts`, `mcp-tools.spec.ts`, `mcp.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `McpModule`; `McpModule` also registers Task 8's guard and keys controller)

**Interfaces:** `buildMcpServer(deps: McpDeps, merchantId: string): McpServer` registering exactly `list_stores, get_store, list_products, create_product, update_product, list_templates, apply_template, get_design_files, write_design_files, screenshot_store`. `McpDeps = { stores, products, projects, templates, screenshot(snapshot, width, page) }`. Controller `POST /v1/mcp` (`McpApiKeyGuard`, throttle 60/min); GET and DELETE → 405 JSON-RPC error. Per request: `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`, `await server.connect(transport)`, `await transport.handleRequest(req, res, req.body)`, close both on `res.on('close')`.

- [ ] **Step 1: Failing tests** (`mcp-tools.spec.ts` with the SDK's `InMemoryTransport.createLinkedPair()` + `Client`):
  - `listTools()` returns exactly the ten names; none matches `/publish|payout|refund|payment|key|domain/`.
  - `get_store` for a foreign store (deps `projects.current` rejects `NotFoundException`) → `isError` with "No encontré esa tienda."
  - `write_design_files` on a stale revision (`projects.editFiles` rejects `ConflictException`) → `isError` containing "Vuelve a leer los archivos"; on a current revision → `editFiles` called with the files, result text includes the new revision.
  - `apply_template` → `templates.apply(merchantId, storeId, id, revision)` (no adaptation).
  - `screenshot_store` → content `{ type: 'image', mimeType: 'image/png' }`.
  - `mcp.e2e.spec.ts`: Nest test app with `McpController`, the guard overridden to set merchant `m1`, stub deps, `app.listen(0)`; SDK `Client` + `StreamableHTTPClientTransport` → `listTools()` and `callTool({ name: 'list_stores' })` succeed. A second app with the real guard (stub `ApiKeyService.verify` → null) answers 401 without `Authorization`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — zod input schemas (`storeId: z.string()`, `revision: z.number().int().min(0)`, `files: z.array(z.object({ path: z.string(), content: z.string() })).min(1).max(20)`, product inputs validated by `plainToInstance` + `validate` against `CreatePaymentLinkDto` / `UpdatePaymentLinkDto` before calling the service); English tool descriptions that explain the source format in 2–3 lines and point to `get_design_files`; `mcpError(error)`: `ConflictException` on writes → `"La tienda cambió. Vuelve a leer los archivos con get_design_files."`, other `HttpException` → its message, anything else → `"No pude completar esa acción."` (logged server-side). `get_design_files`: text files `{ path, content }` + `binaryPaths`. `screenshot_store`: `withVisualSandbox(snapshot, '', undefined, false, …)`, page (default `index.html`) at 1280×900 or 390×844, PNG base64.
- [ ] **Step 4: Verify** — `npx jest src/mcp && npx tsc -p tsconfig.json --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(api): pagosYa MCP server — a merchant's own AI builds their store (stores, products, templates, design files, screenshots); no publishing or money`

---

### Task 10: "Conecta tu IA" in Ajustes

**Files:**
- Create: `apps/merchant-dashboard/src/mcp-connect.mjs`, test `apps/merchant-dashboard/unit/mcp-connect.test.mjs`
- Modify: `apps/merchant-dashboard/index.html` (section in the Ajustes view), `src/dashboard.js` (mount)

**Interfaces:** `mcpEndpoint(apiBase)`; `mcpClientSnippets(endpoint, key)` → `{ claude, codex, cursor }`; `mountMcpConnect(root, { api })`.

- [ ] **Step 1: Failing tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { mcpEndpoint, mcpClientSnippets } from "../src/mcp-connect.mjs";
test("the MCP endpoint sits under the API base", () => {
  assert.equal(mcpEndpoint("https://api.pagosya.bo/v1/"), "https://api.pagosya.bo/v1/mcp");
});
test("each client gets a paste-ready setup with the key", () => {
  const s = mcpClientSnippets("https://api.pagosya.bo/v1/mcp", "mk_live_x");
  assert.match(s.claude, /https:\/\/api\.pagosya\.bo\/v1\/mcp/);
  assert.match(s.codex, /\[mcp_servers\.pagosya\][\s\S]*Authorization[\s\S]*mk_live_x/);
  assert.match(s.cursor, /"pagosya"[\s\S]*"url": "https:\/\/api\.pagosya\.bo\/v1\/mcp"[\s\S]*Bearer mk_live_x/);
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — snippets: Claude Code `claude mcp add --transport http pagosya <url> --header "Authorization: Bearer <key>"`; Codex `~/.codex/config.toml` `[mcp_servers.pagosya]` with `url` and `http_headers = { Authorization = "Bearer <key>" }`; Cursor `.cursor/mcp.json` `{ "mcpServers": { "pagosya": { "url": …, "headers": { "Authorization": "Bearer …" } } } }` (pretty-printed with `JSON.stringify(…, null, 2)`). Section copy: "Conecta tu IA — Usa Claude, Codex o Cursor con tu tienda. Tu IA puede diseñar y cargar productos; publicar y cobrar siguen siendo tuyos." Keys listed masked; create shows the full key once with copy buttons and the three snippets; revoke confirms inline (no `window.confirm`).
- [ ] **Step 4: Verify** — `pnpm test:unit` → PASS.
- [ ] **Step 5: Commit** — `feat(dashboard): Ajustes → Conecta tu IA — create and revoke MCP keys, setup for Claude, Codex and Cursor`

---

### Task 11: Verify

- [ ] API: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source src/mcp src/auth` → all pass (a suite that also fails on `b771bb0` is reported as pre-existing).
- [ ] Studio: `npx vitest run src && npx tsc --noEmit -p tsconfig.json`; Dashboard: `pnpm test:unit`; eslint on changed files → 0 errors.
- [ ] `cd apps/merchant-dashboard && pnpm run build:studio`; confirm port 3001 is the watcher's current API (else ask the owner to restart `pnpm dev`).
- [ ] Ask the owner to apply the migration (`cd apps/api && npx prisma migrate deploy`); do not run it.
- [ ] Browser (localhost:4323, seed merchant): gallery at 1280 and 390 (chips, cards, preview with the store's products, arrows, apply); swap twice on an untouched store, edit a text, reopen (history note back); Ajustes at the sidebar bottom, Marca / Envíos / Dominio open; Conecta tu IA creates a key. Screenshots saved.
- [ ] MCP against the running API with that key: SDK client `listTools`, `list_stores`, `get_design_files`, `screenshot_store`.
- [ ] Report to the owner with captures.
