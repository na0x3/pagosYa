# Store Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a template store's first build, YAPI composes a home for the brand from sections that fit its template — signature sections always kept — then looks at it and corrects it, instead of filling the template's fixed home.

**Architecture:**
- **Pure rules** (`source-composer.ts`): the composer's template view, the home summary, the too-close measure, the code check, and applying review changes.
- **Data** (`section-fit.json`): which sections fit each template and each template's signature. It is made by a render script and approved by the owner.
- **Two model calls** in `SourceConversationService`: `composeHome` and `reviewHome`.
- **A draft build** in `SourceTemplatesService`: `refillDraft`, which prepares the files without saving.
- **The loop** (`source-composer-run.ts`), with every side effect injected.
- **The wiring** in `SourceChatService.sectionLibrary`, behind `YAPI_COMPOSER=1`.

**Tech Stack:** NestJS (apps/api), TypeScript, Jest, Playwright (render script and captures), sharp, `@pagosya/store-templates`.

**Spec:** `docs/superpowers/specs/2026-11-11-store-composer-design.md`

## Global Constraints

- **Switch:** `YAPI_COMPOSER=1` turns the composer on. Unset or anything else → today's fill mode, byte-for-byte unchanged.
- **Model:** `YAPI_COMPOSER_MODEL` (default `gpt-5.6-sol`) and `YAPI_COMPOSER_EFFORT` (default `medium`), for both the compose and the review.
- **Budget:** `YAPI_COMPOSER_MAX_USD` (default `10`) is the hard cap per store, summed from `providerMicroUsd` of the composer's calls.
- **Scope:** first build only (`input.firstDesign`), on a store wearing a template (`variants.theme !== 'none'`) that has a signature and a fit list. It never runs on a carry-over after a template switch (`input.carry`), on «sigue» (`input.sectionLibraryFrom`), or on existing stores.
- **Shape:** 7 to 12 sections. Every signature section exactly once. The cover first, or second right under the template's own top bar (`lead`). The main grid (`products-grid` or `products-tabs`) at most once, among the first three.
- **Too close:** same cover type and look, and the longest common subsequence of section types ≥ 60% of the shorter list, against any of the last 6 homes on the same template. The cover may not repeat either of the last 2.
- **Review changes:** a closed list only — `swap | look | move | photo | band | remove`. Never `remove` or `swap` a signature section or the main grid. Never move the cover or the lead bar.
- **Rounds:** at most 2 compose attempts and 3 review rounds. Two failed composes → fill mode.
- **Errors that still stop the build:** a spent quota or a cancel throws, exactly as fill mode does today (`quotaSpent(error) || sourceRequestContext.getStore()?.signal?.aborted`).
- **Label:** the saved revision is labelled «Portada compuesta por YAPI».
- **Owner rules:** inline work (no subagents); light checks (one spec file per jest run, no full `tsc`; Task 7 runs one `tsc --noEmit --incremental false` and says so). Before EVERY save under `apps/api` (specs included) and `packages/store-templates`, check that no YAPI job is RUNNING or QUEUED (Task 0). Never `sed -i` an API file. Never commit in pagosYaWeb.
- **Deviations from the spec,** decided while planning:
  - Signatures live in `section-fit.json` (`signature`), not in each `template.json`. One file, and no package typings to change.
  - The template is read from store-data `variants.theme`; every store's `brief.templateId` is `esencial`.
  - Recent homes reach the reviewer as text summaries, never as pictures: other merchants' stores are not sent as images. The structural too-close check is what blocks look-alikes.
  - Shrine opens with a promo bar above its cover, so a template's own leading strip or promo (`lead`) may stay first.

## Review Focus

1. **A template whose own home starts with a bar above the cover** (Shrine: `promo-countdown`, then `cover-stage`). The check must accept the bar first and the cover second, and must refuse a home where some other section sits above the cover. → Task 1 test «a template's own top bar may sit above the cover».
2. **A brand-new template with no earlier stores, or fewer than 2.** The too-close check and the cover-repeat rule pass; nothing crashes on an empty list. → Task 1 test «no recent homes».
3. **A review change pointing at a section that does not exist, a type that does not fit, or a removed section.** It is ignored and the rest still applies. → Task 1 test «ignores changes it cannot apply».
4. **A store with few photos (3).** The composer answers sections that need photos; the code drops them (as today), the count falls under 7, and the second failure goes to fill mode — never a loop. → Task 6 test «a check that keeps failing falls back to fill mode».
5. **The merchant presses Detener, or the ChatGPT plan runs out, mid-loop.** The error propagates and stops the build; it never silently saves a half-reviewed home. → Task 6 test «a cancel or a spent quota stops the loop».

---

### Task 0: Working rules (read once, no code)

- [ ] **Step 1: The job check to run before every save under apps/api or packages/store-templates**

```bash
cd /Users/saramia/pagosYa/apps/api && set -a && . ./.env && { [ -f .env.local ] && . ./.env.local; }; set +a; node -e '
const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();
p.storeSourceChatJob.count({where:{status:{in:["QUEUED","RUNNING","PENDING"]}}}).then(n=>{console.log("running jobs:",n);return p.$disconnect()})'
```

Expected: `running jobs: 0`. If not 0, wait, and tell the owner. A save restarts `nest --watch` and kills the run.

- [ ] **Step 2: One spec file per jest run**

```bash
cd /Users/saramia/pagosYa/apps/api && export PATH="$HOME/.nvm/versions/node/v26.5.0/bin:$PATH" && npx jest src/storefront-source/<file>.spec.ts
```

---

### Task 1: Composer rules (pure)

**Files:**
- Create: `apps/api/src/storefront-source/source-composer.ts`
- Test: `apps/api/src/storefront-source/source-composer.spec.ts`

**Interfaces:**
- Consumes: `LIBRARY_CATALOG`, `LayoutBlock` from `./source-section-library`.
- Produces:
  - `type SectionFit = { fit: Record<string, string[]>; signature: Record<string, string[]>; vetoed?: Record<string, string[]> }`
  - `type ComposerTemplate = { id: string; name: string; signature: string[]; allowed: string[]; looks: Record<string, string[]>; lead?: string }`
  - `composerTemplate(id, name, preset: { layout?: readonly LayoutBlock[]; choices?: { looks?: Readonly<Record<string, readonly string[]>> } } | undefined, data: SectionFit): ComposerTemplate | null`
  - `lookOptions(template: ComposerTemplate, type: string): string[]`
  - `type HomeSummary = { store: string; cover: string; types: string[] }`
  - `homeSummary(store: string, layout: readonly { type: string; look?: string }[]): HomeSummary`
  - `commonOrder(a: readonly string[], b: readonly string[]): number`
  - `tooClose(candidate: HomeSummary, recent: HomeSummary): boolean`
  - `composerCheck(layout: readonly LayoutBlock[], template: ComposerTemplate, recent: readonly HomeSummary[]): string[]`
  - `type ComposerChangeKind = 'swap' | 'look' | 'move' | 'photo' | 'band' | 'remove'`
  - `type ComposerProblem = { problem: string; at: number; kind: ComposerChangeKind; value: string }`
  - `applyComposerChanges(layout: readonly LayoutBlock[], problems: readonly ComposerProblem[], template: ComposerTemplate, photos: readonly string[]): { layout: LayoutBlock[]; applied: string[]; rewrite: number[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-composer.spec.ts
import { applyComposerChanges, commonOrder, composerCheck, composerTemplate, homeSummary, lookOptions, tooClose, type SectionFit } from './source-composer';
import type { LayoutBlock } from './source-section-library';

const data: SectionFit = {
  fit: { merienda: ['story-split', 'benefits-bento', 'reviews-cards', 'promo-banner', 'faq-split', 'closing-photo', 'statement-sticker'] },
  signature: { merienda: ['cover-mega', 'products-rows'] },
  vetoed: { merienda: ['reviews-cards'] },
};
const preset = {
  layout: [{ type: 'cover-mega', look: 'side' }, { type: 'products-rows', look: 'alternate' }, { type: 'names-list', look: 'light' }, { type: 'faq-split', look: 'lines' }, { type: 'wave-divider' }, { type: 'closing-wordmark' }] as LayoutBlock[],
  choices: { looks: { 'cover-mega': ['side', 'stack', 'tilt'] } },
};
const T = composerTemplate('merienda', 'Merienda', preset, data)!;
const home = (types: string[], cover = 'cover-mega', look = 'side'): LayoutBlock[] => [{ type: cover, look }, ...types.map(type => ({ type }))];

describe('the composer template view', () => {
  it('allows the template\'s own sections and its fitting ones, never a vetoed or decoration section', () => {
    expect(T.allowed).toEqual(expect.arrayContaining(['cover-mega', 'products-rows', 'names-list', 'faq-split', 'closing-wordmark', 'story-split', 'benefits-bento']));
    expect(T.allowed).not.toContain('reviews-cards');
    expect(T.allowed).not.toContain('wave-divider');
    expect(T.signature).toEqual(['cover-mega', 'products-rows']);
  });
  it('knows each section\'s looks from the catalogue, the template\'s home and its drawn choices', () => {
    expect(lookOptions(T, 'cover-mega')).toEqual(expect.arrayContaining(['side', 'stack', 'tilt']));
    expect(lookOptions(T, 'faq-split')).toContain('lines');
  });
  it('is null without a signature or a fit list', () => {
    expect(composerTemplate('tacon', 'Tacón', preset, data)).toBeNull();
  });
  it('a template\'s own top bar may sit above the cover', () => {
    const shrine = composerTemplate('shrine', 'Shrine Pro', { layout: [{ type: 'promo-countdown' }, { type: 'cover-stage' }, { type: 'categories-tiles' }] as LayoutBlock[] },
      { fit: { shrine: ['story-split', 'products-grid', 'faq-split', 'closing-photo', 'benefits-bento', 'reviews-wall'] }, signature: { shrine: ['cover-stage'] } })!;
    expect(shrine.lead).toBe('promo-countdown');
    const ok: LayoutBlock[] = [{ type: 'promo-countdown' }, { type: 'cover-stage' }, { type: 'products-grid' }, { type: 'story-split' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'closing-photo' }];
    expect(composerCheck(ok, shrine, [])).toEqual([]);
    const wrong: LayoutBlock[] = [{ type: 'story-split' }, { type: 'cover-stage' }, { type: 'products-grid' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'reviews-wall' }, { type: 'closing-photo' }];
    expect(composerCheck(wrong, shrine, []).join(' ')).toMatch(/portada/);
  });
});

describe('too similar', () => {
  it('measures the common order', () => {
    expect(commonOrder(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toBe(3);
    expect(commonOrder([], ['a'])).toBe(0);
  });
  it('same cover and 60% of the order is too close; another cover look is not', () => {
    const a = homeSummary('A', home(['products-rows', 'story-split', 'faq-split', 'closing-wordmark']));
    const b = homeSummary('B', home(['products-rows', 'story-split', 'benefits-bento', 'closing-wordmark']));
    expect(tooClose(a, b)).toBe(true);
    expect(tooClose(a, homeSummary('C', home(['products-rows', 'story-split', 'benefits-bento', 'closing-wordmark'], 'cover-mega', 'tilt')))).toBe(false);
  });
});

describe('the code check', () => {
  const good = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark']);
  it('passes a composed home', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('no recent homes: nothing to be close to', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('names a missing signature, a section that does not fit, a short page and a look-alike', () => {
    const missing = home(['story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark', 'promo-banner']);
    expect(composerCheck(missing, T, []).join(' ')).toMatch(/products-rows/);
    expect(composerCheck([...good.slice(0, 6), { type: 'reviews-cards' }], T, []).join(' ')).toMatch(/reviews-cards/);
    expect(composerCheck(good.slice(0, 4), T, []).join(' ')).toMatch(/7 y 12/);
    expect(composerCheck(good, T, [homeSummary('Miga', good)]).join(' ')).toMatch(/Miga/);
  });
  it('refuses the cover the last two stores on the template used', () => {
    const other = homeSummary('Canasta', home(['faq-split', 'closing-wordmark']));
    expect(composerCheck(good, T, [other]).join(' ')).toMatch(/portada.*Canasta/);
  });
});

describe('review changes', () => {
  const layout = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark']);
  it('applies a look, a band, a photo, a swap, a remove and a move', () => {
    const withPhoto = layout.map((block, at) => (at === 2 ? { ...block, photo: '/a.jpg' } : block));
    const out = applyComposerChanges(withPhoto, [
      { problem: 'x', at: 0, kind: 'look', value: 'tilt' },
      { problem: 'x', at: 2, kind: 'band', value: 'muted' },
      { problem: 'x', at: 2, kind: 'photo', value: '1' },
      { problem: 'x', at: 4, kind: 'swap', value: 'promo-banner' },
      { problem: 'x', at: 3, kind: 'remove', value: '' },
      { problem: 'x', at: 5, kind: 'move', value: '2' },
    ], T, ['/a.jpg', '/b.jpg']);
    expect(out.layout.map(block => block.type)).toEqual(['cover-mega', 'products-rows', 'faq-split', 'story-split', 'promo-banner', 'closing-wordmark']);
    expect(out.layout[0].look).toBe('tilt');
    expect(out.layout[3]).toMatchObject({ type: 'story-split', band: 'muted', photo: '/b.jpg' });
    expect(out.rewrite).toEqual([4]);
    expect(out.applied).toHaveLength(6);
  });
  it('ignores changes it cannot apply', () => {
    const out = applyComposerChanges(layout, [
      { problem: 'x', at: 1, kind: 'remove', value: '' },            // a signature section
      { problem: 'x', at: 0, kind: 'move', value: '3' },             // the cover
      { problem: 'x', at: 2, kind: 'swap', value: 'reviews-cards' }, // vetoed
      { problem: 'x', at: 40, kind: 'look', value: 'tilt' },         // no such section
      { problem: 'x', at: 2, kind: 'look', value: 'nope' },
      { problem: 'x', at: 1, kind: 'band', value: 'deep' },          // a dark band on a product section
    ], T, []);
    expect(out.layout).toEqual(layout);
    expect(out.applied).toEqual([]);
  });
});
```

- [ ] **Step 2: Job check (Task 0), then run the test to verify it fails**

Run: `npx jest src/storefront-source/source-composer.spec.ts`
Expected: FAIL with «Cannot find module './source-composer'».

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/storefront-source/source-composer.ts
import { LIBRARY_CATALOG, type LayoutBlock } from './source-section-library';

/** Spec 2026-11-11 store composer: what a template lets its composed home use. `fit` and `signature` come from section-fit.json. */
export type SectionFit = { fit: Record<string, string[]>; signature: Record<string, string[]>; vetoed?: Record<string, string[]> };
export type ComposerTemplate = { id: string; name: string; signature: string[]; allowed: string[]; looks: Record<string, string[]>; lead?: string };
export type HomeSummary = { store: string; cover: string; types: string[] };
export type ComposerChangeKind = 'swap' | 'look' | 'move' | 'photo' | 'band' | 'remove';
export type ComposerProblem = { problem: string; at: number; kind: ComposerChangeKind; value: string };

const BY_ID = new Map(LIBRARY_CATALOG.map(section => [section.id, section]));
const roleOf = (type: string) => BY_ID.get(type)?.role;
const MAIN_GRID = new Set(['products-grid', 'products-tabs']);
const BANDS = ['paper', 'muted', 'accent', 'deep', ''];
const add = (map: Record<string, string[]>, type: string, look: string) => { const list = (map[type] ??= []); if (!list.includes(look)) list.push(look); };

export function composerTemplate(id: string, name: string, preset: { layout?: readonly LayoutBlock[]; choices?: { looks?: Readonly<Record<string, readonly string[]>> } } | undefined,
  data: SectionFit): ComposerTemplate | null {
  const signature = data.signature[id];
  const fit = data.fit[id];
  const own = preset?.layout ?? [];
  if (!signature?.length || !fit?.length || !own.length) return null;
  const vetoed = new Set(data.vetoed?.[id] ?? []);
  const allowed = [...new Set([...own.map(block => block.type), ...fit])].filter(type => BY_ID.has(type) && !BY_ID.get(type)!.decor && !vetoed.has(type));
  const looks: Record<string, string[]> = {};
  for (const block of own) if (block.look) add(looks, block.type, block.look);
  for (const [type, list] of Object.entries(preset?.choices?.looks ?? {})) for (const look of list) add(looks, type, look);
  const first = own[0];
  const lead = first && ['strip', 'promo'].includes(roleOf(first.type) ?? '') ? first.type : undefined;
  return { id, name, signature: [...signature], allowed, looks, ...(lead ? { lead } : {}) };
}

export function lookOptions(template: ComposerTemplate, type: string): string[] {
  return [...new Set([...(BY_ID.get(type)?.looks ?? []), ...(template.looks[type] ?? [])])];
}

export function homeSummary(store: string, layout: readonly { type: string; look?: string }[]): HomeSummary {
  const cover = layout.find(block => roleOf(block.type) === 'cover');
  return { store, cover: cover ? `${cover.type}:${cover.look ?? ''}` : '', types: layout.map(block => block.type) };
}

/** Longest common subsequence: how much of one page's order the other repeats. */
export function commonOrder(a: readonly string[], b: readonly string[]): number {
  const row: number[] = new Array(b.length + 1).fill(0);
  for (const left of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = left === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]); diagonal = keep; }
  }
  return row[b.length];
}

export function tooClose(candidate: HomeSummary, recent: HomeSummary): boolean {
  if (!candidate.cover || candidate.cover !== recent.cover) return false;
  const shorter = Math.min(candidate.types.length, recent.types.length);
  return shorter > 0 && commonOrder(candidate.types, recent.types) / shorter >= 0.6;
}

/** The reasons a composed home is refused, in the words the composer reads next (empty = it passes). */
export function composerCheck(layout: readonly LayoutBlock[], template: ComposerTemplate, recent: readonly HomeSummary[]): string[] {
  const reasons: string[] = [];
  const types = layout.map(block => block.type);
  if (types.length < 7 || types.length > 12) reasons.push(`la portada lleva entre 7 y 12 secciones (mandaste ${types.length})`);
  const top = template.lead && types[0] === template.lead ? 1 : 0;
  if (roleOf(types[top] ?? '') !== 'cover') reasons.push(template.lead ? `la portada va primera, o segunda debajo de ${template.lead}` : 'la portada va primera');
  if (types.slice(top + 1).some(type => roleOf(type) === 'cover')) reasons.push('una sola portada');
  for (const type of template.signature) {
    const count = types.filter(other => other === type).length;
    if (count !== 1) reasons.push(`la sección firma ${type} va una vez (está ${count})`);
  }
  const outside = [...new Set(types.filter(type => !template.allowed.includes(type) && type !== template.lead))];
  if (outside.length) reasons.push(`estas secciones no van en ${template.name}: ${outside.join(', ')}`);
  const grids = types.flatMap((type, at) => (MAIN_GRID.has(type) ? [at] : []));
  if (grids.length > 1 || (grids.length === 1 && grids[0] > top + 2)) reasons.push('la grilla principal va una vez, entre las tres primeras');
  const mine = homeSummary('', layout);
  for (const other of recent) {
    if (!tooClose(mine, other)) continue;
    reasons.push(`se parece a la tienda ${other.store}: la misma portada (${other.cover}) y ${commonOrder(mine.types, other.types)} de ${Math.min(mine.types.length, other.types.length)} secciones en el mismo orden`);
  }
  const repeated = recent.slice(0, 2).find(other => other.cover && other.cover === mine.cover);
  if (repeated) reasons.push(`la portada ${mine.cover} es la misma que la tienda ${repeated.store}: usa otro look u otra portada`);
  return reasons;
}

/** The review's changes, by the numbers the reviewer saw; a change that does not fit the template is left out. */
export function applyComposerChanges(layout: readonly LayoutBlock[], problems: readonly ComposerProblem[], template: ComposerTemplate, photos: readonly string[]):
  { layout: LayoutBlock[]; applied: string[]; rewrite: number[] } {
  let rows = layout.map((block, origin) => ({ block: { ...block }, origin }));
  const signature = new Set(template.signature);
  const applied: string[] = [];
  const swapped = new Set<number>();
  for (const change of problems) {
    const row = rows.find(entry => entry.origin === change.at);
    if (!row) continue;
    const type = row.block.type;
    const role = roleOf(type);
    if (change.kind === 'look') {
      if (lookOptions(template, type).includes(change.value) && change.value !== row.block.look) { row.block.look = change.value; applied.push(`${type}: look ${change.value}`); }
    } else if (change.kind === 'band') {
      if (!BANDS.includes(change.value) || (['accent', 'deep'].includes(change.value) && role === 'products')) continue;
      if (change.value) row.block.band = change.value; else delete row.block.band;
      applied.push(`${type}: banda ${change.value || 'ninguna'}`);
    } else if (change.kind === 'photo') {
      const at = Number(change.value);
      if (!Number.isInteger(at) || !photos[at] || !row.block.photo) continue;
      row.block.photo = photos[at]; applied.push(`${type}: foto ${at}`);
    } else if (change.kind === 'swap') {
      const next = change.value;
      if (signature.has(type) || MAIN_GRID.has(type) || role === 'cover' || roleOf(next) === 'cover' || !template.allowed.includes(next) || rows.some(entry => entry.block.type === next)) continue;
      row.block = { type: next, ...(row.block.band ? { band: row.block.band } : {}) };
      swapped.add(row.origin); applied.push(`${type} → ${next}`);
    } else if (change.kind === 'remove') {
      if (signature.has(type) || MAIN_GRID.has(type) || role === 'cover') continue;
      rows = rows.filter(entry => entry !== row); applied.push(`quité ${type}`);
    } else if (change.kind === 'move') {
      const to = Number(change.value);
      const cover = rows.findIndex(entry => roleOf(entry.block.type) === 'cover');
      if (role === 'cover' || type === template.lead || !Number.isInteger(to) || to <= cover || to >= rows.length) continue;
      rows = rows.filter(entry => entry !== row); rows.splice(to, 0, row); applied.push(`${type} a la posición ${to}`);
    }
  }
  return { layout: rows.map(entry => entry.block), applied, rewrite: rows.flatMap((entry, at) => (swapped.has(entry.origin) ? [at] : [])) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/storefront-source/source-composer.spec.ts`
Expected: PASS, all tests. `move` uses positions in the current list (after any earlier remove). In «applies a look…», `names-list` (origin 3) is gone and `benefits-bento` (origin 4) became `promo-banner` before `faq-split` (origin 5) moves to position 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-composer.ts apps/api/src/storefront-source/source-composer.spec.ts
git commit -m "feat(composer): template view, too-close measure, code check and review changes (spec 2026-11-11)"
```

---

### Task 2: Section fit and signatures (data, owner-approved)

**Files:**
- Create: `apps/api/scripts/section-fit.ts`
- Create: `packages/store-templates/templates/esencial/section-fit.json` (written by the script)
- Modify: `apps/api/src/storefront-source/source-composer.ts` (add `readSectionFit`)
- Test: `apps/api/src/storefront-source/source-composer-data.spec.ts`

**Interfaces:**
- Consumes:
  - `templateManifest`, `templateSourceFiles`, `templatesDir` (`@pagosya/store-templates`);
  - `resolvePresetTemplate`, `templateDemoRevision` (`src/storefront-source/source-templates`);
  - `SourceProjectsService.prepare`;
  - `withVisualSandbox` (`src/storefront-source/source-visual-capture`);
  - `LIBRARY_CATALOG`.
- Produces:
  - `section-fit.json` = `{ fit, signature, proposed, vetoed }`. Each is a `Record<templateId, sectionType[]>`, and `proposed` holds signatures awaiting the owner.
  - `readSectionFit(): SectionFit`, exported from `source-composer.ts`.

- [ ] **Step 1: Write the render script**

```ts
// apps/api/scripts/section-fit.ts
/** Spec 2026-11-11 store composer: which library sections fit inside which template, and each template's proposed signature.
 *   cd apps/api && npx ts-node --transpile-only -P tsconfig.json scripts/section-fit.ts [--only merienda,shrine] [--shots <dir>]
 *  One demo store per template, holding its cover, then every candidate section once. Each `[data-lb]` block is measured at
 *  1280 and 390. No database, no API. Keeps the owner's `vetoed` and approved `signature`; rewrites `fit` and `proposed`. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { templateManifest, templateSourceFiles, templatesDir } from '@pagosya/store-templates';
import { LIBRARY_CATALOG, type LayoutBlock } from '../src/storefront-source/source-section-library';
import { resolvePresetTemplate, templateDemoRevision } from '../src/storefront-source/source-templates';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';

const OUT = join(templatesDir, 'esencial', 'section-fit.json');
const LOUD = new Set(['cover-poster', 'cover-ribbon', 'statement-sticker']);
const PLAYFUL = /burbuja|neon|merienda|mimo|gumdrop|pancita|crocante|amigos|energia/;
const arg = (name: string) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined; };
const sectionOf = (type: string) => LIBRARY_CATALOG.find(section => section.id === type);

type Measure = { type: string; height: number; overflow: boolean; broken: number; photos: number; lowContrast: number };

/** In the page: each library block's height, sideways spill, broken and shown images, and text too faint on a solid ground. */
function measureBlocks(): Measure[] {
  const luminance = (rgb: number[]) => { const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
  const ground = (el: Element | null): number[] | null => {
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null; // text over a photo or a gradient: the model review judges it
      const [r, g, b, a = 1] = parse(style.backgroundColor);
      if (a > 0.9) return [r, g, b];
    }
    return [255, 255, 255];
  };
  return Array.from(document.querySelectorAll('main > [data-lb]')).map(block => {
    const box = block.getBoundingClientRect();
    let low = 0;
    for (const el of Array.from(block.querySelectorAll('h1,h2,h3,p,a,button,li'))) {
      if (!el.textContent?.trim() || el.children.length > 2 || el.closest('img,picture,video')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.5) continue;
      const bg = ground(el); if (!bg) continue;
      const [l1, l2] = [luminance(parse(style.color).slice(0, 3)), luminance(bg)].sort((x, y) => y - x);
      if ((l1 + 0.05) / (l2 + 0.05) < (parseFloat(style.fontSize) >= 24 ? 3 : 4.5)) low++;
    }
    const images = Array.from(block.querySelectorAll('img'));
    return { type: block.getAttribute('data-lb') ?? '', height: Math.round(box.height), overflow: block.scrollWidth > block.clientWidth + 2,
      broken: images.filter(img => img.complete && img.naturalWidth === 0 && img.getBoundingClientRect().width > 0).length,
      photos: images.filter(img => img.getBoundingClientRect().width > 40).length, lowContrast: low };
  });
}

(async () => {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const only = arg('--only')?.split(',');
  const shots = arg('--shots');
  const all = readdirSync(templatesDir).filter(id => existsSync(join(templatesDir, id, 'template.json')));
  const ids = all.filter(id => (templateManifest(id) as any)?.preset?.variants?.theme && (!only || only.includes(id)));
  // A sample of every section: its first appearance in any template's home, with that template's words.
  const samples = new Map<string, LayoutBlock>();
  for (const id of all) for (const block of ((templateManifest(id) as any)?.preset?.layout ?? []) as LayoutBlock[]) if (!samples.has(block.type)) samples.set(block.type, block);
  const fit: Record<string, string[]> = { ...(previous.fit ?? {}) };
  const proposed: Record<string, string[]> = { ...(previous.proposed ?? {}) };
  for (const id of ids) {
    const resolved = resolvePresetTemplate(templateManifest(id)!, templateManifest);
    const preset = resolved.preset as any;
    const own: LayoutBlock[] = preset.layout ?? [];
    const slots = resolved.manifest.photos.map(photo => photo.slot);
    let next = 0;
    const slot = () => `slot:${slots[next++ % Math.max(1, slots.length)]}`;
    const restyle = (block: LayoutBlock): LayoutBlock => ({ ...block, ...(block.photo ? { photo: slot() } : {}), ...(block.photo2 ? { photo2: slot() } : {}),
      ...(block.items ? { items: block.items.map(item => (item.photo ? { ...item, photo: slot() } : item)) } : {}) });
    const calm = !PLAYFUL.test(id);
    const candidates = LIBRARY_CATALOG.filter(section => !section.decor && section.role !== 'cover' && samples.has(section.id) && !own.some(block => block.type === section.id))
      .filter(section => !(calm && LOUD.has(section.id))).map(section => restyle(samples.get(section.id)!));
    const cover = own.find(block => sectionOf(block.type)?.role === 'cover') ?? own[0];
    const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0,
      ...(await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.sourceId), { ...preset, layout: [cover, ...candidates] }, (resolved as any).demo)) } as any);
    const css = ((snapshot as any).files.find((file: any) => file.path === 'styles/globals.css')?.content ?? '') as string;
    const measured: Record<number, Measure[]> = {};
    await withVisualSandbox(snapshot as any, '', undefined, false, async (context: any) => {
      for (const width of [1280, 390]) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
        await page.evaluate(async () => { await (document as any).fonts.ready; for (const img of Array.from(document.images)) img.loading = 'eager'; });
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 500) { await page.evaluate((v: number) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
        await page.waitForTimeout(800);
        measured[width] = await page.evaluate(measureBlocks);
        if (shots) {
          mkdirSync(join(shots, id), { recursive: true });
          const blocks = page.locator('main > [data-lb]');
          const count = await blocks.count();
          for (let i = 0; i < count; i++) {
            const type = await blocks.nth(i).getAttribute('data-lb');
            await blocks.nth(i).screenshot({ path: join(shots, id, `${width === 1280 ? 'd' : 'm'}-${type}.jpg`), type: 'jpeg', quality: 60, animations: 'disabled' }).catch(() => {});
          }
        }
        await page.close();
      }
    });
    const needsPhoto = (type: string) => (sectionOf(type)?.needs.photos ?? 0) >= 1;
    const passes = (type: string) => [1280, 390].every(width => {
      const m = (measured[width] ?? []).find(entry => entry.type === type);
      return Boolean(m) && m!.height >= 120 && m!.height <= 2400 && !m!.overflow && !m!.broken && !m!.lowContrast && (!needsPhoto(type) || m!.photos > 0);
    });
    fit[id] = [...new Set([...own.map(block => block.type), ...candidates.map(block => block.type).filter(passes)])];
    // Signature proposal: the cover, then the own sections this template styles most in its own CSS (template-only ones count one more).
    const themed = [...css.matchAll(new RegExp(`\\[data-es-theme="${id}"\\][^{]*`, 'g'))].map(match => match[0]).join(' ');
    const rest = own.filter(block => block !== cover && !sectionOf(block.type)?.decor)
      .map(block => ({ type: block.type, score: (themed.match(new RegExp(`lb-${block.type.split('-')[0]}`, 'g')) ?? []).length + (sectionOf(block.type)?.templateOnly ? 1 : 0) }))
      .filter((entry, at, list) => list.findIndex(other => other.type === entry.type) === at).sort((a, b) => b.score - a.score);
    proposed[id] = [cover.type, ...rest.slice(0, 2).filter(entry => entry.score > 0).map(entry => entry.type)];
    console.log(`${id}: ${fit[id].length} fit (${candidates.length} tried), signature ${proposed[id].join(' + ')}`);
  }
  writeFileSync(OUT, `${JSON.stringify({ fit, signature: previous.signature ?? {}, proposed, vetoed: previous.vetoed ?? {} }, null, 1)}\n`);
  console.log('wrote', OUT);
})().catch(error => { console.error(error); process.exitCode = 1; });
```

- [ ] **Step 2: Run it on one template first, with shots**

`packages/store-templates` is read by the API watcher; writing `section-fit.json` there is a data file and does not restart it. Still, run the job check before Step 3.

```bash
cd /Users/saramia/pagosYa/apps/api && export PATH="$HOME/.nvm/versions/node/v26.5.0/bin:$PATH" && npx ts-node --transpile-only -P tsconfig.json scripts/section-fit.ts --only merienda --shots /private/tmp/claude-501/section-fit-shots
```

Expected:
- A line `merienda: N fit (M tried), signature cover-mega + …`, and the file written.
- Open three shots (one that fit, one refused, the cover).
- A blank or broken block that passed means a check is missing. Fix `measureBlocks` before going on.

- [ ] **Step 3: Run all templates** (about 38 templates × 2 widths; no database)

Same command without `--only`. Expected: one line per themed template, and `wrote …/section-fit.json`.

- [ ] **Step 4: Owner gallery — STOP for the owner**

- Publish an artifact page: one row per template; its proposed signature first, marked; then each fitting section's desktop shot, labelled with its section type.
- Ask the owner which sections to veto per template and whether to change any signature.
- Write their answer into `section-fit.json`:
  - `signature[<id>]` = the approved list (copy `proposed[<id>]` when approved as is);
  - `vetoed[<id>]` = the sections they marked.
- Do not start Task 8 before this.

- [ ] **Step 5: Add the reader and its test**

Add to `source-composer.ts` (imports at the top):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { templatesDir } from '@pagosya/store-templates';

let fitCache: SectionFit | undefined;
/** section-fit.json (spec 2026-11-11), read once; a missing or unreadable file means no template is composed. */
export function readSectionFit(): SectionFit {
  if (fitCache) return fitCache;
  try {
    const raw = JSON.parse(readFileSync(join(templatesDir, 'esencial', 'section-fit.json'), 'utf8'));
    fitCache = { fit: raw.fit ?? {}, signature: raw.signature ?? {}, vetoed: raw.vetoed ?? {} };
  } catch { fitCache = { fit: {}, signature: {} }; }
  return fitCache;
}
```

```ts
// apps/api/src/storefront-source/source-composer-data.spec.ts
import { templateManifest } from '@pagosya/store-templates';
import { LIBRARY_CATALOG } from './source-section-library';
import { composerTemplate, readSectionFit } from './source-composer';
import { resolvePresetTemplate } from './source-templates';

describe('section-fit.json (spec 2026-11-11 store composer)', () => {
  const data = readSectionFit();
  const known = new Set(LIBRARY_CATALOG.map(section => section.id));
  it('names only library sections', () => {
    for (const list of [...Object.values(data.fit), ...Object.values(data.signature), ...Object.values(data.vetoed ?? {})]) for (const type of list) expect(known).toContain(type);
  });
  it('every template with an approved signature gives the composer a view whose signature starts with its cover', () => {
    for (const id of Object.keys(data.signature)) {
      const resolved = resolvePresetTemplate(templateManifest(id)!, templateManifest);
      const view = composerTemplate(id, resolved.manifest.name, resolved.preset as never, data);
      expect(view).not.toBeNull();
      expect(LIBRARY_CATALOG.find(section => section.id === view!.signature[0])?.role).toBe('cover');
      expect(view!.allowed.length).toBeGreaterThanOrEqual(9);
    }
  });
});
```

Job check, then run: `npx jest src/storefront-source/source-composer-data.spec.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/section-fit.ts packages/store-templates/templates/esencial/section-fit.json apps/api/src/storefront-source/source-composer.ts apps/api/src/storefront-source/source-composer-data.spec.ts
git commit -m "feat(composer): section fit per template and owner-approved signatures (spec 2026-11-11)"
```

---

### Task 3: The library check in composed mode

**Files:**
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (`validateLibraryLayout`, about lines 265–370)
- Test: `apps/api/src/storefront-source/source-section-library.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateLibraryLayout(answer, facts, { composed: { allowed: readonly string[]; looks: Readonly<Record<string, readonly string[]>> } })`. With `composed`:
  - a template-only section in `allowed` is kept, and anything outside `allowed` is dropped;
  - a look listed for that type in `looks` is kept;
  - photos follow the template rule (twice at most, never in neighbouring sections, empty places take the least-shown photo);
  - free-mode rules (one cover, one main grid, no section twice) still apply.

- [ ] **Step 1: Write the failing test** (append to `source-section-library.spec.ts`; use the file's existing facts fixture by its name there)

```ts
describe('composed mode (spec 2026-11-11 store composer)', () => {
  const composed = { allowed: ['cover-mega', 'products-rows', 'story-split', 'closing-wordmark'], looks: { 'cover-mega': ['side', 'tilt'] } };
  it('keeps template-only sections the template allows, with the template\'s looks, and drops the rest', () => {
    const out = validateLibraryLayout({ blocks: [
      { type: 'cover-mega', look: 'tilt', title: 'Hola', photo: 0, items: [{ title: 'Uno' }, { title: 'Dos' }] },
      { type: 'products-rows', title: 'Sabores' },
      { type: 'reviews-cards', title: 'Opiniones' },
      { type: 'story-split', title: 'Nuestra historia', text: 'Horneamos cada día.', photo: 1 },
      { type: 'closing-wordmark', title: 'Hasta pronto' },
    ] } as never, facts, { composed });
    expect(out.map(block => block.type)).toEqual(expect.arrayContaining(['cover-mega', 'story-split', 'closing-wordmark']));
    expect(out.map(block => block.type)).not.toContain('reviews-cards');
    expect(out.find(block => block.type === 'cover-mega')?.look).toBe('tilt');
  });
  it('without composed, a template-only section is still dropped (free mode unchanged)', () => {
    const out = validateLibraryLayout({ blocks: [{ type: 'cover-mega', look: 'tilt', title: 'Hola', photo: 0 }] } as never, facts);
    expect(out.map(block => block.type)).not.toContain('cover-mega');
  });
});
```

(`products-rows` may drop for lack of products in the fixture; that is the existing needs check, so the first test only pins the sections it can.)

- [ ] **Step 2: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/source-section-library.spec.ts -t "composed mode"`
Expected: FAIL. `cover-mega` is dropped as template-only.

- [ ] **Step 3: Implement** (four edits in `validateLibraryLayout`)

Signature and the two flags at the top:

```ts
export function validateLibraryLayout(answer: { blocks?: RawBlock[] } | null | undefined, facts: LibraryFacts, options: { fixed?: LayoutBlock[]; now?: number;
  /** Spec 2026-11-11 store composer: a home composed inside a template — its allowed sections and looks, its photo rule. */
  composed?: { allowed: readonly string[]; looks: Readonly<Record<string, readonly string[]>> } } = {}): LayoutBlock[] {
  const fixedMode = Boolean(options.fixed?.length);
  const composed = options.composed;
  // A template's photo rule (twice, never neighbouring) for its fixed home and for a home composed inside it.
  const twice = fixedMode || Boolean(composed);
```

- In `takePhoto`, replace `if (fixedMode) {` with `if (twice) {`.
- In `pick`, replace `if (!fixedMode) return undefined;` with `if (!twice) return undefined;`.
- In the loop, replace `if (!section || (section.templateOnly && !fixedMode)) continue;` with:

```ts
    if (!section || (section.templateOnly && !fixedMode && !composed?.allowed.includes(section.id))) continue;
    if (composed && !composed.allowed.includes(section.id)) continue;
```

- Replace `if (raw.look && (raw.template || section.looks?.includes(raw.look))) block.look = raw.look;` with:

```ts
    if (raw.look && (raw.template || section.looks?.includes(raw.look) || composed?.looks[section.id]?.includes(raw.look))) block.look = raw.look;
```

- [ ] **Step 4: Run the whole file**

Run: `npx jest src/storefront-source/source-section-library.spec.ts`
Expected: PASS, every earlier test included (fill and free modes unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-section-library.ts apps/api/src/storefront-source/source-section-library.spec.ts
git commit -m "feat(composer): the library check keeps a template's allowed sections and looks in a composed home"
```

---

### Task 4: The composer's prompts and model calls

**Files:**
- Modify: `apps/api/src/storefront-source/source-composer.ts` (prompts, schemas, review reader)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (`composeHome`, `reviewHome`, and a `libraryImages` helper pulled out of `composeLibrary`)
- Modify: `apps/api/src/config/configuration.ts`
- Test: `source-composer.spec.ts`, `source-conversation.service.spec.ts`, `src/config/configuration.spec.ts`

**Interfaces:**
- Consumes:
  - `ComposerTemplate`, `HomeSummary`, `ComposerProblem`, `ComposerChangeKind`, `lookOptions` (Task 1);
  - `LIBRARY_PROMPT`, `LIBRARY_ICON_NAMES`, `libraryAnswerSchema` (section library);
  - `HOME_REVIEW_PROBLEMS` (agent/home-writer-review);
  - `sourceUsage` (source-generation-policy).
- Produces:
  - `composerCatalogue(template)`
  - `composerAnswerSchema(photoCount, template)`
  - `composerPrompt(template, recent, feedback)`
  - `COMPOSER_PROBLEMS`
  - `composerReviewSchema()`
  - `composerReviewPrompt()`
  - `composerReviewText(layout, template, recent, photoCount)`
  - `readComposerReview(raw): ComposerProblem[]`
  - `SourceConversationService.composeHome(merchantId, { storeId, facts, template, recent, feedback }): Promise<{ answer: { blocks?: unknown[]; mood?: unknown; titleStyle?: unknown } | null; microUsd: number }>`
  - `SourceConversationService.reviewHome(merchantId, { storeId, layout, template, recent, photoCount, images }): Promise<{ problems: ComposerProblem[]; microUsd: number }>`
  - Config: `app.yapiComposer`, `app.yapiComposerModel`, `app.yapiComposerEffort`, `app.yapiComposerMaxUsd`.

- [ ] **Step 1: Write the failing tests for the pure parts** (append to `source-composer.spec.ts`; merge the import into the existing one)

```ts
import { composerAnswerSchema, composerCatalogue, composerPrompt, composerReviewText, readComposerReview } from './source-composer';

describe('what the composer reads', () => {
  it('the prompt names the signature, the recent homes and what failed last time', () => {
    const text = composerPrompt(T, [{ store: 'Miga', cover: 'cover-mega:side', types: ['cover-mega', 'products-rows'] }], ['falta products-rows']);
    expect(text).toMatch(/Merienda/);
    expect(text).toMatch(/cover-mega, products-rows/);
    expect(text).toMatch(/Miga: cover-mega:side/);
    expect(text).toMatch(/falta products-rows/);
  });
  it('the catalogue is the allowed sections with every look they may take', () => {
    const cover = composerCatalogue(T).find(section => section.id === 'cover-mega')!;
    expect(cover.looks).toEqual(expect.arrayContaining(['side', 'stack', 'tilt']));
    expect(composerCatalogue(T).map(section => section.id)).not.toContain('reviews-cards');
  });
  it('the answer schema offers only allowed sections and accepts the template\'s own looks', () => {
    const schema = composerAnswerSchema(5, T) as any;
    expect(schema.properties.blocks.items.properties.look.enum).toEqual(expect.arrayContaining(['side', 'lines', 'alternate']));
    expect(schema.properties.blocks.items.properties.type.enum).toEqual(T.allowed);
  });
  it('the review sees numbered sections and reads back only known problems and changes', () => {
    expect(composerReviewText(home(['products-rows']), T, [], 4)).toMatch(/^0\. cover-mega \(side\)/m);
    expect(readComposerReview({ problemas: [
      { problema: 'palabras cortadas', seccion: 2, cambio: 'look', valor: 'tilt' },
      { problema: 'inventado', seccion: 1, cambio: 'look', valor: 'x' },
      { problema: 'palabras cortadas', seccion: 1, cambio: 'repaint', valor: 'x' },
    ] })).toEqual([{ problem: 'palabras cortadas', at: 2, kind: 'look', value: 'tilt' }]);
    expect(readComposerReview('{oops')).toEqual([]);
  });
});
```

- [ ] **Step 2: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/source-composer.spec.ts`
Expected: FAIL. `composerPrompt` is not exported.

- [ ] **Step 3: Implement the pure parts** (append to `source-composer.ts`)

Change the first import to `import { LIBRARY_CATALOG, libraryAnswerSchema, type LayoutBlock } from './source-section-library';` and add `import { HOME_REVIEW_PROBLEMS } from './agent/home-writer-review';`.

```ts
export function composerCatalogue(template: ComposerTemplate) {
  return template.allowed.map(id => { const section = BY_ID.get(id)!; const looks = lookOptions(template, id);
    return { id, role: section.role, use: section.use, ...(looks.length ? { looks } : {}) }; });
}

export function composerAnswerSchema(photoCount: number, template: ComposerTemplate): object {
  const schema = JSON.parse(JSON.stringify(libraryAnswerSchema(photoCount)));
  const block = schema.properties.blocks.items.properties;
  block.type.enum = [...template.allowed];
  block.look.enum = [...new Set([...block.look.enum, ...Object.values(template.looks).flat()])];
  return schema;
}

export function composerPrompt(template: ComposerTemplate, recent: readonly HomeSummary[], feedback: readonly string[]): string {
  return `MODO COMPOSITOR (manda sobre las reglas de arriba): la tienda usa la plantilla ${template.name}. Su encabezado, menú, pie, tarjetas, fuentes
y colores ya están puestos; tú armas SOLO su portada, con secciones de «catalogue» (todas probadas dentro de esta plantilla).
- Secciones firma de ${template.name}, cada una UNA vez: ${template.signature.join(', ')}. ${template.signature[0]} es la portada y va arriba${template.lead
    ? ` (o justo debajo de ${template.lead}, la barra de la plantilla, si la usas)` : ''}. Elige su look entre los suyos.
- El resto es tuyo, para ESTA marca: qué secciones, cuántas (en total de 7 a 12), en qué orden, el look de cada una, las bandas y las fotos.
  Mira las fotos: la portada lleva la que mejor cuenta la marca.
- ${template.name} ya armó estas portadas para otras tiendas; la tuya se ve distinta (otra portada u otro look, otro orden, otras secciones):
${recent.map(other => `  · ${other.store}: ${other.cover} → ${other.types.join(', ')}`).join('\n') || '  (ninguna todavía)'}
${feedback.length ? `- Tu respuesta anterior no pasó estas revisiones; corrígelas:\n${feedback.map(reason => `  · ${reason}`).join('\n')}` : ''}`.trim();
}

export const COMPOSER_PROBLEMS = [...HOME_REVIEW_PROBLEMS, 'se parece a otra tienda de la plantilla'] as const;
const CHANGES: readonly ComposerChangeKind[] = ['swap', 'look', 'move', 'photo', 'band', 'remove'];

export function composerReviewSchema(): object {
  return { type: 'object', additionalProperties: false, required: ['problemas'], properties: { problemas: { type: 'array', maxItems: 6, items: {
    type: 'object', additionalProperties: false, required: ['problema', 'seccion', 'cambio', 'valor'], properties: {
      problema: { type: 'string', enum: [...COMPOSER_PROBLEMS] }, seccion: { type: 'integer', minimum: 0, maximum: 20 },
      cambio: { type: 'string', enum: [...CHANGES] }, valor: { type: 'string' } } } } } };
}

export function composerReviewPrompt(): string {
  return `Revisas la portada de una tienda antes de guardarla. Recibes capturas de página entera cortadas de arriba abajo: primero escritorio
(1280 px), luego celular (390 px), y la lista numerada de sus secciones.
Informa SOLO estos problemas, cuando se ven claramente: ${COMPOSER_PROBLEMS.join('; ')}.
No opines de gustos. Cada problema trae UN cambio sobre una sección por su número:
swap (valor = otra sección de «Puede usar»), look (valor = uno de sus looks), move (valor = la nueva posición),
photo (valor = el número de otra foto), band (paper, muted, accent, deep o vacío), remove (valor vacío).
Nunca quites ni cambies una sección [firma] ni la grilla principal; nunca muevas la portada. Si no hay problemas, devuelve la lista vacía.`;
}

export function composerReviewText(layout: readonly LayoutBlock[], template: ComposerTemplate, recent: readonly HomeSummary[], photoCount: number): string {
  const lines = layout.map((block, at) => `${at}. ${block.type}${block.look ? ` (${block.look})` : ''}${block.band ? ` banda ${block.band}` : ''}${block.title ? ` — «${block.title}»` : ''}${
    template.signature.includes(block.type) ? ' [firma]' : ''}${lookOptions(template, block.type).length ? ` looks: ${lookOptions(template, block.type).join('/')}` : ''}`);
  return `${lines.join('\n')}
Puede usar: ${template.allowed.join(', ')}.
Fotos de la tienda: 0 a ${Math.max(0, photoCount - 1)}.
Otras portadas recientes de ${template.name}:
${recent.map(other => `· ${other.store}: ${other.types.join(', ')}`).join('\n') || '(ninguna)'}`;
}

export function readComposerReview(raw: unknown): ComposerProblem[] {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  const list = (value as { problemas?: unknown } | null)?.problemas;
  return (Array.isArray(list) ? list : []).flatMap(entry => {
    const { problema, seccion, cambio, valor } = (entry ?? {}) as Record<string, unknown>;
    return (COMPOSER_PROBLEMS as readonly string[]).includes(String(problema)) && Number.isInteger(seccion) && (CHANGES as readonly string[]).includes(String(cambio))
      ? [{ problem: String(problema), at: seccion as number, kind: cambio as ComposerChangeKind, value: typeof valor === 'string' ? valor : '' }] : [];
  }).slice(0, 6);
}
```

- [ ] **Step 4: Run to verify the pure tests pass**

Run: `npx jest src/storefront-source/source-composer.spec.ts`
Expected: PASS.

- [ ] **Step 5: The settings, test first**

Add to `src/config/configuration.spec.ts`, using the file's existing way of calling the factory (copy it from the home writer test there):

```ts
  it('the store composer is off unless YAPI_COMPOSER=1, on sol, medium effort, a $10 cap (spec 2026-11-11)', () => {
    const off = configuration().app;
    expect(off).toMatchObject({ yapiComposer: false, yapiComposerModel: 'gpt-5.6-sol', yapiComposerEffort: 'medium', yapiComposerMaxUsd: 10 });
    process.env.YAPI_COMPOSER = '1'; process.env.YAPI_COMPOSER_MAX_USD = '8';
    try { expect(configuration().app).toMatchObject({ yapiComposer: true, yapiComposerMaxUsd: 8 }); }
    finally { delete process.env.YAPI_COMPOSER; delete process.env.YAPI_COMPOSER_MAX_USD; }
  });
```

Job check, then run it: FAIL. Then add to `configuration.ts`. In the `app` type, next to `yapiSectionLibraryModel: string;`:

```ts
  /** Spec 2026-11-11 store composer: a template store's first home composed for the brand (YAPI_COMPOSER=1), its model, effort and cap. */
  yapiComposer: boolean;
  yapiComposerModel: string;
  yapiComposerEffort: 'low' | 'medium' | 'high';
  yapiComposerMaxUsd: number;
```

and next to `yapiSectionLibraryModel: process.env.YAPI_SECTION_LIBRARY_MODEL || 'gpt-5.6-terra',`:

```ts
    yapiComposer: process.env.YAPI_COMPOSER === '1',
    yapiComposerModel: process.env.YAPI_COMPOSER_MODEL || 'gpt-5.6-sol',
    yapiComposerEffort: (['low', 'medium', 'high'] as const).find(effort => effort === process.env.YAPI_COMPOSER_EFFORT) ?? 'medium',
    yapiComposerMaxUsd: Number(process.env.YAPI_COMPOSER_MAX_USD) > 0 ? Number(process.env.YAPI_COMPOSER_MAX_USD) : 10,
```

Run `npx jest src/config/configuration.spec.ts`. Expected: PASS.

- [ ] **Step 6: Write the failing service tests** (append to `source-conversation.service.spec.ts`)

Build the service exactly as that file's existing `composeLibrary` tests do (copy their constructor call and their `fetch` stubbing). Then add:

```ts
describe('the store composer calls (spec 2026-11-11)', () => {
  const template = { id: 'merienda', name: 'Merienda', signature: ['cover-mega'], allowed: ['cover-mega', 'story-split'], looks: { 'cover-mega': ['side'] } };
  const facts = { what: 'Cereales', story: '', request: '', products: [], categories: [], photos: [{ url: '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg' }], codes: [], services: [], reviews: 0, tone: 'calm' } as never;
  const respond = (body: unknown) => { const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => body })); (global as any).fetch = fetchMock; return fetchMock; };
  it('composeHome sends the composer prompt and the allowed catalogue, and returns the answer with its cost', async () => {
    const fetchMock = respond({ output_text: JSON.stringify({ blocks: [{ type: 'cover-mega' }], mood: 'calm', titleStyle: 'firme' }), usage: { input_tokens: 1000, output_tokens: 200 } });
    const conversation = /* the file's builder, with config 'app.yapiComposerModel' → 'gpt-5.6-sol', 'app.yapiComposerEffort' → 'medium', prisma.mediaAsset.findMany → [] */;
    const out = await conversation.composeHome('m1', { storeId: 's1', facts, template, recent: [], feedback: [] });
    expect(out.answer?.blocks).toHaveLength(1);
    expect(out.microUsd).toBeGreaterThan(0);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.model).toBe('gpt-5.6-sol');
    expect(body.instructions).toMatch(/MODO COMPOSITOR/);
    expect(JSON.parse(body.input[0].content[0].text).catalogue.map((section: { id: string }) => section.id)).toEqual(['cover-mega', 'story-split']);
  });
  it('reviewHome returns the problems it can read', async () => {
    respond({ output_text: JSON.stringify({ problemas: [{ problema: 'palabras cortadas', seccion: 0, cambio: 'look', valor: 'side' }] }), usage: { input_tokens: 10, output_tokens: 5 } });
    const conversation = /* same builder */;
    const out = await conversation.reviewHome('m1', { storeId: 's1', layout: [{ type: 'cover-mega' }], template, recent: [], photoCount: 1, images: ['data:image/jpeg;base64,AAAA'] });
    expect(out.problems).toEqual([{ problem: 'palabras cortadas', at: 0, kind: 'look', value: 'side' }]);
  });
});
```

Replace each `/* the file's builder … */` with the file's real construction before running. It is a copy of what the existing `composeLibrary` test does, plus those config keys. If the response reader in that file uses a different body shape than `output_text`, use the shape the existing tests feed `sourceResponseJson`.

- [ ] **Step 7: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/source-conversation.service.spec.ts -t "store composer"`
Expected: FAIL. `composeHome` is not a function.

- [ ] **Step 8: Implement**

In `source-conversation.service.ts`:
- Import `composerAnswerSchema, composerCatalogue, composerPrompt, composerReviewPrompt, composerReviewSchema, composerReviewText, readComposerReview, type ComposerProblem, type ComposerTemplate, type HomeSummary` from `./source-composer`.
- Import `sourceUsage` from `./source-generation-policy`, if it is not imported yet.

Pull the photo loop out of `composeLibrary`:

```ts
  /** The store's own photos as low-detail images, each after its number (shared by the library and the composer). */
  private async libraryImages(merchantId: string, urls: readonly string[]) {
    const owned = urls.length ? new Set((await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: [...urls] } }, select: { url: true } })).map(asset => asset.url)) : new Set<string>();
    const images: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' }> = [];
    for (const [index, url] of urls.entries()) {
      const filename = url.split('/').at(-1)!;
      if (!this.uploads.contentTypeFor(filename).startsWith('image/')) continue;
      const bytes = owned.has(url) ? await this.uploads.getBuffer(filename).catch(() => null) : null;
      if (bytes && bytes.length <= 4_000_000) images.push({ type: 'input_text', text: `Foto ${index}` }, { type: 'input_image', image_url: `data:${this.uploads.contentTypeFor(filename)};base64,${bytes.toString('base64')}`, detail: 'low' });
    }
    return images;
  }
```

In `composeLibrary`, delete its `owned` and `images` lines and its `for` loop, and write `const images = await this.libraryImages(merchantId, photos);` in their place.

Add after `composeLibrary`:

```ts
  /** Spec 2026-11-11 store composer: the brand's home composed inside its template, from the sections that fit it. */
  async composeHome(merchantId: string, input: { storeId: string; facts: LibraryFacts; template: ComposerTemplate; recent: HomeSummary[]; feedback: string[] }):
    Promise<{ answer: { blocks?: unknown[]; mood?: unknown; titleStyle?: unknown } | null; microUsd: number }> {
    const model = this.config.get<string>('app.yapiComposerModel') || 'gpt-5.6-sol';
    const provider = sourceProvider(this.config, model);
    const photos = input.facts.photos.map(photo => photo.url);
    const images = await this.libraryImages(merchantId, photos);
    const { photos: _urls, ...rest } = input.facts;
    const facts = { ...rest, photos: input.facts.photos.map((photo, index) => ({ index, ...(photo.product ? { product: photo.product } : {}), ...(photo.category ? { category: photo.category } : {}) })),
      icons: LIBRARY_ICON_NAMES, catalogue: composerCatalogue(input.template) };
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(240_000),
        body: JSON.stringify({ model, store: false, instructions: `${LIBRARY_PROMPT}\n\n${composerPrompt(input.template, input.recent, input.feedback)}`,
          input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(facts) }, ...images] }],
          text: { format: { type: 'json_schema', name: 'store_composer', strict: true, schema: composerAnswerSchema(photos.length, input.template) } },
          reasoning: { effort: this.config.get<'low' | 'medium' | 'high'>('app.yapiComposerEffort') ?? 'medium' }, max_output_tokens: 16000 }),
      });
      body = await response.json().catch(() => null);
      checkSourceProviderQuota(response.status, body, provider.name);
      const microUsd = sourceUsage(model as never, body?.usage)?.providerMicroUsd ?? 0;
      if (!response.ok) return { answer: null, microUsd };
      status = 'COMPLETED';
      return { answer: sourceResponseJson(body) as { blocks?: unknown[] }, microUsd };
    } finally { await this.metering?.record(input.storeId, 'source-composer', model, body, Date.now() - started, status); }
  }

  /** Spec 2026-11-11 store composer: the composed home looked at, desktop then phone; only problems with a change the code can apply. */
  async reviewHome(merchantId: string, input: { storeId: string; layout: LayoutBlock[]; template: ComposerTemplate; recent: HomeSummary[]; photoCount: number; images: string[] }):
    Promise<{ problems: ComposerProblem[]; microUsd: number }> {
    const model = this.config.get<string>('app.yapiComposerModel') || 'gpt-5.6-sol';
    const provider = sourceProvider(this.config, model);
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({ model, store: false, instructions: composerReviewPrompt(),
          input: [{ role: 'user', content: [{ type: 'input_text', text: composerReviewText(input.layout, input.template, input.recent, input.photoCount) },
            ...input.images.map(image_url => ({ type: 'input_image', image_url, detail: 'high' }))] }],
          text: { format: { type: 'json_schema', name: 'composer_review', strict: true, schema: composerReviewSchema() } },
          reasoning: { effort: this.config.get<'low' | 'medium' | 'high'>('app.yapiComposerEffort') ?? 'medium' }, max_output_tokens: 4000 }),
      });
      body = await response.json().catch(() => null);
      checkSourceProviderQuota(response.status, body, provider.name);
      const microUsd = sourceUsage(model as never, body?.usage)?.providerMicroUsd ?? 0;
      if (!response.ok) return { problems: [], microUsd };
      status = 'COMPLETED';
      return { problems: readComposerReview(sourceResponseJson(body)), microUsd };
    } finally { await this.metering?.record(input.storeId, 'source-composer-review', model, body, Date.now() - started, status); }
  }
```

`merchantId` is unused in `reviewHome`; name it `_merchantId` if the lint config complains. `LayoutBlock`, `LibraryFacts`, `LIBRARY_PROMPT` and `LIBRARY_ICON_NAMES` are already imported for `composeLibrary`. Add any that are missing.

- [ ] **Step 9: Run the two spec files, one at a time**

Run: `npx jest src/storefront-source/source-conversation.service.spec.ts`, then `npx jest src/storefront-source/source-composer.spec.ts`.
Expected: both PASS, with the earlier `composeLibrary` tests unchanged.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/storefront-source/source-composer.ts apps/api/src/storefront-source/source-composer.spec.ts apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-conversation.service.spec.ts apps/api/src/config/configuration.ts apps/api/src/config/configuration.spec.ts
git commit -m "feat(composer): compose and review calls on sol with their prompts, schemas and settings (spec 2026-11-11)"
```

---

### Task 5: Draft build and recent homes

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`refill` → shared `refilledFiles`, new `refillDraft`, new `recentThemeHomes`)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts`

**Interfaces:**
- Consumes: `homeSummary`, `HomeSummary` (Task 1); `readMasterState`, `TEMPLATE_STORE_DATA_PATH` (already imported in this service).
- Produces:
  - `SourceTemplatesService.refillDraft(merchantId, storeId, revision, change: MasterFill)` returns `projects.prepare(...)`'s result and saves nothing.
  - `SourceTemplatesService.recentThemeHomes(storeId: string, theme: string, limit = 6): Promise<HomeSummary[]>` returns newest first, other stores only.

- [ ] **Step 1: Write the failing tests** (inside `describe('SourceTemplatesService')`)

```ts
  it('refillDraft prepares the composed home without saving a revision (spec 2026-11-11)', async () => {
    const real = jest.requireActual('@pagosya/store-templates');
    const { templates: base, prisma } = service(2);
    const config = `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: {}, data: { categories: [], items: [] } })};\n`;
    const projects = { current: jest.fn(), save: jest.fn(), prepare: jest.fn(async (input: any) => ({ ...input, prepared: true })),
      version: jest.fn(async () => ({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'config.js', content: config }, { path: 'components/store-data.tsx', content: '' }] } })) };
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    const draft: any = await templates.refillDraft('m1', 's1', 2, { layout: [{ type: 'cover-mega', title: 'Hola' }] } as never);
    expect(projects.save).not.toHaveBeenCalled();
    expect(draft.prepared).toBe(true);
    expect(draft.files.find((file: any) => file.path === 'components/store-data.tsx').content).toContain('"cover-mega"');
  });

  it('recentThemeHomes reads the latest home of recent stores on the same template, newest first', async () => {
    const { templates, prisma } = service(0);
    const real = jest.requireActual('./source-templates');
    const data = (theme: string, types: string[]) => real.templateStoreDataFile({ name: 'x' }, {}, { copy: {}, look: {}, variants: { theme }, layout: types.map(type => ({ type })) }).content;
    (prisma as any).$queryRaw = jest.fn(async () => [
      { name: 'Miga', data: data('merienda', ['cover-mega', 'products-rows']) },
      { name: 'Brillo', data: data('neon', ['cover-ribbon']) },
      { name: 'Canasta', data: data('merienda', ['cover-mega', 'story-split']) },
      { name: 'Vacía', data: null },
    ]);
    const homes = await templates.recentThemeHomes('s1', 'merienda');
    expect(homes.map(home => home.store)).toEqual(['Miga', 'Canasta']);
    expect(homes[0]).toEqual({ store: 'Miga', cover: 'cover-mega:', types: ['cover-mega', 'products-rows'] });
  });
```

`templateStoreDataFile` (source-templates.ts:114) writes store-data the way real stores have it. If its `master` argument needs more fields to type-check, pass them as `as never`; the test only reads `variants.theme` and `layout` back.

- [ ] **Step 2: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/source-templates.service.spec.ts -t "refillDraft|recentThemeHomes"`
Expected: FAIL. `refillDraft` is not a function.

- [ ] **Step 3: Implement** (replace the body of `refill`, add the two methods, import `homeSummary, type HomeSummary` from `./source-composer`)

```ts
  /** The store's files with a MasterFill applied, its photos bundled: what refill saves and what refillDraft only prepares. */
  private async refilledFiles(merchantId: string, storeId: string, revision: number, change: MasterFill, options: { files?: <T extends { path: string; content: string }>(files: T[]) => T[]; refreshData?: boolean } = {}) {
    const previous = await this.projects.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const manifest = snapshot.brief?.templateId ? this.registry.templateManifest(snapshot.brief.templateId) : undefined;
    if (!manifest?.master) throw new BadRequestException('Esta tienda no usa la plantilla base.');
    const bundled = await this.bundleMasterPhotos(merchantId, change);
    // Dropdown menu spec 2026-10-21: a menu change is checked against the live catalog, so a category made after the last build can
    // be linked (final review); config.js data is refreshed the way every save refreshes it.
    const live = change.menu || options.refreshData ? await this.liveConfigData(merchantId, storeId).catch(() => undefined) : undefined;
    const refilled = refillMasterFiles(live ? withLiveCatalog(snapshot.files, live) : snapshot.files, manifest, bundled.change, sourcePublicApiUrl(this.config));
    const files = options.files ? options.files(refilled) : refilled;
    return { brief: snapshot.brief, files: [...files, ...bundled.files.filter(asset => !files.some(file => file.path === asset.path))] };
  }

  async refill(merchantId: string, storeId: string, revision: number, change: MasterFill, label: string, options: { files?: <T extends { path: string; content: string }>(files: T[]) => T[]; refreshData?: boolean } = {}) {
    const { brief, files } = await this.refilledFiles(merchantId, storeId, revision, change, options);
    return this.projects.save(merchantId, storeId, { revision, label, brief, files });
  }

  /** Spec 2026-11-11 store composer: a composed home built for its photographs only — prepared, never saved. */
  async refillDraft(merchantId: string, storeId: string, revision: number, change: MasterFill) {
    const { brief, files } = await this.refilledFiles(merchantId, storeId, revision, change);
    return this.projects.prepare({ revision, label: 'Borrador del compositor', brief, files } as never);
  }

  /** Spec 2026-11-11 store composer: the homes of the latest stores on the same template (other stores), newest first. Only
   *  store-data is read, in SQL, from the latest revision of each of the 40 newest stores. */
  async recentThemeHomes(storeId: string, theme: string, limit = 6): Promise<HomeSummary[]> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ name: string; data: string | null }>>(Prisma.sql`
        SELECT s.name, (
          SELECT f->>'content' FROM "StoreSourceVersion" v, jsonb_array_elements(v.snapshot->'files') f
          WHERE v."storeId" = s.id AND f->>'path' = ${TEMPLATE_STORE_DATA_PATH} ORDER BY v.revision DESC LIMIT 1) AS data
        FROM "Store" s WHERE s.id <> ${storeId} ORDER BY s."createdAt" DESC LIMIT 40`);
      return rows.flatMap(row => {
        if (!row.data) return [];
        const state = readMasterState([{ path: TEMPLATE_STORE_DATA_PATH, content: row.data }]);
        const layout = (state.layout ?? []) as Array<{ type: string; look?: string }>;
        return String((state.variants as Record<string, unknown> | undefined)?.theme ?? '') === theme && layout.length ? [homeSummary(row.name, layout)] : [];
      }).slice(0, limit);
    } catch { return []; }
  }
```

- [ ] **Step 4: Run the whole file**

Run: `npx jest src/storefront-source/source-templates.service.spec.ts`
Expected: PASS, including every earlier `refill` test and this morning's slot-photo test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-templates.service.ts apps/api/src/storefront-source/source-templates.service.spec.ts
git commit -m "feat(composer): a draft build that saves nothing, and the recent homes on a template (spec 2026-11-11)"
```

---

### Task 6: The composer loop

**Files:**
- Create: `apps/api/src/storefront-source/source-composer-run.ts`
- Test: `apps/api/src/storefront-source/source-composer-run.spec.ts`

**Interfaces:**
- Consumes: `LayoutBlock`; `ComposerProblem` (Task 1).
- Produces: `ComposerDeps`, `ComposerResult` and `runComposer(deps): Promise<ComposerResult>`, exactly as in Step 3.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-composer-run.spec.ts
import { runComposer, type ComposerDeps } from './source-composer-run';
import type { LayoutBlock } from './source-section-library';

const A: LayoutBlock[] = [{ type: 'cover-mega' }, { type: 'products-rows' }];
const B: LayoutBlock[] = [{ type: 'cover-mega', look: 'tilt' }, { type: 'products-rows' }];
const problem = { problem: 'palabras cortadas', at: 0, kind: 'look' as const, value: 'tilt' };
function deps(over: Partial<ComposerDeps> = {}): ComposerDeps {
  return {
    compose: jest.fn(async () => ({ answer: { blocks: A }, microUsd: 500_000 })),
    validate: jest.fn(answer => answer.blocks as LayoutBlock[]),
    check: jest.fn(() => []),
    capture: jest.fn(async () => ['img']),
    review: jest.fn(async () => ({ problems: [], microUsd: 300_000 })),
    apply: jest.fn(() => ({ layout: B, applied: ['look'], rewrite: [] })),
    rewrite: jest.fn(async layout => ({ layout, microUsd: 100_000 })),
    trace: jest.fn(),
    maxMicroUsd: 10_000_000, ...over };
}

describe('the store composer loop (spec 2026-11-11)', () => {
  it('a clean first review keeps the composed home', async () => {
    expect(await runComposer(deps())).toMatchObject({ layout: A, outcome: 'clean', rounds: 1, spentMicroUsd: 800_000 });
  });
  it('a refused composition is sent back once with its reasons', async () => {
    const check = jest.fn().mockReturnValueOnce(['falta products-rows']).mockReturnValue([]);
    const d = deps({ check });
    const out = await runComposer(d);
    expect(d.compose).toHaveBeenNthCalledWith(2, ['falta products-rows']);
    expect(out.layout).toEqual(A);
  });
  it('a check that keeps failing falls back to fill mode', async () => {
    const d = deps({ check: jest.fn(() => ['muy corta']) });
    expect(await runComposer(d)).toMatchObject({ layout: null, outcome: 'fill' });
    expect(d.compose).toHaveBeenCalledTimes(2);
  });
  it('review changes are applied, checked and reviewed again, up to three rounds', async () => {
    const review = jest.fn(async () => ({ problems: [problem], microUsd: 100_000 }));
    expect(await runComposer(deps({ review }))).toMatchObject({ layout: B, outcome: 'reviewed', rounds: 3 });
    expect(review).toHaveBeenCalledTimes(3);
  });
  it('a change the check refuses keeps the last good home', async () => {
    const check = jest.fn((layout: LayoutBlock[]) => (layout === B ? ['se parece a Miga'] : []));
    const review = jest.fn(async () => ({ problems: [problem], microUsd: 0 }));
    expect((await runComposer(deps({ check, review }))).layout).toEqual(A);
  });
  it('swapped sections get their words before the check', async () => {
    const apply = jest.fn(() => ({ layout: B, applied: ['swap'], rewrite: [1] }));
    const review = jest.fn().mockResolvedValueOnce({ problems: [{ ...problem, kind: 'swap', value: 'story-split' }], microUsd: 0 }).mockResolvedValue({ problems: [], microUsd: 0 });
    const d = deps({ apply, review });
    await runComposer(d);
    expect(d.rewrite).toHaveBeenCalledWith(B, [1]);
  });
  it('the budget stops the reviews and keeps the best home so far', async () => {
    expect(await runComposer(deps({ maxMicroUsd: 400_000 }))).toMatchObject({ layout: A, outcome: 'budget' });
  });
  it('a failed capture or review saves the composed home without a review', async () => {
    expect(await runComposer(deps({ capture: jest.fn(async () => null) }))).toMatchObject({ layout: A, outcome: 'review-skipped' });
    expect(await runComposer(deps({ review: jest.fn(async () => { throw new Error('timeout'); }) }))).toMatchObject({ layout: A, outcome: 'review-skipped' });
  });
  it('a cancel or a spent quota stops the loop', async () => {
    await expect(runComposer(deps({ compose: jest.fn(async () => { throw new Error('quota'); }) }))).rejects.toThrow('quota');
    const controller = new AbortController(); controller.abort();
    await expect(runComposer(deps({ signal: controller.signal }))).rejects.toThrow(/cancel/i);
  });
});
```

- [ ] **Step 2: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/source-composer-run.spec.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/storefront-source/source-composer-run.ts
import type { LayoutBlock } from './source-section-library';
import type { ComposerProblem } from './source-composer';

/** Spec 2026-11-11 store composer: compose (twice at most), then look and correct (three rounds at most). Every side effect is
 *  injected; an error from compose (a spent quota) or a cancel stops the build, any trouble in the review keeps the last good home. */
export type ComposerDeps = {
  compose: (feedback: string[]) => Promise<{ answer: { blocks?: unknown[] } | null; microUsd: number }>;
  validate: (answer: { blocks?: unknown[] }) => LayoutBlock[];
  check: (layout: LayoutBlock[]) => string[];
  capture: (layout: LayoutBlock[]) => Promise<string[] | null>;
  review: (layout: LayoutBlock[], images: string[]) => Promise<{ problems: ComposerProblem[]; microUsd: number }>;
  apply: (layout: LayoutBlock[], problems: ComposerProblem[]) => { layout: LayoutBlock[]; applied: string[]; rewrite: number[] };
  rewrite: (layout: LayoutBlock[], at: number[]) => Promise<{ layout: LayoutBlock[]; microUsd: number }>;
  trace: (entry: Record<string, unknown>) => void;
  maxMicroUsd: number;
  rounds?: number;
  signal?: AbortSignal;
};
export type ComposerResult = { layout: LayoutBlock[] | null; answer: { blocks?: unknown[] } | null; spentMicroUsd: number; rounds: number;
  outcome: 'clean' | 'reviewed' | 'budget' | 'review-skipped' | 'fill' };

export async function runComposer(deps: ComposerDeps): Promise<ComposerResult> {
  const stop = () => { if (deps.signal?.aborted) throw new Error('El pedido se canceló.'); };
  let spent = 0;
  let feedback: string[] = [];
  let layout: LayoutBlock[] | null = null;
  let answer: { blocks?: unknown[] } | null = null;
  for (let attempt = 0; attempt < 2 && !layout; attempt++) {
    stop();
    const composed = await deps.compose(feedback);
    spent += composed.microUsd;
    if (!composed.answer) { deps.trace({ stage: 'compose', attempt, outcome: 'no-answer' }); break; }
    const candidate = deps.validate(composed.answer);
    const reasons = deps.check(candidate);
    deps.trace({ stage: 'compose', attempt, kept: candidate.map(block => block.type), reasons, spentMicroUsd: spent });
    if (reasons.length) { feedback = reasons; continue; }
    layout = candidate; answer = composed.answer;
  }
  if (!layout) return { layout: null, answer: null, spentMicroUsd: spent, rounds: 0, outcome: 'fill' };
  let outcome: ComposerResult['outcome'] = 'reviewed';
  let rounds = 0;
  for (let round = 1; round <= (deps.rounds ?? 3); round++) {
    stop();
    if (spent >= deps.maxMicroUsd) { outcome = 'budget'; break; }
    const images = await deps.capture(layout).catch(() => null);
    if (!images?.length) { outcome = 'review-skipped'; deps.trace({ stage: 'review', round, outcome: 'capture-failed' }); break; }
    let reviewed: { problems: ComposerProblem[]; microUsd: number };
    try { reviewed = await deps.review(layout, images); } catch (error) {
      stop();
      outcome = 'review-skipped'; deps.trace({ stage: 'review', round, outcome: 'failed', reason: String((error as Error)?.message ?? error).slice(0, 200) }); break;
    }
    spent += reviewed.microUsd; rounds = round;
    if (!reviewed.problems.length) { outcome = 'clean'; deps.trace({ stage: 'review', round, outcome: 'clean', spentMicroUsd: spent }); break; }
    const changed = deps.apply(layout, reviewed.problems);
    deps.trace({ stage: 'review', round, problems: reviewed.problems.map(entry => `${entry.problem} @${entry.at} ${entry.kind}=${entry.value}`), applied: changed.applied, spentMicroUsd: spent });
    if (!changed.applied.length) break;
    let next = changed.layout;
    if (changed.rewrite.length) { const written = await deps.rewrite(next, changed.rewrite); spent += written.microUsd; next = written.layout; }
    const reasons = deps.check(next);
    if (reasons.length) { deps.trace({ stage: 'review', round, outcome: 'change-refused', reasons }); break; }
    layout = next;
  }
  return { layout, answer, spentMicroUsd: spent, rounds, outcome };
}
```

The quota case is handled by the caller (Task 7). A `compose` that throws propagates out of `runComposer` unchanged, which is what the «spent quota» test pins. The review's thrown errors are swallowed only after `stop()` has had a chance to rethrow a cancel.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/storefront-source/source-composer-run.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-composer-run.ts apps/api/src/storefront-source/source-composer-run.spec.ts
git commit -m "feat(composer): compose, look and correct loop with fallback, budget and cancel (spec 2026-11-11)"
```

---

### Task 7: Wire it into the first build

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`sectionLibrary`, about lines 888–970; new private `composeTemplateHome`)
- Test: the spec that already covers the section library follow-up. Find it:

```bash
cd /Users/saramia/pagosYa/apps/api && grep -ln "Portada de YAPI" src/storefront-source/*.spec.ts | xargs grep -ln "sectionLibrary"
```

**Interfaces:**
- Consumes:
  - `runComposer` (Task 6);
  - `composerTemplate`, `composerCheck`, `applyComposerChanges`, `readSectionFit` (Tasks 1–2);
  - `validateLibraryLayout` with `composed` (Task 3);
  - `this.dialogue.composeHome` / `reviewHome` (Task 4);
  - `this.templates.refillDraft` / `recentThemeHomes` (Task 5);
  - `captureAgentDraft` (`./agent/agent-capture`);
  - `resolvePresetTemplate` (`./source-templates`).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Copy the arrange-and-act block of the nearest existing test in that spec that runs the section library follow-up on a template store. Make three tests from it, changing only what each line below says.

1. «with YAPI_COMPOSER on, a first build on a template with a signature saves the composed home»:
   - the store's store-data has `variants.theme: 'merienda'`;
   - the config getter returns `true` for `'app.yapiComposer'`;
   - `jest.spyOn(composer, 'readSectionFit')` (import `* as composer from './source-composer'`) returns `{ fit: { merienda: [...seven types] }, signature: { merienda: ['cover-mega'] } }`;
   - `dialogue.composeHome` resolves `{ answer: { blocks: <seven merienda blocks, cover-mega first> }, microUsd: 1 }`;
   - `dialogue.reviewHome` resolves `{ problems: [], microUsd: 1 }`;
   - `templates.refillDraft` resolves `{ files: [] }`;
   - `templates.recentThemeHomes` resolves `[]`;
   - `jest.mock('./agent/agent-capture', () => ({ ...jest.requireActual('./agent/agent-capture'), captureAgentDraft: jest.fn(async () => ({ image: 'img', sections: ['img'] })) }))`.
   - Assert:

     ```ts
     expect(templates.refill).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(Number), expect.objectContaining({ layout: expect.arrayContaining([expect.objectContaining({ type: 'cover-mega' })]) }), 'Portada compuesta por YAPI');
     expect(dialogue.composeLibrary).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ template: expect.arrayContaining([expect.objectContaining({ type: 'cover-mega' })]) }));
     ```

2. «with the switch off, fill mode runs exactly as before»: same, with `'app.yapiComposer'` → `false`. Assert `expect(dialogue.composeHome).not.toHaveBeenCalled()` and the `refill` label `'Portada de YAPI'`.
3. «a composer that cannot pass its check falls back to fill mode»: switch on, and `dialogue.composeHome` resolves an answer of two blocks both times. Assert the `refill` label `'Portada de YAPI'` and that `composeLibrary` was called with the template.

- [ ] **Step 2: Job check, then run to verify it fails**

Run: `npx jest src/storefront-source/<that spec>.spec.ts -t "YAPI_COMPOSER|fill mode runs exactly|cannot pass its check"`
Expected: FAIL in test 1. The label is «Portada de YAPI».

- [ ] **Step 3: Implement**

Add imports:
- `runComposer` from `./source-composer-run`;
- `applyComposerChanges, composerCheck, composerTemplate, readSectionFit` from `./source-composer`;
- `captureAgentDraft` from `./agent/agent-capture`;
- `resolvePresetTemplate` from `./source-templates`, if missing.

Add the private method:

```ts
  /** Spec 2026-11-11 store composer: the brand's home composed inside its template; null hands the build to fill mode. */
  private async composeTemplateHome(merchantId: string, storeId: string, revision: number, theme: string, facts: LibraryFacts) {
    const manifest = this.templates.registry.templateManifest(theme);
    if (!manifest) return null;
    const resolved = resolvePresetTemplate(manifest, id => this.templates.registry.templateManifest(id));
    const template = composerTemplate(theme, resolved.manifest.name, resolved.preset as never, readSectionFit());
    if (!template) return null;
    const recent = await this.templates.recentThemeHomes(storeId, theme);
    const photos = facts.photos.map(photo => photo.url);
    const composed = { allowed: template.allowed, looks: template.looks };
    const signal = sourceRequestContext.getStore()?.signal;
    const result = await runComposer({
      compose: feedback => this.dialogue.composeHome(merchantId, { storeId, facts, template, recent, feedback }),
      validate: answer => validateLibraryLayout(answer as never, facts, { composed }),
      check: layout => composerCheck(layout, template, recent),
      capture: async layout => {
        const draft = await this.templates.refillDraft(merchantId, storeId, revision, { layout });
        const desk = await captureAgentDraft(draft as never, 1280, signal);
        const phone = await captureAgentDraft(draft as never, 390, signal);
        return [...(desk.sections?.length ? desk.sections : [desk.image]), ...(phone.sections?.length ? phone.sections : [phone.image])];
      },
      review: (layout, images) => this.dialogue.reviewHome(merchantId, { storeId, layout, template, recent, photoCount: photos.length, images }),
      apply: (layout, problems) => applyComposerChanges(layout, problems, template, photos),
      rewrite: async (layout, at) => {
        const next = [...layout];
        // Highest first, so a section that cannot be written can be dropped without shifting the ones still to write.
        for (const index of [...at].sort((a, b) => b - a)) {
          const fixed = [{ type: next[index].type }];
          const answer = await this.dialogue.composeLibrary(merchantId, { storeId, facts, template: fixed }).catch(error => { if (quotaSpent(error)) throw error; return null; });
          const [block] = answer ? validateLibraryLayout(answer as never, facts, { fixed }) : [];
          if (block) next[index] = { ...block, ...(next[index].band ? { band: next[index].band } : {}) }; else next.splice(index, 1);
        }
        return { layout: next, microUsd: 0 };
      },
      trace: entry => this.traceQuickEdit({ storeId, stage: 'composer', theme, ...entry }),
      maxMicroUsd: Math.round((this.config.get<number>('app.yapiComposerMaxUsd') ?? 10) * 1_000_000),
      ...(signal ? { signal } : {}),
    });
    this.productLogger.log(JSON.stringify({ event: 'store_composer', storeId, theme, outcome: result.outcome, rounds: result.rounds, usd: result.spentMicroUsd / 1e6, kept: result.layout?.map(block => block.type) ?? [] }));
    return result.layout ? result : null;
  }
```

In `sectionLibrary`, right after `await workflow.report('design');`:

```ts
    // Spec 2026-11-11 store composer: a first build on a template with an approved signature gets a home composed for the brand.
    const composerOn = this.config.get<boolean>('app.yapiComposer') === true && Boolean(template) && !carried && templateRevision === revision
      && input.firstDesign === true && facts.photos.length > 0;
    const composedHome = composerOn ? await this.composeTemplateHome(merchantId, storeId, revision, theme, facts).catch(error => {
      if (quotaSpent(error) || sourceRequestContext.getStore()?.signal?.aborted) throw error;
      this.productLogger.warn(JSON.stringify({ event: 'store_composer_failed', storeId, theme, reason: String((error as Error)?.message ?? error).slice(0, 300) }));
      return null;
    }) : null;
```

Then change three existing lines:

```ts
    const answer = composedHome ? composedHome.answer : facts.photos.length ? await this.dialogue.composeLibrary(merchantId, { storeId, facts, ...(template ? { template } : {}) }).catch(error => {
      // (the existing catch body, unchanged)
    }) : null;
```

```ts
    let layout = composedHome ? composedHome.layout! : answer ? validateLibraryLayout(answer as never, facts, template ? { fixed: template } : {}) : [];
```

```ts
    if (template && !composedHome && !HAND_MADE_THEMES.has(theme)) layout = await this.topUpHome(merchantId, storeId, layout, facts);
```

and the label in the `refill` call:

```ts
    const saved = await this.templates.refill(merchantId, storeId, revision, { layout, ...(productTemplate ? { productLayout } : {}), ...(libraryLook ? { variants: libraryLook } : {}) }, composedHome ? 'Portada compuesta por YAPI' : 'Portada de YAPI');
```

The `layout.length < least` branch (`withoutDemoWords`) stays as it is. A composed home always has at least 7 sections, so it never takes that branch.

- [ ] **Step 4: Run that spec file**

Run: `npx jest src/storefront-source/<that spec>.spec.ts`
Expected: PASS, every earlier section library test included.

- [ ] **Step 5: One type check** (owner rule: say it was run)

Job check first, then:

```bash
cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit --incremental false -p tsconfig.json 2>&1 | grep -E "source-composer|source-chat.service|source-conversation.service|source-templates.service|section-library|configuration" | head -20
```

Expected: no lines. Then confirm `ls dist/src/storefront-source/source-composer-run.js` exists (the watcher compiled it).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/<that spec>.spec.ts
git commit -m "feat(composer): a template store's first build composes its home behind YAPI_COMPOSER (spec 2026-11-11)"
```

---

### Task 8: Live test and comparison — STOP for the owner

**Files:**
- Modify (dev only, never committed): `apps/api/.env`
- Uses: `.superpowers/sdd/2026-11-04-writer-on-templates/live/` (`prepare.cjs <arm> <key>`, `send.cjs <arm> <key>`, `wait.cjs <arm> <key> <minutes>`), arm `composer`.

- [ ] **Step 1: Preconditions**

- Task 2 Step 4 is approved (`section-fit.json` has `signature` for the pooled templates).
- The ChatGPT plan has allowance: `pnpm chatgpt:status`, and the last YAPI run did not fail with 429.
- Job check: `running jobs: 0`.

- [ ] **Step 2: Turn it on**

```bash
cd /Users/saramia/pagosYa && cp -p apps/api/.env .superpowers/benchmarks/composer-live.before.api.env && printf '\nYAPI_COMPOSER=1\n' >> apps/api/.env
```

Restart the API so it reads the env. Make one real content change to an `apps/api/src` file (a comment) and revert it, while no job runs. A bare `touch` does not restart the watcher.

- [ ] **Step 3: The five usual stores**

```bash
cd /Users/saramia/pagosYa/apps/api && L=../../.superpowers/sdd/2026-11-04-writer-on-templates/live; for k in remolino ohbelly cuadrizate boxy rhode; do node $L/prepare.cjs composer $k && node $L/send.cjs composer $k && node $L/wait.cjs composer $k 30; done
```

Expected:
- Each store saves «Portada compuesta por YAPI».
- `.superpowers/yapi-trace.jsonl` has `stage: "composer"` lines (compose → review rounds → outcome).
- Each costs under $10 (`StoreAiUsage`, stages `source-composer*`).

- [ ] **Step 4: Three brands on Merienda**

- Append `YAPI_TEMPLATE_POOL=merienda` (back up the env first), and restart the API the same way.
- Run the loop for `ohbelly cuadrizate remolino` with arm `composer-merienda`.
- Restore `apps/api/.env` from `.superpowers/benchmarks/composer-live.before.api.env`. Keep `YAPI_COMPOSER=1` only if the owner wants it on.

- [ ] **Step 5: Comparison page**

- Shoot each new store's home with this session's `compare/shoot.cjs` approach. Pass the 8 new store ids, and each one's fill-mode twin from `examples/writer-tpl-fill-<key>/demo.json`.
- Publish one artifact:
  - the five stores, today's version next to the composed one;
  - the three Merienda stores side by side;
  - each with its rounds, the problems fixed and the cost (from the trace).
- Report to the owner and STOP. Success is the owner's judgement, plus no fixed check failing.

- [ ] **Step 6: Record**

- Write a memory `project_store_composer.md` with:
  - the commits;
  - the env state;
  - the test store ids;
  - the owner's verdict.
- Add it to `MEMORY.md`. Commit nothing from `.env`.
