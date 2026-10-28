# Unique First Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new store comes out as its brand (logo, colours, sections, calm type) after one template build plus one sol redesign, without losing the header's menu/search/account/cart, and the merchant only sees the finished design.

**Architecture:** Keep the Esencial build as the working base, then the existing PEPPA-recipe redesign (`redesign: true`) on gpt-5.6-sol, now marked `firstDesign`. The redesign may restyle but not rebuild `components/Shell.tsx` (header + footer); a capture check backs that up. The brief is rewritten for calm, brand-wide colour, real-content sections and no repeats of recent stores, and receives a cover photo and logo picked beforehand. Quota cuts re-queue the job; the Studio covers the canvas while a first design is pending.

**Tech Stack:** NestJS + Prisma (apps/api), Jest, Playwright capture (agent-capture), React/TSX store templates (packages/store-templates), vanilla TS Studio (apps/merchant-studio, built into merchant-dashboard/public/studio).

**Spec:** `docs/superpowers/specs/2026-10-28-unique-first-build-design.md`

## Global Constraints

- ChatGPT plan only (`pnpm dev:chatgpt`); no paid models. Redesign model `gpt-5.6-sol` (`YAPI_REDESIGN_MODEL`), `YAPI_PEPPA_REDESIGN=on`, `YAPI_MASTER_POLISH=0` (already set in apps/api/.env).
- Never save files under `apps/api/src` while a YAPI job is QUEUED/RUNNING (nest --watch restarts and kills it). Check first.
- Never run prisma migrate/diff/reset. This plan needs no migration.
- Calm default (owner 2026-10-22 «Calm colours, normal cards»): energy = motion + type + one accent; no thick black outlines, offset shadows, square stamp boxes or poster type unless the merchant used «atrevida», «póster», «brutal», «chunky».
- No dark text-only bands; every dark block carries a real photo or products.
- New stores only; existing stores are untouched.
- Merchant-facing copy in Spanish, plain words.
- After template edits restart the API with a real compiled change (the API caches template files); after Studio edits run `pnpm build:studio`.
- Run api jest per file (`npx jest <file>`), never the full suite with default workers.
- On the ChatGPT plan the credit budget is unmetered (`SourceRequestBudget` unmetered), so no credit change is needed; `YAPI_REDESIGN_TOOL_CALLS` stays unread.

## Review Focus

1. A store with no logo at all: footer shows the name, header shows the name, the logo check does not fire, the cover pick returns no logo and nothing writes `logoUrl`.
2. A store whose attachments are all plain product cut-outs: the cover filter keeps the best of them (never returns nothing when photos exist).
3. A redesign that hides the search icon with CSS (`display:none`) instead of removing markup: the header-parts capture check flags it.
4. A quota cut on the first design repeated past the attempt cap: the job ends FAILED with the quota note and the Studio drops the cover and shows rev 1.
5. A merchant who sends a message while the first design is queued: their request goes first (existing tick priority) and the cover stays until the design job ends.

---

### Task 1: Template-path palette and font fixes

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts:177`
- Modify: `apps/api/src/storefront-source/source-palette.ts` (`paletteFromSamples`, `deepFromAccent`)
- Test: `apps/api/src/storefront-source/source-palette.spec.ts`

**Interfaces:** Produces `paletteFromSamples` (same signature; paper may now be a sampled light brand colour) and `deepFromAccent(accent: string): string | undefined` (more hue).

- [ ] **Step 1: Failing tests** (append to `source-palette.spec.ts`, add `deepFromAccent` to the import)

```ts
describe('brand paper and deep colour (2026-10-28 unique first build)', () => {
  it('uses a light tinted backdrop from the photos as the paper', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#7b1e3a', '#f3e9d6'], backdropHex: '#f3e9d6', uniformity: .9 }] });
    expectReadable(palette);
    expect(palette!.paper).toBe('#f3e9d6');
  });
  it('keeps red and maroon apart in the deep colour', () => {
    const red = deepFromAccent('#d62828')!, maroon = deepFromAccent('#7b1e3a')!;
    expect(Math.abs(hue(red) - hue(maroon))).toBeGreaterThan(15);
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-palette.spec.ts` → both new tests FAIL.

- [ ] **Step 3: Implement.** In `paletteFromSamples`, before computing `paper`:

```ts
  // Owner 2026-10-28 (PEPPA and DooBoo on the same #faf5f5): a light, tinted colour the brand already shows — the logo's or the
  // photos' backdrop (DooBoo's cream) — is the paper; only without one is the paper a near-white tint of the accent's hue.
  const lightBrand = [input.logo?.backdropHex, ...(input.photos ?? []).map(sample => sample.backdropHex)]
    .filter((value): value is string => !!value && HEX.test(value)).map(toRgb)
    .find(colour => { const [, s, l] = toHsl(colour); return l >= .84 && l <= .97 && s >= .12; });
```
then `const paper = dark ? fromHsl(hue, Math.min(saturation, .18), .08) : lightBrand ?? fromHsl(hue, Math.min(saturation, .35), .95);`.
`deepFromAccent`: `return toHex(fromHsl(hue, Math.min(saturation, .7), .2));`.
`source-templates.service.ts`: delete line 177 (`if (fill?.animated && manifest.master.fonts.some(font => font.id === ANIMATED_FONTS)) fill = …`) and drop `ANIMATED_FONTS` from that file's import if unused (keep the export; source-chat.service.ts:700 still uses it for «hazla animada»).

- [ ] **Step 4: Run** the palette spec → PASS; `npx jest src/storefront-source/source-master-animated.spec.ts src/storefront-source/source-master-family.spec.ts` → PASS (adjust only expectations that asserted `alegre` on a first build, and say so in the commit).

- [ ] **Step 5: Commit** → `fix(palette,esencial): brand paper from a light brand colour, deep keeps its hue, no forced playful font`.

### Task 2: Logo in the Esencial footer

**Files:**
- Modify: `packages/store-templates/templates/esencial/components/Shell.tsx` (`Footer`, the `es-footer__brand` div)
- Modify: the Esencial stylesheet with `.es-footer__name` (`grep -rn "es-footer__name" packages/store-templates/templates/esencial`)
- Test: `apps/api/src/storefront-source/source-templates.spec.ts` (assembled Esencial `components/Shell.tsx`)

- [ ] **Step 1: Failing test** — the assembled Esencial Shell contains `es-footer__logo` inside `Footer`, guarded by `store.logo ?`.
- [ ] **Step 2: Run** `npx jest src/storefront-source/source-templates.spec.ts` → FAIL.
- [ ] **Step 3: Implement**

```tsx
<div className="es-footer__brand">{store.logo ? <a className="es-footer__logo" href="index.html"><img src={store.logo} alt={store.name} /></a> : <p className="es-footer__name">{store.name}</p>}{tagline ? <p>{tagline}</p> : null}</div>
```
CSS next to `.es-footer__name`: `.es-footer__logo img{display:block;max-height:56px;max-width:220px;width:auto;height:auto;object-fit:contain}`.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(esencial): the store's logo in the footer`.

### Task 3: The redesign restyles but never rebuilds the header and footer

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-workspace.ts` (option `lockedShell`)
- Modify: `apps/api/src/storefront-source/source-agent-stage.ts:55`
- Modify: `apps/api/src/storefront-source/dto/send-source-message.dto.ts` (`SourceMessageInput.firstDesign?: boolean`) and the generate dto/execution path that carries `redesign` (source-chat.service.ts ~1316–1317) so `firstDesign` reaches the stage
- Modify: `apps/api/src/storefront-source/agent/agent-capture.ts` (health `headerParts`)
- Test: `agent/agent-workspace.spec.ts`, `agent/agent-capture.spec.ts`

**Interfaces:** Produces `new AgentWorkspace(files, { redesign, rewriteComponents?, lockedShell? })`, `SHELL_PATH = 'components/Shell.tsx'`; capture errors beginning `Encabezado incompleto:`.

- [ ] **Step 1: Failing workspace test**

```ts
it('a first-design redesign cannot write, edit or delete the Shell; it restyles it from the CSS', () => {
  const ws = new AgentWorkspace([{ path: 'components/Shell.tsx', content: 'export default 1' }, { path: 'styles/globals.css', content: '.es-header{}' }], { redesign: true, lockedShell: true });
  expect(ws.write('components/Shell.tsx', 'x')).toMatchObject({ ok: false, reason: 'protected' });
  expect(ws.edit('components/Shell.tsx', 'export', 'x')).toMatchObject({ ok: false, reason: 'protected' });
  expect(ws.remove('components/Shell.tsx')).toMatchObject({ ok: false, reason: 'protected' });
  expect(ws.edit('styles/globals.css', '.es-header{}', '.es-header{color:red}')).toEqual({ ok: true });
});
```
- [ ] **Step 2: Run** `npx jest src/storefront-source/agent/agent-workspace.spec.ts` → FAIL.
- [ ] **Step 3: Implement** in AgentWorkspace: `export const SHELL_PATH = 'components/Shell.tsx';` and first line of `editBatch`, `write`, `remove`:

```ts
if (this.options.lockedShell && path === SHELL_PATH) return { ok: false, reason: 'protected', message: 'El encabezado y el pie de página son de la plataforma (menú, buscador, cuenta, carrito, logo). Cambia su aspecto desde styles/globals.css con sus clases (.es-header, .es-logo, .es-header__links, .es-footer…); no los reescribas.' };
```
Options type `{ redesign: boolean; rewriteComponents?: boolean; lockedShell?: boolean }`. In source-agent-stage.ts:55 pass `lockedShell: Boolean(redesign && dto.firstDesign)`; add `firstDesign` next to `redesign` where source-chat.service.ts builds the generate dto/execution.
- [ ] **Step 4: Failing capture test** — an `.es-header` page whose `a[href$="buscar.html"]` is `display:none` yields an error containing `Encabezado incompleto: buscador`; a hidden `.es-logo img` yields `logo`.
- [ ] **Step 5: Implement** in the health evaluate block (next to `unresolvedVars`):

```ts
headerParts: (() => {
  const header = document.querySelector('.es-header');
  if (!header) return [] as string[];
  const shown = (el: Element | null) => { if (!el) return false; const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > .2; };
  const missing: string[] = [];
  if (!shown(header.querySelector('a[href$="buscar.html"]'))) missing.push('buscador');
  if (!shown(header.querySelector('[data-pagosya-account]'))) missing.push('cuenta');
  if (!shown(header.querySelector('[data-cart-open]'))) missing.push('carrito');
  const logo = header.querySelector('.es-logo img'); if (logo && !shown(logo)) missing.push('logo');
  const foot = document.querySelector('.es-footer__logo img'); if (foot && !shown(foot)) missing.push('logo del pie');
  return missing;
})(),
```
and `if (health.headerParts.length) errors.push(\`Encabezado incompleto: ${health.headerParts.join(', ')} no se ve. Vuelve a mostrarlo; solo cambia su aspecto.\`);`. On a phone width the search/account may live in the menu panel: run the check only at widths ≥ 900 (the capture knows `width`).
- [ ] **Step 6: Run** both specs → PASS. **Commit** `feat(yapi): a first-design redesign restyles the header and footer, never rebuilds them`.

### Task 4: A redesign may move photos

**Files:**
- Modify: `apps/api/src/storefront-source/source-edit-scope.ts:123-132` (`validateSourceEditScope(previous, next, instruction, scope?, options?: { redesign?: boolean })`)
- Modify: `apps/api/src/storefront-source/agent/agent-verify.ts:27` and `agent/agent-tools.ts` (ctx gains `redesign?: boolean`, passed to `verifyAgentDraft`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:989`
- Test: `source-edit-scope.spec.ts`

- [ ] **Step 1: Failing tests** — previous references `assets/a.jpg`…`assets/d.jpg`; next keeps `a`,`b`,`c`: with `{ redesign: true }` no throw; without → throws «Se retiró una foto…»; with `{ redesign: true }` keeping only `a` → throws «Un rediseño debe conservar las fotos de tu marca».
- [ ] **Step 2: Run** `npx jest src/storefront-source/source-edit-scope.spec.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
const before = [...refs(authored(previous))].filter(ref => !placeholder(ref));
const removed = before.filter(ref => !after.has(ref));
if (options?.redesign) {
  // Spec 2026-10-28 §4: a redesign may move or drop photos (ZARA 563cjthm was discarded for it) as long as the brand's mostly stay.
  if (removed.length && before.length - removed.length < Math.min(3, before.length)) throw new SourceScopeConflict('Un rediseño debe conservar las fotos de tu marca.');
} else if (removed.length) throw new SourceScopeConflict('Se retiró una foto o video existente sin que lo pidieras.');
```
Thread `redesign` (`isNew || redesign` in source-agent-stage) into the toolbox ctx → `verifyAgentDraft({ …, redesign })`, and into source-generation.service.ts:989.
- [ ] **Step 4: Run** the scope spec + `agent/agent-verify.spec.ts` → PASS. **Commit** `fix(yapi): a redesign may move photos while the brand's stay`.

### Task 5: A calm, brand-wide, never-repeated redesign brief

**Files:**
- Create: `apps/api/src/storefront-source/source-recent-looks.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (`REDESIGN_BRIEF_PROMPT`, `RedesignBriefInput`, `redesignBrief` facts)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts:404-412` (pass `recent`; `firstDesign: true` on the follow-up)
- Test: `source-recent-looks.spec.ts`, `source-chat-master.spec.ts`

**Interfaces:** Produces `lookOf(files: Array<{ path: string; content: string }>): { paper?: string; heading?: string }` and `recentLooks(prisma: PrismaService, excludeStoreId: string, take = 10): Promise<Array<{ paper?: string; heading?: string }>>`; `RedesignBriefInput` gains `recent?`, `cover?: string`, `logo?: string`.

- [ ] **Step 1: Failing test** for `lookOf`: `styles/globals.css` with `--store-background: #F3E7F5;` and `--store-heading-font: "Bricolage Grotesque", sans-serif;` → `{ paper: '#f3e7f5', heading: 'Bricolage Grotesque' }`; CSS with `--es-paper: #faf5f5;` and `--es-heading: 'Fredoka',Georgia,serif;` → `{ paper: '#faf5f5', heading: 'Fredoka' }`.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `source-recent-looks.ts`:

```ts
/** Spec 2026-10-28 §3: what the last stores look like (paper colour, heading font), so a new store's redesign never repeats them. Read only. */
import type { PrismaService } from '../prisma/prisma.service';
type File = { path: string; content: string };
const last = (text: string, pattern: RegExp) => { let found: string | undefined; for (const match of text.matchAll(pattern)) found = match[1]; return found; };
export function lookOf(files: File[]) {
  const css = files.filter(file => /\.(css|tsx)$/.test(file.path)).map(file => file.content).join('\n');
  const paper = last(css, /--(?:store-background|es-paper)\s*:\s*(#[0-9a-f]{6})/gi)?.toLowerCase();
  const heading = last(css, /--(?:store-heading-font|es-heading)\s*:\s*["']?([^"',;]+)/gi)?.trim();
  return { ...(paper ? { paper } : {}), ...(heading ? { heading } : {}) };
}
export async function recentLooks(prisma: PrismaService, excludeStoreId: string, take = 10) {
  const versions = await prisma.storeSourceVersion.findMany({ where: { storeId: { not: excludeStoreId } }, orderBy: { createdAt: 'desc' }, take: take * 4, select: { storeId: true, snapshot: true } });
  const seen = new Set<string>(), looks: Array<{ paper?: string; heading?: string }> = [];
  for (const version of versions) {
    if (seen.has(version.storeId) || looks.length >= take) continue;
    seen.add(version.storeId);
    const look = lookOf(((version.snapshot as { files?: File[] })?.files ?? []).filter(file => file.path.startsWith('styles/') || file.path === 'components/store-data.tsx'));
    if (look.paper || look.heading) looks.push(look);
  }
  return looks;
}
```
(Esencial writes its `--es-*` values into the assembled CSS; if the live check shows they live elsewhere, add that path to the filter.)
- [ ] **Step 4: Rewrite** `REDESIGN_BRIEF_PROMPT` (keep the JSON contract and the opening sentence rule):
  - Feeling examples: «cálida, chunky y divertida» → «cálida, artesanal y cercana».
  - Colours line → «Fondo, texto, acento y un segundo color de la marca, con hex del logo o de las fotos (di de cuál). El color de la marca va en toda la página —fondo tintado, bandas con foto, detalles—, no solo en un botón. No repitas un fondo ni una letra de «recientes».»
  - Header line → «Cabecera y pie: son fijos (logo, menú, buscador, cuenta, carrito). Solo di cómo se ven: colores, tamaño del logo, letra de los enlaces. El logo de la marca va arriba y en el pie.»
  - Cover line → «Portada: un titular grande con la voz de la marca y la foto «portada» de la entrada (o el video), sin collage.»
  - Sections line ends → «…cada una con contenido que la tienda ya tiene hoy; nunca una sección que necesita algo que no existe (blog sin artículos, reseñas sin reseñas).»
  - New line → «Por defecto: esquinas suaves, bordes finos, sombras suaves, letra legible con carácter. Nunca bordes negros gruesos, sombras desplazadas, cajas cuadradas tipo sello ni letra tipo póster, salvo que el comercio pida algo «atrevido», «póster», «brutal» o «chunky».»
  - `facts` gains `recent`, `cover`, `logo`.
- [ ] **Step 5: Wire** in source-chat.service.ts before `redesignBrief`: `const recent = await recentLooks(this.prisma, storeId).catch(() => []);` and pass it; add `firstDesign: true` to the `written ? {…}` follow-up. Extend the follow-up assertion in `source-chat-master.spec.ts` to expect `firstDesign: true`.
- [ ] **Step 6: Run** `npx jest src/storefront-source/source-recent-looks.spec.ts src/storefront-source/source-chat-master.spec.ts` → PASS. **Commit** `feat(yapi): calm brand-wide redesign brief that never repeats recent stores`.

### Task 6: Cover photo and logo picked before the redesign

**Files:**
- Create: `apps/api/src/storefront-source/source-cover-pick.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (`pickCoverAndLogo`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (call before `redesignBrief`)

**Interfaces:** Produces `coverCandidates(photos: Array<{ url: string; fit?: PhotoFit }>): string[]` and `SourceConversationService.pickCoverAndLogo(merchantId: string, input: { storeId: string; storeName: string; photos: string[] }): Promise<{ cover?: string; logo?: string }>`.

- [ ] **Step 1: Failing tests** for `coverCandidates`: with one `large`/`scene` and two `small`/`plain`, the large scene comes first and the plain small ones drop; all plain → all kept, large first; `[]` → `[]`; at most 6.
- [ ] **Step 2: Run** `npx jest src/storefront-source/source-cover-pick.spec.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
import type { PhotoFit } from './source-photo-fit';
/** Spec 2026-10-28 §5: the photos that can carry a cover, best first, from their pixels only. */
export function coverCandidates(photos: Array<{ url: string; fit?: PhotoFit }>): string[] {
  const score = (fit?: PhotoFit) => !fit ? 0 : (fit.plain === 'scene' ? 2 : 0) + (fit.size === 'large' ? 2 : 0) + (fit.shape === 'wide' ? 1 : 0);
  const ranked = [...photos].sort((a, b) => score(b.fit) - score(a.fit));
  const scenes = ranked.filter(photo => photo.fit?.plain === 'scene' || photo.fit?.size === 'large');
  return (scenes.length ? scenes : ranked).slice(0, 6).map(photo => photo.url);
}
```
`pickCoverAndLogo`: for each photo URL owned by the merchant, read bytes via `this.uploads.getBuffer`, `readPhotoFit`; candidates = `coverCandidates(...)`; one vision call (model `gpt-5.6-luna`, same request shape as `redesignBrief`, images `detail:'low'` labelled «Foto N» over ALL photos so the logo can be any of them; schema `{ cover: integer|null, logo: integer|null }`; instructions: «Elige la mejor foto de portada entre las candidatas: una escena real (personas, lugar, producto en uso) antes que un producto solo; sujeto claro; espacio para un titular; sin collage; sin texto encima. Di también cuál foto es el logo de la marca (una marca gráfica o letras sobre fondo liso), o null.»). Return `{ cover: photos[cover] ?? candidates[0], logo: photos[logo] }` keeping `cover` within `candidates`; any non-quota error → `{ cover: candidates[0] }`; quota errors (`SourceProviderQuotaException`) rethrow.
- [ ] **Step 4: Wire** in source-chat.service.ts inside the redesign path: `const picked = await this.dialogue.pickCoverAndLogo?.(merchantId, { storeId, storeName: store?.name ?? '', photos: [...new Set([...briefPhotos, ...attached])] }).catch(error => { if (error instanceof SourceProviderQuotaException) throw error; return {}; }) ?? {};` If `picked.logo` and the store has no `logoUrl`, `await this.prisma.store.update({ where: { id: storeId }, data: { logoUrl: picked.logo } })` (Review Focus 1: no logo found → nothing written). Pass `cover`/`logo` to `redesignBrief`, and append `\n\nFoto de portada: ${picked.cover}` to the follow-up instruction when present.
- [ ] **Step 5: Run** cover spec + `source-chat-master.spec.ts` → PASS. **Commit** `feat(yapi): the redesign gets a chosen cover photo and the brand's logo`.

### Task 7: A quota cut never fails a first design

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat-jobs.service.ts` (`run` catch, `tick`, `chatJobView`)
- Test: the jobs service spec (`grep -rln "SourceChatJobsService" apps/api/src --include=*.spec.ts`; create `source-chat-jobs.service.spec.ts` if none)

**Interfaces:** Produces `FIRST_DESIGN_MAX_ATTEMPTS = 12`, `QUOTA_PAUSE_MS = 10 * 60_000`; `chatJobView` adds `firstDesign: boolean`, `designNext: boolean`.

- [ ] **Step 1: Failing tests:** a RUNNING job with `input.firstDesign` whose run throws an error matching the model-limit message goes back to `QUEUED` with `activeStoreId` = its store, and `tick` does nothing until the pause ends; at `attempt >= 12` it closes FAILED with the quota note (Review Focus 4). `chatJobView({ input: { firstDesign: true } })` → `firstDesign: true`; a COMPLETED job with `result.followUp.firstDesign` → `designNext: true`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `run`'s catch, after `message` is computed and before closing:

```ts
const input = job.input as unknown as SourceMessageInput;
if (input?.firstDesign && message === MODEL_LIMIT_MERCHANT_FAILURE && job.attempt < FIRST_DESIGN_MAX_ATTEMPTS && !controller.signal.aborted) {
  // Spec 2026-10-28 §1: the ChatGPT plan ran out mid-design; the merchant keeps «YAPI está diseñando» and the job waits for the quota.
  this.pausedUntil = Date.now() + QUOTA_PAUSE_MS;
  await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: 'QUEUED', activeStoreId: job.storeId, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
  return;
}
```
`private pausedUntil = 0;` and in `tick` after `expire()`: `if (Date.now() < this.pausedUntil) return;`. `chatJobView`: add `firstDesign: Boolean(input?.firstDesign), designNext: Boolean((job.result as { followUp?: { firstDesign?: boolean } } | null)?.followUp?.firstDesign)`.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(yapi): a first design waits out a quota cut instead of failing`.

### Task 8: The Studio shows «YAPI está diseñando tu tienda» instead of rev 1

**Files:**
- Modify: `apps/merchant-studio/src/api.ts` (`SourceChatJob` gains `firstDesign?: boolean; designNext?: boolean`)
- Modify: `apps/merchant-studio/src/source-studio.ts` (state `designing`; `followRunningJob`, `followBackgroundJob`, load; canvas render)
- Modify: the Studio CSS holding `.build-waiting` (`grep -rln "build-waiting" apps/merchant-studio/src`)
- Test: nearest Studio test mocking `latestSourceChatJob` (`grep -rln "latestSourceChatJob" apps/merchant-studio/tests`)

- [ ] **Step 1: Failing test:** latest job `{ status: 'RUNNING', firstDesign: true }` → canvas shows «YAPI está diseñando tu tienda» and no preview iframe; job ends `COMPLETED` → preview loads; job ends `FAILED` → preview shows rev 1.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:** `let designing = false;`. Set true when a finished reply's job view has `designNext`, when `followRunningJob` starts on a job with `firstDesign`, and on Studio load when `latestSourceChatJob` is QUEUED/RUNNING with `firstDesign`. Set false when that job ends (any status). In the canvas render, while `designing`, render instead of the preview iframe:

```ts
`<div class="source-designing" role="status"><p class="source-designing__title">YAPI está diseñando tu tienda</p><p class="source-designing__step">${escape(buildStatus)}</p></div>`
```
When a followed first-design job returns to QUEUED after RUNNING, `buildStatus = 'YAPI sigue diseñando; termina en un rato.'`. CSS: centred card on the canvas background, matching `.build-waiting` type.
- [ ] **Step 4: Run** → PASS; `pnpm build:studio`. **Commit** `feat(studio): a new store opens on its finished design`.

### Task 9: Live check on the fixed set

**Files:** none in the product; scratchpad scripts (clone-store-catalog.ts `--from`, a queue-like copy, the shots script).

- [ ] **Step 1:** No job QUEUED/RUNNING; restart the API with a real compiled change (template files are cached); confirm `.env` flags.
- [ ] **Step 2:** One store at a time: PEPPA (catalog from `cmvgxe3tv000cf63cknnm93ka`, message like `cmvsh6sry0001dvfdmuiywyge`), Remolino (from `cmvixsc9m0001oozj6twf3axu`, like `cmvsbogec0001thx19yvkro1b`), DooBoo (the `queue-dooboo4.ts` flow), Andes Studio (like `cmvshms420001ptp0bwky0gw6`). Record `examples/<name>-unique-oct28/demo.json`.
- [ ] **Step 3:** For each: desktop + 390px screenshots, one side-by-side board, and the six success points (distinct paper/heading/cover; logo image in header and footer; menu + search + account + cart visible, search/collection/add-to-cart working; no empty section or overlap; calm look; the Studio never showed rev 1 — watch one build in Chrome on :4323). Minutes and notional cost per store from the job results.
- [ ] **Step 4:** Update memory `project_unique_first_build.md`; report to the owner with the board.
