# Dashboard Options Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the merchant dashboard one icon set and one shared kit of controls (section heads, switches, option grids, choice cards, pills, tabs, summary figures) and move every settings-style screen onto it, so the dashboard reads like Amboras.

**Architecture:** Lucide icons are copied into `src/icon-paths.mjs` by a small generator and drawn by `icon()` in `src/icons.mjs`. `src/ui-kit.mjs` builds the markup strings and `src/ui-kit.css` is the only place those controls are styled. Each screen swaps its private classes for the kit's, and its private CSS is deleted in the same task. No behaviour, API or database change.

**Tech Stack:** Vanilla JS ES modules served by `apps/merchant-dashboard/server.mjs` (explicit allow-list), plain CSS on `--pg-*` tokens from `src/calm.css`, `node:test` + jsdom unit tests, Playwright e2e on `http://127.0.0.1:4323`, `tsc --checkJs --strict` on `src/store-settings.mjs` and everything it imports.

**Spec:** `docs/superpowers/specs/2026-10-14-dashboard-options-kit-design.md`

## Global Constraints

- All work is in `apps/merchant-dashboard`. No API, Prisma, Studio or storefront change. Ajustes › Marca / Envíos y retiro / Dominio web are an embedded Studio page and stay untouched.
- Behaviour stays identical: same ids, same `data-*` attributes, same input `type`s, same `name`/`value` on radios, same save buttons and instant-save switches.
- Class prefix is `ui-`. Never `kit-` (that is the storefront-kit package).
- Icons only through `icon()` from `src/icons.mjs`: stroke 1.5, `currentColor`, 18px default, decorative (`aria-hidden="true"`) unless a label is given.
- Switches are `<input type="checkbox" role="switch" class="ui-switch">`.
- Every option helper line is one line of about eight words. Option titles are not changed (tests and merchants find options by title).
- Every value interpolated into markup goes through `escapeHtml` (`src/html.mjs`). The kit helpers escape `title`, `text`, `label`, `group`, `value`, `id`, `count`; `attrs` and a stat's `value` are trusted markup the caller has already escaped.
- Every new browser file is added to the allow-list on `server.mjs` line 151, or the dev server answers 404.
- `ui-kit.css` is linked after `calm.css` in `index.html` so it wins over older rules.
- When a screen is converted, its retired CSS rules are deleted in the same task.
- Stage only the files each task names. Six `apps/api/src/store-emails/*` files were already modified before this work and must not be committed by it.
- The owner's live dashboard runs from this working tree on :4323 and Playwright reuses it. Do not restart or kill it.

## Review Focus

1. **A count of zero.** A section head given `count: 0` must show "0", not hide the pill. Pinned in Task 2 (`uiHead` test).
2. **Keyboard on a switch.** A merchant tabbing to a switch must see a focus ring and toggle it with Space. Pinned in Task 3 (e2e: focus + Space on "Mostrar avisos de pocas unidades").
3. **Phone width.** At 390px the option grid and choice cards must fall to one column with no sideways scroll. Pinned in Task 3 (e2e overflow check).
4. **A caveat that moved.** "Publicar un diseño desde YAPI la vuelve visible" now shows only while the store is hidden; it must appear when the switch is off and disappear when on, including right after a store loads. Pinned in Task 3 (e2e).
5. **Role change on a switch.** Code and tests that looked for `checkbox` now meet `switch`. The one e2e that did (`cobros.spec.mjs:340`) is updated in Task 5; disabled switches must still report disabled (assistant e2e line 96, Task 8).

---

### Task 1: The icon set

**Files:**
- Create: `apps/merchant-dashboard/scripts/build-icons.mjs`
- Create (generated): `apps/merchant-dashboard/src/icon-paths.mjs`
- Create: `apps/merchant-dashboard/src/icons.mjs`
- Create: `apps/merchant-dashboard/src/icons.test.mjs`
- Modify: `apps/merchant-dashboard/server.mjs:151` (allow-list)

**Interfaces:**
- Produces: `icon(name: string, options?: { size?: number, label?: string }) => string` and `ICON_NAMES: readonly string[]` from `src/icons.mjs`. Every svg has `class="ui-icon"`.

- [ ] **Step 1: Write the failing test** — `src/icons.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icon, ICON_NAMES } from "./icons.mjs";

test("an icon is a decorative 18px line drawing by default", () => {
  const svg = icon("bell");
  assert.match(svg, /^<svg class="ui-icon" /);
  assert.match(svg, / width="18" height="18" /);
  assert.match(svg, / stroke-width="1.5" /);
  assert.match(svg, / aria-hidden="true"/);
  assert.match(svg, /<path d="[^"]+"\/>.*<\/svg>$/s);
});

test("a labelled icon is announced, with its label escaped", () => {
  const svg = icon("bell", { size: 16, label: 'Avisos "nuevos"' });
  assert.match(svg, / width="16" height="16" /);
  assert.match(svg, / role="img" aria-label="Avisos &quot;nuevos&quot;"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("an unknown icon name fails loudly instead of drawing nothing", () => {
  assert.throws(() => icon("no-such-icon"), /Unknown icon: no-such-icon/);
});

test("every icon name written in a dashboard module is in the set", () => {
  const dir = new URL("./", import.meta.url);
  const used = new Set();
  for (const file of readdirSync(dir).filter((name) => /\.(mjs|js)$/.test(name) && !name.endsWith(".test.mjs") && !name.startsWith("icon"))) {
    // icon("bell") calls and { icon: "bell" } options for the ui-kit helpers.
    for (const [, name] of readFileSync(new URL(file, dir), "utf8").matchAll(/\bicon(?:\(|: )"([a-z0-9-]+)"/g)) used.add(name);
  }
  assert.deepEqual([...used].filter((name) => !ICON_NAMES.includes(name)), []);
});

test("icon-paths.mjs is exactly what the generator writes today", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-icons.mjs", import.meta.url)), "--check"], { stdio: "pipe" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/icons.test.mjs`
Expected: FAIL — `Cannot find module '.../src/icons.mjs'`.

- [ ] **Step 3: Write the generator** — `scripts/build-icons.mjs`

```js
// Writes src/icon-paths.mjs: the dashboard's one icon set, copied from Lucide (lucide-static,
// already installed for apps/api) so the browser loads no icon package. To add an icon, add its
// Lucide name to NAMES and run:
//   node scripts/build-icons.mjs           write src/icon-paths.mjs
//   node scripts/build-icons.mjs --check   exit 1 when the file is out of date (the unit tests run this)
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAMES = [
  // Ajustes
  "settings", "palette", "truck", "globe", "store", "shopping-bag", "credit-card", "message-circle", "mail",
  "eye", "package", "at-sign", "file-text", "map-pin",
  // Icons the cobros, proposals and contracts panels drew by hand
  "plus", "x", "link", "check", "bell", "triangle-alert", "flask-conical", "sparkles", "chevron-up", "chevron-down",
  "trash-2", "pen-line", "scale", "lock", "clock", "wrench", "shopping-cart", "key-round",
  // Summary figures, switches and tabs on the other screens
  "bell-ring", "hand-coins", "clock-alert", "circle-check", "hourglass", "keyboard", "users", "badge-check",
  "repeat", "calendar-clock", "id-card", "bot", "book-open", "ticket",
];

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "../src/icon-paths.mjs");
const lucideRoot = dirname(createRequire(join(here, "../../api/package.json")).resolve("lucide-static/package.json"));
const { version } = JSON.parse(readFileSync(join(lucideRoot, "package.json"), "utf8"));

/** @param {string} name @returns {string} the drawing inside <svg>…</svg>, on one line */
function drawing(name) {
  const file = join(lucideRoot, "icons", `${name}.svg`);
  if (!existsSync(file)) throw new Error(`lucide-static ${version} has no icon named "${name}"`);
  const inner = readFileSync(file, "utf8").match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!inner) throw new Error(`Could not read the drawing of "${name}"`);
  return inner.replace(/\s*\n\s*/g, "").replace(/\s+\/>/g, "/>").trim();
}

const entries = [...new Set(NAMES)].sort().map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(drawing(name))},`);
const output = [
  `// Generated by scripts/build-icons.mjs from lucide-static ${version}. Do not edit by hand:`,
  "// add the name to NAMES in that script and run it again.",
  "// Lucide icons: ISC License, Copyright (c) Lucide Icons and Contributors. https://lucide.dev/license",
  "",
  "/** @type {Readonly<Record<string, string>>} */",
  "export const ICON_PATHS = Object.freeze({",
  ...entries,
  "});",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== output) {
    console.error("src/icon-paths.mjs is out of date: run node scripts/build-icons.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(target, output);
  console.log(`Wrote ${entries.length} icons to src/icon-paths.mjs`);
}
```

- [ ] **Step 4: Generate the paths**

Run: `cd apps/merchant-dashboard && node scripts/build-icons.mjs`
Expected: `Wrote 46 icons to src/icon-paths.mjs`.

- [ ] **Step 5: Write `src/icons.mjs`**

```js
import { escapeHtml } from "./html.mjs";
import { ICON_PATHS } from "./icon-paths.mjs";

// The dashboard's one icon set (Lucide line icons, see icon-paths.mjs). The same size, stroke and
// colour everywhere is what makes the screens read as one product.

export const ICON_NAMES = Object.freeze(Object.keys(ICON_PATHS));

/**
 * One icon as an inline SVG string: 1.5 stroke in the text colour, decorative unless labelled.
 * @param {string} name a Lucide name listed in scripts/build-icons.mjs
 * @param {{ size?: number, label?: string }} [options]
 */
export function icon(name, options = {}) {
  const drawing = ICON_PATHS[name];
  if (!drawing) throw new Error(`Unknown icon: ${name}`);
  const px = Number(options.size) || 18;
  const a11y = options.label ? `role="img" aria-label="${escapeHtml(options.label)}"` : 'aria-hidden="true"';
  return `<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${a11y}>${drawing}</svg>`;
}
```

- [ ] **Step 6: Allow the dev server to serve both files**

In `server.mjs` line 151, add `"/src/icons.mjs", "/src/icon-paths.mjs", ` right after `"/src/html.mjs", ` in the array.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/merchant-dashboard && node --test src/icons.test.mjs && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4`
Expected: icons tests PASS; full unit run `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-dashboard/scripts/build-icons.mjs apps/merchant-dashboard/src/icon-paths.mjs apps/merchant-dashboard/src/icons.mjs apps/merchant-dashboard/src/icons.test.mjs apps/merchant-dashboard/server.mjs
git commit -m "feat(dashboard): one Lucide icon set for the dashboard, generated from lucide-static"
```

---

### Task 2: The shared kit (helpers + stylesheet)

**Files:**
- Create: `apps/merchant-dashboard/src/ui-kit.mjs`
- Create: `apps/merchant-dashboard/src/ui-kit.css`
- Create: `apps/merchant-dashboard/src/ui-kit.test.mjs`
- Modify: `apps/merchant-dashboard/index.html:20` (stylesheet link)
- Modify: `apps/merchant-dashboard/server.mjs:151` (allow-list)
- Modify: `apps/merchant-dashboard/unit/served-modules.test.mjs` (stylesheets must be served)

**Interfaces:**
- Consumes: `icon(name, { size })` from Task 1.
- Produces (all return HTML strings):
  - `uiHead(options: { icon: string, title: string, text?: string, id?: string, count?: string | number })` → `<div class="ui-head">…</div>`; `id` goes on the `h3`.
  - `uiOption(options: { title: string, text?: string, icon?: string, attrs?: string, checked?: boolean, disabled?: boolean })` → `<label class="ui-option">` holding a `ui-switch`.
  - `uiSwitch(options: { label: string, attrs?: string, checked?: boolean, disabled?: boolean })` → `<label class="ui-inline-switch">` holding a `ui-switch` and `<span>label</span>`.
  - `uiChoice(options: { group: string, value: string, title: string, text?: string, icon?: string, checked?: boolean })` → `<label class="ui-choice">` holding a radio.
  - `uiPill(options: { group: string, value: string, label: string, checked?: boolean })` → `<label class="ui-pill">` holding a radio then `<span>`.
  - `uiStat(options: { label: string, value: string, icon?: string, tone?: "" | "warning" | "good" | "attention" })` → `<div class="ui-stat is-…">` for a `<dl class="ui-stats">`; `value` is trusted markup.
  - CSS classes: `ui-icon`, `ui-head`, `ui-count`, `ui-switch`, `ui-inline-switch`, `ui-options`, `ui-option`, `ui-choices`, `ui-choice`, `ui-pills`, `ui-pill`, `ui-tabs`, `ui-tab`, `ui-stats`, `ui-stat`, `ui-note`.

- [ ] **Step 1: Write the failing tests** — `src/ui-kit.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { uiChoice, uiHead, uiOption, uiPill, uiStat, uiSwitch } from "./ui-kit.mjs";

const parse = (html) => new JSDOM(`<body>${html}</body>`).window.document.body.firstElementChild;

test("a section head has an icon box, a titled h3 and one line", () => {
  const head = parse(uiHead({ icon: "store", id: "identityTitle", title: "Identidad <b>", text: "Aparece en el cobro." }));
  assert.equal(head.className, "ui-head");
  assert.ok(head.querySelector(".ui-head-icon svg.ui-icon"));
  assert.equal(head.querySelector("h3").id, "identityTitle");
  assert.equal(head.querySelector("h3").textContent, "Identidad <b>");
  assert.equal(head.querySelector("p").textContent, "Aparece en el cobro.");
  assert.equal(head.querySelector(".ui-count"), null);
});

test("a count of zero is still shown", () => {
  assert.equal(parse(uiHead({ icon: "users", title: "Miembros", count: 0 })).querySelector(".ui-count").textContent, "0");
});

test("an option is a labelled switch that keeps the caller's id and data attributes", () => {
  const label = parse(uiOption({ icon: "package", title: "Pocas <unidades>", text: "Muestra “Solo quedan 3”.", attrs: 'id="lowStock" data-x="1"', checked: true }));
  const input = label.querySelector("input");
  assert.equal(label.className, "ui-option");
  assert.equal(input.type, "checkbox");
  assert.equal(input.getAttribute("role"), "switch");
  assert.equal(input.className, "ui-switch");
  assert.equal(input.id, "lowStock");
  assert.equal(input.dataset.x, "1");
  assert.equal(input.checked, true);
  assert.equal(input.disabled, false);
  assert.equal(label.querySelector("strong").textContent, "Pocas <unidades>");
  assert.ok(label.querySelector(".ui-option-icon svg"));
});

test("an option without an icon or helper line draws neither", () => {
  const label = parse(uiOption({ title: "Solo título", disabled: true }));
  assert.equal(label.querySelector(".ui-option-icon"), null);
  assert.equal(label.querySelector("small"), null);
  assert.equal(label.querySelector("input").disabled, true);
});

test("an inline switch shows its short label", () => {
  const label = parse(uiSwitch({ label: "Cerrado", attrs: 'data-day="0"', checked: true }));
  assert.equal(label.className, "ui-inline-switch");
  assert.equal(label.querySelector("input").getAttribute("role"), "switch");
  assert.equal(label.querySelector("input").dataset.day, "0");
  assert.equal(label.querySelector("span").textContent, "Cerrado");
});

test("a choice card is a radio with its group and value escaped", () => {
  const label = parse(uiChoice({ icon: "mail", group: "mode", value: 'a"b', title: "Captar interesados", text: "Deja su correo.", checked: true }));
  const input = label.querySelector("input");
  assert.equal(label.className, "ui-choice");
  assert.equal(input.type, "radio");
  assert.equal(input.name, "mode");
  assert.equal(input.value, 'a"b');
  assert.equal(input.checked, true);
  assert.ok(label.querySelector(".ui-choice-icon svg"));
});

test("a pill is a small radio with its label right after the input", () => {
  const label = parse(uiPill({ group: "due", value: "7", label: "7 días" }));
  assert.equal(label.className, "ui-pill");
  assert.equal(label.querySelector("input + span").textContent, "7 días");
  assert.equal(label.querySelector("input").checked, false);
});

test("a summary figure carries its tone and corner icon", () => {
  const doc = new JSDOM(`<body><dl>${uiStat({ label: "Vencido", icon: "clock-alert", value: "<span>Bs 10</span>", tone: "warning" })}</dl></body>`).window.document;
  const stat = doc.querySelector(".ui-stat");
  assert.equal(stat.className, "ui-stat is-warning");
  assert.equal(stat.querySelector("dt span").textContent, "Vencido");
  assert.ok(stat.querySelector("dt svg.ui-icon"));
  assert.equal(stat.querySelector("dd span").textContent, "Bs 10");
});
```

Append to `unit/served-modules.test.mjs`:

```js
test("every stylesheet index.html links from /src is one the dev server serves", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="(\/src\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(sheets.includes("/src/ui-kit.css"), "the kit stylesheet is linked");
  assert.deepEqual(sheets.filter((file) => !server.includes(`"${file}"`)), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/ui-kit.test.mjs unit/served-modules.test.mjs`
Expected: FAIL — `Cannot find module '.../src/ui-kit.mjs'` and "the kit stylesheet is linked".

- [ ] **Step 3: Write `src/ui-kit.mjs`**

```js
import { escapeHtml } from "./html.mjs";
import { icon } from "./icons.mjs";

// The dashboard's shared controls, styled only in ui-kit.css. Text arguments are escaped here;
// `attrs` (ids, data-*, aria-*, "disabled") and a stat's `value` are markup the caller built with
// every value already escaped.

/** @param {string} attrs */
const extra = (attrs) => (attrs ? ` ${attrs}` : "");

/**
 * Section head: icon box, title, one line, optional count pill (a count of 0 still shows).
 * @param {{ icon: string, title: string, text?: string, id?: string, count?: string | number }} options
 */
export function uiHead(options) {
  const { title, text = "", id = "", count } = options;
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  return `<div class="ui-head"><span class="ui-head-icon">${icon(options.icon)}</span><div class="ui-head-text"><h3${idAttr}>${escapeHtml(title)}</h3>${text ? `<p>${escapeHtml(text)}</p>` : ""}</div>${count === undefined || count === null ? "" : `<span class="ui-count">${escapeHtml(count)}</span>`}</div>`;
}

/**
 * A switch with an icon, a title and one helper line; laid out side by side inside .ui-options.
 * @param {{ title: string, text?: string, icon?: string, attrs?: string, checked?: boolean, disabled?: boolean }} options
 */
export function uiOption(options) {
  const { title, text = "", attrs = "", checked = false, disabled = false } = options;
  return `<label class="ui-option"><input type="checkbox" role="switch" class="ui-switch"${extra(attrs)}${checked ? " checked" : ""}${disabled ? " disabled" : ""}>${options.icon ? `<span class="ui-option-icon">${icon(options.icon)}</span>` : ""}<span class="ui-option-text"><strong>${escapeHtml(title)}</strong>${text ? `<small>${escapeHtml(text)}</small>` : ""}</span></label>`;
}

/**
 * A switch with a short inline label ("Cerrado", "Activo").
 * @param {{ label: string, attrs?: string, checked?: boolean, disabled?: boolean }} options
 */
export function uiSwitch(options) {
  const { label, attrs = "", checked = false, disabled = false } = options;
  return `<label class="ui-inline-switch"><input type="checkbox" role="switch" class="ui-switch"${extra(attrs)}${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span>${escapeHtml(label)}</span></label>`;
}

/**
 * A radio drawn as a card: icon, title, one line. Put several in .ui-choices.
 * @param {{ group: string, value: string, title: string, text?: string, icon?: string, checked?: boolean }} options
 */
export function uiChoice(options) {
  const { group, value, title, text = "", checked = false } = options;
  return `<label class="ui-choice"><input type="radio" name="${escapeHtml(group)}" value="${escapeHtml(value)}"${checked ? " checked" : ""}>${options.icon ? `<span class="ui-choice-icon">${icon(options.icon)}</span>` : ""}<span class="ui-choice-text"><strong>${escapeHtml(title)}</strong>${text ? `<small>${escapeHtml(text)}</small>` : ""}</span></label>`;
}

/**
 * A small radio pill ("7 días", "Formal"). Put several in .ui-pills.
 * @param {{ group: string, value: string, label: string, checked?: boolean }} options
 */
export function uiPill(options) {
  const { group, value, label, checked = false } = options;
  return `<label class="ui-pill"><input type="radio" name="${escapeHtml(group)}" value="${escapeHtml(value)}"${checked ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`;
}

/**
 * One summary figure for a <dl class="ui-stats">: label with a corner icon, then the value markup.
 * @param {{ label: string, value: string, icon?: string, tone?: "" | "warning" | "good" | "attention" }} options
 */
export function uiStat(options) {
  const { label, value, tone = "" } = options;
  return `<div class="ui-stat${tone ? ` is-${tone}` : ""}"><dt><span>${escapeHtml(label)}</span>${options.icon ? icon(options.icon, { size: 16 }) : ""}</dt><dd>${value}</dd></div>`;
}
```

- [ ] **Step 4: Write `src/ui-kit.css`**

```css
/* The dashboard's shared controls: section heads, switches, option grids, choice cards, pills,
   tabs and summary figures. Panels use these instead of their own; markup comes from ui-kit.mjs,
   icons from icons.mjs, colours from the --pg-* tokens in calm.css. Linked last so it wins. */

body.is-logged-in .ui-icon { display: block; flex: none; }

/* Section head */
body.is-logged-in .ui-head { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
body.is-logged-in .ui-head-icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border: 1px solid var(--pg-border); border-radius: 10px; background: var(--pg-surface); color: var(--pg-text); }
body.is-logged-in .ui-head-text { flex: 1; min-width: 0; }
body.is-logged-in .ui-head h3 { margin: 0 0 3px; color: var(--pg-text); font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
body.is-logged-in .ui-head p { margin: 0; color: var(--pg-text-muted); font-size: 13px; line-height: 1.5; }
body.is-logged-in .ui-count { flex: none; align-self: center; min-width: 28px; padding: 4px 10px; border-radius: 999px; background: var(--pg-surface-raised); color: var(--pg-text); font-size: 12px; font-weight: 600; text-align: center; font-variant-numeric: tabular-nums; }

/* Switch: a real checkbox drawn as a pill. The knob is a gradient, so no pseudo-element is needed. */
body.is-logged-in .ui-switch {
  appearance: none; -webkit-appearance: none; flex: none; width: 36px; min-width: 36px; height: 20px; margin: 0; padding: 0;
  border: 0; border-radius: 999px; cursor: pointer;
  background-color: var(--pg-border-strong);
  background-image: radial-gradient(circle, #fff 0 7px, transparent 7.5px);
  background-size: 20px 20px; background-repeat: no-repeat; background-position: left center;
  transition: background-color .16s ease, background-position .16s ease;
}
body.is-logged-in .ui-switch:checked { background-color: var(--pg-ink); background-position: right center; }
body.is-logged-in .ui-switch:focus { border: 0; box-shadow: none; }
body.is-logged-in .ui-switch:focus-visible { outline: 2px solid var(--pg-text); outline-offset: 2px; }
body.is-logged-in .ui-switch:disabled { opacity: .45; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { body.is-logged-in .ui-switch { transition: none; } }

body.is-logged-in .ui-inline-switch { display: inline-flex; align-items: center; gap: 8px; margin: 0; color: var(--pg-text-muted); font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; }
body.is-logged-in .ui-inline-switch:has(.ui-switch:disabled) { cursor: not-allowed; }

/* Option grid: switch, icon, title, one line — as many across as fit, three on a desktop panel. */
body.is-logged-in .ui-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 20px 28px; min-width: 0; }
body.is-logged-in .ui-option { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: start; gap: 10px; margin: 0; color: var(--pg-text); font-size: 14px; font-weight: 400; cursor: pointer; }
body.is-logged-in .ui-option:not(:has(.ui-option-icon)) { grid-template-columns: auto minmax(0, 1fr); }
body.is-logged-in .ui-option .ui-switch { margin-top: 1px; }
body.is-logged-in .ui-option-icon { display: flex; padding-top: 1px; color: var(--pg-text-muted); }
body.is-logged-in .ui-option-text { display: grid; gap: 2px; min-width: 0; }
body.is-logged-in .ui-option strong { color: var(--pg-text); font-size: 14px; font-weight: 600; }
body.is-logged-in .ui-option small { color: var(--pg-text-muted); font-size: 12.5px; line-height: 1.45; }
body.is-logged-in .ui-option:has(.ui-switch:disabled) { opacity: .7; cursor: not-allowed; }

/* Choice cards: radios side by side; the whole card is the hit area. */
body.is-logged-in .ui-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }
body.is-logged-in .ui-choice { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; margin: 0; padding: 14px 16px; border: 1px solid var(--pg-border); border-radius: 12px; background: var(--pg-surface); color: var(--pg-text); font-size: 14px; font-weight: 400; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
body.is-logged-in .ui-choice:not(:has(.ui-choice-icon)) { grid-template-columns: minmax(0, 1fr); }
body.is-logged-in .ui-choice:hover { border-color: var(--pg-border-strong); }
body.is-logged-in .ui-choice input { position: absolute; inset: 0; width: 100%; height: 100%; min-width: 0; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
body.is-logged-in .ui-choice:has(input:checked) { border-color: var(--pg-text); box-shadow: inset 0 0 0 1px var(--pg-text); }
body.is-logged-in .ui-choice:has(input:focus-visible) { outline: 2px solid var(--pg-text); outline-offset: 2px; }
body.is-logged-in .ui-choice-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--pg-surface-raised); color: var(--pg-text); }
body.is-logged-in .ui-choice-text { display: grid; gap: 2px; min-width: 0; }
body.is-logged-in .ui-choice strong { font-size: 14px; font-weight: 600; }
body.is-logged-in .ui-choice small { color: var(--pg-text-muted); font-size: 12.5px; line-height: 1.45; }

/* Pills: small radios for presets. */
body.is-logged-in .ui-pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
body.is-logged-in .ui-pill { position: relative; margin: 0; }
body.is-logged-in .ui-pill input { position: absolute; inset: 0; width: 100%; height: 100%; min-width: 0; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
body.is-logged-in .ui-pill span { display: inline-flex; align-items: center; min-height: 36px; padding: 0 14px; border: 1px solid var(--pg-border); border-radius: 999px; background: var(--pg-surface); color: var(--pg-text); font-size: 14px; font-weight: 500; }
body.is-logged-in .ui-pill:hover span { border-color: var(--pg-border-strong); }
body.is-logged-in .ui-pill input:checked + span { border-color: var(--pg-ink); background: var(--pg-ink); color: #fff; }
body.is-logged-in .ui-pill input:focus-visible + span { outline: 2px solid var(--pg-text); outline-offset: 2px; }

/* Tabs: a grey track with the selected tab raised in white; an optional icon and count. */
body.is-logged-in .ui-tabs { display: inline-flex; gap: 2px; max-width: 100%; margin: 0; padding: 4px; border: 0; border-radius: 12px; background: var(--pg-surface-raised); overflow-x: auto; scrollbar-width: none; }
body.is-logged-in .ui-tabs::-webkit-scrollbar { display: none; }
body.is-logged-in .ui-tab { display: inline-flex; align-items: center; gap: 8px; flex: none; width: auto; min-height: 36px; margin: 0; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; box-shadow: none; color: var(--pg-text-muted); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
body.is-logged-in .ui-tab:hover { color: var(--pg-text); }
body.is-logged-in .ui-tab[aria-selected="true"] { background: var(--pg-surface); color: var(--pg-text); box-shadow: 0 1px 2px rgb(24 24 27 / .08), 0 0 0 1px var(--pg-border); }
body.is-logged-in .ui-tab:focus-visible { outline: 2px solid var(--pg-text); outline-offset: 2px; }
body.is-logged-in .ui-tab .ui-icon { width: 16px; height: 16px; }
body.is-logged-in .ui-tab > span { min-width: 20px; padding: 1px 7px; border-radius: 999px; background: var(--pg-accent-soft); color: var(--pg-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
body.is-logged-in .ui-tab[aria-selected="true"] > span { background: var(--pg-surface-raised); color: var(--pg-text); }

/* Summary figures */
body.is-logged-in .ui-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; flex: 1; min-width: 0; margin: 0; }
body.is-logged-in .ui-stat { min-width: 0; padding: 14px 16px; border: 1px solid var(--pg-border); border-radius: 12px; background: var(--pg-surface); }
body.is-logged-in .ui-stat dt { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--pg-text-muted); font-size: 13px; font-weight: 500; }
body.is-logged-in .ui-stat dt .ui-icon { color: var(--pg-text-muted); }
body.is-logged-in .ui-stat dd { display: grid; gap: 2px; margin: 8px 0 0; color: var(--pg-text); font-size: 22px; font-weight: 600; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
body.is-logged-in .ui-stat dd > span { display: block; }
body.is-logged-in .ui-stat dd small, body.is-logged-in .ui-stat dd .is-extra { color: var(--pg-text-muted); font-size: 12px; font-weight: 500; letter-spacing: 0; line-height: 1.35; }
body.is-logged-in .ui-stat.is-warning dd { color: var(--pg-warning); }
body.is-logged-in .ui-stat.is-good dt .ui-icon { color: var(--pg-success); }
body.is-logged-in .ui-stat.is-attention { border-color: var(--pg-text); box-shadow: inset 0 0 0 1px var(--pg-text); }

/* A grey note for a caveat that only applies right now. */
body.is-logged-in .ui-note { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--pg-surface-raised); color: var(--pg-text-muted); font-size: 13px; line-height: 1.5; }
body.is-logged-in .ui-note[hidden] { display: none; }
```

- [ ] **Step 5: Link and serve the stylesheet and module**

In `index.html`, after line 20 (`<link rel="stylesheet" href="/src/calm.css">`) add:

```html
<link rel="stylesheet" href="/src/ui-kit.css">
```

In `server.mjs` line 151 add `"/src/ui-kit.mjs", "/src/ui-kit.css", ` right after the `"/src/icon-paths.mjs", ` entry from Task 1.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/merchant-dashboard && node --test src/ui-kit.test.mjs unit/served-modules.test.mjs && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4`
Expected: PASS; full unit run `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add apps/merchant-dashboard/src/ui-kit.mjs apps/merchant-dashboard/src/ui-kit.css apps/merchant-dashboard/src/ui-kit.test.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/server.mjs apps/merchant-dashboard/unit/served-modules.test.mjs
git commit -m "feat(dashboard): shared ui kit — section heads, switches, option grids, choice cards, pills, tabs, figures"
```

---

### Task 3: Ajustes › General on the kit (owner checkpoint after this task)

**Files:**
- Modify: `apps/merchant-dashboard/src/store-settings.mjs` (imports, TEMPLATE lines 94-169, `renderLocations` lines 243-262, change listener line 333, `setStore` line 489)
- Modify: `apps/merchant-dashboard/src/settings-tabs.mjs` (tab icons)
- Modify: `apps/merchant-dashboard/src/settings-tabs.test.mjs`
- Modify: `apps/merchant-dashboard/index.html:881-885` (tab classes)
- Modify: `apps/merchant-dashboard/src/workspace-design.css:219-243` (stacked sections, retire old tab/radio rules)
- Modify: `apps/merchant-dashboard/src/dashboard.css` (retire `.visual-conversion*` except `.visual-whatsapp-phone`, `.store-cart-recommendations*`, `.store-location-capabilities*`)
- Modify: `apps/merchant-dashboard/tests/store-settings.spec.mjs` (two new tests)

**Interfaces:**
- Consumes: `uiHead`, `uiOption`, `uiSwitch`, `uiChoice` (Task 2); `icon` (Task 1).

- [ ] **Step 1: Write the failing tests**

Append to `src/settings-tabs.test.mjs`:

```js
test('each settings tab carries one icon', () => {
  const { root } = mount();
  assert.equal(root.querySelectorAll('[data-settings-tab] svg.ui-icon').length, 4);
  for (const tab of root.querySelectorAll('[data-settings-tab]')) assert.equal(tab.querySelectorAll('svg').length, 1);
});
```

Append to `tests/store-settings.spec.mjs` right after the WhatsApp test (which ends at line 1059):

```js
test("Ajustes options are icon switches and cards that still work by keyboard", async ({ page }) => {
  const stores = [store("store_1", "Primera")];
  const requests = await openDashboard(page, stores, settingsResponder(stores));
  await navigateDashboard(page, "store-settings");
  await expect(page.locator("#storeSettingsRoot .ui-head svg")).toHaveCount(6);
  await expect(page.locator("#storeSettingsSection [data-settings-tab] svg")).toHaveCount(4);

  const lowStock = page.getByRole("switch", { name: /Mostrar avisos de pocas unidades/ });
  await lowStock.uncheck();
  await lowStock.focus();
  await page.keyboard.press("Space");
  await expect(lowStock).toBeChecked();

  // The publishing caveat shows only while the store is hidden.
  const visibility = page.getByRole("switch", { name: /Tienda visible al público/ });
  const note = page.locator("[data-visibility-note]");
  await visibility.uncheck();
  await expect(note).toBeVisible();
  await visibility.check();
  await expect(note).toBeHidden();

  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#info")).toHaveText("Datos de la tienda guardados.");
  expect(requests.find((entry) => entry.method === "PATCH").body).toMatchObject({ showLowStockToCustomers: true, publicVisibility: true });
});

test("Ajustes fits a phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stores = [store("store_1", "Primera")];
  await openDashboard(page, stores, settingsResponder(stores));
  await navigateDashboard(page, "store-settings");
  await expect(page.getByRole("radio", { name: /Captar interesados/ })).toBeAttached();
  await expect(page.getByRole("switch", { name: /Tienda visible al público/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/settings-tabs.test.mjs; npx playwright test tests/store-settings.spec.mjs -g "Ajustes" --reporter=line 2>&1 | tail -6`
Expected: unit FAIL (0 svgs, expected 4); e2e "icon switches" FAIL (no `.ui-head`). The phone test fails too (no `switch` role yet).

- [ ] **Step 3: Tab icons**

In `src/settings-tabs.mjs` add at the top:

```js
import { icon } from "./icons.mjs";
```

and after `export const SETTINGS_TABS = …;` add:

```js
/** @type {Record<string, string>} */
const TAB_ICONS = { general: "settings", brand: "palette", shipping: "truck", domain: "globe" };
```

In `mountSettingsTabs`, right after `const tabs = …;`, add:

```js
  for (const button of tabs) {
    const name = TAB_ICONS[button.dataset.settingsTab || ""];
    if (name && !button.querySelector("svg")) button.insertAdjacentHTML("afterbegin", icon(name, { size: 16 }));
  }
```

In `index.html` lines 881-885 change `class="settings-tabs"` to `class="ui-tabs"` and give each of the four `<button … role="tab" …>` a `class="ui-tab"` attribute (ids, `aria-controls`, `data-settings-tab` unchanged). Then:

Run: `cd apps/merchant-dashboard && grep -n "settings-tabs\b" src/dashboard.js src/*.css index.html`
Expected: only the CSS rules removed in Step 7 (no JS selects `.settings-tabs`).

- [ ] **Step 4: Rewrite the General TEMPLATE**

In `src/store-settings.mjs` add after the existing import:

```js
import { uiChoice, uiHead, uiOption, uiSwitch } from "./ui-kit.mjs";
```

Replace the whole `const TEMPLATE = \`…\`;` (lines 94-169) with:

```js
const TEMPLATE = `<form class="store-settings-form" novalidate>
  <section class="store-editor-section" aria-labelledby="storeSettingsIdentityTitle">
    ${uiHead({ icon: "store", id: "storeSettingsIdentityTitle", title: "Identidad", text: "Aparece en el cobro y los comprobantes." })}
    <div class="store-editor-section-body">
    <div><label for="storeNameInput">Nombre</label><input id="storeNameInput" name="name" maxlength="80" required></div>
    <div><label for="storeTaglineInput">Descripción corta (opcional)</label><input id="storeTaglineInput" name="tagline" maxlength="160" placeholder="Ropa urbana hecha en Bolivia"></div>
    <div class="store-settings-logo full">
      <span class="store-logo-frame"><img data-logo-preview src="${EMPTY_IMAGE}" alt="Vista previa del logo" hidden><span data-logo-empty aria-hidden="true">Logo</span></span>
      <span class="store-logo-copy"><strong>Logo (opcional)</strong><small class="faint">PNG, JPG o WebP, hasta 8 MB.</small></span>
      <input id="storeLogoInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp">
      <label class="button-like ghost" for="storeLogoInput" data-logo-pick>Subir logo</label>
      <button type="button" class="ghost" data-logo-remove hidden>Quitar</button>
    </div>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsCheckoutTitle">
    ${uiHead({ icon: "shopping-bag", id: "storeSettingsCheckoutTitle", title: "Cómo termina el pedido", text: "Cobra aquí o recibe el pedido por tu canal." })}
    <div class="store-editor-section-body">
    <fieldset class="store-conversion-settings">
      <legend>Modo de conversión</legend>
      <div class="ui-choices">
        ${uiChoice({ icon: "credit-card", group: "storeCheckoutMode", value: "payment", checked: true, title: "Cobrar con pagosYa", text: "Carrito, pago y comprobante." })}
        ${uiChoice({ icon: "message-circle", group: "storeCheckoutMode", value: "whatsapp", title: "Recibir por WhatsApp", text: "El pedido te llega como mensaje." })}
        ${uiChoice({ icon: "mail", group: "storeCheckoutMode", value: "external", title: "Captar interesados", text: "El cliente deja su correo y su carrito." })}
      </div>
      <div class="visual-whatsapp-phone" data-whatsapp hidden>
        <label for="storeContactPhoneInput">Número que recibirá los pedidos</label>
        <input id="storeContactPhoneInput" name="contactPhone" type="tel" maxlength="40" placeholder="+591 71234567" aria-describedby="storeWhatsappPhoneHelp">
        <span class="faint" id="storeWhatsappPhoneHelp">Incluye el código de país.</span>
      </div>
      <p class="ui-note" data-payment-requirement></p>
      <p class="faint" data-lead-help hidden>El correo se enviará a tu correo de soporte; si no configuraste uno, usaremos el correo de tu cuenta pagosYa.</p>
    </fieldset>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsVisibilityTitle">
    ${uiHead({ icon: "eye", id: "storeSettingsVisibilityTitle", title: "Lo que ven tus clientes", text: "Visibilidad de la tienda y del stock." })}
    <div class="store-editor-section-body">
      <div class="ui-options">
        ${uiOption({ icon: "globe", attrs: 'id="storePublicVisibility"', title: "Tienda visible al público", text: "Aparece en buscadores y en el directorio." })}
        ${uiOption({ icon: "package", attrs: 'id="storeShowLowStock"', title: "Mostrar avisos de pocas unidades", text: "Muestra “Solo quedan 3” en tu tienda." })}
      </div>
      <p class="ui-note full" data-visibility-note hidden>Oculta, su enlace muestra que no está disponible. Publicar un diseño desde YAPI la vuelve visible.</p>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsContactTitle">
    ${uiHead({ icon: "at-sign", id: "storeSettingsContactTitle", title: "Contacto", text: "Lo ve el cliente en su comprobante." })}
    <div class="store-editor-section-body">
    <div><label for="storeContactEmailInput">Correo de soporte (opcional)</label><input id="storeContactEmailInput" name="contactEmail" type="email" placeholder="soporte@mitienda.bo"></div>
    <div class="full">
      <label>Enlaces de la tienda (opcional)</label>
      <p class="faint" style="margin:0 0 8px">Instagram, TikTok, WhatsApp o tu catálogo.</p>
      <div data-links></div>
      <button type="button" class="ghost" data-link-add>+ Agregar enlace</button>
    </div>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsPoliciesTitle">
    ${uiHead({ icon: "file-text", id: "storeSettingsPoliciesTitle", title: "Políticas para tus clientes", text: "Junto al botón de compra. Usa tus condiciones reales." })}
    <div class="store-editor-section-body">
    ${POLICY_FIELDS.map(([key, label, hint]) => `<div class="full"><label for="storePolicy-${key}">${label} (opcional)</label><textarea id="storePolicy-${key}" data-policy="${key}" rows="4" maxlength="6000" placeholder="${hint}"></textarea></div>`).join("")}
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsLocationsTitle">
    ${uiHead({ icon: "map-pin", id: "storeSettingsLocationsTitle", title: "Ubicaciones e inventario", text: "Sucursales, retiro, entrega y stock por lugar." })}
    <div class="store-editor-section-body">
    <div class="full store-locations-editor">
      <div id="storeLocationsList"></div>
      <button class="ghost" id="storeLocationAdd" type="button">Agregar ubicación</button>
      <p class="faint" style="margin:9px 0 0">El stock total suma todas tus ubicaciones.</p>
    </div>
    </div>
  </section>
  <p class="store-settings-error" role="alert" data-error hidden></p>
  <div class="store-settings-actions"><button class="primary" type="submit" id="storeSettingsSave">Guardar cambios</button><span class="faint" role="status" data-status></span></div>
</form>`;
```

- [ ] **Step 5: Locations — switches instead of checkboxes**

In `renderLocations` (line 243), replace the hours row's

```js
<label><input type="checkbox" data-location-hours-day="${Number(entry.day)}" data-location-hours-field="closed" ${entry.closed ? "checked" : ""}> Cerrado</label>
```

with

```js
${uiSwitch({ label: "Cerrado", attrs: `data-location-hours-day="${Number(entry.day)}" data-location-hours-field="closed" aria-label="Cerrado el ${DAYS[entry.day].toLowerCase()}"`, checked: entry.closed })}
```

On line 247 replace

```js
<label><input type="checkbox" data-location-unlimited="${escapeHtml(product.id)}" ${unlimited ? "checked" : ""}> Sin límite</label>
```

with

```js
${uiSwitch({ label: "Sin límite", attrs: `data-location-unlimited="${escapeHtml(product.id)}" aria-label="Sin límite de ${escapeHtml(product.name)}"`, checked: unlimited })}
```

Replace the capabilities block (lines 257-260, `<div class="full store-location-capabilities">` … `</div>`) with

```js
        <div class="full ui-options">
          ${uiOption({ icon: "store", attrs: `id="store-location-${id}-pickup" data-location-field="pickupEnabled"`, checked: location.pickupEnabled, title: "Permite retiro", text: "El cliente recoge aquí." })}
          ${uiOption({ icon: "truck", attrs: `id="store-location-${id}-delivery" data-location-field="deliveryEnabled"`, checked: location.deliveryEnabled, title: "Permite entrega desde aquí", text: "Despachas pedidos desde aquí." })}
        </div>
```

(`id` is already escaped on line 242.)

- [ ] **Step 6: The visibility caveat follows the switch**

In `mountStoreSettings`, after the `syncMode` function add:

```js
  /** The publishing caveat matters only while the store is hidden. */
  const syncVisibility = () => { $("[data-visibility-note]").hidden = visibilityInput.checked; };
```

Replace the change listener on line 333 with:

```js
  form.addEventListener("change", (/** @type {any} */ event) => {
    if (event.target.name === "storeCheckoutMode") syncMode();
    if (event.target === visibilityInput) syncVisibility();
  });
```

In `setStore` change `syncMode(); renderLogo(); renderLinks(); renderLocations();` to `syncMode(); syncVisibility(); renderLogo(); renderLinks(); renderLocations();`.

- [ ] **Step 7: Stack the sections and retire the old rules**

In `src/workspace-design.css`:
- Line 219: remove `body.is-logged-in .settings-page .settings-tabs { margin: 0 -16px; padding: 0 8px; }` from inside the media query (keep the `.settings-page { padding: 0 16px 4px; }` part).
- Delete lines 220-225 (all `.settings-tabs` rules).
- Line 231: replace the `.store-editor-section` rule with
  `body.is-logged-in .store-editor-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; min-width: 0; padding: 24px 0; border-top: 1px solid var(--pg-border); }`
- Line 235: add `padding-left: 50px;` to the `.store-editor-section-body` rule (lines the fields up under the head's title), and add right after it:
  `@media (max-width: 699px) { body.is-logged-in .store-editor-section-body { grid-template-columns: minmax(0, 1fr); padding-left: 0; } }`
- Line 237: change `:is(.full, fieldset)` to `:is(.full, fieldset, .ui-options)`.
- Delete lines 240-243 (`.store-conversion-settings .visual-conversion-options`, `…-option`, `…-option:has(input:checked)`, `.store-conversion-settings .checkbox-row`). Keep the `> legend` rule (line 239).
- Add: `body.is-logged-in .store-conversion-settings { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }`

Then:

Run: `cd apps/merchant-dashboard && grep -rnE "visual-conversion|store-cart-recommendations|store-location-capabilities|store-conversion-note" src/*.mjs src/dashboard.js index.html`
Expected: no output. Delete from `src/dashboard.css` the rules `.visual-conversion`, `.visual-conversion legend`, `.visual-conversion-options`, `.visual-conversion-choice`, `.visual-conversion-option*` (lines 803-823 and the 1296 media rule) — but **keep** any `.visual-whatsapp-phone` rule — plus `.store-cart-recommendations*` (863-867), `.store-location-capabilities*` (953-954) and any `.store-conversion-note` rule. If the grep shows a file still using one of them, keep that rule and note it in the report.

- [ ] **Step 8: Run the checks**

Run: `cd apps/merchant-dashboard && npx tsc -p tsconfig.json --noEmit && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/store-settings.spec.mjs tests/store-settings-tabs.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: tsc silent; unit `fail 0`; e2e `36 passed`, `1 skipped`.

- [ ] **Step 9: Look at it**

Open `http://localhost:4323/#dashboard-store-settings` (signed in) at 1440×900 and at 390px. Check: six icon heads; three choice cards side by side; two switches side by side; the note shows when "Tienda visible" is off; add a location and check its two switches and the "Cerrado" / "Sin límite" switches; Tab onto a switch shows a ring. Save one screenshot per width for the owner (do not click Guardar on the live store).

- [ ] **Step 10: Commit**

```bash
git add apps/merchant-dashboard/src/store-settings.mjs apps/merchant-dashboard/src/settings-tabs.mjs apps/merchant-dashboard/src/settings-tabs.test.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/workspace-design.css apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/tests/store-settings.spec.mjs
git commit -m "feat(dashboard): Ajustes General on the ui kit — icon heads, choice cards, switches, pill tabs"
```

- [ ] **Step 11: STOP — owner checkpoint.** Show the owner the two screenshots and wait for their go-ahead (or changes) before Task 4. Changes they ask for land in `ui-kit.css`/`ui-kit.mjs` so every later screen inherits them.

---

### Task 4: Correos

**Files:**
- Modify: `apps/merchant-dashboard/src/email-list-panel.mjs:60,83`
- Modify: `apps/merchant-dashboard/src/email-content-panel.mjs:42,102`
- Modify: `apps/merchant-dashboard/src/email-studio.css:56-57,67`

**Interfaces:**
- Consumes: `uiSwitch` (Task 2).

- [ ] **Step 1: Convert the switches**

`email-list-panel.mjs` — add `import { uiSwitch } from "./ui-kit.mjs";`. On line 60 replace the `<label class="email-list-switch">…</label>` template (the ternary's second branch) with:

```js
          : uiSwitch({ label: !row.supported ? "Por conectar" : row.enabled ? "Activo" : "Desactivado", attrs: `data-email-switch="${esc(row.id)}" aria-label="Enviar ${esc(row.label)}"`, checked: row.enabled, disabled: !row.supported || state.busy })}
```

(the first branch `'<span class="email-list-state">Siempre activo</span>'` stays). Replace line 83 with:

```js
      ${uiSwitch({ label: "Activar este correo", attrs: `name="enabled" ${row.supported ? off : "disabled"}`, checked: draft.enabled })}
```

`email-content-panel.mjs` — add `import { uiSwitch } from "./ui-kit.mjs";`. Replace line 42 with:

```js
  const switchBox = (item) => uiSwitch({ label: "en este correo", attrs: `data-content-switch="${item}"`, checked: on(item), disabled: state.busy });
```

Replace line 102 with:

```js
        ${uiSwitch({ label: "Mostrar productos recomendados", attrs: `data-content-recommendations ${off}`, checked: recommendations() })}
```

- [ ] **Step 2: Retire the content-switch CSS**

In `src/email-studio.css` replace lines 56-57 (the two `.email-content-switch` rules) with
`.email-content-row > .ui-inline-switch { padding-top: 9px; }`
and on line 67 change `.email-content-label, .email-content-switch { padding-top: 0; }` to `.email-content-label, .email-content-row > .ui-inline-switch { padding-top: 0; }`.
Leave the `.email-list-switch` rules (lines 81-83, 89): the assistant panel uses them until Task 8.

- [ ] **Step 3: Run the checks**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/email-studio-panel.spec.mjs tests/marketing-emails.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: unit `fail 0`; e2e all passed.

- [ ] **Step 4: Look at it** — Correos y marketing › Correos at 1440 and 390: switches are pills, the "Activo/Desactivado" text sits beside them, disabled rows look disabled.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/email-list-panel.mjs apps/merchant-dashboard/src/email-content-panel.mjs apps/merchant-dashboard/src/email-studio.css
git commit -m "feat(dashboard): Correos switches on the ui kit"
```

---

### Task 5: Cobrar

**Files:**
- Modify: `apps/merchant-dashboard/src/cobros-panel.mjs` (imports, ICON 207-219, summary 366-370, filters 374-375, presets 474-477, reminders 485, paid method 1040-1042, detail reminders 1052)
- Modify: `apps/merchant-dashboard/src/cobros.css` (lines 20-25, 30-35, 119-125, 128-132, 203-204, 241, 261-266)
- Modify: `apps/merchant-dashboard/tests/cobros.spec.mjs:340`

**Interfaces:**
- Consumes: `icon` (Task 1); `uiOption`, `uiPill`, `uiStat` (Task 2).

- [ ] **Step 1: Update the one test that looked for a checkbox**

`tests/cobros.spec.mjs` line 340: `sheet.getByRole("checkbox", { name: /Recordatorios automáticos/ })` → `sheet.getByRole("switch", { name: /Recordatorios automáticos/ })`.

Run: `cd apps/merchant-dashboard && npx playwright test tests/cobros.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: FAIL at line 340 (no switch yet).

- [ ] **Step 2: One icon set**

Add `import { icon } from "./icons.mjs";` and `import { uiOption, uiPill, uiStat } from "./ui-kit.mjs";` beside the existing imports. Replace `const ICON = { … };` (lines 207-219) with:

```js
  const ICON = {
    plus: icon("plus"), close: icon("x"), whatsapp: icon("message-circle"), mail: icon("mail"), link: icon("link"),
    eye: icon("eye"), check: icon("check"), doc: icon("file-text"), bell: icon("bell"), alert: icon("triangle-alert"),
    flask: icon("flask-conical"),
  };
```

If the existing map has a key not listed here, map it to the closest name already in `scripts/build-icons.mjs` (or add one there, rerun the script, and stage `src/icon-paths.mjs`).

- [ ] **Step 3: Summary figures and filters**

Replace the `<dl class="cobros-summary">…</dl>` block (lines 366-370) with:

```js
        <dl class="ui-stats">
          ${uiStat({ label: "Por cobrar", icon: "hand-coins", value: amountLines("owed") })}
          ${uiStat({ label: "Vencido", icon: "clock-alert", value: amountLines("overdue"), tone: overdueAny ? "warning" : "" })}
          ${uiStat({ label: "Cobrado · 30 días", icon: "circle-check", value: amountLines("collected"), tone: "good" })}
        </dl>
```

Replace lines 374-375 with:

```js
      <div class="ui-tabs" role="tablist" aria-label="Filtrar cobros">
        ${FILTERS.map((option) => `<button type="button" role="tab" class="ui-tab" aria-selected="${filter === option.id}" data-cobro-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
```

- [ ] **Step 4: Pills and reminder switches**

Replace lines 474-477 with:

```js
            <div class="ui-pills" role="radiogroup" aria-label="Vencimiento">
              ${PRESETS.map((option) => uiPill({ group: "duePreset", value: option.id, label: option.label, checked: draft.preset === option.id })).join("")}
              ${uiPill({ group: "duePreset", value: "custom", label: "Otra fecha", checked: draft.preset === "custom" })}
            </div>
```

Replace line 485 with:

```js
            ${uiOption({ icon: "bell-ring", attrs: "data-cobro-reminders", checked: draft.autoReminders, title: "Recordatorios automáticos", text: "Por correo al vencer y 3 días después." })}
```

Replace lines 1040-1042 (`<div class="cobro-presets">…</div>`) with:

```js
          <div class="ui-pills">
            ${["cash", "transfer", "other"].map((method, index) => uiPill({ group: "cobroPaidMethod", value: method, label: { cash: "Efectivo", transfer: "Transferencia", other: "Otro" }[method] || method, checked: index === 0 })).join("")}
          </div>
```

Replace line 1052 with:

```js
    const reminders = open ? uiOption({ icon: "bell-ring", attrs: "data-cobro-auto-reminders", checked: doc.autoReminders, title: "Recordatorios automáticos", text: doc.customer?.email ? "Por correo al vencer y 3 días después." : "Tu cliente no tiene correo para recibirlos." }) : "";
```

- [ ] **Step 5: Retire Cobrar's private CSS**

In `src/cobros.css` delete lines 20-25 (`.cobros-summary*`), 30-35 (`.cobros-filters*`), 119-125 (`.cobro-presets`, `.cobro-preset*`), 128-132 (`.cobro-toggle*`), 203-204 (`.cobros-summary dd span*`), 241 (`.cobro-detail-toggle`) and 261-266 (mobile `.cobros-summary*`; drop the media block if it becomes empty). Then:

Run: `cd apps/merchant-dashboard && grep -nE "cobros-summary|cobros-filters|cobro-presets?\b|cobro-toggle|cobro-detail-toggle" src/*.mjs src/*.css`
Expected: no output.

- [ ] **Step 6: Run the checks**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/cobros.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: unit `fail 0`; cobros e2e all passed.

- [ ] **Step 7: Look at it** — Cobrar at 1440 and 390: three figure cards with corner icons, pill tabs with counts, the new-cobro sheet's pills and reminder switch, a cobro's detail sheet.

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-dashboard/src/cobros-panel.mjs apps/merchant-dashboard/src/cobros.css apps/merchant-dashboard/tests/cobros.spec.mjs
git commit -m "feat(dashboard): Cobrar on the ui kit — figures, tabs, pills, reminder switches, Lucide icons"
```

---

### Task 6: Propuestas and Contratos

**Files:**
- Modify: `apps/merchant-dashboard/src/proposals-panel.mjs` (imports, ICON 150-164, summary 248-251, filters 254-255, tone 319-322, validity 496-499)
- Modify: `apps/merchant-dashboard/src/contracts-panel.mjs` (imports, ICON 159-177, TYPE_ICON 178-184, summary 271-275, filters 278-279, types 348-354, order 392-395, edit order 579-582, deadline 585-588, sign tabs 827-830)
- Modify: `apps/merchant-dashboard/src/proposals.css` (30-35, 38-43, 98, 111-116)
- Modify: `apps/merchant-dashboard/src/contracts.css` (15, 20-21, 34-42, 74-76, 104-105, 108, 119-123)

**Interfaces:**
- Consumes: `icon` (Task 1); `uiChoice`, `uiPill`, `uiStat` (Task 2).

- [ ] **Step 1: One icon set**

`proposals-panel.mjs`: add `import { icon } from "./icons.mjs";` and `import { uiPill, uiStat } from "./ui-kit.mjs";`. Replace `const ICON = { … };` with:

```js
  const ICON = {
    spark: icon("sparkles"), close: icon("x"), plus: icon("plus"), up: icon("chevron-up"), down: icon("chevron-down"),
    trash: icon("trash-2"), whatsapp: icon("message-circle"), mail: icon("mail"), link: icon("link"), eye: icon("eye"),
    check: icon("check"), doc: icon("file-text"), alert: icon("triangle-alert"),
  };
```

`contracts-panel.mjs`: add `import { icon } from "./icons.mjs";` and `import { uiChoice, uiPill, uiStat } from "./ui-kit.mjs";`. Replace `const ICON = { … };` and `const TYPE_ICON = { … };` with:

```js
  const ICON = {
    pen: icon("pen-line"), spark: icon("sparkles"), close: icon("x"), plus: icon("plus"), up: icon("chevron-up"),
    down: icon("chevron-down"), trash: icon("trash-2"), whatsapp: icon("message-circle"), mail: icon("mail"),
    link: icon("link"), eye: icon("eye"), check: icon("check"), doc: icon("file-text"), alert: icon("triangle-alert"),
    scale: icon("scale"), lock: icon("lock"), clock: icon("clock"),
  };
  /** @type {Record<string, string>} Lucide name per contract type. */
  const TYPE_ICON_NAME = { servicios: "wrench", compraventa: "shopping-cart", alquiler: "key-round", confidencialidad: "lock", personalizado: "pen-line" };
  const TYPE_ICON = Object.fromEntries(Object.entries(TYPE_ICON_NAME).map(([type, name]) => [type, icon(name)]));
```

If either old map has a key not listed here, map it to the closest name in `scripts/build-icons.mjs` (or add one there, rerun the script, and stage `src/icon-paths.mjs`).

- [ ] **Step 2: Figures and filter tabs**

`proposals-panel.mjs` lines 248-251 →

```js
        <dl class="ui-stats">
          ${uiStat({ label: "Esperando respuesta", icon: "hourglass", value: `${esc(formatMoney(bob.open))}<small>${Number(counts.open || 0)} ${counts.open === 1 ? "propuesta" : "propuestas"}${counts.changes ? ` · ${Number(counts.changes)} con cambios pedidos` : ""}</small>` })}
          ${uiStat({ label: "Aceptadas · 30 días", icon: "circle-check", value: `${esc(formatMoney(bob.accepted30))}<small>${Number(counts.accepted || 0)} en total</small>`, tone: "good" })}
        </dl>
```

`contracts-panel.mjs` lines 271-275 →

```js
        <dl class="ui-stats">
          ${uiStat({ label: "Te toca firmar", icon: "pen-line", value: `${Number(summary.awaitingYou || 0)}<small>${summary.awaitingYou ? "Ábrelos y firma en un toque" : "Nada pendiente de tu lado"}</small>`, tone: summary.awaitingYou ? "attention" : "" })}
          ${uiStat({ label: "Esperando a tus clientes", icon: "hourglass", value: `${Math.max(0, Number(summary.open || 0) - Number(summary.awaitingYou || 0))}<small>${Number(summary.open || 0)} por firmar en total</small>` })}
          ${uiStat({ label: "Firmados", icon: "circle-check", value: `${Number(summary.signed || 0)}<small>Con PDF y registro de firma</small>`, tone: "good" })}
        </dl>
```

In both files replace the filter row (proposals 254-255, contracts 278-279) with the same pattern — shown for proposals:

```js
      <div class="ui-tabs" role="tablist" aria-label="Filtrar propuestas">
        ${FILTERS.map((option) => `<button type="button" role="tab" class="ui-tab" aria-selected="${filter === option.id}" data-proposal-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
```

and for contracts:

```js
      <div class="ui-tabs" role="tablist" aria-label="Filtrar contratos">
        ${FILTERS.map((option) => `<button type="button" role="tab" class="ui-tab" aria-selected="${filter === option.id}" data-contract-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
```

- [ ] **Step 3: Pills**

`proposals-panel.mjs` 319-322 →

```js
        <fieldset class="proposal-tone ui-pills"><legend>Tono</legend>
          ${uiPill({ group: "proposalTone", value: "formal", label: "Formal", checked: c.tone === "formal" })}
          ${uiPill({ group: "proposalTone", value: "cercano", label: "Cercano", checked: c.tone === "cercano" })}
        </fieldset>
```

`proposals-panel.mjs` 496-499 →

```js
          <div class="ui-pills" role="radiogroup" aria-label="Validez">
            ${VALIDITY.map((option) => uiPill({ group: "proposalValidity", value: option.id, label: option.label, checked: e.validPreset === option.id })).join("")}
            ${uiPill({ group: "proposalValidity", value: "custom", label: "Otra fecha", checked: e.validPreset === "custom" })}
          </div>
```

`contracts-panel.mjs` 392-395 →

```js
          <div class="ui-pills" role="radiogroup" aria-label="Orden de firma">
            ${uiPill({ group: "contractOrder", value: "merchant_first", label: "Yo primero (recomendado)", checked: c.signingOrder === "merchant_first" })}
            ${uiPill({ group: "contractOrder", value: "customer_first", label: "Mi cliente primero", checked: c.signingOrder === "customer_first" })}
          </div>
```

`contracts-panel.mjs` 579-582 →

```js
              <div class="ui-pills" role="radiogroup" aria-label="Orden de firma">
                ${uiPill({ group: "contractEditOrder", value: "merchant_first", label: "Yo primero", checked: e.meta.signingOrder === "merchant_first" })}
                ${uiPill({ group: "contractEditOrder", value: "customer_first", label: "Mi cliente", checked: e.meta.signingOrder === "customer_first" })}
              </div></div>
```

`contracts-panel.mjs` 585-588 →

```js
          <div class="ui-pills" role="radiogroup" aria-label="Plazo para firmar">
            ${DEADLINES.map((option) => uiPill({ group: "contractDeadline", value: option.id, label: option.label, checked: deadlinePreset === option.id })).join("")}
            ${uiPill({ group: "contractDeadline", value: "custom", label: "Otra fecha", checked: deadlinePreset === "custom" })}
          </div>
```

- [ ] **Step 4: Contract types as choice cards, sign method as tabs**

`contracts-panel.mjs` 348-354 →

```js
          <div class="ui-choices" role="radiogroup" aria-label="Tipo de contrato">
            ${CONTRACT_TYPES.map((option) => uiChoice({ icon: TYPE_ICON_NAME[option.id] || "file-text", group: "contractType", value: option.id, title: option.label, text: option.hint, checked: option.id === c.contractType })).join("")}
          </div>
```

Then run `grep -n "is-selected" src/contracts-panel.mjs` and delete any line that toggles `is-selected` on a `.contract-type` (the kit's `:has(input:checked)` draws the selection).

`contracts-panel.mjs` 827-830 →

```js
        <div class="ui-tabs" role="tablist" aria-label="Cómo firmar">
          <button type="button" role="tab" class="ui-tab" aria-selected="true" data-contract-sign-method="TYPED">${icon("keyboard", { size: 16 })}Escribir</button>
          <button type="button" role="tab" class="ui-tab" aria-selected="false" data-contract-sign-method="DRAWN">${icon("pen-line", { size: 16 })}Dibujar</button>
        </div>
```

- [ ] **Step 5: Retire the private CSS**

`src/proposals.css`: delete lines 30-35 (`.proposals-summary*`), 38-43 (`.proposals-filters*`), 111-116 (`.proposal-pills`, `.proposal-pill*`); on line 98 change `.proposal-sheet label:not(.proposal-pill)` to `.proposal-sheet label:not(.ui-pill, .ui-choice, .ui-option, .ui-inline-switch)`.
`src/contracts.css`: delete lines 20-21, 34-42, 74-76, 108 (`.contracts-summary div` in the 760px query; drop the query if empty), 119-123 (`.contracts-summary*` in the second 640px query; drop it if empty), and lines 104-105 inside the first 640px query (keep its `.contracts-examples, .contract-parties-grid` line); on line 15 remove `.contract-type-icon svg, ` from the selector list.

Run: `cd apps/merchant-dashboard && grep -nE "proposals-summary|contracts-summary|proposals-filters|proposal-pills?\b|contract-types?\b|contract-type-(icon|copy)|contract-sign-tabs" src/*.mjs src/*.css`
Expected: no output.

- [ ] **Step 6: Run the checks**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/proposals.spec.mjs tests/contracts.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: unit `fail 0`; e2e all passed.

- [ ] **Step 7: Look at it** — Propuestas and Contratos lists, a new contract sheet (type cards, order pills), the sign sheet (Escribir/Dibujar tabs), at 1440 and 390.

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-dashboard/src/proposals-panel.mjs apps/merchant-dashboard/src/contracts-panel.mjs apps/merchant-dashboard/src/proposals.css apps/merchant-dashboard/src/contracts.css
git commit -m "feat(dashboard): Propuestas and Contratos on the ui kit — figures, tabs, pills, type cards, Lucide icons"
```

---

### Task 7: Suscripciones

**Files:**
- Modify: `apps/merchant-dashboard/src/subscriptions-panel.mjs:73-77,200-212,220`
- Modify: `apps/merchant-dashboard/src/subscriptions.css:5-7,43-44,49`

**Interfaces:**
- Consumes: `icon` (Task 1); `uiHead`, `uiOption`, `uiSwitch` (Task 2).

- [ ] **Step 1: Tabs, the offer switch, section heads, cadence switches**

Add `import { icon } from "./icons.mjs";` and `import { uiHead, uiOption, uiSwitch } from "./ui-kit.mjs";`.

Replace `headHtml` (lines 73-77) with:

```js
  function headHtml() {
    const tab = (id, label, name) => `<button type="button" role="tab" class="ui-tab" aria-selected="${state.tab === id}" data-tab="${id}">${icon(name, { size: 16 })}${label}</button>`;
    return `<header class="subs-head"><p>Clientes que reciben tus productos cada semana, quincena o mes, y tus miembros.</p>
      <div class="ui-tabs" role="tablist" aria-label="Suscripciones">${tab("subscribers", "Suscriptores", "users")}${tab("members", "Miembros", "badge-check")}${tab("settings", "Configuración", "settings")}</div></header>`;
  }
```

In the settings markup replace

```js
        <label><input type="checkbox" data-switch ${enabled ? "checked" : ""}> <span>Ofrecer suscripciones en mi tienda</span></label>
        <p>Tus clientes reciben un enlace de pago antes de cada entrega. No se cobra automáticamente.</p>
```

with

```js
        ${uiOption({ icon: "repeat", attrs: "data-switch", checked: enabled, title: "Ofrecer suscripciones en mi tienda", text: "Pagan con un enlace antes de cada entrega." })}
```

Replace `<h3>Frecuencias por producto</h3>` with `${uiHead({ icon: "calendar-clock", title: "Frecuencias por producto" })}`, and `<h3>Membresías</h3>` with `${uiHead({ icon: "id-card", title: "Membresías", text: "Días de gracia antes de que venza." })}`; delete the paragraph `<p>Si un miembro no paga su renovación, sigue activo estos días. Después, su membresía vence.</p>`.

In `offerFormHtml` replace `<label><input type="checkbox" name="offer-${cadence}" ${saved ? "checked" : ""}> ${CADENCE_LABEL[cadence]}</label>` with `${uiSwitch({ label: CADENCE_LABEL[cadence], attrs: `name="offer-${cadence}"`, checked: Boolean(saved) })}`.

Check first that nothing reads the old switch's `<span>` or `<p>`: `grep -n "subs-switch\|data-switch" src/subscriptions-panel.mjs src/subscriptions.mjs` — event handlers must select by `[data-switch]` only.

- [ ] **Step 2: Retire the private CSS**

`src/subscriptions.css`: delete lines 5-7 (`.subs-tabs*`) and 43-44 (`.subs-switch label*`); on line 49 change `.subs-offer-row label` to `.subs-offer-row label:not(.ui-inline-switch)`.

Run: `cd apps/merchant-dashboard && grep -nE "subs-tabs|subs-switch label" src/*.mjs src/*.css`
Expected: no output.

- [ ] **Step 3: Run the checks**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/marketing-emails.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: unit `fail 0` (includes `unit/subscriptions-panel-compat.test.mjs`); e2e all passed.

- [ ] **Step 4: Look at it** — Suscripciones, all three tabs, at 1440 and 390; open "Editar" on a product.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/subscriptions-panel.mjs apps/merchant-dashboard/src/subscriptions.css
git commit -m "feat(dashboard): Suscripciones on the ui kit — icon tabs, offer switch, section heads"
```

---

### Task 8: Asistente

**Files:**
- Modify: `apps/merchant-dashboard/src/assistant-panel.mjs:47-75`
- Modify: `apps/merchant-dashboard/src/email-studio.css:81-83,89` (retire `.email-list-switch`)

**Interfaces:**
- Consumes: `uiHead`, `uiSwitch`, `uiPill` (Task 2).

- [ ] **Step 1: Convert**

Add `import { uiHead, uiPill, uiSwitch } from "./ui-kit.mjs";`. Then in the render template:

- Line 48 → `${uiSwitch({ label: s.enabled ? "Activo" : "Desactivado", attrs: 'data-assistant-enabled aria-label="Activar asistente"', checked: s.enabled, disabled: !data.publishedDesign })}`
- `<h3>Asistente de tu tienda</h3>` → `${uiHead({ icon: "bot", title: "Asistente de tu tienda" })}`
- `<h3>Apariencia</h3>` → `${uiHead({ icon: "palette", title: "Apariencia" })}`
- Lines 60-62 (the Trato fieldset) →

```js
        <fieldset class="ui-pills"><legend>Trato</legend>
          ${uiPill({ group: "assistantFormality", value: "tu", label: "Tú", checked: formalityValue === "tu" })}
          ${uiPill({ group: "assistantFormality", value: "usted", label: "Usted", checked: formalityValue === "usted" })}</fieldset>
```

- `<h3>Lo que el asistente debe saber</h3>` and the `<p>` under it → `${uiHead({ icon: "book-open", title: "Lo que el asistente debe saber", text: "Envíos, feriados, tu historia." })}` (the textarea keeps `aria-label="Lo que el asistente debe saber"`, which the e2e uses).
- `<h3>Cupones que puede ofrecer</h3>` → `${uiHead({ icon: "ticket", title: "Cupones que puede ofrecer", count: data.coupons.length })}`
- Line 75's label → `${uiSwitch({ label: c.showInAssistant ? "Puede ofrecerlo" : "No lo ofrece", attrs: `data-assistant-coupon="${esc(c.id)}" aria-label="El asistente puede ofrecer ${esc(c.code)}"`, checked: c.showInAssistant })}`

- [ ] **Step 2: Retire `.email-list-switch`**

Run: `cd apps/merchant-dashboard && grep -rn "email-list-switch" src/*.mjs src/dashboard.js`
Expected: no output. Then in `src/email-studio.css` change line 81 to `.email-list-state { … }` (drop `, .email-list-switch span`), delete lines 82-83 and line 89.

- [ ] **Step 3: Run the checks**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test tests/assistant.spec.mjs tests/email-studio-panel.spec.mjs --reporter=line 2>&1 | tail -4`
Expected: unit `fail 0`; e2e all passed (line 96's `toBeDisabled` included).

- [ ] **Step 4: Look at it** — Asistente at 1440 and 390, with and without a published design.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/assistant-panel.mjs apps/merchant-dashboard/src/email-studio.css
git commit -m "feat(dashboard): Asistente on the ui kit; retire the last email-list-switch"
```

---

### Task 9: Descuentos, and the sweep

**Files:**
- Modify: `apps/merchant-dashboard/src/dashboard.js` (imports near line 6, promo switch line 964)

**Interfaces:**
- Consumes: `uiSwitch` (Task 2).

- [ ] **Step 1: Convert the promo switch**

Add after line 6 (`import { escapeHtml as esc } from "/src/html.mjs";`):

```js
import { uiSwitch } from "/src/ui-kit.mjs";
```

Line 964 → `${uiSwitch({ label: "Mostrar en correos", attrs: `data-promo-email="${esc(code.id)}"`, checked: code.showInEmails })}`

The e2e `row.getByLabel("Mostrar en correos").check()` (email-studio-panel.spec.mjs:240) keeps working: the label wraps the input.

- [ ] **Step 2: Sweep — no retired control classes remain**

Run: `cd apps/merchant-dashboard && grep -rnE "cobro-toggle|email-list-switch|email-content-switch|promo-code-email-toggle|class=\"settings-tabs\"|cobros-filters|proposals-filters|subs-tabs|contract-sign-tabs|visual-conversion-option|proposal-pill|cobro-preset" src index.html | grep -v "\.test\.mjs"`
Expected: no output. `checkbox-row` may still appear outside the converted screens (storefront editor rows in `index.html`/`dashboard.js`); list those hits in the report — they are not settings options and stay.

- [ ] **Step 3: Full checks**

Run: `cd apps/merchant-dashboard && npx tsc -p tsconfig.json --noEmit && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -4 && npx playwright test --workers=2 --reporter=line 2>&1 | tail -6`
Expected: tsc silent; unit `fail 0`; e2e all passed. If a spec fails, rerun it alone. If it is a spec this plan never touched and it also failed before Task 1 (baseline before this work: unit 200/200, settings e2e 34 passed + 1 skipped), report it as pre-existing; otherwise fix it before committing.

- [ ] **Step 4: Commit**

```bash
git add apps/merchant-dashboard/src/dashboard.js
git commit -m "feat(dashboard): promo code switch on the ui kit"
```

- [ ] **Step 5: Final look** — walk Ajustes, Correos, Cobrar, Propuestas, Contratos, Suscripciones, Asistente and Descuentos at 1440 and 390 and save one screenshot per screen for the owner.
