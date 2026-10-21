# Calm dashboard — Part A: Declutter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the merchant dashboard from 24 sidebar entries to 7, hide (not delete) the screens and fields YAPI makes redundant behind `DASHBOARD_FULL_NAV=1`, and point the merchant to YAPI where a form used to be.

**Architecture:** One pure module (`src/nav-sections.mjs`) owns the seven sections, which views and Correos-y-marketing tabs each holds, and which are full-nav-only. `server.mjs` marks `<html data-full-nav>` when the switch is on; one CSS rule hides every `[data-full-nav-only]` element otherwise. `dashboard.js` keeps its existing view ids and hashes, highlights the section link, and draws the section's pill tabs under the page title.

**Tech Stack:** Vanilla ES modules, static `index.html`, `node:test` + jsdom unit tests, Playwright e2e (`apps/merchant-dashboard/tests`).

**Spec:** `docs/superpowers/specs/2026-10-21-calm-dashboard-yapi-immersive-design.md` (Part A). Read it first.

## Global Constraints

- Hidden means hidden: no panel module, API route or stored value is deleted. `DASHBOARD_FULL_NAV=1` shows everything again.
- View ids and `#dashboard-<view>` hashes do not change.
- Hidden settings fields are never sent on save when the switch is off (`PATCH /stores/:id` treats a missing `tagline`/`policies` as unchanged — `apps/api/src/stores/store-presentation.ts:607,678`).
- All merchant-facing copy is Spanish, short, no exclamation marks.
- Never run `prisma migrate/diff/reset`; this part touches no API code.
- Work on the checked-out branch `feature/store-page-architecture`; the owner's dev servers read this working tree.
- Unit tests: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`.
- E2E: `cd apps/merchant-dashboard && npx playwright test --workers=1` (reuses the running dashboard on :4323 locally).

## Deviations from the spec (decided while planning, from the code)

- **Inicio:** Crecimiento becomes a pill under Inicio («Resumen · Crecimiento») instead of being merged into one page; merging would rebuild a 1,700px analytics panel. Inicio itself still gets shorter (finance detail moves to Dinero).
- **Ajustes:** Equipo and Remitente are their own Ajustes pills, not nested inside Cuenta y Dominio (they are Studio frames on the marketing view). Comeback is a Clientes pill.
- **Productos:** the inventory import is already a closed `<details>` (`index.html:618`); nothing to do.
- **«Pídele a YAPI»** only where YAPI's tools can do it: policies (`set_store_policy`) and colours/type (`set_account_theme`). The email editor and the assistant's Apariencia are hidden without a YAPI line — YAPI's design agent cannot edit those.

## Review Focus

1. A saved link or `localStorage` view pointing at a hidden view (`#dashboard-contracts`) — lands on Inicio, no blank page. (Task 3 test)
2. Saving Ajustes › General with the switch off after YAPI rewrote a policy — the policy stays as YAPI wrote it. (Task 6 test)
3. A Crecimiento insight whose action is «Escribe tus políticas» or a proposal — opens YAPI's composer or shows no button; never routes to a hidden screen. (Task 6 test)
4. Plantillas flag off — no Plantillas pill under Tienda; flag on — the pill shows. (Task 4 test)
5. Login with zero or one existing session profile — no «¿Quién está ingresando?» dialog; two or more — the dialog shows. (Task 8 test)

---

## File Structure

- Create `src/nav-sections.mjs` — sections, tab lists, `sectionOf`, `resolveView`, `renderSectionTabs`, `fullNavOn`. Pure; no DOM writes.
- Create `src/nav-sections.test.mjs`.
- Create `src/full-nav.mjs` — `injectFullNav(html, enabled)` used by `server.mjs`.
- Create `src/full-nav.test.mjs`.
- Create `src/ask-yapi.mjs` — `askYapiLine({ text, request })` markup.
- Create `src/ask-yapi.test.mjs`.
- Create `src/declutter.test.mjs` — markup assertions over `index.html` and `dashboard.js` (existing style, see `src/plantillas-flag.test.mjs`).
- Modify `server.mjs` — call `injectFullNav`.
- Modify `index.html` — sidebar, header, pills host, finance section page, Marca tab, hidden extras.
- Modify `src/dashboard.js` — router, pills, ask-yapi click, plantillas pill.
- Modify `src/calm.css` — `[data-full-nav-only]` rule, section pills, `.ask-yapi`.
- Modify `src/store-settings.mjs` — tagline/policies hidden + not sent; ask-yapi lines.
- Modify `src/assistant-panel.mjs` — Apariencia hidden.
- Modify `src/email-studio-panel.mjs` — content editor, copy form, «Más llamativo» hidden.
- Modify `src/growth.mjs`, `src/growth-panel.mjs` — `actionRoute(action, { fullNav })`.
- Modify `src/profile-sessions.mjs` — skip dialog under two profiles.
- Modify `src/plantillas-flag.test.mjs`, `src/growth.test.mjs`, e2e specs listed in Task 9.
- Create `tests/helpers/nav.mjs` — `openView(page, view)`, `enableFullNav(page)`.

---

### Task 1: Section model

**Files:**
- Create: `apps/merchant-dashboard/src/nav-sections.mjs`
- Test: `apps/merchant-dashboard/src/nav-sections.test.mjs`

**Interfaces:**
- Produces:
  - `NAV_SECTIONS: Array<{ id: string, label: string, description: string, fullNavOnly?: boolean, tabs: Array<{ view: string, label: string, marketingTab?: string, fullNavOnly?: boolean }>, alsoViews?: string[] }>`
  - `KNOWN_VIEWS: Set<string>`
  - `sectionOf(view: string, marketingTab?: string): { section, tab }` — `tab` may be `null` (e.g. `account`).
  - `resolveView(view: string, fullNav: boolean): string` — unknown or hidden → `"overview"`.
  - `visibleTabs(section, { fullNav: boolean, hiddenViews?: Set<string> }): tab[]`
  - `renderSectionTabs(section, activeTab, options): string` — `""` when fewer than two visible tabs.
  - `tabKey(tab): string` — `"marketing:emails"` or `"payments"`.
  - `fullNavOn(doc = globalThis.document): boolean`

- [ ] **Step 1: Write the failing test**

```js
// apps/merchant-dashboard/src/nav-sections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_SECTIONS, KNOWN_VIEWS, sectionOf, resolveView, visibleTabs, renderSectionTabs, tabKey, fullNavOn } from './nav-sections.mjs';

test('seven sections show by default; Documentos is full-nav only', () => {
  assert.deepEqual(NAV_SECTIONS.filter(s => !s.fullNavOnly).map(s => s.label), ['Inicio', 'Tienda', 'Pedidos', 'Cobrar', 'Dinero', 'Clientes', 'Ajustes']);
  assert.deepEqual(NAV_SECTIONS.filter(s => s.fullNavOnly).map(s => s.id), ['documentos']);
});

test('every tab key belongs to exactly one section', () => {
  const keys = NAV_SECTIONS.flatMap(s => s.tabs.map(tabKey));
  assert.equal(new Set(keys).size, keys.length);
});

test('every view the dashboard opens today is known', () => {
  for (const view of ['overview', 'growth', 'stores', 'workspace', 'templates', 'products', 'media', 'charge-links', 'inbox', 'payments', 'subscriptions', 'payouts', 'cobros', 'proposals', 'contracts', 'marketing', 'abandoned-carts', 'assistant', 'experiments', 'integrations', 'compliance', 'connect-ai', 'store-settings', 'account']) {
    assert.ok(KNOWN_VIEWS.has(view), view);
  }
});

test('sectionOf maps views and marketing tabs', () => {
  assert.equal(sectionOf('payments').section.id, 'pedidos');
  assert.equal(sectionOf('marketing', 'emails').section.id, 'clientes');
  assert.equal(sectionOf('marketing', 'staff').section.id, 'ajustes');
  assert.equal(sectionOf('marketing', 'domain').tab.label, 'Remitente');
  assert.equal(sectionOf('marketing', 'nope').section.id, 'clientes');
  assert.equal(sectionOf('account').section.id, 'ajustes');
  assert.equal(sectionOf('account').tab, null);
});

test('resolveView sends hidden and unknown views to Inicio', () => {
  assert.equal(resolveView('contracts', false), 'overview');
  assert.equal(resolveView('contracts', true), 'contracts');
  assert.equal(resolveView('payments', false), 'payments');
  assert.equal(resolveView('nope', true), 'overview');
  assert.equal(resolveView('', false), 'overview');
});

test('visibleTabs drops full-nav-only and hidden views', () => {
  const clientes = NAV_SECTIONS.find(s => s.id === 'clientes');
  assert.ok(!visibleTabs(clientes, { fullNav: false }).some(t => t.marketingTab === 'logs'));
  assert.ok(visibleTabs(clientes, { fullNav: true }).some(t => t.marketingTab === 'logs'));
  const tienda = NAV_SECTIONS.find(s => s.id === 'tienda');
  assert.ok(!visibleTabs(tienda, { fullNav: false, hiddenViews: new Set(['templates']) }).some(t => t.view === 'templates'));
});

test('renderSectionTabs marks the active pill and skips single-tab sections', () => {
  const pedidos = NAV_SECTIONS.find(s => s.id === 'pedidos');
  const html = renderSectionTabs(pedidos, pedidos.tabs[1], { fullNav: false });
  assert.match(html, /<button type="button" class="section-tab" data-section-view="inbox" aria-current="page">Mensajes<\/button>/);
  assert.match(html, /data-section-view="payments">Pedidos</);
  const clientes = NAV_SECTIONS.find(s => s.id === 'clientes');
  assert.match(renderSectionTabs(clientes, clientes.tabs[0], { fullNav: false }), /data-section-view="marketing" data-section-marketing-tab="emails" aria-current="page"/);
  assert.equal(renderSectionTabs(NAV_SECTIONS.find(s => s.id === 'cobrar'), null, { fullNav: false }), '');
});

test('fullNavOn reads the html attribute', () => {
  assert.equal(fullNavOn({ documentElement: { hasAttribute: name => name === 'data-full-nav' } }), true);
  assert.equal(fullNavOn({ documentElement: { hasAttribute: () => false } }), false);
  assert.equal(fullNavOn(undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/nav-sections.test.mjs`
Expected: FAIL — `Cannot find module './nav-sections.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// apps/merchant-dashboard/src/nav-sections.mjs
import { escapeHtml as esc } from "./html.mjs";

/**
 * The dashboard's seven sections (spec 2026-10-21 Part A). A section is one sidebar link; its tabs are the pills under
 * the page title. A tab is a dashboard view, or a Correos y marketing tab on the `marketing` view. Full-nav-only
 * sections and tabs show only when the dashboard runs with DASHBOARD_FULL_NAV=1 (`<html data-full-nav>`).
 */
export const NAV_SECTIONS = [
  { id: "inicio", label: "Inicio", description: "Tus ventas y lo que sigue, de un vistazo.",
    tabs: [{ view: "overview", label: "Resumen" }, { view: "growth", label: "Crecimiento" }] },
  { id: "tienda", label: "Tienda", description: "Diseña con YAPI y cuida tu catálogo.",
    tabs: [{ view: "workspace", label: "Diseño" }, { view: "products", label: "Productos" }, { view: "media", label: "Medios" }, { view: "templates", label: "Plantillas" }, { view: "stores", label: "Tus tiendas" }] },
  { id: "pedidos", label: "Pedidos", description: "Lo que te compraron y lo que te escribieron.",
    tabs: [{ view: "payments", label: "Pedidos" }, { view: "inbox", label: "Mensajes" }] },
  { id: "cobrar", label: "Cobrar", description: "Un QR o un link para cobrar al instante.",
    tabs: [{ view: "charge-links", label: "Cobrar" }] },
  { id: "dinero", label: "Dinero", description: "Tu saldo, tus finanzas y cuándo te llega el dinero.",
    tabs: [{ view: "payouts", label: "Dinero" }] },
  { id: "clientes", label: "Clientes", description: "Correos, promociones y quienes vuelven a comprar.",
    tabs: [
      { view: "marketing", marketingTab: "emails", label: "Correos" },
      { view: "marketing", marketingTab: "campaigns", label: "Campañas" },
      { view: "marketing", marketingTab: "program", label: "Comeback" },
      { view: "marketing", marketingTab: "promotions", label: "Códigos" },
      { view: "marketing", marketingTab: "customers", label: "Tus clientes" },
      { view: "abandoned-carts", label: "Carritos" },
      { view: "subscriptions", label: "Suscripciones" },
      { view: "assistant", label: "Asistente" },
      { view: "marketing", marketingTab: "logs", label: "Registros", fullNavOnly: true },
    ] },
  { id: "ajustes", label: "Ajustes", description: "Tu tienda, tu cuenta y tus conexiones.", alsoViews: ["account"],
    tabs: [
      { view: "store-settings", label: "Tu tienda" },
      { view: "compliance", label: "Cuenta y facturación" },
      { view: "marketing", marketingTab: "staff", label: "Equipo" },
      { view: "marketing", marketingTab: "domain", label: "Remitente" },
      { view: "connect-ai", label: "Conecta tu IA" },
      { view: "integrations", label: "Integraciones" },
      { view: "experiments", label: "Pruebas A/B" },
    ] },
  { id: "documentos", label: "Documentos", description: "Cobros, propuestas y contratos.", fullNavOnly: true,
    tabs: [{ view: "cobros", label: "Cobros" }, { view: "proposals", label: "Propuestas" }, { view: "contracts", label: "Contratos" }] },
];

export const KNOWN_VIEWS = new Set(NAV_SECTIONS.flatMap(s => [...s.tabs.map(t => t.view), ...(s.alsoViews || [])]));
const HIDDEN_VIEWS = new Set(NAV_SECTIONS.filter(s => s.fullNavOnly).flatMap(s => s.tabs.map(t => t.view)));
const CLIENTES = NAV_SECTIONS.find(s => s.id === "clientes");

export const tabKey = (tab) => tab.marketingTab ? `${tab.view}:${tab.marketingTab}` : tab.view;

export function sectionOf(view, marketingTab) {
  for (const section of NAV_SECTIONS) {
    const tab = section.tabs.find(t => t.view === view && (view !== "marketing" || t.marketingTab === marketingTab));
    if (tab) return { section, tab };
  }
  if (view === "marketing") return { section: CLIENTES, tab: CLIENTES.tabs[0] };
  const owner = NAV_SECTIONS.find(s => s.alsoViews?.includes(view));
  if (owner) return { section: owner, tab: null };
  return { section: NAV_SECTIONS[0], tab: NAV_SECTIONS[0].tabs[0] };
}

export function resolveView(view, fullNav) {
  if (!KNOWN_VIEWS.has(view)) return "overview";
  return HIDDEN_VIEWS.has(view) && !fullNav ? "overview" : view;
}

export function visibleTabs(section, { fullNav, hiddenViews = new Set() }) {
  return section.tabs.filter(t => (fullNav || !t.fullNavOnly) && !hiddenViews.has(t.view));
}

export function renderSectionTabs(section, activeTab, options) {
  const tabs = visibleTabs(section, options);
  if (tabs.length < 2) return "";
  const activeKey = activeTab ? tabKey(activeTab) : "";
  return tabs.map(t => `<button type="button" class="section-tab" data-section-view="${esc(t.view)}"${t.marketingTab ? ` data-section-marketing-tab="${esc(t.marketingTab)}"` : ""}${tabKey(t) === activeKey ? ' aria-current="page"' : ""}>${esc(t.label)}</button>`).join("");
}

export function fullNavOn(doc = globalThis.document) {
  return Boolean(doc?.documentElement?.hasAttribute("data-full-nav"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/nav-sections.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/nav-sections.mjs apps/merchant-dashboard/src/nav-sections.test.mjs
git commit -m "feat(dashboard): seven-section nav model with full-nav-only sections and tabs"
```

---

### Task 2: The full-nav switch

**Files:**
- Create: `apps/merchant-dashboard/src/full-nav.mjs`
- Test: `apps/merchant-dashboard/src/full-nav.test.mjs`
- Modify: `apps/merchant-dashboard/server.mjs` (imports; the `/` and `/index.html` branch at ~line 139)
- Modify: `apps/merchant-dashboard/src/calm.css` (append)

**Interfaces:**
- Produces: `injectFullNav(html: string, enabled: boolean): string`; CSS contract — `html:not([data-full-nav]) [data-full-nav-only]` is never displayed; `html[data-full-nav] .ask-yapi` is never displayed.

- [ ] **Step 1: Write the failing test**

```js
// apps/merchant-dashboard/src/full-nav.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectFullNav } from './full-nav.mjs';

test('injectFullNav marks <html> only when enabled', () => {
  const html = '<!doctype html>\n<html lang="es">\n<head></head>';
  assert.equal(injectFullNav(html, false), html);
  assert.match(injectFullNav(html, true), /<html lang="es" data-full-nav>/);
  assert.equal(injectFullNav(injectFullNav(html, true), true).match(/data-full-nav/g).length, 1);
});

test('server.mjs applies the switch from DASHBOARD_FULL_NAV', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /process\.env\.DASHBOARD_FULL_NAV === "1"/);
  assert.match(server, /injectFullNav\(injectLiveReload\(html\), fullNavEnabled\)/);
});

test('calm.css hides full-nav-only things unless the switch is on', () => {
  const css = readFileSync(new URL('./calm.css', import.meta.url), 'utf8');
  assert.match(css, /html:not\(\[data-full-nav\]\) \[data-full-nav-only\] \{ display: none !important; \}/);
  assert.match(css, /html\[data-full-nav\] \.ask-yapi \{ display: none !important; \}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/full-nav.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// apps/merchant-dashboard/src/full-nav.mjs
/** DASHBOARD_FULL_NAV=1 brings back every screen and field the calm dashboard hides (spec 2026-10-21 A2). */
export function injectFullNav(html, enabled) {
  if (!enabled || /<html[^>]*\sdata-full-nav[\s>]/.test(html)) return html;
  return html.replace(/<html(\s[^>]*)?>/, (tag, attrs = "") => `<html${attrs} data-full-nav>`);
}
```

In `server.mjs`, add the import beside the others and the flag beside `liveReloadEnabled`:

```js
import { injectFullNav } from "./src/full-nav.mjs";
// …
const fullNavEnabled = process.env.DASHBOARD_FULL_NAV === "1";
```

and change the index branch's last line from `res.end(injectLiveReload(html));` to:

```js
      res.end(injectFullNav(injectLiveReload(html), fullNavEnabled));
```

Append to `src/calm.css`:

```css
/* Spec 2026-10-21 A2: screens and fields YAPI makes redundant stay in the code, hidden unless DASHBOARD_FULL_NAV=1. */
html:not([data-full-nav]) [data-full-nav-only] { display: none !important; }
html[data-full-nav] .ask-yapi { display: none !important; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/full-nav.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/full-nav.mjs apps/merchant-dashboard/src/full-nav.test.mjs apps/merchant-dashboard/server.mjs apps/merchant-dashboard/src/calm.css
git commit -m "feat(dashboard): DASHBOARD_FULL_NAV switch and the hide rule"
```

---

### Task 3: Seven-link sidebar and router

**Files:**
- Modify: `apps/merchant-dashboard/index.html:159-236` (sidebar, header)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (`syncNavGroups` ~377-394, `DASHBOARD_VIEW_COPY` ~399-426, `setDashboardView` ~567-604)
- Test: `apps/merchant-dashboard/src/declutter.test.mjs`

**Interfaces:**
- Consumes: `NAV_SECTIONS`, `sectionOf`, `resolveView`, `renderSectionTabs`, `fullNavOn` (Task 1); CSS rule (Task 2).
- Produces: sidebar links `#dashboardNav a[data-nav-section]`; `#sectionTabs` host; `renderSectionPills(section, activeTab)` in `dashboard.js` (Task 4 extends it); `setDashboardView` writes the section's label/description into `#workspaceTitle`/`#workspaceDescription`.

- [ ] **Step 1: Write the failing test**

```js
// apps/merchant-dashboard/src/declutter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const navStart = html.indexOf('<nav class="dashboard-nav"');
const nav = html.slice(navStart, html.indexOf('</nav>', navStart));

test('the sidebar has seven section links plus Documentos for full nav', () => {
  const links = [...nav.matchAll(/<a [^>]*data-nav-section="([a-z]+)"[^>]*>/g)];
  assert.deepEqual(links.map(m => m[1]), ['inicio', 'tienda', 'pedidos', 'cobrar', 'dinero', 'clientes', 'ajustes', 'documentos']);
  assert.match(links.at(-1)[0], /data-full-nav-only/);
  assert.doesNotMatch(nav, /dashboard-nav-group/);
});

test('sidebar extras are full-nav only', () => {
  for (const marker of ['class="ai-setup-launch"', 'class="connect-ai-card"', 'class="dashboard-sidebar-foot"', 'class="mobile-nav-hint"', 'class="merchant-store-tabs"']) {
    const tag = html.match(new RegExp(`<[a-z]+ ${marker}[^>]*>`))?.[0] ?? '';
    assert.match(tag, /data-full-nav-only/, marker);
  }
});

test('the header has no kicker and hosts the section pills', () => {
  assert.doesNotMatch(html, /workspace-kicker/);
  assert.match(html, /<nav class="section-tabs" id="sectionTabs" aria-label="Pestañas de la sección" hidden><\/nav>/);
});

test('the router resolves hidden views and titles by section', () => {
  assert.match(js, /const nextView = resolveView\(view, fullNavOn\(\)\);/);
  assert.match(js, /const \{ section, tab: activeTab \} = sectionOf\(nextView, document\.getElementById\("marketingTabs"\)\.dataset\.tab\);/);
  assert.match(js, /document\.getElementById\("workspaceTitle"\)\.textContent = section\.label;/);
  assert.doesNotMatch(js, /DASHBOARD_VIEW_COPY/);
  assert.doesNotMatch(js, /syncNavGroups/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/declutter.test.mjs`
Expected: FAIL on all four tests.

- [ ] **Step 3: Replace the sidebar nav in `index.html`**

Replace everything from `<nav class="dashboard-nav" id="dashboardNav" …>` to its `</nav>` (lines 168-207) with the block below. Each `SVG(…)` stands for the `<svg>…</svg>` element copied unchanged from the current link named inside it — paste the element, not the `SVG(…)` text:

```html
        <nav class="dashboard-nav" id="dashboardNav" aria-label="Secciones del panel">
          <a class="dashboard-nav-button" href="#dashboard-overview" data-dashboard-view="overview" data-nav-section="inicio" aria-current="page"><span class="dashboard-nav-icon">SVG(«Resumen», line 169)</span>Inicio</a>
          <a class="dashboard-nav-button" href="#dashboard-workspace" data-dashboard-view="workspace" data-nav-section="tienda"><span class="dashboard-nav-icon">SVG(«Tu tienda» summary, line 172)</span>Tienda</a>
          <a class="dashboard-nav-button" href="#dashboard-payments" data-dashboard-view="payments" data-nav-section="pedidos"><span class="dashboard-nav-icon">SVG(«Inbox», line 182)</span>Pedidos</a>
          <a class="dashboard-nav-button" href="#dashboard-charge-links" data-dashboard-view="charge-links" data-nav-section="cobrar"><span class="dashboard-nav-icon">SVG(«Cobrar» summary, line 180)</span>Cobrar</a>
          <a class="dashboard-nav-button" href="#dashboard-payouts" data-dashboard-view="payouts" data-nav-section="dinero"><span class="dashboard-nav-icon">SVG(«Desembolsos», line 185)</span>Dinero</a>
          <a class="dashboard-nav-button" href="#dashboard-marketing" data-dashboard-view="marketing" data-nav-section="clientes"><span class="dashboard-nav-icon">SVG(«Correos y marketing», line 195)</span>Clientes</a>
          <a class="dashboard-nav-button" href="#dashboard-store-settings" data-dashboard-view="store-settings" data-nav-section="ajustes"><span class="dashboard-nav-icon">SVG(«Ajustes», line 206)</span>Ajustes</a>
          <a class="dashboard-nav-button" href="#dashboard-cobros" data-dashboard-view="cobros" data-nav-section="documentos" data-full-nav-only><span class="dashboard-nav-icon">SVG(«Documentos» summary, line 188)</span>Documentos</a>
        </nav>
```

The old `<a … id="dashboardTemplatesNav" hidden>` goes with the rest of the old nav (Task 4 replaces it with a pill).

Add `data-full-nav-only` to these existing opening tags (keep everything else on them):
- `<span class="mobile-nav-hint" aria-hidden="true">` → `<span class="mobile-nav-hint" aria-hidden="true" data-full-nav-only>`
- `<button class="ai-setup-launch" …>` → add ` data-full-nav-only` before `>`
- `<section class="connect-ai-card" …>` → same
- `<div class="dashboard-sidebar-foot">` → `<div class="dashboard-sidebar-foot" data-full-nav-only>`
- `<nav class="merchant-store-tabs" id="merchantStoreTabs" …>` → add ` data-full-nav-only` before `hidden>`

Replace the header block (lines 230-236):

```html
        <header class="workspace-header" aria-live="polite">
          <div>
            <h2 class="workspace-title" id="workspaceTitle">Inicio</h2>
            <p class="workspace-description" id="workspaceDescription">Tus ventas y lo que sigue, de un vistazo.</p>
          </div>
        </header>
        <nav class="section-tabs" id="sectionTabs" aria-label="Pestañas de la sección" hidden></nav>
```

- [ ] **Step 4: Rewire the router in `src/dashboard.js`**

Add to the imports at the top:

```js
import { sectionOf, resolveView, renderSectionTabs, fullNavOn } from "/src/nav-sections.mjs";
```

Delete `syncNavGroups` and the `for (const group of document.querySelectorAll(".dashboard-nav-group"))` listener loop (lines ~377-394), and the `syncNavGroups(nextView);` call inside `setDashboardView`. Delete the whole `DASHBOARD_VIEW_COPY` object (~399-426); first run `grep -n "DASHBOARD_VIEW_COPY" src/dashboard.js` and confirm the only other uses are the two inside `setDashboardView`.

In `setDashboardView`, replace

```js
    const nextView = DASHBOARD_VIEW_COPY[view] ? view : "overview";
```

with

```js
    const nextView = resolveView(view, fullNavOn());
```

and replace the block from the `document.querySelectorAll("[data-dashboard-view]").forEach((button) => {` aria-current loop through `document.getElementById("workspaceDescription").textContent = description;` with:

```js
    const { section, tab: activeTab } = sectionOf(nextView, document.getElementById("marketingTabs").dataset.tab);
    document.querySelectorAll("[data-dashboard-view]:not([data-nav-section])").forEach((button) => {
      if (button.dataset.dashboardView === nextView && !button.dataset.studioTool) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll("#dashboardNav [data-nav-section]").forEach((link) => {
      if (link.dataset.navSection === section.id) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    document.getElementById("workspaceTitle").textContent = section.label;
    document.getElementById("workspaceDescription").textContent = section.description;
    renderSectionPills(section, activeTab);
```

Add `renderSectionPills` right above `setDashboardView` (Task 4 extends it):

```js
  function renderSectionPills(section, activeTab) {
    const host = document.getElementById("sectionTabs");
    host.innerHTML = renderSectionTabs(section, activeTab, { fullNav: fullNavOn() });
    host.hidden = !host.innerHTML;
  }
```

The initial-view code (~627-631) already passes the hash or stored view through `setDashboardView`, which now resolves hidden views; leave it.

- [ ] **Step 5: Run the unit tests**

Run: `cd apps/merchant-dashboard && node --test src/declutter.test.mjs src/nav-sections.test.mjs`
Expected: PASS. Then the whole unit suite: `node --test unit/*.test.mjs src/*.test.mjs` — `src/plantillas-flag.test.mjs` and the page fail on the removed `dashboardTemplatesNav` until Task 4; everything else PASS. Do Task 4 before reloading the owner's browser.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/declutter.test.mjs
git commit -m "feat(dashboard): seven-link sidebar; hidden views land on Inicio"
```

---

### Task 4: Section pills

**Files:**
- Modify: `apps/merchant-dashboard/src/dashboard.js` (`renderSectionPills`, a click listener, plantillas flag ~722 and ~774-775, `selectMarketingTab` ~445)
- Modify: `apps/merchant-dashboard/index.html:582` (`#marketingTabs`)
- Modify: `apps/merchant-dashboard/src/calm.css` (append pill styles)
- Modify: `apps/merchant-dashboard/src/plantillas-flag.test.mjs`
- Test: `apps/merchant-dashboard/src/declutter.test.mjs`

**Interfaces:**
- Consumes: `renderSectionTabs`, `fullNavOn` (Task 1); `#sectionTabs`, `renderSectionPills` (Task 3).
- Produces: `let plantillasOn` read by `renderSectionPills`; pills are `button.section-tab[data-section-view][data-section-marketing-tab?]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/declutter.test.mjs`:

```js
test('pills switch views and marketing tabs; the old marketing tab bar is hidden', () => {
  assert.match(js, /const pill = event\.target\.closest\("\[data-section-view\]"\);/);
  assert.match(js, /if \(tab\) selectMarketingTab\(tab\);/);
  assert.match(html, /<nav class="marketing-tabs" id="marketingTabs" aria-label="Herramientas de marketing" data-tab="emails" hidden>/);
});

test('a hidden marketing tab falls back to Correos', () => {
  assert.match(js, /if \(tab === "logs" && !fullNavOn\(\)\) tab = "emails";/);
});
```

Replace the first test in `src/plantillas-flag.test.mjs` with:

```js
test('the Plantillas pill shows only with the flag', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /api\("\/store-templates\/settings"\)/);
  assert.match(js, /hiddenViews: plantillasOn \? new Set\(\) : new Set\(\["templates"\]\)/);
  assert.match(js, /\.\.\.\(plantillasOn \? \{ onTemplates:/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/declutter.test.mjs src/plantillas-flag.test.mjs`
Expected: FAIL on the three new assertions.

- [ ] **Step 3: Implement**

In `index.html` line 582 add `hidden` to the marketing tab bar's opening tag: `<nav class="marketing-tabs" id="marketingTabs" aria-label="Herramientas de marketing" data-tab="emails" hidden>` (the buttons stay; `selectMarketingTab` still keeps their state).

In `src/dashboard.js`, change `renderSectionPills` to:

```js
  function renderSectionPills(section, activeTab) {
    const host = document.getElementById("sectionTabs");
    host.innerHTML = renderSectionTabs(section, activeTab, { fullNav: fullNavOn(), hiddenViews: plantillasOn ? new Set() : new Set(["templates"]) });
    host.hidden = !host.innerHTML;
  }
```

`plantillasOn` is declared with `let` at ~line 722, below `setDashboardView`'s first call (~630). Move `let plantillasOn = false;` up to just above `renderSectionPills` so it exists on the first render, and delete the original line.

Replace line ~775 `document.getElementById("dashboardTemplatesNav").hidden = !plantillasOn;` with:

```js
    setDashboardView(document.body.dataset.dashboardView, { remember: false });
```

(re-renders the pills once the flag is known).

At the top of `selectMarketingTab`, after the existing `templates`/`flows` line, add:

```js
    if (tab === "logs" && !fullNavOn()) tab = "emails";
```

Add the pill listener right after the `#marketingTabs` click listener:

```js
  document.getElementById("sectionTabs").addEventListener("click", event => {
    const pill = event.target.closest("[data-section-view]"); if (!pill) return;
    const view = pill.dataset.sectionView, tab = pill.dataset.sectionMarketingTab;
    if (view === "marketing") {
      const frame = document.getElementById("storeMarketingFrame");
      if (frame.contentWindow?.pagosyaStudioCanLeave && !frame.contentWindow.pagosyaStudioCanLeave()) return;
    } else if (document.body.dataset.dashboardView === "workspace" && !canLeaveMerchantStudio()) return;
    if (tab) selectMarketingTab(tab);
    history.pushState(null, "", `#dashboard-${view}`);
    setDashboardView(view);
  });
```

Append to `src/calm.css`:

```css
.section-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 20px; }
.section-tab { border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--pg-text-muted); font: inherit; font-size: 14px; padding: 7px 14px; cursor: pointer; transition: background-color .2s ease, color .2s ease; }
.section-tab:hover { background: var(--pg-surface-raised); color: var(--pg-text); }
.section-tab[aria-current="page"] { background: var(--pg-surface); border-color: var(--pg-border); color: var(--pg-text); box-shadow: var(--calm-shadow); }
.section-tab:focus-visible { outline: 2px solid var(--pg-focus-ring); outline-offset: 2px; }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS (whole unit suite).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/calm.css apps/merchant-dashboard/src/declutter.test.mjs apps/merchant-dashboard/src/plantillas-flag.test.mjs
git commit -m "feat(dashboard): section pills replace nav groups and the marketing tab bar"
```

---

### Task 5: Shorter Inicio, finance on Dinero

**Files:**
- Modify: `apps/merchant-dashboard/index.html:268,273`
- Test: `apps/merchant-dashboard/src/declutter.test.mjs`

**Interfaces:**
- Consumes: none new. `setDashboardView` hides every `[data-dashboard-page]` whose value is not the current view, so moving a block is one attribute.

- [ ] **Step 1: Write the failing test**

Append to `src/declutter.test.mjs`:

```js
test('finance detail lives on Dinero; Inicio links to it', () => {
  assert.match(html, /<section class="block" id="financesSection" data-dashboard-page="payouts">/);
  assert.match(html, /<a class="overview-account-link" href="#dashboard-payouts" data-dashboard-view="payouts">Ver tu dinero<\/a>/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/declutter.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `index.html:273`: `data-dashboard-page="overview"` → `data-dashboard-page="payouts"` on `#financesSection`.
- `index.html:268`: link text `Ver desembolsos` → `Ver tu dinero`.
- Check that nothing loads finances only on the overview view: `grep -n 'financesSection\|loadFinances\|=== "overview"' src/dashboard.js`. If a loader is gated on `nextView === "overview"`, extend the condition to `["overview", "payouts"].includes(nextView)` and say so in the commit message.

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/declutter.test.mjs
git commit -m "feat(dashboard): finance detail moves from Inicio to Dinero"
```

---

### Task 6: Hide what YAPI already does

**Files:**
- Modify: `apps/merchant-dashboard/index.html:884` (Marca tab)
- Modify: `apps/merchant-dashboard/src/store-settings.mjs:100,152-156,441-453`
- Modify: `apps/merchant-dashboard/src/assistant-panel.mjs:54`
- Modify: `apps/merchant-dashboard/src/email-studio-panel.mjs:32,55,92`
- Modify: `apps/merchant-dashboard/src/growth.mjs:62-74`, `apps/merchant-dashboard/src/growth-panel.mjs:115,301`
- Test: `apps/merchant-dashboard/src/declutter.test.mjs`, `apps/merchant-dashboard/src/growth.test.mjs`

**Interfaces:**
- Consumes: `fullNavOn` (Task 1).
- Produces: `actionRoute(action, { fullNav = true } = {})` — with `fullNav: false`, `settings`+`policies` → `{ view: "workspace", compose: POLICY_REQUEST }`, `proposal` → `null`. `export const POLICY_REQUEST = "Escribe las políticas de mi tienda con estos datos: "` in `growth.mjs`.

- [ ] **Step 1: Write the failing tests**

Append to `src/declutter.test.mjs`:

```js
const settings = readFileSync(new URL('./store-settings.mjs', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('./assistant-panel.mjs', import.meta.url), 'utf8');
const emails = readFileSync(new URL('./email-studio-panel.mjs', import.meta.url), 'utf8');

test('Marca, tagline and policy fields are full-nav only', () => {
  assert.match(html, /data-settings-tab="brand" data-full-nav-only>Marca</);
  assert.match(settings, /<div data-full-nav-only><label for="storeTaglineInput">/);
  assert.match(settings, /<div class="store-editor-section-body" data-full-nav-only>\s*\$\{POLICY_FIELDS/);
});

test('with the switch off, saving never sends tagline or policies', () => {
  assert.match(settings, /\.\.\.\(fullNavOn\(\) && \{ tagline: taglineInput\.value\.trim\(\) \|\| null \}\)/);
  assert.match(settings, /\.\.\.\(fullNavOn\(\) && \{ policies: Object\.fromEntries/);
  assert.doesNotMatch(settings, /^\s+tagline: taglineInput/m);
});

test('assistant look and email editors are full-nav only', () => {
  assert.match(assistant, /<section class="assistant-card" data-full-nav-only>\s*\$\{uiHead\(\{ icon: "palette", title: "Apariencia" \}\)\}/);
  assert.match(emails, /contentRoot\.setAttribute\("data-full-nav-only", ""\);/);
  assert.match(emails, /<form class="email-studio-copy" data-copy-form data-full-nav-only novalidate>/);
  assert.match(emails, /data-email-bold data-full-nav-only/);
});
```

Append to `src/growth.test.mjs` (add `POLICY_REQUEST` to its import from `./growth.mjs`):

```js
test('without full nav, policy insights open YAPI and proposal insights have no action', () => {
  const policies = { kind: 'settings', payload: { view: 'store-settings', section: 'policies' } };
  assert.deepEqual(actionRoute(policies, { fullNav: false }), { view: 'workspace', compose: POLICY_REQUEST });
  assert.deepEqual(actionRoute(policies, { fullNav: true }), { view: 'store-settings', section: 'policies' });
  assert.deepEqual(actionRoute(policies), { view: 'store-settings', section: 'policies' });
  assert.equal(actionRoute({ kind: 'proposal', payload: { prompt: 'x' } }, { fullNav: false }), null);
  assert.deepEqual(actionRoute({ kind: 'settings', payload: { view: 'store-settings', section: 'contact' } }, { fullNav: false }), { view: 'store-settings', section: 'contact' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/declutter.test.mjs src/growth.test.mjs`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

`index.html:884`: add ` data-full-nav-only` before `>Marca<` on `#settingsTabBrand`.

`src/store-settings.mjs`:
- import: `import { fullNavOn } from "./nav-sections.mjs";`
- line 100: `<div><label for="storeTaglineInput">` → `<div data-full-nav-only><label for="storeTaglineInput">`
- policies section: change the `<div class="store-editor-section-body">` that directly precedes `${POLICY_FIELDS.map(` to `<div class="store-editor-section-body" data-full-nav-only>`
- in the save `patch` object, replace the `tagline:` line and the `policies:` line with:

```js
      ...(fullNavOn() && { tagline: taglineInput.value.trim() || null }),
      ...(fullNavOn() && { policies: Object.fromEntries(POLICY_FIELDS.map(([key]) => [key, policyInput(key).value.trim() || null])) }),
```

`src/assistant-panel.mjs:54`: the `<section class="assistant-card">` that holds `title: "Apariencia"` → `<section class="assistant-card" data-full-nav-only>`. Its save button (`data-assistant-save-look`) is inside it, so nothing else saves those fields.

`src/email-studio-panel.mjs`:
- after `contentRoot.setAttribute("data-email-content-root", "");` add `contentRoot.setAttribute("data-full-nav-only", "");`
- line 55: `data-email-bold ${off}` → `data-email-bold data-full-nav-only ${off}`
- line 92: `<form class="email-studio-copy" data-copy-form novalidate>` → `<form class="email-studio-copy" data-copy-form data-full-nav-only novalidate>`

`src/growth.mjs`: add `export const POLICY_REQUEST = "Escribe las políticas de mi tienda con estos datos: ";` above `actionRoute`, change its signature to `export function actionRoute(action, { fullNav = true } = {})` and its two cases to:

```js
    case "proposal": return fullNav ? { view: "proposals", brief: text(payload.prompt) } : null;
```

```js
    case "settings": {
      if (!SETTINGS_VIEWS.includes(payload.view)) return null;
      const section = SETTINGS_SECTIONS.includes(payload.section) ? payload.section : null;
      if (!fullNav && section === "policies") return { view: "workspace", compose: POLICY_REQUEST };
      return { view: payload.view, section };
    }
```

`src/growth-panel.mjs`: import `fullNavOn` from `./nav-sections.mjs`; at lines 115 and 301 change `actionRoute(insight.action)` to `actionRoute(insight.action, { fullNav: fullNavOn() })`.

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS. If `email-studio-panel.test.mjs` asserts the exact `data-email-bold` markup, update its selector only (the button still exists).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/store-settings.mjs apps/merchant-dashboard/src/assistant-panel.mjs apps/merchant-dashboard/src/email-studio-panel.mjs apps/merchant-dashboard/src/growth.mjs apps/merchant-dashboard/src/growth-panel.mjs apps/merchant-dashboard/src/declutter.test.mjs apps/merchant-dashboard/src/growth.test.mjs
git commit -m "feat(dashboard): hide brand, policy, tagline, email copy and assistant look forms; YAPI writes them"
```

---

### Task 7: «Pídele a YAPI»

**Files:**
- Create: `apps/merchant-dashboard/src/ask-yapi.mjs`
- Test: `apps/merchant-dashboard/src/ask-yapi.test.mjs`
- Modify: `apps/merchant-dashboard/src/store-settings.mjs` (Identidad and Políticas sections)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (`composeYapi` ~200-205, dock clearing ~548, document click listener)
- Modify: `apps/merchant-dashboard/src/calm.css` (append)

**Interfaces:**
- Consumes: `POLICY_REQUEST` (Task 6); `.ask-yapi` hide rule (Task 2).
- Produces: `askYapiLine({ text: string, request: string }): string`; `BRAND_REQUEST`; `composeInYapi(text: string, origin: string)` in `dashboard.js` (Part C reuses it for the immersive move).

- [ ] **Step 1: Write the failing test**

```js
// apps/merchant-dashboard/src/ask-yapi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askYapiLine, BRAND_REQUEST } from './ask-yapi.mjs';

test('askYapiLine escapes and carries the request', () => {
  const html = askYapiLine({ text: 'Tus políticas <las> escribe YAPI.', request: 'Escribe "mis" políticas' });
  assert.match(html, /^<p class="ask-yapi">Tus políticas &lt;las&gt; escribe YAPI\. <button type="button" class="ask-yapi-link" data-ask-yapi="Escribe &quot;mis&quot; políticas">Pídele a YAPI →<\/button><\/p>$/);
  assert.match(BRAND_REQUEST, /colores/);
});

test('settings shows the two lines and the dashboard opens YAPI from any of them', () => {
  const settings = readFileSync(new URL('./store-settings.mjs', import.meta.url), 'utf8');
  assert.match(settings, /askYapiLine\(\{ text: "Tus políticas las escribe YAPI con tus datos\.", request: POLICY_REQUEST \}\)/);
  assert.match(settings, /askYapiLine\(\{ text: "Colores, tipografía y estilo los define YAPI\.", request: BRAND_REQUEST \}\)/);
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /const ask = event\.target\.closest\("\[data-ask-yapi\]"\);/);
  assert.match(js, /composeInYapi\(ask\.dataset\.askYapi, "ask"\)/);
  assert.match(js, /composeYapi: \(text\) => composeInYapi\(text, "growth"\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/ask-yapi.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// apps/merchant-dashboard/src/ask-yapi.mjs
import { escapeHtml as esc } from "./html.mjs";

/** Where a hidden form used to be (spec 2026-10-21 A3): one line that opens YAPI with the request written, never sent. */
export const BRAND_REQUEST = "Quiero ajustar los colores y la tipografía de mi tienda: ";

export function askYapiLine({ text, request }) {
  return `<p class="ask-yapi">${esc(text)} <button type="button" class="ask-yapi-link" data-ask-yapi="${esc(request)}">Pídele a YAPI →</button></p>`;
}
```

`src/store-settings.mjs`: import `askYapiLine, BRAND_REQUEST` from `./ask-yapi.mjs` and `POLICY_REQUEST` from `./growth.mjs`. In the Identidad section, right after the `</div>` that closes `store-settings-logo full`, add:

```js
    ${askYapiLine({ text: "Colores, tipografía y estilo los define YAPI.", request: BRAND_REQUEST })}
```

In the Políticas section, right after the `data-full-nav-only` body's closing `</div>`, add:

```js
    ${askYapiLine({ text: "Tus políticas las escribe YAPI con tus datos.", request: POLICY_REQUEST })}
```

`src/dashboard.js`: lift the body of the growth deps' `composeYapi` into a named function declared above `mountGrowthPanel(...)`:

```js
  function composeInYapi(text, origin) {
    pendingStudioAction = { action: "compose", origin, text, storeId: currentStoreId };
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView("workspace");
    deliverStudioAction();
  }
```

Set the growth deps to `composeYapi: (text) => composeInYapi(text, "growth"),`, and change the dock-clearing check (~line 548) from `pendingStudioAction.origin !== "growth"` to `!["growth", "ask"].includes(pendingStudioAction.origin)`. Add a document listener next to the section-pill listener:

```js
  document.addEventListener("click", event => {
    const ask = event.target.closest("[data-ask-yapi]"); if (!ask) return;
    if (!currentStoreId) return;
    composeInYapi(ask.dataset.askYapi, "ask");
  });
```

Append to `src/calm.css`:

```css
.ask-yapi { margin: 4px 0 0; color: var(--pg-text-muted); font-size: 14px; }
.ask-yapi-link { border: 0; background: none; padding: 0; font: inherit; color: var(--pg-text); text-decoration: underline; text-decoration-color: var(--pg-brand); text-underline-offset: 3px; cursor: pointer; }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/ask-yapi.mjs apps/merchant-dashboard/src/ask-yapi.test.mjs apps/merchant-dashboard/src/store-settings.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/calm.css
git commit -m "feat(dashboard): «Pídele a YAPI» where the brand and policy forms were"
```

---

### Task 8: No session-name dialog for single-person accounts

**Files:**
- Modify: `apps/merchant-dashboard/src/profile-sessions.mjs:25-30,133-169`
- Test: `apps/merchant-dashboard/unit/profile-sessions.test.mjs` (create)

**Interfaces:**
- Produces (module-level exports): `profileNameFromEmail(email: string): string`, `profileChoices(payload): Array<{ profileName: string }>`, `autoProfileName(choices, email): string | null` — `null` means "ask".

- [ ] **Step 1: Write the failing test**

```js
// apps/merchant-dashboard/unit/profile-sessions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoProfileName, profileChoices, profileNameFromEmail } from '../src/profile-sessions.mjs';

test('profileChoices dedupes and skips placeholders', () => {
  const payload = { profiles: [{ profileName: 'Ana' }, { profileName: 'ana' }, { profileName: 'Seleccionar perfil' }, { profileName: '' }, { profileName: 'Luis' }] };
  assert.deepEqual(profileChoices(payload).map(c => c.profileName), ['Ana', 'Luis']);
  assert.deepEqual(profileChoices({ sessions: [{ profileName: 'Ana' }] }).map(c => c.profileName), ['Ana']);
});

test('one or no profile is chosen for the merchant; two or more ask', () => {
  assert.equal(autoProfileName([], 'maria.lopez@x.bo'), profileNameFromEmail('maria.lopez@x.bo'));
  assert.equal(autoProfileName([{ profileName: 'Propietario' }], 'a@x.bo'), 'Propietario');
  assert.equal(autoProfileName([{ profileName: 'Ana' }, { profileName: 'Luis' }], 'a@x.bo'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-dashboard && node --test unit/profile-sessions.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

Move `profileNameFromEmail` out of `createProfileSessions` to module level and export it (body unchanged). If it uses anything from the closure, it doesn't today (it only reads its `email` argument). Add, at module level:

```js
export function profileChoices(payload) {
  const seen = new Set();
  return (payload?.profiles?.length ? payload.profiles : payload?.sessions || []).filter((session) => {
    const name = String(session.profileName || "").trim();
    if (!name || name === "Seleccionar perfil") return false;
    const key = name.toLocaleLowerCase("es");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Spec 2026-10-21 A5: ask «¿Quién está ingresando?» only when the account already has two or more people. */
export function autoProfileName(choices, email) {
  if (choices.length >= 2) return null;
  return choices.length === 1 ? choices[0].profileName : profileNameFromEmail(email);
}
```

In `renderSessionProfileChoices`, replace the inline `seen`/filter block with `const choices = profileChoices(payload);`.

In `chooseProfileForNewLogin`, after `pendingLoginSessionId = currentSession.id;` insert:

```js
    const automatic = autoProfileName(profileChoices(payload), emailEl.value);
    if (automatic) {
      try {
        await updateProfileSession(currentSession.id, automatic, storedAvatarId(currentSession));
        deps.setProfileName(automatic);
        profileDisplayNameEl.textContent = deps.profileName();
        renderProfileAvatar();
        return;
      } catch { /* fall through to the dialog so the merchant can still name the session */ }
    }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/profile-sessions.mjs apps/merchant-dashboard/unit/profile-sessions.test.mjs
git commit -m "feat(dashboard): skip «¿Quién está ingresando?» unless the account has two or more people"
```

---

### Task 9: E2E specs follow the new nav

**Files:**
- Create: `apps/merchant-dashboard/tests/helpers/nav.mjs`
- Modify (as failures show): `tests/abandoned-carts.spec.mjs`, `tests/assistant.spec.mjs`, `tests/marketing-emails.spec.mjs`, `tests/growth.spec.mjs`, `tests/email-studio-panel.spec.mjs`, `tests/shipment-panel.spec.mjs`, `tests/store-settings.spec.mjs`, `tests/merchant-workspace.spec.mjs`, `tests/store-settings-tabs.spec.mjs`, `tests/dashboard-smoke.spec.mjs`, `tests/auth-account.spec.mjs`, `tests/cobros.spec.mjs`, `tests/contracts.spec.mjs`, `tests/proposals.spec.mjs`

**Interfaces:**
- Consumes: `sectionOf` (Task 1).
- Produces: `openView(page, view, marketingTab?)`, `enableFullNav(page)`.

- [ ] **Step 1: Write the helper**

```js
// apps/merchant-dashboard/tests/helpers/nav.mjs
import { expect } from "@playwright/test";
import { sectionOf } from "../../src/nav-sections.mjs";

/** Opens a dashboard view the way a merchant does: the section's sidebar link, then its pill. */
export async function openView(page, view, marketingTab) {
  const { section, tab } = sectionOf(view, marketingTab);
  await page.locator(`#dashboardNav [data-nav-section="${section.id}"]`).click();
  if (!tab) return;
  const pill = page.locator(`#sectionTabs [data-section-view="${tab.view}"]${tab.marketingTab ? `[data-section-marketing-tab="${tab.marketingTab}"]` : ""}`);
  if (await pill.count()) { await pill.click(); await expect(pill).toHaveAttribute("aria-current", "page"); }
}

/** Shows the screens hidden by default, as DASHBOARD_FULL_NAV=1 would. Call before page.goto. */
export async function enableFullNav(page) {
  await page.addInitScript(() => {
    const mark = () => document.documentElement?.setAttribute("data-full-nav", "");
    mark();
    new MutationObserver(mark).observe(document, { childList: true });
  });
}
```

- [ ] **Step 2: Run the suite to list failures**

Run: `cd apps/merchant-dashboard && npx playwright test --workers=1 2>&1 | tail -80`
Expected: failures in the files listed above.

- [ ] **Step 3: Fix each failing spec with these replacements**

- `page.locator('[data-nav-group="…"] > summary').click()` followed by a nav-link click, any `link.evaluate(el => el.closest("details.dashboard-nav-group")…)`, and local helpers that open a nav group → `await openView(page, "<view>")` (import from `./helpers/nav.mjs`).
- `page.locator('#dashboardNav [data-dashboard-view="products"]').click()` and similar direct link clicks → `await openView(page, "products")`. `workspace` clicks → `await openView(page, "workspace")`.
- `marketing-emails.spec.mjs:86` (the 8 tab labels) → assert the Clientes pills:
  `await expect(page.locator("#sectionTabs .section-tab")).toHaveText(["Correos", "Campañas", "Comeback", "Códigos", "Tus clientes", "Carritos", "Suscripciones", "Asistente"]);`
- Clicks on `#marketingTabs button` for a tab → `await openView(page, "marketing", "<tab>")`. Assertions on `#marketingTabs` `data-tab` stay valid (the element is hidden but kept).
- `dashboard-smoke.spec.mjs:168` (`#dashboardNav > [data-dashboard-view]`) → `await expect(page.locator("#dashboardNav [data-nav-section]:visible")).toHaveText(["Inicio", "Tienda", "Pedidos", "Cobrar", "Dinero", "Clientes", "Ajustes"]);`
- The spec that loops `[["payments", …], ["payouts", …], ["overview", "#financesSectionBody"]]` (~line 654) → change the last pair to `["payouts", "#financesSectionBody"]`.
- `merchant-workspace.spec.mjs:133` (`#merchantStoreTabs` not visible) — still true; keep.
- `cobros.spec.mjs`, `contracts.spec.mjs`, `proposals.spec.mjs`: `test.beforeEach(async ({ page }) => { await enableFullNav(page); });` at the top of each file.
- Tests that open the Marca settings tab: add `await enableFullNav(page);` before their `page.goto`.
- `auth-account.spec.mjs`: tests that expect the «¿Quién está ingresando?» dialog must mock `/dashboard/sessions` with two or more named profiles; tests with zero or one now assert the dialog does not open.

- [ ] **Step 4: Run the suite**

Run: `cd apps/merchant-dashboard && npx playwright test --workers=1`
Expected: all pass. If a failure is not caused by this plan (check with `git stash; npx playwright test <file>; git stash pop`), list it in the commit message instead of fixing it.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/tests
git commit -m "test(dashboard): e2e specs open views through the seven sections"
```

---

### Task 10: Live check

**Files:** none.

- [ ] **Step 1: Confirm the dev stack** — the dashboard on :4323 must be the owner's `pnpm dev:chatgpt` stack (never start plain `pnpm dev`). `node --watch` reloads `server.mjs`; reload the browser tab.

- [ ] **Step 2: Walk the seven sections** signed in as the seed account (`demo-aggregator@pagosya.bo`, password from `apps/api/prisma/seed.ts`): each sidebar link opens; title and description match `NAV_SECTIONS`; pills switch screens; Clientes › Correos/Campañas/Comeback/Códigos/Tus clientes and Ajustes › Equipo/Remitente open the right marketing tab; `#dashboard-contracts` lands on Inicio; Dinero shows the finance block above Desembolsos; Inicio is short.

- [ ] **Step 3: Settings round-trip** — note the store's policies on its public page; in Ajustes › Tu tienda change the store name and save; reload the public page: policies unchanged. Change the name back.

- [ ] **Step 4: Switch on** — ask the owner before restarting their dashboard process; restart only it with `DASHBOARD_FULL_NAV=1`, reload: Documentos link, Marca tab, policy fields, tagline, email editor, Apariencia, Registros pill and sidebar extras are back; «Pídele a YAPI» lines are gone. Restart without the switch.

- [ ] **Step 5: «Pídele a YAPI»** — click it under Políticas: Tienda › Diseño opens with «Escribe las políticas de mi tienda con estos datos: » in YAPI's composer, not sent.

- [ ] **Step 6: Report** to the owner what was checked, with any failure output verbatim.
