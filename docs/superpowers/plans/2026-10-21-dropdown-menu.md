# Dropdown Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stores get a John Smedley-style header menu: a panel under the header (tabs, two link columns, up to 3 picture tiles, a dark «Ver toda la tienda» bar) or desktop top-link dropdowns. Fashion stores always get one, other Esencial stores by the dice, and any merchant who asks gets one built or changed in chat.

**Architecture:** One config, `config.js` → `header.menu = { style, groups? }`, for every store kind. Links name **targets** (`all`, `new`, `category:<id>`, `collection:<slug>`, `page:<kind>`, `section:<id>`), never raw URLs. The API checks the config at save (`source-store-menu.ts`). The kit (new part `commerce-src/header/store-menu.js`) is the **only renderer**. It resolves targets against the live store, so a deleted category never leaves a dead link. With no `groups` it builds the default menu from the store's categories and pages. Hosts give it two empty mounts, `data-pagosya-store-menu="toggle"` and `="links"`, and mark what the menu replaces with `data-store-menu-replaces`. The Esencial `Shell.tsx` and the platform header (`renderSourceHeader`) are hosts. Esencial keeps the dice record in `variants.menu` (`none | panel | dropdowns`), like `cards` → `config.showcase`. The fill call can pick the style and write groups, and in chat it edits them.

**Tech Stack:** NestJS API (TypeScript, Jest `-w 2`), kit runtime parts (`packages/storefront-kit/commerce-src`, concatenated into `kit/commerce.js` by `tools/build-commerce.mjs`), jsdom kit specs in `apps/api`, Esencial template (React TSX + CSS).

**Spec:** `docs/superpowers/specs/2026-10-21-dropdown-menu-design.md`

### Deliberate departures from the spec (owner to confirm at review)

1. **Config place:** Esencial's menu goes in `config.js` `header.menu`, not in `store-data`. One place, one reader (the kit) for both store kinds. `config.js` is platform-only (YAPI's files never carry it, see the reserved-file check), so the agent can't damage it. `variants.menu` in store-data stays the dice record.
2. **Renderer:** the kit draws the menu at runtime. `renderSourceHeader` only adds the mounts. That gives one renderer, one stylesheet and one jsdom suite instead of three copies of the markup.
3. **Links are targets, not hrefs:** «every href must resolve» holds by construction. The save check drops unknown targets, and the kit drops targets the live store no longer has.
4. **No `set_store_menu` agent tool.** Chat menu edits on Esencial go through the master fill call, which gains `menuStyle` / `menuGroups`. The YAPI agent never edits `config.js`. Static (platform-header) stores get the default menu, panel style, when the merchant's words ask for it; YAPI does not regroup a static store's menu in this plan.

## Global Constraints

- Styles: `panel` | `dropdowns`. The dice part `menu`: `none | panel | dropdowns`.
- Limits (checked at save, never failing it): ≤ 4 groups, ≤ 12 links per group, ≤ 3 tiles per group, every label ≤ 28 characters. Bad entries are dropped. A menu left with no links falls back to the default (no `groups`).
- Tiles only use a real store photo: a product photo from `config.data.items[].imageUrls`, or an absolute `http(s)` category banner.
- Fashion stores (`character.kind === 'fashion'`) always get a menu (`panel` unless the fill picks `dropdowns`). Other Esencial stores with fewer than 2 categories that have products roll `none`.
- On phones (< 861 px) the menu is always the panel style.
- Hover dropdowns open after **120 ms** and close **200 ms** after the pointer leaves. Click and Enter open them too. Touch never relies on hover.
- Keyboard: tabs are `role="tab"` buttons with `aria-selected`, and ←/→/Home/End move between them. Esc closes and gives focus back to the opener. Tab stays inside the open panel. The scroll lock is always restored to the value it found.
- `prefers-reduced-motion: reduce` → no slide, instant open.
- Default menu: «Tienda» = Novedades + every category with products + «Todos los productos». Its tiles are up to 3 categories with a photo, titled «Por categoría», with the footer «Ver toda la tienda». «Descubre» = the host header's own links (Nuestra historia, Nosotros…) + the info pages that have content (envíos, cambios, preguntas frecuentes, contacto).
- Copy: Spanish, no emojis. Never run `prisma migrate/diff/reset`; no migration is needed. Never run the full api jest with default workers: always `npx jest -w 2 <files>`. Never `pkill server.mjs`.

## Review Focus

1. **A category deleted after save**: the live store no longer has it, so its link and tile disappear. They never 404 (kit test in Task 2).
2. **A store that saved a menu, then lost every category**: the «Tienda» group has no links left, so it is dropped. If nothing is left, the menu falls back to the default, which still has «Todos los productos» (kit test in Task 2).
3. **A page re-render during load** (`pagosya:ready` fires after the first render): the menu is not duplicated and an open panel does not stay locked open (kit test in Task 2).
4. **Restaurant words**: «agrega postres al menú» on a store with no menu must not switch a nav menu on. Only clear phrases count (desplegable, dropdown, menú con categorías, menú de navegación). «al menú» counts only when the store already has a menu (API test in Task 1).
5. **The Esc key with both the photo viewer and the menu present**: the menu handler acts only while its panel is open, so the viewer's Esc is untouched (kit test in Task 2).

---

### Task 1: Menu config, checks and chat words (API, pure)

**Files:**
- Create: `apps/api/src/storefront-source/source-store-menu.ts`
- Test: `apps/api/src/storefront-source/source-store-menu.spec.ts`

**Interfaces:**
- Produces:
  - `type StoreMenuStyle = 'panel' | 'dropdowns'`, `const STORE_MENU_STYLES`
  - `type StoreMenuLink = { label?: string; to: string }`, `type StoreMenuTile = { title: string; image: string; to: string }`
  - `type StoreMenuGroup = { label: string; links: StoreMenuLink[]; tilesTitle?: string; tiles?: StoreMenuTile[]; footer?: { label: string; to: string } }`
  - `type StoreMenu = { style: StoreMenuStyle; groups?: StoreMenuGroup[] }`
  - `const STORE_MENU_LIMITS = { groups: 4, links: 12, tiles: 3, label: 28 }`
  - `type StoreMenuContext = { targets: Map<string, string>; photos: Set<string> }`
  - `storeMenuContext(data: { categories?: Array<{ id: string; name: string; bannerUrl?: string | null }>; items?: Array<{ categoryId?: string | null; imageUrls?: string[] }>; collections?: Array<{ slug: string; name: string }> }, files: ReadonlyArray<{ path: string; content: string }>): StoreMenuContext`
  - `storeMenuTargetList(ctx: StoreMenuContext): Array<{ target: string; label: string }>`
  - `checkStoreMenu(raw: unknown, ctx: StoreMenuContext): StoreMenu | null` (null = no valid style)
  - `readStoreMenu(files): StoreMenu | undefined` (reads `config.js` `header.menu` as saved)
  - `withStoreMenuConfig<T>(files: T[], previous: ReadonlyArray<{path;content}>, menu: StoreMenu | null): T[]` (null removes it)
  - `instructionAsksStoreMenu(text: string): boolean | undefined`: true = on, false = remove, undefined = says nothing
  - `instructionTouchesStoreMenu(text: string): boolean`: looser, used only when the store already has a menu

- [ ] **Step 1: Write the failing tests**

```ts
import { checkStoreMenu, instructionAsksStoreMenu, instructionTouchesStoreMenu, readStoreMenu, storeMenuContext, storeMenuTargetList, withStoreMenuConfig, STORE_MENU_LIMITS } from './source-store-menu';

const data = {
  categories: [{ id: 'c1', name: 'Vestidos', bannerUrl: 'https://api.test/v1/uploads/b1.jpg' }, { id: 'c2', name: 'Sastrería', bannerUrl: '/v1/uploads/b2.jpg' }, { id: 'c3', name: 'Vacía' }],
  items: [{ categoryId: 'c1', imageUrls: ['https://api.test/v1/uploads/p1.jpg'] }, { categoryId: 'c2', imageUrls: ['https://api.test/v1/uploads/p2.jpg'] }],
};
const files = [{ path: 'index.html', content: '<main><section id="historia"></section><section id="sizes"></section></main>' }];
const ctx = storeMenuContext(data, files);
const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};\n` });

describe('store menu targets', () => {
  it('lists only categories with products, the info pages and the home sections', () => {
    const list = storeMenuTargetList(ctx).map(entry => entry.target);
    expect(list).toEqual(expect.arrayContaining(['all', 'new', 'category:c1', 'category:c2', 'page:about', 'page:contact', 'page:shipping', 'page:refund', 'page:faq', 'section:historia', 'section:sizes']));
    expect(list).not.toContain('category:c3');
  });
  it('counts product photos and absolute banners as store photos, never a relative banner', () => {
    expect(ctx.photos.has('https://api.test/v1/uploads/p1.jpg')).toBe(true);
    expect(ctx.photos.has('https://api.test/v1/uploads/b1.jpg')).toBe(true);
    expect(ctx.photos.has('/v1/uploads/b2.jpg')).toBe(false);
  });
});

describe('checkStoreMenu', () => {
  it('needs a known style', () => {
    expect(checkStoreMenu({ style: 'mega' }, ctx)).toBeNull();
    expect(checkStoreMenu(null, ctx)).toBeNull();
    expect(checkStoreMenu({ style: 'panel' }, ctx)).toEqual({ style: 'panel' });
  });
  it('drops unknown targets, tiles without a store photo and empty groups, and clips labels', () => {
    const menu = checkStoreMenu({ style: 'dropdowns', groups: [
      { label: 'Mujer', links: [{ to: 'category:c1' }, { label: 'Inventada', to: 'category:zz' }, { label: 'x'.repeat(40), to: 'all' }],
        tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }, { title: 'Robada', image: 'https://other.test/x.jpg', to: 'category:c1' }],
        footer: { label: 'Ver toda la tienda', to: 'all' } },
      { label: 'Nada', links: [{ to: 'category:zz' }] },
      { label: '', links: [{ to: 'all' }] },
    ] }, ctx)!;
    expect(menu.groups).toHaveLength(1);
    expect(menu.groups![0].links).toEqual([{ label: 'Vestidos', to: 'category:c1' }, { label: 'x'.repeat(STORE_MENU_LIMITS.label), to: 'all' }]);
    expect(menu.groups![0].tiles).toEqual([{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }]);
    expect(menu.groups![0].footer).toEqual({ label: 'Ver toda la tienda', to: 'all' });
  });
  it('a section link needs its own label', () => {
    const menu = checkStoreMenu({ style: 'panel', groups: [{ label: 'Descubre', links: [{ to: 'section:historia' }, { label: 'Guía de tallas', to: 'section:sizes' }] }] }, ctx)!;
    expect(menu.groups![0].links).toEqual([{ label: 'Guía de tallas', to: 'section:sizes' }]);
  });
  it('keeps at most 4 groups, 12 links and 3 tiles', () => {
    const links = Array.from({ length: 20 }, () => ({ to: 'all' }));
    const tiles = Array.from({ length: 5 }, () => ({ title: 'T', image: 'https://api.test/v1/uploads/p1.jpg', to: 'all' }));
    const menu = checkStoreMenu({ style: 'panel', groups: Array.from({ length: 6 }, (_, i) => ({ label: `G${i}`, links, tiles })) }, ctx)!;
    expect(menu.groups).toHaveLength(4);
    expect(menu.groups![0].links).toHaveLength(12);
    expect(menu.groups![0].tiles).toHaveLength(3);
  });
  it('a menu left with no links falls back to the default (no groups)', () => {
    expect(checkStoreMenu({ style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:zz' }] }] }, ctx)).toEqual({ style: 'panel' });
  });
});

describe('config.js header.menu', () => {
  it('writes, reads and removes the menu, keeping the rest of the header', () => {
    const saved = [config({ header: { account: true }, dna: {} })];
    const on = withStoreMenuConfig(saved, [], { style: 'panel' });
    expect(readStoreMenu(on)).toEqual({ style: 'panel' });
    expect(JSON.parse(on[0].content.match(/= (.*);/)![1]).header.account).toBe(true);
    expect(readStoreMenu(withStoreMenuConfig(on, [], null))).toBeUndefined();
  });
  it('a save without config.js takes the saved one first', () => {
    const out = withStoreMenuConfig([{ path: 'index.html', content: '' }], [config({ dna: {} })], { style: 'dropdowns' });
    expect(readStoreMenu(out)).toEqual({ style: 'dropdowns' });
  });
});

describe('chat words', () => {
  it.each([
    ['quiero un menú desplegable', true], ['pon menús desplegables arriba', true], ['un menú con categorías como John Smedley', true],
    ['agrega un mega menú', true], ['quita el menú desplegable', false], ['sin menú desplegable por favor', false],
    ['agrega postres al menú', undefined], ['cambia el menú del día', undefined], ['cambia el color del botón', undefined],
  ])('%s → %s', (text, expected) => expect(instructionAsksStoreMenu(text)).toBe(expected));
  it('«al menú» only touches a menu that exists', () => {
    expect(instructionTouchesStoreMenu('agrega Accesorios al menú')).toBe(true);
    expect(instructionTouchesStoreMenu('cambia el titular')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-store-menu.spec.ts`
Expected: FAIL with "Cannot find module './source-store-menu'"

- [ ] **Step 3: Implement**

```ts
/** Dropdown menu spec 2026-10-21: the store menu (config.js header.menu), checked at save and drawn by the kit
 *  (commerce-src/header/store-menu.js). Links name targets, never URLs, so a menu can only point at what the store has;
 *  the kit resolves them against the live store. Without groups the kit builds the menu from the categories and pages. */
import { patchConfigFile, readConfigFile } from './store-look';

export const STORE_MENU_STYLES = ['panel', 'dropdowns'] as const;
export type StoreMenuStyle = typeof STORE_MENU_STYLES[number];
export type StoreMenuLink = { label?: string; to: string };
export type StoreMenuTile = { title: string; image: string; to: string };
export type StoreMenuGroup = { label: string; links: StoreMenuLink[]; tilesTitle?: string; tiles?: StoreMenuTile[]; footer?: { label: string; to: string } };
export type StoreMenu = { style: StoreMenuStyle; groups?: StoreMenuGroup[] };
export type StoreMenuContext = { targets: Map<string, string>; photos: Set<string> };
export const STORE_MENU_LIMITS = { groups: 4, links: 12, tiles: 3, label: 28 } as const;
/** The info pages a menu may link; the kit shows each only when the store has something on it. */
const PAGE_NAMES: Record<string, string> = { about: 'Nuestra historia', contact: 'Contacto', shipping: 'Envíos y entregas', refund: 'Cambios y devoluciones', faq: 'Preguntas frecuentes' };

const ABSOLUTE = /^https?:\/\//i;
export function storeMenuContext(data: { categories?: Array<{ id: string; name: string; bannerUrl?: string | null }>; items?: Array<{ categoryId?: string | null; imageUrls?: string[] }>; collections?: Array<{ slug: string; name: string }> }, files: ReadonlyArray<{ path: string; content: string }>): StoreMenuContext {
  const items = data.items ?? [];
  const targets = new Map<string, string>([['all', 'Todos los productos'], ['new', 'Novedades']]);
  for (const category of data.categories ?? []) if (items.some(item => item.categoryId === category.id)) targets.set(`category:${category.id}`, category.name);
  for (const collection of data.collections ?? []) targets.set(`collection:${collection.slug}`, collection.name);
  for (const [page, name] of Object.entries(PAGE_NAMES)) targets.set(`page:${page}`, name);
  // A section anchor is a home id; it has no name of its own, so a link to it must carry a label.
  const index = files.find(file => file.path === 'index.html')?.content ?? '';
  for (const match of index.matchAll(/\sid\s*=\s*["']([\w-]{1,60})["']/g)) targets.set(`section:${match[1]}`, '');
  const photos = new Set<string>([...items.flatMap(item => item.imageUrls ?? []), ...(data.categories ?? []).map(category => category.bannerUrl ?? '')].filter(url => ABSOLUTE.test(url)));
  return { targets, photos };
}

export const storeMenuTargetList = (ctx: StoreMenuContext) => [...ctx.targets].map(([target, label]) => ({ target, label }));

const label = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, STORE_MENU_LIMITS.label).trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function checkStoreMenu(raw: unknown, ctx: StoreMenuContext): StoreMenu | null {
  const input = record(raw);
  const style = (STORE_MENU_STYLES as readonly string[]).includes(String(input.style)) ? input.style as StoreMenuStyle : null;
  if (!style) return null;
  const target = (value: unknown) => typeof value === 'string' && ctx.targets.has(value) ? value : null;
  const named = (to: string, given: unknown) => label(given) || ctx.targets.get(to) || '';
  const groups = list(input.groups).flatMap(entry => {
    const group = record(entry);
    const name = label(group.label);
    const links = list(group.links).flatMap(link => {
      const to = target(record(link).to);
      const text = to ? named(to, record(link).label) : '';
      return to && text ? [{ label: text, to }] : [];
    }).slice(0, STORE_MENU_LIMITS.links);
    if (!name || !links.length) return [];
    const tiles = list(group.tiles).flatMap(tile => {
      const { image, title } = record(tile);
      const to = target(record(tile).to);
      return to && typeof image === 'string' && ctx.photos.has(image) && named(to, title) ? [{ title: named(to, title), image, to }] : [];
    }).slice(0, STORE_MENU_LIMITS.tiles);
    const footerTo = target(record(group.footer).to);
    const footerLabel = footerTo ? named(footerTo, record(group.footer).label) : '';
    return [{ label: name, links, ...(tiles.length ? { tiles, ...(label(group.tilesTitle) ? { tilesTitle: label(group.tilesTitle) } : {}) } : {}), ...(footerTo && footerLabel ? { footer: { label: footerLabel, to: footerTo } } : {}) }];
  }).slice(0, STORE_MENU_LIMITS.groups);
  return groups.length ? { style, groups } : { style };
}

/** config.js header.menu as saved (already checked); undefined without one. */
export function readStoreMenu(files: ReadonlyArray<{ path: string; content: string }>): StoreMenu | undefined {
  const menu = readConfigFile(files).header?.menu;
  return menu && (STORE_MENU_STYLES as readonly string[]).includes(menu.style) ? menu as StoreMenu : undefined;
}

/** config.js with header.menu set (or removed with null); a save without config.js takes the saved one first. */
export function withStoreMenuConfig<T extends { path: string; content: string }>(files: T[], previous: ReadonlyArray<{ path: string; content: string }>, menu: StoreMenu | null): T[] {
  const saved = previous.find(file => file.path === 'config.js');
  const withConfig = files.some(file => file.path === 'config.js') || !saved ? files : [...files, { ...saved } as unknown as T];
  return patchConfigFile(withConfig, config => {
    const { menu: _old, ...header } = config.header ?? {};
    return { ...config, header: menu ? { ...header, menu } : header };
  });
}

// «Menú» alone is a restaurant's word too («agrega postres al menú»): only phrases that name a navigation menu switch one on.
const MENU_ASK = /(?<!\p{L})(men[uú]s? desplegables?|desplegables? (?:arriba|en (?:la|el) (?:barra|encabezado|header))|dropdowns?|mega ?men[uú]s?|men[uú]s? (?:con|de) (?:las |sus )?categor[ií]as|men[uú]s? de (?:navegaci[oó]n|la tienda))(?!\p{L})/iu;
const MENU_REMOVE = /(?<!\p{L})(quita|qu[ií]ta(?:le|lo)|elimina|saca|oculta|borra|remueve|sin)(?!\p{L})/iu;
const MENU_TOUCH = /(?<!\p{L})(?:al|del|en el|el) men[uú](?!\p{L})/iu;

export function instructionAsksStoreMenu(text: string): boolean | undefined {
  const asked = MENU_ASK.exec(text);
  if (!asked) return undefined;
  return !MENU_REMOVE.test(text.slice(Math.max(0, asked.index - 40), asked.index));
}
/** Looser: «agrega Accesorios al menú». Counts only for a store whose menu already exists. */
export const instructionTouchesStoreMenu = (text: string) => MENU_ASK.test(text) || MENU_TOUCH.test(text);
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-store-menu.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-store-menu.ts apps/api/src/storefront-source/source-store-menu.spec.ts
git commit -m "feat(api): store menu config, save checks and chat words (dropdown menu part 3)"
```

---

### Task 2: The kit draws and runs the menu

**Files:**
- Create: `packages/storefront-kit/commerce-src/header/store-menu.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (PARTS: `'header/store-menu.js'` right after `'header/platform-header.js'`)
- Modify (generated): `packages/storefront-kit/kit/commerce.js` (via `node packages/storefront-kit/tools/build-commerce.mjs`)
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Consumes (IIFE scope, existing): `config`, `store`, `products()`, `pageHref(page, query)` (product/setup.js), `filterFold` (catalog/filters.js), `infoBody(kind)` and `infoCollections()` (pages/standard.js), and the `pagosya:ready` event (catalog/render.js).
- Consumes (host markup): `[data-pagosya-store-menu="toggle"]`, optional `[data-pagosya-store-menu="links"]`, `[data-store-menu-replaces]` (hidden while the menu is on), and optional `[data-store-menu-extra]` (its links are copied into the panel; the platform header's Buscar / Mi cuenta).
- Produces (DOM contract later tasks and the browser check rely on): the host header gets `data-store-menu="panel|dropdowns"` and, when a links mount is filled, `data-store-menu-links`. Inside: `button.pym-toggle[data-store-menu-toggle]`, `button.pym-top[data-store-menu-top="i"]`, `div.pym-panel[data-store-menu-panel]` with `[role=tablist] button[role=tab]`, `div.pym-group[role=tabpanel]`, `ul.pym-links a`, `div.pym-tiles`, `a.pym-footer` and `div.pym-extras`. Public: `window.pagosyaStoreMenu = { render, close }`.

- [ ] **Step 1: Write the failing jsdom tests**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Dropdown menu (spec 2026-10-21): the kit draws the store menu from config.header.menu and runs its tabs, hover and keys. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const item = (id: string, categoryId: string) => ({ id, name: id, amount: 1000, currency: 'BOB', stock: null, categoryId, imageUrls: [`https://api.test/${id}.jpg`], variants: [], extras: [], highlights: [] });
const DATA = {
  storeName: 'Noa', contactPhone: '+591 70000000',
  categories: [{ id: 'C1', name: 'Vestidos' }, { id: 'c2', name: 'Sastrería' }, { id: 'c3', name: 'Seda' }, { id: 'c4', name: 'Punto' }, { id: 'empty', name: 'Vacía' }],
  items: [item('a', 'C1'), item('b', 'c2'), item('c', 'c3'), item('d', 'c4')],
};
const HOST = '<header class="host"><div data-pagosya-store-menu="toggle"></div><button data-store-menu-replaces>Viejo</button><a href="index.html">Noa</a><div data-pagosya-store-menu="links"></div><nav data-store-menu-replaces><a href="index.html">Inicio</a><a href="index.html#historia">Nuestra historia</a></nav></header>';

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open({ menu, data = DATA, host = HOST }: { menu?: unknown; data?: any; host?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${host}<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /min-width/.test(query), addEventListener() {}, removeEventListener() {} });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(menu ? { header: { menu } } : {}) };
  const quote = { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const key = (target: any, name: string, extra: object = {}) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }));
  const pointer = (target: any, type: string, pointerType = 'mouse') => { const event = new w.Event(type, { bubbles: false }); Object.defineProperty(event, 'pointerType', { value: pointerType }); target.dispatchEvent(event); };
  return { w, q, all, key, pointer };
}

describe('store menu', () => {
  it('stays off without config.header.menu', async () => {
    const { q } = await open();
    expect(q('[data-pagosya-store-menu="toggle"]').innerHTML).toBe('');
    expect(q('header').hasAttribute('data-store-menu')).toBe(false);
  });

  it('builds the default menu from the categories with products and the host links', async () => {
    const { q, all } = await open({ menu: { style: 'panel' } });
    expect(q('header').getAttribute('data-store-menu')).toBe('panel');
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Tienda', 'Descubre']);
    const shop = all('.pym-group')[0];
    expect([...shop.querySelectorAll('.pym-links a')].map((a: any) => a.textContent)).toEqual(['Novedades', 'Vestidos', 'Sastrería', 'Seda', 'Punto', 'Todos los productos']);
    expect(shop.querySelector('.pym-links a[href*="f_categoria=c1"]')).not.toBeNull();
    expect(shop.querySelectorAll('.pym-tiles img')).toHaveLength(3);
    expect(shop.querySelector('.pym-tiles-title').textContent).toBe('Por categoría');
    expect(shop.querySelector('.pym-footer').textContent).toBe('Ver toda la tienda');
    const discover = [...all('.pym-group')[1].querySelectorAll('.pym-links a')].map((a: any) => a.textContent);
    expect(discover).toContain('Nuestra historia');
    expect(discover).not.toContain('Inicio');
    expect(discover).toContain('Contacto');
  });

  it('draws the merchant groups, dropping targets the live store no longer has', async () => {
    const { all } = await open({ menu: { style: 'panel', groups: [
      { label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:C1' }, { label: 'Borrada', to: 'category:gone' }, { label: 'Vacía', to: 'category:empty' }],
        tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: 'https://api.test/a.jpg', to: 'category:C1' }, { title: 'Borrada', image: 'https://api.test/b.jpg', to: 'category:gone' }], footer: { label: 'Ver toda la tienda', to: 'all' } },
      { label: 'Fantasma', links: [{ label: 'Borrada', to: 'category:gone' }] },
    ] } });
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Mujer']);
    expect(all('.pym-links a').map(a => a.textContent)).toEqual(['Vestidos']);
    expect(all('.pym-tiles a').map(a => a.textContent)).toEqual(['Vestidos']);
  });

  it('falls back to the default when no saved link is left', async () => {
    const { all } = await open({ menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ label: 'Borrada', to: 'category:gone' }] }] } });
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Tienda', 'Descubre']);
  });

  it('opens from ☰, moves between tabs with the arrows, closes on Esc and gives focus and scroll back', async () => {
    const { w, q, all, key } = await open({ menu: { style: 'panel' } });
    w.document.documentElement.style.overflow = 'clip';
    const toggle = q('[data-store-menu-toggle]');
    toggle.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    const tabs = all('[role=tab]');
    expect(w.document.activeElement).toBe(tabs[0]);
    key(tabs[0], 'ArrowRight');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(w.document.activeElement).toBe(tabs[1]);
    expect(all('.pym-group')[0].hidden).toBe(true);
    expect(all('.pym-group')[1].hidden).toBe(false);
    key(tabs[1], 'ArrowRight');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    key(w.document, 'Escape');
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    expect(w.document.activeElement).toBe(toggle);
    expect(w.document.documentElement.style.overflow).toBe('clip');
  });

  it('keeps Tab inside the open panel', async () => {
    const { w, q, key } = await open({ menu: { style: 'panel' } });
    q('[data-store-menu-toggle]').click();
    const items = [...q('[data-store-menu-panel]').querySelectorAll('a[href],button')].filter((el: any) => !el.closest('[hidden]'));
    (items.at(-1) as any).focus();
    key(items.at(-1), 'Tab');
    expect(w.document.activeElement).toBe(items[0]);
    key(items[0], 'Tab', { shiftKey: true });
    expect(w.document.activeElement).toBe(items.at(-1));
  });

  it('dropdowns: top links open after 120 ms of hover, stay while the pointer moves into the panel, close 200 ms after it leaves', async () => {
    const { q, all, pointer } = await open({ menu: { style: 'dropdowns' } });
    expect(q('header').hasAttribute('data-store-menu-links')).toBe(true);
    const tops = all('[data-store-menu-top]');
    expect(tops.map(top => top.textContent)).toEqual(['Tienda', 'Descubre']);
    const panel = q('[data-store-menu-panel]');
    pointer(tops[1], 'pointerenter');
    await sleep(60);
    expect(panel.hidden).toBe(true);
    await sleep(100);
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('data-mode')).toBe('dropdown');
    expect(all('.pym-group')[1].hidden).toBe(false);
    pointer(tops[1], 'pointerleave');
    await sleep(80);
    pointer(panel, 'pointerenter');
    await sleep(200);
    expect(panel.hidden).toBe(false);
    pointer(panel, 'pointerleave');
    await sleep(240);
    expect(panel.hidden).toBe(true);
  });

  it('dropdowns: touch never opens on hover; a click opens and a second click closes', async () => {
    const { q, all, pointer } = await open({ menu: { style: 'dropdowns' } });
    const top = all('[data-store-menu-top]')[0];
    pointer(top, 'pointerenter', 'touch');
    await sleep(160);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    expect(top.getAttribute('aria-expanded')).toBe('true');
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('a host without a links mount gets the panel even for dropdowns', async () => {
    const { q, all } = await open({ menu: { style: 'dropdowns' }, host: '<header><div data-pagosya-store-menu="toggle"></div></header>' });
    expect(q('header').hasAttribute('data-store-menu-links')).toBe(false);
    expect(all('[data-store-menu-toggle]')).toHaveLength(1);
  });

  it('copies the host extras (Buscar, Mi cuenta) into the panel', async () => {
    const { all } = await open({ menu: { style: 'panel' }, host: '<header><div data-pagosya-store-menu="toggle"></div><div hidden><div data-store-menu-extra><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a></div></div></header>' });
    expect(all('.pym-extras a').map(a => a.textContent)).toEqual(['Buscar', 'Mi cuenta']);
  });

  it('a second render (pagosya:ready) neither duplicates the menu nor leaves it open or locked', async () => {
    const { w, q, all } = await open({ menu: { style: 'panel' } });
    q('[data-store-menu-toggle]').click();
    w.pagosyaStoreMenu.render();
    expect(all('[data-store-menu-panel]')).toHaveLength(1);
    expect(all('[data-store-menu-toggle]')).toHaveLength(1);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('');
  });

  it('Escape with the menu closed does nothing (the photo viewer owns its own Escape)', async () => {
    const { w, q } = await open({ menu: { style: 'panel' } });
    const event = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    w.document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('ships a reduced-motion rule and closes when a link is chosen', async () => {
    const { w, q } = await open({ menu: { style: 'panel' } });
    expect(q('style[data-pagosya-store-menu-style]').textContent).toMatch(/prefers-reduced-motion:\s*reduce/);
    q('[data-store-menu-toggle]').click();
    q('.pym-links a').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-store-menu.spec.ts`
Expected: FAIL. The first test passes; the others fail because `[data-store-menu-toggle]` is never drawn.

- [ ] **Step 3: Implement `commerce-src/header/store-menu.js`**

First confirm the IIFE-scope names it uses: `grep -n "const escape\|function escape\|function infoBody\|const infoCollections\|const pageHref\|const filterFold" -r packages/storefront-kit/commerce-src`. Use the names that exist. Never add a second escaper.

```js
  // ---- Store menu (spec 2026-10-21 dropdown menu) ----
  // config.header.menu = { style: 'panel' | 'dropdowns', groups? } turns the menu on. The host header holds the mounts
  // [data-pagosya-store-menu="toggle"] (☰, opens the panel) and optionally [data-pagosya-store-menu="links"] (desktop top links
  // for dropdowns); what the menu replaces carries data-store-menu-replaces. Links name targets, resolved here against the live
  // store, so a deleted category never leaves a dead link; without groups the menu is built from the categories and pages.
  // One panel per header: it takes focus when opened from ☰, Esc or a choice closes it, Tab stays inside, and the scroll lock
  // goes back to what the page had.
  const STORE_MENU_PAGES = { about: ['nosotros.html', 'Nuestra historia'], contact: ['contacto.html', 'Contacto'], shipping: ['envios.html', 'Envíos y entregas'], refund: ['reembolsos.html', 'Cambios y devoluciones'], faq: ['faq.html', 'Preguntas frecuentes'] };
  const STORE_MENU_OPEN_MS = 120, STORE_MENU_CLOSE_MS = 200;
  const STORE_MENU_CSS = `
    [data-store-menu] [data-store-menu-replaces]{display:none!important}
    [data-pagosya-store-menu="links"]{display:none}
    .pym-toggle{display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}
    .pym-bars,.pym-bars::before,.pym-bars::after{display:block;width:20px;height:1.5px;background:currentColor;content:""}
    .pym-bars{position:relative}.pym-bars::before{position:absolute;top:-6px}.pym-bars::after{position:absolute;top:6px}
    .pym-top{min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-top[aria-expanded="true"]{text-decoration:underline;text-underline-offset:6px}
    .pym-panel{position:absolute;left:0;right:0;top:100%;z-index:40;max-height:calc(100dvh - 72px);overflow:auto;padding:24px max(20px,calc((100% - 1280px)/2));background:var(--store-background,#fff);color:var(--store-foreground,#111);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);box-shadow:0 24px 48px -24px rgb(0 0 0 / .25);text-align:left;animation:pym-in .18s ease-out}
    .pym-panel[hidden],.pym-group[hidden]{display:none!important}
    @keyframes pym-in{from{opacity:0;transform:translateY(-6px)}}
    @media (prefers-reduced-motion: reduce){.pym-panel{animation:none}}
    .pym-tabs{display:flex;width:max-content;max-width:100%;margin:0 0 20px;border:1px solid currentColor}
    .pym-panel[data-mode="dropdown"] .pym-tabs,.pym-tabs[data-single]{display:none}
    .pym-tab{min-height:44px;padding:10px 20px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-tab[aria-selected="true"]{background:var(--store-foreground,#111);color:var(--store-background,#fff)}
    .pym-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 32px;margin:0;padding:0;list-style:none}
    .pym-links a{display:flex;align-items:center;min-height:44px;color:inherit;font-size:15px;text-decoration:none}
    .pym-links a:hover{text-decoration:underline;text-underline-offset:5px}
    .pym-tiles{margin-top:24px}
    .pym-tiles-title{margin:0 0 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    .pym-tiles ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
    .pym-tiles a{display:grid;gap:8px;color:inherit;font-size:14px;text-decoration:none}
    .pym-tiles img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
    .pym-footer{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:24px;background:var(--store-foreground,#111);color:var(--store-background,#fff);font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
    .pym-extras{display:flex;flex-wrap:wrap;gap:4px 24px;margin-top:20px;padding-top:16px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pym-extras a{display:inline-flex;align-items:center;min-height:44px;color:inherit;font-size:14px}
    .pym-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media (min-width:861px){
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="toggle"]{display:none}
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="links"]{display:flex;align-items:center;gap:28px}
      .pym-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px 40px;align-items:start}
      .pym-tiles{margin-top:0}
      .pym-footer{grid-column:1/-1;margin-top:8px}
    }`;
  function ensureStoreMenuStyle() {
    if (document.querySelector('style[data-pagosya-store-menu-style]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-store-menu-style', '');
    style.textContent = STORE_MENU_CSS;
    document.head.appendChild(style);
  }
  function storeMenuConfig() {
    const menu = config.header && config.header.menu;
    return menu && (menu.style === 'panel' || menu.style === 'dropdowns') ? menu : null;
  }
  const storeMenuCategories = () => (Array.isArray(store.categories) ? store.categories : []).filter(category => category && typeof category.id === 'string' && products().some(item => item.categoryId === category.id));
  /** A target as { href, label }, or null when the live store has nothing there. */
  function storeMenuTarget(to) {
    const value = String(to || '');
    if (value === 'all') return { href: pageHref('productos.html'), label: 'Todos los productos' };
    if (value === 'new') return products().length ? { href: pageHref('productos.html', '?orden=novedades'), label: 'Novedades' } : null;
    if (value.startsWith('category:')) {
      const category = storeMenuCategories().find(entry => entry.id === value.slice(9));
      return category ? { href: pageHref('productos.html', '?f_categoria=' + encodeURIComponent(filterFold(category.id))), label: category.name } : null;
    }
    if (value.startsWith('collection:')) {
      const collection = infoCollections().find(entry => entry.slug === value.slice(11));
      return collection ? { href: pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug)), label: collection.name } : null;
    }
    if (value.startsWith('page:')) {
      const kind = value.slice(5), page = STORE_MENU_PAGES[kind];
      return page && infoBody(kind) ? { href: pageHref(page[0]), label: page[1] } : null;
    }
    if (value.startsWith('section:') && /^[\w-]{1,60}$/.test(value.slice(8))) return { href: pageHref('index.html', '#' + value.slice(8)), label: '' };
    return null;
  }
  const storeMenuPhoto = url => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '');
  /** The default menu (spec): «Tienda» from the categories, «Descubre» from the host's own links and the info pages. */
  function defaultStoreMenuGroups(host) {
    const categories = storeMenuCategories();
    const tiles = categories.map(category => ({ title: category.name, to: 'category:' + category.id, image: storeMenuPhoto(category.bannerUrl) || storeMenuPhoto((products().find(item => item.categoryId === category.id)?.imageUrls || [])[0]) }))
      .filter(tile => tile.image).slice(0, 3);
    const shop = { label: 'Tienda', links: [{ to: 'new' }, ...categories.map(category => ({ to: 'category:' + category.id })), { to: 'all' }], tilesTitle: 'Por categoría', tiles, footer: { label: 'Ver toda la tienda', to: 'all' } };
    const own = [...host.querySelectorAll('[data-store-menu-replaces] a[href]')]
      .map(anchor => ({ href: anchor.getAttribute('href'), label: anchor.textContent.trim() }))
      .filter(link => link.label && !/^(?:\.\.\/)*(?:index|productos)\.html$/.test(link.href));
    const discover = { label: 'Descubre', links: [...own, ...['about', 'shipping', 'refund', 'faq', 'contact'].map(kind => ({ to: 'page:' + kind }))] };
    return [shop, discover];
  }
  /** Groups with every link, tile and footer resolved; a repeated label is shown once, and a group with no link left is dropped. */
  function resolveStoreMenuGroups(groups) {
    return (Array.isArray(groups) ? groups : []).slice(0, 4).map(group => {
      const seen = new Set();
      const links = (Array.isArray(group.links) ? group.links : []).map(link => {
        if (link.href) return { href: link.href, label: String(link.label).slice(0, 28) };
        const target = storeMenuTarget(link.to);
        return target && (link.label || target.label) ? { href: target.href, label: String(link.label || target.label).slice(0, 28) } : null;
      }).filter(link => link && !seen.has(link.label.toLowerCase()) && seen.add(link.label.toLowerCase())).slice(0, 12);
      const tiles = (Array.isArray(group.tiles) ? group.tiles : []).map(tile => { const target = storeMenuTarget(tile.to); return target && storeMenuPhoto(tile.image) ? { href: target.href, title: String(tile.title || target.label).slice(0, 28), image: tile.image } : null; }).filter(Boolean).slice(0, 3);
      const footerTarget = group.footer ? storeMenuTarget(group.footer.to) : null;
      return { label: String(group.label || '').slice(0, 28), links, tilesTitle: tiles.length ? String(group.tilesTitle || '') : '', tiles, footer: footerTarget ? { href: footerTarget.href, label: String(group.footer.label || footerTarget.label).slice(0, 28) } : null };
    }).filter(group => group.label && group.links.length);
  }
  let storeMenuCount = 0;
  const storeMenuOpenState = { host: null, close: null };
  function renderStoreMenu(host, menu) {
    const toggleMount = host.querySelector('[data-pagosya-store-menu="toggle"]');
    if (!toggleMount) return;
    const linksMount = menu.style === 'dropdowns' ? host.querySelector('[data-pagosya-store-menu="links"]') : null;
    let groups = resolveStoreMenuGroups(menu.groups);
    if (!groups.length) groups = resolveStoreMenuGroups(defaultStoreMenuGroups(host));
    if (!groups.length) return;
    const id = 'pym-' + (++storeMenuCount);
    host.setAttribute('data-store-menu', menu.style);
    host.toggleAttribute('data-store-menu-links', Boolean(linksMount));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    toggleMount.innerHTML = `<button type="button" class="pym-toggle" data-store-menu-toggle aria-expanded="false" aria-controls="${id}"><span class="pym-bars" aria-hidden="true"></span><span class="pym-sr">Menú</span></button>`;
    if (linksMount) linksMount.innerHTML = groups.map((group, index) => `<button type="button" class="pym-top" data-store-menu-top="${index}" aria-expanded="false" aria-controls="${id}">${escape(group.label)}</button>`).join('');
    const extras = [...host.querySelectorAll('[data-store-menu-extra] a[href]')].map(anchor => { const copy = anchor.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('class'); return copy.outerHTML; }).join('');
    const panel = document.createElement('div');
    panel.className = 'pym-panel';
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute('data-store-menu-panel', '');
    panel.setAttribute('aria-label', 'Menú');
    panel.innerHTML = `<div class="pym-tabs" role="tablist" aria-label="Menú"${groups.length === 1 ? ' data-single' : ''}>${groups.map((group, index) => `<button type="button" class="pym-tab" role="tab" id="${id}-tab-${index}" aria-controls="${id}-group-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escape(group.label)}</button>`).join('')}</div>`
      + groups.map((group, index) => `<div class="pym-group" role="tabpanel" id="${id}-group-${index}" aria-labelledby="${id}-tab-${index}"${index ? ' hidden' : ''}>`
        + `<ul class="pym-links">${group.links.map(link => `<li><a href="${escape(link.href)}">${escape(link.label)}</a></li>`).join('')}</ul>`
        + (group.tiles.length ? `<div class="pym-tiles">${group.tilesTitle ? `<p class="pym-tiles-title">${escape(group.tilesTitle)}</p>` : ''}<ul>${group.tiles.map(tile => `<li><a href="${escape(tile.href)}"><img src="${escape(tile.image)}" alt="" loading="lazy"><span>${escape(tile.title)}</span></a></li>`).join('')}</ul></div>` : '')
        + (group.footer ? `<a class="pym-footer" href="${escape(group.footer.href)}">${escape(group.footer.label)}</a>` : '')
        + '</div>').join('')
      + (extras ? `<div class="pym-extras">${extras}</div>` : '');
    host.appendChild(panel);
    const toggle = toggleMount.querySelector('[data-store-menu-toggle]');
    const tops = linksMount ? [...linksMount.querySelectorAll('[data-store-menu-top]')] : [];
    const tabs = [...panel.querySelectorAll('[role=tab]')];
    const panes = [...panel.querySelectorAll('[role=tabpanel]')];
    let opener = null, lockedFrom = null, openTimer = 0, closeTimer = 0;
    const select = index => tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panes[i].hidden = i !== index; });
    const focusable = () => [...panel.querySelectorAll('a[href],button:not([disabled])')].filter(el => !el.closest('[hidden]') && !el.closest('.pym-tabs[data-single]') && !(panel.getAttribute('data-mode') === 'dropdown' && el.closest('.pym-tabs')));
    const unlock = () => { if (lockedFrom !== null) { document.documentElement.style.overflow = lockedFrom; lockedFrom = null; } };
    const mouse = event => !event.pointerType || event.pointerType === 'mouse';
    function close(returnFocus) {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (panel.hidden) return;
      panel.hidden = true;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', 'false'));
      unlock();
      storeMenuOpenState.host = storeMenuOpenState.close = null;
      if (returnFocus && opener) opener.focus({ preventScroll: true });
    }
    function open(mode, index, from, focus) {
      if (storeMenuOpenState.close && storeMenuOpenState.host !== host) storeMenuOpenState.close(false);
      opener = from;
      panel.setAttribute('data-mode', mode);
      select(index);
      panel.hidden = false;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', String(button === from)));
      storeMenuOpenState.host = host; storeMenuOpenState.close = close;
      if (mode === 'panel' && lockedFrom === null) { lockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
      if (mode === 'dropdown') unlock();
      if (focus) (mode === 'panel' ? tabs.find(tab => tab.getAttribute('aria-selected') === 'true') : focusable()[0])?.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => (panel.hidden || panel.getAttribute('data-mode') !== 'panel' ? open('panel', 0, toggle, true) : close(true)));
    tops.forEach((top, index) => {
      top.addEventListener('click', () => { clearTimeout(openTimer); if (!panel.hidden && opener === top) close(false); else open('dropdown', index, top, true); });
      top.addEventListener('pointerenter', event => { if (!mouse(event)) return; clearTimeout(closeTimer); clearTimeout(openTimer); openTimer = setTimeout(() => open('dropdown', index, top, false), STORE_MENU_OPEN_MS); });
      top.addEventListener('pointerleave', event => { if (!mouse(event)) return; clearTimeout(openTimer); if (panel.getAttribute('data-mode') === 'dropdown') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    });
    panel.addEventListener('pointerenter', event => { if (mouse(event)) clearTimeout(closeTimer); });
    panel.addEventListener('pointerleave', event => { if (mouse(event) && panel.getAttribute('data-mode') === 'dropdown') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', event => {
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        const target = (next + tabs.length) % tabs.length;
        select(target);
        tabs[target].focus();
      });
    });
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) close(false); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || panel.getAttribute('data-mode') !== 'panel') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    host.__pagosyaStoreMenu = { close, panel };
  }
  function renderStoreMenus() {
    const menu = storeMenuConfig();
    document.querySelectorAll('[data-pagosya-store-menu="toggle"]').forEach(mount => {
      const host = mount.closest('header') || mount.parentElement;
      if (host.__pagosyaStoreMenu) { host.__pagosyaStoreMenu.close(false); host.__pagosyaStoreMenu.panel.remove(); host.__pagosyaStoreMenu = null; }
      if (!menu) return;
      ensureStoreMenuStyle();
      renderStoreMenu(host, menu);
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !storeMenuOpenState.close) return;
    event.preventDefault();
    storeMenuOpenState.close(true);
  });
  document.addEventListener('click', event => {
    if (!storeMenuOpenState.close || storeMenuOpenState.host.contains(event.target)) return;
    storeMenuOpenState.close(false);
  });
  window.addEventListener('pagehide', () => storeMenuOpenState.close && storeMenuOpenState.close(false));
  document.addEventListener('pagosya:ready', renderStoreMenus);
  window.pagosyaStoreMenu = { render: renderStoreMenus, close: () => storeMenuOpenState.close && storeMenuOpenState.close(false) };
  renderStoreMenus();
```

- [ ] **Step 4: Add the part to PARTS and build**

In `packages/storefront-kit/tools/build-commerce.mjs`, insert `'header/store-menu.js',` on the line after `'header/platform-header.js',`.

Run: `node packages/storefront-kit/tools/build-commerce.mjs && node --test packages/storefront-kit/tools/build-commerce.test.mjs`
Expected: kit/commerce.js rewritten; build test PASS

- [ ] **Step 5: Run the kit tests with their neighbours**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-store-menu.spec.ts src/storefront-source/source-header-runtime.spec.ts src/storefront-source/source-commerce-photo-viewer.spec.ts src/storefront-source/source-commerce-fashion.spec.ts`
Expected: PASS. A real failure gets a fix in `store-menu.js`, never a loosened test.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/commerce-src/header/store-menu.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): store menu — panel and hover dropdowns drawn from config.header.menu"
```

---

### Task 3: Esencial hosts the menu, and `config.js` carries it

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (`master.variants.menu`)
- Modify: `packages/store-templates/templates/esencial/components/Shell.tsx`
- Modify: `packages/store-templates/templates/esencial/styles/globals.css`
- Modify: `apps/api/src/storefront-source/source-store-menu.ts` (add `menuFromVariant`)
- Modify: `apps/api/src/storefront-source/source-master.ts` (`MasterFill.menu`)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (`withStoreMenuMounts`, `absoluteTiles`, `assembleTemplateRevision`, `refillMasterFiles`)
- Test: `apps/api/src/storefront-source/source-store-menu.spec.ts`, `apps/api/src/storefront-source/source-master-refill.spec.ts`

**Interfaces:**
- Consumes: `checkStoreMenu`, `storeMenuContext`, `readStoreMenu`, `StoreMenuGroup` (Task 1).
- Produces:
  - `menuFromVariant(variant: unknown, groups: unknown, ctx: StoreMenuContext): StoreMenu | undefined` (undefined for `none` or a missing variant)
  - `MasterFill.menu?: { style: 'none' | 'panel' | 'dropdowns'; groups: StoreMenuGroup[] }`
  - `withStoreMenuMounts<F extends {path;content}>(files: F[]): F[]` (adds the mounts and their CSS to an older Esencial store)
  - `absoluteTiles(groups: StoreMenuGroup[] | undefined, apiUrl?: URL): StoreMenuGroup[] | undefined`
  - `assembleTemplateRevision` input `menuGroups?: StoreMenuGroup[]`; its config gains `header.menu` from `variants.menu`

- [ ] **Step 1: Write the failing tests**

Add to `source-store-menu.spec.ts`:

```ts
import { menuFromVariant } from './source-store-menu';
describe('menuFromVariant', () => {
  it('none or no variant means no menu; a style keeps the checked groups', () => {
    expect(menuFromVariant('none', [], ctx)).toBeUndefined();
    expect(menuFromVariant(undefined, [], ctx)).toBeUndefined();
    expect(menuFromVariant('panel', [], ctx)).toEqual({ style: 'panel' });
    expect(menuFromVariant('dropdowns', [{ label: 'Mujer', links: [{ to: 'category:c1' }] }], ctx)).toEqual({ style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:c1' }] }] });
  });
});
```

Add to `source-master-refill.spec.ts`:

```ts
import { readStoreMenu } from './source-store-menu';
const menuManifest = { ...manifest, master: { ...master, variants: { menu: ['none', 'panel', 'dropdowns'], cards: ['showcase', 'fashion'] } } } as unknown as TemplateManifest;
const shellFile = { path: 'components/Shell.tsx', content: `      <div className="es-header__start">\n        <button type="button" className="es-icon-btn" aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>\n        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>\n      </div>\n      <nav className="es-header__links" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>` };
const menuStore = () => storeFiles().map(file => file.path === 'config.js' ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: {}, header: { account: false }, data: { categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Seda' }], items: [{ categoryId: 'c1', imageUrls: ['https://api.test/v1/uploads/p1.jpg'] }, { categoryId: 'c2', imageUrls: [] }] } })};\n` } : file).concat(shellFile);

describe('menu on a master store', () => {
  it('a menu style in the change turns the menu on, writes header.menu and gives an older Shell its mounts', () => {
    const files = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }] }] } });
    expect(readStoreMenu(files)).toEqual({ style: 'panel', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:c1' }] }] });
    expect(readMasterState(files).variants?.menu).toBe('panel');
    const shell = files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(shell).toContain('data-pagosya-store-menu="toggle"');
    expect(shell).toContain('data-pagosya-store-menu="links"');
    expect(shell.match(/data-store-menu-replaces/g)).toHaveLength(2);
    expect(JSON.parse(files.find(file => file.path === 'config.js')!.content.match(/= (.*);/)![1]).header.account).toBe(false);
  });
  it('a tile given as an upload path is saved as the full API URL and kept when it is a store photo', () => {
    const files = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }], tiles: [{ title: 'Vestidos', image: '/v1/uploads/p1.jpg', to: 'category:c1' }] }] } }, new URL('https://api.test/v1'));
    expect(readStoreMenu(files)?.groups?.[0].tiles).toEqual([{ title: 'Vestidos', image: 'https://api.test/v1/uploads/p1.jpg', to: 'category:c1' }]);
  });
  it('a refill that says nothing about the menu keeps it, groups included', () => {
    const on = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }] }] } });
    const again = refillMasterFiles(on, menuManifest, { copy: { headline: 'Otra' } });
    expect(readStoreMenu(again)).toEqual(readStoreMenu(on));
  });
  it('style none removes it; doing the mounts twice changes nothing', () => {
    const on = refillMasterFiles(menuStore(), menuManifest, { menu: { style: 'panel', groups: [] } });
    const off = refillMasterFiles(on, menuManifest, { menu: { style: 'none', groups: [] } });
    expect(readStoreMenu(off)).toBeUndefined();
    const twice = refillMasterFiles(on, menuManifest, { menu: { style: 'panel', groups: [] } });
    expect(twice.find(f => f.path === 'components/Shell.tsx')!.content).toBe(on.find(f => f.path === 'components/Shell.tsx')!.content);
  });
  it('a fashion store gets the panel at its next refill even without a menu change', () => {
    const fashion = refillMasterFiles(menuStore(), menuManifest, { variants: { cards: 'fashion' } as never });
    expect(readStoreMenu(fashion)).toEqual({ style: 'panel' });
  });
  it('an edited Shell without the template lines is left alone, and the menu still saves', () => {
    const edited = menuStore().map(file => file.path === 'components/Shell.tsx' ? { ...file, content: '<header>propio</header>' } : file);
    const files = refillMasterFiles(edited, menuManifest, { menu: { style: 'panel', groups: [] } });
    expect(files.find(f => f.path === 'components/Shell.tsx')!.content).toBe('<header>propio</header>');
    expect(readStoreMenu(files)).toEqual({ style: 'panel' });
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-store-menu.spec.ts src/storefront-source/source-master-refill.spec.ts`
Expected: FAIL. `menuFromVariant` is not exported, and `readStoreMenu(files)` is undefined.

- [ ] **Step 3: Implement**

`source-store-menu.ts`, add:

```ts
/** Esencial's dice record (variants.menu) as the config the kit reads; `none` or no record means no menu. */
export function menuFromVariant(variant: unknown, groups: unknown, ctx: StoreMenuContext): StoreMenu | undefined {
  return checkStoreMenu({ style: variant, groups }, ctx) ?? undefined;
}
```

`source-master.ts`: in `MasterFill` add `menu?: { style: 'none' | 'panel' | 'dropdowns'; groups: StoreMenuGroup[] };` (import the type from `./source-store-menu`).

`template.json`: add `"menu": ["none", "panel", "dropdowns"]` as the **last** key of `master.variants`.

`Shell.tsx`: replace the header start and links:

```tsx
      <div className="es-header__start">
        <div className="es-store-menu" data-pagosya-store-menu="toggle" />
        <button type="button" className="es-icon-btn" data-store-menu-replaces aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>
        <div className="es-store-menu-links" data-pagosya-store-menu="links" />
      </div>
      <nav className="es-header__links" aria-label="Principal" data-store-menu-replaces>{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
```

`globals.css`: add after the «Variety spec §2: header» block (the kit's sheet owns the menu; Esencial only spaces its mounts):

```css
/* Dropdown menu (2026-10-21): the kit fills these mounts when config.header.menu is on; empty, they take no room. */
.es-store-menu:empty,.es-store-menu-links:empty{display:none}
.es-store-menu-links{margin-left:24px}
.es-header[data-store-menu] .es-header__start{gap:8px}
```

`source-templates.ts`:

```ts
/** Dropdown menu spec 2026-10-21: an Esencial store built before the menu gets its two mounts, the replace marks and the
 *  mounts' CSS. A Shell the store edited (the template lines gone) is left alone; the menu then simply has no host there.
 *  Doing it twice changes nothing. */
const SHELL_TOGGLE = '<button type="button" className="es-icon-btn" aria-controls="es-menu"';
const SHELL_LOGO_END = ': store.name}</a>';
const SHELL_NAV = '<nav className="es-header__links" aria-label="Principal">';
const STORE_MENU_CSS_MARK = '/* Dropdown menu (2026-10-21)';
export function withStoreMenuMounts<F extends { path: string; content: string }>(files: F[]): F[] {
  const css = templateSourceFiles(MASTER_TEMPLATE_ID).find(file => file.path === 'styles/globals.css')?.content ?? '';
  const start = css.indexOf(STORE_MENU_CSS_MARK);
  const block = start < 0 ? '' : css.slice(start, css.indexOf('\n\n', start) < 0 ? undefined : css.indexOf('\n\n', start)).trim();
  return files.map(file => {
    if (file.path === 'styles/globals.css' && block && !file.content.includes(STORE_MENU_CSS_MARK)) return { ...file, content: `${file.content.trimEnd()}\n\n${block}\n` };
    if (file.path !== 'components/Shell.tsx' || file.content.includes('data-pagosya-store-menu') || ![SHELL_TOGGLE, SHELL_LOGO_END, SHELL_NAV].every(line => file.content.includes(line))) return file;
    const indent = file.content.slice(file.content.lastIndexOf('\n', file.content.indexOf(SHELL_TOGGLE)) + 1, file.content.indexOf(SHELL_TOGGLE));
    const content = file.content
      .replace(SHELL_TOGGLE, `<div className="es-store-menu" data-pagosya-store-menu="toggle" />\n${indent}<button type="button" className="es-icon-btn" data-store-menu-replaces aria-controls="es-menu"`)
      .replace(SHELL_LOGO_END, `${SHELL_LOGO_END}\n${indent}<div className="es-store-menu-links" data-pagosya-store-menu="links" />`)
      .replace(SHELL_NAV, '<nav className="es-header__links" aria-label="Principal" data-store-menu-replaces>');
    return { ...file, content };
  });
}

/** A tile photo the fill gave as an upload path (`/v1/uploads/…`) as the full API URL, so the save check can match it. */
export const absoluteTiles = (groups: StoreMenuGroup[] | undefined, apiUrl?: URL) => groups?.map(group => ({ ...group, ...(group.tiles ? { tiles: group.tiles.map(tile => ({ ...tile, image: masterPhotoUrl(tile.image, apiUrl) })) } : {}) }));
```

`refillMasterFiles`:
1. After `variants` is computed:

```ts
  // Dropdown menu spec 2026-10-21: a menu change sets the record; a fashion store without one gets the panel.
  if (settings.variants?.menu?.length) {
    if (change.menu && settings.variants.menu.includes(change.menu.style)) variants.menu = change.menu.style;
    else if (!change.menu && variants.cards === 'fashion' && (!variants.menu || variants.menu === 'none')) variants.menu = 'panel';
  }
```

2. In the `config.js` branch, before the return:

```ts
      const { menu: savedMenu, ...header } = config.header ?? {};
      const menu = menuFromVariant(variants.menu, change.menu ? absoluteTiles(change.menu.groups, apiUrl) : savedMenu?.groups, storeMenuContext(config.data ?? {}, files));
```

   Then put `header: { ...header, ...(menu ? { menu } : {}) }` into the written object, next to `showcase`.
3. Wrap the return: `const out = withFashionTemplateParts(...)`, then `return variants.menu && variants.menu !== 'none' ? withStoreMenuMounts(out) : out;`.

`assembleTemplateRevision`: add `menuGroups?: StoreMenuGroup[]` to the input. After `scaffold` is built:

```ts
  const variantsUsed = input.variants ?? (input.fill?.variants as MasterVariants | undefined);
  const menu = settings ? menuFromVariant(variantsUsed?.menu, absoluteTiles(input.menuGroups ?? input.fill?.menu?.groups, input.apiUrl), storeMenuContext(data, [...authored, ...scaffold])) : undefined;
```

Add `...(menu ? { header: { menu } } : {})` to the `config` literal. The template's own `Shell.tsx` already has the mounts (step above).

- [ ] **Step 4: Run the tests to check they pass**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-store-menu.spec.ts src/storefront-source/source-master-refill.spec.ts src/storefront-source/source-master-esencial.spec.ts src/storefront-source/source-templates-contract.spec.ts src/storefront-source/source-master.spec.ts`
Expected: PASS. `source-templates-contract` compiles every template, so a TSX slip in `Shell.tsx` fails here.

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/templates/esencial apps/api/src/storefront-source/source-store-menu.ts apps/api/src/storefront-source/source-store-menu.spec.ts apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-templates.ts apps/api/src/storefront-source/source-master-refill.spec.ts
git commit -m "feat(esencial,api): Esencial hosts the store menu; config.js header.menu from the menu variant"
```

---

### Task 4: The dice roll `menu`

**Files:**
- Modify: `apps/api/src/storefront-source/source-master-dice.ts`
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`applyMaster`: `categoryCount`, the fill's style)
- Test: `apps/api/src/storefront-source/source-master-dice.spec.ts`

**Interfaces:**
- Consumes: `MasterFill.menu` (Task 3).
- Produces: `rollVariants` input `categoryCount?: number` (categories that have products); `menuVariant(rolled: string | undefined, chosen: string | undefined, fashion: boolean): string | undefined`; `MasterFacts.categoryCount: number`.

- [ ] **Step 1: Write the failing tests**

Add to `source-master-dice.spec.ts`. Reuse the file's existing `settings` / `character` fixtures (rename in the snippet to whatever the file calls them):

```ts
import { menuVariant } from './source-master-dice';
describe('menu part', () => {
  const withMenu = { ...settings, variants: { ...settings.variants, menu: ['none', 'panel', 'dropdowns'] } } as typeof settings;
  const roll = (over: object) => rollVariants({ seed: 's', settings: withMenu, character, photoCount: 4, sections: [], recent: [], ...over });
  it('a store with fewer than 2 categories rolls none', () => {
    for (const seed of ['a', 'b', 'c', 'd']) expect(roll({ seed, categoryCount: 1 }).variants.menu).toBe('none');
  });
  it('fashion stores always get the panel', () => {
    for (const seed of ['a', 'b', 'c', 'd']) expect(roll({ seed, categoryCount: 0, character: { ...character, kind: 'fashion' } }).variants.menu).toBe('panel');
  });
  it('other stores with categories roll every value across seeds', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => roll({ seed: `s${i}`, categoryCount: 3 }).variants.menu));
    expect(seen).toEqual(new Set(['none', 'panel', 'dropdowns']));
  });
  it('adding the menu part leaves every other roll as it was', () => {
    const before = rollVariants({ seed: 'x', settings, character, photoCount: 4, sections: [], recent: [] });
    const after = rollVariants({ seed: 'x', settings: withMenu, character, photoCount: 4, sections: [], recent: [], categoryCount: 3 });
    const { menu: _menu, ...rest } = after.variants;
    expect(rest).toEqual(before.variants);
    expect([after.palette, after.fonts]).toEqual([before.palette, before.fonts]);
  });
  it('the fill picks the style but not whether a non-fashion store has a menu', () => {
    expect(menuVariant('panel', 'dropdowns', false)).toBe('dropdowns');
    expect(menuVariant('none', 'dropdowns', false)).toBe('none');
    expect(menuVariant('dropdowns', 'none', false)).toBe('dropdowns');
    expect(menuVariant('panel', 'dropdowns', true)).toBe('dropdowns');
    expect(menuVariant('panel', 'none', true)).toBe('panel');
    expect(menuVariant(undefined, 'panel', false)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-dice.spec.ts -t "menu part"`
Expected: FAIL. `menuVariant` is not exported, and the menu is rolled with the main rng (which shifts palette/fonts) and is not pinned.

- [ ] **Step 3: Implement**

In `source-master-dice.ts`:

```ts
/** Dropdown menu spec 2026-10-21: a menu needs at least two categories to be worth opening; fashion stores always get one.
 *  It is rolled from its own seed, so adding the part left every other part, palette and font pair as it was. */
const MENU_MIN_CATEGORIES = 2;
```

- Add `'menu'` to `DICE_ONLY`. Add `categoryCount?: number` to the input type.
- In the main roll, skip it: `Object.keys(catalogue).filter(part => part !== 'menu').map(...)`.
- After the fashion pin:

```ts
    if (catalogue.menu?.length) {
      variants.menu = input.character.kind === 'fashion' ? 'panel'
        : (input.categoryCount ?? 0) < MENU_MIN_CATEGORIES ? 'none'
        : pick(rng(`${input.seed}#menu`), allowed('menu'));
    }
```

- Export:

```ts
/** The fill's style choice over the roll: it picks panel or dropdowns, never whether a non-fashion store has a menu. */
export function menuVariant(rolled: string | undefined, chosen: string | undefined, fashion: boolean): string | undefined {
  if (rolled === undefined) return undefined;
  const style = chosen === 'panel' || chosen === 'dropdowns' ? chosen : undefined;
  if (fashion) return style ?? 'panel';
  return rolled === 'none' ? 'none' : style ?? rolled;
}
```

In `source-templates.service.ts` `applyMaster`:
- `facts`: add `categoryCount: publicStore.categories.filter(category => publicStore.items.some(item => item.categoryId === category.id)).length` (add `categoryCount: number` to `MasterFacts`; `grep -n "type MasterFacts" -r apps/api/src`).
- Pass `categoryCount: facts.categoryCount` to `rollVariants`.
- After `variants = rolled.variants;`:

```ts
      // Dropdown menu spec 2026-10-21: the fill picks panel or dropdowns; the roll decides whether a non-fashion store has one.
      if (variants.menu !== undefined) variants = { ...variants, menu: menuVariant(variants.menu, fill?.menu?.style, fill?.character?.kind === 'fashion')! };
```

- The groups ride inside `fill` (`fill.menu.groups`), which `assembleTemplateRevision` reads (Task 3). Check that `assemble` forwards `fill` unchanged.

- [ ] **Step 4: Run the tests to check they pass**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-dice.spec.ts src/storefront-source/source-master-esencial.spec.ts $(grep -ln "applyMaster" apps/api/src -r --include='*.spec.ts' | sed 's#apps/api/##' | tr '\n' ' ')`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-master-dice.ts apps/api/src/storefront-source/source-master-dice.spec.ts apps/api/src/storefront-source/source-templates.service.ts
git commit -m "feat(api): Esencial dice roll the menu; fashion always panel, under 2 categories none"
```

---

### Task 5: YAPI picks, groups and edits the menu (fill call + chat)

**Files:**
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (`MASTER_FILL_PROMPT`, `masterFillSchema`, `MasterFillInput`, `fillMaster` facts)
- Modify: `apps/api/src/storefront-source/source-master.ts` (`MasterRead.menuStyle/menuGroups`, `menuGroupsFromRead`, `masterFillFromRead`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`useMasterTemplate`, `masterContentEdit`, routing)
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`MasterFacts.menuTargets`)
- Test: `apps/api/src/storefront-source/source-master.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`, `apps/api/src/storefront-source/source-conversation.service.spec.ts`

**Interfaces:**
- Consumes: `storeMenuContext`, `storeMenuTargetList`, `readStoreMenu`, `instructionAsksStoreMenu`, `instructionTouchesStoreMenu` (Task 1); `MasterFill.menu` (Task 3).
- Produces:
  - `MasterRead.menuStyle?: 'none' | 'panel' | 'dropdowns'`
  - `MasterRead.menuGroups?: Array<{ label: string; links: Array<{ label: string; target: string }>; tilesTitle: string; tiles: Array<{ title: string; photo: number; target: string }>; footerLabel: string; footerTarget: string }>`
  - `MasterFillInput.menuTargets?: Array<{ target: string; label: string }>`, `MasterFillInput.current.menu?: StoreMenu | null`
  - `menuGroupsFromRead(groups, photos: readonly string[]): StoreMenuGroup[]`
  - `MasterFacts.menuTargets: Array<{ target: string; label: string }>`

- [ ] **Step 1: Write the failing tests**

`source-master.spec.ts`:

```ts
import { masterFillFromRead, menuGroupsFromRead } from './source-master';
describe('menu from the fill read', () => {
  const photos = ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'];
  const groups = [{ label: 'Mujer', links: [{ label: '', target: 'category:c1' }], tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', photo: 1, target: 'category:c1' }, { title: 'Sin foto', photo: 9, target: 'all' }], footerLabel: 'Ver toda la tienda', footerTarget: 'all' }];
  it('turns photo indexes into the photos, leaves empty labels to the save check, and drops empty tile lists', () => {
    expect(menuGroupsFromRead(groups, photos)).toEqual([{ label: 'Mujer', links: [{ to: 'category:c1' }], tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: '/v1/uploads/b.jpg', to: 'category:c1' }], footer: { label: 'Ver toda la tienda', to: 'all' } }]);
    expect(menuGroupsFromRead([{ ...groups[0], tiles: [], tilesTitle: '', footerTarget: '' }], photos)).toEqual([{ label: 'Mujer', links: [{ to: 'category:c1' }] }]);
  });
  it('a build always carries the read menu; an edit only when "menu" changed', () => {
    const read = { menuStyle: 'dropdowns', menuGroups: groups, changed: [] } as never;
    expect(masterFillFromRead(read, photos, false).menu?.style).toBe('dropdowns');
    expect(masterFillFromRead(read, photos, true).menu).toBeUndefined();
    expect(masterFillFromRead({ ...(read as object), changed: ['menu'] } as never, photos, true).menu?.style).toBe('dropdowns');
  });
});
```

`source-chat-master.spec.ts`: copy the file's closest existing master content-edit test (the one that drives `masterContentEdit` through the chat entry point with a mocked `dialogue.fillMaster` and `templates.refill`). Change only the instruction, the decision's `editKind` and the expectations, and add three tests:
1. «quiero un menú desplegable con mis categorías» with `editKind: 'design'` → `dialogue.fillMaster` is called with `menuTargets` containing `{ target: 'all', … }` and `current.menu === null`. The mocked read leaves `menu` out of `changed`, yet `templates.refill` is called with a change whose `menu.style === 'panel'`.
2. «quita el menú desplegable» on a store whose saved `config.js` has `header.menu` → `templates.refill` receives `menu: { style: 'none', groups: [] }`.
3. «agrega postres al menú» with `editKind: 'design'` on a store without a menu → `dialogue.fillMaster` is not called.

`source-conversation.service.spec.ts`: next to the existing master-fill schema test, add that `menuStyle` and `menuGroups` are in `required`, that a target outside `menuTargets` is not in a link's `target` enum, and that `footerTarget` allows `''`.

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-conversation.service.spec.ts -t "menu"`
Expected: FAIL

- [ ] **Step 3: Implement**

`source-master.ts`:

```ts
/** Dropdown menu spec 2026-10-21: the fill read's groups as the menu config; a tile's photo index becomes that photo. Labels
 *  left empty take the target's own name at the save check. */
export function menuGroupsFromRead(groups: MasterRead['menuGroups'], photos: readonly string[]): StoreMenuGroup[] {
  return (groups ?? []).map(group => {
    const tiles = group.tiles.flatMap(tile => Number.isInteger(tile.photo) && tile.photo >= 0 && tile.photo < photos.length ? [{ title: tile.title, image: photos[tile.photo], to: tile.target }] : []);
    return {
      label: group.label,
      links: group.links.map(link => ({ ...(link.label ? { label: link.label } : {}), to: link.target })),
      ...(tiles.length ? { ...(group.tilesTitle ? { tilesTitle: group.tilesTitle } : {}), tiles } : {}),
      ...(group.footerTarget ? { footer: { label: group.footerLabel, to: group.footerTarget } } : {}),
    };
  });
}
```

Add `menuStyle?` and `menuGroups?` to `MasterRead`. In `masterFillFromRead`, add `...(read.menuStyle && keep('menu') ? { menu: { style: read.menuStyle, groups: menuGroupsFromRead(read.menuGroups, photos) } } : {})`.

`source-conversation.service.ts`:
- `masterFillSchema` gains a 7th parameter, `menuTargets: string[] = []`. Add `'menuStyle', 'menuGroups'` to `required`, add `'menu'` to the `changed` enum, and add:

```ts
    menuStyle: { type: 'string', enum: ['none', 'panel', 'dropdowns'] },
    menuGroups: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['label', 'links', 'tilesTitle', 'tiles', 'footerLabel', 'footerTarget'], properties: {
      label: capped(28), tilesTitle: capped(28), footerLabel: capped(28),
      links: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['label', 'target'], properties: { label: capped(28), target: { type: 'string', enum: menuTargets.length ? menuTargets : ['all'] } } } },
      tiles: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['title', 'photo', 'target'], properties: { title: capped(28), photo: { type: 'integer' }, target: { type: 'string', enum: menuTargets.length ? menuTargets : ['all'] } } } },
      footerTarget: { type: 'string', enum: ['', ...(menuTargets.length ? menuTargets : ['all'])] },
    } } },
```

- `MasterFillInput`: add `menuTargets?: Array<{ target: string; label: string }>` and `menu?: StoreMenu | null` inside `current`. In `fillMaster`, add `menuTargets` to `facts` and pass `(input.menuTargets ?? []).map(t => t.target)` as the schema's 7th argument. Raise `max_output_tokens` from 2500 to 3500, because the groups add output.
- Append to `MASTER_FILL_PROMPT`:

> menuStyle and menuGroups set the store's header menu. menuStyle: "panel" (a ☰ panel with tabs, for fashion and calm editorial brands) or "dropdowns" (top links that drop a panel, for brands with 2–4 big departments); "none" only when the store has fewer than 2 categories. menuGroups: [] lets the platform build the menu from the categories (the usual answer). Write groups only when the products split clearly into departments (Mujer / Hombre, Cocina / Baño): at most 4 groups, each with links to targets from menuTargets (label "" uses the target's own name; a section target needs a label), up to 3 tiles whose photo shows that target, tilesTitle such as «Por estilo», and footerTarget "all" with footerLabel «Ver toda la tienda» or "". Never invent a target. In an edit, copy current.menu unless the request is about the menu; when it is, add "menu" to changed (style "none" removes the menu).

`source-templates.service.ts` `applyMaster`: add `menuTargets: storeMenuTargetList(storeMenuContext(sourceStoreConfigData(publicStore, sourcePublicApiUrl(this.config), false), []))` to `facts`. This gives categories and pages, but no sections: the template's home is not compiled yet.

`source-chat.service.ts`:
- `useMasterTemplate`: pass `menuTargets: facts.menuTargets` to `fillMaster`.
- `masterContentEdit`:

```ts
    const files = (previous.snapshot as SourceProjectSnapshot).files;
    const menuCtx = storeMenuContext(readConfigFile(files).data ?? {}, files);
    const currentMenu = readStoreMenu(files) ?? null;
    // fillMaster(merchantId, { ..., menuTargets: storeMenuTargetList(menuCtx), current: { ...current, menu: currentMenu }, request })
    // The merchant's clear words win over a read that missed them: «quiero un menú desplegable» turns it on, «quita…» off.
    const asked = instructionAsksStoreMenu(request);
    const withAsk = (change: MasterFill): MasterFill => asked === undefined || change.menu ? change
      : { ...change, menu: asked ? { style: currentMenu?.style ?? 'panel', groups: currentMenu?.groups ?? [] } : { style: 'none', groups: [] } };
```

  Apply `withAsk` to a non-null `change` before the «nothing to change» check. A menu-only request then never falls through to a design edit.
- Routing, at the `masterStore && decision.editKind === 'content'` line:

```ts
      const menuWords = masterStore && (instructionAsksStoreMenu(input.instruction) !== undefined
        || (Boolean(readStoreMenu((previous!.snapshot as unknown as SourceProjectSnapshot).files)) && instructionTouchesStoreMenu(input.instruction)));
      if (masterStore && (decision.editKind === 'content' || menuWords)) {
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-conversation.service.spec.ts src/storefront-source/source-master-refill.spec.ts src/storefront-source/source-master-fill.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-templates.service.ts apps/api/src/storefront-source/source-master.spec.ts apps/api/src/storefront-source/source-chat-master.spec.ts apps/api/src/storefront-source/source-conversation.service.spec.ts
git commit -m "feat(api,yapi): the fill call picks, groups and edits the store menu; menu words route to it"
```

---

### Task 6: Static stores — the platform header hosts the menu

**Files:**
- Modify: `apps/api/src/storefront-source/source-header.ts` (`RenderHeaderInput.menu`, mounts, replace marks, extras; `withSourceHeader` reads `header.menu`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (word detection → `withStoreMenuConfig` at save, `menu` into `withSourceHeader`)
- Test: `apps/api/src/storefront-source/source-header.spec.ts`, `apps/api/src/storefront-source/source-header-runtime.spec.ts`

**Interfaces:**
- Consumes: `readStoreMenu`, `withStoreMenuConfig`, `instructionAsksStoreMenu` (Task 1); the kit DOM contract (Task 2).
- Produces: `RenderHeaderInput.menu?: boolean`, `SourceHeaderInput.menu?: boolean`. A header without `menu` keeps exactly its bytes.

- [ ] **Step 1: Write the failing tests**

First list the shapes whose kit template lacks `{{toggle}}`: `grep -L "{{toggle}}" packages/storefront-kit/kit/headers/*.html`. Each shape listed (other than the retired `bottom-pill`) gets its toggle mount in the first part it renders (`nav` or `tools`); see Step 3.

`source-header.spec.ts`:

```ts
describe('store menu mounts', () => {
  const base = { shape: 'centered-split' as const, purpose: 'shop' as const, storeName: 'Noa', links: [{ href: 'productos.html', label: 'Productos' }, { href: 'nosotros.html', label: 'Nosotros' }] };
  it('without a menu the header keeps its bytes', () => {
    expect(renderSourceHeader({ ...base, menu: false })).toBe(renderSourceHeader(base));
  });
  it.each(HEADER_SHAPES.map(shape => [shape]))('%s: the menu adds the toggle mount, marks what it replaces and offers the menu tools', shape => {
    const html = renderSourceHeader({ ...base, shape, menu: true });
    expect(html).toContain('data-pagosya-store-menu="toggle"');
    expect(html).toContain('data-store-menu-extra');
    if (html.includes('class="pyh-toggle"')) expect(html).toMatch(/<button data-store-menu-replaces type="button" class="pyh-toggle"/);
    if (/<nav class="pyh-nav"/.test(renderSourceHeader({ ...base, shape }))) {
      expect(html).toContain('data-pagosya-store-menu="links"');
      expect(html).toMatch(/<nav data-store-menu-replaces class="pyh-nav"/);
    }
  });
  it('withSourceHeader draws the mounts when config.js has header.menu', () => {
    const files = [{ path: 'index.html', content: '<body><header data-pagosya-header></header><main></main></body>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"header":{"menu":{"style":"panel"}}};\n' }];
    const out = withSourceHeader(files, { purpose: 'shop', storeName: 'Noa' });
    expect(out.files[0].content).toContain('data-pagosya-store-menu="toggle"');
  });
});
```

`source-header-runtime.spec.ts` (it loads `commerce.js` with a rendered platform header): add a test in its own style. With `PAGOSYA_CONFIG.header.menu = { style: 'panel' }` and a header from `renderSourceHeader({ ..., menu: true })`, the header element gets `data-store-menu="panel"`, the store menu's ☰ opens `[data-store-menu-panel]`, and `.pym-extras` contains «Mi cuenta».

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-header.spec.ts src/storefront-source/source-header-runtime.spec.ts -t "store menu"`
Expected: FAIL

- [ ] **Step 3: Implement**

In `renderSourceHeader`, after the `if (controls) { … }` block (which rewrites `toggle` and `menu`), before `const body = …`:

```ts
  // Dropdown menu spec 2026-10-21: the kit draws the store menu into these mounts (commerce-src/header/store-menu.js) and hides
  // what carries data-store-menu-replaces; the menu's own tools (Buscar, Mi cuenta…) are offered to its panel. Without a menu
  // every header keeps its bytes.
  if (input.menu) {
    const mark = (html: string, tag: string) => html.replace(new RegExp(`^<${tag}\\b`), `<${tag} data-store-menu-replaces`);
    const linksMount = '<div class="pyh-store-menu-links" data-pagosya-store-menu="links"></div>';
    if (parts.nav) parts.nav = mark(parts.nav, 'nav') + linksMount;
    if (parts.navStart) parts.navStart = mark(parts.navStart, 'nav') + linksMount;
    if (parts.navEnd) parts.navEnd = mark(parts.navEnd, 'nav');
    parts.toggle = `<div class="pyh-store-menu" data-pagosya-store-menu="toggle"></div>${mark(parts.toggle, 'button')}`;
    parts.menu = parts.menu.replace('<div class="pyh-menu-tools">', '<div class="pyh-menu-tools" data-store-menu-extra>');
  }
```

For a shape the Step 1 `grep -L` listed, prepend the toggle mount to the first part that shape's template uses (read the template), inside the same `if (input.menu)` block, keyed on `input.shape`. Never edit the kit header templates for this. A template that holds both `{{nav}}` and `{{navStart}}` would get two links mounts; the kit fills only the first (`querySelector`), which is fine.

Add `menu?: boolean` to `RenderHeaderInput` and `SourceHeaderInput`. In `withSourceHeader`, add `const menu = input.menu ?? Boolean(readStoreMenu(files) ?? readStoreMenu(input.previous ?? []));` and pass `...(menu ? { menu } : {})` to `renderSourceHeader`.

`source-generation.service.ts`, next to `headerAccountAsk` (line ~543):

```ts
    // Dropdown menu spec 2026-10-21: a static store with the platform header gets the store menu (panel, default groups) when
    // the merchant's words ask for one, and loses it when they ask to remove it; written to config.js at save like header.account.
    const storeMenuAsk = !creative && !useNext && hasPlatformHeader(previousFiles) ? instructionAsksStoreMenu(merchantWords) : undefined;
```

- In the `withSourceHeader(...)` call (~line 913), add `...(storeMenuAsk !== undefined ? { menu: storeMenuAsk } : {})`.
- Beside `withHeaderAccount`, add:

```ts
    const withStoreMenu = <T extends { files: SourceProjectFileDto[] }>(input: T): T => storeMenuAsk === undefined ? input
      : { ...input, files: withStoreMenuConfig(input.files, previousFiles, storeMenuAsk ? (readStoreMenu(previousFiles) ?? { style: 'panel' }) : null) };
```

- Wrap: `assembleSave = async (...) => withStoreMenu(withHeaderAccount(withControls(...)))`.

- [ ] **Step 4: Run the tests to check they pass**

Run: `cd apps/api && npx jest -w 2 $(grep -ln "withSourceHeader\|renderSourceHeader" apps/api/src -r --include='*.spec.ts' | sed 's#apps/api/##' | tr '\n' ' ')`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-header.spec.ts apps/api/src/storefront-source/source-header-runtime.spec.ts
git commit -m "feat(api): the platform header hosts the store menu; menu words switch it on for static stores"
```

---

### Task 7: Typecheck, wide test run, and the live check

**Files:**
- Possibly modify: whatever the checks expose (each fix gets a reproducing test in the owning task's spec first)

- [ ] **Step 1: Typecheck and the wider suites**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest -w 2 src/storefront-source/source-master src/storefront-source/source-header src/storefront-source/source-commerce src/storefront-source/source-store-menu src/storefront-source/source-chat-master src/storefront-source/source-templates`
Expected: tsc clean; every listed suite PASS. Before blaming this branch for a failure, rerun that suite on `b3b22fe2` (the commit before this plan) in a scratch worktree. Some storefront suites were already failing before this work.

Run: `node packages/storefront-kit/tools/build-commerce.mjs --check && (cd packages/storefront-kit && npm test)`
Expected: PASS

- [ ] **Step 2: Rebuild the Studio and bring the stack up**

Check that no YAPI job is RUNNING before anything restarts the API (saving `apps/api` restarts `nest --watch` and kills a running job). Note the ports in use. The owner's stack runs with `pnpm dev:chatgpt`, never plain `pnpm dev`.

Run: `cd apps/merchant-dashboard && npm run build:studio`
Expected: build succeeds (the Studio embeds the kit)

- [ ] **Step 3: NOA VARGAS (fashion, panel), desktop 1440 and phone 390**

Run: `cd apps/api && npx ts-node --transpile-only scripts/fashion-look-apply.ts <NOA storeId>`. The script refills with the fashion variants, so Task 3's fashion rule gives the panel and the Shell its mounts. Open the new revision through Studio «Ver en navegador», signed in with the seeded demo-aggregator login, profile «Yapi QA».

Check by eye and screenshot, beside the John Smedley screenshot:
- ☰ opens a panel under the header, as wide as the header. The «Tienda» tab is filled dark, links sit in two columns, there are up to 3 tiles from real store photos, and the dark «Ver toda la tienda» bar is at the bottom.
- ←/→ moves between tabs; Esc closes and gives focus back to ☰; the page scrolls again after close.
- Phone 390: same panel, no horizontal scroll, all tap targets ≥ 44 px.
- The photo viewer still opens and closes with Esc on the product page.

- [ ] **Step 4: One non-fashion Esencial store with dropdowns**

On a non-fashion Esencial demo store (from the 12 live demo stores) with ≥ 2 categories, send in the Studio chat: «quiero menús desplegables arriba con mis categorías». Expect a content edit (seconds, not a design run). Then, on desktop: hovering a top link opens its panel after a short delay, moving diagonally into the panel keeps it open, and leaving closes it; click and Enter open it too. On phone 390, it is the ☰ panel.

- [ ] **Step 5: One static store with the platform header**

On a static demo store with the platform header, send «agrega un menú desplegable con categorías». Then confirm:
- The platform toggle is hidden, the store menu ☰ opens the panel, and «Buscar» / «Mi cuenta» appear in its extras.
- The header gate (`measureHeaderCovers`) reports no `under` cover on the store's own controls.

- [ ] **Step 6: Record and commit any fixes**

A failing check gets a reproducing test in the owning spec, a fix, a kit rebuild (`node packages/storefront-kit/tools/build-commerce.mjs`) plus a Studio rebuild, and a recheck. Commit per fix: `fix(kit|api|esencial): <what the live check found>`.
