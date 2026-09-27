# Blob characters B1 (profile pictures and companions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dashboard user gets a blob profile picture from Blobatar, with variations 1–999 and "Otra variación". The 8 level companions become fixed blob characters in the top bar, on the Progreso page, in toasts, in the unlock celebration and on the dice board, where the runner is the user's own blob. This runs on a shared blob module that B2 and B3 can reuse.

**Architecture:** A new workspace package `@pagosya/blob-characters` has two parts. It renders Blobatar markup through `blobatar/internal`'s `_parts`, the seam Blobatar's own adapters use, because the public string API ignores `animate`. It also plays animations written as data (`[{ expression, hold, motion }]`), with body-motion keyframes in `blob-motion.css`. The dashboard serves the package and Blobatar's dist files as native ES modules through an import map; Vite bundles the same files. The API widens `profileAvatarId` to 1–999 with no schema change. It also sends `blobSeed`, a one-way digest of the user id, so the browser never holds the raw id.

**Tech Stack:** `blobatar` 2.7.0 (MIT, pinned exactly), vanilla ESM `.mjs` in the package and the dashboard, `node:test` + jsdom for unit tests, Playwright for browser tests (`apps/merchant-dashboard`), NestJS + Jest + class-validator (`apps/api`).

**Spec:** `docs/superpowers/specs/2026-09-25-blob-characters-design.md` (sub-project B1; B2 and B3 are out of scope but consume Task 1–2's module).

## Global Constraints

- Branch `feature/blobs-and-identity` (already checked out). Commit only your own paths with `git commit -m "…" -- <paths>`, running `git add <path>` first only for new files. Never push, merge, reset, stash, `git clean` or `git add -A`.
- Never touch any database: no `prisma migrate`, `db push`, `reset` or `psql`. None is needed, because `MerchantSession.profileAvatarId Int @default(1)` already holds 1–999.
- No paid AI calls. No network at runtime: Blobatar renders in-process, and the hosted Blobatar HTTP endpoint is never used.
- Merchant-facing copy is in Spanish (Bolivia, "tú"). New strings: "Otra variación", "Variación N", "Avatar del perfil", "Mi perfil".
- Reduced motion (`prefers-reduced-motion: reduce`) shows the target expression at once with no body motion. `mountBlob(…, { reducedMotion })` is the hook for a motion-off preference.
- Blobs are decorative (`aria-hidden="true"`), with one exception: the profile picture is `role="img"` and its `<title>` is the profile name. Every mood change that carries information keeps its existing text next to it.
- `blobatar` stays pinned to exactly `2.7.0` in both `packages/blob-characters/package.json` and `apps/merchant-dashboard/package.json`. The package relies on `blobatar/internal`, whose shape changes only on a Blobatar major. The dashboard dependency was added and committed with this plan.
- This repo uses pnpm (`pnpm --filter …`). The npm-only rule applies to the separate `pagosYaWeb` repo, not here.
- Existing suites stay green. They are the regression net: `tests/dashboard-smoke.spec.mjs`, `tests/rewards.spec.mjs`, `tests/auth-account.spec.mjs` and `apps/api/src/dashboard/merchant-session.service.spec.ts`.
- **Spec refinements (recorded here for the owner to note):**
  1. **8 companions, not 9.** `ADVENTURE_LEVELS` and the API's `PROGRESS_XP_THRESHOLDS` both have 8 levels (Perdiz … Perezoso). Every one of them becomes a blob.
  2. **There is no levels map to put them on.** The Horizonte map was removed from the dashboard, and `rewards.spec.mjs` asserts `#animalAdventure` is absent. The companions appear where the animals still appear: the Progreso hero, the overview summary, the top-bar XP chip, the gamification toasts, the unlock dialog, the hidden "Elige tu compañero" grid, and the leftover journey code, which is converted but still unused. The "levels map" screenshots are the Progreso page plus the companion grid, which is unhidden only for its screenshot.
  3. **Seed.** A user's blob seed is `${blobSeed}:${profileAvatarId}`. `blobSeed` is the first 16 base64url characters of `sha256("pagosya-blob:v1:" + merchantUserId)`, returned by `GET /dashboard/sessions`. The raw user id never reaches the browser, and the seed never appears in markup.
  4. **Achievement toasts.** They used a starter animal ("runner") and now use the selected companion. `GAMIFICATION_RUNNERS` and the unused runner picker are deleted.
  5. **"Otra variación"** picks a fresh random variation, saves it at once and re-rolls the three alternatives. The login profile dialog gets the same button, and its choice is saved with "Entrar al panel" like the rest of that dialog.
  6. **The "Fiesta" dance** (a CSS class on the hero PNG) becomes the hero blob's `cheer` animation.
  7. **Contrast.** Profile blobs sit on a Blobatar plate (`background: "circle"`). Companion blobs on the bright bento stages get an ink edge (a CSS `drop-shadow` outline).

## Review Focus

1. **Stored sessions and browsers still holding the old animal ids 1–4, and broken stored values.** A session with `profileAvatarId: 3` must show variation 3 as the current, pressed choice. It must keep saving and must never be migrated. A broken `localStorage` value such as `"not-a-number"` falls back to 1. (Tests in Task 3, Task 4 and Task 5.)
2. **A profile with no name.** The picture must never be an unnamed `role="img"`. It falls back to the name derived from the email, then to "Mi perfil". An API answer with no `blobSeed` shows a named placeholder, not a broken image. (Tests in Task 4 and Task 5.)
3. **Reduced motion.** The unlock celebration shows `happy` at once. `data-blob-motion` is never set, and Blobatar's idle loops compute to `animation-name: none`. (Tests in Task 2 and Task 6.)
4. **Many avatars on one screen.** A full profile menu (3 sessions and an open edit form) renders 12 blobs, all static SVG with no motion layer. Progreso has at most one animated companion. Rendering is memoized with a bound. (Tests in Task 1, Task 5 and Task 6.)
5. **Pale blobs on bright, coloured or dark surfaces.** Eyes keep at least 4.5:1 contrast against the body for any seed and tone. Every profile blob has a plate, and companion blobs carry the ink edge. (Tests in Task 1, Task 4, Task 5 and Task 6.)

---

## File Structure

- Create `packages/blob-characters/` (`@pagosya/blob-characters`, private, ESM):
  - `package.json`: exports `.` (`index.mjs` + `index.d.ts`) and `./blob-motion.css`. Depends on `blobatar` 2.7.0. Dev dependencies are `jsdom` and `typescript`.
  - `render.mjs`: `EXPRESSIONS`, `EXPRESSION_NAMES`, `SHAPES`, `blobOptions`, `blobSvg`, `blobDataUri`, `blobCacheSize`.
  - `player.mjs`: `MOTIONS`, `ANIMATIONS`, `validateSteps`, `runAnimation`, `prefersReducedMotion`, `mountBlob`.
  - `index.mjs`: re-exports both files.
  - `index.d.ts`: types for B2 (Studio, TypeScript) and B3 (checkout).
  - `blob-motion.css`: `bounce`, `hop`, `shake`, `celebrate`, `talk` keyframes, plus reduced motion.
  - `test/render.test.mjs`, `test/player.test.mjs`, `test/types.check.ts`.
- Create `apps/api/src/dashboard/profile-blob-seed.ts` (+ `.spec.ts`): `profileBlobSeed()` and `MAX_PROFILE_VARIATION`.
- Modify `apps/api/src/dashboard/merchant-session.service.ts`: the 1–999 check and `blobSeed` in `listActiveSessions`.
- Modify `apps/api/src/dashboard/dto/update-merchant-session.dto.ts`: `@Max(999)`. Create `update-merchant-session.dto.spec.ts`.
- Modify `apps/merchant-dashboard/package.json`: adds `@pagosya/blob-characters`.
- Modify `apps/merchant-dashboard/server.mjs`: `/vendor/blobatar/*` and `/vendor/blob-characters/*` whitelists, and `/src/profile-blob.mjs`.
- Modify `apps/merchant-dashboard/vite.config.mjs`: aliases for the `/vendor/*` URLs.
- Modify `apps/merchant-dashboard/index.html`: import map, the two stylesheets, the picker containers, the "Otra variación" buttons, and blob slots replacing the companion `<img>`s.
- Create `apps/merchant-dashboard/src/profile-blob.mjs` (+ `profile-blob.test.mjs`): variations, choices, profile blob markup and URI.
- Rewrite `apps/merchant-dashboard/src/companions.mjs` (+ `companions.test.mjs`): levels with `look` and `expression`, `companionSeed`, `companionBlobHtml` and `companionBlobUri`.
- Modify `apps/merchant-dashboard/src/dashboard.js`: profile editor, login dialog, sessions list, top bar, gamification surfaces and unlock celebration.
- Modify `apps/merchant-dashboard/src/rewards-panel.mjs`: the dice runner image, the Fiesta cheer and `renderBoard`.
- Modify `apps/merchant-dashboard/src/dashboard.css`: blob slots, placeholder, shuffle buttons and ink edge. Removes the dead animal-crop and dance rules.
- Create `apps/merchant-dashboard/tests/blob-characters.spec.mjs`. Modify `tests/auth-account.spec.mjs` so it chooses by position, not by animal id.

---

### Task 1: The blob module: rendering

**Files:**
- Create: `packages/blob-characters/package.json`, `packages/blob-characters/render.mjs`, `packages/blob-characters/index.mjs`
- Test: `packages/blob-characters/test/render.test.mjs`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Consumes: `blobatar@2.7.0` — `_parts(name, opts)` and `serializeVars(vars)` from `blobatar/internal`. The 14 expression values come from `blobatar/expression`.
- Produces:
  - `EXPRESSIONS: Readonly<Record<ExpressionName, Expression>>` and `EXPRESSION_NAMES: readonly string[]` (14 names: idle, happy, sad, mad, surprised, wink, sleepy, smug, unsure, scared, love, shy, sick, thinking).
  - `SHAPES: Readonly<Record<"round"|"organic"|"boxy"|"capsule"|"nub"|"cloud"|"droplet"|"hexagon"|"sun"|"triangle", number>>`: the trait position that pins each silhouette.
  - `blobOptions({ look?, expression?, plate?, animate? }) → BlobatarOptions`. It throws a `TypeError` on an unknown expression or shape.
  - `blobSvg(seed: string, { look?: { shape?, hue?, tone? }, expression? = "idle", title?, plate? = false, animate?: false|"hover"|"always", className? }) → string`:
    - The root is `<svg class="blob-figure …">`.
    - With a title it is `role="img"` plus an escaped `<title>`. Otherwise it is `aria-hidden="true" focusable="false"`.
    - A plate adds `<path class="blob-plate" …>`.
    - Animated markup has `<g class="mo-root …">` and the `--mo-*` custom properties on the `<svg>`.
    - Results are memoized, with at most 256 entries.
  - `blobDataUri(seed, { look?, expression?, plate? }) → "data:image/svg+xml,…"`: static and decorative.
  - `blobCacheSize() → number`.

- [ ] **Step 1: Create the package manifest and link it**

Create `packages/blob-characters/package.json`:

```json
{
  "name": "@pagosya/blob-characters",
  "version": "0.1.0",
  "private": true,
  "description": "pagosYa's blob characters: Blobatar rendering plus a small animation player (expressions + body motion)",
  "type": "module",
  "main": "index.mjs",
  "types": "index.d.ts",
  "exports": {
    ".": { "types": "./index.d.ts", "default": "./index.mjs" },
    "./blob-motion.css": "./blob-motion.css",
    "./package.json": "./package.json"
  },
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "typecheck": "tsc --noEmit --strict --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler test/types.check.ts"
  },
  "dependencies": {
    "blobatar": "2.7.0"
  },
  "devDependencies": {
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3"
  }
}
```

Run: `pnpm install` (from the repo root)
Expected: `packages/blob-characters/node_modules/blobatar` exists, and `pnpm-lock.yaml` gains an `importers: packages/blob-characters` entry.

- [ ] **Step 2: Write the failing tests**

Create `packages/blob-characters/test/render.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { _layout } from "blobatar/internal";
import { EXPRESSION_NAMES, SHAPES, blobCacheSize, blobDataUri, blobSvg } from "../render.mjs";

test("the same seed always renders the same blob, and different seeds differ", () => {
  assert.equal(blobSvg("u1:7"), blobSvg("u1:7"));
  assert.notEqual(blobSvg("u1:7"), blobSvg("u1:8"));
  assert.notEqual(blobSvg("u1:7"), blobSvg("u2:7"));
});

test("all 14 expressions render and change the figure", () => {
  assert.equal(EXPRESSION_NAMES.length, 14);
  const idle = blobSvg("seed", { expression: "idle" });
  for (const name of EXPRESSION_NAMES.filter((name) => name !== "idle")) assert.notEqual(blobSvg("seed", { expression: name }), idle, name);
  assert.throws(() => blobSvg("seed", { expression: "dancing" }), /Unknown blob expression/);
  assert.throws(() => blobSvg("seed", { expression: "toString" }), /Unknown blob expression/);
});

test("a look pins the silhouette whatever the seed", () => {
  for (const [shape, position] of Object.entries(SHAPES)) {
    for (const seed of ["a", "b", "c"]) assert.equal(_layout(seed, { traits: { shape: position } }).shape, shape, `${shape} from ${seed}`);
  }
  assert.throws(() => blobSvg("seed", { look: { shape: "star" } }), /Unknown blob shape/);
});

test("a titled blob is a named image; the title is escaped", () => {
  const svg = blobSvg("seed", { title: ' Ana <b>"Jefa"</b> ' });
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /<title>Ana &lt;b&gt;&quot;Jefa&quot;&lt;\/b&gt;<\/title>/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("an untitled or blank-titled blob is decorative", () => {
  for (const title of [undefined, "", "   "]) {
    const svg = blobSvg("seed", { title });
    assert.match(svg, /^<svg [^>]*aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(svg, /<title>|role="img"/);
  }
});

test("a plate puts a circle behind the figure", () => {
  assert.match(blobSvg("seed", { plate: true }), /<path class="blob-plate" d="M100 50C/);
  assert.doesNotMatch(blobSvg("seed"), /blob-plate/);
});

test("static markup has no motion layer; animated markup has it and keeps the figure identical across expressions", () => {
  assert.doesNotMatch(blobSvg("seed"), /mo-root|style=/);
  const idle = blobSvg("seed", { animate: "always" });
  const happy = blobSvg("seed", { animate: "always", expression: "happy" });
  assert.match(idle, /<g class="mo-root mo-always">/);
  assert.match(happy, /<g class="mo-root mo-always mo-expr">/);
  assert.match(happy, / style="--mo-phase:/);
  const figure = (svg) => svg.slice(svg.indexOf("<g class="));
  assert.equal(figure(idle).replace(/^<g class="[^"]*">/, ""), figure(happy).replace(/^<g class="[^"]*">/, ""));
});

test("eyes keep contrast against the body for any seed and any tone", () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (let index = 1; index <= 300; index++) {
    for (const tone of [undefined, 0, 0.4, 0.75, 0.999]) {
      const { palette } = _layout(`contrast:${index}`, tone === undefined ? {} : { tone });
      assert.ok(ratio(palette.head, palette.eye) >= 4.5, `seed ${index} tone ${tone}: ${palette.head} vs ${palette.eye}`);
    }
  }
});

test("rendering is memoized and the memo stays bounded", () => {
  for (let index = 0; index < 600; index++) blobSvg(`crowd:${index}`);
  assert.ok(blobCacheSize() <= 256);
  const first = blobSvg("crowd:599");
  assert.equal(blobSvg("crowd:599"), first);
});

test("a data URI carries the same static, decorative markup", () => {
  const uri = blobDataUri("seed", { plate: true });
  assert.ok(uri.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
  assert.equal(svg, blobSvg("seed", { plate: true }));
  assert.doesNotMatch(uri, /["'<>]/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @pagosya/blob-characters test`
Expected: FAIL with `Cannot find module '…/packages/blob-characters/render.mjs'`.

- [ ] **Step 4: Implement**

Create `packages/blob-characters/render.mjs`:

```js
// Blob characters (B1): renders a Blobatar as inline SVG markup. Everything is local and deterministic:
// the same seed and options always give the same markup, and nothing touches the network.
//
// Built on `blobatar/internal`'s `_parts` (the seam Blobatar's own React/Vue adapters use) because the
// public string API ignores `animate`. `blobatar` is pinned to an exact version in package.json; the
// tests in test/render.test.mjs pin the parts of that seam this file relies on.
import { _parts, serializeVars } from "blobatar/internal";
import { happy, idle, love, mad, sad, scared, shy, sick, sleepy, smug, surprised, thinking, unsure, wink } from "blobatar/expression";

/** Blobatar's 14 held expressions, by name. */
export const EXPRESSIONS = Object.freeze({ idle, happy, sad, mad, surprised, wink, sleepy, smug, unsure, scared, love, shy, sick, thinking });
export const EXPRESSION_NAMES = Object.freeze(Object.keys(EXPRESSIONS));

/** The `traits.shape` position that pins each of Blobatar 2.7's ten silhouettes (frozen within the major). */
export const SHAPES = Object.freeze({ round: 0.1, organic: 0.3, boxy: 0.5, capsule: 0.65, nub: 0.74, cloud: 0.82, droplet: 0.88, hexagon: 0.93, sun: 0.96, triangle: 0.99 });

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Options for `_parts`, validated. Throws a TypeError on an unknown expression or shape (a programming error). */
export function blobOptions({ look = {}, expression = "idle", plate = false, animate = false } = {}) {
  if (!Object.hasOwn(EXPRESSIONS, expression)) throw new TypeError(`Unknown blob expression: ${expression}`);
  const options = { expression: EXPRESSIONS[expression] };
  if (look.shape !== undefined) {
    if (!Object.hasOwn(SHAPES, look.shape)) throw new TypeError(`Unknown blob shape: ${look.shape}`);
    options.traits = { shape: SHAPES[look.shape] };
  }
  if (look.hue !== undefined) options.hue = look.hue;
  if (look.tone !== undefined) options.tone = look.tone;
  if (plate) options.background = "circle";
  if (animate) options.animate = animate === "always" ? "always" : "hover";
  return options;
}

const cache = new Map();
const CACHE_LIMIT = 256;
/** How many rendered blobs are memoized (bounded, least recently used out first). */
export const blobCacheSize = () => cache.size;

/**
 * One blob as an `<svg>` string.
 * - `title` given: `role="img"` with a `<title>` (the accessible name). No title: `aria-hidden`, decorative.
 * - `plate`: a circle behind the figure, so pale blobs still read on any background.
 * - `animate` ("hover" | "always"): markup for Blobatar's idle layer (needs blobatar/motion.css) and for `mountBlob`.
 */
export function blobSvg(seed, { look, expression = "idle", title, plate = false, animate = false, className = "" } = {}) {
  const key = JSON.stringify([String(seed), look ?? null, expression, title ?? null, plate, animate, className]);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const parts = _parts(String(seed), blobOptions({ look, expression, plate, animate }));
  const label = typeof title === "string" ? title.trim() : "";
  const classes = ["blob-figure", className].filter(Boolean).join(" ");
  const a11y = label ? 'role="img"' : 'aria-hidden="true" focusable="false"';
  const style = parts.vars ? ` style="${escapeXml(serializeVars(parts.vars))}"` : "";
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="${escapeXml(classes)}" ${a11y}${style}>`
    + (label ? `<title>${escapeXml(label)}</title>` : "")
    + (parts.bg ? `<path class="blob-plate" d="${parts.bg.d}" fill="${parts.bg.fill}"/>` : "")
    + `<g${parts.cls ? ` class="${parts.cls}"` : ""}>${parts.inner}</g></svg>`;
  cache.set(key, markup);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return markup;
}

/** A static, decorative blob as a `data:` URI, for `background-image` or `<img src>`. */
export function blobDataUri(seed, { look, expression = "idle", plate = false } = {}) {
  return `data:image/svg+xml,${encodeURIComponent(blobSvg(seed, { look, expression, plate }))}`;
}
```

Create `packages/blob-characters/index.mjs`:

```js
export { EXPRESSIONS, EXPRESSION_NAMES, SHAPES, blobCacheSize, blobDataUri, blobOptions, blobSvg } from "./render.mjs";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @pagosya/blob-characters test`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/blob-characters/package.json packages/blob-characters/render.mjs packages/blob-characters/index.mjs packages/blob-characters/test/render.test.mjs
git commit -m "feat(blobs): @pagosya/blob-characters renders deterministic Blobatar markup (named or decorative, plate, pinned looks, 14 expressions, idle-ready animated markup, bounded memo)" -- packages/blob-characters/package.json packages/blob-characters/render.mjs packages/blob-characters/index.mjs packages/blob-characters/test/render.test.mjs pnpm-lock.yaml
```

---

### Task 2: The blob module: animation player, body motion and types

**Files:**
- Create: `packages/blob-characters/player.mjs`, `packages/blob-characters/blob-motion.css`, `packages/blob-characters/index.d.ts`
- Modify: `packages/blob-characters/index.mjs`
- Test: `packages/blob-characters/test/player.test.mjs`, `packages/blob-characters/test/types.check.ts`

**Interfaces:**
- Consumes (Task 1): `EXPRESSIONS`, `blobOptions(…)`, `blobSvg(…)`; `_parts`/`serializeVars` from `blobatar/internal`.
- Produces (B1 uses `mountBlob`, `ANIMATIONS.unlock` and `ANIMATIONS.cheer`; B2 and B3 use the rest):
  - `MOTIONS = ["bounce", "hop", "shake", "celebrate", "talk"]`.
  - `ANIMATIONS: { cheer, unlock, newOrder, paymentSuccess, paymentFailed, waiting, talking }`, each an array of `{ expression, hold, motion }`.
  - `validateSteps(steps) → { expression, hold, motion }[]`. It throws `TypeError("Step N: …")`.
  - `runAnimation(steps, { loop? = false, rest? = "idle", reducedMotion? = false }, io: { apply(step), wait(ms): Promise<void>, cancelled(): boolean }) → Promise<void>`.
  - `prefersReducedMotion() → boolean`.
  - `mountBlob(host: HTMLElement, { seed, look?, expression? = "idle", title?, plate?, animate? = "always" | "hover", reducedMotion? }) → BlobHandle`, where `BlobHandle` is `{ svg, expression (getter), setRest(name), play(steps, { loop?, rest? }) → Promise<void>, stop(), destroy() }`. The host gets the class `blob-host` and the attributes `data-blob-expression="<name>"` and `data-blob-motion="<motion>"` (the latter only while a motion plays).
  - CSS (`@pagosya/blob-characters/blob-motion.css`): `.blob-host[data-blob-motion="…"] > .blob-figure` keyframes `blob-bounce`, `blob-hop`, `blob-shake`, `blob-celebrate` (with confetti dots on `::after`) and `blob-talk`. All of them are off under reduced motion.
  - B2 hook: YAPI "listening" attaches Blobatar's `gaze` (`blobatar/gaze` + `gaze.css`) to `handle.svg`. B1 does not load gaze.
  - Types: `index.d.ts` exports `ExpressionName`, `BlobShape`, `MotionName`, `AnimationName`, `BlobLook`, `BlobRenderOptions`, `AnimationStep`, `MountOptions` and `BlobHandle`, plus every runtime export.

- [ ] **Step 1: Write the failing tests**

Create `packages/blob-characters/test/player.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { ANIMATIONS, MOTIONS, mountBlob, runAnimation, validateSteps } from "../player.mjs";

function recorder({ cancelAfter = Infinity } = {}) {
  const log = [];
  let applied = 0;
  return {
    log,
    io: {
      apply: (step) => { log.push(["apply", step.expression, step.motion]); applied += 1; },
      wait: async (ms) => { log.push(["wait", ms]); },
      cancelled: () => applied >= cancelAfter,
    },
  };
}

test("an animation runs its steps with their holds, then returns to rest", async () => {
  const { log, io } = recorder();
  await runAnimation([{ expression: "surprised", hold: 600, motion: "hop" }, { expression: "happy", hold: 1400, motion: "celebrate" }], { rest: "smug" }, io);
  assert.deepEqual(log, [
    ["apply", "surprised", "hop"], ["wait", 600],
    ["apply", "happy", "celebrate"], ["wait", 1400],
    ["apply", "smug", null],
  ]);
});

test("rest defaults to idle and a step without motion has none", async () => {
  const { log, io } = recorder();
  await runAnimation([{ expression: "thinking", hold: 10 }], {}, io);
  assert.deepEqual(log, [["apply", "thinking", null], ["wait", 10], ["apply", "idle", null]]);
});

test("a looped animation repeats until cancelled and never jumps to rest itself", async () => {
  const { log, io } = recorder({ cancelAfter: 5 });
  await runAnimation(ANIMATIONS.talking, { loop: true }, io);
  assert.deepEqual(log.filter(([kind]) => kind === "apply").map(([, expression]) => expression), ["idle", "surprised", "idle", "surprised", "idle"]);
});

test("reduced motion jumps to the final expression with no motion, holds, then rests", async () => {
  const { log, io } = recorder();
  await runAnimation(ANIMATIONS.unlock, { rest: "wink", reducedMotion: true }, io);
  assert.deepEqual(log, [["apply", "happy", null], ["wait", 2000], ["apply", "wink", null]]);
});

test("reduced motion on a loop just holds the expression", async () => {
  const { log, io } = recorder();
  await runAnimation(ANIMATIONS.waiting, { loop: true, reducedMotion: true }, io);
  assert.deepEqual(log, [["apply", "thinking", null]]);
});

test("bad animations are refused with the step that is wrong", () => {
  assert.throws(() => validateSteps([]), /at least one step/);
  assert.throws(() => validateSteps([{ expression: "dance", hold: 1 }]), /Step 0: unknown expression/);
  assert.throws(() => validateSteps([{ expression: "happy", hold: 1 }, { expression: "happy", hold: -1 }]), /Step 1: hold/);
  assert.throws(() => validateSteps([{ expression: "happy", hold: 1, motion: "spin" }]), /Step 0: unknown motion/);
  assert.deepEqual(MOTIONS, ["bounce", "hop", "shake", "celebrate", "talk"]);
  for (const [name, steps] of Object.entries(ANIMATIONS)) assert.doesNotThrow(() => validateSteps(steps), name);
});

function dom() {
  const { window } = new JSDOM("<!doctype html><span id=host></span>");
  globalThis.matchMedia = () => ({ matches: false });
  return window.document.getElementById("host");
}

test("mountBlob changes expression without replacing the figure, and sets body motion on the host", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", expression: "idle" });
  const figure = blob.svg.querySelector(".mo-bob");
  assert.equal(host.classList.contains("blob-host"), true);
  assert.equal(blob.svg.getAttribute("aria-hidden"), "true");
  const played = blob.play([{ expression: "happy", hold: 5, motion: "hop" }]);
  assert.equal(host.getAttribute("data-blob-motion"), "hop");
  assert.equal(host.getAttribute("data-blob-expression"), "happy");
  assert.match(blob.svg.querySelector("g.mo-root").getAttribute("class"), /mo-expr/);
  assert.match(blob.svg.getAttribute("style"), /--mo-esx:/);
  await played;
  assert.equal(blob.expression, "idle");
  assert.equal(host.getAttribute("data-blob-expression"), "idle");
  assert.equal(host.hasAttribute("data-blob-motion"), false);
  assert.equal(blob.svg.querySelector(".mo-bob"), figure);
});

test("a new animation cancels the running one; stop returns to rest", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", expression: "smug" });
  const first = blob.play([{ expression: "thinking", hold: 20 }], { loop: true });
  const second = blob.play([{ expression: "surprised", hold: 5, motion: "hop" }]);
  await second;
  assert.equal(blob.expression, "smug");
  void blob.play([{ expression: "thinking", hold: 20 }], { loop: true });
  assert.equal(blob.expression, "thinking");
  blob.stop();
  assert.equal(blob.expression, "smug");
  await first;
});

test("with reduced motion, mountBlob shows the target expression and never sets body motion", async () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "pagosya:test", reducedMotion: true });
  const played = blob.play([{ expression: "surprised", hold: 5, motion: "hop" }, { expression: "love", hold: 5, motion: "celebrate" }]);
  assert.equal(blob.expression, "love");
  assert.equal(host.hasAttribute("data-blob-motion"), false);
  await played;
  assert.equal(blob.expression, "idle");
});

test("a titled mounted blob keeps its accessible name", () => {
  const host = dom();
  const blob = mountBlob(host, { seed: "s", title: "Ana" });
  assert.equal(blob.svg.getAttribute("role"), "img");
  assert.equal(blob.svg.querySelector("title").textContent, "Ana");
});

test("blob-motion.css defines every motion and turns them all off for reduced motion", async () => {
  const css = await readFile(new URL("../blob-motion.css", import.meta.url), "utf8");
  for (const motion of MOTIONS) {
    assert.match(css, new RegExp(`@keyframes blob-${motion} `));
    assert.match(css, new RegExp(`\\[data-blob-motion="${motion}"\\] > \\.blob-figure \\{ animation: blob-${motion} `));
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.blob-host\[data-blob-motion\] > \.blob-figure \{ animation: none; \}/);
});
```

Create `packages/blob-characters/test/types.check.ts`. It is not run; it is only type-checked, so it proves the declarations match how B2 and B3 will call the module:

```ts
import { ANIMATIONS, blobSvg, mountBlob, type AnimationStep } from "@pagosya/blob-characters";
const steps: AnimationStep[] = [{ expression: "happy", hold: 100, motion: "celebrate" }];
const handle = mountBlob(document.createElement("span"), { seed: "x", look: { shape: "sun", hue: 40 } });
void handle.play(steps, { loop: false });
void handle.play(ANIMATIONS.paymentFailed);
export const markup: string = blobSvg("x", { expression: "thinking", animate: "always" });
// @ts-expect-error an unknown expression is a type error for TypeScript consumers
blobSvg("x", { expression: "dancing" });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pagosya/blob-characters test && pnpm --filter @pagosya/blob-characters run typecheck`
Expected: FAIL with `Cannot find module '…/packages/blob-characters/player.mjs'`.

- [ ] **Step 3: Implement**

Create `packages/blob-characters/player.mjs`:

```js
// Blob characters (B1): the animation player. An animation is data — `[{ expression, hold, motion }]` — played
// once or looped, and it always ends back on the blob's resting expression. Expressions morph through Blobatar's
// own CSS (blobatar/motion.css); body motion comes from blob-motion.css (bounce, hop, shake, celebrate, talk).
// Reduced motion shows the target expression at once, with no body motion.
import { _parts, serializeVars } from "blobatar/internal";
import { EXPRESSIONS, blobOptions, blobSvg } from "./render.mjs";

export const MOTIONS = Object.freeze(["bounce", "hop", "shake", "celebrate", "talk"]);

/** The moods from the Blob characters spec (section 4), as data. B1 uses `unlock` and `cheer`; B2 and B3 use the rest. */
export const ANIMATIONS = Object.freeze({
  cheer: Object.freeze([{ expression: "happy", hold: 900, motion: "celebrate" }]),
  unlock: Object.freeze([{ expression: "surprised", hold: 600, motion: "hop" }, { expression: "happy", hold: 1400, motion: "celebrate" }]),
  newOrder: Object.freeze([{ expression: "surprised", hold: 700, motion: "hop" }]),
  paymentSuccess: Object.freeze([{ expression: "happy", hold: 900, motion: "celebrate" }, { expression: "love", hold: 1200, motion: null }]),
  paymentFailed: Object.freeze([{ expression: "unsure", hold: 500, motion: null }, { expression: "sad", hold: 1400, motion: "shake" }]),
  waiting: Object.freeze([{ expression: "thinking", hold: 1800, motion: null }]),
  talking: Object.freeze([{ expression: "idle", hold: 360, motion: "talk" }, { expression: "surprised", hold: 280, motion: "talk" }]),
});

/** Normalizes and checks an animation. Throws a TypeError naming the bad step (a programming error, never user input). */
export function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new TypeError("A blob animation needs at least one step");
  return steps.map((step, index) => {
    const { expression, hold, motion = null } = step ?? {};
    if (!Object.hasOwn(EXPRESSIONS, expression)) throw new TypeError(`Step ${index}: unknown expression ${expression}`);
    if (!Number.isFinite(hold) || hold < 0) throw new TypeError(`Step ${index}: hold must be milliseconds >= 0`);
    if (motion !== null && !MOTIONS.includes(motion)) throw new TypeError(`Step ${index}: unknown motion ${motion}`);
    return { expression, hold, motion };
  });
}

/**
 * Runs an animation against `io` ({ apply(step), wait(ms), cancelled() }), which `mountBlob` wires to the DOM
 * and tests wire to a log. Once: every step, then `rest`. Loop: until cancelled. Reduced motion: the last
 * step's expression at once with no motion, held for the animation's length, then `rest` (loops stay on it).
 */
export async function runAnimation(steps, { loop = false, rest = "idle", reducedMotion = false } = {}, io) {
  const plan = validateSteps(steps);
  if (!Object.hasOwn(EXPRESSIONS, rest)) throw new TypeError(`Unknown rest expression: ${rest}`);
  if (reducedMotion) {
    io.apply({ expression: plan[plan.length - 1].expression, motion: null });
    if (loop) return;
    await io.wait(plan.reduce((total, step) => total + step.hold, 0));
    if (!io.cancelled()) io.apply({ expression: rest, motion: null });
    return;
  }
  do {
    for (const step of plan) {
      io.apply(step);
      await io.wait(step.hold);
      if (io.cancelled()) return;
    }
  } while (loop);
  io.apply({ expression: rest, motion: null });
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Renders an animated blob into `host` and returns a handle to play animations on it. The `<svg>` subtree is
 * never replaced after mounting — only the root group's class and the svg's custom properties change — which
 * is what lets Blobatar's CSS morph between expressions.
 * `reducedMotion` overrides the media query (a motion-off preference); omitted, the media query decides.
 */
export function mountBlob(host, { seed, look, expression = "idle", title, plate = false, animate = "always", reducedMotion } = {}) {
  const mode = animate === "hover" ? "hover" : "always";
  host.classList.add("blob-host");
  host.innerHTML = blobSvg(seed, { look, expression, title, plate, animate: mode });
  host.setAttribute("data-blob-expression", expression);
  const svg = host.querySelector("svg");
  const root = svg.querySelector("g.mo-root");
  let rest = expression;
  let current = expression;
  let run = 0;
  const reduce = () => reducedMotion ?? prefersReducedMotion();

  function setExpression(name) {
    const parts = _parts(String(seed), blobOptions({ look, expression: name, plate, animate: mode }));
    root.setAttribute("class", parts.cls);
    svg.setAttribute("style", serializeVars(parts.vars));
    host.setAttribute("data-blob-expression", name);
    current = name;
  }
  function setMotion(name) {
    host.removeAttribute("data-blob-motion");
    if (!name || reduce()) return;
    void host.offsetWidth; // restarts the keyframes when the same motion plays twice in a row
    host.setAttribute("data-blob-motion", name);
  }
  function apply({ expression: next, motion }) {
    if (next !== current) setExpression(next);
    setMotion(motion);
  }

  return {
    svg,
    get expression() { return current; },
    setRest(name) {
      if (!Object.hasOwn(EXPRESSIONS, name)) throw new TypeError(`Unknown rest expression: ${name}`);
      rest = name;
    },
    play(steps, { loop = false, rest: restOverride } = {}) {
      const token = ++run;
      return runAnimation(steps, { loop, rest: restOverride ?? rest, reducedMotion: reduce() }, {
        apply: (step) => { if (token === run) apply(step); },
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        cancelled: () => token !== run,
      });
    },
    stop() {
      run += 1;
      apply({ expression: rest, motion: null });
    },
    destroy() {
      run += 1;
      host.removeAttribute("data-blob-motion");
      host.removeAttribute("data-blob-expression");
      host.replaceChildren();
    },
  };
}
```

Create `packages/blob-characters/blob-motion.css`:

```css
/* @pagosya/blob-characters: body motion layered over Blobatar's idle layer (load blobatar/motion.css too).
 * mountBlob() sets data-blob-motion on the host. Each motion plays once, except talk, which repeats until cleared. */
.blob-host { position: relative; display: inline-block; }
.blob-host > .blob-figure { display: block; width: 100%; height: 100%; overflow: visible; transform-origin: 50% 85%; }
.blob-host[data-blob-motion="bounce"] > .blob-figure { animation: blob-bounce 600ms cubic-bezier(.3, 1.4, .5, 1) both; }
.blob-host[data-blob-motion="hop"] > .blob-figure { animation: blob-hop 480ms cubic-bezier(.3, 1.2, .5, 1) both; }
.blob-host[data-blob-motion="shake"] > .blob-figure { animation: blob-shake 420ms ease-in-out both; }
.blob-host[data-blob-motion="celebrate"] > .blob-figure { animation: blob-celebrate 900ms cubic-bezier(.3, 1.3, .5, 1) both; }
.blob-host[data-blob-motion="talk"] > .blob-figure { animation: blob-talk 360ms ease-in-out infinite; }
/* celebrate: a few confetti dots burst around the blob. */
.blob-host[data-blob-motion="celebrate"]::after {
  content: ""; position: absolute; inset: -12%; pointer-events: none;
  background:
    radial-gradient(circle at 16% 34%, #f27a62 0 3%, transparent 3.5%),
    radial-gradient(circle at 84% 24%, #7fd3c3 0 3%, transparent 3.5%),
    radial-gradient(circle at 30% 8%, #818cf8 0 2.5%, transparent 3%),
    radial-gradient(circle at 70% 6%, #ffbd59 0 3%, transparent 3.5%),
    radial-gradient(circle at 52% 0%, #15352f 0 2%, transparent 2.5%);
  animation: blob-confetti 900ms ease-out both;
}
@keyframes blob-bounce { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-8%); } 70% { transform: translateY(2%); } }
@keyframes blob-hop { 0%, 100% { transform: translateY(0) scale(1, 1); } 20% { transform: translateY(0) scale(1.08, .9); } 55% { transform: translateY(-18%) scale(.94, 1.08); } 85% { transform: translateY(0) scale(1.06, .94); } }
@keyframes blob-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-5%); } 40%, 80% { transform: translateX(5%); } }
@keyframes blob-celebrate { 0%, 100% { transform: scale(1, 1); } 25% { transform: scale(1.14, .86); } 50% { transform: translateY(-10%) scale(.9, 1.12); } 75% { transform: scale(1.05, .96); } }
@keyframes blob-talk { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, .96); } }
@keyframes blob-confetti { 0% { opacity: 0; transform: translateY(18%) scale(.6); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(-12%) scale(1.1); } }
@media (prefers-reduced-motion: reduce) {
  .blob-host[data-blob-motion] > .blob-figure { animation: none; }
  .blob-host[data-blob-motion]::after { content: none; animation: none; }
}
```

Create `packages/blob-characters/index.d.ts`:

```ts
// Types for TypeScript consumers (Studio in B2, checkout in B3). The runtime is plain ESM in index.mjs.
import type { BlobatarOptions, Expression } from "blobatar";

export type ExpressionName = "idle" | "happy" | "sad" | "mad" | "surprised" | "wink" | "sleepy" | "smug" | "unsure" | "scared" | "love" | "shy" | "sick" | "thinking";
export type BlobShape = "round" | "organic" | "boxy" | "capsule" | "nub" | "cloud" | "droplet" | "hexagon" | "sun" | "triangle";
export type MotionName = "bounce" | "hop" | "shake" | "celebrate" | "talk";
export type AnimationName = "cheer" | "unlock" | "newOrder" | "paymentSuccess" | "paymentFailed" | "waiting" | "talking";

export interface BlobLook { shape?: BlobShape; hue?: number; tone?: number }
export interface BlobRenderOptions { look?: BlobLook; expression?: ExpressionName; title?: string; plate?: boolean; animate?: false | "hover" | "always"; className?: string }
export interface AnimationStep { expression: ExpressionName; hold: number; motion?: MotionName | null }
export interface ResolvedStep { expression: ExpressionName; hold: number; motion: MotionName | null }
export interface RunOptions { loop?: boolean; rest?: ExpressionName; reducedMotion?: boolean }
export interface AnimationIO { apply(step: { expression: ExpressionName; motion: MotionName | null }): void; wait(ms: number): Promise<void>; cancelled(): boolean }
export interface MountOptions { seed: string; look?: BlobLook; expression?: ExpressionName; title?: string; plate?: boolean; animate?: "hover" | "always"; reducedMotion?: boolean }
export interface BlobHandle {
  readonly svg: SVGSVGElement;
  readonly expression: ExpressionName;
  setRest(name: ExpressionName): void;
  play(steps: readonly AnimationStep[], options?: { loop?: boolean; rest?: ExpressionName }): Promise<void>;
  stop(): void;
  destroy(): void;
}

export declare const EXPRESSIONS: Readonly<Record<ExpressionName, Expression>>;
export declare const EXPRESSION_NAMES: readonly ExpressionName[];
export declare const SHAPES: Readonly<Record<BlobShape, number>>;
export declare const MOTIONS: readonly MotionName[];
export declare const ANIMATIONS: Readonly<Record<AnimationName, readonly AnimationStep[]>>;
export declare function blobOptions(options?: { look?: BlobLook; expression?: ExpressionName; plate?: boolean; animate?: false | "hover" | "always" }): BlobatarOptions;
export declare function blobSvg(seed: string, options?: BlobRenderOptions): string;
export declare function blobDataUri(seed: string, options?: { look?: BlobLook; expression?: ExpressionName; plate?: boolean }): string;
export declare function blobCacheSize(): number;
export declare function validateSteps(steps: readonly AnimationStep[]): ResolvedStep[];
export declare function runAnimation(steps: readonly AnimationStep[], options: RunOptions, io: AnimationIO): Promise<void>;
export declare function prefersReducedMotion(): boolean;
export declare function mountBlob(host: HTMLElement, options: MountOptions): BlobHandle;
```

Replace the whole of `packages/blob-characters/index.mjs` with:

```js
export { EXPRESSIONS, EXPRESSION_NAMES, SHAPES, blobCacheSize, blobDataUri, blobOptions, blobSvg } from "./render.mjs";
export { ANIMATIONS, MOTIONS, mountBlob, prefersReducedMotion, runAnimation, validateSteps } from "./player.mjs";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @pagosya/blob-characters test && pnpm --filter @pagosya/blob-characters run typecheck && npx eslint packages/blob-characters`
Expected: PASS, 21 tests. `tsc` exits 0 with no output. There are 0 ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/blob-characters/player.mjs packages/blob-characters/blob-motion.css packages/blob-characters/index.d.ts packages/blob-characters/test/player.test.mjs packages/blob-characters/test/types.check.ts
git commit -m "feat(blobs): animation player — animations as data [{ expression, hold, motion }], once or looped, always back to rest; bounce/hop/shake/celebrate/talk keyframes; reduced motion jumps to the target; types for B2/B3" -- packages/blob-characters
```

---

### Task 3: API — variations 1–999 and the blob seed

**Files:**
- Create: `apps/api/src/dashboard/profile-blob-seed.ts`, `apps/api/src/dashboard/profile-blob-seed.spec.ts`, `apps/api/src/dashboard/dto/update-merchant-session.dto.spec.ts`
- Modify: `apps/api/src/dashboard/merchant-session.service.ts` (imports, `listActiveSessions` return and the `updateSessionIdentity` range check), `apps/api/src/dashboard/dto/update-merchant-session.dto.ts`, `apps/api/src/dashboard/merchant-session.service.spec.ts`

**Interfaces:**
- Produces:
  - `profileBlobSeed(merchantUserId: string): string`: 16 base64url characters, stable and one-way.
  - `MAX_PROFILE_VARIATION = 999`.
  - `GET /dashboard/sessions` now also returns `blobSeed: string`.
  - `PATCH /dashboard/sessions/:id` accepts any integer `profileAvatarId` from 1 to 999. Anything else gets 400 `"El avatar del perfil no es válido"` from the service, or a class-validator error from the DTO.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/dashboard/profile-blob-seed.spec.ts`:

```ts
import { MAX_PROFILE_VARIATION, profileBlobSeed } from "./profile-blob-seed";

describe("profileBlobSeed", () => {
  it("is stable per user, differs between users and never contains the user id", () => {
    expect(profileBlobSeed("user_1")).toBe(profileBlobSeed("user_1"));
    expect(profileBlobSeed("user_1")).not.toBe(profileBlobSeed("user_2"));
    expect(profileBlobSeed("user_1")).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(profileBlobSeed("cm1abcdefghijklmnop")).not.toContain("cm1abc");
    expect(MAX_PROFILE_VARIATION).toBe(999);
  });
});
```

Create `apps/api/src/dashboard/dto/update-merchant-session.dto.spec.ts`:

```ts
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateMerchantSessionDto } from "./update-merchant-session.dto";

const errorsFor = (profileAvatarId: unknown) => validate(plainToInstance(UpdateMerchantSessionDto, { profileName: "Ana", profileAvatarId }));

describe("UpdateMerchantSessionDto", () => {
  it("accepts blob variations 1–999, including the old animal ids 1–4", async () => {
    for (const id of [1, 4, 5, 500, 999]) await expect(errorsFor(id)).resolves.toHaveLength(0);
  });

  it("rejects anything else", async () => {
    for (const id of [0, 1000, 2.5, "7", null]) {
      expect((await errorsFor(id)).map((error) => error.property)).toContain("profileAvatarId");
    }
  });
});
```

In `apps/api/src/dashboard/merchant-session.service.spec.ts`:
- Add `import { profileBlobSeed } from "./profile-blob-seed";` after `import { MerchantSessionService } from "./merchant-session.service";`.
- In the test `"lists only the user's active sessions and identifies the presented session"`, add `blobSeed: profileBlobSeed("user_1"),` to the expected object right after `canManageSessions: true,`.
- Inside `describe("MerchantSessionService active-session management", …)`, after the test `"does not let a secondary session rename another session"`, add:

```ts
  it("accepts any blob variation from 1 to 999, including the old animal ids 1–4", async () => {
    for (const variation of [1, 4, 5, 999]) {
      const prisma = makeFakePrisma();
      prisma.merchantSession.findFirst
        .mockResolvedValueOnce({ id: "session_main", isPrimary: true })
        .mockResolvedValueOnce({ id: "session_main", isPrimary: true });
      prisma.merchantSession.update.mockResolvedValue({ id: "session_main", profileName: "Ana", profileAvatarId: variation, isPrimary: true });
      await new MerchantSessionService(prisma as any).updateSessionIdentity("user_1", "session_main", "dash_main", "Ana", variation);
      expect(prisma.merchantSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: { profileName: "Ana", profileAvatarId: variation } }));
    }
  });

  it("refuses variations outside 1–999 before looking up any session", async () => {
    for (const variation of [0, -1, 1000, 2.5, Number.NaN]) {
      const prisma = makeFakePrisma();
      await expect(new MerchantSessionService(prisma as any).updateSessionIdentity("user_1", "session_main", "dash_main", "Ana", variation))
        .rejects.toThrow("El avatar del perfil no es válido");
      expect(prisma.merchantSession.findFirst).not.toHaveBeenCalled();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/dashboard/profile-blob-seed.spec.ts src/dashboard/dto/update-merchant-session.dto.spec.ts src/dashboard/merchant-session.service.spec.ts`
Expected: FAIL. `profile-blob-seed` does not exist. The DTO rejects 5, 500 and 999. The service rejects 5 and 999, and the list result has no `blobSeed`.

- [ ] **Step 3: Implement**

Create `apps/api/src/dashboard/profile-blob-seed.ts`:

```ts
import { createHash } from "node:crypto";

/** Blob characters (B1): a session profile's `profileAvatarId` is a blob variation from 1 to this. */
export const MAX_PROFILE_VARIATION = 999;

/**
 * The seed of a dashboard user's blob profile pictures. Stable for the user and one-way, so the browser never
 * learns the raw user id from it; the dashboard renders `${blobSeed}:${profileAvatarId}`.
 */
export function profileBlobSeed(merchantUserId: string): string {
  return createHash("sha256").update(`pagosya-blob:v1:${merchantUserId}`).digest("base64url").slice(0, 16);
}
```

In `apps/api/src/dashboard/merchant-session.service.ts`:
- After `import { countStoreSales, gameXpForStore, wheelSpinsToday } from "../rewards/reward-queries";` add `import { MAX_PROFILE_VARIATION, profileBlobSeed } from "./profile-blob-seed";`.
- In `listActiveSessions`, in the returned object, after `canManageSessions: currentSession?.isPrimary ?? false,` add `blobSeed: profileBlobSeed(merchantUserId),`.
- In `updateSessionIdentity`, replace `if (!Number.isInteger(profileAvatarId) || profileAvatarId < 1 || profileAvatarId > 4) {` with `if (!Number.isInteger(profileAvatarId) || profileAvatarId < 1 || profileAvatarId > MAX_PROFILE_VARIATION) {`.

In `apps/api/src/dashboard/dto/update-merchant-session.dto.ts`, replace:

```ts
  @ApiProperty({ example: 2, minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  profileAvatarId!: number;
```

with:

```ts
  /** Blob variation (B1). The old animal avatars 1–4 are simply the first four variations. */
  @ApiProperty({ example: 2, minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  profileAvatarId!: number;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/dashboard && npx tsc --noEmit -p tsconfig.json && npx eslint src/dashboard/profile-blob-seed.ts src/dashboard/merchant-session.service.ts src/dashboard/dto/update-merchant-session.dto.ts`
Expected: PASS, no type errors and 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/profile-blob-seed.ts apps/api/src/dashboard/profile-blob-seed.spec.ts apps/api/src/dashboard/dto/update-merchant-session.dto.spec.ts
git commit -m "feat(api): profile avatars are blob variations 1–999 (old 1–4 stay valid, no schema change); /dashboard/sessions sends a one-way blobSeed instead of exposing the user id" -- apps/api/src/dashboard/profile-blob-seed.ts apps/api/src/dashboard/profile-blob-seed.spec.ts apps/api/src/dashboard/dto/update-merchant-session.dto.ts apps/api/src/dashboard/dto/update-merchant-session.dto.spec.ts apps/api/src/dashboard/merchant-session.service.ts apps/api/src/dashboard/merchant-session.service.spec.ts
```

---

### Task 4: Dashboard — serve the blob module; user-blob helpers

**Files:**
- Modify: `apps/merchant-dashboard/package.json` (via `pnpm add`), `apps/merchant-dashboard/server.mjs`, `apps/merchant-dashboard/vite.config.mjs`, `apps/merchant-dashboard/index.html` (head)
- Create: `apps/merchant-dashboard/src/profile-blob.mjs`, `apps/merchant-dashboard/src/profile-blob.test.mjs`, `apps/merchant-dashboard/tests/blob-characters.spec.mjs`

**Interfaces:**
- Consumes (Tasks 1–2): `blobSvg` and `blobDataUri` from `@pagosya/blob-characters`; `escapeHtml` from `./html.mjs`. `blobatar@2.7.0` is already a dashboard dependency (committed with this plan).
- Produces:
  - Browser URLs: `/vendor/blobatar/{internal.js,expression.js,motion.css}` and `/vendor/blob-characters/{index.mjs,render.mjs,player.mjs,blob-motion.css}`. Any other path under those prefixes returns 404.
  - An import map mapping `@pagosya/blob-characters`, `blobatar/internal` and `blobatar/expression`.
  - `src/profile-blob.mjs`:
    - `MAX_VARIATION = 999`, `PROFILE_BLOB_ALTERNATIVES = 3`.
    - `normalizeVariation(value) → 1..999`, defaulting to 1.
    - `randomVariation(exclude = [], random = Math.random) → number`.
    - `variationChoices(current, random = Math.random) → [current, a, b, c]`, all distinct.
    - `profileBlobSeed(blobSeed, variation) → string`.
    - `profileBlobHtml({ blobSeed, variation, name = "", decorative = false }) → string`. The profile picture is named by `name.trim()`, or "Mi perfil" when blank. A decorative blob is `aria-hidden`. With no `blobSeed`, it returns a `<span class="blob-avatar-pending">` placeholder.
    - `profileBlobUri(blobSeed, variation) → data URI`.
  - `tests/blob-characters.spec.mjs` harness: `openDashboard(page, { sessions?, blobSeed?, localAvatar?, rewards?, unlockLevels?, sales?, hash? }) → state { sessions, patches }`, plus `session(overrides)`, `rewardsState(board?)`, `BLOB_SEED` and `SHOTS`.

- [ ] **Step 1: Add the workspace dependency**

Run: `pnpm --filter @pagosya/merchant-dashboard add @pagosya/blob-characters@workspace:*`
Expected: `apps/merchant-dashboard/package.json` `dependencies` gains `"@pagosya/blob-characters": "workspace:*"`, and `pnpm-lock.yaml` links it.

- [ ] **Step 2: Write the failing tests**

Create `apps/merchant-dashboard/src/profile-blob.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_VARIATION, normalizeVariation, profileBlobHtml, profileBlobSeed, profileBlobUri, randomVariation, variationChoices } from "./profile-blob.mjs";

test("variations are integers 1–999; stored animal ids 1–4 stay valid; anything else is 1", () => {
  for (const kept of [1, 2, 3, 4, 500, 999]) assert.equal(normalizeVariation(kept), kept);
  assert.equal(normalizeVariation("4"), 4);
  assert.equal(normalizeVariation("777"), 777);
  for (const bad of [0, 1000, -1, 2.5, "x", "", null, undefined, NaN, Infinity, '1" onerror="alert(1)']) assert.equal(normalizeVariation(bad), 1, String(bad));
  assert.equal(MAX_VARIATION, 999);
});

test("a random variation stays in range and skips the excluded ones", () => {
  assert.equal(randomVariation([], () => 0), 1);
  assert.equal(randomVariation([], () => 0.9999999), 999);
  assert.equal(randomVariation([1], () => 0), 2);
  for (let index = 0; index < 200; index++) {
    const value = randomVariation([5, 6]);
    assert.ok(Number.isInteger(value) && value >= 1 && value <= 999 && value !== 5 && value !== 6);
  }
});

test("the editor offers the current variation first plus three different ones", () => {
  for (const current of [1, 3, 999]) {
    const choices = variationChoices(current);
    assert.equal(choices.length, 4);
    assert.equal(choices[0], current);
    assert.equal(new Set(choices).size, 4);
    for (const choice of choices) assert.ok(choice >= 1 && choice <= 999);
  }
  assert.equal(variationChoices("nonsense")[0], 1);
});

test("the seed joins the API seed and the normalized variation", () => {
  assert.equal(profileBlobSeed("Ab_12", 7), "Ab_12:7");
  assert.equal(profileBlobSeed("Ab_12", 5000), "Ab_12:1");
});

test("the profile picture is named by the profile name, and 'Mi perfil' when there is none", () => {
  assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name: "  Ana  " }), /role="img"[^>]*><title>Ana<\/title>/);
  for (const name of ["", "   ", null, undefined]) assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name }), /<title>Mi perfil<\/title>/);
  assert.match(profileBlobHtml({ blobSeed: "s", variation: 2, name: "<img src=x onerror=alert(1)>" }), /<title>&lt;img src=x onerror=alert\(1\)&gt;<\/title>/);
});

test("decorative blobs are hidden from assistive tech; every blob has a plate", () => {
  const svg = profileBlobHtml({ blobSeed: "s", variation: 2, name: "Ana", decorative: true });
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /<title>/);
  assert.match(svg, /class="blob-plate"/);
});

test("each variation is a different blob, and the same variation is always the same one", () => {
  const html = (variation) => profileBlobHtml({ blobSeed: "seed-A", variation, decorative: true });
  assert.notEqual(html(1), html(2));
  assert.equal(html(3), html("3"));
  assert.notEqual(profileBlobHtml({ blobSeed: "seed-B", variation: 1, decorative: true }), html(1));
});

test("the seed never appears in the markup", () => {
  const html = profileBlobHtml({ blobSeed: "SECRETSEED123", variation: 9, name: "Ana" });
  assert.doesNotMatch(html, /SECRETSEED123/);
  assert.doesNotMatch(decodeURIComponent(profileBlobUri("SECRETSEED123", 9)), /SECRETSEED123/);
});

test("without a seed yet, a placeholder holds the space and keeps the accessible name", () => {
  assert.equal(profileBlobHtml({ blobSeed: "", variation: 2, name: "Ana" }), '<span class="blob-avatar-pending" role="img" aria-label="Ana"></span>');
  assert.equal(profileBlobHtml({ blobSeed: null, variation: 2, name: "", decorative: true }), '<span class="blob-avatar-pending" aria-hidden="true"></span>');
});
```

Create `apps/merchant-dashboard/tests/blob-characters.spec.mjs`. It holds the harness Tasks 5 and 6 add tests to, plus this task's test:

```js
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// B1 blob characters. Login and route mocking mirror rewards.spec.mjs, plus /dashboard/sessions (with the API's
// blobSeed) and the progress-celebration endpoints. Screenshots land in tmp/blob-shots/ to be looked at.
const SHOTS = "../../tmp/blob-shots";
mkdirSync(SHOTS, { recursive: true });
const BLOB_SEED = "blobSeedTest0001";
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
};
const segments = ["STICKER_COMMON", "XP_25", "AI_CREDITS_5", "TIP", "XP_50", "RESPIN", "STICKER_RARE", "XP_200", "AI_CREDITS_25"];
const idleBoard = { position: 0, rollsUsed: 0, rollsAvailable: 0, salesUntilNextRoll: 10, lapsCompleted: 0, tiles: Array(24).fill("STICKER_COMMON") };
const rewardsState = (board = idleBoard) => ({
  wheel: { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments },
  board, bonusXp: 0, stickers: [], aiCreditBalance: 0, aiCreditsThisMonth: 0, aiCreditMonthlyCap: 50,
});
const session = (overrides = {}) => ({ id: "session_current", profileName: "Dueño", profileAvatarId: 1, isPrimary: true, current: true, createdAt: "2026-09-25T12:00:00.000Z", expiresAt: "2026-09-26T12:00:00.000Z", ...overrides });

async function openDashboard(page, options = {}) {
  const state = { sessions: options.sessions ?? [session()], patches: [] };
  const blobSeed = "blobSeed" in options ? options.blobSeed : BLOB_SEED;
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  if (options.localAvatar !== undefined) await page.addInitScript((value) => localStorage.setItem("pagosya_merchant_avatar:merchant@example.com", value), options.localAvatar);
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/dashboard/sessions" && request.method() === "GET") {
      return json({ limit: 3, active: state.sessions.length, profiles: [], currentSessionId: "session_current", canManageSessions: true, ...(blobSeed ? { blobSeed } : {}), sessions: state.sessions });
    }
    if (path.startsWith("/dashboard/sessions/") && request.method() === "PATCH") {
      const id = path.split("/").pop();
      const body = request.postDataJSON();
      state.patches.push({ id, ...body });
      state.sessions = state.sessions.map((entry) => (entry.id === id ? { ...entry, ...body } : entry));
      return json({ session: { id, ...body, isPrimary: id === "session_current" } });
    }
    if (path === "/dashboard/daily-login-reward") return json({ awarded: false, totalStars: 1, wheelAvailable: false });
    if (path === "/dashboard/rewards") return json(options.rewards ?? rewardsState());
    if (path === "/dashboard/progress-celebrations") return json({ newlyUnlockedLevels: options.unlockLevels ?? [] });
    if (path === "/dashboard/progress-celebrations/acknowledge") return json({ acknowledged: true });
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z" });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    let body = [];
    if (path === "/stores") body = [store];
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/balance") body = { payableBalance: 0, currency: "BOB", balances: [] };
    else if (path === "/merchants/international_payments") body = { status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: options.sales ?? 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    return json(body);
  });
  await page.goto(options.hash ?? "/");
  await expect(page.locator("#app")).toBeVisible();
  return state;
}

test("the dashboard serves Blobatar and the blob module as browser modules, and nothing else from those folders", async ({ page }) => {
  await page.route("http://localhost:3001/v1/**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.goto("/");
  const html = await page.evaluate(async () => (await import("/src/profile-blob.mjs")).profileBlobHtml({ blobSeed: "s", variation: 2, name: "Ana" }));
  expect(html).toContain("<title>Ana</title>");
  for (const path of ["/vendor/blobatar/react.js", "/vendor/blobatar/index.js", "/vendor/blob-characters/package.json", "/vendor/blob-characters/test/render.test.mjs"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  expect((await page.request.get("/vendor/blob-characters/blob-motion.css")).headers()["content-type"]).toContain("text/css");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/profile-blob.test.mjs; pnpm exec playwright test tests/blob-characters.spec.mjs --workers=2`
Expected: FAIL. The unit test gets `Cannot find module '…/src/profile-blob.mjs'`. The browser test fails because the dynamic import answers `404` (`/src/profile-blob.mjs` is not whitelisted and there is no import map).

- [ ] **Step 4: Implement**

Create `apps/merchant-dashboard/src/profile-blob.mjs`:

```js
// Each person's blob (B1). The API sends `blobSeed`, a stable one-way digest of the dashboard user; the session
// profile's `profileAvatarId` is the variation (1–999). Stored 1–4 values from the animal avatars stay valid.
import { blobDataUri, blobSvg } from "@pagosya/blob-characters";
import { escapeHtml } from "./html.mjs";

export const MAX_VARIATION = 999;
export const PROFILE_BLOB_ALTERNATIVES = 3;

/** Any stored or submitted variation collapses to an integer 1–999, defaulting to 1. */
export function normalizeVariation(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 1 && id <= MAX_VARIATION ? id : 1;
}

/** A variation 1–999 that is not in `exclude`. `random` is injectable so tests are deterministic. */
export function randomVariation(exclude = [], random = Math.random) {
  const taken = new Set(exclude);
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = 1 + Math.floor(random() * MAX_VARIATION);
    if (candidate >= 1 && candidate <= MAX_VARIATION && !taken.has(candidate)) return candidate;
  }
  for (let candidate = 1; candidate <= MAX_VARIATION; candidate++) if (!taken.has(candidate)) return candidate;
  return 1;
}

/** The profile editor's choices: the current variation first, then three different ones. */
export function variationChoices(current, random = Math.random) {
  const choices = [normalizeVariation(current)];
  while (choices.length < 1 + PROFILE_BLOB_ALTERNATIVES) choices.push(randomVariation(choices, random));
  return choices;
}

/** The Blobatar seed of one variation of one person. */
export const profileBlobSeed = (blobSeed, variation) => `${blobSeed}:${normalizeVariation(variation)}`;

/**
 * A person's blob, on a plate so it reads on any background.
 * As the profile picture it is a named image (the profile name, or "Mi perfil" when there is none); `decorative`
 * blobs sit beside their own text or inside a labelled button. Until the API has sent `blobSeed`, a neutral
 * placeholder holds the space so nothing jumps and no wrong face flashes.
 */
export function profileBlobHtml({ blobSeed, variation, name = "", decorative = false }) {
  const label = decorative ? "" : String(name ?? "").trim() || "Mi perfil";
  if (!blobSeed) {
    return label
      ? `<span class="blob-avatar-pending" role="img" aria-label="${escapeHtml(label)}"></span>`
      : '<span class="blob-avatar-pending" aria-hidden="true"></span>';
  }
  return blobSvg(profileBlobSeed(blobSeed, variation), { plate: true, title: label || undefined, className: "profile-blob" });
}

/** The same blob as a static `data:` URI (the dice-board runner is a CSS background). */
export function profileBlobUri(blobSeed, variation) {
  return blobDataUri(profileBlobSeed(blobSeed, variation), { plate: true });
}
```

In `apps/merchant-dashboard/server.mjs`:
- Directly after the `variantEditorAssets` `Map` definition (the line `]);` that closes it), add:

```js
// B1 blob characters: the browser loads Blobatar and @pagosya/blob-characters as native ES modules through the
// import map in index.html. Only these named files are served from the two package folders.
const requireFromDashboard = createRequire(import.meta.url);
const vendorModules = [
  { prefix: "/vendor/blobatar/", dir: path.join(path.dirname(requireFromDashboard.resolve("blobatar/package.json")), "dist"), files: new Set(["internal.js", "expression.js", "motion.css"]) },
  { prefix: "/vendor/blob-characters/", dir: path.dirname(requireFromDashboard.resolve("@pagosya/blob-characters/package.json")), files: new Set(["index.mjs", "render.mjs", "player.mjs", "blob-motion.css"]) },
];
```

- In the `/src/…` whitelist array (the line that starts `if (["/src/domain-shop.mjs", "/src/domain-shop.css",`), add `"/src/profile-blob.mjs",` right after `"/src/companions.mjs",`.
- Directly after the `if (variantEditorAssets.has(requestUrl.pathname)) { … }` block, add:

```js
    const vendor = vendorModules.find((entry) => requestUrl.pathname.startsWith(entry.prefix));
    if (vendor) {
      const filename = requestUrl.pathname.slice(vendor.prefix.length);
      if (!vendor.files.has(filename)) { res.writeHead(404); res.end("not found"); return; }
      const content = await readFile(path.join(vendor.dir, filename), "utf8");
      res.writeHead(200, { "content-type": filename.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(content);
      return;
    }
```

Replace the whole of `apps/merchant-dashboard/vite.config.mjs` with:

```js
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

const requireFromDashboard = createRequire(import.meta.url);
// server.mjs serves the shared variant editor at these root URLs; the build resolves them to the package.
const variantEditorDir = path.dirname(requireFromDashboard.resolve("@pagosya/variant-editor"));
// server.mjs serves the blob modules under /vendor/* for the import map; the build resolves the same files.
const blobatarDist = path.join(path.dirname(requireFromDashboard.resolve("blobatar/package.json")), "dist");
const blobCharactersDir = path.dirname(requireFromDashboard.resolve("@pagosya/blob-characters/package.json"));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^\/variant-editor\.(js|css)$/, replacement: path.join(variantEditorDir, "variant-editor.$1") },
      { find: /^\/vendor\/blobatar\/(.*)$/, replacement: path.join(blobatarDist, "$1") },
      { find: /^\/vendor\/blob-characters\/(.*)$/, replacement: path.join(blobCharactersDir, "$1") },
    ],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
```

In `apps/merchant-dashboard/index.html`, directly before `<link rel="stylesheet" href="/src/dashboard.css">`, add:

```html
<script type="importmap">{"imports":{"@pagosya/blob-characters":"/vendor/blob-characters/index.mjs","blobatar/internal":"/vendor/blobatar/internal.js","blobatar/expression":"/vendor/blobatar/expression.js"}}</script>
<link rel="stylesheet" href="/vendor/blobatar/motion.css">
<link rel="stylesheet" href="/vendor/blob-characters/blob-motion.css">
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/merchant-dashboard && pnpm run test:unit && pnpm exec playwright test tests/blob-characters.spec.mjs tests/dashboard-smoke.spec.mjs --workers=2 && npx vite build --outDir /tmp/pagosya-dashboard-build --emptyOutDir`
Expected: PASS. The Vite build completes, with an "importmap" warning at most.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-dashboard/src/profile-blob.mjs apps/merchant-dashboard/src/profile-blob.test.mjs apps/merchant-dashboard/tests/blob-characters.spec.mjs
git commit -m "feat(dashboard): serve Blobatar and @pagosya/blob-characters as browser modules via an import map (whitelisted files only); profile-blob helpers for variations 1–999, choices and named/decorative blob markup" -- apps/merchant-dashboard/package.json apps/merchant-dashboard/server.mjs apps/merchant-dashboard/vite.config.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/profile-blob.mjs apps/merchant-dashboard/src/profile-blob.test.mjs apps/merchant-dashboard/tests/blob-characters.spec.mjs pnpm-lock.yaml
```

---

### Task 5: Dashboard — user blobs in the profile editor, top bar, sessions and login dialog

**Files:**
- Modify: `apps/merchant-dashboard/src/dashboard.js` (imports; profile state and functions, lines ~36–146; `renderProfileSessions`; the sessions click handler; `renderSessionProfileChoices`; `showLoggedOut`; `showLoggedIn`)
- Modify: `apps/merchant-dashboard/index.html` (`#profileMenuAvatar`, `.profile-avatar-picker`, `#accountAvatar`, `.session-profile-avatar-field`)
- Modify: `apps/merchant-dashboard/src/dashboard.css` (remove the `.profile-avatar-image*` crop rules; add the placeholder and shuffle-button rules)
- Test: `apps/merchant-dashboard/tests/blob-characters.spec.mjs`, `apps/merchant-dashboard/tests/auth-account.spec.mjs`

**Interfaces:**
- Consumes (Task 3): the `/dashboard/sessions` `blobSeed` and PATCH `profileAvatarId` 1–999. From Task 4: `normalizeVariation`, `profileBlobHtml`, `randomVariation` and `variationChoices`, plus the spec harness.
- Produces (Task 6 relies on these names inside `dashboard.js`):
  - `currentBlobSeed: string` is `""` until known.
  - `selectedProfileAvatar: number` is 1–999.
  - `rememberBlobSeed(seed)`, `readBlobSeed()`, `renderProfileAvatar()`, `setLoginAvatar(variation)` and `selectProfileVariation(variation) → Promise<void>`.
  - DOM: `#profileAvatarOptions [data-profile-avatar]`, `#profileAvatarShuffle`, `#sessionProfileAvatars [data-login-avatar]`, `#sessionProfileAvatarShuffle` and `[data-session-edit-form] [data-edit-avatar]`. Each option button is labelled `Variación N` and uses `aria-pressed` on the chosen one.

- [ ] **Step 1: Write the failing tests**

Append to `apps/merchant-dashboard/tests/blob-characters.spec.mjs`:

```js
for (const width of [390, 1280]) test(`the profile editor shows your blob, offers three more and saves "Otra variación" at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await openDashboard(page);
  await expect(page.locator("#profileTriggerAvatar svg.profile-blob")).toHaveAttribute("aria-hidden", "true");
  await page.locator("#profileMenuTrigger").click();
  const picture = page.locator("#profileMenuAvatar svg");
  await expect(picture).toHaveAttribute("role", "img");
  await expect(picture.locator("title")).toHaveText("Dueño");
  const options = page.locator("#profileAvatarOptions [data-profile-avatar]");
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute("data-profile-avatar", "1");
  await expect(options.first()).toHaveAttribute("aria-pressed", "true");
  await expect(options.nth(1)).toHaveAttribute("aria-label", /^Variación \d+$/);
  await page.screenshot({ path: `${SHOTS}/profile-editor-${width}.png` });
  const before = await page.locator("#profileTriggerAvatar").innerHTML();
  await page.getByRole("button", { name: "Otra variación" }).click();
  await expect.poll(() => state.patches.length).toBe(1);
  const saved = state.patches[0].profileAvatarId;
  expect(Number.isInteger(saved) && saved >= 1 && saved <= 999 && saved !== 1).toBe(true);
  expect(state.patches[0]).toMatchObject({ id: "session_current", profileName: "Dueño" });
  await expect(page.locator(`#profileAvatarOptions [data-profile-avatar="${saved}"]`)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#profileTriggerAvatar").innerHTML()).not.toBe(before);
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe(String(saved));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("an old animal avatar id is kept as that blob variation; a broken stored value never breaks the picture", async ({ page }) => {
  const state = await openDashboard(page, { sessions: [session({ profileAvatarId: 3 })], localAvatar: "not-a-number" });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator('#profileAvatarOptions [data-profile-avatar="3"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:merchant@example.com"))).toBe("3");
  expect(state.patches).toEqual([]);
});

test("a profile with no name is still named: the picture falls back to the name from the email", async ({ page }) => {
  await openDashboard(page, { sessions: [session({ profileName: "" })] });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenuAvatar svg title")).toHaveText("Merchant");
});

test("without a seed from the API the picture keeps its place and its name, and nothing breaks", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openDashboard(page, { blobSeed: null });
  await page.locator("#profileMenuTrigger").click();
  await expect(page.locator("#profileMenuAvatar .blob-avatar-pending")).toHaveAttribute("aria-label", "Dueño");
  await expect(page.locator("#profileAvatarOptions [data-profile-avatar]")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("a full profile menu (three sessions and an open edit form) renders only static blobs, each on a plate", async ({ page }) => {
  await openDashboard(page, { sessions: [
    session(),
    session({ id: "s2", profileName: "Ana", profileAvatarId: 3, isPrimary: false, current: false }),
    session({ id: "s3", profileName: "Luis", profileAvatarId: 998, isPrimary: false, current: false }),
  ] });
  await page.locator("#profileMenuTrigger").click();
  await page.locator('[data-edit-session="s2"]').click();
  await expect(page.locator('[data-session-edit-form="s2"] [data-edit-avatar]')).toHaveCount(4);
  await expect(page.locator('[data-session-edit-form="s2"] [data-edit-avatar="3"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#profileMenu svg.blob-figure")).toHaveCount(12);
  expect(await page.locator("#profileMenu .mo-root").count()).toBe(0);
  expect(await page.locator("#profileMenu svg.blob-figure:not(:has(.blob-plate))").count()).toBe(0);
});
```

In `apps/merchant-dashboard/tests/auth-account.spec.mjs`, in the test `"merchant can sign in with a configured Google account"`:
- Replace `  await page.locator('[data-login-avatar="3"]').click();` with:

```js
  const loginChoice = page.locator("#sessionProfileAvatars [data-login-avatar]").nth(2);
  const loginVariation = Number(await loginChoice.getAttribute("data-login-avatar"));
  await loginChoice.click();
```

- Replace these three lines:

```js
  await expect(page.locator('[data-profile-avatar="1"] img')).toHaveAttribute("src", "/assets/profile-1.png?v=3");
  await page.locator('[data-profile-avatar="4"]').click();
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:owner@gmail.com"))).toBe("4");
```

with:

```js
  await expect(page.locator(`#profileAvatarOptions [data-profile-avatar="${loginVariation}"]`)).toHaveAttribute("aria-pressed", "true");
  const menuChoice = page.locator("#profileAvatarOptions [data-profile-avatar]").nth(3);
  const menuVariation = await menuChoice.getAttribute("data-profile-avatar");
  await menuChoice.click();
  expect(await page.evaluate(() => localStorage.getItem("pagosya_merchant_avatar:owner@gmail.com"))).toBe(menuVariation);
```

- Replace `  expect(requests).toContainEqual({ path: "/dashboard/sessions/session_current", method: "PATCH", body: { profileName: "María", profileAvatarId: 3 } });` with `  expect(requests).toContainEqual({ path: "/dashboard/sessions/session_current", method: "PATCH", body: { profileName: "María", profileAvatarId: loginVariation } });`.

In the test `"main session can rename another logged-in profile"`:
- Replace `  await page.locator('[data-session-edit-form="session_other"] [data-edit-avatar="4"]').click();` with:

```js
  const editChoice = page.locator('[data-session-edit-form="session_other"] [data-edit-avatar]').nth(3);
  const editVariation = Number(await editChoice.getAttribute("data-edit-avatar"));
  await editChoice.click();
```

- Replace `body: { profileName: "Carlos", profileAvatarId: 4 } });` with `body: { profileName: "Carlos", profileAvatarId: editVariation } });`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/merchant-dashboard && pnpm exec playwright test tests/blob-characters.spec.mjs tests/auth-account.spec.mjs --workers=2`
Expected: FAIL. `#profileTriggerAvatar svg.profile-blob`, `#profileAvatarOptions` and `#sessionProfileAvatars` do not exist, because the animal PNG pickers still render.

- [ ] **Step 3: Implement the markup**

In `apps/merchant-dashboard/index.html`:
- Replace `<span class="profile-menu-main-avatar" id="profileMenuAvatar" aria-hidden="true"></span>` with `<span class="profile-menu-main-avatar" id="profileMenuAvatar"></span>`. The blob inside is the named profile picture.
- Replace the whole `<fieldset class="profile-avatar-picker"> … </fieldset>` (legend plus the four `data-profile-avatar` buttons) with:

```html
        <fieldset class="profile-avatar-picker">
          <legend>Avatar del perfil</legend>
          <div class="profile-avatar-options" id="profileAvatarOptions"></div>
          <button class="ghost profile-avatar-shuffle" id="profileAvatarShuffle" type="button">Otra variación</button>
        </fieldset>
```

- Replace `<span class="account-identity-avatar" id="accountAvatar" aria-hidden="true"></span>` with `<span class="account-identity-avatar" id="accountAvatar"></span>`.
- Replace the whole `<div class="session-profile-avatars" role="group" aria-labelledby="sessionProfileAvatarLabel"> … </div>` (the four `data-login-avatar` buttons) with:

```html
            <div class="session-profile-avatars" id="sessionProfileAvatars" role="group" aria-labelledby="sessionProfileAvatarLabel"></div>
            <button class="ghost session-profile-avatar-shuffle" id="sessionProfileAvatarShuffle" type="button">Otra variación</button>
```

In `apps/merchant-dashboard/src/dashboard.css`:
- Delete the eight lines from `  .profile-avatar-image {` through `  .profile-avatar-image-4 { --avatar-face-scale: 1.5; --avatar-face-origin: 38% 30%; }`.
- Append at the end of the file:

```css
  /* Blob characters (B1): profile blobs. The placeholder holds the circle until the API sends the seed. */
  .blob-avatar-pending { display: block; width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle at 50% 42%, var(--pg-border-strong) 0 28%, var(--pg-surface) 29%); }
  .profile-avatar-shuffle, .session-profile-avatar-shuffle { min-height: 44px; margin-top: 10px; padding: 0 14px; font-size: .72rem; font-weight: 900; }
```

- [ ] **Step 4: Implement the behaviour in `dashboard.js`**

1. After line 2 (`import { ADVENTURE_LEVELS, GAMIFICATION_RUNNERS, profileAvatarHtml } from "/src/companions.mjs";`) add:

```js
import { normalizeVariation, profileBlobHtml, randomVariation, variationChoices } from "/src/profile-blob.mjs";
```

2. After `  const profileMenuAvatarEl = document.getElementById("profileMenuAvatar");` add:

```js
  const profileAvatarOptionsEl = document.getElementById("profileAvatarOptions");
  const sessionProfileAvatarsEl = document.getElementById("sessionProfileAvatars");
```

3. After `  const PROFILE_AVATAR_STORAGE_PREFIX = "pagosya_merchant_avatar:";` add:

```js
  // B1: the API's one-way blob seed, cached per email so the picture paints at once on the next load.
  const PROFILE_BLOB_SEED_STORAGE_PREFIX = "pagosya_merchant_blob_seed:";
  let currentBlobSeed = "";
  let profileVariationChoices = [];
  let loginVariationChoices = [];
  let editingVariationChoices = [];
```

4. Replace the whole `readProfileAvatar` function:

```js
  function readProfileAvatar() {
    try {
      const stored = Number(localStorage.getItem(profileAvatarStorageKey()));
      return stored >= 1 && stored <= 4 ? stored : 1;
    } catch {
      return 1;
    }
  }
```

with:

```js
  function readProfileAvatar() {
    try {
      return normalizeVariation(localStorage.getItem(profileAvatarStorageKey()));
    } catch {
      return 1;
    }
  }

  function blobSeedStorageKey() {
    return PROFILE_BLOB_SEED_STORAGE_PREFIX + String(emailEl.value || "default").trim().toLocaleLowerCase("es");
  }

  function readBlobSeed() {
    try { return localStorage.getItem(blobSeedStorageKey()) || ""; } catch { return ""; }
  }

  /** Takes the blob seed from a /dashboard/sessions answer; an answer without one changes nothing. */
  function rememberBlobSeed(seed) {
    if (typeof seed !== "string" || !seed || seed === currentBlobSeed) return;
    currentBlobSeed = seed;
    try { localStorage.setItem(blobSeedStorageKey(), seed); } catch {}
    renderProfileAvatar();
    setLoginAvatar(selectedLoginAvatar);
  }
```

5. Replace the whole `renderProfileAvatar` function and the whole `setLoginAvatar` function (from `  function renderProfileAvatar() {` through the closing `  }` of `setLoginAvatar`) with:

```js
  function renderProfileAvatar() {
    const name = currentProfileName || profileNameFromEmail(emailEl.value);
    // The trigger button carries its own label, so its blob is decorative; the menu head is the named picture.
    profileTriggerAvatarEl.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation: selectedProfileAvatar, decorative: true });
    profileMenuAvatarEl.innerHTML = profileBlobHtml({ blobSeed: currentBlobSeed, variation: selectedProfileAvatar, name });
    if (!profileVariationChoices.includes(selectedProfileAvatar)) profileVariationChoices = variationChoices(selectedProfileAvatar);
    profileAvatarOptionsEl.innerHTML = profileVariationChoices.map((variation) => `<button class="profile-avatar-option" type="button" data-profile-avatar="${variation}" aria-label="Variación ${variation}" aria-pressed="${variation === selectedProfileAvatar}">${profileBlobHtml({ blobSeed: currentBlobSeed, variation, decorative: true })}</button>`).join("");
  }

  function setLoginAvatar(avatarId) {
    selectedLoginAvatar = normalizeVariation(avatarId);
    if (!loginVariationChoices.includes(selectedLoginAvatar)) loginVariationChoices = variationChoices(selectedLoginAvatar);
    sessionProfileAvatarsEl.innerHTML = loginVariationChoices.map((variation) => `<button class="session-profile-avatar-option" type="button" data-login-avatar="${variation}" aria-label="Variación ${variation}" aria-pressed="${variation === selectedLoginAvatar}">${profileBlobHtml({ blobSeed: currentBlobSeed, variation, decorative: true })}</button>`).join("");
  }
```

6. In `applyProfileIdentity`, after `    selectedProfileAvatar = readProfileAvatar();` add `    currentBlobSeed = readBlobSeed();`.

7. In `applyCurrentSessionIdentity`, replace `    selectedProfileAvatar = Number(session.profileAvatarId) || 1;` with `    selectedProfileAvatar = normalizeVariation(session.profileAvatarId);`.

8. Replace the whole block that starts `  document.querySelectorAll("[data-profile-avatar]").forEach((button) => {` and ends with `  setLoginAvatar(1);`, which includes the `data-login-avatar` listeners and the two initial render calls, with:

```js
  async function selectProfileVariation(variation) {
    const previousAvatar = selectedProfileAvatar;
    selectedProfileAvatar = normalizeVariation(variation);
    try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
    renderProfileAvatar();
    const currentSession = lastProfileSessionsPayload?.sessions?.find((session) => session.current);
    if (!currentSession) return;
    try {
      await updateProfileSession(currentSession.id, currentSession.profileName, selectedProfileAvatar);
      await loadProfileSessions(false);
    } catch (error) {
      selectedProfileAvatar = previousAvatar;
      try { localStorage.setItem(profileAvatarStorageKey(), String(previousAvatar)); } catch {}
      renderProfileAvatar();
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos guardar el avatar. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
    }
  }
  profileAvatarOptionsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile-avatar]");
    if (button) void selectProfileVariation(Number(button.dataset.profileAvatar));
  });
  // "Otra variación": a fresh blob, saved at once, with three new alternatives beside it.
  document.getElementById("profileAvatarShuffle").addEventListener("click", () => {
    const next = randomVariation(profileVariationChoices);
    profileVariationChoices = variationChoices(next);
    void selectProfileVariation(next);
  });
  sessionProfileAvatarsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-login-avatar]");
    if (button) setLoginAvatar(Number(button.dataset.loginAvatar));
  });
  document.getElementById("sessionProfileAvatarShuffle").addEventListener("click", () => {
    const next = randomVariation(loginVariationChoices);
    loginVariationChoices = variationChoices(next);
    setLoginAvatar(next);
  });
  renderProfileAvatar();
  setLoginAvatar(1);
```

9. In `renderProfileSessions(payload)`, after the line `    lastProfileSessionsPayload = { ...payload, limit, active, sessions };` add `    rememberBlobSeed(payload?.blobSeed);`. In the same function:
   - Replace `<span class="profile-session-avatar" aria-hidden="true">${profileAvatarHtml(session.profileAvatarId)}</span>` with `<span class="profile-session-avatar" aria-hidden="true">${profileBlobHtml({ blobSeed: currentBlobSeed, variation: session.profileAvatarId, decorative: true })}</span>`.
   - Replace `data-avatar-id="${Number(session.profileAvatarId) || 1}">` with `data-avatar-id="${normalizeVariation(session.profileAvatarId)}">`.
   - Replace `${[1, 2, 3, 4].map((avatarId) => `<button class="profile-session-edit-avatar" type="button" data-edit-avatar="${avatarId}" aria-label="Elegir avatar ${avatarId}" aria-pressed="${avatarId === Number(session.profileAvatarId)}">${profileAvatarHtml(avatarId)}</button>`).join("")}` with `${editingVariationChoices.map((variation) => `<button class="profile-session-edit-avatar" type="button" data-edit-avatar="${variation}" aria-label="Variación ${variation}" aria-pressed="${variation === normalizeVariation(session.profileAvatarId)}">${profileBlobHtml({ blobSeed: currentBlobSeed, variation, decorative: true })}</button>`).join("")}`.

10. In the `profileSessionsEl` click handler, directly after `      editingProfileSessionId = editButton.dataset.editSession;` add:

```js
      const editing = lastProfileSessionsPayload?.sessions?.find((session) => session.id === editingProfileSessionId);
      editingVariationChoices = variationChoices(editing?.profileAvatarId);
```

11. In `renderSessionProfileChoices(payload, currentSession)`:
   - As its first line add `    rememberBlobSeed(payload?.blobSeed);`.
   - Replace `data-profile-choice-avatar="${Number(session.profileAvatarId) || 1}"` with `data-profile-choice-avatar="${normalizeVariation(session.profileAvatarId)}"`.
   - Replace `${profileAvatarHtml(session.profileAvatarId)}` with `${profileBlobHtml({ blobSeed: currentBlobSeed, variation: session.profileAvatarId, decorative: true })}`.
   - Replace `    setLoginAvatar(Number(currentSession?.profileAvatarId) || 1);` with `    setLoginAvatar(currentSession?.profileAvatarId);`.

12. In `showLoggedOut()`, after `    currentProfileName = "";` add `    currentBlobSeed = "";`.

13. In `showLoggedIn()`, after `    applyProfileIdentity();` add:

```js
    // The blob seed and the saved variation come from the sessions list; fetch it now, not only when the menu opens.
    loadProfileSessions(false).catch(() => undefined);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/merchant-dashboard && pnpm exec playwright test tests/blob-characters.spec.mjs tests/auth-account.spec.mjs tests/dashboard-smoke.spec.mjs tests/rewards.spec.mjs --workers=2`
Expected: PASS.

Open `tmp/blob-shots/profile-editor-390.png` and `tmp/blob-shots/profile-editor-1280.png` and look at them. Check four round blobs of equal size, the current one ringed, "Otra variación" fully visible and no horizontal overflow at 390. Fix anything that overlaps before committing.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(dashboard): blob profile pictures — the current blob plus three alternatives and 'Otra variación' in the profile editor and login dialog, blob session rows, named picture (profile name) with a placeholder until the API sends the seed" -- apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/tests/blob-characters.spec.mjs apps/merchant-dashboard/tests/auth-account.spec.mjs
```

---

### Task 6: Dashboard — the 8 companions become blob characters (Progreso, top bar, toasts, unlock celebration, dice board)

**Files:**
- Modify (whole file): `apps/merchant-dashboard/src/companions.mjs`, `apps/merchant-dashboard/src/companions.test.mjs`
- Modify: `apps/merchant-dashboard/src/dashboard.js`, `apps/merchant-dashboard/src/rewards-panel.mjs`, `apps/merchant-dashboard/index.html`, `apps/merchant-dashboard/src/dashboard.css`
- Test: `apps/merchant-dashboard/tests/blob-characters.spec.mjs`

**Interfaces:**
- Consumes: from Task 2, `mountBlob`, `ANIMATIONS.unlock`, `ANIMATIONS.cheer`, `blobSvg` and `blobDataUri`. From Task 4, `profileBlobUri`. From Task 5, `currentBlobSeed`, `selectedProfileAvatar` and `rememberBlobSeed`.
- Produces:
  - `companions.mjs`: `ADVENTURE_LEVELS`, 8 entries of `{ id, name, englishName, xpRequired, character, rarity, look: { shape, hue, tone }, expression, description }`. The `asset`, `alt` and `runnerCopy` fields are gone.
  - `companionSeed(level) → "pagosya-companion:<id>"`, `companionBlobHtml(level, { expression?, animate?, className? }) → string` and `companionBlobUri(level) → data URI`.
  - The removed exports are `PROFILE_ART_VERSION`, `STARTER_COUNT`, `GAMIFICATION_RUNNERS`, `normalizeAvatarId` and `profileAvatarHtml`.
  - `mountRewardsPanel(deps)`: `deps.companionAsset` is replaced by `deps.runnerImage() → string` (a data URI) and `deps.celebrateCompanion()`. The returned API gains `renderBoard()`.
  - DOM slots: `#topbarXpBlob`, `#gamificationSummaryBlob`, `#gamificationHeroBlob` (a mounted blob host), `#gamificationToastBlob` and `#birdUnlockBlob` (a mounted blob host with `data-blob-expression` / `data-blob-motion`).

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/merchant-dashboard/src/companions.test.mjs` with:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { _layout } from "blobatar/internal";
import { EXPRESSION_NAMES, SHAPES } from "@pagosya/blob-characters";
import { ADVENTURE_LEVELS, companionBlobHtml, companionBlobUri, companionSeed } from "./companions.mjs";

test("levels climb in id and xp order, starting free, and match the server thresholds", () => {
  assert.equal(ADVENTURE_LEVELS[0].xpRequired, 0);
  ADVENTURE_LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1);
    if (index) assert.ok(level.xpRequired > ADVENTURE_LEVELS[index - 1].xpRequired, `${level.name} needs more xp than the level before`);
  });
  // apps/api/src/dashboard/merchant-session.service.ts PROGRESS_XP_THRESHOLDS
  assert.deepEqual(ADVENTURE_LEVELS.map((level) => level.xpRequired), [0, 100, 250, 450, 700, 1000, 1400, 1900]);
});

test("every companion is a fixed blob with its own silhouette and a signature expression", () => {
  const shapes = new Set();
  for (const level of ADVENTURE_LEVELS) {
    assert.ok(EXPRESSION_NAMES.includes(level.expression), `${level.character} expression`);
    const layout = _layout(companionSeed(level), { hue: level.look.hue, tone: level.look.tone, traits: { shape: SHAPES[level.look.shape] } });
    assert.equal(layout.shape, level.look.shape, level.character);
    shapes.add(layout.shape);
  }
  assert.equal(shapes.size, ADVENTURE_LEVELS.length);
});

test("companion blobs are decorative, stable and distinct", () => {
  const all = ADVENTURE_LEVELS.map((level) => companionBlobHtml(level));
  assert.equal(new Set(all).size, ADVENTURE_LEVELS.length);
  assert.equal(companionBlobHtml(ADVENTURE_LEVELS[0]), all[0]);
  for (const svg of all) assert.match(svg, /^<svg [^>]*aria-hidden="true"/);
  assert.notEqual(companionBlobHtml(ADVENTURE_LEVELS[0], { expression: "sleepy" }), all[0]);
  assert.match(companionBlobHtml(ADVENTURE_LEVELS[0], { animate: "hover" }), /mo-root/);
  assert.ok(companionBlobUri(ADVENTURE_LEVELS[1]).startsWith("data:image/svg+xml,"));
});
```

Append to `apps/merchant-dashboard/tests/blob-characters.spec.mjs`:

```js
for (const width of [390, 1280]) test(`Progreso shows the level's blob companion at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openDashboard(page, { sales: 3, hash: "/#dashboard-progress" });
  await expect(page.locator("#gamificationLevelTitle")).toHaveText("Capibara");
  const hero = page.locator("#gamificationHeroBlob");
  await expect(hero.locator("svg.blob-figure")).toBeVisible();
  await expect(hero).toHaveAttribute("data-blob-expression", "sleepy");
  await expect(page.locator("#topbarXpBlob svg.blob-figure")).toHaveCount(1);
  await expect(page.locator("#gamificationToastMessage")).toContainText("Capi encontró");
  await expect(page.locator("#gamificationToastBlob svg.blob-figure")).toHaveCount(1);
  expect(await page.locator("#gamificationSection .mo-root").count()).toBeLessThanOrEqual(1);
  expect(await hero.locator("svg").evaluate((svg) => getComputedStyle(svg).filter)).toContain("drop-shadow");
  await page.screenshot({ path: `${SHOTS}/levels-${width}.png` });
  // The companion grid stays hidden in the product; it is unhidden here only so all 8 blobs can be reviewed.
  await page.evaluate(() => { document.getElementById("gamificationCompanions").closest("section").hidden = false; });
  await expect(page.locator("#gamificationCompanions svg.blob-figure")).toHaveCount(8);
  await page.locator("#gamificationCompanions").screenshot({ path: `${SHOTS}/companions-${width}.png` });
});

test("reaching a level opens the celebration: the new companion hops, celebrates, then rests on its own mood", async ({ page }) => {
  await openDashboard(page, { sales: 3, unlockLevels: [1] });
  await expect(page.locator("#birdUnlockDialog")).toBeVisible();
  await expect(page.locator("#birdUnlockTitle")).toHaveText("¡Capi llegó!");
  const blob = page.locator("#birdUnlockBlob");
  await expect(blob).toHaveAttribute("data-blob-motion", /hop|celebrate/);
  await expect(blob).toHaveAttribute("data-blob-expression", /surprised|happy/);
  await page.screenshot({ path: `${SHOTS}/unlock-1280.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/unlock-390.png` });
  await expect(blob).toHaveAttribute("data-blob-expression", "sleepy", { timeout: 5000 });
  expect(await blob.getAttribute("data-blob-motion")).toBeNull();
});

test("with reduced motion the celebration shows the happy blob at once and never moves it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDashboard(page, { sales: 3, unlockLevels: [1] });
  const blob = page.locator("#birdUnlockBlob");
  await expect(blob).toHaveAttribute("data-blob-expression", "happy");
  expect(await blob.getAttribute("data-blob-motion")).toBeNull();
  expect(await blob.locator(".mo-bob").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await expect(blob).toHaveAttribute("data-blob-expression", "sleepy", { timeout: 5000 });
  expect(await blob.getAttribute("data-blob-motion")).toBeNull();
});

for (const width of [390, 1280]) test(`the dice board runner is your own blob at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openDashboard(page, { rewards: rewardsState({ ...idleBoard, rollsAvailable: 1, salesUntilNextRoll: 4 }) });
  await expect(page.locator("#rewardsBoardModal")).toBeVisible();
  const token = page.locator("#rewardsBoardToken");
  // Only the profile blob has a plate; the companion stand-in has none.
  await expect.poll(() => token.evaluate((node) => node.style.backgroundImage)).toContain(encodeURIComponent('class="blob-plate"'));
  await page.screenshot({ path: `${SHOTS}/dice-board-${width}.png` });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/companions.test.mjs; pnpm exec playwright test tests/blob-characters.spec.mjs --workers=2`
Expected: FAIL. `companionSeed` is not exported, and `#gamificationHeroBlob`, `#birdUnlockBlob` and the blob runner do not exist.

- [ ] **Step 3: Implement `companions.mjs`**

Replace the whole of `apps/merchant-dashboard/src/companions.mjs` with:

```js
// Companion characters: the adventure levels and the blob each level unlocks. Kept in one place so a renamed
// or restyled companion changes everywhere at once. Blob characters (B1) replaced the animal PNGs; those files
// stay in the repo until the rollout is verified, then are removed.
import { blobDataUri, blobSvg } from "@pagosya/blob-characters";

// Progression tuning lives here. Change xpRequired values without touching rendering or animation code.
// `look` pins the companion's Blobatar (silhouette, hue in degrees, tone 0–1 pale to ink); `expression` is its
// signature mood. The server's PROGRESS_XP_THRESHOLDS (merchant-session.service.ts) must match xpRequired.
export const ADVENTURE_LEVELS = [
  { id: 1, name: "Perdiz", englishName: "Partridge", xpRequired: 0, character: "Pipa", rarity: "Exploradora", look: { shape: "round", hue: 30, tone: 0.4 }, expression: "happy", description: "Curiosa, veloz y siempre lista para dar el primer paso." },
  { id: 2, name: "Capibara", englishName: "Capybara", xpRequired: 100, character: "Capi", rarity: "Compañero", look: { shape: "boxy", hue: 25, tone: 0.75 }, expression: "sleepy", description: "Convierte el crecimiento constante en un paseo tranquilo." },
  { id: 3, name: "Oso hormiguero", englishName: "Anteater", xpRequired: 250, character: "Turi", rarity: "Rastreador", look: { shape: "droplet", hue: 350, tone: 0.4 }, expression: "thinking", description: "Encuentra oportunidades donde otros solo ven camino." },
  { id: 4, name: "Vizcacha", englishName: "Viscacha", xpRequired: 450, character: "Suri", rarity: "Vigía", look: { shape: "capsule", hue: 45, tone: 0 }, expression: "surprised", description: "Mira lejos y te recuerda cuál es la próxima meta." },
  { id: 5, name: "Loro vaquero", englishName: "Cowboy Parrot", xpRequired: 700, character: "Pico", rarity: "Raro", look: { shape: "sun", hue: 140, tone: 0.4 }, expression: "smug", description: "Cruza la selva con estilo y celebra cada avance." },
  { id: 6, name: "Guacamaya azul", englishName: "Blue Macaw", xpRequired: 1000, character: "Ala", rarity: "Épico", look: { shape: "cloud", hue: 215, tone: 0.4 }, expression: "love", description: "Toma altura para mostrarte todo lo que ya construiste." },
  { id: 7, name: "Lechuza", englishName: "Owl", xpRequired: 1400, character: "Luma", rarity: "Épico", look: { shape: "hexagon", hue: 275, tone: 0.4 }, expression: "wink", description: "La constancia ilumina incluso los caminos más oscuros." },
  { id: 8, name: "Perezoso", englishName: "Sloth", xpRequired: 1900, character: "Moro", rarity: "Legendario", look: { shape: "triangle", hue: 50, tone: 0.999 }, expression: "shy", description: "Crecer con paciencia también merece una gran celebración." },
];

/** A companion's seed: fixed per level, so every merchant meets the same Pipa. */
export const companionSeed = (level) => `pagosya-companion:${level.id}`;

/** A companion's blob as inline SVG. Decorative: the copy around it always names the companion. */
export function companionBlobHtml(level, { expression = level.expression, animate = false, className = "" } = {}) {
  return blobSvg(companionSeed(level), { look: level.look, expression, animate, className });
}

/** The same companion as a static `data:` URI (for CSS backgrounds). */
export function companionBlobUri(level) {
  return blobDataUri(companionSeed(level), { look: level.look, expression: level.expression });
}
```

- [ ] **Step 4: Implement the markup and styles**

In `apps/merchant-dashboard/index.html`:
- Replace `<span class="topbar-xp-avatar" aria-hidden="true"><img id="topbarXpImage" src="/assets/profile-1.png?v=3" alt=""></span>` with `<span class="topbar-xp-avatar" aria-hidden="true"><span class="topbar-xp-blob" id="topbarXpBlob"></span></span>`.
- Replace `<div class="gamification-summary-character"><img id="gamificationSummaryImage" src="/assets/gamification-1.png" alt="Pico, compañero de progreso"></div>` with `<div class="gamification-summary-character"><span class="gamification-blob" id="gamificationSummaryBlob" aria-hidden="true"></span></div>`.
- Replace `<div class="gamification-character-stage"><img id="gamificationHeroImage" src="/assets/gamification-1.png" alt="Pico, compañero de progreso"></div>` with `<div class="gamification-character-stage"><span class="gamification-blob" id="gamificationHeroBlob" aria-hidden="true"></span></div>`.
- Replace `<img id="gamificationToastImage" src="/assets/gamification-1.png" alt="">` with `<span class="gamification-toast-blob" id="gamificationToastBlob" aria-hidden="true"></span>`.
- Replace `<div class="bird-unlock-stage"><img id="birdUnlockImage" src="/assets/gamification-1.png" alt=""></div>` with `<div class="bird-unlock-stage"><span class="bird-unlock-blob" id="birdUnlockBlob" aria-hidden="true"></span></div>`.

In `apps/merchant-dashboard/src/dashboard.css` make these replacements. Each old line is shown first, followed by its replacement:

| Old line (exact) | New line |
|---|---|
| `  .gamification-summary-character img { position: relative; z-index: 1; width: 190px; height: 190px; object-fit: contain; transform: translateY(12px) scale(1.32); }` | `  .gamification-summary-character .gamification-blob { position: relative; z-index: 1; width: 150px; height: 150px; margin-bottom: 30px; }` |
| `  .gamification-character-stage img { position: relative; z-index: 1; width: 170px; height: 205px; object-fit: contain; transform: translateY(5px) scale(1.04); }` | `  .gamification-character-stage .gamification-blob { position: relative; z-index: 1; width: 124px; height: 124px; margin-bottom: 36px; }` |
| `  .gamification-companion-art img { width: 94%; height: 210px; object-fit: contain; transform: scale(1.25); transition: transform 180ms var(--ease-out-ui); }` | `  .gamification-companion-art svg { width: 150px; height: 150px; transition: transform 180ms var(--ease-out-ui); }` |
| `  .gamification-companion.is-locked .gamification-companion-art img { opacity: .42; }` | `  .gamification-companion.is-locked .gamification-companion-art svg { opacity: .42; }` |
| `    .gamification-companion:not(.is-locked):hover .gamification-companion-art img { transform: translateY(-5px) rotate(-1deg) scale(1.25); }` | `    .gamification-companion:not(.is-locked):hover .gamification-companion-art svg { transform: translateY(-5px) rotate(-1deg); }` |
| `  .gamification-toast img { align-self: end; width: 86px; height: 100px; object-fit: contain; }` | `  .gamification-toast-blob { align-self: center; justify-self: center; width: 66px; height: 66px; }` |
| `  .bird-unlock-stage img { position: relative; z-index: 1; width: 94%; height: 390px; object-fit: contain; transform: translateY(5%) scale(1.18); }` | `  .bird-unlock-blob { position: relative; z-index: 1; width: 200px; height: 200px; margin-bottom: 115px; }` |
| `    .bird-unlock-stage img { width: 270px; height: 245px; }` | `    .bird-unlock-blob { width: 140px; height: 140px; margin-bottom: 55px; }` |
| `    .gamification-summary-character img { width: 160px; height: 160px; }` | `    .gamification-summary-character .gamification-blob { width: 120px; height: 120px; margin-bottom: 24px; }` |
| `    .gamification-character-stage img { width: 138px; height: 138px; transform: translateY(4px); }` | `    .gamification-character-stage .gamification-blob { width: 96px; height: 96px; margin-bottom: 20px; }` |
| `    .gamification-companion-art img { height: 174px; }` | `    .gamification-companion-art svg { width: 130px; height: 130px; }` |
| `    .gamification-toast img { width: 72px; height: 92px; }` | `    .gamification-toast-blob { width: 56px; height: 56px; }` |
| `  .topbar-xp-avatar img { width: 112%; height: 112%; object-fit: contain; transform: translateY(3px); }` | `  .topbar-xp-blob, .topbar-xp-blob svg { display: block; width: 100%; height: 100%; }` |

Then:
- Delete the two lines that start `  .gamification-character-stage img.is-dancing {` and `  @keyframes companion-dance {`.
- In the reduced-motion list that starts `    .topbar-xp-track span, .topbar-xp-track span::after,`, delete the text `.gamification-character-stage img.is-dancing, `.
- Append at the end of the file:

```css
  /* Blob characters (B1): companion blobs. The ink edge keeps pale blobs readable on the bright bento stages. */
  .gamification-blob, .gamification-toast-blob, .bird-unlock-blob { display: block; }
  .gamification-blob svg, .gamification-toast-blob svg, .bird-unlock-blob svg { display: block; width: 100%; height: 100%; }
  .gamification-blob svg, .gamification-toast-blob svg, .bird-unlock-blob svg, .gamification-companion-art svg {
    filter: drop-shadow(2px 0 0 var(--bento-ink)) drop-shadow(-2px 0 0 var(--bento-ink)) drop-shadow(0 2px 0 var(--bento-ink)) drop-shadow(0 -2px 0 var(--bento-ink));
  }
  .topbar-xp-blob svg { filter: drop-shadow(1px 0 0 var(--bento-ink)) drop-shadow(-1px 0 0 var(--bento-ink)) drop-shadow(0 1px 0 var(--bento-ink)) drop-shadow(0 -1px 0 var(--bento-ink)); }
```

- [ ] **Step 5: Implement `rewards-panel.mjs`**

- In the header comment, replace ` *   companionAsset()     image of the companion that walks the board` with two lines:

```js
 *   runnerImage()        data URI of the blob that walks the board (the merchant's own)
 *   celebrateCompanion() plays the Progreso companion's "cheer"
```

- Replace `    token.style.backgroundImage = `url(${deps.companionAsset()})`;` with `    token.style.backgroundImage = `url("${deps.runnerImage()}")`;`.
- Replace:

```js
      // "Fiesta": a playful variant of a tip where the companion dances.
      if (result.grant.kind === "TIP" && Math.random() < .3) {
        const hero = document.getElementById("gamificationHeroImage");
        hero?.classList.remove("is-dancing"); void hero?.offsetWidth; hero?.classList.add("is-dancing");
      }
```

with:

```js
      // "Fiesta": a playful variant of a tip where the companion celebrates.
      if (result.grant.kind === "TIP" && Math.random() < .3) deps.celebrateCompanion();
```

- In the returned object, after `    renderWheel: renderLuckWheel,` add `    renderBoard: renderRewardsBoard,`.

- [ ] **Step 6: Implement `dashboard.js`**

1. Replace line 2, `import { ADVENTURE_LEVELS, GAMIFICATION_RUNNERS, profileAvatarHtml } from "/src/companions.mjs";`, with:

```js
import { ANIMATIONS, mountBlob } from "@pagosya/blob-characters";
import { ADVENTURE_LEVELS, companionBlobHtml, companionBlobUri, companionSeed } from "/src/companions.mjs";
```

and in the Task 5 import line, replace `import { normalizeVariation, profileBlobHtml, randomVariation, variationChoices } from "/src/profile-blob.mjs";` with `import { normalizeVariation, profileBlobHtml, profileBlobUri, randomVariation, variationChoices } from "/src/profile-blob.mjs";`.

2. In `rememberBlobSeed`, after `    setLoginAvatar(selectedLoginAvatar);` add `    void rewards.renderBoard();`.

3. In the `mountRewardsPanel({ … })` call, replace `    companionAsset: () => ADVENTURE_LEVELS[selectedGamificationCompanion(lastFinances ? gamificationState(lastFinances).levelIndex : 0)].asset,` with:

```js
    // The dice-board runner is the merchant's own blob; the level's companion stands in until the API sends the seed.
    runnerImage: () => (currentBlobSeed
      ? profileBlobUri(currentBlobSeed, selectedProfileAvatar)
      : companionBlobUri(ADVENTURE_LEVELS[selectedGamificationCompanion(lastFinances ? gamificationState(lastFinances).levelIndex : 0)])),
    celebrateCompanion: () => { if (heroBlob) void heroBlob.play(ANIMATIONS.cheer); },
```

4. Delete the unused runner picker. That is the whole `document.getElementById("gamificationRunnerPicker")?.addEventListener("click", (event) => { … data-runner-select … });` block (6 lines), the whole `function gamificationRunnerKey() { … }`, the whole `function selectedGamificationRunner() { … }` and the whole `function renderAdventureRunner(state = lastAdventureState) { … }`.

5. In the unused journey code, convert the three remaining image references so nothing reads `level.asset` any more:
   - In `renderJourneyNodes`, replace `<span class="journey-node-art"><img src="${esc(level.asset)}" alt="${esc(level.alt)}" loading="${status === "locked" ? "lazy" : "eager"}" decoding="async"></span>` with `<span class="journey-node-art">${companionBlobHtml(level)}</span>`.
   - In `renderJourneyCompanions`, replace `<img src="${esc(level.asset)}" alt=""></button>` with `${companionBlobHtml(level)}</button>`.
   - In `renderAnimalAdventure`, replace ``document.getElementById("adventurePlayerFace").innerHTML = `<img src="${esc(selected.asset)}" alt="" loading="eager" decoding="async">`;`` with `document.getElementById("adventurePlayerFace").innerHTML = companionBlobHtml(selected);`.

6. In `showNextGamificationAnnouncement`, replace `    document.getElementById("gamificationToastImage").src = companion.asset;` with:

```js
    paintBlob(document.getElementById("gamificationToastBlob"), `${companion.id}:happy`, companionBlobHtml(companion, { expression: "happy" }));
```

7. Directly above `  function showNextBirdUnlock() {` add `  let unlockBlob = null;`. Inside it, replace:

```js
    document.getElementById("birdUnlockImage").src = level.asset;
    document.getElementById("birdUnlockImage").alt = level.alt;
```

with:

```js
    unlockBlob?.destroy();
    unlockBlob = mountBlob(document.getElementById("birdUnlockBlob"), { seed: companionSeed(level), look: level.look, expression: level.expression });
```

and directly after `      document.getElementById("birdUnlockContinue").focus();` add `      void unlockBlob.play(ANIMATIONS.unlock);`.

8. In `renderTopbarXp`, replace `    document.getElementById("topbarXpImage").src = companion.asset;` with `    paintBlob(document.getElementById("topbarXpBlob"), String(companion.id), companionBlobHtml(companion));`.

9. Directly above `  function renderGamification(finances, { announce = true } = {}) {` add:

```js
  // B1: repaint a static blob only when what it shows changed, so the 60-second refresh does not churn the DOM.
  function paintBlob(element, key, markup) {
    if (!element || element.dataset.blobKey === key) return;
    element.dataset.blobKey = key;
    element.innerHTML = markup;
  }

  // The Progreso hero is the one animated companion on the page (idle on hover, "cheer" on a Fiesta tip).
  let heroBlob = null;
  let heroBlobLevel = null;
  function mountHeroBlob(companion) {
    const host = document.getElementById("gamificationHeroBlob");
    if (!host || (heroBlob && heroBlobLevel === companion.id)) return;
    heroBlob?.destroy();
    heroBlob = mountBlob(host, { seed: companionSeed(companion), look: companion.look, expression: companion.expression, animate: "hover" });
    heroBlobLevel = companion.id;
  }
```

10. In `renderGamification`, replace:

```js
    const imageTargets = [
      ["gamificationSummaryImage", `${companion.character}, compañero de progreso`],
      ["gamificationHeroImage", companion.alt],
    ];
    imageTargets.forEach(([id, alt]) => {
      const image = document.getElementById(id);
      image.src = companion.asset;
      image.alt = alt;
    });
```

with:

```js
    paintBlob(document.getElementById("gamificationSummaryBlob"), `${companion.id}:hover`, companionBlobHtml(companion, { animate: "hover" }));
    mountHeroBlob(companion);
```

replace `        <div class="gamification-companion-art"><img src="${entry.asset}" alt="${esc(entry.alt)}"></div>` with `        <div class="gamification-companion-art">${companionBlobHtml(entry, { expression: isLocked ? "sleepy" : entry.expression })}</div>`,

and replace:

```js
    const runner = GAMIFICATION_RUNNERS[selectedGamificationRunner()];
    achievementIds.forEach((achievementId) => {
      const achievement = state.stars.find((star) => star.id === achievementId);
      if (!achievement) return;
      showGamificationToast(runner, "¡Logro desbloqueado!", `${runner.name} encontró “${achievement.title}”. ${achievement.description}`, achievement.id, gamificationStorageScope());
    });
```

with:

```js
    achievementIds.forEach((achievementId) => {
      const achievement = state.stars.find((star) => star.id === achievementId);
      if (!achievement) return;
      showGamificationToast(companion, "¡Logro desbloqueado!", `${companion.character} encontró “${achievement.title}”. ${achievement.description}`, achievement.id, gamificationStorageScope());
    });
```

11. Check that nothing still points at the animals:

Run: `grep -rnE "GAMIFICATION_RUNNERS|profileAvatarHtml|\.asset\b|\.alt\b|companionAsset|gamificationHeroImage|gamificationSummaryImage|topbarXpImage|birdUnlockImage|gamificationToastImage|is-dancing" apps/merchant-dashboard/src apps/merchant-dashboard/index.html`
Expected: no output.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/merchant-dashboard && pnpm run test:unit && pnpm exec playwright test tests/blob-characters.spec.mjs tests/rewards.spec.mjs tests/dashboard-smoke.spec.mjs tests/auth-account.spec.mjs --workers=2`
Expected: PASS.

Open every new file in `tmp/blob-shots/` (`levels-*`, `companions-*`, `unlock-*`, `dice-board-*`) and look at each one:
- The blobs sit inside their circle.
- The ink edge is visible.
- Each of the 8 companions is distinct and readable against its stage.
- Nothing is clipped at 390.

If a blob sits off its circle, change only that slot's `margin-bottom` or size in `dashboard.css`. If a companion's colour reads badly, change only its `look.hue` or `look.tone` in `companions.mjs`. Re-run the tests after either change.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(dashboard): the 8 level companions are blob characters — Progreso hero (idle, cheer on Fiesta), summary, top bar, toasts, the unlock celebration (surprised+hop, happy+celebrate, back to the companion's mood) and the grid; the dice-board runner is your own blob" -- apps/merchant-dashboard/src/companions.mjs apps/merchant-dashboard/src/companions.test.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/rewards-panel.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/tests/blob-characters.spec.mjs
```

---

## Final verification (after Task 6)

- `pnpm --filter @pagosya/blob-characters test && pnpm --filter @pagosya/blob-characters run typecheck`
- `cd apps/api && npx jest src/dashboard && npx tsc --noEmit -p tsconfig.json`
- `cd apps/merchant-dashboard && pnpm run test:unit && pnpm exec playwright test --workers=2`: the whole dashboard suite must be green. A test that fails only under parallel load is re-run alone before it is called a failure.
- `cd apps/merchant-dashboard && npx vite build --outDir /tmp/pagosya-dashboard-build --emptyOutDir`: the production bundle resolves the blob modules.
- `npx eslint packages/blob-characters apps/merchant-dashboard/src/profile-blob.mjs apps/merchant-dashboard/src/companions.mjs apps/merchant-dashboard/src/rewards-panel.mjs apps/api/src/dashboard`: 0 errors.
- Look at every screenshot in `tmp/blob-shots/` at both 390 and 1280: `profile-editor`, `levels`, `companions`, `unlock` and `dice-board`.
- The PNG companion files and their `server.mjs` routes (`/assets/profile-*.png`, `/assets/gamification-*.png`) stay until the owner has verified the rollout, as the spec says. Nothing references them any more.
