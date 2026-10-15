# Store Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new Sep-5 store gets its own language for its small controls (header cart, account, menu and search; card "+"; quantity steppers; drawer close; count badge), tied to its look and its business, designed by YAPI in the background review stage, checked in a browser, with a hand-designed library as the floor.

**Architecture:** A clamped `config.controls` record (`store-controls.ts`) is picked from a pure library for revision N (`store-controls-library.ts`). The platform draws it into the header at save time (`source-header.ts` and `packages/storefront-kit/kit/controls.css`), and `commerce.js` (built from `packages/storefront-kit/commerce-src`) draws it onto the kit's own controls at runtime. YAPI designs a record of its own in a dedicated `controls` call. That call runs beside the background review call, and again on chat requests (`store-controls-design.ts`). A browser guard (`store-controls-guard.ts`) keeps the record, patches one icon slot, or drops it. Part 1 first fixes the database CHECK constraint that has stopped every background review row from being created.

**Tech Stack:** NestJS and TypeScript (apps/api); Prisma and PostgreSQL (one migration); Playwright Chromium (`withVisualSandbox` and jest browser specs); jsdom (kit runtime specs); plain browser JS and CSS (packages/storefront-kit/kit); Jest.

**Spec:** docs/superpowers/specs/2026-10-14-store-controls-design.md

**Re-anchored 2026-10-15 after the big-file split** (docs/superpowers/plans/2026-10-15-split-big-files.md, appendix "where the code now lives"; HEAD 94f7beda). Every path, line number and quoted "before" snippet below is the code at that HEAD, before any task of this plan edits it. Line numbers drift as earlier steps insert lines, so always anchor on the quoted text. What moved:
- `kit/commerce.js` is generated from `packages/storefront-kit/commerce-src/<area>/<topic>.js` by `packages/storefront-kit/tools/build-commerce.mjs`. Task 6 edits parts, adds one part, runs the build and commits the parts with `kit/commerce.js`.
- `generate()` was split. The Sep-5 author stage is in `source-sep5-stage.ts`, the review closure in `source-sep5-review.ts`, the metered calls in `source-sep5-call.ts`, save assembly in `source-save-assembly.ts`, and the shared types in `source-generation-types.ts`. Tasks 7–10 keep their glue in `generate()` (flags, library pick, guard, chat requests, the N save). The review-stage half of Task 9 now goes through `source-sep5-stage.ts` and `source-sep5-review.ts`.

## Global Constraints

- **Record ranges.** corner 0–24 px; notch 0–10 px; tilt −6…6 degrees; weight 1–3 px. Numbers are clamped and rounded to 0.5 steps. A value that is not a number drops the whole record.
- **Record enums.**
  - outline: `rounded pill square ticket tag sticker tab stamp bracket underline blob`
  - border: `none hairline solid double dashed offset`
  - fill: `solid outline ghost inverted`
  - colour: `accent ink paper`
  - layout.cart: `icon+word icon word`
  - layout.account: `icon word icon+word`
  - badge: `dot circle inline corner stamp`
  - source: `yapi library`
  - An unknown value drops the whole record.
- **Icons.**
  - SVG path data only, parsed command by command.
  - Every point, control point and arc sample lies inside the 24×24 icon box (0..24).
  - At most 1,500 characters each.
  - Drawn as `<path fill="currentColor" fill-rule="evenodd">` in a `viewBox="0 0 24 24"` SVG, so a line icon is drawn as its own outline.
  - No other SVG elements, attributes, URLs, scripts or text.
  - A bad icon is replaced by the library icon for that slot, and the rest of the record is kept.
- **Words.**
  - 1–14 characters, trimmed, letters only (no emoji or markup), in Spanish.
  - Screen-reader labels stay plain and are never taken from the words: «Carrito, N productos» and «Mi cuenta».
- **Targets.**
  - Every control's hit box (`[data-ctl]`) stays upright and at least 44 × 44 px.
  - Shape, fill, border and tilt are drawn on the inner `.ctl-face` layer.
- **Colours.** Colours come only from the `--store-*` tokens (through `colour`), never from the record.
- **Locked (no record can change these).**
  - `data-cart-open`, `data-cart-count` and `data-pagosya-account`.
  - Accessible names and focus rings.
  - 44 px targets.
  - The menu's open, close, Escape and focus-return behaviour.
- **No record, no change.**
  - A store without `config.controls` renders exactly as today.
  - The header's bytes are pinned by a hash in Task 4.
  - Every CSS rule keys on a `data-controls-*` attribute (pinned in Task 5).
- **Showcase.** No cart. Showcase headers have no Buscar or Mi cuenta today (pinned by `source-header.spec.ts`), so the language reaches the menu button and its close button.
- **Out of scope.** Next/TSX stores (`SiteHeader`, `source-ui.ts:11`). Store copy voice. Business-specific forms and tools.
- **Controls call.**
  - Dedicated `controls` phase, in parallel with the review call.
  - Own deadline of 60 s (`CONTROLS_TIMEOUT_MS`).
  - Billed only when the result is kept.
  - Its note goes into the review's chat message.
  - Live-check budget: it adds no more than about 45 s to the review stage.
- **Guard.**
  - Widths 1440 and 390.
  - Contrast: words 4.5:1; icons and borders 3:1.
  - An icon must paint at least 24 pixels on a 48×48 raster.
  - Its own deadline is 30 s (`CONTROLS_GUARD_TIMEOUT_MS`).
  - A failing icon falls back to the library icon for its slot. Anything else drops the record.
  - Outcomes are logged as `controls_saved` and `controls_dropped`.
- **Flags.**
  - `YAPI_CONTROLS` (`app.yapiControls`, on unless `off`) covers the library pick, drawing and carry. When it is off, a store's record is dropped at its next save, so its header is today's again.
  - `YAPI_CONTROLS_DESIGN` (`app.yapiControlsDesign`, on unless `off`) covers YAPI's call in the review stage and in chat.
- **No backfill.** Existing stores get a record only from a new build or a redesign.
- **Database.**
  - Task 1 adds exactly one migration file. Applying it to the dev DB is the owner's step and no task applies it: `cd apps/api && npx prisma migrate deploy`.
  - No test needs the dev DB to have it. Task 1's test reads the migration files. Every other test mocks Prisma.
  - No task creates or drops a database on the dev Postgres server. No task runs the integration harness (`jest.integration.config.js`).
  - Never run `prisma migrate dev`, `migrate deploy`, `db push`, `migrate reset` or `migrate diff`.
- **Live-stack check (run before any edit under `apps/api`).** The owner's `pnpm dev:chatgpt` runs `nest start --watch` from this working tree. Editing any file under `apps/api/src` restarts the API and kills running YAPI builds and background reviews. Before such an edit, run this read-only command and continue only when it prints `[0,0]`:
  ```bash
  cd apps/api && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.storeSourceChatJob.count({where:{status:'RUNNING'}}),p.storeSourceGeneration.count({where:{status:{in:['RUNNING','REVIEWING']},heartbeatAt:{gt:new Date(Date.now()-5*60e3)}}})]).then(r=>console.log(JSON.stringify(r))).finally(()=>p.\$disconnect())"
  ```
  Never edit anything under `apps/api/src` while a live check (Task 12) is running.
- **Tests.**
  - Run API tests one file at a time: `npx jest <file>`. With more than one file, use `--maxWorkers=2`.
  - Never run the full api jest suite with default workers.
  - Known failure before this plan: `source-commerce-product-card.spec.ts` › «injects nothing when the value is empty…» fails on the untouched tree (checked 2026-10-14). It is not this plan's to fix.
  - Kit browser tests are jest and Playwright Chromium specs in `apps/api` (`page.setContent`), not the merchant-studio Playwright suite, which starts dev servers.
- **Git.**
  - Commit on `feature/store-page-architecture` and never push.
  - Stage only the files a task lists.
  - Never stage or edit `apps/api/src/store-emails/*`: the owner's uncommitted work.
  - Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Kit edits are live at once.** `currentSourceRuntime` injects the current `packages/storefront-kit/kit/*` into every preview, so every kit change must do nothing for a store without `config.controls`.
- **`kit/commerce.js` is generated.**
  - Never edit it by hand. `packages/storefront-kit/tools/build-commerce.test.mjs` fails when it differs from its parts.
  - Edit the part in `packages/storefront-kit/commerce-src/<area>/<topic>.js`, or add a new part to `PARTS` in `tools/build-commerce.mjs`. `PARTS` order is execution order.
  - Run `node packages/storefront-kit/tools/build-commerce.mjs`, then the same command with `--check`.
  - Commit the part(s) together with `kit/commerce.js`.
- **Language.** Merchant-facing text is Spanish.

## Review Focus

1. **An icon that is valid path data but paints (almost) nothing.** Examples: a 2 px dot, a hairline ring, or a figure-eight whose signed area cancels.
   - The sanitizer rasterises the even-odd fill on a 48×48 grid. It rejects fewer than 8 painted cells, and it accepts self-intersecting shapes that do paint.
   - The browser guard repaints every icon with `Path2D` and fails it under 24 pixels. Only that slot falls back to the library icon.
   - Pinned in Task 2 (`'M2 2L22 22'`, `'M2 2h20v.01H2z'` and the hairline ring are rejected; the figure-eight is accepted) and in Task 8 (`'M11 11h2v2h-2z'` fails only the `cart` slot).
2. **Dark palettes, and `paper` or `outline` languages with no contrast.**
   - The library filters out languages whose fill and colour fall below 4.5:1 (word layouts) or 3:1 (icon-only) on the store's hex tokens.
   - The guard drops a YAPI record whose words read below 4.5:1 against the measured background.
   - Pinned in Task 3 (a yellow accent never picks an `outline` + `accent` language) and in Task 8 (a `paper` outline on a paper header is dropped; a dark store with an `ink` record passes).
3. **The side-rail and bottom-pill header shapes, and the 14-character cart word at 390 px.**
   - Hit boxes stay at least 44 px and upright, nothing scrolls sideways, the cart stays on the phone bar, and nothing covers a control.
   - Pinned in Task 5 (every outline on side-rail, bottom-pill, centered-split and menu-button at 1440 and 390, with «Tu portafolios») and in Task 6 (every outline × fill × layout).
4. **A store whose previous revision has a record.**
   - A chat edit keeps it.
   - A redesign picks a new library language away from it, and YAPI is told to move away from it.
   - A Boceto save drops it (with the look and the touch).
   - A template applies with none.
   - `YAPI_CONTROLS=off` drops it at the next save and draws today's header.
   - Pinned in Task 7 (edit, redesign, kill switch) and Task 11 (Boceto, template).
5. **Concurrency in the review stage.**
   - The controls call starts beside the review call, not after it.
   - A controls promise that fails while the review call is still running must never become an unhandled rejection: `designReviewControls` never rejects.
   - A dropped YAPI record with no review edits saves no empty «Revisión de YAPI».
   - Pinned in Task 9.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/20261014220000_source_review_statuses/migration.sql` (new) | Allows `REVIEWING`, `CANCELLED` and `DISCARDED` in `StoreSourceGeneration_status_check` (Part 1) |
| `apps/api/src/storefront-source/source-generation-status.spec.ts` (new) | Pins the newest status CHECK to every status the code writes (reads the migration files; no database) |
| `apps/api/src/storefront-source/source-background-review.ts` | Corrects the "no migration needed" comment |
| `apps/api/src/storefront-source/store-controls.ts` (new) | `StoreControls` type and enums, `parseIconPath`, `cleanControlWord`, `sanitizeControls(Report)`, `readControls`, `withControlsConfig` |
| `apps/api/src/storefront-source/store-controls-library.ts` (new) | Icons (line and solid), 11 languages, `pickLibraryControls`, `libraryRecord`, `controlsKey`, `cartIconName`, `storePalette`, `libraryIconFallback`, `controlsToAvoid`, `controlsUniqueness` |
| `apps/api/src/storefront-source/source-header.ts` | Draws a record into the header (icons, words, layout, `data-controls-*`); the controls stylesheet; `hasPlatformHeader` |
| `packages/storefront-kit/kit/controls.css` (new) | Outline recipes, `--ctl-*` variables, badge styles, locked layer |
| `packages/storefront-kit/commerce-src/shared/config-dna.js` | `CONTROL_ENUMS`, the `CONTROLS` reader and `controlIcon` (after the `LOOK` IIFE); `CART_WORD` takes the record's word |
| `packages/storefront-kit/commerce-src/cart/render.js` | Count badge state (`data-empty`) and the plain «producto/productos» label |
| `packages/storefront-kit/commerce-src/controls/decorate.js` (new part) | `decorateControls` for the card "+", steppers and drawer close, and its MutationObserver |
| `packages/storefront-kit/tools/build-commerce.mjs` | `PARTS` gains `controls/decorate.js`, just before `shared/start.js` |
| `packages/storefront-kit/kit/commerce.js` (generated) | Rebuilt from the parts and committed with them |
| `apps/api/src/storefront-source/store-controls-guard.ts` (new) | `readControlsInPage`, `inspectControlsPage`, `judgeControls`, `guardControlsOnSnapshot`, `captureControlsShots` |
| `apps/api/src/storefront-source/store-controls-design.ts` (new) | `CONTROLS_SCHEMA`, `controlsPrompt`, `storeTokens`, `runControlsDesign`, `controlsDeadlineMs`, `instructionConcernsControls` |
| `apps/api/src/storefront-source/source-projects.service.ts` | `recentControls` (read-only sibling query) |
| `apps/api/src/storefront-source/source-generation.service.ts` | Glue in `generate()`: flags, sibling lookup, `storeControlsInto`, `keepGuardedControls`, the library pick in the `assembleSave` wrapper, `designReviewControls` and `reviewControls` handed to the Sep-5 stage, chat requests, the N save, carry rules |
| `apps/api/src/storefront-source/source-generation-types.ts` | Attempt phase `'controls'`; `GenerationLive.revisionControls` |
| `apps/api/src/storefront-source/source-sep5-call.ts` | `controlsCall` beside `touchCall` (phase `'controls'`) |
| `apps/api/src/storefront-source/source-sep5-stage.ts` | Arms the review stage when YAPI's controls call is on; passes `controls` to the review |
| `apps/api/src/storefront-source/source-sep5-review.ts` | `ReviewControls`; `AssembleSave` takes a `controlsChoice`; the controls job beside the review call and the guarded N+1 |
| `apps/api/src/storefront-source/source-design-planner.ts` | `DesignPlanningAttempt` phase `'controls'` |
| `apps/api/src/config/configuration.ts` | `yapiControls` and `yapiControlsDesign` flags |
| `apps/api/src/storefront-source/kit-touch.ts` | «haz el carrito como una taza» is a controls request, not a kit-touch request |
| `apps/api/src/storefront-source/sketch-studio.service.ts` | Boceto saves drop `config.controls` |
| `apps/api/scripts/store-controls-check.ts` (new) | Read-only live check: review rows, controls per store, guard, uniqueness, optional screenshots |
| Specs (new): `store-controls.spec.ts`, `store-controls-library.spec.ts`, `store-controls-runtime.spec.ts`, `store-controls-browser.spec.ts`, `store-controls-guard.spec.ts`, `store-controls-design.spec.ts` | Unit, jsdom and Chromium tests |
| Specs (modified): `source-header.spec.ts`, `source-header-browser.spec.ts`, `source-generation-review.spec.ts`, `source-projects.service.spec.ts`, `kit-touch.spec.ts`, `sketch-studio.service.spec.ts`, `source-templates.service.spec.ts` | Regression and wiring tests |

---

### Task 1: The background review stage can save its row (Part 1)

**Part 1 findings.**

What is known (read-only reading of the code and the dev DB, 2026-10-14):

- **Cause.** The dev database's CHECK constraint does not allow the background review's statuses. `pg_get_constraintdef` on `"StoreSourceGeneration"` returns:
  ```
  CHECK ((status = ANY (ARRAY['RUNNING','COMPLETED','FAILED','INTERRUPTED','CANDIDATE','PARTIAL','BLOCKED','AWAITING_STYLE'])))
  ```
  The constraint was last set by `prisma/migrations/20261011200000_style_pick_awaiting_status/migration.sql`.
- **What fails.**
  - `startBackgroundReview` (`source-review-runner.ts:47`, reached through the service's `startSep5Review` wrapper at `source-generation.service.ts:1325`) inserts `status: SOURCE_REVIEW_STATUS` (`'REVIEWING'`). The insert violates the constraint, the `.catch` logs `sep5_review_not_started`, and the function returns. So there is no row, no review, no kit touch and no N+1.
  - `cancelReview`'s `CANCELLED` and the `DISCARDED`/`CANCELLED` endings would fail the same way.
  - `source-background-review.ts:4-5` says "The status column is a plain string, so none of this needs a migration". That is wrong.
  - Unit tests mock Prisma and cannot see a CHECK.
- **The data agrees.**
  - Before e01ac012 (2026-10-12 23:34 −0400), the review ran inside the generation row. For example, `7rm5lr` at 2026-10-13 00:25 UTC shows `author:COMPLETED, review:COMPLETED`.
  - Every Sep-5 build since then (`sgcbdd0w`, `wu5f1a4n`, `2cchr29v`, 2026-10-15 00:44–01:12 UTC) has one `author` attempt and no second row.
  - No status outside the constraint's list exists anywhere in the table.
- **What is ruled out.**
  - The style-pick path. `buildFromStyle` calls `generate()` with `{ style }`, not `candidate`. `sep5Author` was true (an author attempt exists). `YAPI_SEP5_SELF_REVIEW` unset resolves to `true`, and `YAPI_KIT_TOUCH` unset resolves to `true`. All three builds were shops, so `sep5Review` was armed.
  - The running dist (built 20:37, process started 20:37 local) contains the same code.
  - The rows' `requestedModel`, `model` and `maxCredits` values are the ones the run's own row was created with.

What is not known:

- The owner's terminal line was not read. It should read `sep5_review_not_started` with a reason naming `StoreSourceGeneration_status_check`.
- Whether the review stage itself succeeds end to end once its row can be created. It has never run live. Task 12's live check confirms it.

**Files:**
- Create: `apps/api/prisma/migrations/20261014220000_source_review_statuses/migration.sql`
- Create (test): `apps/api/src/storefront-source/source-generation-status.spec.ts`
- Modify: `apps/api/src/storefront-source/source-background-review.ts:1-6` (doc comment)

**Database rule for this task:**
- No step applies the migration. Applying it is the owner's step (Step 8).
- No test needs the dev DB to have it. The test reads the migration files from disk.
- There is no real-Postgres test. An earlier draft added one to `source-generation-state.integration.spec.ts`. That harness creates and drops its own database on the dev Postgres server, so it is dropped from this plan. Do not add it, and do not run `jest.integration.config.js`.

**Interfaces:**
- Consumes: `SOURCE_REVIEW_STATUS: 'REVIEWING'` from `source-background-review.ts`.
- Produces: the DB CHECK `StoreSourceGeneration_status_check` allowing `RUNNING, COMPLETED, FAILED, INTERRUPTED, CANDIDATE, PARTIAL, BLOCKED, AWAITING_STYLE, REVIEWING, CANCELLED, DISCARDED`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing static test.** Create `apps/api/src/storefront-source/source-generation-status.spec.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_REVIEW_STATUS } from './source-background-review';

/** Spec 2026-10-14 store controls, part 1: the dev database refused every background-review row because the status CHECK never
 *  listed REVIEWING. Mocked Prisma cannot see a CHECK, so the newest migration that sets it is read here. */
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');
function allowedStatuses(): string[] {
  const latest = readdirSync(MIGRATIONS).filter(name => /^\d{14}_/.test(name)).sort()
    .map(name => join(MIGRATIONS, name, 'migration.sql')).filter(path => existsSync(path))
    .map(path => readFileSync(path, 'utf8'))
    .filter(sql => sql.includes('ADD CONSTRAINT "StoreSourceGeneration_status_check"')).at(-1)!;
  const list = latest.match(/ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK \("status" IN \(([^)]*)\)\)/)![1];
  return [...list.matchAll(/'([A-Z_]+)'/g)].map(match => match[1]);
}

describe('StoreSourceGeneration status check', () => {
  it('allows every status a generation or a background review writes', () => {
    const allowed = allowedStatuses();
    for (const status of ['RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE', 'PARTIAL', 'BLOCKED', 'AWAITING_STYLE', SOURCE_REVIEW_STATUS, 'CANCELLED', 'DISCARDED']) {
      expect({ status, allowed: allowed.includes(status) }).toEqual({ status, allowed: true });
    }
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-status.spec.ts`
  - Expected: FAIL. The received value is `{ status: 'REVIEWING', allowed: false }`.

- [ ] **Step 4: Write the migration.** Create `apps/api/prisma/migrations/20261014220000_source_review_statuses/migration.sql`. This only writes the file; nothing applies it here.

```sql
-- Spec 2026-10-14 store controls, part 1: YAPI's background review (spec 2026-10-12 faster generation) keeps a row of its own:
-- REVIEWING while it runs, then COMPLETED, FAILED, DISCARDED or CANCELLED. The check never allowed the three new statuses, so
-- every review row insert failed (sep5_review_not_started) and no «Revisión de YAPI» was ever saved.
ALTER TABLE "StoreSourceGeneration" DROP CONSTRAINT "StoreSourceGeneration_status_check";
ALTER TABLE "StoreSourceGeneration" ADD CONSTRAINT "StoreSourceGeneration_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANDIDATE', 'PARTIAL', 'BLOCKED', 'AWAITING_STYLE', 'REVIEWING', 'CANCELLED', 'DISCARDED'));
```

- [ ] **Step 5: Correct the comment.** In `source-background-review.ts`, replace the doc comment (lines 1-6, ending «…so none of this needs a migration. */») with:

```ts
/**
 * YAPI's self-review after the store is shown (spec 2026-10-12 faster generation, part 2). The review is a
 * StoreSourceGeneration row of its own: status REVIEWING while it runs (no activeStoreId, so it never blocks a new request),
 * a heartbeat Studio's reviewPending reads, and COMPLETED, DISCARDED, FAILED or CANCELLED once it ends. The status column has a
 * CHECK constraint: these statuses are allowed by migration 20261014220000_source_review_statuses (spec 2026-10-14 store
 * controls, part 1; before it every review row insert failed).
 */
```

- [ ] **Step 6: Run both tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-status.spec.ts src/storefront-source/source-background-review.spec.ts --maxWorkers=2`. Expected: PASS.
  - Neither test touches a database. The dev DB keeps its old CHECK until the owner's Step 8.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/prisma/migrations/20261014220000_source_review_statuses/migration.sql apps/api/src/storefront-source/source-generation-status.spec.ts apps/api/src/storefront-source/source-background-review.ts
git commit -m "fix(yapi): allow the background review's statuses in the generation status check — every review row insert failed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8 (owner, never an agent): apply the migration.**
  - No task of this plan applies the migration, and no agent runs this command. The owner runs `cd apps/api && npx prisma migrate deploy`. It applies only this migration: every other migration in the folder is already applied on the dev DB, as checked read-only on 2026-10-14.
  - From then on, every Sep-5 build runs the self-review and the kit touch in the background, for the first time since 2026-10-12. Each build makes more ChatGPT-plan calls.
  - Task 12 checks that a `REVIEWING` row appears and a «Revisión de YAPI» is saved.

---

### Task 2: The control record (`store-controls.ts`)

**Files:**
- Create: `apps/api/src/storefront-source/store-controls.ts`
- Test: `apps/api/src/storefront-source/store-controls.spec.ts`

**Interfaces:**
- Consumes: `readConfigFile(files): Record<string, any>` and `patchConfigFile<T>(files: T[], patch: (config) => config): T[]` from `store-look.ts`.
- Produces:
  - `CONTROL_OUTLINES`, `CONTROL_BORDERS`, `CONTROL_FILLS`, `CONTROL_COLOURS`, `CART_LAYOUTS`, `ACCOUNT_LAYOUTS`, `CONTROL_BADGES`, `CONTROL_SOURCES`, `ICON_SLOTS` (readonly tuples), `ICON_MAX_CHARS = 1500`, `WORD_MAX_CHARS = 14`, `CONTROL_RANGES`
  - `type StoreControls`, `type IconSlot`, `type ControlOutline`, `type ControlBorder`, `type ControlFill`, `type ControlColour`, `type CartLayout`, `type AccountLayout`, `type ControlBadge`
  - `parseIconPath(raw: unknown): { ok: true; d: string } | { ok: false; reason: string }`
  - `cleanControlWord(raw: unknown): string | undefined`
  - `sanitizeControlsReport(raw: unknown, options?: { fallbackIcon?: (slot: IconSlot) => string | undefined }): { controls?: StoreControls; replacedIcons: IconSlot[]; droppedWords: Array<'cart' | 'account'>; reason?: string }`
  - `sanitizeControls(raw: unknown, options?): StoreControls | undefined`
  - `readControls(files: ReadonlyArray<{ path: string; content: string }>): StoreControls | undefined`
  - `withControlsConfig<T extends { path: string; content: string }>(files: T[], controls: StoreControls | undefined): T[]`

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/storefront-source/store-controls.spec.ts`:

```ts
import { cleanControlWord, ICON_MAX_CHARS, parseIconPath, readControls, sanitizeControls, sanitizeControlsReport, withControlsConfig, type StoreControls } from './store-controls';

const CUP = 'M4 7h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM5.75 8.75h8.5V13a3.25 3.25 0 0 1-3.25 3.25H9A3.25 3.25 0 0 1 5.75 13zM16 8.5h1.5a3 3 0 0 1 0 6H16v-1.75h1.5a1.25 1.25 0 0 0 0-2.5H16zM3 20h16v1.75H3z';
const PLUS = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z';
const FALLBACK = 'M4 4h16v16H4z';
const RECORD: StoreControls = {
  version: 1,
  shape: { outline: 'ticket', corner: 4, notch: 5, tilt: -2, border: 'dashed', weight: 2, fill: 'solid', colour: 'accent' },
  layout: { cart: 'icon+word', account: 'icon' },
  icons: { cart: CUP, plus: PLUS },
  words: { cart: 'Tu pedido', account: 'Mi cuenta' },
  badge: 'stamp', source: 'yapi',
};

describe('sanitizeControls (spec 2026-10-14, part 2)', () => {
  it('keeps a valid record as it is, and is idempotent', () => {
    expect(sanitizeControls(RECORD)).toEqual(RECORD);
    expect(sanitizeControls(sanitizeControls(RECORD))).toEqual(RECORD);
  });

  it('clamps numbers to their ranges in half steps', () => {
    expect(sanitizeControls({ ...RECORD, shape: { ...RECORD.shape, corner: 40, notch: 3.3, tilt: -9, weight: 0 } })!.shape)
      .toMatchObject({ corner: 24, notch: 3.5, tilt: -6, weight: 1 });
  });

  it.each([
    ['an unknown outline', { shape: { ...RECORD.shape, outline: 'hexagon' } }],
    ['an unknown fill', { shape: { ...RECORD.shape, fill: 'gradient' } }],
    ['a colour that is not a token', { shape: { ...RECORD.shape, colour: '#ff0000' } }],
    ['an unknown border', { shape: { ...RECORD.shape, border: 'groove' } }],
    ['an unknown badge', { badge: 'flag' }],
    ['an unknown layout', { layout: { cart: 'big', account: 'icon' } }],
    ['an unknown source', { source: 'model' }],
    ['a corner that is not a number', { shape: { ...RECORD.shape, corner: '8px' } }],
    ['another version', { version: 2 }],
  ])('drops the whole record for %s', (_name, change) => {
    expect(sanitizeControls({ ...RECORD, ...change })).toBeUndefined();
  });

  it('replaces a bad icon with the fallback for its slot and keeps the rest of the record', () => {
    const report = sanitizeControlsReport({ ...RECORD, icons: { cart: '<path d="M0 0"/>', plus: PLUS, close: 'M0 0L30 30', logo: CUP } }, { fallbackIcon: () => FALLBACK });
    expect(report.controls!.icons).toEqual({ cart: FALLBACK, plus: PLUS, close: FALLBACK });
    expect(report.replacedIcons).toEqual(['cart', 'close']);
    expect(report.controls!.shape).toEqual(RECORD.shape);
  });

  it('leaves a bad icon out when there is no fallback, and an empty string means none', () => {
    expect(sanitizeControls({ ...RECORD, icons: { cart: 'url(#x)', menu: '' } })!.icons).toEqual({});
  });

  it('drops a bad word only, and keeps the record', () => {
    const report = sanitizeControlsReport({ ...RECORD, words: { cart: '🛒 carrito', account: '  Mi   cuenta ' } });
    expect(report.controls!.words).toEqual({ account: 'Mi cuenta' });
    expect(report.droppedWords).toEqual(['cart']);
  });
});

describe('cleanControlWord', () => {
  it.each([
    ['  Tu   taza ', 'Tu taza'], ['Tu selección', 'Tu selección'], ["Pa'llevar", "Pa'llevar"],
    ['Tu canasta grande', undefined], ['🛒', undefined], ['<b>Carrito</b>', undefined], ['Cart', undefined], ['My account', undefined], ['', undefined], [42, undefined],
  ])('%p → %p', (raw, expected) => expect(cleanControlWord(raw)).toBe(expected));
});

describe('parseIconPath', () => {
  it.each([
    ['arcs, relative commands and several subpaths', CUP],
    ['an implicit lineto after a moveto', 'M2 2 22 2 22 22z'],
    ['compact arc flags', 'M4 12a8 8 0 0010 0z'],
    ['quadratic curves', 'M4 12Q12 2 20 12Q12 22 4 12z'],
    ['a smooth cubic', 'M4 12C4 4 20 4 20 12S4 20 4 12z'],
    ['a self-crossing shape that still paints', 'M2 12Q7 4 12 12T22 12z'],
  ])('accepts %s', (_name, d) => expect(parseIconPath(d)).toEqual({ ok: true, d }));

  it('collapses whitespace in what it keeps', () => expect(parseIconPath('  M4 4h16v16H4z \n')).toEqual({ ok: true, d: 'M4 4h16v16H4z' }));

  it.each([
    ['markup', '<path d="M0 0"/>', 'not path data'],
    ['a URL', 'url(#x)', 'not path data'],
    ['a stray exponent letter where a command belongs', 'M2 2h20v20H2z e', 'not path data'],
    ['a point outside the box', 'M0 0L30 30L0 30z', 'outside the 24×24 box'],
    ['an arc that bulges out of the box', 'M2 4a10 10 0 0 1 20 0z', 'outside the 24×24 box'],
    ['a smooth curve whose mirrored control leaves the box', 'M4 12Q12 2 20 12T4 12z', 'outside the 24×24 box'],
    ['a line with no area', 'M2 2L22 22', 'draws no visible area'],
    ['a sliver', 'M2 2h20v.01H2z', 'draws no visible area'],
    ['a hairline ring', 'M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10zM12 7.01a4.99 4.99 0 1 0 0 9.98a4.99 4.99 0 1 0 0-9.98z', 'draws no visible area'],
    ['no moveto first', 'L2 2', 'does not start with M'],
    ['a missing coordinate', 'M2 2 3', 'incomplete L command'],
    ['numbers after a close', 'M2 2h20v20z 4 4', 'numbers without a command'],
    ['more than 1,500 characters', 'M2 2h20v20H2z' + ' M2 2h1v1H2z'.repeat(130), `longer than ${ICON_MAX_CHARS} characters`],
    ['not text', 42, 'not text'],
  ])('rejects %s', (_name, d, reason) => expect(parseIconPath(d)).toEqual({ ok: false, reason }));
});

describe('config.controls in config.js', () => {
  const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","look":{"version":1,"edge":"offset"}};\n' }, { path: 'index.html', content: '<main></main>' }];
  it('writes, reads back and removes the record, leaving every other file and key alone', () => {
    const written = withControlsConfig(files, RECORD);
    expect(readControls(written)).toEqual(RECORD);
    expect(written[1]).toBe(files[1]);
    const removed = withControlsConfig(written, undefined);
    expect(readControls(removed)).toBeUndefined();
    expect(removed[0].content).toBe(files[0].content);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls.spec.ts`
  - Expected: FAIL, `Cannot find module './store-controls' from 'store-controls.spec.ts'`.

- [ ] **Step 4: Write the module.** Create `apps/api/src/storefront-source/store-controls.ts`:

```ts
/**
 * Store controls (spec docs/superpowers/specs/2026-10-14-store-controls-design.md, part 2): one button language per store,
 * kept as config.controls beside config.look. Pure and clamped like store-look.ts: the header (source-header.ts), the kit
 * (commerce.js, controls.css) and the guard read only what sanitizeControls returns. Colours are absent by design: the
 * controls use the store's --store-* tokens through `colour` (accent, ink or paper).
 */
import { patchConfigFile, readConfigFile } from './store-look';

export const CONTROL_OUTLINES = ['rounded', 'pill', 'square', 'ticket', 'tag', 'sticker', 'tab', 'stamp', 'bracket', 'underline', 'blob'] as const;
export const CONTROL_BORDERS = ['none', 'hairline', 'solid', 'double', 'dashed', 'offset'] as const;
export const CONTROL_FILLS = ['solid', 'outline', 'ghost', 'inverted'] as const;
export const CONTROL_COLOURS = ['accent', 'ink', 'paper'] as const;
export const CART_LAYOUTS = ['icon+word', 'icon', 'word'] as const;
export const ACCOUNT_LAYOUTS = ['icon', 'word', 'icon+word'] as const;
export const CONTROL_BADGES = ['dot', 'circle', 'inline', 'corner', 'stamp'] as const;
export const CONTROL_SOURCES = ['yapi', 'library'] as const;
export const ICON_SLOTS = ['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close'] as const;
export const ICON_MAX_CHARS = 1500;
export const WORD_MAX_CHARS = 14;
export const CONTROL_RANGES = { corner: [0, 24], notch: [0, 10], tilt: [-6, 6], weight: [1, 3] } as const;

export type ControlOutline = (typeof CONTROL_OUTLINES)[number];
export type ControlBorder = (typeof CONTROL_BORDERS)[number];
export type ControlFill = (typeof CONTROL_FILLS)[number];
export type ControlColour = (typeof CONTROL_COLOURS)[number];
export type CartLayout = (typeof CART_LAYOUTS)[number];
export type AccountLayout = (typeof ACCOUNT_LAYOUTS)[number];
export type ControlBadge = (typeof CONTROL_BADGES)[number];
export type IconSlot = (typeof ICON_SLOTS)[number];
export type StoreControls = {
  version: 1;
  shape: { outline: ControlOutline; corner: number; notch: number; tilt: number; border: ControlBorder; weight: number; fill: ControlFill; colour: ControlColour };
  layout: { cart: CartLayout; account: AccountLayout };
  icons: Partial<Record<IconSlot, string>>;
  words: { cart?: string; account?: string };
  badge: ControlBadge;
  source: (typeof CONTROL_SOURCES)[number];
};

type Point = [number, number];
const ICON_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;
const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
/** Curves are sampled for the area check; their control points are checked against the box directly (a Bézier stays in its hull). */
const EDGE = 0.05, CURVE_STEPS = 12, ARC_STEPS = 32;
/** The even-odd fill is rasterised on a 48×48 grid of the 24×24 box: fewer painted cells than this is no drawing at all. */
const GRID = 48, MIN_PAINTED_CELLS = 8;

const cubicAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
const quadAt = (p0: Point, p1: Point, p2: Point, t: number): Point => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
/** Points along an SVG elliptical arc (endpoint parameterisation, SVG 1.1 implementation notes F.6.5), ending exactly at its end. */
function arcPoints(x1: number, y1: number, rxIn: number, ryIn: number, angle: number, large: number, sweep: number, x2: number, y2: number): Point[] {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const scale = Math.sqrt(lambda); rx *= scale; ry *= scale; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry), cyp = coef * (-(ry * x1p) / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI; else if (sweep && delta < 0) delta += 2 * Math.PI;
  const points: Point[] = [];
  for (let k = 1; k < ARC_STEPS; k++) {
    const t = theta + (delta * k) / ARC_STEPS, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    points.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  points.push([x2, y2]);
  return points;
}
/** Cells of a 48×48 grid whose centre the even-odd fill of `subpaths` covers (each subpath closed, as a fill closes it). */
function paintedCells(subpaths: Point[][]): number {
  const edges: Array<[number, number, number, number]> = [];
  for (const points of subpaths) for (let k = 0; k < points.length; k++) {
    const [ax, ay] = points[k], [bx, by] = points[(k + 1) % points.length];
    if (ay !== by) edges.push([ax, ay, bx, by]);
  }
  let cells = 0;
  for (let row = 0; row < GRID; row++) {
    const y = ((row + 0.5) * 24) / GRID;
    const crossings: number[] = [];
    for (const [ax, ay, bx, by] of edges) if ((ay <= y) !== (by <= y)) crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    crossings.sort((a, b) => a - b);
    for (let col = 0; col < GRID; col++) {
      const x = ((col + 0.5) * 24) / GRID;
      let inside = false;
      for (const cross of crossings) { if (cross > x) break; inside = !inside; }
      if (inside) cells++;
    }
  }
  return cells;
}

/** One icon: SVG path data only, parsed command by command, every point inside the 24×24 box, and something visible drawn. */
export function parseIconPath(raw: unknown): { ok: true; d: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'not text' };
  const d = raw.trim().replace(/\s+/g, ' ');
  if (!d) return { ok: false, reason: 'empty' };
  if (d.length > ICON_MAX_CHARS) return { ok: false, reason: `longer than ${ICON_MAX_CHARS} characters` };
  if (!ICON_CHARS.test(d)) return { ok: false, reason: 'not path data' };
  let i = 0;
  const skip = () => { while (i < d.length && (d[i] === ' ' || d[i] === ',')) i++; };
  const number = (): number | null => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) return null;
    i = NUMBER.lastIndex;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };
  const flag = (): number | null => { skip(); return d[i] === '0' || d[i] === '1' ? Number(d[i++]) : null; };
  const checked: Point[] = [];
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  let command = '', x = 0, y = 0, startX = 0, startY = 0;
  let cubic: Point | null = null, quad: Point | null = null;
  const to = (point: Point) => { if (!current.length) current.push([x, y]); checked.push(point); current.push(point); };
  for (;;) {
    skip();
    if (i >= d.length) break;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) command = d[i++];
    // `e` is allowed only inside a number (1e1); where a command belongs it is not path data.
    else if (d[i] === 'e' || d[i] === 'E') return { ok: false, reason: 'not path data' };
    else if (!command || command === 'z' || command === 'Z') return { ok: false, reason: 'numbers without a command' };
    if (!checked.length && command !== 'M' && command !== 'm') return { ok: false, reason: 'does not start with M' };
    const lower = command.toLowerCase(), relative = command === lower;
    if (lower === 'z') { if (current.length) subpaths.push(current); current = []; x = startX; y = startY; cubic = quad = null; continue; }
    const values: number[] = [];
    for (let k = 0; k < PARAMS[lower]; k++) {
      const value = lower === 'a' && (k === 3 || k === 4) ? flag() : number();
      if (value === null) return { ok: false, reason: `incomplete ${command} command` };
      values.push(value);
    }
    const px = (v: number) => relative ? x + v : v, py = (v: number) => relative ? y + v : v;
    if (lower === 'm') {
      const point: Point = [px(values[0]), py(values[1])];
      if (current.length) subpaths.push(current);
      current = [point];
      checked.push(point);
      [x, y] = point; [startX, startY] = point; cubic = quad = null;
      command = relative ? 'l' : 'L';
    } else if (lower === 'l' || lower === 'h' || lower === 'v') {
      const point: Point = lower === 'l' ? [px(values[0]), py(values[1])] : lower === 'h' ? [px(values[0]), y] : [x, py(values[0])];
      to(point); [x, y] = point; cubic = quad = null;
    } else if (lower === 'c' || lower === 's') {
      const first: Point = lower === 'c' ? [px(values[0]), py(values[1])] : cubic ? [2 * x - cubic[0], 2 * y - cubic[1]] : [x, y];
      const rest = lower === 'c' ? values.slice(2) : values;
      const second: Point = [px(rest[0]), py(rest[1])], end: Point = [px(rest[2]), py(rest[3])];
      checked.push(first, second);
      for (let k = 1; k <= CURVE_STEPS; k++) to(cubicAt([x, y], first, second, end, k / CURVE_STEPS));
      [x, y] = end; cubic = second; quad = null;
    } else if (lower === 'q' || lower === 't') {
      const control: Point = lower === 'q' ? [px(values[0]), py(values[1])] : quad ? [2 * x - quad[0], 2 * y - quad[1]] : [x, y];
      const end: Point = lower === 'q' ? [px(values[2]), py(values[3])] : [px(values[0]), py(values[1])];
      checked.push(control);
      for (let k = 1; k <= CURVE_STEPS; k++) to(quadAt([x, y], control, end, k / CURVE_STEPS));
      [x, y] = end; quad = control; cubic = null;
    } else {
      const end: Point = [px(values[5]), py(values[6])];
      for (const point of arcPoints(x, y, values[0], values[1], values[2], values[3], values[4], end[0], end[1])) to(point);
      [x, y] = end; cubic = quad = null;
    }
  }
  if (current.length) subpaths.push(current);
  if (!checked.length) return { ok: false, reason: 'no drawing' };
  if (checked.some(([cx, cy]) => !Number.isFinite(cx) || !Number.isFinite(cy) || cx < -EDGE || cy < -EDGE || cx > 24 + EDGE || cy > 24 + EDGE)) return { ok: false, reason: 'outside the 24×24 box' };
  if (paintedCells(subpaths) < MIN_PAINTED_CELLS) return { ok: false, reason: 'draws no visible area' };
  return { ok: true, d };
}

const WORD = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;
/** Words a model writes in English out of habit; the store speaks Spanish. */
const NOT_SPANISH = /^(?:cart|my cart|bag|my bag|basket|checkout|account|my account|log ?in|sign ?in|shop|store)$/i;
/** A control's word: 1–14 letters, no emoji or markup, trimmed, in the store's language; undefined when it is not one. */
export function cleanControlWord(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const word = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!word || [...word].length > WORD_MAX_CHARS || !WORD.test(word) || NOT_SPANISH.test(word)) return undefined;
  return word;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined => (list as readonly unknown[]).includes(value) ? value as T : undefined;
const clampTo = (value: unknown, [low, high]: readonly [number, number]): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value * 2) / 2)) : undefined;

export type ControlsReport = { controls?: StoreControls; replacedIcons: IconSlot[]; droppedWords: Array<'cart' | 'account'>; reason?: string };
/** A record validated again (idempotent). Numbers are clamped; an unknown enum or a missing number drops the record; a bad icon
 *  takes `fallbackIcon(slot)` (left out without one); a bad word is left out. */
export function sanitizeControlsReport(raw: unknown, options: { fallbackIcon?: (slot: IconSlot) => string | undefined } = {}): ControlsReport {
  const drop = (reason: string): ControlsReport => ({ replacedIcons: [], droppedWords: [], reason });
  if (!raw || typeof raw !== 'object') return drop('no record');
  const input = raw as Record<string, any>;
  if (input.version !== 1) return drop('version');
  const shape = input.shape && typeof input.shape === 'object' ? input.shape : {};
  const outline = oneOf(CONTROL_OUTLINES, shape.outline), border = oneOf(CONTROL_BORDERS, shape.border), fill = oneOf(CONTROL_FILLS, shape.fill), colour = oneOf(CONTROL_COLOURS, shape.colour);
  const corner = clampTo(shape.corner, CONTROL_RANGES.corner), notch = clampTo(shape.notch, CONTROL_RANGES.notch), tilt = clampTo(shape.tilt, CONTROL_RANGES.tilt), weight = clampTo(shape.weight, CONTROL_RANGES.weight);
  const cart = oneOf(CART_LAYOUTS, input.layout?.cart), account = oneOf(ACCOUNT_LAYOUTS, input.layout?.account);
  const badge = oneOf(CONTROL_BADGES, input.badge), source = oneOf(CONTROL_SOURCES, input.source);
  if (!outline || !border || !fill || !colour) return drop('shape enum');
  if (corner === undefined || notch === undefined || tilt === undefined || weight === undefined) return drop('shape number');
  if (!cart || !account) return drop('layout enum');
  if (!badge) return drop('badge enum');
  if (!source) return drop('source enum');
  const icons: StoreControls['icons'] = {};
  const replacedIcons: IconSlot[] = [];
  const given = input.icons && typeof input.icons === 'object' ? input.icons as Record<string, unknown> : {};
  for (const slot of ICON_SLOTS) {
    if (given[slot] === undefined || given[slot] === '') continue;
    const parsed = parseIconPath(given[slot]);
    if (parsed.ok) { icons[slot] = parsed.d; continue; }
    replacedIcons.push(slot);
    const fallback = options.fallbackIcon?.(slot);
    if (fallback) icons[slot] = fallback;
  }
  const words: StoreControls['words'] = {};
  const droppedWords: Array<'cart' | 'account'> = [];
  for (const key of ['cart', 'account'] as const) {
    const value = input.words?.[key];
    if (value === undefined || value === '') continue;
    const word = cleanControlWord(value);
    if (word) words[key] = word; else droppedWords.push(key);
  }
  return { controls: { version: 1, shape: { outline, corner, notch, tilt, border, weight, fill, colour }, layout: { cart, account }, icons, words, badge, source }, replacedIcons, droppedWords };
}
export function sanitizeControls(raw: unknown, options: { fallbackIcon?: (slot: IconSlot) => string | undefined } = {}): StoreControls | undefined {
  return sanitizeControlsReport(raw, options).controls;
}

/** The record a file list's config.js carries, sanitized; undefined when it has none. */
export function readControls(files: ReadonlyArray<{ path: string; content: string }>): StoreControls | undefined {
  return sanitizeControls(readConfigFile(files).controls);
}
/** config.js with `controls` set to the record, or removed when it is undefined; every other file is returned as the same object. */
export function withControlsConfig<T extends { path: string; content: string }>(files: T[], controls: StoreControls | undefined): T[] {
  return patchConfigFile(files, ({ controls: _old, ...config }) => controls ? { ...config, controls } : config);
}
```

- [ ] **Step 5: Run the test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls.spec.ts`
  - Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/storefront-source/store-controls.ts apps/api/src/storefront-source/store-controls.spec.ts
git commit -m "feat(controls): the store controls record — sanitized config.controls with a parsed, boxed icon path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The library (`store-controls-library.ts`)

**Files:**
- Create: `apps/api/src/storefront-source/store-controls-library.ts`
- Test: `apps/api/src/storefront-source/store-controls-library.spec.ts`

**Interfaces:**
- Consumes:
  - `CART_WORDS: Record<PlaybookKind, string>` (`design-engine/commerce-draw.ts:50-53`).
  - `type PlaybookKind = 'cafe-food' | 'bakery-sweets' | 'clothing' | 'beauty' | 'services' | 'fitness-wellness' | 'crafts-home' | 'flowers-gifts' | 'general'` (`design-engine/playbook.ts:8`).
  - From Task 2: `ICON_SLOTS`, `WORD_MAX_CHARS`, `type StoreControls`, `type IconSlot`, `type ControlBadge`.
  - `type StoreLook` (`store-look.ts`).
- Produces:
  - Types: `type IconStyle = 'line' | 'solid'`; `type CartIcon = 'cup' | 'bag' | 'basket' | 'frame' | 'scoop' | 'briefcase' | 'leaf' | 'paw'`.
  - Icons: `CART_ICONS: Record<CartIcon, Record<IconStyle, string>>` and `SHARED_ICONS: Record<Exclude<IconSlot, 'cart'>, Record<IconStyle, string>>`.
  - Kind mapping: `KIND_CART_ICON: Record<PlaybookKind, CartIcon>` and `cartIconFor(kind: PlaybookKind, words?: string): CartIcon`.
  - Languages: `type ControlLanguage = { id: string; mode: 'calm' | 'bold' | 'both'; icons: IconStyle; shape: StoreControls['shape']; layout: StoreControls['layout']; badge: ControlBadge }` and `CONTROL_LANGUAGES: ControlLanguage[]` (11 of them, one per outline).
  - Palette: `type StorePalette = { paper: string; ink: string; accent: string; onAccent: string }`, `storePalette(files): StorePalette | undefined`, `hexContrast(a: string, b: string): number` and `languageReadable(language: ControlLanguage, palette?: StorePalette): boolean`.
  - Keys: `cartIconName(d: string | undefined): CartIcon | 'custom' | 'none'` and `controlsKey(controls: StoreControls): string`.
  - Records: `libraryRecord(language: ControlLanguage, kind: PlaybookKind, cartIcon: CartIcon, look?: StoreLook): StoreControls` and `libraryIconFallback(kind: PlaybookKind, words?: string, style?: IconStyle): (slot: IconSlot) => string`.
  - The pick: `type LibraryPickInput = { kind: PlaybookKind; mode: 'calm' | 'bold'; seed: string; look?: StoreLook; avoid?: StoreControls[]; words?: string; palette?: StorePalette }` and `pickLibraryControls(input: LibraryPickInput): StoreControls`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/storefront-source/store-controls-library.spec.ts`:

```ts
import { CART_WORDS } from './design-engine/commerce-draw';
import type { PlaybookKind } from './design-engine/playbook';
import { CONTROL_OUTLINES, parseIconPath, sanitizeControls } from './store-controls';
import { CART_ICONS, CONTROL_LANGUAGES, KIND_CART_ICON, SHARED_ICONS, cartIconFor, cartIconName, controlsKey, hexContrast, languageReadable, libraryIconFallback, libraryRecord, pickLibraryControls, storePalette } from './store-controls-library';

describe('the controls library (spec 2026-10-14, part 5)', () => {
  it('draws every icon as valid path data inside the 24×24 box, in both styles', () => {
    for (const [name, styles] of Object.entries({ ...CART_ICONS, ...SHARED_ICONS })) for (const [style, d] of Object.entries(styles)) {
      expect({ name, style, parsed: parseIconPath(d) }).toEqual({ name, style, parsed: { ok: true, d } });
    }
  });

  it('has one language per outline, each a record the sanitizer keeps as it is', () => {
    expect(CONTROL_LANGUAGES.map(language => language.shape.outline).sort()).toEqual([...CONTROL_OUTLINES].sort());
    for (const language of CONTROL_LANGUAGES) {
      const record = libraryRecord(language, 'clothing', 'bag');
      expect(sanitizeControls(record)).toEqual(record);
      expect(record.source).toBe('library');
    }
  });

  it('gives every kind of business its cart icon and its own cart word', () => {
    expect(cartIconFor('cafe-food')).toBe('cup');
    expect(cartIconFor('services')).toBe('briefcase');
    expect(cartIconFor('crafts-home')).toBe('frame');
    expect(cartIconFor('general', 'Tienda de accesorios para mascotas')).toBe('paw');
    for (const kind of Object.keys(KIND_CART_ICON) as PlaybookKind[]) {
      const record = pickLibraryControls({ kind, mode: 'calm', seed: kind });
      expect(record.words).toEqual({ cart: CART_WORDS[kind], account: 'Mi cuenta' });
      expect(cartIconName(record.icons.cart)).toBe(KIND_CART_ICON[kind]);
    }
  });

  it('is a pure function of its input', () => {
    const input = { kind: 'cafe-food' as const, mode: 'bold' as const, seed: 'store-1:0', look: { version: 1 as const, shape: { button: 'pill' as const } } };
    expect(pickLibraryControls(input)).toEqual(pickLibraryControls(input));
  });

  it('keeps calm and bold apart', () => {
    const modeOf = (outline: string) => CONTROL_LANGUAGES.find(language => language.shape.outline === outline)!.mode;
    for (let n = 0; n < 40; n++) {
      expect(modeOf(pickLibraryControls({ kind: 'beauty', mode: 'calm', seed: `c${n}` }).shape.outline)).not.toBe('bold');
      expect(modeOf(pickLibraryControls({ kind: 'beauty', mode: 'bold', seed: `b${n}` }).shape.outline)).not.toBe('calm');
    }
  });

  it('follows the measured button shape', () => {
    for (let n = 0; n < 20; n++) {
      expect(['pill', 'rounded']).toContain(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: `p${n}`, look: { version: 1, shape: { button: 'pill' } } }).shape.outline);
    }
    expect(['square', 'bracket', 'underline', 'tab']).toContain(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: 's', look: { version: 1, shape: { button: 0 } } }).shape.outline);
    expect(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: 'r', look: { version: 1, shape: { button: 'pill' } } }).shape.corner).toBeLessThanOrEqual(24);
  });

  it("never repeats a sibling store's outline and cart icon, and still answers when everything is taken", () => {
    const first = pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x' });
    const second = pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x', avoid: [first] });
    expect(controlsKey(second)).not.toBe(controlsKey(first));
    const everything = CONTROL_LANGUAGES.map(language => libraryRecord(language, 'cafe-food', 'cup'));
    expect(pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x', avoid: everything }).source).toBe('library');
  });

  it('treats the line and solid drawings of one icon as the same icon', () => {
    const line = libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup');
    expect(controlsKey({ ...line, icons: { ...line.icons, cart: CART_ICONS.cup.solid } })).toBe(controlsKey(line));
    expect(cartIconName('M4 4h16v16H4z')).toBe('custom');
    expect(cartIconName(undefined)).toBe('none');
  });

  it("skips languages the store's colours cannot read", () => {
    const yellow = { paper: '#ffffff', ink: '#111111', accent: '#ffd400', onAccent: '#111111' };
    expect(languageReadable(CONTROL_LANGUAGES.find(language => language.id === 'price-tag')!, yellow)).toBe(false);
    for (let n = 0; n < 40; n++) {
      const record = pickLibraryControls({ kind: 'general', mode: n % 2 ? 'bold' : 'calm', seed: `y${n}`, palette: yellow });
      expect(record.shape.fill === 'outline' && record.shape.colour === 'accent').toBe(false);
    }
    expect(hexContrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('reads the store palette from hex tokens only', () => {
    expect(storePalette([{ path: 'brand.css', content: ':root{--brand-background:#F7F4EF;--brand-foreground:#1a1f2b;--brand-accent:#2f4bb8;--brand-accent-foreground:#ffffff}' }]))
      .toEqual({ paper: '#f7f4ef', ink: '#1a1f2b', accent: '#2f4bb8', onAccent: '#ffffff' });
    expect(storePalette([{ path: 'styles.css', content: ':root{--store-background:oklch(98% 0 0)}' }])).toBeUndefined();
  });

  it("falls back to the line drawing of the store's own icons for a failing slot", () => {
    expect(libraryIconFallback('cafe-food')('cart')).toBe(CART_ICONS.cup.line);
    expect(libraryIconFallback('cafe-food')('close')).toBe(SHARED_ICONS.close.line);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts`
  - Expected: FAIL, `Cannot find module './store-controls-library'`.

- [ ] **Step 4: Write the library.** Create `apps/api/src/storefront-source/store-controls-library.ts`:

```ts
/**
 * The store controls library (spec 2026-10-14, part 5): eleven hand-designed button languages, one per outline, and icons drawn
 * for a 24×24 box in two styles (line and solid). Every icon is filled with currentColor using the even-odd rule, so a line icon
 * is drawn as its own outline. Revision N of every Sep-5 build gets a pick from here, and YAPI's own design falls back to it.
 * Pure: no I/O, no randomness (the pick is seeded).
 */
import { CART_WORDS } from './design-engine/commerce-draw';
import type { PlaybookKind } from './design-engine/playbook';
import { ICON_SLOTS, WORD_MAX_CHARS, type ControlBadge, type IconSlot, type StoreControls } from './store-controls';
import type { StoreLook } from './store-look';

export type IconStyle = 'line' | 'solid';
export type CartIcon = 'cup' | 'bag' | 'basket' | 'frame' | 'scoop' | 'briefcase' | 'leaf' | 'paw';

/** The cart icon by what the store sells. */
export const CART_ICONS: Record<CartIcon, Record<IconStyle, string>> = {
  cup: {
    line: 'M4 7h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM5.75 8.75h8.5V13a3.25 3.25 0 0 1-3.25 3.25H9A3.25 3.25 0 0 1 5.75 13zM16 8.5h1.5a3 3 0 0 1 0 6H16v-1.75h1.5a1.25 1.25 0 0 0 0-2.5H16zM3 20h16v1.75H3z',
    solid: 'M4 6.5h12.5V13a5.5 5.5 0 0 1-5.5 5.5H9.5A5.5 5.5 0 0 1 4 13zM16.5 8h1.25a3.25 3.25 0 0 1 0 6.5H16.5v-2h1.25a1.25 1.25 0 0 0 0-2.5H16.5zM2.5 19.75h17v2h-17z',
  },
  bag: {
    line: 'M5 8h14l-1 13H6zM6.8 9.75h10.4l-.75 9.5H7.55zM9 8V6.5a3 3 0 0 1 6 0V8h-1.75V6.5a1.25 1.25 0 0 0-2.5 0V8z',
    solid: 'M4.5 8h15l-1.2 13.5H5.7zM8.5 8V6.5a3.5 3.5 0 0 1 7 0V8h-2V6.5a1.5 1.5 0 0 0-3 0V8z',
  },
  basket: {
    line: 'M3 10h18l-2 10H5zM5.2 11.75h13.6l-1.3 6.5h-11zM11.1 11.75h1.8v6.5h-1.8zM6 10a6 6 0 0 1 12 0h-1.75a4.25 4.25 0 0 0-8.5 0z',
    solid: 'M2.5 9.5h19l-2.2 11H4.7zM8 12h1.5v6H8zM11.25 12h1.5v6h-1.5zM14.5 12H16v6h-1.5zM5.5 9.5a6.5 6.5 0 0 1 13 0h-2.25a4.25 4.25 0 0 0-8.5 0z',
  },
  frame: {
    line: 'M3 4h18v16H3zM5 6h14v12H5zM7 16l3.5-4.5 2.5 3 1.5-2 2.5 3.5zM15 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z',
    solid: 'M2.5 3.5h19v17h-19zM6 15.5l3.5-4.5 2.5 3 1.5-2 3 3.5zM15.5 7a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5z',
  },
  scoop: {
    line: 'M6 11.5a6 6 0 0 1 12 0v.5H6zM7.8 10.25a4.25 4.25 0 0 1 8.4 0zM7.5 12h9L12 22zM9.9 13.5h4.2L12 18.4z',
    solid: 'M5.5 11.5a6.5 6.5 0 0 1 13 0v1H5.5zM7.25 12.5h9.5L12 22.5z',
  },
  briefcase: {
    line: 'M3 8h18v12H3zM4.75 9.75h14.5v8.5H4.75zM4.75 13h14.5v1.5H4.75zM8.5 8V5.5h7V8h-1.75V7.25h-3.5V8z',
    solid: 'M2.5 7.5h19v13h-19zM10.5 12.5h3v2h-3zM8 7.5V5h8v2.5h-2V7h-4v.5z',
  },
  leaf: {
    line: 'M4 20A16 16 0 0 1 20 4A16 16 0 0 1 4 20zM6.5 17.5A13.5 13.5 0 0 1 17.5 6.5A13.5 13.5 0 0 1 6.5 17.5zM8.5 15.5 15.5 8.5l1 1-7 7z',
    solid: 'M3.5 20.5A17 17 0 0 1 20.5 3.5A17 17 0 0 1 3.5 20.5zM8 15 15 8l1 1-7 7z',
  },
  paw: {
    line: 'M12 12.5c3 0 6 3.2 6 5.8 0 1.7-1.3 2.7-3 2.7-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.7 0-3-1-3-2.7 0-2.6 3-5.8 6-5.8zM12 14.25c2.1 0 4.25 2.4 4.25 4.1 0 .7-.5 1-1.25 1-.9 0-1.8-.6-3-.6s-2.1.6-3 .6c-.75 0-1.25-.3-1.25-1 0-1.7 2.15-4.1 4.25-4.1zM5.5 7.9a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM5.5 8.9a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM9.5 4.15a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM9.5 5.15a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM14.5 4.15a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM14.5 5.15a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM18.5 7.9a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM18.5 8.9a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2z',
    solid: 'M12 12.5c3 0 6 3.2 6 5.8 0 1.7-1.3 2.7-3 2.7-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.7 0-3-1-3-2.7 0-2.6 3-5.8 6-5.8zM5.5 8.1a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8zM9.5 4.4a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM14.5 4.4a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM18.5 8.1a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8z',
  },
};

/** Account, menu, search, plus, minus and close: the same drawings for every store, in the language's style. */
export const SHARED_ICONS: Record<Exclude<IconSlot, 'cart'>, Record<IconStyle, string>> = {
  account: {
    line: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM12 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM4 21v-1c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5v1h-1.75v-1c0-2.8-2.8-4.75-6.25-4.75S5.75 17.2 5.75 20v1z',
    solid: 'M12 3a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9zM3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5z',
  },
  menu: { line: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z', solid: 'M3 5h18v3H3zM3 10.5h18v3H3zM3 16h18v3H3z' },
  search: {
    line: 'M10 3.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13zM10 5.25a4.75 4.75 0 1 0 0 9.5a4.75 4.75 0 1 0 0-9.5zM14.3 15.5l1.2-1.2 5 5-1.2 1.2z',
    solid: 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14zM10 6a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM14.6 16.7l2.1-2.1 4.5 4.5-2.1 2.1z',
  },
  plus: { line: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z', solid: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
  minus: { line: 'M5 11h14v2H5z', solid: 'M4 10h16v4H4z' },
  close: {
    line: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
    solid: 'M6 3.5l6 6 6-6 2.5 2.5-6 6 6 6-2.5 2.5-6-6-6 6-2.5-2.5 6-6-6-6z',
  },
};

export const KIND_CART_ICON: Record<PlaybookKind, CartIcon> = {
  'cafe-food': 'cup', 'bakery-sweets': 'scoop', clothing: 'bag', beauty: 'leaf', services: 'briefcase',
  'fitness-wellness': 'leaf', 'crafts-home': 'frame', 'flowers-gifts': 'basket', general: 'bag',
};
// \b treats accented letters as non-word characters, so whole words use letter lookarounds (as frame-draw.ts does).
const PET_WORDS = /(?<!\p{L})(mascotas?|perr[oa]s?|gat[oa]s?|veterinari[ao]s?|pet ?shop)(?!\p{L})/iu;
/** The cart icon of a store: its kind's, or the paw when the merchant's own words are about pets (no playbook kind for them). */
export function cartIconFor(kind: PlaybookKind, words = ''): CartIcon {
  return PET_WORDS.test(words) ? 'paw' : KIND_CART_ICON[kind] ?? 'bag';
}

export type ControlLanguage = { id: string; mode: 'calm' | 'bold' | 'both'; icons: IconStyle; shape: StoreControls['shape']; layout: StoreControls['layout']; badge: ControlBadge };
/** One hand-designed language per outline, with tuned numbers and a badge style. */
export const CONTROL_LANGUAGES: ControlLanguage[] = [
  { id: 'quiet-rounded', mode: 'calm', icons: 'line', shape: { outline: 'rounded', corner: 10, notch: 0, tilt: 0, border: 'hairline', weight: 1, fill: 'outline', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'circle' },
  { id: 'soft-pill', mode: 'calm', icons: 'line', shape: { outline: 'pill', corner: 24, notch: 0, tilt: 0, border: 'none', weight: 1, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon+word', account: 'word' }, badge: 'inline' },
  { id: 'ledger-square', mode: 'calm', icons: 'line', shape: { outline: 'square', corner: 0, notch: 0, tilt: 0, border: 'solid', weight: 1.5, fill: 'ghost', colour: 'ink' }, layout: { cart: 'word', account: 'word' }, badge: 'inline' },
  { id: 'ticket-stub', mode: 'bold', icons: 'solid', shape: { outline: 'ticket', corner: 4, notch: 5, tilt: 0, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'stamp' },
  { id: 'price-tag', mode: 'both', icons: 'line', shape: { outline: 'tag', corner: 4, notch: 6, tilt: 0, border: 'solid', weight: 1.5, fill: 'outline', colour: 'accent' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'corner' },
  { id: 'sticker', mode: 'bold', icons: 'solid', shape: { outline: 'sticker', corner: 14, notch: 0, tilt: -3, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon', account: 'icon' }, badge: 'circle' },
  { id: 'folder-tab', mode: 'calm', icons: 'line', shape: { outline: 'tab', corner: 8, notch: 0, tilt: 0, border: 'solid', weight: 1, fill: 'inverted', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'inline' },
  { id: 'postage-stamp', mode: 'bold', icons: 'solid', shape: { outline: 'stamp', corner: 0, notch: 6, tilt: 2, border: 'none', weight: 2, fill: 'solid', colour: 'ink' }, layout: { cart: 'icon', account: 'icon' }, badge: 'dot' },
  { id: 'corner-brackets', mode: 'calm', icons: 'line', shape: { outline: 'bracket', corner: 0, notch: 0, tilt: 0, border: 'none', weight: 2, fill: 'ghost', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'inline' },
  { id: 'underlined', mode: 'calm', icons: 'line', shape: { outline: 'underline', corner: 0, notch: 0, tilt: 0, border: 'none', weight: 2, fill: 'ghost', colour: 'accent' }, layout: { cart: 'word', account: 'word' }, badge: 'inline' },
  { id: 'pebble', mode: 'bold', icons: 'solid', shape: { outline: 'blob', corner: 20, notch: 0, tilt: -2, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon', account: 'icon' }, badge: 'dot' },
];

export type StorePalette = { paper: string; ink: string; accent: string; onAccent: string };
/** The store's four header tokens when they are plain hex (styles.css, then brand.css); undefined otherwise (oklch, var()…). */
export function storePalette(files: ReadonlyArray<{ path: string; content: string }>): StorePalette | undefined {
  const css = ['styles.css', 'brand.css'].map(path => files.find(file => file.path === path)?.content ?? '').join('\n');
  const read = (name: string) => css.match(new RegExp(`--(?:store|brand)-${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1]?.toLowerCase();
  const paper = read('background'), ink = read('foreground'), accent = read('accent'), onAccent = read('accent-foreground');
  return paper && ink && accent && onAccent ? { paper, ink, accent, onAccent } : undefined;
}
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export function hexContrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
/** Can the store read this language on its header? Words need 4.5:1, an icon-only language 3:1 (controls.css's fill rules). */
export function languageReadable(language: ControlLanguage, palette?: StorePalette): boolean {
  if (!palette) return true;
  const colour = { accent: palette.accent, ink: palette.ink, paper: palette.paper }[language.shape.colour];
  const on = { accent: palette.onAccent, ink: palette.paper, paper: palette.ink }[language.shape.colour];
  const [background, foreground] = language.shape.fill === 'solid' ? [colour, on]
    : language.shape.fill === 'outline' ? [palette.paper, colour]
    : language.shape.fill === 'ghost' ? [palette.paper, palette.ink]
    : [on, colour];
  const words = language.layout.cart !== 'icon' || language.layout.account !== 'icon';
  return hexContrast(foreground, background) >= (words ? 4.5 : 3);
}

/** The library name of a cart drawing, either style; 'custom' for YAPI's own, 'none' without one. */
export function cartIconName(d: string | undefined): CartIcon | 'custom' | 'none' {
  if (!d) return 'none';
  for (const [name, styles] of Object.entries(CART_ICONS) as Array<[CartIcon, Record<IconStyle, string>]>) if (styles.line === d || styles.solid === d) return name;
  return 'custom';
}
/** What two stores must not share (spec criterion 2): the outline plus the cart icon. */
export function controlsKey(controls: StoreControls): string {
  const name = cartIconName(controls.icons.cart);
  return `${controls.shape.outline}|${name === 'custom' ? controls.icons.cart : name}`;
}

/** A language made into a store's record: its icons in the language's style, the kind's cart word, «Mi cuenta». */
export function libraryRecord(language: ControlLanguage, kind: PlaybookKind, cartIcon: CartIcon, look?: StoreLook): StoreControls {
  const button = look?.shape?.button;
  const corner = language.shape.outline === 'rounded' && typeof button === 'number' ? Math.min(24, Math.max(4, button)) : language.shape.corner;
  const cartWord = CART_WORDS[kind];
  return {
    version: 1,
    shape: { ...language.shape, corner },
    layout: { ...language.layout },
    icons: Object.fromEntries(ICON_SLOTS.map(slot => [slot, slot === 'cart' ? CART_ICONS[cartIcon][language.icons] : SHARED_ICONS[slot][language.icons]])),
    words: { ...(cartWord && [...cartWord].length <= WORD_MAX_CHARS ? { cart: cartWord } : {}), account: 'Mi cuenta' },
    badge: language.badge,
    source: 'library',
  };
}
/** The icon a failing slot falls back to: the line drawing of the store's own library icons. */
export function libraryIconFallback(kind: PlaybookKind, words = '', style: IconStyle = 'line'): (slot: IconSlot) => string {
  const cart = cartIconFor(kind, words);
  return slot => slot === 'cart' ? CART_ICONS[cart][style] : SHARED_ICONS[slot][style];
}

const seededIndex = (seed: string, length: number) => {
  let hash = 0x811c9dc5;
  for (const char of seed) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash % length;
};
/** How well an outline follows the home's measured buttons and edges (store-look.ts); higher is closer. */
function lookAffinity(language: ControlLanguage, look?: StoreLook): number {
  const button = look?.shape?.button, outline = language.shape.outline;
  let score = 0;
  if (button === 'pill') score += ['pill', 'blob', 'rounded'].includes(outline) ? 2 : 0;
  else if (typeof button === 'number' && button <= 2) score += ['square', 'bracket', 'underline', 'tab', 'stamp', 'ticket'].includes(outline) ? 2 : 0;
  else if (typeof button === 'number') score += ['rounded', 'tag', 'ticket', 'sticker', 'tab'].includes(outline) ? 2 : 0;
  if (look?.edge === 'offset' || look?.edge === 'outline') score += ['sticker', 'stamp', 'ticket', 'tag'].includes(outline) ? 1 : 0;
  if (look?.edge === 'hairline' || look?.edge === 'none') score += ['rounded', 'pill', 'underline', 'bracket', 'square'].includes(outline) ? 1 : 0;
  return score;
}

export type LibraryPickInput = { kind: PlaybookKind; mode: 'calm' | 'bold'; seed: string; look?: StoreLook; avoid?: StoreControls[]; words?: string; palette?: StorePalette };
/**
 * Revision N's language (spec part 4): a pure function of the kind, calm or bold, the measured look and a seed. It never takes an
 * outline and cart icon a sibling store has (`avoid`), prefers outlines siblings do not use, and skips languages the store's
 * colours cannot read. When everything is taken it relaxes the mode, then readability, and always answers.
 */
export function pickLibraryControls(input: LibraryPickInput): StoreControls {
  const cartIcon = cartIconFor(input.kind, input.words);
  const avoid = input.avoid ?? [];
  const taken = new Set(avoid.map(controlsKey));
  const usedOutlines = new Set(avoid.map(controls => controls.shape.outline));
  const readable = CONTROL_LANGUAGES.filter(language => languageReadable(language, input.palette));
  const inMode = readable.filter(language => language.mode === 'both' || language.mode === input.mode);
  for (const pool of [inMode, readable, CONTROL_LANGUAGES]) {
    const options = pool.map(language => ({ language, record: libraryRecord(language, input.kind, cartIcon, input.look) })).filter(option => !taken.has(controlsKey(option.record)));
    if (!options.length) continue;
    const scored = options.map(option => ({ ...option, score: lookAffinity(option.language, input.look) - (usedOutlines.has(option.language.shape.outline) ? 2 : 0) }));
    const best = Math.max(...scored.map(option => option.score));
    const top = scored.filter(option => option.score >= best - 1);
    return top[seededIndex(input.seed, top.length)].record;
  }
  return libraryRecord(CONTROL_LANGUAGES[0], input.kind, cartIcon, input.look);
}
```

- [ ] **Step 5: Run the test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts`
  - Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/storefront-source/store-controls-library.ts apps/api/src/storefront-source/store-controls-library.spec.ts
git commit -m "feat(controls): the controls library — eleven languages, line and solid icons per business, a seeded pick away from siblings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The header draws the record (`source-header.ts`)

**Files:**
- Modify: `apps/api/src/storefront-source/source-header.ts`:
  - imports (lines 7-11);
  - `RenderHeaderInput` (lines 18-25);
  - `renderSourceHeader` (lines 36-63, replaced whole);
  - `SourceHeaderInput` (lines 128-138);
  - the `renderSourceHeader` call inside `withSourceHeader` (line 181).
  - Line numbers are at HEAD 94f7beda; (c) lengthens the file, so anchor (d) and (e) on the quoted text.
- Test: `apps/api/src/storefront-source/source-header.spec.ts` (new imports and a new `describe` at the end).

**Interfaces:**
- Consumes: `StoreControls` and `IconSlot` (Task 2); `CONTROL_LANGUAGES`, `libraryRecord` and `CART_ICONS` (Task 3, tests only).
- Produces:
  - `RenderHeaderInput.controls?: StoreControls`.
  - `SourceHeaderInput.controls?: StoreControls`.
  - Header markup contract (kit runtime and guard rely on it):
    - The header carries `data-controls-outline|border|fill|colour|badge` and `style="--ctl-corner:Npx;--ctl-notch:Npx;--ctl-tilt:Ndeg;--ctl-weight:Npx"`.
    - Every control carries `data-ctl="cart|account|search|menu|close"` with an inner `<span class="ctl-face">`.
    - Icons are drawn as `<svg class="ctl-icon" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="…"/></svg>`.
    - Words are drawn as `<span class="ctl-word" aria-hidden="true">`.
    - The cart's plain label is `<span class="ctl-sr">Carrito, </span>…<span class="ctl-sr" data-ctl-unit> productos</span>`.
    - The badge is `class="pyh-cart-count ctl-badge" data-cart-count data-empty`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** In `source-header.spec.ts`, add these imports after line 5:

```ts
import { createHash } from 'node:crypto';
import { CART_ICONS, CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';
import type { StoreControls } from './store-controls';
```

Then append at the end of the file:

```ts
describe('store controls in the header (spec 2026-10-14, part 3)', () => {
  const TICKET: StoreControls = libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup');
  const withLayout = (cart: StoreControls['layout']['cart'], account: StoreControls['layout']['account']): StoreControls => ({ ...TICKET, layout: { cart, account } });
  const cartButton = (html: string) => html.match(/<button type="button" class="pyh-cart"[\s\S]*?<\/button>/)![0];
  const hasTools = (shape: HeaderShape) => readFileSync(kitPath('headers', `${shape}.html`), 'utf8').includes('{{tools}}');

  // Computed on 2026-10-14 from the unmodified renderSourceHeader. If it fails before your change, recompute it on the
  // unmodified code (git stash) with the same 20 headers and pin that value: it guards "no record, no change".
  it("draws today's header byte for byte when the store has no record", () => {
    const all = HEADER_SHAPES.flatMap(shape => (['shop', 'service'] as const).map(purpose => render(shape, purpose)));
    expect(createHash('sha256').update(all.join('\n')).digest('hex')).toBe('5617e18c2b27a30604a6f008efd4edb0aef8226b1eb5699344bb329db027f480');
  });

  it.each([...HEADER_SHAPES])('«%s» shop: the record on the header, icons and words on the controls, the locked hooks kept', shape => {
    const html = render(shape, 'shop', { controls: TICKET });
    expect(html).toContain(`class="pyh pyh--${shape}" data-controls-outline="ticket" data-controls-border="none" data-controls-fill="solid" data-controls-colour="accent" data-controls-badge="stamp" style="--ctl-corner:4px;--ctl-notch:5px;--ctl-tilt:0deg;--ctl-weight:2px">`);
    const cart = cartButton(html);
    expect(cart).toContain('data-cart-open data-ctl="cart"');
    expect(cart).toContain(`<path fill="currentColor" fill-rule="evenodd" d="${CART_ICONS.cup.solid}"/>`);
    expect(cart).toContain('<span class="ctl-word pyh-cart-word" aria-hidden="true">Tu pedido</span>');
    expect(cart).toContain('<span class="ctl-sr">Carrito, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span>');
    expect(html.match(/data-cart-open/g)).toHaveLength(1);
    expect(html.match(/data-pagosya-header-toggle/g)).toHaveLength(1);
    expect(html).toContain('data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu" data-ctl="menu"><span class="ctl-face"><svg class="ctl-icon"');
    expect(html).toContain('<button type="button" class="pyh-close" data-pagosya-header-close aria-label="Cerrar" data-ctl="close">');
    expect(html).toContain('<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>');
    if (hasTools(shape)) {
      expect(html).toContain('<a class="pyh-tool" href="#" data-pagosya-account="login" aria-label="Mi cuenta" data-ctl="account">');
      expect(html).toContain('<a class="pyh-tool" href="buscar.html" aria-label="Buscar" data-ctl="search">');
    }
    expect(html).not.toContain('{{');
  });

  it('follows the layout: icon only keeps the plain label, word only draws no icon, a missing icon falls back to the word', () => {
    const iconOnly = cartButton(render('menu-button', 'shop', { controls: withLayout('icon', 'icon') }));
    expect(iconOnly).toContain('<svg class="ctl-icon"');
    expect(iconOnly).not.toContain('ctl-word');
    expect(iconOnly).toContain('<span class="ctl-sr">Carrito, </span>');
    const wordOnly = cartButton(render('menu-button', 'shop', { controls: withLayout('word', 'word') }));
    expect(wordOnly).not.toContain('<svg');
    expect(wordOnly).toContain('>Tu pedido</span>');
    const noIcon = cartButton(render('menu-button', 'shop', { controls: { ...withLayout('icon', 'icon'), icons: {} } }));
    expect(noIcon).toContain('>Tu pedido</span>');
    expect(render('menu-button', 'shop', { controls: { ...TICKET, icons: { ...TICKET.icons, menu: undefined } } })).toContain('<span class="ctl-face"><span class="pyh-toggle-bars" aria-hidden="true"></span>');
  });

  it("shows the record's account word but keeps the plain accessible name, and Carrito without a cart word", () => {
    const html = render('shrinking', 'shop', { controls: { ...withLayout('word', 'word'), words: { account: 'Ingresar' } } });
    expect(html).toContain('aria-label="Mi cuenta" data-ctl="account"><span class="ctl-face"><span class="ctl-word" aria-hidden="true">Ingresar</span></span></a>');
    expect(cartButton(html)).toContain('>Carrito</span>');
  });

  it('gives a showcase header the language on its menu button and close button, never a cart', () => {
    const html = render('menu-button', 'service', { controls: TICKET });
    expect(html).toContain('data-controls-outline="ticket"');
    expect(html).not.toContain('data-cart-open');
    expect(html).not.toContain('data-ctl="cart"');
    expect(html).toContain('data-ctl="menu"');
    expect(html).toContain('data-ctl="close"');
    expect(html).toContain('href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
  });

  it('withSourceHeader passes the record to every page', () => {
    const files = [{ path: 'index.html', content: '<body><header data-pagosya-header></header><main><section id="a" data-nav-label="Inicio"></section></main></body>' }, { path: 'nosotros.html', content: '<body><header data-pagosya-header></header><main></main></body>' }];
    const result = withSourceHeader(files, { shape: 'menu-button', purpose: 'shop', storeName: 'Café', controls: TICKET });
    for (const file of result.files) expect(file.content).toContain('data-controls-outline="ticket"');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-header.spec.ts`
  - Expected: FAIL. The new `it.each` cases fail on the missing `data-controls-outline` (TypeScript also reports `Object literal may only specify known properties, and 'controls' does not exist`). The hash test passes.

- [ ] **Step 4: Draw the record.** In `source-header.ts`:

(a) After line 11 (`import { ORDER_EMAIL_TEMPLATE_PATH } …`), add:

```ts
import type { IconSlot, StoreControls } from './store-controls';
```

(b) In `RenderHeaderInput`, after `prefix?: string;` (line 24), add:

```ts
  /** The store's control language (spec 2026-10-14 store controls); without one the header is drawn exactly as before. */
  controls?: StoreControls;
```

(c) Replace `renderSourceHeader` (lines 36-63) with:

```ts
/** One record icon as inline SVG: path data only (sanitizeControls checked it), filled with the control's own colour. */
const controlIcon = (controls: StoreControls, slot: IconSlot) => {
  const d = controls.icons[slot];
  return d ? `<svg class="ctl-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${escape(d)}"/></svg>` : '';
};
/** The inner layer that carries the shape: the icon and/or the word as the layout says; a word whenever the icon is missing. */
const controlFace = (icon: string, word: string, layout: string, wordClass = 'ctl-word') => {
  const drawIcon = layout !== 'word' && icon !== '', drawWord = layout !== 'icon' || !drawIcon;
  return `<span class="ctl-face">${drawIcon ? icon : ''}${drawWord ? `<span class="${wordClass}" aria-hidden="true">${escape(word)}</span>` : ''}</span>`;
};
/** The record on the header element: enums as attributes, numbers as the --ctl-* variables controls.css reads. */
const controlAttributes = (controls: StoreControls) => {
  const { shape } = controls;
  return ` data-controls-outline="${shape.outline}" data-controls-border="${shape.border}" data-controls-fill="${shape.fill}" data-controls-colour="${shape.colour}" data-controls-badge="${controls.badge}" style="--ctl-corner:${shape.corner}px;--ctl-notch:${shape.notch}px;--ctl-tilt:${shape.tilt}deg;--ctl-weight:${shape.weight}px"`;
};

export function renderSourceHeader(input: RenderHeaderInput): string {
  const prefix = input.prefix ?? '';
  const showcase = input.purpose !== 'shop';
  const anchor = (link: HeaderLink) => `<a href="${escape(local(link.href, prefix))}">${escape(link.label)}</a>`;
  const nav = (items: HeaderLink[], label: string) => items.length ? `<nav class="pyh-nav" aria-label="${label}">${items.map(anchor).join('')}</nav>` : '';
  const half = Math.ceil(input.links.length / 2);
  const search = !showcase && input.search !== false;
  const link = showcase ? primaryActionLink(input.action ?? { kind: 'form' }) : null;
  const actionHref = link ? escape(local(link.href, prefix)) : '';
  const menuTools = link
    ? `<a class="pyh-menu-link pyh-menu-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
    : `${search ? `<a class="pyh-menu-link" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>`;
  const menu = (close: string) => `<div class="pyh-menu" id="pyh-menu" data-pagosya-header-menu hidden><div class="pyh-menu-panel" role="dialog" aria-modal="true" aria-label="Menú">${close}${input.links.length ? `<nav class="pyh-menu-nav" aria-label="Menú">${input.links.map(anchor).join('')}</nav>` : ''}<div class="pyh-menu-tools">${menuTools}</div></div></div>`;
  const parts: Record<string, string> = {
    brand: `<a class="pyh-brand" href="${escape(prefix)}index.html">${input.logoPath ? `<img class="pyh-logo" src="${escape(local(input.logoPath, prefix))}" alt="">` : ''}<span data-store-name>${escape(input.storeName)}</span></a>`,
    nav: nav(input.links, 'Principal'),
    navStart: nav(input.links.slice(0, half), 'Principal'),
    navEnd: nav(input.links.slice(half), 'Más secciones'),
    tools: showcase ? '' : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-tool" href="#" data-pagosya-account="login">Mi cuenta</a>`,
    cta: link
      ? `<a class="pyh-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : '<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span> <span class="pyh-cart-count" data-cart-count>0</span></button>',
    toggle: '<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu"><span class="pyh-toggle-bars" aria-hidden="true"></span><span class="pyh-toggle-label">Menú</span></button>',
    menu: menu('<button type="button" class="pyh-close" data-pagosya-header-close>Cerrar</button>'),
    fact: input.fact?.trim() ? `<p class="pyh-fact">${escape(input.fact.trim())}</p>` : '',
  };
  // Spec 2026-10-14 store controls: the record's icons, words and layout on the cart, account, search, menu and close controls.
  // The hooks the kit and shoppers rely on (data-cart-open, data-cart-count, data-pagosya-account, the menu's toggle and close,
  // accessible names) stay exactly as they are; screen readers hear «Carrito, N productos» and «Mi cuenta», never the record's words.
  const controls = input.controls;
  if (controls) {
    const { layout, words } = controls;
    parts.tools = showcase ? '' : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html" aria-label="Buscar" data-ctl="search">${controlFace(controlIcon(controls, 'search'), 'Buscar', layout.account)}</a>` : ''}<a class="pyh-tool" href="#" data-pagosya-account="login" aria-label="Mi cuenta" data-ctl="account">${controlFace(controlIcon(controls, 'account'), words.account ?? 'Mi cuenta', layout.account)}</a>`;
    if (!link) parts.cta = `<button type="button" class="pyh-cart" data-cart-open data-ctl="cart">${controlFace(controlIcon(controls, 'cart'), words.cart ?? 'Carrito', layout.cart, 'ctl-word pyh-cart-word')}<span class="ctl-sr">Carrito, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span></button>`;
    parts.toggle = `<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu" data-ctl="menu"><span class="ctl-face">${controlIcon(controls, 'menu') || '<span class="pyh-toggle-bars" aria-hidden="true"></span>'}<span class="pyh-toggle-label ctl-word">Menú</span></span></button>`;
    parts.menu = menu(`<button type="button" class="pyh-close" data-pagosya-header-close aria-label="Cerrar" data-ctl="close">${controlFace(controlIcon(controls, 'close'), 'Cerrar', 'icon+word')}</button>`);
  }
  // A callback, never a replacement string: a store name containing "$&" must stay literal.
  const body = kitText(`${input.shape}.html`).replace(/\{\{(\w+)\}\}/g, (_match, key: string) => parts[key] ?? '');
  return `<header data-pagosya-header data-shape="${input.shape}" data-purpose="${showcase ? 'showcase' : 'shop'}" class="pyh pyh--${input.shape}"${controls ? controlAttributes(controls) : ''}><style data-pagosya-header-style>${kitText('headers.css')}</style>${body}</header>`;
}
```

(d) In `SourceHeaderInput`, after `claim?: boolean;` (line 137 at HEAD), add:

```ts
  /** The store's control language (spec 2026-10-14); drawn into every page's header. */
  controls?: StoreControls;
```

(e) In `withSourceHeader`, replace the `const header = renderSourceHeader({ … })` line (line 181 at HEAD) with:

```ts
    const header = renderSourceHeader({ shape, purpose: input.purpose, storeName: input.storeName, links, logoPath, action: input.action, fact: input.fact, search: exists.has('buscar.html'), prefix: '../'.repeat(file.path.split('/').length - 1), ...(input.controls ? { controls: input.controls } : {}) });
```

- [ ] **Step 5: Run the header tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-header.spec.ts src/storefront-source/source-generation-header.spec.ts --maxWorkers=2`
  - Expected: PASS, including the byte-for-byte hash.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-header.spec.ts
git commit -m "feat(controls): the platform header draws the store's controls — icons, words and layout, the locked hooks untouched

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The controls stylesheet and its wiring (`controls.css`)

**How kit CSS reaches a store today:** `renderSourceHeader` inlines `headers.css` into every page's header as `<style data-pagosya-header-style>` (`source-header.ts:62`). `withSourceHeader` draws that header on every HTML page, kit pages included (`KIT_PAGE` swaps their stock header for the slot). The controls stylesheet rides the same way: a second `<style data-pagosya-controls-style>` in the header, only when the store has a record. The rules for the kit's own controls key on `:root[data-controls-outline]`, which `commerce.js` sets (Task 6). The header carries the same attributes from save time, so nothing flashes before the runtime loads.

**Cascade:**
- `headers.css` is unlayered, so the controls rules are unlayered too. They win by specificity: `:is(:root,.pyh)[data-controls-outline] [data-ctl]` is (0,3,0) against `.pyh .pyh-cart` at (0,2,0).
- The locked rules sit in `@layer pagosya-controls-locked` with `!important`. Important declarations in a layer outrank every unlayered declaration, the store's own CSS included.
- `display` is never set on a hit box, because `headers.css` hides `.pyh-tool` on phones and some toggles on desktop.

**Files:**
- Create: `packages/storefront-kit/kit/controls.css`
- Modify: `apps/api/src/storefront-source/source-header.ts` (a module constant after `kitText`, and the return line of `renderSourceHeader`)
- Test: `apps/api/src/storefront-source/source-header.spec.ts`; `apps/api/src/storefront-source/source-header-browser.spec.ts`

**Interfaces:**
- Consumes: the header markup contract from Task 4.
- Produces:
  - CSS variables: `--ctl-corner`, `--ctl-notch`, `--ctl-tilt`, `--ctl-weight` (set by the header style attribute or by `commerce.js`); `--ctl-fill` and `--ctl-ink` (computed from fill and colour).
  - Classes: `.ctl-face`, `.ctl-icon`, `.ctl-word`, `.ctl-badge`, `.ctl-sr`.
  - The hit-box marker `[data-ctl]`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

In `source-header.spec.ts`, extend the controls `describe` from Task 4 with these tests (add `import postcss from 'postcss';` and `import { CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES } from './store-controls';` to the imports):

```ts
  it('controls.css has one recipe per outline and rules for every fill, colour, border and badge, from the store tokens only', () => {
    const css = readFileSync(kitPath('controls.css'), 'utf8');
    for (const outline of CONTROL_OUTLINES) expect(css).toContain(`[data-controls-outline=${outline}] .ctl-face{`);
    for (const fill of CONTROL_FILLS) expect(css).toContain(`[data-controls-fill=${fill}]{`);
    for (const colour of CONTROL_COLOURS) expect(css).toContain(`[data-controls-colour=${colour}]{`);
    for (const border of CONTROL_BORDERS) expect(css).toContain(`[data-controls-border=${border}]{`);
    for (const badge of CONTROL_BADGES) expect(css).toContain(`[data-controls-badge=${badge}]`);
    // A colour literal may appear only as the last fallback of a token chain, or as a mask's black and clear.
    const withoutFallbacks = css.replace(/var\(--[\w-]+,(?:var\(--[\w-]+,)*#[0-9a-f]{3,8}\)+/gi, '').replace(/#0{3,4}\b/g, '');
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // No record, no change: every rule keys on a data-controls-* attribute.
    postcss.parse(css).walkRules(rule => expect(rule.selector).toMatch(/data-controls-/));
    expect(css).toMatch(/@layer pagosya-controls-locked\{[^@]*\[data-controls-outline\] \[data-ctl\]\{min-width:44px!important;min-height:44px!important;transform:none!important/);
  });

  it('carries the controls stylesheet only with a record', () => {
    expect(render('menu-button', 'shop', { controls: TICKET }).match(/<style data-pagosya-controls-style>/g)).toHaveLength(1);
    expect(render('menu-button', 'shop')).not.toContain('data-pagosya-controls-style');
  });
```

In `source-header-browser.spec.ts`:
- Change the `open` helper so it can carry a record. Replace its signature line and its `renderSourceHeader` and `config` lines with:

```ts
async function open(shape: HeaderShape, purpose: 'shop' | 'service', width: number, storeName = 'Marca', controls?: StoreControls): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape, purpose, storeName, links, action: { kind: 'whatsapp', value: '59170000000' }, fact: 'Atendemos de lunes a viernes, de 9:00 a 18:00.', search: true, ...(controls ? { controls } : {}) });
```

and

```ts
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: purpose, ...(controls ? { controls } : {}), data: { storeName, items: [] } };
```

- Add the imports `import { CONTROL_OUTLINES, type StoreControls } from './store-controls';` and `import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';`.
- Append:

```ts
describe('store controls in the platform header (spec 2026-10-14, part 3)', () => {
  it.each([...CONTROL_OUTLINES])('«%s»: upright 44px targets, the tilt on the face, nothing covered or wider than the screen, the menu gives the page back', async outline => {
    const base = libraryRecord(CONTROL_LANGUAGES[0], 'crafts-home', 'frame');
    const controls: StoreControls = { ...base, shape: { ...base.shape, outline, tilt: -3, notch: 6 }, words: { cart: 'Tu portafolios', account: 'Mi cuenta' } };
    for (const shape of ['menu-button', 'side-rail', 'bottom-pill', 'centered-split'] as const) for (const width of [1440, 390]) {
      const page = await open(shape, 'shop', width, 'Marca', controls);
      try {
        const facts = await page.evaluate(() => Array.from(document.querySelectorAll('header [data-ctl]')).filter(el => (el as any).checkVisibility()).map(el => {
          const box = el.getBoundingClientRect(), face = el.querySelector('.ctl-face')!;
          return { slot: el.getAttribute('data-ctl'), width: box.width, height: box.height, box: getComputedStyle(el).transform, face: getComputedStyle(face).transform };
        }));
        const label = `${outline} ${shape} ${width}`;
        expect({ label, cart: facts.some(fact => fact.slot === 'cart') }).toEqual({ label, cart: true });
        for (const fact of facts) {
          expect({ label, slot: fact.slot, target: fact.width >= 44 && fact.height >= 44, upright: fact.box === 'none', tilted: fact.face !== 'none' })
            .toEqual({ label, slot: fact.slot, target: true, upright: true, tilted: true });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(await measureHeaderCovers(page, { maxPositions: 2 })).toEqual([]);
        const toggle = page.locator('[data-pagosya-header-toggle]');
        if (await toggle.isVisible()) {
          await toggle.click();
          expect(await menuState(page)).toMatchObject({ open: true, focusInside: true });
          await page.keyboard.press('Escape');
          expect(await menuState(page)).toEqual({ open: false, focusInside: false, focusOnToggle: true, overflow: '' });
        }
      } finally { await page.close(); }
    }
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-header.spec.ts`. Expected: FAIL, `ENOENT: no such file or directory, open '…/kit/controls.css'`.
  - Run: `cd apps/api && npx jest src/storefront-source/source-header-browser.spec.ts`. Expected: FAIL. The new tests see unstyled faces, so every control reports `tilted: false`. The existing tests still pass.

- [ ] **Step 4: Write the stylesheet.** Create `packages/storefront-kit/kit/controls.css`:

```css
/* Store controls (spec docs/superpowers/specs/2026-10-14-store-controls-design.md): one button language per store, from config.controls.
   Every rule is keyed on [data-controls-outline], which the platform header carries from save time and commerce.js sets on :root,
   so a store without a record never matches. Colours come only from the store tokens. The hit box ([data-ctl]) stays upright and
   at least 44x44; the shape, fill, border and tilt are drawn on its inner .ctl-face layer. */
:is(:root,.pyh)[data-controls-outline]{--ctl-paper:var(--store-background,var(--brand-background,var(--paper,#ffffff)));--ctl-text:var(--store-foreground,var(--brand-foreground,var(--ink,#161616)));--ctl-accent:var(--store-accent,var(--brand-accent,var(--accent,#161616)));--ctl-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,#ffffff));--ctl-scallop:calc(var(--ctl-notch,4px) + 4px)}
[data-controls-colour=accent]{--ctl-c:var(--ctl-accent);--ctl-on:var(--ctl-on-accent)}
[data-controls-colour=ink]{--ctl-c:var(--ctl-text);--ctl-on:var(--ctl-paper)}
[data-controls-colour=paper]{--ctl-c:var(--ctl-paper);--ctl-on:var(--ctl-text)}
[data-controls-fill=solid]{--ctl-fill:var(--ctl-c);--ctl-ink:var(--ctl-on)}
[data-controls-fill=outline]{--ctl-fill:transparent;--ctl-ink:var(--ctl-c)}
[data-controls-fill=ghost]{--ctl-fill:transparent;--ctl-ink:currentColor}
[data-controls-fill=inverted]{--ctl-fill:var(--ctl-on);--ctl-ink:var(--ctl-c)}
[data-controls-border=none]{--ctl-border:0 solid transparent}
[data-controls-border=hairline]{--ctl-border:1px solid var(--ctl-ink)}
[data-controls-border=solid]{--ctl-border:var(--ctl-weight,2px) solid var(--ctl-ink)}
[data-controls-border=double]{--ctl-border:max(3px,calc(var(--ctl-weight,2px) * 3)) double var(--ctl-ink)}
[data-controls-border=dashed]{--ctl-border:var(--ctl-weight,2px) dashed var(--ctl-ink)}
[data-controls-border=offset]{--ctl-border:var(--ctl-weight,2px) solid var(--ctl-ink);--ctl-shadow:3px 3px 0 var(--ctl-ink)}
/* The hit box: what was a pill or a text link becomes a plain, upright target; the face inside carries the language. */
:is(:root,.pyh)[data-controls-outline] [data-ctl],:root[data-controls-outline] [data-pagosya-product] .product-detail__quantity>[data-ctl]{position:relative;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:inherit;clip-path:none;-webkit-mask:none;mask:none;text-decoration:none;cursor:pointer}
[data-controls-outline] .ctl-face{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-width:36px;min-height:36px;padding:0 12px;border:var(--ctl-border);border-radius:var(--ctl-corner,8px);background:var(--ctl-fill);color:var(--ctl-ink);box-shadow:var(--ctl-shadow,none);transform:rotate(var(--ctl-tilt,0deg));font:inherit;font-size:15px;font-weight:600;line-height:1;white-space:nowrap;pointer-events:none;transition:transform .16s ease}
[data-controls-outline] .ctl-face:not(:has(.ctl-word)){width:36px;padding:0}
[data-controls-outline] .ctl-icon{display:block;flex:none;width:20px;height:20px;fill:currentColor}
[data-controls-outline] [data-ctl]:active:not(:disabled) .ctl-face{transform:rotate(var(--ctl-tilt,0deg)) translateY(1px)}
[data-controls-outline] [data-ctl]:disabled .ctl-face{opacity:.45}
/* One recipe per outline. */
[data-controls-outline=rounded] .ctl-face{border-radius:var(--ctl-corner,8px)}
[data-controls-outline=pill] .ctl-face{border-radius:999px}
[data-controls-outline=square] .ctl-face{border-radius:0}
[data-controls-outline=ticket] .ctl-face{border-radius:var(--ctl-corner,4px);padding-inline:calc(var(--ctl-notch,5px) + 10px);-webkit-mask:radial-gradient(circle at 0 50%,#0000 var(--ctl-notch,5px),#000 calc(var(--ctl-notch,5px) + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 var(--ctl-notch,5px),#000 calc(var(--ctl-notch,5px) + .5px)) 100% 0/51% 100% no-repeat;mask:radial-gradient(circle at 0 50%,#0000 var(--ctl-notch,5px),#000 calc(var(--ctl-notch,5px) + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 var(--ctl-notch,5px),#000 calc(var(--ctl-notch,5px) + .5px)) 100% 0/51% 100% no-repeat}
[data-controls-outline=tag] .ctl-face{border-radius:0 var(--ctl-corner,4px) var(--ctl-corner,4px) 0;padding-left:calc(var(--ctl-notch,6px) + 16px);clip-path:polygon(calc(var(--ctl-notch,6px) + 6px) 0,100% 0,100% 100%,calc(var(--ctl-notch,6px) + 6px) 100%,0 50%);-webkit-mask:radial-gradient(circle at calc(var(--ctl-notch,6px) + 8px) 50%,#0000 2.5px,#000 3px);mask:radial-gradient(circle at calc(var(--ctl-notch,6px) + 8px) 50%,#0000 2.5px,#000 3px)}
[data-controls-outline=sticker] .ctl-face{border-radius:var(--ctl-corner,14px);box-shadow:0 0 0 calc(var(--ctl-weight,2px) + 2px) var(--ctl-paper),2px 3px 0 calc(var(--ctl-weight,2px) + 2px) color-mix(in srgb,var(--ctl-text) 30%,transparent)}
[data-controls-outline=tab] .ctl-face{border-radius:var(--ctl-corner,8px) var(--ctl-corner,8px) 0 0;box-shadow:inset 0 calc(-1 * var(--ctl-weight,2px)) 0 var(--ctl-ink)}
[data-controls-outline=stamp] .ctl-face{border-radius:0;padding-inline:calc(var(--ctl-scallop) / 2 + 10px);-webkit-mask:radial-gradient(calc(var(--ctl-scallop) / 3),#0000 97%,#000) round calc(var(--ctl-scallop) / -2) calc(var(--ctl-scallop) / -2)/var(--ctl-scallop) var(--ctl-scallop),linear-gradient(#000 0 0) no-repeat 50%/calc(100% - var(--ctl-scallop)) calc(100% - var(--ctl-scallop));mask:radial-gradient(calc(var(--ctl-scallop) / 3),#0000 97%,#000) round calc(var(--ctl-scallop) / -2) calc(var(--ctl-scallop) / -2)/var(--ctl-scallop) var(--ctl-scallop),linear-gradient(#000 0 0) no-repeat 50%/calc(100% - var(--ctl-scallop)) calc(100% - var(--ctl-scallop))}
[data-controls-outline=bracket] .ctl-face{border:0;border-radius:0;background:linear-gradient(var(--ctl-ink) 0 0) 0 0/8px var(--ctl-weight,2px),linear-gradient(var(--ctl-ink) 0 0) 0 0/var(--ctl-weight,2px) 8px,linear-gradient(var(--ctl-ink) 0 0) 100% 0/8px var(--ctl-weight,2px),linear-gradient(var(--ctl-ink) 0 0) 100% 0/var(--ctl-weight,2px) 8px,linear-gradient(var(--ctl-ink) 0 0) 0 100%/8px var(--ctl-weight,2px),linear-gradient(var(--ctl-ink) 0 0) 0 100%/var(--ctl-weight,2px) 8px,linear-gradient(var(--ctl-ink) 0 0) 100% 100%/8px var(--ctl-weight,2px),linear-gradient(var(--ctl-ink) 0 0) 100% 100%/var(--ctl-weight,2px) 8px,var(--ctl-fill);background-repeat:no-repeat}
[data-controls-outline=underline] .ctl-face{border:0;border-radius:0;background:linear-gradient(var(--ctl-ink) 0 0) 50% 100%/calc(100% - 16px) var(--ctl-weight,2px) no-repeat,var(--ctl-fill)}
[data-controls-outline=blob] .ctl-face{border-radius:42% 58% 55% 45%/55% 45% 58% 42%}
/* The count badge on the header cart. Zero shows nothing (inline reads like today's "Carrito 0"); the number always stays in the
   accessibility tree, so the cart reads «Carrito, 0 productos» and a dot badge still says how many. */
[data-controls-outline] [data-ctl=cart] .ctl-badge{box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--ctl-accent);color:var(--ctl-on-accent);font-size:11px;font-weight:700;line-height:18px;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none}
[data-controls-colour=accent][data-controls-fill=solid]:not([data-controls-badge=inline]) [data-ctl=cart] .ctl-badge{background:var(--ctl-text);color:var(--ctl-paper)}
[data-controls-badge=inline] [data-ctl=cart] .ctl-badge{min-width:1.2em;height:auto;margin-left:-4px;padding:0;background:none;color:inherit;font-size:15px;line-height:1}
[data-controls-badge=circle] [data-ctl=cart] .ctl-badge{position:absolute;top:0;right:-2px}
[data-controls-badge=corner] [data-ctl=cart] .ctl-badge{position:absolute;top:-2px;right:-4px;border-radius:4px 4px 4px 0}
[data-controls-badge=stamp] [data-ctl=cart] .ctl-badge{position:absolute;top:-2px;right:-4px;border-radius:2px;transform:rotate(-8deg);outline:1.5px dashed currentColor;outline-offset:1px}
[data-controls-badge=dot] [data-ctl=cart] .ctl-badge{position:absolute;top:6px;right:4px;width:10px;min-width:0;height:10px;padding:0;overflow:hidden;text-indent:-999px;white-space:nowrap}
[data-controls-badge]:not([data-controls-badge=inline]) [data-ctl=cart] .ctl-badge[data-empty]{width:1px;min-width:0;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* Locked: no record can change these. Important declarations in a layer outrank every unlayered rule, the store's included. */
@layer pagosya-controls-locked{
[data-controls-outline] [data-ctl]{min-width:44px!important;min-height:44px!important;transform:none!important;rotate:none!important;translate:none!important;scale:none!important;clip-path:none!important}
[data-controls-outline] [data-ctl]:focus-visible{outline:3px solid var(--ctl-text)!important;outline-offset:2px!important;box-shadow:0 0 0 2px var(--ctl-paper)!important}
[data-controls-outline] .ctl-sr{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}
}
@media (prefers-reduced-motion:reduce){[data-controls-outline] .ctl-face{transition:none}}
```

- [ ] **Step 5: Wire it into the header.** In `source-header.ts`:

(a) After the `kitText` helper (lines 28-31), add:

```ts
let controlsCss: string | undefined;
/** The controls stylesheet (spec 2026-10-14), read once per process like the header templates; it rides in the header beside
 *  headers.css, so it reaches every page the platform header is drawn on, kit pages included. */
const controlsStyle = () => (controlsCss ??= readFileSync(kitPath('controls.css'), 'utf8').trim());
```

(b) Replace the `return` line at the end of `renderSourceHeader` with:

```ts
  return `<header data-pagosya-header data-shape="${input.shape}" data-purpose="${showcase ? 'showcase' : 'shop'}" class="pyh pyh--${input.shape}"${controls ? controlAttributes(controls) : ''}><style data-pagosya-header-style>${kitText('headers.css')}</style>${controls ? `<style data-pagosya-controls-style>${controlsStyle()}</style>` : ''}${body}</header>`;
```

- [ ] **Step 6: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-header.spec.ts`. Expected: PASS, and the byte-for-byte hash still holds.
  - Run: `cd apps/api && npx jest src/storefront-source/source-header-browser.spec.ts`. Expected: PASS, both the existing tests and the new ones.

- [ ] **Step 7: Commit.**

```bash
git add packages/storefront-kit/kit/controls.css apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-header.spec.ts apps/api/src/storefront-source/source-header-browser.spec.ts
git commit -m "feat(controls): controls.css — one recipe per outline, token colours, upright 44px targets in a locked layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The kit runtime draws the record (`commerce.js`)

**Existing code this touches.** `kit/commerce.js` is generated (see Global Constraints), so every edit goes into a part under `packages/storefront-kit/commerce-src/`:
- The `LOOK` reader (`shared/config-dna.js:71-101`) is the pattern this follows.
- `CART_WORD` (`shared/config-dna.js:124`).
- The cart drawer's close button: ``cartDrawer.innerHTML = `<header class="cart-drawer__header" …><button type="button" data-cart-close aria-label="Cerrar pedido">×</button>…` `` (`cart/drawer.js:24`).
- The card "+": `class="menu-add" type="button" data-add="…" aria-label="Añadir …"><svg viewBox="0 0 24 24" …><path d="M12 5v14M5 12h14"/></svg>` (`catalog/cards.js:174`).
- The cart-line steppers: `<div class="quantity"><button type="button" data-remove=…>−</button><output>…</output><button type="button" data-add=…>+</button></div>` (`cart/render.js:32`).
- The product page's steppers: `data-product-quantity="-1"` and `"1"` (`product/setup.js:121`).
- The count update (`cart/render.js:37`).
- The end of the IIFE (`shared/start.js:11-13`), the last part in `PARTS`.

**Where the runtime code goes:**
- The `CONTROLS` reader stays inside `shared/config-dna.js`, right after the `LOOK` IIFE. It cannot be its own part: `CART_WORD`, at line 124 of the same part, reads `CONTROLS` at load, and a later part would leave `CONTROLS` in its temporal dead zone.
- `decorateControls` and its MutationObserver are a new runtime area, so they become a new part, `commerce-src/controls/decorate.js`.
  - It goes into `PARTS` just before `shared/start.js`, as the last part before the start.
  - At load it reads only `CONTROLS` and `controlIcon` (`shared/config-dna.js`), and no part calls it.
  - The decorated buttons are drawn later, so the observer finds them. The kit's own drawer exists by then (`cart/drawer.js` builds it at load).

**Files:**
- Modify: `packages/storefront-kit/commerce-src/shared/config-dna.js` (the `CONTROLS` reader after the `LOOK` IIFE; `CART_WORD`)
- Modify: `packages/storefront-kit/commerce-src/cart/render.js` (the count update)
- Create: `packages/storefront-kit/commerce-src/controls/decorate.js` (new part)
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (`PARTS`)
- Regenerate: `packages/storefront-kit/kit/commerce.js` (`node packages/storefront-kit/tools/build-commerce.mjs`; never by hand)
- Create (test): `apps/api/src/storefront-source/store-controls-runtime.spec.ts` (jsdom)
- Create (test): `apps/api/src/storefront-source/store-controls-browser.spec.ts` (Chromium)

**Interfaces:**
- Consumes:
  - `config.controls` (the Task 2 record).
  - The header markup contract (Task 4).
  - `controls.css` (Task 5), which the header carries.
- Produces:
  - On `:root`: `data-controls-outline|border|fill|colour|badge` and the `--ctl-corner|notch|tilt|weight` properties.
  - `data-ctl="plus|minus|close"` on the kit's controls, each with an inner `.ctl-face`.
  - `data-empty` on every `[data-cart-count]` with a count of 0.
  - The `[data-ctl-unit]` text, `' producto'` or `' productos'`.
  - `CART_WORD` takes the record's cart word first.

- [ ] **Step 1: Write the failing jsdom test.** Create `apps/api/src/storefront-source/store-controls-runtime.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';
import { CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES, type StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord, SHARED_ICONS } from './store-controls-library';

/** Store controls in the kit runtime (spec 2026-10-14, part 3): attributes, decorated markup, the badge and the cart word. jsdom has
 * no layout; store-controls-browser.spec.ts measures. Harness from source-commerce-surfaces-draw.spec.ts. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const RECORD: StoreControls = { ...libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup'), words: { cart: 'Tu taza', account: 'Mi cuenta' } };
const ITEMS = [{ id: 'taza', name: 'Taza', description: 'Cerámica.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: [] }];
const HEADER = '<header data-pagosya-header><button type="button" class="pyh-cart" data-cart-open data-ctl="cart"><span class="ctl-face"></span><span class="ctl-sr">Carrito, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span></button></header>';
const CUSTOM = '<div class="menu-item" data-custom-product><button type="button" class="menu-add" data-add="taza">Agregar</button></div>';

const opened: any[] = [];
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
// The kit's async load keeps running after a test's last assertion; let it finish before the window closes under it.
afterEach(async () => { await settle(); while (opened.length) opened.pop()!.close(); });
function boot(settings: Record<string, unknown>, options: { cart?: unknown[]; body?: string } = {}) {
  const body = options.body ?? `${HEADER}<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>`;
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Tostadero', items: ITEMS };
  w.PAGOSYA_CONFIG = { slug: 'tostadero', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  return w.document;
}

describe('store controls in the kit runtime (spec 2026-10-14)', () => {
  it('pins the runtime enums to the API', () => {
    const enums = runInNewContext(`(${commerce.match(/const CONTROL_ENUMS = (\{[\s\S]*?\n {2}\});/)![1]})`);
    expect(enums).toEqual({ outline: [...CONTROL_OUTLINES], border: [...CONTROL_BORDERS], fill: [...CONTROL_FILLS], colour: [...CONTROL_COLOURS], badge: [...CONTROL_BADGES] });
  });

  it('sets the record on :root as data-controls-* attributes and --ctl-* numbers', () => {
    const doc = boot({ controls: RECORD });
    const root = doc.documentElement;
    expect(['outline', 'border', 'fill', 'colour', 'badge'].map(name => root.getAttribute(`data-controls-${name}`))).toEqual(['ticket', 'none', 'solid', 'accent', 'stamp']);
    expect([root.style.getPropertyValue('--ctl-corner'), root.style.getPropertyValue('--ctl-notch'), root.style.getPropertyValue('--ctl-tilt'), root.style.getPropertyValue('--ctl-weight')]).toEqual(['4px', '5px', '0deg', '2px']);
  });

  it('draws the card "+", the drawer close and the cart word from the record, and leaves a store-authored card alone', async () => {
    const doc = boot({ controls: RECORD, cartWord: 'Tu pedido' }, { body: `${HEADER}<section data-pagosya-catalog></section>${CUSTOM}<section data-pagosya-cart></section><p data-pagosya-status></p>` });
    await settle();
    const add = doc.querySelector('[data-pagosya-catalog] .menu-add[data-add]');
    expect(add.getAttribute('data-ctl')).toBe('plus');
    expect(add.querySelector('.ctl-face path').getAttribute('d')).toBe(RECORD.icons.plus);
    expect(add.getAttribute('aria-label')).toBe('Añadir Taza');
    const close = doc.querySelector('.cart-drawer__header [data-cart-close]');
    expect(close.getAttribute('data-ctl')).toBe('close');
    expect(close.querySelector('path').getAttribute('d')).toBe(RECORD.icons.close);
    expect(close.getAttribute('aria-label')).toBe('Cerrar pedido');
    expect(doc.querySelector('.cart-drawer__continue').hasAttribute('data-ctl')).toBe(false);
    expect(doc.querySelector('#cart-drawer-title').textContent).toBe('Tu taza');
    const custom = doc.querySelector('[data-custom-product] .menu-add');
    expect(custom.hasAttribute('data-ctl')).toBe(false);
    expect(custom.textContent).toBe('Agregar');
  });

  it('draws the steppers and keeps the badge state and the plain label in step with the count', async () => {
    const doc = boot({ controls: RECORD }, { cart: [{ id: 'taza', quantity: 1 }] });
    await settle();
    const count = doc.querySelector('header [data-cart-count]');
    expect([count.textContent, count.hasAttribute('data-empty'), doc.querySelector('header [data-ctl-unit]').textContent]).toEqual(['1', false, ' producto']);
    expect([...doc.querySelectorAll('.quantity > button')].map((button: any) => [button.getAttribute('data-ctl'), button.querySelector('.ctl-face path')?.getAttribute('d')]))
      .toEqual([['minus', RECORD.icons.minus], ['plus', RECORD.icons.plus]]);
    expect(RECORD.icons.minus).toBe(SHARED_ICONS.minus.solid);
  });

  it.each([
    ['no record', {}],
    ['an unknown outline', { controls: { ...RECORD, shape: { ...RECORD.shape, outline: 'hexagon' } } }],
    ['a tilt out of range', { controls: { ...RECORD, shape: { ...RECORD.shape, tilt: 40 } } }],
  ])('%s: nothing is set and the kit draws its own controls', async (_name, settings) => {
    const doc = boot(settings);
    await settle();
    expect(doc.documentElement.hasAttribute('data-controls-outline')).toBe(false);
    expect([...doc.querySelectorAll('[data-ctl]')].filter((el: any) => !el.closest('[data-pagosya-header]'))).toHaveLength(0);
    expect(doc.querySelector('.cart-drawer__header [data-cart-close]').textContent).toBe('×');
    expect(doc.querySelector('.menu-add[data-add] path').getAttribute('d')).toBe('M12 5v14M5 12h14');
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-runtime.spec.ts`
  - Expected: FAIL. `commerce.match(...)` is null (`Cannot read properties of null (reading '1')`), `data-controls-outline` is null, and the card "+" has no `data-ctl`.

- [ ] **Step 3: Read the record in the runtime.** Edit the parts named below, never `kit/commerce.js`.

(a) In `packages/storefront-kit/commerce-src/shared/config-dna.js`, insert the `CONTROLS` reader after the `LOOK` IIFE ends. The insertion point is right after these lines (`shared/config-dna.js:99-101`):
```js
    if (['tinted', 'banded'].includes(look.surface)) set('surface', look.surface);
    return look;
  })();
```
Insert:

```js
  // Store controls (spec 2026-10-14): one button language per store, chosen and checked by the API (store-controls.ts) and
  // drawn into the platform header at save time. Validated again here; every controls rule keys on data-controls-*, so a
  // store without config.controls renders as before.
  const CONTROL_ENUMS = {
    outline: ['rounded', 'pill', 'square', 'ticket', 'tag', 'sticker', 'tab', 'stamp', 'bracket', 'underline', 'blob'],
    border: ['none', 'hairline', 'solid', 'double', 'dashed', 'offset'],
    fill: ['solid', 'outline', 'ghost', 'inverted'],
    colour: ['accent', 'ink', 'paper'],
    badge: ['dot', 'circle', 'inline', 'corner', 'stamp'],
  };
  const CONTROLS = (() => {
    const record = config.controls && typeof config.controls === 'object' && config.controls.version === 1 ? config.controls : null;
    const shape = record && record.shape && typeof record.shape === 'object' ? record.shape : null;
    if (!shape) return null;
    const values = { outline: shape.outline, border: shape.border, fill: shape.fill, colour: shape.colour, badge: record.badge };
    if (Object.keys(CONTROL_ENUMS).some(name => !CONTROL_ENUMS[name].includes(values[name]))) return null;
    const ranges = { corner: [0, 24, 'px'], notch: [0, 10, 'px'], tilt: [-6, 6, 'deg'], weight: [1, 3, 'px'] };
    if (Object.keys(ranges).some(name => typeof shape[name] !== 'number' || !Number.isFinite(shape[name]) || shape[name] < ranges[name][0] || shape[name] > ranges[name][1])) return null;
    const root = document.documentElement;
    for (const name of Object.keys(CONTROL_ENUMS)) root.setAttribute(`data-controls-${name}`, values[name]);
    for (const name of Object.keys(ranges)) root.style.setProperty(`--ctl-${name}`, `${shape[name]}${ranges[name][2]}`);
    const icons = {};
    const given = record.icons && typeof record.icons === 'object' ? record.icons : {};
    for (const slot of ['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close']) if (typeof given[slot] === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]{1,1500}$/.test(given[slot])) icons[slot] = given[slot];
    const word = typeof record.words?.cart === 'string' ? record.words.cart.trim() : '';
    return { icons, cartWord: /^[\p{L}\p{M}][\p{L}\p{M} '’.-]{0,13}$/u.test(word) ? word : '' };
  })();
  const controlIcon = slot => CONTROLS && CONTROLS.icons[slot] ? `<svg class="ctl-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${CONTROLS.icons[slot]}"/></svg>` : '';
```

(b) In the same part, replace line 124:
```js
  const CART_WORD = typeof config.cartWord === 'string' && /^[\p{L} ]{2,24}$/u.test(config.cartWord.trim()) ? config.cartWord.trim() : '';
```
with:
```js
  // The record's cart word wins (spec 2026-10-14: the store's cart word reaches the header, the drawer and the order panel alike).
  const CART_WORD = [CONTROLS ? CONTROLS.cartWord : '', config.cartWord].map(value => typeof value === 'string' ? value.trim() : '').find(value => /^[\p{L} ]{2,24}$/u.test(value)) || '';
```

(c) In `packages/storefront-kit/commerce-src/cart/render.js`, replace the count update (line 37):
```js
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
```
with:
```js
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
      if (!CONTROLS) return;
      // The badge hides at zero (controls.css); the plain label around it reads «Carrito, 1 producto» / «…, 2 productos».
      el.toggleAttribute('data-empty', count === 0);
      const unit = el.parentElement?.querySelector('[data-ctl-unit]');
      if (unit) unit.textContent = count === 1 ? ' producto' : ' productos';
    });
```

(d) Create the new part `packages/storefront-kit/commerce-src/controls/decorate.js`. It holds whole lines of the runtime's IIFE, like every part: no wrapper, two-space indent, ending with a newline. `shared/start.js` stays as it is.
```js
  // The kit's own small controls take the store's language: the card "+", the quantity steppers and the cart drawer's close
  // button. Their aria-label and data-* hooks never change; only the inside of the button becomes the face. A store-authored
  // card ([data-custom-product]) keeps its own button.
  function decorateControls() {
    if (!CONTROLS) return;
    const face = (button, slot) => {
      button.setAttribute('data-ctl', slot);
      const inner = document.createElement('span');
      inner.className = 'ctl-face';
      inner.innerHTML = controlIcon(slot) || button.innerHTML;
      button.replaceChildren(inner);
    };
    document.querySelectorAll('.menu-item:not([data-custom-product]) .menu-add[data-add]:not([data-ctl])').forEach(button => face(button, 'plus'));
    document.querySelectorAll(':is(.quantity,.product-detail__quantity)>button:not([data-ctl])').forEach(button => face(button, button.matches('[data-remove],[data-product-quantity="-1"]') ? 'minus' : 'plus'));
    document.querySelectorAll('.cart-drawer__header>[data-cart-close]:not([data-ctl])').forEach(button => face(button, 'close'));
  }
  // Cards and cart lines are re-rendered on every change; one microtask after each batch of DOM changes redraws what is new.
  if (CONTROLS && typeof MutationObserver === 'function' && document.body) {
    decorateControls();
    let queued = false;
    // A page that is going away (its document torn down under the observer) must not throw from the microtask.
    new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; try { decorateControls(); } catch { /* the page is going away */ } }); }).observe(document.body, { childList: true, subtree: true });
  }
```

(e) In `packages/storefront-kit/tools/build-commerce.mjs`, add the part to `PARTS` just before the start part:
```js
  'header/platform-header.js',
  'shared/start.js',
];
```
becomes:
```js
  'header/platform-header.js',
  'controls/decorate.js',
  'shared/start.js',
];
```

(f) Regenerate the runtime: `node packages/storefront-kit/tools/build-commerce.mjs`. Expected: `Wrote kit/commerce.js from 32 commerce-src parts.` Never edit `kit/commerce.js` by hand. The specs read it through `kitPath('commerce.js')`.

- [ ] **Step 4: Run the build checks, the jsdom test and the kit parse check, and see them pass.**
  - Run: `node packages/storefront-kit/tools/build-commerce.mjs --check`. Expected: `kit/commerce.js matches 32 commerce-src parts.`
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`. Expected: 3 tests pass: the built file equals its parts, every part is listed once, and the runtime parses as one script.
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-runtime.spec.ts`. Expected: PASS.
  - Run: `node packages/storefront-kit/kit/check-runtimes.mjs`. Expected: every runtime parses.

- [ ] **Step 5: Write the browser test.** Create `apps/api/src/storefront-source/store-controls-browser.spec.ts`:

```ts
/// <reference lib="dom" />
jest.setTimeout(300_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader } from './source-header';
import { CONTROL_FILLS, CONTROL_OUTLINES, type StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';

/** Spec 2026-10-14, part 5 testing: every outline × fill × layout at 1440 and 390, on the header controls, the card "+", the
 * steppers, the drawer close and the badge, with the real kit runtime and stylesheet. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const TOKENS = ':root{--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff}body{margin:0;font-family:Georgia,serif}';
const ITEMS = [
  { id: 'taza', name: 'Taza esmaltada de Cochabamba', description: 'Cerámica.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: [] },
  { id: 'cafe', name: 'Café de altura', description: 'Tostado medio.', amount: 8500, currency: 'BOB', stock: 30, imageUrls: [] },
];
const LAYOUTS: Array<StoreControls['layout']> = [{ cart: 'icon+word', account: 'icon' }, { cart: 'icon', account: 'icon+word' }, { cart: 'word', account: 'word' }];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(controls: StoreControls | undefined, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape: 'shrinking', purpose: 'shop', storeName: 'Tostadero Yungas', links: [{ href: '#tienda', label: 'Tienda' }], search: true, ...(controls ? { controls } : {}) });
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style></head><body>${header}<main><section id="tienda" data-nav-label="Tienda" data-pagosya-catalog></section></main><p data-pagosya-status></p></body></html>`);
  const config = { slug: 'tostadero', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: 'shop', cartWord: 'Tu pedido', ...(controls ? { controls } : {}), data: { storeName: 'Tostadero Yungas', items: ITEMS } };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().waitFor();
  return page;
}
async function openCartWithOne(page: Page) {
  await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click();
  await page.locator('header [data-cart-open]').click();
  await page.locator('.cart-drawer[open]').waitFor();
  await page.waitForTimeout(400);
}
type Fact = { slot: string; where: string; width: number; height: number; upright: boolean; face: boolean; icon: number };
const measure = (page: Page) => page.evaluate((): Fact[] => Array.from(document.querySelectorAll('[data-ctl]')).filter(el => (el as any).checkVisibility()).map(el => {
  const box = el.getBoundingClientRect(), face = el.querySelector('.ctl-face'), icon = el.querySelector('.ctl-icon');
  return { slot: el.getAttribute('data-ctl') ?? '', where: el.closest('[data-pagosya-header]') ? 'header' : el.closest('.cart-drawer') ? 'drawer' : 'card', width: box.width, height: box.height,
    upright: getComputedStyle(el).transform === 'none', face: Boolean(face && face.getBoundingClientRect().width > 0), icon: icon ? icon.getBoundingClientRect().width : 0 };
}));
/** Where the layout says a header control shows its icon; the card "+", the steppers and the close button always do. */
const drawsIcon = (fact: Fact, layout: StoreControls['layout']) => fact.where !== 'header' || (fact.slot === 'cart' ? layout.cart !== 'word' : fact.slot === 'account' || fact.slot === 'search' ? layout.account !== 'word' : true);

describe.each(LAYOUTS)('store controls with cart $cart and account $account (spec 2026-10-14)', layout => {
  it.each([1440, 390])('at %ipx every outline and fill keeps 44px upright targets, faces and icons, and the page width', async width => {
    const controls: StoreControls = { ...libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup'), layout, words: { cart: 'Tu portafolios', account: 'Mi cuenta' } };
    const page = await open(controls, width);
    try {
      await openCartWithOne(page);
      expect(await page.locator('header [data-cart-count]').textContent()).toBe('1');
      for (const outline of CONTROL_OUTLINES) for (const fill of CONTROL_FILLS) {
        await page.evaluate(([o, f]) => { for (const el of [document.documentElement, document.querySelector('header')!]) { el.setAttribute('data-controls-outline', o); el.setAttribute('data-controls-fill', f); } }, [outline, fill]);
        const label = `${outline}/${fill}@${width}`;
        const facts = await measure(page);
        expect({ label, slots: [...new Set(facts.map(fact => `${fact.where}:${fact.slot}`))] })
          .toEqual({ label, slots: expect.arrayContaining(['card:plus', 'drawer:close', 'drawer:minus', 'drawer:plus', 'header:cart']) });
        for (const fact of facts) {
          expect({ label, at: `${fact.where}:${fact.slot}`, ok: fact.width >= 44 && fact.height >= 44 && fact.upright && fact.face, icon: drawsIcon(fact, layout) ? fact.icon >= 16 : true })
            .toEqual({ label, at: `${fact.where}:${fact.slot}`, ok: true, icon: true });
        }
        expect({ label, wide: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) }).toEqual({ label, wide: false });
      }
    } finally { await page.close(); }
  });
});

it('the badge hides at zero and the cart reads «Carrito, N productos» to a screen reader', async () => {
  const page = await open(libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'postage-stamp')!, 'cafe-food', 'cup'), 390);
  try {
    const badgeWidth = () => page.locator('header [data-cart-count]').evaluate(el => el.getBoundingClientRect().width);
    expect(await badgeWidth()).toBeLessThanOrEqual(1);
    expect(await page.getByRole('button', { name: 'Carrito, 0 productos', exact: true }).count()).toBe(1);
    await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click();
    await page.waitForFunction(() => document.querySelector('header [data-cart-count]')?.textContent === '1');
    expect(await badgeWidth()).toBeGreaterThan(4);
    expect(await page.getByRole('button', { name: 'Carrito, 1 producto', exact: true }).count()).toBe(1);
  } finally { await page.close(); }
});

it("a store without a record keeps today's kit controls", async () => {
  const page = await open(undefined, 390);
  try {
    await openCartWithOne(page);
    expect(await page.locator('[data-ctl]').count()).toBe(0);
    expect(await page.locator('.cart-drawer__header [data-cart-close]').textContent()).toBe('×');
    expect(await page.locator('[data-pagosya-catalog] .menu-add[data-add] path').first().getAttribute('d')).toBe('M12 5v14M5 12h14');
  } finally { await page.close(); }
});
```

- [ ] **Step 6: Run the browser test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-browser.spec.ts`
  - Expected: PASS. It takes well under a minute: 6 pages × 44 combinations. The drawer's close button sits in `<header class="cart-drawer__header">`, so a control counts as the platform header's only inside `[data-pagosya-header]`.
  - If a combination fails, the label names it (`outline/fill@width` and `where:slot`). Fix `controls.css`, never the test. A runtime fix goes into its `commerce-src` part, followed by the build.

- [ ] **Step 7: Run the existing kit specs that read `commerce.js`, and see them still pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-commerce-surfaces-draw.spec.ts src/storefront-source/source-commerce-cascade.spec.ts src/storefront-source/source-header-browser.spec.ts --maxWorkers=2`
  - Expected: PASS. None of them sets `config.controls`.

- [ ] **Step 8: Commit.**

```bash
git add packages/storefront-kit/commerce-src/shared/config-dna.js packages/storefront-kit/commerce-src/cart/render.js packages/storefront-kit/commerce-src/controls/decorate.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/store-controls-runtime.spec.ts apps/api/src/storefront-source/store-controls-browser.spec.ts
git commit -m "feat(controls): the kit draws the store's controls — card +, steppers, drawer close, badge and cart word from config.controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Revision N gets the library pick, away from sibling stores

**Where things are today (HEAD 94f7beda):**
- `kind` (the playbook kind, `detectKind`) and `boldAsked` (calm or bold, `useSlot` sets it for a picked style card at line 524) are computed in `generate()` at `source-generation.service.ts:478-479`.
- Every save is built by `assembleSourceSave` (`source-save-assembly.ts:47-137`). It ends by writing or measuring `config.look` (lines 128-136).
  - `generate()` calls it through a one-line `assembleSave` wrapper (`source-generation.service.ts:1252`).
  - The Sep-5 stage, the review closure and the chat kit touch all receive that wrapper.
- `platformHeader` (`source-generation.service.ts:785-791`) draws the header into every page. `assembleSourceSave` gets it through `SaveAssemblyContext.platformHeader`.
- The pick therefore stays in `generate()`. The `assembleSave` wrapper applies it to what `assembleSourceSave` returns, so the look is already final. `source-save-assembly.ts` is not touched.
  - The old plan applied it inside both look returns of `assembleSave`. This is the same thing, because both returns write the look into `config.look`.
  - The `reuse` return writes the look it was given. The measured return writes the measured look. Neither adds any other key.
- Sibling avoidance follows the playbook's same-kind view (ba4848d4): `projects.recentFrameDraws(storeId, now, 40)` is a read-only raw query over each other store's latest revision (`source-projects.service.ts:96-111`), and `recentForKind` (`design-engine/playbook.ts:133`) keeps the newest plus the same-kind ones.

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (`AppConfig` after line 88; values after line 434)
- Modify: `apps/api/src/storefront-source/store-controls-library.ts` (append `RecentControls`, `controlsToAvoid`)
- Modify: `apps/api/src/storefront-source/source-projects.service.ts` (imports; `recentControls` after `recentFrameDraws`, line 111)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (all inside `generate()` except the imports):
  - imports (lines 19, 20);
  - after line 479 (`let boldAsked = …`);
  - after line 733 (`let revisionLook …`);
  - `platformHeader` (lines 785-787);
  - after line 792 (`const headerPreview = …`);
  - the `assembleSave` wrapper (line 1252).
- Not modified: `source-save-assembly.ts` (`assembleSourceSave` and `SaveAssemblyContext`). A `platformHeader` with an optional third parameter still fits `SaveAssemblyContext.platformHeader`.
- Test: `apps/api/src/storefront-source/store-controls-library.spec.ts`; `apps/api/src/storefront-source/source-projects.service.spec.ts`; `apps/api/src/storefront-source/source-generation-review.spec.ts`

**Interfaces:**
- Consumes:
  - `pickLibraryControls`, `controlsKey` and `storePalette` (Task 3).
  - `readControls` and `withControlsConfig` (Task 2).
  - `withSourceHeader({ …, controls })` (Task 4).
  - `withinOr` and `SHOWN_CARDS_TIMEOUT_MS` (`design-engine/style-draws.ts:57-63`, already imported by the service).
- Produces:
  - `AppConfig.yapiControls: boolean`.
  - `type RecentControls = { kind?: string; controls: StoreControls }`.
  - `controlsToAvoid(rows: RecentControls[], kind: string, limit?: number): StoreControls[]`.
  - `SourceProjectsService.recentControls(storeId: string, now?: Date, limit?: number): Promise<RecentControls[]>`.
  - In `generate()`:
    - `controlsOn`, `controlsKind`, `controlsFresh`, `previousControls`, `controlsAvoid`;
    - `platformHeader(files, platformPages, controls?)`;
    - `storeControlsInto<T extends { files: SourceProjectFileDto[] }>(input: T, controls: StoreControls | undefined): T`;
    - `withControls<T extends { files: SourceProjectFileDto[] }>(input: T): T`, applied by the `assembleSave` wrapper to every save.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) In `store-controls-library.spec.ts`, add `controlsToAvoid` to the library import and append:

```ts
describe('controlsToAvoid', () => {
  it('takes the same-kind stores first, then the newest others, six at most, each language once', () => {
    const records = CONTROL_LANGUAGES.map(language => libraryRecord(language, 'cafe-food', 'cup'));
    const rows = [{ kind: 'clothing', controls: records[0] }, { kind: 'cafe-food', controls: records[1] }, { controls: records[2] }, { kind: 'cafe-food', controls: records[1] }, ...records.slice(3, 9).map(controls => ({ kind: 'beauty', controls }))];
    expect(controlsToAvoid(rows, 'cafe-food')).toEqual([records[1], records[0], records[2], records[3], records[4], records[5]]);
  });
});
```

(b) In `source-projects.service.spec.ts`, add `import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';` and append:

```ts
describe('recent controls (spec 2026-10-14 store controls)', () => {
  it("reads the latest other stores' control language and kind, read-only, and drops records that do not sanitize", async () => {
    const { service, prisma } = setup();
    const controls = libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup');
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      { config: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'a', controls })};\n`, draw: JSON.stringify({ kind: 'cafe-food', header: 'side-rail' }) },
      { config: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'b', controls: { ...controls, shape: { ...controls.shape, outline: 'hexagon' } } })};\n`, draw: null },
      { config: null, draw: null },
    ]);
    expect(await service.recentControls('s1', new Date('2026-10-14T12:00:00Z'))).toEqual([{ kind: 'cafe-food', controls }]);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('DISTINCT ON');
    expect(query.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(query.values).toEqual(expect.arrayContaining(['s1', 40, 'config.js', 'frame-draw.json']));
  });
});
```

(c) In `source-generation-review.spec.ts`, add these imports:

```ts
import { controlsKey, pickLibraryControls, storePalette } from './store-controls-library';
```

and append:

```ts
// Spec 2026-10-14 store controls. The fixture home has no <body>, so the platform header has nowhere to claim its slot
// (withSourceHeader's claimSlot); these tests give the author's home a body so the header, and its controls, are drawn.
const homeWithBody = () => files().map(file => file.path === 'index.html' ? { ...file, content: file.content.replace('<!doctype html>', '<!doctype html><html lang="es"><body>') + '</body></html>' } : file);
const authorWithBody = (review: unknown) => async (_url: unknown, init: any) => JSON.parse(init.body).text.format.name === 'storefront_self_review' ? answer(review) : answer({ label: 'Café', files: homeWithBody(), products: [] });

describe('store controls: revision N gets a library language (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const homeOf = (call: any[]): string => call[2].files.find((f: any) => f.path === 'index.html').content;
  const EDIT = (from: string, to: string) => ({ label: 'Texto', edits: [{ path: 'styles.css', search: from, replacement: to }], files: [] });
  const build = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves the seeded library pick in config.js and draws it into the header of revision N', async () => {
    await build();
    const controls = configOf(projects.save.mock.calls[0]).controls;
    expect(controls).toEqual(pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(projects.save.mock.calls[0][2].files) }));
    expect(homeOf(projects.save.mock.calls[0])).toContain(`data-controls-outline="${controls.shape.outline}"`);
    expect(homeOf(projects.save.mock.calls[0])).toContain('<style data-pagosya-controls-style>');
  });

  it('never repeats the outline and cart icon of the latest sibling stores', async () => {
    const alone = pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(files()) });
    projects.recentControls = jest.fn().mockResolvedValue([{ kind: 'general', controls: alone }]);
    await build();
    expect(projects.recentControls).toHaveBeenCalledWith('s1', expect.any(Date), 40);
    expect(controlsKey(configOf(projects.save.mock.calls[0]).controls)).not.toBe(controlsKey(alone));
  });

  it("an edit carries the language; with YAPI_CONTROLS off the next save drops it and draws today's header", async () => {
    await build();
    const first = configOf(projects.save.mock.calls[0]).controls;
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    (globalThis.fetch as unknown as jest.Mock).mockImplementation((async () => answer(EDIT('#222', '#333'))) as any);
    await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Oscurece un poco el texto' }, new SourceRequestBudget(500), []);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(first);
    expect(homeOf(projects.save.mock.calls[1])).toContain(`data-controls-outline="${first.shape.outline}"`);
    config.set('app.yapiControls', false);
    projects.version.mockResolvedValue({ revision: 2, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[1][2], revision: 2 }) });
    (globalThis.fetch as unknown as jest.Mock).mockImplementation((async () => answer(EDIT('#333', '#444'))) as any);
    await service.generate('m1', 's1', { ...dto, revision: 2, instruction: 'Oscurece un poco más el texto' }, new SourceRequestBudget(500), []);
    expect(configOf(projects.save.mock.calls[2]).controls).toBeUndefined();
    expect(homeOf(projects.save.mock.calls[2])).not.toContain('data-controls-');
    expect(homeOf(projects.save.mock.calls[2])).toContain('<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span>');
  });

  it("a redesign picks a new language away from the store's previous one", async () => {
    await build();
    const previous = configOf(projects.save.mock.calls[0]).controls;
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    await service.generate('m1', 's1', { ...dto, revision: 1, instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(25), []);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:1', avoid: [previous], palette: storePalette(projects.save.mock.calls[1][2].files) }));
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts src/storefront-source/source-projects.service.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
  - Expected: FAIL.
    - `controlsToAvoid is not a function`.
    - `service.recentControls is not a function`.
    - In the review spec, `config.controls` is `undefined` (expected the library pick).
  - The existing review tests still pass.

- [ ] **Step 4: The flag.** In `configuration.ts`:
  - After `yapiKitTouch: boolean;` (line 88), add:

```ts
  /** Store controls (spec 2026-10-14): a library control language on new Sep-5 stores and redesigns, drawn into the header and the
   *  kit, carried across edits. Default on; YAPI_CONTROLS=off stops new ones and drops a store's record at its next save. */
  yapiControls: boolean;
```

  - After `yapiKitTouch: process.env.YAPI_KIT_TOUCH !== 'off',` (line 434), add:

```ts
    yapiControls: process.env.YAPI_CONTROLS !== 'off',
```

- [ ] **Step 5: Sibling languages.** Append to `store-controls-library.ts`:

```ts
/** One other store's language, with the business kind its frame draw recorded (SourceProjectsService.recentControls). */
export type RecentControls = { kind?: string; controls: StoreControls };
/** The languages a new store must not repeat (spec part 4): the same-kind stores first, then the newest others, each once. */
export function controlsToAvoid(rows: RecentControls[], kind: string, limit = 6): StoreControls[] {
  const ordered = [...rows.filter(row => row.kind === kind), ...rows.filter(row => row.kind !== kind)];
  const seen = new Set<string>();
  const out: StoreControls[] = [];
  for (const { controls } of ordered) {
    const key = controlsKey(controls);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(controls);
    if (out.length === limit) break;
  }
  return out;
}
```

In `source-projects.service.ts`:
- After line 2 (`import { FRAME_DRAW_FILE, parseFrameDraw, … } from './design-engine/frame-draw';`), add:

```ts
import { readControls } from './store-controls';
import type { RecentControls } from './store-controls-library';
```

- After `recentFrameDraws` (after line 111), add:

```ts
  /** The control languages of recent other stores (spec 2026-10-14 store controls): each store's latest revision in 30 days,
   *  newest first, with the business kind its frame draw recorded. Read-only; a revision without a usable record is left out. */
  async recentControls(storeId: string, now = new Date(), limit = 40): Promise<RecentControls[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ config: string | null; draw: string | null }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (v."storeId") v."storeId", v.revision, v."createdAt"
        FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId} AND v."createdAt" >= ${since}
        ORDER BY v."storeId", v."createdAt" DESC
      ), top AS (SELECT * FROM latest ORDER BY "createdAt" DESC LIMIT ${limit})
      SELECT
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${'config.js'} LIMIT 1) AS config,
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${FRAME_DRAW_FILE} LIMIT 1) AS draw
      FROM top JOIN "StoreSourceVersion" v ON v."storeId" = top."storeId" AND v.revision = top.revision
      ORDER BY top."createdAt" DESC
    `);
    return rows.flatMap(row => {
      const controls = row.config ? readControls([{ path: 'config.js', content: row.config }]) : undefined;
      const kind = parseFrameDraw(row.draw).kind;
      return controls ? [{ ...(kind ? { kind } : {}), controls }] : [];
    });
  }
```

- [ ] **Step 6: The pick in `generate()`.** In `source-generation.service.ts`:

(a) Imports:
  - After line 19 (`import { readConfigFile, sanitizeLook, type StoreLook } from './store-look';`), add:

```ts
import { readControls, withControlsConfig, type StoreControls } from './store-controls';
import { controlsToAvoid, pickLibraryControls, storePalette, type RecentControls } from './store-controls-library';
```

  - Change line 20 (`import { detectKind, pickFamily, playbookDirection, PLAYBOOK, recentForKind } from './design-engine/playbook';`) to:

```ts
import { detectKind, pickFamily, playbookDirection, PLAYBOOK, recentForKind, type PlaybookKind } from './design-engine/playbook';
```

(b) After `let boldAsked = asksForBold(merchantWords);` (line 479), add:

```ts
    // Store controls (spec 2026-10-14): one button language per store, on static stores whose header the platform draws.
    // YAPI_CONTROLS=off stops new records and drops a store's record at its next save, so its header is today's again.
    const controlsOn = this.config.get<boolean>('app.yapiControls') === true && !useNext;
    const controlsKind: PlaybookKind = kind ?? 'general';
    /** A new store or a redesign picks a library language for revision N; an edit carries the store's own. */
    const controlsFresh = controlsOn && creative && sep5Author;
    const previousControls = readControls(previousFiles);
```

(c) After `let revisionLook: StoreLook | undefined;` (line 733, inside the `try`, before `const facts`), add:

```ts
      /** Languages revision N must not repeat (spec 2026-10-14): the latest sibling and same-kind stores', and on a redesign the
       *  store's own. A slow or failed lookup only loses that history. */
      const controlsAvoid: StoreControls[] = controlsFresh ? [...controlsToAvoid(await withinOr(() => this.projects.recentControls(storeId, new Date(), 40), SHOWN_CARDS_TIMEOUT_MS, [] as RecentControls[]), controlsKind), ...(previousControls ? [previousControls] : [])] : [];
```

(d) Replace the first three lines of `platformHeader` (lines 785-787):

```ts
      const platformHeader = (files: SourceProjectFileDto[], platformPages: string[]) => {
        const drawn = parseFrameDraw((frame.file ?? previousFiles.find(file => file.path === FRAME_DRAW_FILE))?.content).header;
        const result = withSourceHeader(files, { shape: drawn, purpose: sitePurpose, action: primaryAction, storeName: data.storeName, logoPath: assetLegend.find(asset => asset.original === (data as { logoUrl?: string | null }).logoUrl)?.path, fact: headerFact(businessInfo, storeData.locations), platformPages, previous: previousFiles, claim: sep5Author });
```

with:

```ts
      const platformHeader = (files: SourceProjectFileDto[], platformPages: string[], controls?: StoreControls) => {
        const drawn = parseFrameDraw((frame.file ?? previousFiles.find(file => file.path === FRAME_DRAW_FILE))?.content).header;
        const result = withSourceHeader(files, { shape: drawn, purpose: sitePurpose, action: primaryAction, storeName: data.storeName, logoPath: assetLegend.find(asset => asset.original === (data as { logoUrl?: string | null }).logoUrl)?.path, fact: headerFact(businessInfo, storeData.locations), platformPages, previous: previousFiles, claim: sep5Author, ...(controls ? { controls } : {}) });
```

(e) After the `const headerPreview = …` line (line 792), add:

```ts
      /** config.controls written (or removed) and every page's platform header drawn again with it. A save that neither has nor
       *  had a record is returned as it is, so stores without controls keep today's bytes. */
      const storeControlsInto = <T extends { files: SourceProjectFileDto[] }>(input: T, controls: StoreControls | undefined): T =>
        !controls && readConfigFile(input.files).controls === undefined ? input : { ...input, files: platformHeader(withControlsConfig(input.files, controls), [], controls) };
```

(f) Replace the `assembleSave` wrapper (line 1252, after `const saveContext: SaveAssemblyContext = { facts, live, platformHeader, agentPolicyChange };`):

```ts
    const assembleSave = (assembleSignal: AbortSignal = signal, lookChoice: LookChoice = {}) => assembleSourceSave(saveContext, assembleSignal, lookChoice);
```

with:

```ts
    // Store controls (spec 2026-10-14): the language this save carries, chosen once the look is known (assembleSourceSave writes
    // config.look last, measured or reused). A new store or a redesign takes the seeded library pick (calm or bold, the measured
    // look, away from its siblings); an edit carries its own.
    const withControls = <T extends { files: SourceProjectFileDto[] }>(input: T): T => storeControlsInto(input, !controlsOn ? undefined
      : controlsFresh ? pickLibraryControls({ kind: controlsKind, mode: boldAsked ? 'bold' : 'calm', look: sanitizeLook(readConfigFile(input.files).look), seed: `${storeId}:${dto.revision}`, avoid: controlsAvoid, words: `${merchantWords}\n${businessInfo}`, palette: storePalette(input.files) })
      : previousControls);
    const assembleSave = async (assembleSignal: AbortSignal = signal, lookChoice: LookChoice = {}) => withControls(await assembleSourceSave(saveContext, assembleSignal, lookChoice));
```

Every caller keeps calling `assembleSave` as before: the N save, `runChatKitTouch`, and the Sep-5 stage's wrapper, which the review closure calls.

- [ ] **Step 7: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts src/storefront-source/source-projects.service.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`. Expected: PASS.
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-header.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`. Expected: PASS. Those specs leave `app.yapiControls` unset, so `storeControlsInto` returns their saves untouched.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/store-controls-library.ts apps/api/src/storefront-source/store-controls-library.spec.ts apps/api/src/storefront-source/source-projects.service.ts apps/api/src/storefront-source/source-projects.service.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(controls): revision N of a Sep-5 build saves a library control language, away from sibling stores; edits carry it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The browser guard (`store-controls-guard.ts`), and revision N passes it

**Reused:**
- `measureHeaderCovers(page, { maxPositions })` and `HEADER_CHECK_WIDTHS = [1440, 390]` (`design-engine/header-clickable.ts:17-27`).
- The `captureHeaderCovers` sandbox pattern (`header-clickable.ts:133-150`).
- The menu Escape and focus check from `source-header-browser.spec.ts:27-30, 40-47`.
- The contrast measurement of `kit-surface-check.ts:39-55`, with colours read through a 1×1 canvas so `oklch()` and `color()` tokens compare too (as the kit runtime's `lookFilters` does, `commerce-src/shared/config-dna.js:103`).

**Files:**
- Create: `apps/api/src/storefront-source/store-controls-guard.ts`
- Create (test): `apps/api/src/storefront-source/store-controls-guard.spec.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (imports; a closure in `generate()` after `storeControlsInto`; the N save at lines 1260-1261). The N save is still in `generate()`; no split module changes in this task.
- Modify (test): `apps/api/src/storefront-source/source-generation-review.spec.ts` (a module mock at the top; a new `describe`)

**Interfaces:**
- Consumes:
  - The header markup contract (Task 4), `controls.css` (Task 5) and the kit runtime (Task 6).
  - `libraryIconFallback` (Task 3).
  - `readControls` (Task 2).
- Produces:
  - Constants: `CONTROLS_GUARD_TIMEOUT_MS = 30_000`, `MIN_WORD_CONTRAST = 4.5`, `MIN_ICON_CONTRAST = 3`, `MIN_ICON_PIXELS = 24`.
  - Types:
    - `type ControlCheck = 'visible' | 'size' | 'covered' | 'overflow' | 'menu' | 'icon' | 'contrast'`
    - `type ControlFailure = { width: number; slot: string; check: ControlCheck; detail: string }`
  - `readControlsInPage(): { overflow: boolean; controls: ControlReading[] }` (in-page).
  - `inspectControlsPage(page: Page, width: number): Promise<ControlFailure[]>`.
  - `judgeControls(failures: ControlFailure[]): { drop: boolean; iconSlots: IconSlot[]; reasons: string[] }`.
  - `guardControlsOnSnapshot(snapshot: SourceProjectSnapshot, options?: { signal?: AbortSignal }): Promise<ControlFailure[]>`.
  - In `generate()`: `keepGuardedControls<T>(input: T, fallback: StoreControls | undefined, source: 'library' | 'yapi' | 'request', base: AbortSignal): Promise<{ input: T; kept: boolean }>`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing guard test.** Create `apps/api/src/storefront-source/store-controls-guard.spec.ts`:

```ts
/// <reference lib="dom" />
jest.setTimeout(180_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader } from './source-header';
import type { StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';
import { inspectControlsPage, judgeControls, type ControlFailure } from './store-controls-guard';

/** The controls guard (spec 2026-10-14, part 5) on the real header, stylesheet and kit runtime. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LIGHT = '--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff';
const DARK = '--store-background:#16120f;--store-foreground:#f4ede4;--store-accent:#e0b070;--store-accent-foreground:#16120f';
const BASE: StoreControls = libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup');

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function inspect(controls: StoreControls, width: number, options: { tokens?: string; body?: string } = {}): Promise<ControlFailure[]> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  try {
    const header = renderSourceHeader({ shape: 'shrinking', purpose: 'shop', storeName: 'Tostadero', links: [{ href: '#a', label: 'Inicio' }], search: true, controls });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${options.tokens ?? LIGHT}}body{margin:0;background:var(--store-background);color:var(--store-foreground)}section{min-height:900px}</style></head><body>${header}<main><section id="a" data-nav-label="Inicio"></section></main>${options.body ?? ''}<p data-pagosya-status></p></body></html>`);
    await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 't', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: 'shop', controls, data: { storeName: 'Tostadero', items: [] } })};` });
    await page.addScriptTag({ content: commerce });
    return await inspectControlsPage(page, width);
  } finally { await page.close(); }
}

describe('the store controls guard (spec 2026-10-14, part 5)', () => {
  it.each([1440, 390])('passes a library language on a light store and an ink language on a dark store at %ipx', async width => {
    expect(await inspect(BASE, width)).toEqual([]);
    expect(await inspect({ ...BASE, shape: { ...BASE.shape, colour: 'ink', fill: 'ghost' } }, width, { tokens: DARK })).toEqual([]);
  });

  it('drops a paper outline on a paper header: its word and icon cannot be read', async () => {
    const failures = await inspect({ ...BASE, shape: { ...BASE.shape, fill: 'outline', colour: 'paper', border: 'solid' } }, 390);
    expect(failures.some(failure => failure.slot === 'cart' && failure.check === 'contrast')).toBe(true);
    expect(judgeControls(failures).drop).toBe(true);
  });

  it('fails only the icon of a cart drawn as a 2px dot (valid path data, too small to read)', async () => {
    const failures = await inspect({ ...BASE, icons: { ...BASE.icons, cart: 'M11 11h2v2h-2z' } }, 1440);
    expect(failures).toEqual([expect.objectContaining({ slot: 'cart', check: 'icon' })]);
    expect(judgeControls(failures)).toMatchObject({ drop: false, iconSlots: ['cart'] });
  });

  it('drops a record whose controls something else covers', async () => {
    const failures = await inspect(BASE, 390, { body: '<div style="position:fixed;inset:0 0 auto 0;height:120px;z-index:2147483646;background:rgb(0 0 0 / .01)"></div>' });
    expect(failures.some(failure => failure.check === 'covered')).toBe(true);
    expect(judgeControls(failures).drop).toBe(true);
  });
});

describe('judgeControls', () => {
  it('keeps the record for icon failures only and names each failing slot once', () => {
    expect(judgeControls([{ width: 390, slot: 'cart', check: 'icon', detail: 'x' }, { width: 1440, slot: 'cart', check: 'icon', detail: 'x' }, { width: 390, slot: 'menu', check: 'icon', detail: 'x' }]))
      .toEqual({ drop: false, iconSlots: ['cart', 'menu'], reasons: ['390px cart: icon (x)', '1440px cart: icon (x)', '390px menu: icon (x)'] });
    expect(judgeControls([{ width: 390, slot: 'cart', check: 'size', detail: '40x40px, needs 44x44' }]).drop).toBe(true);
    expect(judgeControls([])).toEqual({ drop: false, iconSlots: [], reasons: [] });
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-guard.spec.ts`
  - Expected: FAIL, `Cannot find module './store-controls-guard'`.

- [ ] **Step 4: Write the guard.** Create `apps/api/src/storefront-source/store-controls-guard.ts`:

```ts
/// <reference lib="dom" />
/**
 * The store controls guard (spec 2026-10-14, part 5): a saved candidate's header controls in a real browser at 1440 and 390.
 * Every control must be visible where the header shows it, at least 44×44, uncovered, inside the page width; the menu keeps
 * its Escape and focus behaviour; every icon paints; words read at 4.5:1 and icons and borders at 3:1 against the measured
 * background. A failing icon costs only its slot (the caller puts the library icon there); anything else drops the record.
 * Never calls a model and never writes.
 */
import type { Page } from 'playwright';
import { HEADER_CHECK_WIDTHS, measureHeaderCovers } from './design-engine/header-clickable';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { sourceVisualState } from './source-visual-state';
import { ICON_SLOTS, type IconSlot } from './store-controls';
import type { SourceProjectSnapshot } from './source-project';

export const CONTROLS_GUARD_TIMEOUT_MS = 30_000;
export const MIN_WORD_CONTRAST = 4.5;
export const MIN_ICON_CONTRAST = 3;
/** Painted pixels an icon needs on a 48×48 raster of its 24×24 box (about 1%): less is no icon a shopper can read. */
export const MIN_ICON_PIXELS = 24;
export type ControlCheck = 'visible' | 'size' | 'covered' | 'overflow' | 'menu' | 'icon' | 'contrast';
export type ControlFailure = { width: number; slot: string; check: ControlCheck; detail: string };
export type ControlReading = { slot: string; label: string; visible: boolean; width: number; height: number; iconPixels: number | null; iconBox: number | null; wordRatio: number | null; iconRatio: number | null; borderRatio: number | null };

/** Runs in the page (serialised by page.evaluate): every control the platform header draws for the record, measured. */
export function readControlsInPage(): { overflow: boolean; controls: ControlReading[] } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true })!;
  // Any CSS colour (rgb, oklch, color()) drawn onto a 1×1 canvas reads back as sRGB channels.
  const rgba = (color: string): number[] => {
    paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = color; paint.fillRect(0, 0, 1, 1);
    const d = paint.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const pageColour = [document.body, document.documentElement].map(el => rgba(getComputedStyle(el).backgroundColor)).find(c => c[3] >= 0.99) ?? [255, 255, 255, 1];
  const background = (start: Element | null): number[] => { for (let node = start; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] >= 0.99) return c; } return pageColour; };
  const luminance = (c: number[]) => [c[0], c[1], c[2]].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (top: number[], base: number[]) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
  const shown = (el: Element) => (el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 2;
  const header = document.querySelector('header[data-pagosya-header]');
  const controls: ControlReading[] = [];
  for (const el of Array.from(header?.querySelectorAll('[data-ctl]') ?? [])) {
    const box = el.getBoundingClientRect();
    const face = el.querySelector('.ctl-face') ?? el;
    const faceBg = background(face);
    const word = Array.from(face.querySelectorAll('.ctl-word')).find(shown);
    const icon = face.querySelector('.ctl-icon');
    const path = icon?.querySelector('path');
    let iconPixels: number | null = null;
    if (path && icon && shown(icon)) {
      const art = document.createElement('canvas');
      art.width = art.height = 48;
      const pen = art.getContext('2d', { willReadFrequently: true })!;
      pen.scale(2, 2);
      pen.fill(new Path2D(path.getAttribute('d') ?? ''), 'evenodd');
      const data = pen.getImageData(0, 0, 48, 48).data;
      iconPixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) iconPixels++;
    }
    const style = getComputedStyle(face);
    const bordered = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
    // The same label measureHeaderCovers gives the control, so its covers can be told apart from the page's own.
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('[data-cart-count]').forEach(count => count.remove());
    controls.push({
      slot: el.getAttribute('data-ctl') ?? '',
      label: (el.getAttribute('aria-label') || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      visible: shown(el), width: box.width, height: box.height, iconPixels,
      iconBox: icon && shown(icon) ? Math.min(icon.getBoundingClientRect().width, icon.getBoundingClientRect().height) : null,
      wordRatio: word ? ratio(over(rgba(getComputedStyle(word).color), faceBg), faceBg) : null,
      iconRatio: icon && shown(icon) ? ratio(over(rgba(getComputedStyle(icon).color), faceBg), faceBg) : null,
      borderRatio: bordered ? ratio(over(rgba(style.borderTopColor), background(el.parentElement)), background(el.parentElement)) : null,
    });
  }
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, controls };
}

function menuStateInPage() {
  const menu = document.querySelector('header[data-pagosya-header] [data-pagosya-header-menu]') as HTMLElement | null;
  return { open: Boolean(menu && !menu.hidden), focusInside: Boolean(document.activeElement?.closest('[data-pagosya-header-menu]')), focusOnToggle: Boolean(document.activeElement?.matches('[data-pagosya-header-toggle]')), overflow: document.documentElement.style.overflow };
}

/** Every check on one loaded page at one width. */
export async function inspectControlsPage(page: Page, width: number): Promise<ControlFailure[]> {
  const failures: ControlFailure[] = [];
  const add = (slot: string, check: ControlCheck, detail: string) => { failures.push({ width, slot, check, detail }); };
  const reading = await page.evaluate(readControlsInPage);
  if (reading.overflow) add('page', 'overflow', 'the page scrolls sideways');
  // The cart (a shop's) is on every bar; on a phone every shape opens through its menu button.
  const required = new Set(['cart', ...(width <= 860 ? ['menu'] : [])]);
  for (const control of reading.controls) {
    if (!control.visible) { if (required.has(control.slot)) add(control.slot, 'visible', 'not visible'); continue; }
    if (control.width < 43.5 || control.height < 43.5) add(control.slot, 'size', `${Math.round(control.width)}x${Math.round(control.height)}px, needs 44x44`);
    if (control.iconPixels !== null && (control.iconPixels < MIN_ICON_PIXELS || (control.iconBox ?? 0) < 12)) add(control.slot, 'icon', `the icon paints ${control.iconPixels} pixels`);
    if (control.wordRatio !== null && control.wordRatio < MIN_WORD_CONTRAST) add(control.slot, 'contrast', `word ${control.wordRatio.toFixed(2)}:1, needs ${MIN_WORD_CONTRAST}:1`);
    if (control.iconRatio !== null && control.iconRatio < MIN_ICON_CONTRAST) add(control.slot, 'contrast', `icon ${control.iconRatio.toFixed(2)}:1, needs ${MIN_ICON_CONTRAST}:1`);
    if (control.borderRatio !== null && control.borderRatio < MIN_ICON_CONTRAST) add(control.slot, 'contrast', `border ${control.borderRatio.toFixed(2)}:1, needs ${MIN_ICON_CONTRAST}:1`);
  }
  const labels = new Map(reading.controls.filter(control => control.visible).map(control => [control.label, control.slot]));
  for (const cover of await measureHeaderCovers(page, { maxPositions: 2 })) {
    const slot = labels.get(cover.control);
    if (slot) add(slot, 'covered', `covered by ${cover.cover}`);
  }
  const toggle = page.locator('header[data-pagosya-header] [data-pagosya-header-toggle]').first();
  if (await toggle.isVisible().catch(() => false)) {
    const before = await page.evaluate(menuStateInPage);
    try {
      await toggle.click({ timeout: 3000 });
      const opened = await page.evaluate(menuStateInPage);
      await page.keyboard.press('Escape');
      const closed = await page.evaluate(menuStateInPage);
      if (!opened.open || !opened.focusInside) add('menu', 'menu', 'the menu did not open with the focus inside');
      if (closed.open || !closed.focusOnToggle || closed.overflow !== before.overflow) add('menu', 'menu', 'Escape did not close the menu and give the focus back');
    } catch { add('menu', 'menu', 'the menu button could not be pressed'); }
  }
  return failures;
}

/** The outcome: icon failures name their slots (each once) and keep the record; any other failure drops it. */
export function judgeControls(failures: ControlFailure[]): { drop: boolean; iconSlots: IconSlot[]; reasons: string[] } {
  const iconSlots = [...new Set(failures.filter(failure => failure.check === 'icon').map(failure => failure.slot))]
    .filter((slot): slot is IconSlot => (ICON_SLOTS as readonly string[]).includes(slot));
  return { drop: failures.some(failure => failure.check !== 'icon'), iconSlots, reasons: failures.map(failure => `${failure.width}px ${failure.slot}: ${failure.check} (${failure.detail})`) };
}

/** index.html of a saved candidate in its own offline sandbox, at desktop and phone widths (captureHeaderCovers' pattern). */
export async function guardControlsOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<ControlFailure[]> {
  const runtime = await currentSourceRuntime(snapshot);
  const failures: ControlFailure[] = [];
  await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, options.signal, false, async context => {
    for (const width of HEADER_CHECK_WIDTHS) {
      options.signal?.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      page.setDefaultTimeout(7000);
      try {
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForTimeout(300);
        failures.push(...await inspectControlsPage(page, width));
      } finally { await page.close(); }
    }
  }, 'no-preference');
  return failures;
}
```

- [ ] **Step 5: Run the guard test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-guard.spec.ts`
  - Expected: PASS.

- [ ] **Step 6: Write the failing service test.** At the top of `source-generation-review.spec.ts`, after the existing `jest.mock('./design-engine/header-clickable', …)` line, add:

```ts
// The controls guard launches Chromium; these tests exercise what the service does with its verdict.
jest.mock('./store-controls-guard', () => ({ ...jest.requireActual('./store-controls-guard'), guardControlsOnSnapshot: jest.fn().mockResolvedValue([]) }));
import { guardControlsOnSnapshot } from './store-controls-guard';
import { CART_ICONS } from './store-controls-library';
```

Then append:

```ts
describe('store controls: the guard on revision N (spec 2026-10-14, part 5)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const homeOf = (call: any[]): string => call[2].files.find((f: any) => f.path === 'index.html').content;
  const build = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  const picked = () => pickLibraryControls({ kind: 'general', mode: 'calm', seed: 's1:0', palette: storePalette(projects.save.mock.calls[0][2].files) });
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("saves no record and today's header when the library language fails the guard", async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 390, slot: 'cart', check: 'contrast', detail: 'word 1.20:1, needs 4.5:1' }]);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toBeUndefined();
    expect(homeOf(projects.save.mock.calls[0])).not.toContain('data-controls-');
    expect(log.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_dropped"') && line.includes('"source":"library"'))).toBe(true);
  });

  it('an icon that fails the guard takes the line drawing of the library icon for that slot only', async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 1440, slot: 'cart', check: 'icon', detail: 'the icon paints 0 pixels' }]);
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toEqual({ ...picked(), icons: { ...picked().icons, cart: CART_ICONS.bag.line } });
  });

  it('keeps the library language when the guard itself cannot run', async () => {
    (guardControlsOnSnapshot as jest.Mock).mockRejectedValueOnce(new Error('chromium crashed'));
    await build();
    expect(configOf(projects.save.mock.calls[0]).controls).toEqual(picked());
  });
});
```

- [ ] **Step 7: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts`
  - Expected: FAIL. The first test still saves the library record, and the guard mock is never called.

- [ ] **Step 8: Guard the save in `generate()`.** In `source-generation.service.ts`:

(a) Imports, after the `store-controls-library` import added in Task 7 (change it to include `libraryIconFallback`):

```ts
import { controlsToAvoid, libraryIconFallback, pickLibraryControls, storePalette, type RecentControls } from './store-controls-library';
import { CONTROLS_GUARD_TIMEOUT_MS, guardControlsOnSnapshot, judgeControls } from './store-controls-guard';
```

(b) After `storeControlsInto` (Task 7 (e)), add:

```ts
      /** The browser guard (spec 2026-10-14, part 5) on a candidate save. A failing icon takes the library icon for its slot; any
       *  other failure puts `fallback` back (revision N's language, or none). A guard that cannot run keeps a library language
       *  and drops YAPI's. Never fails the save; logs controls_saved or controls_dropped with the reasons. */
      const keepGuardedControls = async <T extends { files: SourceProjectFileDto[] }>(input: T, fallback: StoreControls | undefined, source: 'library' | 'yapi' | 'request', base: AbortSignal): Promise<{ input: T; kept: boolean }> => {
        const controls = readControls(input.files);
        if (!controls) return { input, kept: false };
        const guardSignal = AbortSignal.any([base, AbortSignal.timeout(CONTROLS_GUARD_TIMEOUT_MS)]);
        let verdict: ReturnType<typeof judgeControls>;
        try {
          verdict = judgeControls(await guardControlsOnSnapshot({ brief: dto.brief, files: input.files } as unknown as SourceProjectSnapshot, { signal: guardSignal }));
        } catch (error) {
          base.throwIfAborted();
          this.logger.warn(JSON.stringify({ event: 'controls_guard_failed', generationId: run.id, source, reason: guardSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
          return source === 'library' ? { input, kept: true } : { input: storeControlsInto(input, fallback), kept: false };
        }
        if (verdict.drop) {
          this.logger.log(JSON.stringify({ event: 'controls_dropped', generationId: run.id, source, reasons: verdict.reasons.slice(0, 12) }));
          return { input: storeControlsInto(input, fallback), kept: false };
        }
        const fallbackIcon = libraryIconFallback(controlsKind, merchantWords);
        const kept: StoreControls = verdict.iconSlots.length ? { ...controls, icons: { ...controls.icons, ...Object.fromEntries(verdict.iconSlots.map(slot => [slot, fallbackIcon(slot)])) } } : controls;
        this.logger.log(JSON.stringify({ event: 'controls_saved', generationId: run.id, source, outline: kept.shape.outline, iconFallbacks: verdict.iconSlots }));
        return { input: verdict.iconSlots.length ? storeControlsInto(input, kept) : input, kept: true };
      };
```

(c) Replace the N save (lines 1260-1261 at HEAD, after `await progress?.('saving');`):

```ts
    const saveInput = await assembleSave();
    revisionLook = sanitizeLook(readConfigFile(saveInput.files).look);
```

with:

```ts
    let saveInput = await assembleSave();
    // Revision N's library language passes the same browser guard as YAPI's (spec 2026-10-14, part 5): a failing one is not saved
    // (today's header), a failing icon takes the library line icon, and a guard that cannot run keeps the language.
    if (controlsFresh && readControls(saveInput.files)) saveInput = (await keepGuardedControls(saveInput, undefined, 'library', signal)).input;
    revisionLook = sanitizeLook(readConfigFile(saveInput.files).look);
```

- [ ] **Step 9: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts src/storefront-source/store-controls-guard.spec.ts --maxWorkers=2`
  - Expected: PASS. The Task 7 tests still pass: the mocked guard returns `[]`.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/storefront-source/store-controls-guard.ts apps/api/src/storefront-source/store-controls-guard.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(controls): a browser guard for the store's controls — 44px, uncovered, readable, painted icons; N's library pick passes it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: YAPI designs the controls in the review stage (N+1)

**Pattern followed:** the kit touch in the review stage.
- `touchCall` (`source-sep5-call.ts:56-63`, built by `sep5Caller`) gives a metered `sep5Call` phase, billed only through `used()`.
- `KIT_TOUCH_SCHEMA` (`kit-touch.ts:26`) is the strict JSON schema.
- `touchBudgetMs` (`kit-touch.ts:147`) is spied in tests to shorten the deadline. The spy works because `source-sep5-review.ts` calls it through the module.
- The touch's notes go into `reviewMessage`.
- The controls call differs in one way: it starts at the top of the review closure, beside the review call, because the ChatGPT bridge serves about two calls at once (spec part 4).

**Where the review stage lives now (HEAD 94f7beda):**
- `generate()` builds `{ sep5Call, touchCall } = sep5Caller(…)` (`source-generation.service.ts:918`). It hands them, `facts`, `live` and an `assembleSave` wrapper to `runSep5AuthorStage` (`source-sep5-stage.ts`, called at lines 922-923).
- The stage arms the review at `source-sep5-stage.ts:93-97` (`kitTouchOn`, then `if (sep5SelfReview || kitTouchOn)`). `live.sep5Review = createSep5Review({ … })`.
- The review closure is `createSep5Review` in `source-sep5-review.ts:38-103`. It reads `live.revisionLook` and calls the `AssembleSave` it was given (type at line 20).
- The controls job needs values that only `generate()` has: `controlsKind`, `controlsAvoid`, `previousControls`, `merchantWords`, `redesign`, `revisionFiles`, `storeControlsInto` and `keepGuardedControls`.
  - So `generate()` builds `designReviewControls` and a small `ReviewControls` object (`{ design, keep }`).
  - It passes them to the stage as `controls`. The stage passes them to the review.
  - Revision N's language reaches the review as `live.revisionControls`, beside `live.revisionLook`.
  - `assembleSave` takes a third `controlsChoice` argument, so the review can save N's language instead of a fresh pick.

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (`yapiControlsDesign`)
- Create: `apps/api/src/storefront-source/store-controls-design.ts`
- Create (test): `apps/api/src/storefront-source/store-controls-design.spec.ts`
- Modify: `apps/api/src/storefront-source/store-controls-guard.ts` (append `captureControlsShots`)
- Modify: `apps/api/src/storefront-source/source-design-planner.ts:16` (the `DesignPlanningAttempt` phase union)
- Modify: `apps/api/src/storefront-source/source-generation-types.ts` (the `SourceGenerationAttempt` phase union, line 38; `GenerationLive.revisionControls` after `revisionLook`, line 85)
- Modify: `apps/api/src/storefront-source/source-sep5-call.ts` (imports; the `sep5Call` phase union, line 27; `controlsCall` after `touchCall`, lines 56-64)
- Modify: `apps/api/src/storefront-source/source-sep5-stage.ts` (imports; `Sep5StageContext`; the destructuring, line 30; the review arming, lines 93-97)
- Modify: `apps/api/src/storefront-source/source-sep5-review.ts` (imports; `AssembleSave`, line 20; `ReviewControls`; `Sep5ReviewContext`; the closure's start, lines 42-45, and end, lines 99-102)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (in `generate()`):
  - imports;
  - the flags block from Task 7;
  - after the `controlsAvoid` line from Task 7;
  - the `live` getters (after `get revisionLook()`, line 756);
  - the `sep5Caller` line (918), then `designReviewControls` and `reviewControls` after it;
  - the `runSep5AuthorStage` call (lines 922-923);
  - the `withControls`/`assembleSave` wrapper from Task 7;
  - after the N save.
- Not modified: `source-save-assembly.ts`, `source-review-runner.ts`.
- Modify (test): `apps/api/src/storefront-source/source-generation-review.spec.ts`

**Interfaces:**
- Consumes:
  - `sanitizeControlsReport` (Task 2).
  - `pickLibraryControls` and `libraryIconFallback` (Task 3).
  - `keepGuardedControls` and `storeControlsInto` (Tasks 7-8).
  - `sourceResponseJson` (`source-response.ts:5`).
  - `PLAYBOOK` (`design-engine/playbook.ts`).
- Produces:
  - Config: `AppConfig.yapiControlsDesign: boolean`.
  - Constants: `CONTROLS_TIMEOUT_MS = 60_000`, `CONTROLS_MAX_OUTPUT_TOKENS = 4_000`, `controlsDeadlineMs(): number`, `CONTROLS_SCHEMA`.
  - Prompt helpers: `storeTokens(files): string` and `controlsPrompt(input): string`.
  - The call: `type ControlsDesign = { controls: StoreControls; note: string; used: () => void; replacedIcons: IconSlot[] }` and `runControlsDesign(deps: ControlsDesignDeps): Promise<ControlsDesign | null>`.
  - Screenshots: `captureControlsShots(snapshot, signal): Promise<ModelImage[]>` (guard module).
  - The attempt phase `'controls'` (`SourceGenerationAttempt`, `DesignPlanningAttempt` and `sep5Call`).
  - `sep5Caller(…).controlsCall(run: { signal; attempts }) => (text, attached) => Promise<{ body: unknown; used: () => void }>` (`source-sep5-call.ts`).
  - In `source-sep5-review.ts`:
    - `type ReviewControls = { design(review): Promise<ControlsDesign | null>; keep(input, designed, signal): Promise<{ input; kept: boolean }> }`;
    - `AssembleSave` gains a third `controlsChoice?: { use?: StoreControls }` argument;
    - `Sep5ReviewContext.controls?: ReviewControls`.
  - `Sep5StageContext.controls?: ReviewControls` (`source-sep5-stage.ts`).
  - `GenerationLive.revisionControls: StoreControls | undefined` (read-only).
  - In `generate()`: `controlsDesignOn`, `revisionControls`, `revisionFiles`, `designReviewControls` and `reviewControls`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing unit test.** Create `apps/api/src/storefront-source/store-controls-design.spec.ts`:

```ts
import type { StoreControls } from './store-controls';
import { CART_ICONS, SHARED_ICONS } from './store-controls-library';
import { CONTROLS_SCHEMA, runControlsDesign, storeTokens } from './store-controls-design';

const ANSWER = {
  shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
  layout: { cart: 'icon+word', account: 'icon' },
  icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: 'M0 0L30 30', minus: '', close: '' },
  words: { cart: 'Tu taza', account: '' }, badge: 'stamp',
  note: 'Diseñé los botones como sellos, con una taza para el carrito.',
};
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const files = [
  { path: 'brand.css', content: ':root{--brand-background:#f7f4ef;--brand-accent:#2f4bb8}' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"look":{"version":1,"edge":"offset"}};\n' },
];
const deps = (body: unknown, over: Record<string, unknown> = {}) => {
  const used = jest.fn();
  const call = jest.fn(async (_text: string, _images: unknown[]) => ({ body, used }));
  return { used, call, deps: { files, brief: { businessType: 'Cafetería' }, storeName: 'Café Remanso', kind: 'cafe-food' as const, products: ['Latte', 'Torta de chocolate'], avoid: [] as StoreControls[], signal: new AbortController().signal, call, fallbackIcon: () => SHARED_ICONS.plus.line, capture: jest.fn(async () => []), ...over } };
};

describe('runControlsDesign (spec 2026-10-14, part 4)', () => {
  it("turns the answer into a sanitized YAPI record, the library icon in place of a bad one, without billing it itself", async () => {
    const { deps: input, used } = deps(reply(ANSWER));
    const designed = await runControlsDesign(input);
    expect(designed!.controls).toEqual({ version: 1, shape: ANSWER.shape, layout: ANSWER.layout, icons: { cart: CART_ICONS.cup.solid, plus: SHARED_ICONS.plus.line }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' });
    expect(designed!.replacedIcons).toEqual(['plus']);
    expect(designed!.note).toBe(ANSWER.note);
    expect(used).not.toHaveBeenCalled();
  });

  it.each([
    ['an answer that is not JSON', reply('esto no es JSON')],
    ['an unknown outline', reply({ ...ANSWER, shape: { ...ANSWER.shape, outline: 'hexagon' } })],
    ['an incomplete answer', { status: 'incomplete' }],
  ])('returns null for %s', async (_name, body) => {
    expect(await runControlsDesign(deps(body).deps)).toBeNull();
  });

  it("tells the model the business, tokens, look, languages not to repeat, the redesign, the store's current controls and the merchant's words", async () => {
    const sibling = { ...(await runControlsDesign(deps(reply(ANSWER)).deps))!.controls, shape: { ...ANSWER.shape, outline: 'ticket' as const } };
    const { deps: input, call } = deps(reply(ANSWER), { avoid: [sibling], previous: sibling, current: sibling, instruction: 'haz el carrito como una taza' });
    await runControlsDesign(input);
    const text = call.mock.calls[0][0];
    for (const part of ['«Café Remanso»', 'café and food', 'Latte', 'background: #f7f4ef', '"edge":"offset"', 'do not repeat', '"outline":"ticket"', 'move away', 'current controls', '«haz el carrito como una taza»', 'fill-rule evenodd', '1,500 characters', '1-14 letters']) {
      expect({ part, found: text.includes(part) }).toEqual({ part, found: true });
    }
  });

  it('asks for strict JSON with every slot', () => {
    expect(CONTROLS_SCHEMA.required).toEqual(['shape', 'layout', 'icons', 'words', 'badge', 'note']);
    expect(CONTROLS_SCHEMA.properties.icons.required).toEqual(['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close']);
  });

  it('reads the store tokens from brand.css and styles.css', () => {
    expect(storeTokens(files)).toBe('background: #f7f4ef; accent: #2f4bb8');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-design.spec.ts`
  - Expected: FAIL, `Cannot find module './store-controls-design'`.

- [ ] **Step 4: Write the call.**

(a) Append to `store-controls-guard.ts`:

```ts
export type ModelImage = { type: 'input_image'; image_url: string; detail: 'auto' };
/** The home page with its header in view, at 1440 and 390, for the controls call (spec part 4). */
export async function captureControlsShots(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<ModelImage[]> {
  const runtime = await currentSourceRuntime(snapshot);
  const shots: ModelImage[] = [];
  await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, signal, false, async context => {
    for (const width of HEADER_CHECK_WIDTHS) {
      signal.throwIfAborted();
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      page.setDefaultTimeout(7000);
      try {
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForTimeout(300);
        const image = await page.screenshot({ type: 'jpeg', quality: 70, animations: 'disabled', timeout: 7000 });
        shots.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${image.toString('base64')}`, detail: 'auto' });
      } finally { await page.close(); }
    }
  }, 'no-preference');
  return shots;
}
```

(b) Create `apps/api/src/storefront-source/store-controls-design.ts`:

```ts
/**
 * YAPI designs the store's controls (spec 2026-10-14, part 4): one dedicated call that returns the controls record as strict JSON
 * plus one short Spanish note. It runs beside the background review call (revision N+1) and again on a chat request about the
 * controls. The answer is sanitized here; the caller checks it in a browser (store-controls-guard.ts). A timeout, an unusable
 * answer or a failing guard keeps the store's library language: this never fails a build.
 */
import { PLAYBOOK, type PlaybookKind } from './design-engine/playbook';
import { sourceResponseJson } from './source-response';
import { captureControlsShots, type ModelImage } from './store-controls-guard';
import { ACCOUNT_LAYOUTS, CART_LAYOUTS, CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES, ICON_SLOTS, sanitizeControlsReport, type IconSlot, type StoreControls } from './store-controls';
import { pickLibraryControls } from './store-controls-library';
import { readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const CONTROLS_TIMEOUT_MS = 60_000;
export const CONTROLS_MAX_OUTPUT_TOKENS = 4_000;
/** The controls call's own deadline (spec: about 60 s, like the kit touch); a function so a test can shorten it. */
export function controlsDeadlineMs(): number { return CONTROLS_TIMEOUT_MS; }

export const CONTROLS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['shape', 'layout', 'icons', 'words', 'badge', 'note'],
  properties: {
    shape: { type: 'object', additionalProperties: false, required: ['outline', 'corner', 'notch', 'tilt', 'border', 'weight', 'fill', 'colour'], properties: {
      outline: { type: 'string', enum: [...CONTROL_OUTLINES] }, corner: { type: 'number' }, notch: { type: 'number' }, tilt: { type: 'number' },
      border: { type: 'string', enum: [...CONTROL_BORDERS] }, weight: { type: 'number' }, fill: { type: 'string', enum: [...CONTROL_FILLS] }, colour: { type: 'string', enum: [...CONTROL_COLOURS] },
    } },
    layout: { type: 'object', additionalProperties: false, required: ['cart', 'account'], properties: { cart: { type: 'string', enum: [...CART_LAYOUTS] }, account: { type: 'string', enum: [...ACCOUNT_LAYOUTS] } } },
    icons: { type: 'object', additionalProperties: false, required: [...ICON_SLOTS], properties: Object.fromEntries(ICON_SLOTS.map(slot => [slot, { type: 'string' }])) },
    words: { type: 'object', additionalProperties: false, required: ['cart', 'account'], properties: { cart: { type: 'string' }, account: { type: 'string' } } },
    badge: { type: 'string', enum: [...CONTROL_BADGES] },
    note: { type: 'string' },
  },
};

/** The store's colour tokens as the model should read them (brand.css first, then styles.css), at most 16. */
export function storeTokens(files: ReadonlyArray<{ path: string; content: string }>): string {
  const found = new Map<string, string>();
  for (const path of ['brand.css', 'styles.css']) {
    const css = files.find(file => file.path === path)?.content ?? '';
    for (const match of css.matchAll(/--(?:store|brand)-([\w-]+)\s*:\s*([^;{}]+)/g)) if (!found.has(match[1])) found.set(match[1], match[2].trim().slice(0, 60));
  }
  return [...found].slice(0, 16).map(([name, value]) => `${name}: ${value}`).join('; ');
}

const languageOf = (controls: StoreControls) => ({ outline: controls.shape.outline, fill: controls.shape.fill, colour: controls.shape.colour, badge: controls.badge, cart: controls.icons.cart ?? '' });
export type ControlsPromptInput = { storeName: string; kind: PlaybookKind; brief: unknown; products: string[]; tokens: string; look?: StoreLook; avoid: StoreControls[]; previous?: StoreControls; current?: StoreControls; instruction?: string };
export function controlsPrompt(input: ControlsPromptInput): string {
  const { version: _version, source: _source, ...example } = pickLibraryControls({ kind: input.kind, mode: 'calm', seed: 'example' });
  return [
    `Design the small controls of «${input.storeName}», a ${PLAYBOOK[input.kind].name} business: the header's cart, account, menu and search buttons, the product cards' "+" button, the quantity steppers, the cart's close button and the count badge. Screenshots attached: the home page with its header at 1440px and 390px. The shape must belong to this store's look and the icons and words to what it sells, so no two stores look alike.`,
    `Business: ${JSON.stringify({ brief: input.brief, products: input.products })}`,
    `Colour tokens (the controls use only these, through colour: accent, ink or paper): ${input.tokens || '(not found)'}`,
    `Measured look of the home page: ${JSON.stringify(input.look ?? {})}`,
    input.avoid.length ? `Other stores already use these control languages; do not repeat an outline together with a similar cart icon: ${JSON.stringify(input.avoid.map(languageOf))}` : '',
    input.previous ? `This is a redesign: move away from the store's previous controls: ${JSON.stringify(languageOf(input.previous))}` : '',
    input.current ? `The store's current controls (change them as the merchant asks; keep what they did not mention): ${JSON.stringify(languageOf(input.current))}` : '',
    input.instruction ? `The merchant asked now: «${input.instruction}». Follow it for the controls.` : '',
    'Rules:',
    '- shape: outline is one of the listed outlines; corner 0-24 px; notch 0-10 px (ticket notches, tag cut, stamp scallop depth); tilt -6 to 6 degrees (drawn on the face, never the tap target); weight 1-3 px. fill: solid, outline, ghost (no fill, the header text colour) or inverted. colour: accent, ink or paper.',
    '- icons: SVG path data only (the d attribute) for a 24x24 box, every point between 0 and 24, at most 1,500 characters each. They are FILLED with the text colour using fill-rule evenodd, so a line icon must be drawn as its outline (an outer shape and an inner shape). No other SVG elements, attributes, URLs or text. The cart icon shows what this store sells (a cup, a bag, a basket, a frame, a scoop, a briefcase, a leaf, a paw, or anything that fits it better); the others are account, menu, search, plus, minus and close. An empty string keeps the platform icon.',
    '- words: cart and account in Spanish, 1-14 letters, no emoji. An empty string keeps the platform word. Screen readers keep their own plain labels.',
    '- layout: cart icon+word, icon or word; account icon, word or icon+word. badge: dot, circle, inline, corner or stamp.',
    '- A real browser checks every control at 1440px and 390px: 44px tap targets, nothing covered, no sideways scroll, words at 4.5:1 and icons and borders at 3:1 contrast against the header. A failing icon is replaced by the platform icon; any other failure discards the whole design.',
    `A valid answer looks like this (do not copy it): ${JSON.stringify({ ...example, note: 'Diseñé los botones como boletos, con una taza para el carrito.' })}`,
    'Answer with JSON: shape, layout, icons, words, badge, and note (one short sentence in Spanish for the merchant saying what you designed).',
  ].filter(Boolean).join('\n\n');
}

export type ControlsDesignDeps = {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: PlaybookKind; products: string[]; avoid: StoreControls[];
  previous?: StoreControls; current?: StoreControls; instruction?: string; signal: AbortSignal;
  call: (text: string, images: ModelImage[]) => Promise<{ body: unknown; used: () => void }>;
  fallbackIcon: (slot: IconSlot) => string | undefined;
  capture?: (snapshot: SourceProjectSnapshot, signal: AbortSignal) => Promise<ModelImage[]>;
};
export type ControlsDesign = { controls: StoreControls; note: string; used: () => void; replacedIcons: IconSlot[] };
/** One controls call. Null for an unusable answer (not JSON, an unknown enum, a missing number); `used` bills the attempt and is
 *  called by the caller only when the guard keeps the record. */
export async function runControlsDesign(deps: ControlsDesignDeps): Promise<ControlsDesign | null> {
  const snapshot = { brief: deps.brief, files: deps.files } as unknown as SourceProjectSnapshot;
  const images = await (deps.capture ?? captureControlsShots)(snapshot, deps.signal);
  const text = controlsPrompt({ storeName: deps.storeName, kind: deps.kind, brief: deps.brief, products: deps.products, tokens: storeTokens(deps.files), look: sanitizeLook(readConfigFile(deps.files).look), avoid: deps.avoid, previous: deps.previous, current: deps.current, instruction: deps.instruction });
  const { body, used } = await deps.call(text, images);
  let raw: unknown;
  try { raw = sourceResponseJson(body); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const answer = raw as Record<string, unknown>;
  const report = sanitizeControlsReport({ ...answer, version: 1, source: 'yapi' }, { fallbackIcon: deps.fallbackIcon });
  if (!report.controls) return null;
  const note = typeof answer.note === 'string' && answer.note.trim() ? answer.note.trim().slice(0, 200) : 'Diseñé los botones de tu tienda.';
  return { controls: report.controls, note, used, replacedIcons: report.replacedIcons };
}
```

- [ ] **Step 5: Run the unit test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-design.spec.ts`
  - Expected: PASS.

- [ ] **Step 6: Write the failing service tests.**

In `source-generation-review.spec.ts`:
- Replace the guard mock from Task 8 with:

```ts
jest.mock('./store-controls-guard', () => ({ ...jest.requireActual('./store-controls-guard'), guardControlsOnSnapshot: jest.fn().mockResolvedValue([]), captureControlsShots: jest.fn().mockResolvedValue([]) }));
```

- Add `import * as controlsDesignModule from './store-controls-design';` next to the other imports.
- Append:

```ts
describe('store controls: YAPI designs N+1 in the review stage (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, prisma: any, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const DESIGNED = {
    shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
    layout: { cart: 'icon+word', account: 'icon' },
    icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: '', minus: '', close: '' },
    words: { cart: 'Tu taza', account: '' }, badge: 'stamp',
    note: 'Diseñé los botones como sellos, con una taza para el carrito.',
  };
  const SAVED = { version: 1, shape: DESIGNED.shape, layout: DESIGNED.layout, icons: { cart: CART_ICONS.cup.solid }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' };
  const NO_EDITS = { label: 'Café', notes: [], edits: [] };
  const schemaOf = (init: any) => JSON.parse(init.body).text.format.name;
  const respondWith = (review: unknown, controls: (init: any) => Promise<Response>) => async (_url: unknown, init: any) =>
    schemaOf(init) === 'storefront_self_review' ? answer(review) : schemaOf(init) === 'storefront_controls' ? controls(init) : answer({ label: 'Café', files: files(), products: [] });
  const ended = (status: string) => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.where.id === 'review-1' && c.data.status === status);
  const run = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, prisma, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    config.set('app.yapiControls', true);
    config.set('app.yapiControlsDesign', true);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("saves YAPI's controls in N+1 with the review's edits, bills the call and puts its note in the chat", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[0]).controls.source).toBe('library');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(prisma.storeAgentMessage.create.mock.calls[0][0].data.content).toContain(DESIGNED.note);
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'COMPLETED' })]));
  });

  it('starts the controls call beside the review call, not after it', async () => {
    let controlsStarted!: () => void;
    const started = new Promise<void>(resolve => { controlsStarted = resolve; });
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => {
      if (schemaOf(init) === 'storefront_self_review') {
        await Promise.race([started, new Promise((_ok, fail) => setTimeout(() => fail(new Error('the controls call did not start beside the review')), 5000))]);
        return answer(REVIEW);
      }
      if (schemaOf(init) === 'storefront_controls') { controlsStarted(); return answer(DESIGNED); }
      return answer({ label: 'Café', files: files(), products: [] });
    }) as any);
    await run();
    await service.reviewSettled('s1');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
  });

  it('an unusable answer keeps the library language; with nothing else changed there is no N+1 and the call is not billed', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, async () => answer('esto no es JSON')) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
  });

  it("a failing guard keeps revision N's language while the review's edits still save", async () => {
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 390, slot: 'cart', check: 'contrast', detail: 'word 1.10:1, needs 4.5:1' }]);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(configOf(projects.save.mock.calls[0]).controls);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('color: #111');
    expect(ended('COMPLETED').data.attempts).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'controls', status: 'FAILED' })]));
  });

  it('a controls call past its own deadline is dropped (reason deadline) and N+1 still saves the review edits', async () => {
    jest.spyOn(controlsDesignModule, 'controlsDeadlineMs').mockReturnValue(50);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, init => new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(init.signal.reason)))) as any);
    await run();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls.source).toBe('library');
    expect(warn.mock.calls.map(call => String(call[0])).some(line => line.includes('"event":"controls_dropped"') && line.includes('"reason":"deadline"'))).toBe(true);
  });

  it("a redesign tells YAPI to move away from the store's previous controls", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(REVIEW, async () => answer(DESIGNED)) as any);
    await run();
    await service.reviewSettled('s1');
    projects.version.mockResolvedValue({ revision: 2, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[1][2], revision: 2 }) });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, async () => answer(DESIGNED)) as any);
    await service.generate('m1', 's1', { ...dto, revision: 2, instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(25), []);
    await service.reviewSettled('s1');
    const last = fetchMock.mock.calls.map(call => call[1] as any).filter(init => schemaOf(init) === 'storefront_controls').at(-1);
    const prompt = JSON.parse(last.body).input[0].content[0].text;
    expect(prompt).toContain("move away from the store's previous controls");
    expect(prompt).toContain('"outline":"stamp"');
  });
});
```

- [ ] **Step 7: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts`
  - Expected: FAIL. No `storefront_controls` call is made, so N+1 has the library controls or is not saved.

- [ ] **Step 8: Wire the call into the review stage.** In `configuration.ts`:
  - After the `yapiControls` lines from Task 7, add:

```ts
  /** Store controls (spec 2026-10-14): YAPI designs the language in the Sep-5 review stage and on chat requests about the controls.
   *  Default on; YAPI_CONTROLS_DESIGN=off keeps the library language. */
  yapiControlsDesign: boolean;
```

  - After `yapiControls: process.env.YAPI_CONTROLS !== 'off',`, add:

```ts
    yapiControlsDesign: process.env.YAPI_CONTROLS_DESIGN !== 'off',
```

(a) Shared types, in `source-generation-types.ts`:
  - In `SourceGenerationAttempt` (line 38), change `… | 'author' | 'review' | 'touch'; durationMs: number;` to `… | 'author' | 'review' | 'touch' | 'controls'; durationMs: number;`.
  - Make the same change to the `phase` union of `DesignPlanningAttempt` (`source-design-planner.ts:16`). `generate()` passes its attempts list to the design planner and `proposeStyles`, so the two unions must match or TypeScript rejects the call (TS2322).
  - After `import type { StoreLook } from './store-look';` (line 24), add:

```ts
import type { StoreControls } from './store-controls';
```

  - In `GenerationLive`, after `readonly revisionLook: StoreLook | undefined;` (line 85), add:

```ts
  /** Store controls (spec 2026-10-14): the language revision N was saved with, the review stage's fallback. */
  readonly revisionControls: StoreControls | undefined;
```

(b) The controls call, in `source-sep5-call.ts`:
  - After `import { SEP5_MAX_OUTPUT_TOKENS } from './source-generation-run';` (line 3), add:

```ts
import { controlsDeadlineMs, CONTROLS_MAX_OUTPUT_TOKENS, CONTROLS_SCHEMA } from './store-controls-design';
```

  - In the `sep5Call` signature (line 27), change `phase: 'author' | 'review' | 'touch'` to `phase: 'author' | 'review' | 'touch' | 'controls'`.
  - Replace the end of `sep5Caller` (lines 60-64):

```ts
      await new Promise(resolve => setTimeout(resolve, 3000));
      run.signal.throwIfAborted();
    }
  };
  return { sep5Call, touchCall };
```

with:

```ts
      await new Promise(resolve => setTimeout(resolve, 3000));
      run.signal.throwIfAborted();
    }
  };
  /** The controls call (spec 2026-10-14 store controls, part 4): the same metered client, a small answer and medium effort, on
   *  its own signal. The attempt is charged only when the guard keeps the record (`used`). */
  const controlsCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: SourceInputImage[]) => {
    const { attempt, body } = await sep5Call('controls', text, attached, 'storefront_controls', CONTROLS_SCHEMA, controlsDeadlineMs(), { signal: run.signal, attempts: run.attempts, maxOutputTokens: CONTROLS_MAX_OUTPUT_TOKENS, effort: 'medium' });
    return { body, used: () => { attempt.status = 'COMPLETED'; } };
  };
  return { sep5Call, touchCall, controlsCall };
```

`Sep5Caller` is `ReturnType<typeof sep5Caller>`, so it gains `controlsCall` without another change.

(c) The review closure, in `source-sep5-review.ts`:
  - Replace the types import (line 14):

```ts
import type { GenerationLive, GenerationRunFacts, Sep5Review } from './source-generation-types';
```

with:

```ts
import type { GenerationLive, GenerationRunFacts, Sep5Review, SourceGenerationAttempt } from './source-generation-types';
import type { StoreControls } from './store-controls';
import type { ControlsDesign } from './store-controls-design';
```

  - Replace `AssembleSave` (lines 19-20):

```ts
/** generate()'s assembleSave. Stages receive it wrapped, `(…a) => assembleSave(…a)`, because it is declared after them. */
export type AssembleSave = (assembleSignal?: AbortSignal, lookChoice?: LookChoice) => ReturnType<typeof assembleSourceSave>;
```

with:

```ts
/** generate()'s assembleSave. Stages receive it wrapped, `(…a) => assembleSave(…a)`, because it is declared after them.
 *  `controlsChoice.use` saves that control language instead of generate()'s own pick (spec 2026-10-14 store controls). */
export type AssembleSave = (assembleSignal?: AbortSignal, lookChoice?: LookChoice, controlsChoice?: { use?: StoreControls }) => ReturnType<typeof assembleSourceSave>;
type SaveInput = Awaited<ReturnType<AssembleSave>>;

/** Store controls (spec 2026-10-14, part 4), built by generate(): YAPI's controls call, started beside the review call, and the
 *  browser guard on the N+1 candidate. */
export type ReviewControls = {
  /** Never rejects: null when the call fails, times out or answers nothing usable. */
  design: (review: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => Promise<ControlsDesign | null>;
  /** The record drawn into the candidate and guarded; a failing guard puts revision N's language back (kept: false). */
  keep: (input: SaveInput, designed: ControlsDesign, signal: AbortSignal) => Promise<{ input: SaveInput; kept: boolean }>;
};
```

  - In `Sep5ReviewContext`, after `sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];` (line 31), add:

```ts
  controls?: ReviewControls;
```

  - In `createSep5Review`, add `controls` to the destructuring (line 39), between `touchCall` and `assembleSave`:

```ts
  const { facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, controls, assembleSave } = context;
```

  - Replace the start of the closure (lines 43-45):

```ts
    const notes: string[] = [];
    let changed = false;
    if (sep5SelfReview) {
```

with:

```ts
    const notes: string[] = [];
    let changed = false;
    // YAPI's controls (spec 2026-10-14) are designed beside the review call: the ChatGPT bridge serves about two calls at once.
    const controlsJob = controls ? controls.design(review) : null;
    if (sep5SelfReview) {
```

  - Replace the end of the closure (lines 99-102):

```ts
    // Nothing changed: revision N stays the store and no empty «Revisión de YAPI» is saved.
    if (!changed) return null;
    return { saveInput: await assembleSave(review.signal, touchedLook ? { reuse: touchedLook } : { fallback: live.revisionLook }), notes };
  };
```

with:

```ts
    // YAPI's controls, guarded on the N+1 candidate: a failing guard keeps revision N's language, never the review's edits.
    const designed = controlsJob ? await controlsJob : null;
    review.signal.throwIfAborted();
    // Nothing changed: revision N stays the store and no empty «Revisión de YAPI» is saved.
    if (!changed && !designed) return null;
    let saveInput = await assembleSave(review.signal, touchedLook ? { reuse: touchedLook } : { fallback: live.revisionLook }, { use: live.revisionControls });
    if (designed && controls) {
      const guarded = await controls.keep(saveInput, designed, review.signal);
      if (guarded.kept) { designed.used(); notes.push(designed.note); saveInput = guarded.input; }
      else if (!changed) return null;
    }
    return { saveInput, notes };
  };
```

  - The kit touch's base save (`assembleSave(touchSignal, { fallback: live.revisionLook })`, line 88) is left as it is, as in the original plan.

(d) The stage, in `source-sep5-stage.ts`:
  - Change the review import (line 12) to:

```ts
import { createSep5Review, type AssembleSave, type ReviewControls } from './source-sep5-review';
```

  - In `Sep5StageContext`, after `sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];` (line 22), add:

```ts
  /** Store controls (spec 2026-10-14, part 4): YAPI's controls call beside the review, and its guard; absent when off. */
  controls?: ReviewControls;
```

  - Add `controls` to the destructuring (line 30):

```ts
  const { facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall, controls, assembleSave } = context;
```

  - Replace the review arming (lines 94-96):

```ts
  if (sep5SelfReview || kitTouchOn) {
    const draftFiles = authored.data.files, draftPreview = live.acceptedPreviewFiles;
    live.sep5Review = createSep5Review({ facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, assembleSave });
```

with:

```ts
  // Store controls (spec 2026-10-14, part 4): YAPI's controls call arms the review stage on its own too.
  if (sep5SelfReview || kitTouchOn || controls) {
    const draftFiles = authored.data.files, draftPreview = live.acceptedPreviewFiles;
    live.sep5Review = createSep5Review({ facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, controls, assembleSave });
```

(e) In `source-generation.service.ts`:
  - Imports. After the `store-controls-guard` import from Task 8, add:

```ts
import { controlsDeadlineMs, runControlsDesign, type ControlsDesign } from './store-controls-design';
```

  - Change `import { runChatKitTouch } from './source-sep5-review';` (line 112) to:

```ts
import { runChatKitTouch, type ReviewControls } from './source-sep5-review';
```

(f) In the flags block from Task 7 (after `const previousControls = readControls(previousFiles);`), add:

```ts
    /** YAPI designs the language (spec 2026-10-14, part 4): in the review stage of a new store or a redesign, and on chat requests. */
    const controlsDesignOn = controlsOn && this.config.get<boolean>('app.yapiControlsDesign') === true;
```

(g) After the `controlsAvoid` line (Task 7 (c)), add:

```ts
      /** The language and files revision N saved: the review stage's fallback and what its controls call photographs. */
      let revisionControls: StoreControls | undefined;
      let revisionFiles: SourceProjectFileDto[] = [];
```

  and in the `live` object, after `get revisionLook() { return revisionLook; },` (line 756), add:

```ts
        get revisionControls() { return revisionControls; },
```

(h) Replace the `sep5Caller` line (line 918):

```ts
      const { sep5Call, touchCall } = sep5Caller({ provider, apiKey, budget, model: () => model, signal, attempts, storeId, metering: this.metering });
```

with:

```ts
      const { sep5Call, touchCall, controlsCall } = sep5Caller({ provider, apiKey, budget, model: () => model, signal, attempts, storeId, metering: this.metering });
      /** The review stage's controls call (spec 2026-10-14, part 4), on its own deadline; null when it fails, times out or answers
       *  nothing usable. It never rejects: the review closure starts it before the review call and awaits it after, so a rejection
       *  would go unhandled meanwhile. */
      const designReviewControls = async (review: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }): Promise<ControlsDesign | null> => {
        const controlsSignal = AbortSignal.any([review.signal, AbortSignal.timeout(controlsDeadlineMs())]);
        try {
          const designed = await runControlsDesign({ files: revisionFiles, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || owner.slug, kind: controlsKind, products: data.items.map(item => item.name).slice(0, 12), avoid: controlsAvoid, ...(redesign && previousControls ? { previous: previousControls } : {}), signal: controlsSignal, call: controlsCall({ signal: controlsSignal, attempts: review.attempts }), fallbackIcon: libraryIconFallback(controlsKind, merchantWords) });
          if (!designed) this.logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: run.id, source: 'yapi', reason: 'unusable answer' }));
          return designed;
        } catch (error) {
          if (!review.signal.aborted) this.logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: run.id, source: 'yapi', reason: controlsSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
          return null;
        }
      };
      /** YAPI's controls for the Sep-5 review stage (source-sep5-review.ts ReviewControls): the call above, and the guard on the N+1
       *  candidate with revision N's language as the fallback. None when YAPI_CONTROLS_DESIGN is off. */
      const reviewControls: ReviewControls | undefined = controlsDesignOn
        ? { design: designReviewControls, keep: (input, designed, keepSignal) => keepGuardedControls(storeControlsInto(input, designed.controls), revisionControls, 'yapi', keepSignal) }
        : undefined;
```

(i) Replace the `runSep5AuthorStage` call (lines 922-923):

```ts
        await runSep5AuthorStage({ facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall,
          assembleSave: (assembleSignal, lookChoice) => assembleSave(assembleSignal, lookChoice) });
```

with:

```ts
        await runSep5AuthorStage({ facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall, controls: reviewControls,
          assembleSave: (assembleSignal, lookChoice, controlsChoice) => assembleSave(assembleSignal, lookChoice, controlsChoice) });
```

(j) Replace the Task 7 `withControls` and `assembleSave` lines:

```ts
    // Store controls (spec 2026-10-14): the language this save carries, chosen once the look is known (assembleSourceSave writes
    // config.look last, measured or reused). A new store or a redesign takes the seeded library pick (calm or bold, the measured
    // look, away from its siblings); an edit carries its own.
    const withControls = <T extends { files: SourceProjectFileDto[] }>(input: T): T => storeControlsInto(input, !controlsOn ? undefined
      : controlsFresh ? pickLibraryControls({ kind: controlsKind, mode: boldAsked ? 'bold' : 'calm', look: sanitizeLook(readConfigFile(input.files).look), seed: `${storeId}:${dto.revision}`, avoid: controlsAvoid, words: `${merchantWords}\n${businessInfo}`, palette: storePalette(input.files) })
      : previousControls);
    const assembleSave = async (assembleSignal: AbortSignal = signal, lookChoice: LookChoice = {}) => withControls(await assembleSourceSave(saveContext, assembleSignal, lookChoice));
```

with:

```ts
    // Store controls (spec 2026-10-14): the language this save carries, chosen once the look is known (assembleSourceSave writes
    // config.look last, measured or reused). `controlsChoice.use` is the review stage's (YAPI's guarded record, or revision N's);
    // otherwise a new store or a redesign takes the seeded library pick and an edit carries its own.
    const withControls = <T extends { files: SourceProjectFileDto[] }>(input: T, controlsChoice: { use?: StoreControls }): T => storeControlsInto(input, !controlsOn ? undefined
      : 'use' in controlsChoice ? controlsChoice.use
      : controlsFresh ? pickLibraryControls({ kind: controlsKind, mode: boldAsked ? 'bold' : 'calm', look: sanitizeLook(readConfigFile(input.files).look), seed: `${storeId}:${dto.revision}`, avoid: controlsAvoid, words: `${merchantWords}\n${businessInfo}`, palette: storePalette(input.files) })
      : previousControls);
    const assembleSave = async (assembleSignal: AbortSignal = signal, lookChoice: LookChoice = {}, controlsChoice: { use?: StoreControls } = {}) => withControls(await assembleSourceSave(saveContext, assembleSignal, lookChoice), controlsChoice);
```

(k) After `revisionLook = sanitizeLook(readConfigFile(saveInput.files).look);` (the N save), add:

```ts
    revisionControls = readControls(saveInput.files);
    revisionFiles = saveInput.files;
```

- [ ] **Step 9: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts src/storefront-source/store-controls-design.spec.ts src/storefront-source/source-background-review.spec.ts src/storefront-source/source-sep5-call.spec.ts --maxWorkers=2`
  - Expected: PASS, including every earlier review and kit-touch test. They leave `app.yapiControlsDesign` unset.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/store-controls-design.ts apps/api/src/storefront-source/store-controls-design.spec.ts apps/api/src/storefront-source/store-controls-guard.ts apps/api/src/storefront-source/source-design-planner.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-sep5-call.ts apps/api/src/storefront-source/source-sep5-stage.ts apps/api/src/storefront-source/source-sep5-review.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(controls): YAPI designs each store's controls beside the background review — guarded, billed only when kept, saved in N+1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Chat requests about the controls

**Pattern followed:** the chat request touch, `runChatKitTouch` (`source-sep5-review.ts:116-136`). `generate()` calls it at `source-generation.service.ts:1254`, after `assembleSave` is declared and before the receipt.
- `instructionConcernsKitSurfaces` reads only the merchant's own words, the part after `MERCHANT_MARKER` (`kit-touch.ts:130-136`).
- The touch runs on its own deadline before the receipt.
- A used attempt is billed. A failure never fails the edit.
- What is kept is saved with that same edit.

**One fix to the touch classifier:** «haz el carrito como una taza» contains «carrito», so today it would also run a kit-surface touch on the cart drawer. Phrases about the cart's look («carrito como…», «carrito en/con forma de…») now count as controls requests only.

**One fix to the edit:**
- A request only about the controls changes no authored file. Today `applySourceEdits` rejects an unchanged edit («La edición no incluyó ningún cambio.»).
- For a controls request, `allowUnchanged` is set and YAPI's edit prompt is told the controls are drawn by a separate step.

**Files:**
- Modify: `apps/api/src/storefront-source/store-controls-design.ts` (classifier)
- Modify: `apps/api/src/storefront-source/kit-touch.ts:135` (the cart strip)
- Modify: `apps/api/src/storefront-source/source-header.ts` (`hasPlatformHeader`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (all in `generate()`; the chat request stays there, beside the `runChatKitTouch` call, because it needs `keepGuardedControls`, `storeControlsInto` and `controlsCall`):
  - imports (lines 9, 13, and the Task 9 `store-controls-design` import);
  - the flags block;
  - after line 589 (edit prompt);
  - after the Task 9 (g) lines;
  - `withControls`;
  - line 1208 (`allowUnchanged`);
  - after `await runChatKitTouch({ facts, live, touchCall, assembleSave });` (line 1254), before `const successfulAttempts` (line 1255).
- Test: `store-controls-design.spec.ts`, `kit-touch.spec.ts`, `source-header.spec.ts`, `source-generation-review.spec.ts`

**Interfaces:**
- Consumes:
  - `MERCHANT_MARKER = 'Pedido actual del comercio:'` (`kit-touch.ts:130`). The service no longer imports it since the split (the chat kit touch moved to `source-sep5-review.ts`), so Step 5 (a) adds the import.
  - `controlsCall` from `sep5Caller` (Task 9).
  - `runControlsDesign` and `controlsDeadlineMs` (Task 9).
  - `keepGuardedControls` (Task 8).
  - `storeControlsInto` (Task 7).
- Produces:
  - `instructionConcernsControls(text: string): boolean`.
  - `hasPlatformHeader(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): boolean`.
  - In `generate()`: `controlsRequest` and `requestedControls`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) In `store-controls-design.spec.ts`, add `instructionConcernsControls` to the import and append:

```ts
describe('instructionConcernsControls', () => {
  it.each([
    ['haz el carrito como una taza', true], ['botones más redondos', true], ['Cambia el ícono del carrito por una canasta', true],
    ['quiero los botones con forma de etiqueta', true], ['el contador del carrito en rojo', true], ['Un botón del carrito más grande', true],
    ['El carrito en forma de bolsa', true],
    ['Pon las fotos de los productos inclinadas', false], ['Cambia el título del inicio', false], ['Agrega un botón de WhatsApp', false],
    ['El carrito con un sello como en la portada', false],
  ])('%s → %s', (text, expected) => expect(instructionConcernsControls(text)).toBe(expected));

  it("reads only the merchant's own words after the marker", () => {
    expect(instructionConcernsControls('Resumen: botones redondos.\nPedido actual del comercio: cambia el título')).toBe(false);
  });
});
```

(b) In `kit-touch.spec.ts`, add two rows to the `instructionConcernsKitSurfaces` table (after `['Los botones del carrito y el catálogo', true],`):

```ts
    ['Haz el carrito como una taza', false], ['El carrito en forma de canasta', false],
```

(c) In `source-header.spec.ts`, add `hasPlatformHeader` to the `./source-header` import and append inside the controls `describe`:

```ts
  it('tells a saved store with the platform header from one without', () => {
    expect(hasPlatformHeader([{ path: 'index.html', content: render('menu-button', 'shop') }])).toBe(true);
    expect(hasPlatformHeader([{ path: 'index.html', content: '<header class="site"></header>' }, { path: 'assets/a.png', content: '<header data-pagosya-header>', encoding: 'base64' }])).toBe(false);
  });
```

(d) In `source-generation-review.spec.ts`, append:

```ts
describe('store controls: a chat request about the controls (spec 2026-10-14, part 4)', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const DESIGNED = {
    shape: { outline: 'stamp', corner: 0, notch: 8, tilt: 2, border: 'dashed', weight: 2, fill: 'solid', colour: 'ink' },
    layout: { cart: 'icon+word', account: 'icon' },
    icons: { cart: CART_ICONS.cup.solid, account: '', menu: '', search: '', plus: '', minus: '', close: '' },
    words: { cart: 'Tu taza', account: '' }, badge: 'stamp', note: 'Puse una taza en el carrito.',
  };
  const SAVED = { version: 1, shape: DESIGNED.shape, layout: DESIGNED.layout, icons: { cart: CART_ICONS.cup.solid }, words: { cart: 'Tu taza' }, badge: 'stamp', source: 'yapi' };
  const EDIT = { label: 'Carrito', edits: [{ path: 'styles.css', search: '#222', replacement: '#333' }], files: [] };
  const NO_CHANGE = { label: 'Carrito', edits: [], files: [] };
  const schemaOf = (init: any) => JSON.parse(init.body).text.format.name;
  const storeWithControls = async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(authorWithBody(REVIEW) as any);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    projects.version.mockResolvedValue({ revision: 1, snapshot: sourceProjectSnapshot({ ...projects.save.mock.calls[0][2], revision: 1 }) });
    config.set('app.yapiControlsDesign', true);
    config.set('app.yapiKitTouch', true);
  };
  const request = (instruction: string) => service.generate('m1', 's1', { ...dto, revision: 1, instruction: `Resumen de YAPI.\nPedido actual del comercio: ${instruction}` }, new SourceRequestBudget(500), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    config.set('app.yapiControls', true);
    (guardControlsOnSnapshot as jest.Mock).mockReset().mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("runs the controls call with the merchant's words and saves the result with the edit, billed, and no kit touch", async () => {
    await storeWithControls();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : EDIT)) as any);
    const result: any = await request('haz el carrito como una taza');
    const calls = fetchMock.mock.calls.map(call => call[1] as any).filter(init => schemaOf(init) === 'storefront_controls');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).input[0].content[0].text).toContain('«haz el carrito como una taza»');
    expect(fetchMock.mock.calls.some(call => schemaOf(call[1]) === 'storefront_kit_touch')).toBe(false);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
    expect(result.generation.attempts.find((attempt: any) => attempt.phase === 'controls')).toMatchObject({ status: 'COMPLETED' });
  });

  it('a request only about the controls may leave the authored files unchanged', async () => {
    await storeWithControls();
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : NO_CHANGE)) as any);
    await request('botones más redondos');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(SAVED);
  });

  it("a result the guard drops keeps the store's language and still saves the edit, unbilled", async () => {
    await storeWithControls();
    const before = configOf(projects.save.mock.calls[0]).controls;
    (guardControlsOnSnapshot as jest.Mock).mockResolvedValueOnce([{ width: 1440, slot: 'cart', check: 'covered', detail: 'covered by div.promo' }]);
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (_url: unknown, init: any) => answer(schemaOf(init) === 'storefront_controls' ? DESIGNED : EDIT)) as any);
    const result: any = await request('haz el carrito como una taza');
    expect(configOf(projects.save.mock.calls[1]).controls).toEqual(before);
    expect(projects.save.mock.calls[1][2].files.find((f: any) => f.path === 'styles.css').content).toContain('#333');
    expect(result.generation.attempts.find((attempt: any) => attempt.phase === 'controls')).toMatchObject({ status: 'FAILED' });
  });

  it('a request that is not about the controls makes no controls call', async () => {
    await storeWithControls();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((async () => answer(EDIT)) as any);
    await request('cambia el color del texto');
    expect(fetchMock.mock.calls.some(call => schemaOf(call[1]) === 'storefront_controls')).toBe(false);
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-design.spec.ts src/storefront-source/kit-touch.spec.ts src/storefront-source/source-header.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
  - Expected: FAIL.
    - `instructionConcernsControls` and `hasPlatformHeader` are not exported.
    - The two new kit-touch rows return `true`.
    - The chat tests see no `storefront_controls` call. The unchanged edit fails with «La edición no incluyó ningún cambio.».

- [ ] **Step 4: The classifiers.**

(a) In `store-controls-design.ts`, add `import { MERCHANT_MARKER } from './kit-touch';` to the imports at the top of the file, and append:

```ts
/** Does the merchant's own request concern the store's small controls (spec 2026-10-14: «haz el carrito como una taza», «botones
 *  más redondos», «el ícono del carrito»)? Only their words count (after MERCHANT_MARKER), accents ignored. */
export function instructionConcernsControls(text: string): boolean {
  const own = (text.split(MERCHANT_MARKER).at(-1) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const control = /\b(?:botones|boton|iconos|icono)\b/.test(own)
    && /\b(?:carrito|cuenta|menu|buscar|busqueda|lupa|redond\w*|cuadrad\w*|esquinas?|bordes?|forma|pildoras?|boletos?|tickets?|etiquetas?|sellos?|stickers?|pegatinas?|contador)\b/.test(own);
  const cartAs = /\bcarrito\s+(?:como|en\s+forma\s+de|con\s+forma\s+de|con\s+(?:un|una)\s+icono)\b/.test(own);
  const iconOf = /\b(?:icono|simbolo|dibujo)\s+(?:del?|de\s+la|para\s+el)\s+(?:carrito|cuenta|menu|buscador|busqueda)\b/.test(own);
  const badge = /\b(?:contador|numerito|burbuja|insignia)\s+del?\s+carrito\b/.test(own);
  return control || cartAs || iconOf || badge;
}
```


(b) In `kit-touch.ts`, replace line 135:

```ts
  const cart = own.replace(/\b(?:icono|boton|simbolo|logo)(?:es|s)?\s+(?:del?\s+|de\s+la\s+)?carrito\b|\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b/g, ' ');
```

with:

```ts
  // «carrito como una taza» / «carrito en forma de canasta» is about the header cart's look: a controls request (store-controls-design.ts).
  const cart = own.replace(/\b(?:icono|boton|simbolo|logo)(?:es|s)?\s+(?:del?\s+|de\s+la\s+)?carrito\b|\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b|\bcarrito\s+(?:como|en\s+forma\s+de|con\s+forma\s+de)\b[^.,;!?]*/g, ' ');
```

(c) In `source-header.ts`, after `emptySourceHeaders` (lines 120-126 at HEAD; Tasks 4-5 move it down), add:

```ts
/** Does a saved store carry the platform header (spec 2026-10-13)? Its controls are then the platform's to draw (spec 2026-10-14). */
export function hasPlatformHeader(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): boolean {
  return files.some(file => file.encoding !== 'base64' && /\.html$/i.test(file.path) && SLOT.test(file.content));
}
```

- [ ] **Step 5: The request in `generate()`.** In `source-generation.service.ts`:

(a) Imports:
  - Change the `./source-header` import (line 9) to add `hasPlatformHeader`:

```ts
import { emptySourceHeaders, hasPlatformHeader, headerFact, SOURCE_PLATFORM_HEADER_EDIT, withSourceHeader } from './source-header';
```

  - Change the Task 9 `store-controls-design` import to:

```ts
import { controlsDeadlineMs, instructionConcernsControls, runControlsDesign, type ControlsDesign } from './store-controls-design';
```

  - Change `import { type KitTouchCss } from './kit-touch';` (line 13) to:

```ts
import { MERCHANT_MARKER, type KitTouchCss } from './kit-touch';
```

(b) In the flags block, after `const controlsDesignOn = …`, add:

```ts
    /** A chat edit of a store with the platform header whose merchant asked about its controls (spec 2026-10-14, part 4). */
    const controlsRequest = controlsDesignOn && !creative && !claude && hasPlatformHeader(previousFiles) && instructionConcernsControls(dto.instruction);
```

(c) After line 589 (`if (execution?.candidate) taskPrompt += "\nUntrusted visual findings …`), add:

```ts
    if (controlsRequest) taskPrompt += '\nSTORE CONTROLS: the cart, account, menu and search buttons, the product cards\' "+" button, the quantity steppers and the cart\'s close button are drawn by the platform from a separate design step that runs after this edit with the merchant\'s words. Do not restyle or redraw them here. If the request is only about them, return no edits.';
```

(d) After the Task 9 (g) lines (`let revisionFiles …`), add:

```ts
      /** The language a chat request about the controls asked for, once the guard kept it; saved with that edit. */
      let requestedControls: StoreControls | undefined;
```

(e) In `withControls` (Task 9 (j)), replace the last two lines:

```ts
      : controlsFresh ? pickLibraryControls({ kind: controlsKind, mode: boldAsked ? 'bold' : 'calm', look: sanitizeLook(readConfigFile(input.files).look), seed: `${storeId}:${dto.revision}`, avoid: controlsAvoid, words: `${merchantWords}\n${businessInfo}`, palette: storePalette(input.files) })
      : previousControls);
```

with:

```ts
      : requestedControls ?? (controlsFresh ? pickLibraryControls({ kind: controlsKind, mode: boldAsked ? 'bold' : 'calm', look: sanitizeLook(readConfigFile(input.files).look), seed: `${storeId}:${dto.revision}`, avoid: controlsAvoid, words: `${merchantWords}\n${businessInfo}`, palette: storePalette(input.files) })
      : previousControls));
```

The `'use' in controlsChoice` branch above them stays first, so the review stage's choice still wins.

(f) At line 1208 (the `editExisting` branch of the single-call loop, still in `generate()`), change `allowUnchanged: products.length > 0 || productOperations.length > 0,` to:

```ts
allowUnchanged: products.length > 0 || productOperations.length > 0 || controlsRequest,
```

(g) After `await runChatKitTouch({ facts, live, touchCall, assembleSave });` (line 1254), before `const successfulAttempts = attempts.filter(attempt => attempt.status === 'COMPLETED');` (line 1255), add the block below. `assembleSave`, `controlsCall` (Task 9 (h)), `keepGuardedControls` and `storeControlsInto` are all in scope there, in the same `try`.

```ts
    // A chat request about the controls (spec 2026-10-14: «haz el carrito como una taza», «botones más redondos») runs the controls
    // call with the merchant's words, on its own deadline; a result the guard keeps is saved with this edit. It never fails the
    // edit, and a dropped result keeps the store's language.
    const controlsBudget = Math.min(controlsDeadlineMs(), started + runTimeout - Date.now() - 60_000);
    if (controlsRequest && controlsBudget >= 20_000) {
      const controlsSignal = AbortSignal.any([signal, AbortSignal.timeout(controlsBudget)]);
      try {
        const base = await assembleSave(controlsSignal);
        const designed = await runControlsDesign({ files: base.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || owner.slug, kind: controlsKind, products: data.items.map(item => item.name).slice(0, 12), avoid: [], ...(previousControls ? { current: previousControls } : {}), instruction: (dto.instruction.split(MERCHANT_MARKER).at(-1) ?? dto.instruction).trim().slice(0, 400), signal: controlsSignal, call: controlsCall({ signal: controlsSignal, attempts }), fallbackIcon: libraryIconFallback(controlsKind, merchantWords) });
        if (!designed) this.logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: run.id, source: 'request', reason: 'unusable answer' }));
        else {
          const guarded = await keepGuardedControls(storeControlsInto(base, designed.controls), previousControls, 'request', signal);
          if (guarded.kept) { requestedControls = readControls(guarded.input.files); designed.used(); }
        }
      } catch (error) {
        signal.throwIfAborted();
        this.logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: run.id, source: 'request', reason: controlsSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
      }
    }
```

- [ ] **Step 6: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-design.spec.ts src/storefront-source/kit-touch.spec.ts src/storefront-source/source-header.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/storefront-source/store-controls-design.ts apps/api/src/storefront-source/store-controls-design.spec.ts apps/api/src/storefront-source/kit-touch.ts apps/api/src/storefront-source/kit-touch.spec.ts apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-header.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(controls): chat requests about the controls («haz el carrito como una taza») redesign them with the merchant's words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Boceto and template saves

**Decision:**
- **Boceto drops the record.** Boceto editado, regenerar and Generar sitio rebuild the home from the sketch. a95693d2 drops the look measured from the old home, and the touch drawn from it, for the same reason. Sketch-born stores have no platform header (`withSourceHeader` runs only in YAPI saves), so their header was never the record's. A record left behind would restyle only the kit's own controls, from a language picked for a home that no longer exists. The kit's defaults return until the next YAPI save, which picks again.
- **A template applies with no record.** `assembleTemplateRevision` builds a fresh `config.js` (`source-templates.ts:100-104`) and templates are Next/TSX stores (out of scope). This is pinned, not changed.

**Files:**
- Modify: `apps/api/src/storefront-source/sketch-studio.service.ts:135-145` (`withProductTheme`)
- Test: `apps/api/src/storefront-source/sketch-studio.service.spec.ts` (inside the `describe('the home is rebuilt, so the measured look and YAPI touch go …')` block)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts` (the first `assembleTemplateRevision` test)

**Interfaces:**
- Consumes: `libraryRecord` and `CONTROL_LANGUAGES` (Task 3, test only).
- Produces: Boceto saves never carry `config.controls`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.**
  - In `sketch-studio.service.spec.ts`, add `import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';`.
  - Inside the describe block that defines `withConfig` and `savedConfig`, append:

```ts
  for (const [name, act] of [
    ['Boceto editado', (service: any, sketch: any) => service.update('m', 's', { revision: 3, sketch })],
    ['regenerar', (service: any) => service.regenerate('m', 's', { revision: 3, designSeed: 'seed' })],
    ['Generar sitio', (service: any) => service.build('m', 's', { revision: 3 })],
  ] as const) it(`${name}: drops config.controls too (spec 2026-10-14 store controls)`, async () => {
    const { service, projects, sketch } = setup();
    withConfig(projects, `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'salv', controls: libraryRecord(CONTROL_LANGUAGES[0], 'general', 'bag'), dna: { version: 1, swatch: 'pill' } })};`);
    await act(service, sketch);
    expect(savedConfig(projects)).not.toHaveProperty('controls');
    expect(savedConfig(projects).dna.swatch).toBe('pill');
  });
```

  - In `source-templates.service.spec.ts`, in the first test, after `expect(config.dna).toBeTruthy();`, add:

```ts
    // Spec 2026-10-14 store controls: a template is a fresh design with no control language (and a Next store, out of scope).
    expect(config).not.toHaveProperty('controls');
```

- [ ] **Step 3: Run them and see the Boceto test fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/sketch-studio.service.spec.ts src/storefront-source/source-templates.service.spec.ts --maxWorkers=2`
  - Expected:
    - The three new Boceto tests FAIL: `Expected path: not "controls"`.
    - The template assertion passes at once. It pins existing behaviour.

- [ ] **Step 4: Drop the record in Boceto saves.** In `sketch-studio.service.ts`, replace:

```ts
  /** The sketch's product skin reaches the runtime through config.js dna, like the agent's
   * set_product_card_theme; its composition travels as config.productPageStyle. Every caller rebuilds the home, so the
   * look measured from the old home goes, and so does YAPI's touch (dna.touch = 1) drawn from it: the kit pages show the
   * kit defaults until the next YAPI save measures and touches again (one look per store, spec 2026-10-14). */
  private async withProductTheme(source: Array<{ path: string; content: string }>, sketch: StoreSketch) {
    const theme = await resolveProductTheme(sketchProductTheme(sketch.product));
    const files = patchConfigFile(source, ({ look: _look, ...config }) => {
```

with:

```ts
  /** The sketch's product skin reaches the runtime through config.js dna, like the agent's
   * set_product_card_theme; its composition travels as config.productPageStyle. Every caller rebuilds the home, so the
   * look measured from the old home goes, and so does YAPI's touch (dna.touch = 1) drawn from it: the kit pages show the
   * kit defaults until the next YAPI save measures and touches again (one look per store, spec 2026-10-14). The control
   * language picked for that home goes too (store controls, spec 2026-10-14): the kit's own controls return to their defaults. */
  private async withProductTheme(source: Array<{ path: string; content: string }>, sketch: StoreSketch) {
    const theme = await resolveProductTheme(sketchProductTheme(sketch.product));
    const files = patchConfigFile(source, ({ look: _look, controls: _controls, ...config }) => {
```

- [ ] **Step 5: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/sketch-studio.service.spec.ts src/storefront-source/source-templates.service.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/storefront-source/sketch-studio.service.ts apps/api/src/storefront-source/sketch-studio.service.spec.ts apps/api/src/storefront-source/source-templates.service.spec.ts
git commit -m "fix(controls): Boceto saves drop the control language with the look; templates apply with none (pinned)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The live-check script, then the owner-gated live check

**Files:**
- Modify: `apps/api/src/storefront-source/store-controls-library.ts` (`controlsUniqueness`)
- Test: `apps/api/src/storefront-source/store-controls-library.spec.ts`
- Create: `apps/api/scripts/store-controls-check.ts` (read-only, modelled on `apps/api/scripts/one-look-check.ts`)

**Interfaces:**
- Consumes:
  - `readControls` (Task 2).
  - `cartIconName` and `controlsKey` (Task 3).
  - `guardControlsOnSnapshot` and `judgeControls` (Task 8).
  - `SOURCE_REVIEW_LABEL` (`source-background-review.ts`).
- Produces: `controlsUniqueness(stores: ReadonlyArray<{ slug: string; controls?: unknown }>): { unique: boolean; duplicates: Array<[string, string]>; without: string[] }`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** In `store-controls-library.spec.ts`, add `controlsUniqueness` to the import and append:

```ts
describe('controlsUniqueness', () => {
  it('names stores that share an outline and cart icon, whatever the drawing style, and sets record-less stores apart', () => {
    const cup = libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup');
    const solidCup = { ...cup, icons: { ...cup.icons, cart: CART_ICONS.cup.solid } };
    const bag = libraryRecord(CONTROL_LANGUAGES[0], 'clothing', 'bag');
    expect(controlsUniqueness([{ slug: 'a', controls: cup }, { slug: 'b', controls: bag }, { slug: 'c', controls: solidCup }, { slug: 'd' }]))
      .toEqual({ unique: false, duplicates: [['c', 'a']], without: ['d'] });
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts`
  - Expected: FAIL, `controlsUniqueness is not a function`.

- [ ] **Step 4: Write `controlsUniqueness`.**
  - In `store-controls-library.ts`, change the `./store-controls` import to add `sanitizeControls`:

```ts
import { ICON_SLOTS, sanitizeControls, WORD_MAX_CHARS, type ControlBadge, type IconSlot, type StoreControls } from './store-controls';
```

  - Then append:

```ts
/** Spec 2026-10-14 live-check criterion 2 over a set of stores: two stores with the same outline and cart icon are duplicates (the
 *  later store named first). A store without a record has nothing to compare and is reported apart. */
export function controlsUniqueness(stores: ReadonlyArray<{ slug: string; controls?: unknown }>): { unique: boolean; duplicates: Array<[string, string]>; without: string[] } {
  const seen = new Map<string, string>();
  const duplicates: Array<[string, string]> = [], without: string[] = [];
  for (const { slug, controls: raw } of stores) {
    const controls = sanitizeControls(raw);
    if (!controls) { without.push(slug); continue; }
    const key = controlsKey(controls);
    const first = seen.get(key);
    if (first) duplicates.push([slug, first]); else seen.set(key, slug);
  }
  return { unique: duplicates.length === 0, duplicates, without };
}
```

- [ ] **Step 5: Run the test and see it pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/store-controls-library.spec.ts`
  - Expected: PASS.

- [ ] **Step 6: Write the script.** Create `apps/api/scripts/store-controls-check.ts`:

```ts
// apps/api/scripts/store-controls-check.ts
/**
 * Store controls (spec 2026-10-14), live-check criteria 1–4 on saved stores. READ-ONLY on the database: it reads each store's
 * revisions and generation rows and renders the latest revision offline in the visual sandbox to run the controls guard. It never
 * writes to the database and never calls a model. With --shots <dir> it also saves header, card and cart screenshots at 1440 and
 * 390 into that directory, which must be outside the repository.
 *   npx ts-node --transpile-only scripts/store-controls-check.ts [--shots /tmp/controls-shots] <storeSlug> [<storeSlug> ...]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SOURCE_REVIEW_LABEL } from '../src/storefront-source/source-background-review';
import { currentSourceRuntime } from '../src/storefront-source/source-runtime';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import { readControls } from '../src/storefront-source/store-controls';
import { cartIconName, controlsUniqueness } from '../src/storefront-source/store-controls-library';
import { guardControlsOnSnapshot, judgeControls } from '../src/storefront-source/store-controls-guard';
import { patchConfigFile } from '../src/storefront-source/store-look';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

type Attempt = { phase?: string; status?: string; durationMs?: number };
const origin = 'https://preview.invalid';
const repository = resolve(__dirname, '..', '..', '..');

/** Header, cards and the open cart at both widths, from the store's own saved revision in demo mode (nothing is ordered). */
async function shots(dir: string, slug: string, snapshot: SourceProjectSnapshot) {
  const runtime = await currentSourceRuntime(snapshot);
  const demo = { ...runtime, files: patchConfigFile(runtime.files, config => ({ ...config, demo: true })) };
  await withVisualSandbox(demo, '', undefined, true, async context => {
    for (const width of [1440, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: join(dir, `${slug}-${width}-header.png`) });
      const card = page.locator('[data-pagosya-catalog] .menu-item').first();
      if (await card.count()) {
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(dir, `${slug}-${width}-cards.png`) });
        await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click().catch(() => undefined);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('header [data-cart-open]').first().click().catch(() => undefined);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(dir, `${slug}-${width}-cart.png`) });
      await page.close();
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const shotsAt = args[0] === '--shots' ? resolve(args[1] ?? '') : undefined;
  const slugs = shotsAt ? args.slice(2) : args;
  if (!slugs.length) throw new Error('usage: store-controls-check.ts [--shots <dir outside the repo>] <storeSlug> [...]');
  if (shotsAt) {
    if (shotsAt.startsWith(repository)) throw new Error('--shots must point outside the repository');
    mkdirSync(shotsAt, { recursive: true });
  }
  const prisma = new PrismaClient();
  const rows: Array<Record<string, unknown>> = [];
  const list: Array<{ slug: string; controls?: unknown }> = [];
  try {
    for (const slug of slugs) {
      const store = await prisma.store.findFirst({ where: { slug }, select: { id: true } });
      if (!store) { rows.push({ slug, error: 'no store' }); continue; }
      const versions = await prisma.storeSourceVersion.findMany({ where: { storeId: store.id }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
      const latest = await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
      const runs = await prisma.storeSourceGeneration.findMany({ where: { storeId: store.id }, orderBy: { createdAt: 'asc' }, select: { status: true, baseRevision: true, revision: true, attempts: true, durationMs: true } });
      // A background review row: its attempts are only review, touch and controls calls.
      const phasesOf = (attempts: unknown) => ((attempts ?? []) as Attempt[]).map(attempt => attempt.phase);
      const reviews = runs.filter(run => { const phases = phasesOf(run.attempts); return phases.length > 0 && phases.every(phase => phase === 'review' || phase === 'touch' || phase === 'controls'); });
      const lastReview = reviews.at(-1);
      const callMs = (phase: string) => ((lastReview?.attempts ?? []) as Attempt[]).filter(attempt => attempt.phase === phase).reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);
      const snapshot = latest?.snapshot as unknown as SourceProjectSnapshot | undefined;
      const controls = snapshot ? readControls(snapshot.files) : undefined;
      const verdict = snapshot && controls ? judgeControls(await guardControlsOnSnapshot(snapshot)) : undefined;
      rows.push({
        slug, revision: latest?.revision ?? null,
        reviewSaved: versions.some(version => version.label === SOURCE_REVIEW_LABEL),
        reviewRow: lastReview ? `${lastReview.status} ${lastReview.baseRevision}->${lastReview.revision ?? '-'}` : 'none',
        stageMs: lastReview?.durationMs ?? null, reviewCallMs: callMs('review'), touchCallMs: callMs('touch'), controlsCallMs: callMs('controls'),
        source: controls?.source ?? 'none', outline: controls?.shape.outline ?? '-', cartIcon: cartIconName(controls?.icons.cart),
        guard: !verdict ? '-' : verdict.drop ? `DROP ${verdict.reasons.slice(0, 2).join('; ')}` : verdict.iconSlots.length ? `icon fallback: ${verdict.iconSlots.join(',')}` : 'pass',
      });
      list.push({ slug, controls });
      if (shotsAt && snapshot) await shots(shotsAt, slug, snapshot);
    }
  } finally { await prisma.$disconnect(); }
  console.table(rows);
  const { unique, duplicates, without } = controlsUniqueness(list);
  for (const [slug, first] of duplicates) console.log(`NOT UNIQUE: ${slug} has the same outline and cart icon as ${first}`);
  if (without.length) console.log(`No controls record (left out of the uniqueness verdict): ${without.join(', ')}`);
  console.log(unique ? `Uniqueness: every store with controls has its own outline and cart icon (${list.length - without.length} compared).` : 'Uniqueness: FAILED (see above).');
  if (shotsAt) console.log(`Screenshots: ${shotsAt}`);
}

main().catch(error => { console.error(error); process.exit(1); });
```

- [ ] **Step 7: Smoke-run the script read-only on an existing store.** The run compiles it (`--transpile-only`). Type errors in the `src` modules it imports are caught by their own jest specs.
  - Run: `cd apps/api && npx ts-node --transpile-only scripts/store-controls-check.ts sgcbdd0w`
  - Expected: one row for «Café Remanso»:
    - `reviewSaved: false`, `reviewRow: none` (built before Task 1's fix);
    - `source: none`, `guard: -`;
    - and the line `No controls record (left out of the uniqueness verdict): sgcbdd0w`.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/storefront-source/store-controls-library.ts apps/api/src/storefront-source/store-controls-library.spec.ts apps/api/scripts/store-controls-check.ts
git commit -m "feat(controls): read-only live check — review rows, controls per store, the guard, uniqueness and screenshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9 (OWNER-GATED, never run without the owner's explicit approval): the live check.**
  - **Method.** The same method as the 2026-10-14 one-look live check, on the owner's ChatGPT plan.
  - **Spend.** Three new stores, then one chat request. Each build makes the author call plus the review, touch and controls calls; the chat request makes the edit call plus one controls call.

  Preconditions:
  1. The owner has applied Task 1's migration (`cd apps/api && npx prisma migrate deploy`).
  2. Every task is committed.
  3. The owner's `pnpm dev:chatgpt` is running the new code: `nest --watch` has rebuilt, and `dist/src/storefront-source/store-controls.js` exists.
  4. The live-stack check prints `[0,0]`.
  5. Nothing under `apps/api/src` is edited until the check ends.

  Steps:
  1. In the Studio, create three new stores of different kinds:
     - a café, calm (for example «Café Remanso»);
     - a pet shop (for example «Huellitas», to reach the paw icon);
     - a consultancy (for example «Brújula Consultores»).
     - Chat settings: model `auto`, maxCredits 200, motion `auto`, scrollFeel `soft`, sitePurpose `shop`.
     - Each first message stops at «Elige tu estilo» with two cards. Pick one (a `stylePick` with the proposal's `generationId` and the card index), and pick the bold card for at least one store.
     - Wait for «Guardé los cambios de tu tienda…» (revision N), then for «Pulí tu tienda: …» (revision N+1, «Revisión de YAPI»).
     - While it runs, a read-only row check shows the store's `REVIEWING` row.
  2. On one of the three stores, send «haz el carrito como una taza», and wait for its revision.
  3. Run `cd apps/api && npx ts-node --transpile-only scripts/store-controls-check.ts --shots /private/tmp/controls-shots <slug1> <slug2> <slug3>`.
  4. Judge against the spec's success criteria:
     1. Every store shows `reviewSaved: true` and `reviewRow: COMPLETED N->N+1`.
     2. The uniqueness line passes: no two stores share an outline plus a cart icon.
     3. `guard` reads `pass` (or `icon fallback: …`) for every store at both widths.
     4. `stageMs − (reviewCallMs + touchCallMs)` is no more than about 45,000 ms. The controls call ran beside the review.
     5. The chat-request store's latest revision has `source: yapi` and a cup icon (`cartIcon: cup`, or `custom` when YAPI drew its own).
  5. Send the owner the screenshots side by side: header, cards and cart at 1440 and 390 for each store.
  6. If no `REVIEWING` row appears, read the API log for these events, then follow superpowers:systematic-debugging:
     - `sep5_review_not_started`;
     - `sep5_review_kept_draft`;
     - `controls_dropped`;
     - `controls_guard_failed`.
