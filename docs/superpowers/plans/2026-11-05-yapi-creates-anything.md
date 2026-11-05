# YAPI creates anything, part 1 — items and new pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On template stores the quick edit adds, removes and moves items inside a section, and creates, renames, relinks and removes extra pages with their menu link.

**Architecture:** Item ops are new `LayoutOp` kinds applied by `applyLayoutOps` before text/photo. Extra pages live in store-data `extraPages` (slug, name, menu place, layout); a pure module turns page ops into the new list, writes one marked page file per page, and keeps the menu's `extra:<slug>` links in step with the list; the kit resolves `extra:` targets and draws a one-link group as a plain bar link. `templateLayoutEdit` applies page ops first, then section ops per extra page, and saves everything in one refill.

**Tech Stack:** NestJS + jest (API), plain JS kit (node --test + build), vitest (preview, Studio).

**Spec:** `docs/superpowers/specs/2026-11-05-yapi-creates-anything-design.md`

## Global Constraints

- Template stores only; classic stores and the code generator unchanged.
- Item limits = the section type's `needs.items: [min, max]` in `LIBRARY_CATALOG`; types without `needs.items` take no item-add.
- Item ops apply before text/photo ops; text/photo `item` numbers are the numbers after the item ops.
- Extra pages: at most 6; at most 8 sections each (`MAX_PAGE_SECTIONS`); slug `^[a-z][a-z0-9-]{0,39}$` from the name (lower case, accents removed, other chars → `-`), never an existing page path; clash → `-2`, `-3`…
- Page file `components/pages/<slug>.tsx`, first line `// @pagosya-extra-page`; a file without the marker is never written or deleted.
- Menu link target `extra:<slug>`; place `''` = the bar (a one-link group with `direct: true`), else the label of an existing group; `STORE_MENU_LIMITS` (groups 4, links 12) refuse with a sentence.
- Ops on the page created in the same reply use `page = "nueva"`.
- No apps/api save while a YAPI job runs; never `sed -i` an apps/api file; stage files by path (never `git commit -a`); run named spec files only.

## Review Focus

1. «agrega un paso y ponle "Entrega en el atelier"» in one message: the text op must hit the new item (number after insert) → Task 1 test.
2. A page named like an existing page («Productos», «Nosotros», «Checkout») → never overwrites; slug gets a suffix → Task 2 test.
3. A store whose `header.menu` has no groups (kit default menu): adding a bar link must keep the default menu → Task 3 kit test.
4. `page-remove` of a slug that does not exist / a `page` op naming a menu page → refused, nothing deleted → Task 4 test.
5. A template switch with extra pages keeps pages, files and links → Task 5 test.

---

### Task 1: Item ops (pure)

**Files:** Modify `apps/api/src/storefront-source/source-layout-edit.ts`; Test `apps/api/src/storefront-source/source-layout-edit.spec.ts`.

**Interfaces:** Produces `LayoutOp.op` += `'item-add' | 'item-remove' | 'item-move'`; schema enum the same; `readLayoutEdit` keeps them; `applyLayoutOps` applies them first.

- [ ] Step 1: failing tests (append):

```ts
describe('items inside a section (spec 2026-11-05 creates anything)', () => {
  const steps: LayoutBlock[] = [{ type: 'cover-split', title: 'Hola' }, { type: 'story-list', title: 'Pasos', items: [{ title: 'Uno' }, { title: 'Dos' }, { title: 'Tres' }] }];
  it('adds an item where asked and the text op hits the new number', () => {
    const out = applyLayoutOps(steps, [op({ op: 'item-add', at: 1, item: 1, value: 'Uno y medio' }), op({ op: 'text', at: 1, item: 1, field: 'text', value: 'Entre uno y dos' })], []);
    expect(out.layout[1].items!.map(i => i.title)).toEqual(['Uno', 'Uno y medio', 'Dos', 'Tres']);
    expect(out.layout[1].items![1].text).toBe('Entre uno y dos');
    expect(out.done[0]).toContain('agregué el punto «Uno y medio»');
  });
  it('appends with item -1, removes and moves', () => {
    expect(applyLayoutOps(steps, [op({ op: 'item-add', at: 1, item: -1, value: 'Cuatro' })], []).layout[1].items!.at(-1)!.title).toBe('Cuatro');
    expect(applyLayoutOps(steps, [op({ op: 'item-remove', at: 1, item: 0 })], []).layout[1].items!.map(i => i.title)).toEqual(['Dos', 'Tres']);
    expect(applyLayoutOps(steps, [op({ op: 'item-move', at: 1, item: 2, to: 0 })], []).layout[1].items!.map(i => i.title)).toEqual(['Tres', 'Uno', 'Dos']);
  });
  it('keeps the section type limits and refuses sections without items', () => {
    const full: LayoutBlock[] = [steps[0], { ...steps[1], items: [...steps[1].items!, { title: 'Cuatro' }] }];
    const over = applyLayoutOps(full, [op({ op: 'item-add', at: 1, item: -1, value: 'Cinco' })], []);
    expect(over.layout[1].items).toHaveLength(4);
    expect(over.refused[0]).toMatch(/ya son 4, el máximo/);
    const two: LayoutBlock[] = [steps[0], { ...steps[1], items: steps[1].items!.slice(0, 2) }];
    expect(applyLayoutOps(two, [op({ op: 'item-remove', at: 1, item: 0 })], []).refused[0]).toMatch(/al menos 2/);
    expect(applyLayoutOps(steps, [op({ op: 'item-add', at: 0, item: -1, value: 'x' })], []).refused[0]).toMatch(/no tiene puntos/);
  });
  it('reads the item ops and offers them in the schema', () => {
    expect(readLayoutEdit({ ops: [op({ op: 'item-add', at: 1, item: -1, value: 'x' })], store: [], rest: '' })!.ops).toHaveLength(1);
    expect(JSON.stringify(layoutEditSchema())).toContain('item-add');
  });
});
```

(`op()` is the spec file's existing helper; check its defaults supply `to: -1`, `type: ''`, `field: ''`.) `story-list` needs `items: [2, 4]`.

- [ ] Step 2: run `npx jest src/storefront-source/source-layout-edit.spec.ts -t "items inside"` → FAIL.
- [ ] Step 3: implement. Add the three ops to `LayoutOp['op']`, the schema enum, and the `readLayoutEdit` filter list. In `applyLayoutOps`, before the «Words first» loop:

```ts
  // Items inside a section (spec 2026-11-05 creates anything): added, removed and moved first, so later text/photo ops use the
  // numbers after them. The section type's needs.items is the limit.
  for (const op of ops.filter(entry => entry.op === 'item-add' || entry.op === 'item-remove' || entry.op === 'item-move')) {
    if (!known(op.at)) continue;
    const block = blocks[op.at];
    const limits = LIBRARY_CATALOG.find(section => section.id === block.type)?.needs.items;
    if (!limits) { refused.push(`${upper(placeOf(layout[op.at]))} no tiene puntos para agregar ni quitar.`); continue; }
    const items = block.items ?? (block.items = []);
    if (op.op === 'item-add') {
      const title = clip(op.value, ITEM_CAP.title);
      if (!title) continue;
      if (items.length >= limits[1]) { refused.push(`Los puntos de ${placeOf(layout[op.at])} ya son ${limits[1]}, el máximo de esa sección: quita uno o cambia uno de los que hay.`); continue; }
      const at = Number.isInteger(op.item) && op.item >= 0 && op.item <= items.length ? op.item : items.length;
      items.splice(at, 0, { title });
      done.push(`agregué el punto «${title}» a ${placeOf(layout[op.at])}`);
    } else if (op.op === 'item-remove') {
      const item = items[op.item];
      if (!item) continue;
      if (items.length <= limits[0]) { refused.push(`${upper(placeOf(layout[op.at]))} necesita al menos ${limits[0]} puntos: cambia uno en vez de quitarlo.`); continue; }
      items.splice(op.item, 1);
      done.push(`quité el punto «${item.title}» de ${placeOf(layout[op.at])}`);
    } else {
      const item = items[op.item];
      if (!item || !Number.isInteger(op.to) || op.to < 0 || op.to >= items.length || op.to === op.item) continue;
      items.splice(op.item, 1); items.splice(op.to, 0, item);
      done.push(`moví el punto «${item.title}» de ${placeOf(layout[op.at])}`);
    }
  }
```

Prompt (append to the ops list in `LAYOUT_EDIT_PROMPT`):

```
- item-add: agrega un punto (un paso, una tarjeta, una pregunta, una reseña…) a la sección at. item = el lugar donde va (0 = primero;
  -1 = al final); value = su title. Su text y su foto van después como ops text / photo con item = ese mismo número. Solo con las
  palabras del comercio o datos de «tienda»; si faltan, no lo agregues y pregunta con «ask» («¿Qué dice el nuevo paso?»).
- item-remove: quita el punto item de la sección at. item-move: pone el punto item en el lugar to.
```

- [ ] Step 4: run the whole `source-layout-edit.spec.ts` → PASS. Commit `feat(yapi): add, remove and move the items inside a section (spec 2026-11-05 creates anything)`.

### Task 2: Extra pages — data, slug, page file (pure)

**Files:** Create `apps/api/src/storefront-source/source-extra-pages.ts` + `.spec.ts`; Modify `source-templates.ts:113-191` (store-data writer/reader), `source-master.ts:22` (`MasterFill.extraPages`), `source-templates.service.ts:385` (bundle photos).

**Interfaces:** Produces
- `type ExtraPage = { slug: string; name: string; menu: string; layout: LayoutBlock[] }`
- `EXTRA_PAGE_LIMIT = 6`, `EXTRA_PAGE_MARK = '// @pagosya-extra-page'`
- `extraPageSlug(name: string, files: ReadonlyArray<{ path: string }>, pages: readonly ExtraPage[]): string | null`
- `extraPageFile(page: ExtraPage): { path: string; content: string }`
- `withExtraPages<T extends { path: string; content: string }>(files: T[], pages: readonly ExtraPage[]): T[]` (writes each page's file, deletes marked files of pages no longer listed, never touches unmarked files)
- `readMasterState(files).extraPages: ExtraPage[]`; `MasterFill.extraPages?: ExtraPage[]`; store-data line `export const extraPages: any[] = [...]`.

- [ ] Step 1: failing tests:

```ts
import { extraPageFile, extraPageSlug, withExtraPages, EXTRA_PAGE_MARK } from './source-extra-pages';
const files = [{ path: 'components/pages/about.tsx', content: '' }, { path: 'components/catalog/productos.tsx', content: '' }, { path: 'components/pages/mi-pagina.tsx', content: 'export default function X() {}' }];
it('makes a slug from the name, never an existing page', () => {
  expect(extraPageSlug('Novias & Noche', files, [])).toBe('novias-noche');
  expect(extraPageSlug('Productos', files, [])).toBe('productos-2');
  expect(extraPageSlug('Nosotros', files, [])).toBe('nosotros-2');
  expect(extraPageSlug('Mi página', files, [])).toBe('mi-pagina-2');
  expect(extraPageSlug('¡!', files, [])).toBeNull();
});
it('writes one marked file per page and removes only its own', () => {
  const page = { slug: 'novias', name: 'Novias', menu: '', layout: [] };
  const out = withExtraPages([...files, { path: 'components/pages/viejo.tsx', content: `${EXTRA_PAGE_MARK}\n` }], [page]);
  expect(out.find(f => f.path === 'components/pages/novias.tsx')!.content).toContain('data-lb-page="novias"');
  expect(out.some(f => f.path === 'components/pages/viejo.tsx')).toBe(false);
  expect(out.find(f => f.path === 'components/pages/mi-pagina.tsx')!.content).toBe('export default function X() {}');
  expect(extraPageFile(page).content.startsWith(EXTRA_PAGE_MARK)).toBe(true);
});
it('store-data carries extraPages', () => {
  const file = templateStoreDataFile({ name: 'x' }, {}, { copy: {} as never, look: { palette: 'mono', fonts: 'zancada' } as never, extraPages: [{ slug: 'novias', name: 'Novias', menu: '', layout: [] }] } as never);
  expect(readMasterState([file]).extraPages).toEqual([{ slug: 'novias', name: 'Novias', menu: '', layout: [] }]);
});
```

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement `source-extra-pages.ts`:

```ts
import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { LayoutBlock } from './source-section-library';

/** Spec 2026-11-05 (owner: «yapi … create anything inside the store»): pages the merchant asks for beyond the four menu pages. */
export type ExtraPage = { slug: string; name: string; menu: string; layout: LayoutBlock[] };
export const EXTRA_PAGE_LIMIT = 6;
export const EXTRA_PAGE_MARK = '// @pagosya-extra-page';
const RESERVED = new Set(['index', 'producto', 'productos', 'coleccion', 'checkout', 'buscar', 'nosotros', 'contacto', 'faq', 'envios',
  ...STOREFRONT_PAGES.map(page => page.url.replace(/\.html$/, ''))]);

export function extraPageSlug(name: string, files: ReadonlyArray<{ path: string }>, pages: readonly ExtraPage[]): string | null {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 36).replace(/-+$/, '');
  if (!base) return null;
  const taken = (slug: string) => RESERVED.has(slug) || pages.some(page => page.slug === slug)
    || files.some(file => new RegExp(`^components/[a-z]+/${slug}\\.tsx$`).test(file.path) || file.path === `${slug}.html`);
  for (let n = 1; n < 50; n++) { const slug = n === 1 ? base : `${base}-${n}`; if (!taken(slug)) return slug; }
  return null;
}

export function extraPageFile(page: ExtraPage): { path: string; content: string } {
  return { path: `components/pages/${page.slug}.tsx`, content: `${EXTRA_PAGE_MARK}\nimport Shell from '../Shell';\nimport { Container, Display } from '@pagosya/ui';\n`
    + `import { LibraryHome, type LibraryBlock } from '../library';\nimport { extraPages } from '../store-data';\n`
    + `export default function ExtraPage() {\n  const page = (extraPages as Array<{ slug: string; name: string; layout: LibraryBlock[] }>).find(entry => entry.slug === ${JSON.stringify(page.slug)});\n`
    + `  const layout = page?.layout ?? [];\n  const covered = /^(cover-|hero-split$)/.test(String(layout[0]?.type ?? ''));\n`
    + `  return <Shell><main id="contenido" data-lb-home data-lb-page=${JSON.stringify(page.slug)} style={{ overflowX: 'clip' }}>`
    + `{covered ? null : <Container><Display>{page?.name ?? ''}</Display></Container>}<LibraryHome layout={layout} /></main></Shell>;\n}\n` };
}

export function withExtraPages<T extends { path: string; content: string }>(files: T[], pages: readonly ExtraPage[]): T[] {
  const wanted = new Map(pages.map(page => { const file = extraPageFile(page); return [file.path, file.content] as const; }));
  const kept = files.filter(file => !(file.content.startsWith(EXTRA_PAGE_MARK) && !wanted.has(file.path)));
  const out = kept.map(file => wanted.has(file.path) && (file.content.startsWith(EXTRA_PAGE_MARK)) ? { ...file, content: wanted.get(file.path)! } : file);
  for (const [path, content] of wanted) if (!out.some(file => file.path === path)) out.push({ path, content } as T);
  return out;
}
```

Note: `Display` puts an `<h1>`; `LibraryHome`'s sections stay the only `[data-lb]` children of `main` (the `Container` is not `[data-lb]`), so point-at numbering holds.

Store-data: in `templateStoreDataFile` add after the `pageLayouts` line ``+ `export const extraPages: any[] = ${JSON.stringify(master.extraPages ?? [])};\n` `` (add `extraPages?` to the `master` param type); in the reader add `extraPages: (dataLine(content, 'extraPages') ?? []) as ExtraPage[]`; in the refill writer (`source-templates.ts:410`) pass `extraPages: change.extraPages ?? state.extraPages ?? []`; `MasterFill` gains `extraPages?: ExtraPage[]`; in `source-templates.service.ts` after the `pageLayouts` bundling:

```ts
    if (change.extraPages) out.extraPages = await Promise.all(change.extraPages.map(async page => ({ ...page, layout: await bundled(page.layout) as LayoutBlock[] })));
```

- [ ] Step 4: run the new spec + `source-templates.spec.ts` (if present) → PASS. Commit `feat(yapi): extra pages in store-data, their address and their marked page file (spec 2026-11-05 creates anything)`.

### Task 3: Menu links for extra pages (kit + server)

**Files:** Modify `packages/storefront-kit/commerce-src/header/store-menu.js`, rebuild `packages/storefront-kit/kit/commerce.js` (`node tools/build-commerce.mjs` in `packages/storefront-kit`), test in `packages/storefront-kit/tools/build-commerce.test.mjs` (or a new `commerce-src/header/store-menu.test.mjs` run by `node --test`); Modify `apps/api/src/storefront-source/source-store-menu.ts` + spec.

**Interfaces:** Produces `StoreMenuGroup.direct?: true`; target `extra:<slug>`; `withExtraPageLinks(menu: StoreMenu | undefined, pages: readonly ExtraPage[]): { menu: StoreMenu; refused: string[] }`; `storeMenuContext` adds `extra:<slug>` targets from store-data's `extraPages`.

- [ ] Step 1: failing tests.
  Server (`source-store-menu.spec.ts`):

```ts
import { withExtraPageLinks } from './source-store-menu';
const novias = { slug: 'novias', name: 'Novias', menu: '', layout: [] };
it('puts an extra page in the bar, inside a named dropdown, and drops links of removed pages', () => {
  const menu = { style: 'dropdowns' as const, groups: [{ label: 'Colecciones', links: [{ to: 'all' }] }] };
  expect(withExtraPageLinks(menu, [novias]).menu.groups!.at(-1)).toEqual({ label: 'Novias', links: [{ label: 'Novias', to: 'extra:novias' }], direct: true });
  expect(withExtraPageLinks(menu, [{ ...novias, menu: 'Colecciones' }]).menu.groups![0].links).toContainEqual({ label: 'Novias', to: 'extra:novias' });
  const linked = withExtraPageLinks(menu, [novias]).menu;
  expect(withExtraPageLinks(linked, []).menu.groups!.some(group => group.links.some(link => link.to.startsWith('extra:')))).toBe(false);
  expect(withExtraPageLinks(undefined, [novias]).menu).toEqual({ style: 'dropdowns', groups: [{ label: 'Novias', links: [{ label: 'Novias', to: 'extra:novias' }], direct: true }] });
});
it('refuses a fifth group', () => {
  const full = { style: 'dropdowns' as const, groups: ['a', 'b', 'c', 'd'].map(label => ({ label, links: [{ to: 'all' }] })) };
  expect(withExtraPageLinks(full, [novias]).refused[0]).toMatch(/menú ya tiene 4/);
});
```

  Kit: a store-menu test in jsdom-free node style is heavy; instead add to `tools/build-commerce.test.mjs` string assertions on the built `kit/commerce.js`: it contains `value.startsWith('extra:')` and `group.direct`. (The behaviour is checked live in Task 7.)

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement.
  Kit `storeMenuTarget` (next to `page:`):

```js
    // Extra pages (spec 2026-11-05 creates anything): the store's own pages made by YAPI, <slug>.html.
    if (value.startsWith('extra:') && /^[a-z][a-z0-9-]{0,39}$/.test(value.slice(6))) return { href: pageHref(value.slice(6) + '.html'), label: '' };
```

  `resolveStoreMenuGroups` keeps `direct: group.direct === true` on each resolved group. `renderStoreMenu`: after `let groups = …`:

```js
    // Only direct page links: the kit's own menu stays, the links follow it.
    if (groups.length && groups.every(group => group.direct)) groups = [...resolveStoreMenuGroups(defaultStoreMenuGroups(host)), ...groups];
```

  and in the `linksMount` markup a direct one-link group is a plain link:

```js
    if (linksMount) linksMount.innerHTML = groups.map((group, index) => group.direct && group.links.length === 1
      ? `<a class="pym-top" href="${escape(group.links[0].href)}">${escape(group.label)}</a>`
      : `<button type="button" class="pym-top" data-store-menu-top="${index}" aria-expanded="false" aria-controls="${id}">${escape(group.label)}</button>`).join('');
```

  Rebuild `kit/commerce.js` with the kit's build script.
  Server `source-store-menu.ts`: `StoreMenuGroup` gains `direct?: true`; `checkStoreMenu` keeps `direct: true` when the input group has it and exactly one link; `storeMenuContext` reads extra pages:

```ts
  const data = files.find(file => file.path === 'components/store-data.tsx')?.content ?? '';
  const extra = /export const extraPages: any\[\] = (\[.*\]);/.exec(data)?.[1];
  for (const page of (extra ? JSON.parse(extra) : []) as Array<{ slug?: unknown; name?: unknown }>)
    if (typeof page.slug === 'string' && typeof page.name === 'string') targets.set(`extra:${page.slug}`, page.name);
```

  and

```ts
/** Spec 2026-11-05 creates anything: the menu follows the extra pages — each linked where it says (bar or a named dropdown), links
 *  of pages no longer there removed. A store without a menu gets one (the kit adds its own entries before direct links). */
export function withExtraPageLinks(menu: StoreMenu | undefined, pages: readonly ExtraPage[]): { menu: StoreMenu; refused: string[] } {
  const refused: string[] = [];
  const slugs = new Set(pages.map(page => page.slug));
  let groups = (menu?.groups ?? []).map(group => ({ ...group, links: group.links.filter(link => !link.to.startsWith('extra:') || slugs.has(link.to.slice(6))) }))
    .filter(group => group.links.length && !(group.direct && !group.links.some(link => link.to.startsWith('extra:'))));
  groups = groups.filter(group => !group.direct || pages.some(page => page.menu === '' && group.links[0].to === `extra:${page.slug}`));
  for (const page of pages) {
    const to = `extra:${page.slug}`, link = { label: page.name.slice(0, STORE_MENU_LIMITS.label), to };
    const inGroup = page.menu ? groups.find(group => !group.direct && group.label.toLowerCase() === page.menu.toLowerCase()) : undefined;
    groups = groups.map(group => ({ ...group, links: group.links.filter(entry => entry.to !== to || (inGroup ? group === inGroup : group.direct)) }));
    if (inGroup) {
      if (!inGroup.links.some(entry => entry.to === to)) { if (inGroup.links.length >= STORE_MENU_LIMITS.links) refused.push(`«${inGroup.label}» ya tiene ${STORE_MENU_LIMITS.links} enlaces: no puse «${page.name}» ahí.`); else inGroup.links.push(link); }
      else inGroup.links = inGroup.links.map(entry => entry.to === to ? link : entry);
      continue;
    }
    const direct = groups.find(group => group.direct && group.links[0]?.to === to);
    if (direct) { direct.label = link.label; direct.links = [link]; continue; }
    if (groups.length >= STORE_MENU_LIMITS.groups) { refused.push(`Tu menú ya tiene ${STORE_MENU_LIMITS.groups} entradas: no puse «${page.name}» en la barra. Pídeme ponerla dentro de un desplegable.`); continue; }
    groups.push({ label: link.label, links: [link], direct: true });
  }
  return { menu: { style: menu?.style ?? 'dropdowns', groups }, refused };
}
```

  (`page.menu` naming a group that does not exist → the bar.)
- [ ] Step 4: run the kit test (`cd packages/storefront-kit && npm test`) and `source-store-menu.spec.ts` → PASS. Commit `feat(yapi): extra pages in the store menu — extra: links, a bar link or a dropdown (spec 2026-11-05 creates anything)`.

### Task 4: Page ops (pure)

**Files:** Modify `source-extra-pages.ts` + spec; Modify `source-layout-edit.ts` (op kinds, schema with slugs, `LayoutPage` widened, reader, prompt, `applyLayoutOps` page name).

**Interfaces:** Produces `LayoutOp.op` += `'page-add' | 'page-rename' | 'page-remove' | 'page-link'`; `LayoutPage = 'home' | 'product' | MenuPage | string`; `layoutEditSchema(extraSlugs: readonly string[] = [])` (page enum += slugs + `'nueva'`); `applyPageOps(pages: readonly ExtraPage[], ops: readonly LayoutOp[], files: ReadonlyArray<{ path: string }>, menuGroups: readonly string[]): { pages: ExtraPage[]; ops: LayoutOp[] /* «nueva» rewritten to the new slug */; done: string[]; refused: string[]; created?: string }`; `applyLayoutOps` options gain `pageName?: string` (reply «de la página «Novias»»).

- [ ] Step 1: failing tests:

```ts
import { applyPageOps } from './source-extra-pages';
const pageOp = (over: Partial<LayoutOp>) => ({ op: 'page-add', at: -1, field: '', item: -1, value: '', to: -1, type: '', page: 'home', ...over }) as LayoutOp;
it('adds a page and points «nueva» ops at it', () => {
  const out = applyPageOps([], [pageOp({ value: 'Novias', field: 'Colecciones' }), pageOp({ op: 'add', type: 'cover-split', page: 'nueva' })], [], ['Colecciones']);
  expect(out.pages).toEqual([{ slug: 'novias', name: 'Novias', menu: 'Colecciones', layout: [] }]);
  expect(out.ops[1].page).toBe('novias');
  expect(out.created).toBe('novias');
  expect(out.done[0]).toContain('creé la página «Novias»');
});
it('renames, relinks and removes; refuses unknown pages, the seventh page and menu pages', () => {
  const pages = [{ slug: 'novias', name: 'Novias', menu: '', layout: [] }];
  expect(applyPageOps(pages, [pageOp({ op: 'page-rename', page: 'novias', value: 'Novias 2027' })], [], []).pages[0].name).toBe('Novias 2027');
  expect(applyPageOps(pages, [pageOp({ op: 'page-link', page: 'novias', field: 'Colecciones' })], [], ['Colecciones']).pages[0].menu).toBe('Colecciones');
  expect(applyPageOps(pages, [pageOp({ op: 'page-remove', page: 'novias' })], [], []).pages).toEqual([]);
  expect(applyPageOps(pages, [pageOp({ op: 'page-remove', page: 'about' })], [], []).refused[0]).toMatch(/no es una página que yo haya creado/);
  const six = Array.from({ length: 6 }, (_, n) => ({ slug: `p${n}`, name: `P${n}`, menu: '', layout: [] }));
  expect(applyPageOps(six, [pageOp({ value: 'Otra' })], [], []).refused[0]).toMatch(/ya tiene 6 páginas/);
});
```

Schema test in `source-layout-edit.spec.ts`: `expect(JSON.stringify(layoutEditSchema(['novias']))).toContain('"novias"')` and contains `"nueva"` and `page-add`.

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement `applyPageOps` in `source-extra-pages.ts`:

```ts
export function applyPageOps(current: readonly ExtraPage[], ops: readonly LayoutOp[], files: ReadonlyArray<{ path: string }>, menuGroups: readonly string[]) {
  let pages = current.map(page => ({ ...page }));
  const done: string[] = [], refused: string[] = [];
  let created: string | undefined;
  const place = (field: string) => menuGroups.find(group => group.toLowerCase() === field.trim().toLowerCase()) ?? '';
  for (const op of ops) {
    if (op.op === 'page-add') {
      const name = op.value.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name || created) continue;
      if (pages.length >= EXTRA_PAGE_LIMIT) { refused.push(`Tu tienda ya tiene ${EXTRA_PAGE_LIMIT} páginas extra: quita una antes de crear «${name}».`); continue; }
      const slug = extraPageSlug(name, files, pages);
      if (!slug) { refused.push(`No pude crear una página con el nombre «${name}»: dime otro nombre.`); continue; }
      pages.push({ slug, name, menu: place(op.field), layout: [] });
      created = slug;
      done.push(`creé la página «${name}» (${slug}.html)${place(op.field) ? ` dentro de «${place(op.field)}»` : ' en el menú'}`);
      continue;
    }
    if (op.op !== 'page-rename' && op.op !== 'page-remove' && op.op !== 'page-link') continue;
    const page = pages.find(entry => entry.slug === op.page);
    if (!page) { refused.push('Esa no es una página que yo haya creado: las páginas del menú (Nosotros, Contacto…) se cambian, no se quitan.'); continue; }
    if (op.op === 'page-rename') { const name = op.value.replace(/\s+/g, ' ').trim().slice(0, 40); if (name && name !== page.name) { done.push(`la página «${page.name}» ahora se llama «${name}»`); page.name = name; } }
    if (op.op === 'page-link') { page.menu = place(op.field); done.push(page.menu ? `puse «${page.name}» dentro de «${page.menu}»` : `puse «${page.name}» en la barra del menú`); }
    if (op.op === 'page-remove') { pages = pages.filter(entry => entry !== page); done.push(`quité la página «${page.name}» y su enlace del menú`); }
  }
  const rewritten = ops.map(op => op.page === 'nueva' ? (created ? { ...op, page: created } : null) : op).filter((op): op is LayoutOp => Boolean(op));
  return { pages, ops: rewritten, done, refused, ...(created ? { created } : {}) };
}
```

In `source-layout-edit.ts`: widen `LayoutOp.op` and `LayoutPage`; `layoutEditSchema(extraSlugs: readonly string[] = [])` with `page: { enum: ['home', 'product', ...MENU_PAGES, ...extraSlugs, 'nueva'] }` and the op enum including the four page ops; `readLayoutEdit` keeps `page` when it is `product`, a menu page, `nueva`, or matches `^[a-z][a-z0-9-]{0,39}$`; `applyLayoutOps` `where` uses `options.pageName` (` de la página «${options.pageName}»`) for any other page. Prompt (append):

```
Páginas nuevas: «paginas» trae también las páginas que el comercio te pidió (por su dirección, con su «nombre»). «Crea una página
Novias», «agrega una pestaña Lookbook»: op page-add con value = el nombre y field = "" (va en la barra del menú) o el nombre de un
desplegable que el comercio nombró; en el mismo pedido llénala con ops add con page = "nueva": primero una portada, luego de 2 a 5
secciones de «nuevas_paginas» que muestren lo que el comercio quiere (si el nombre es una categoría, secciones con sus productos).
page-rename (page = la dirección, value = el nombre nuevo), page-link (page, field = "" o el desplegable), page-remove (page). Los
cambios de una página nueva llevan page = su dirección. Nunca uses page-* con la portada, la ficha ni Nosotros/Contacto/Preguntas/Envíos.
```

- [ ] Step 4: run `source-extra-pages.spec.ts` + `source-layout-edit.spec.ts` → PASS. Commit `feat(yapi): page ops — create, rename, relink and remove a page (spec 2026-11-05 creates anything)`.

### Task 5: Wire into the quick edit and the save

**Files:** Modify `source-chat.service.ts` (`templateLayoutEdit` 1108-1260), `source-conversation.service.ts` (`editLayout` body/schema), `source-layout-edit.ts` (`menuPagesFor`), `source-visible-change.ts`, `source-content-pages.ts` (`keptMenuPages`); Test `source-chat-store-edit.spec.ts`, `source-visible-change.spec.ts`, `source-content-pages.spec.ts`, `source-conversation-point.spec.ts`.

**Interfaces:** Consumes Tasks 1-4. `editLayout` input gains `extraPages?: Array<{ slug: string; nombre: string; layout: LayoutBlock[] }>`; `menuPagesFor(pages, request, currentPage, extra?: readonly ExtraPage[])` offers `nuevas_paginas` also for «crea/agrega una página|pestaña» and an open `<slug>.html`; `keptMenuPages` returns `extraPages` too.

- [ ] Step 1: failing tests in `source-chat-store-edit.spec.ts` (its `files` get `components/library.tsx` and `config.js` with `window.PAGOSYA_CONFIG = {"header":{"menu":{"style":"dropdowns","groups":[{"label":"Colecciones","links":[{"to":"all"}]}]}}}` — use the existing config fixture shape in that spec or `patchConfigFile`):

```ts
it('creates a page with its sections and its menu link in one revision', async () => {
  const composeLibrary = jest.fn().mockResolvedValue([{ type: 'cover-split', title: 'Novias' }]);
  (chat as any).dialogue.composeLibrary = composeLibrary;
  jest.spyOn(chat as any, 'libraryFacts').mockResolvedValue({ photos: [], products: [], categories: [], request: '' });
  editLayout.mockResolvedValue(read({ ops: [{ op: 'page-add', at: -1, field: '', item: -1, value: 'Novias', to: -1, type: '', page: 'home' },
    { op: 'add', at: -1, field: '', item: -1, value: 'portada', to: -1, type: 'cover-split', page: 'nueva' }] }));
  const out = await edit('crea una página Novias');
  const fill = refill.mock.calls[0][3];
  expect(fill.extraPages).toEqual([expect.objectContaining({ slug: 'novias', name: 'Novias', menu: '', layout: [expect.objectContaining({ type: 'cover-split' })] })]);
  const written = refill.mock.calls[0][5].files([...files, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' }]);
  expect(written.some((f: { path: string }) => f.path === 'components/pages/novias.tsx')).toBe(true);
  expect(written.find((f: { path: string }) => f.path === 'config.js').content).toContain('extra:novias');
  expect(out.assistantMessage.content).toContain('creé la página «Novias»');
});
it('adds a step on an extra page and removes the page', async () => { /* files with extraPages [{ slug: 'novias', …, layout: [cover, story-list with 3 items] }];
  op item-add page 'novias' → fill.extraPages[0].layout[1].items length 4; then page-remove → fill.extraPages = [] and the files fn drops components/pages/novias.tsx and the extra:novias link */ });
```

(Write the second test fully with the same fixture style as the first: build the store-data with `templateStoreDataFile(..., { …, extraPages: [...] })`.) In `source-visible-change.spec.ts`: a changed `extraPages` → `['pages']`. In `source-content-pages.spec.ts`: `keptMenuPages(files, pageLayouts, extraPages)` returns them with their bundled photos. In `source-conversation-point.spec.ts`: `editLayout` with `extraPages` puts them in `paginas` under their slug with `nombre`, and the schema sent lists the slug.

- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement in `templateLayoutEdit`, after reading `pages`:

```ts
    // Spec 2026-11-05 creates anything: the pages YAPI made, and the store menu's dropdown names (for page-link / page-add places).
    const extraPages = (readMasterState(files).extraPages ?? []) as ExtraPage[];
    const menuGroups = (readStoreMenu(files)?.groups ?? []).filter(group => !group.direct).map(group => group.label);
```

  pass `extraPages: extraPages.map(page => ({ slug: page.slug, nombre: page.name, layout: page.layout }))` to `editLayout` (which adds them to `paginas` as `{ nombre, secciones: layoutDigest(layout) }` under the slug and calls `layoutEditSchema(extraPages.map(p => p.slug))`). After `read`:

```ts
    const paged = applyPageOps(extraPages, read.ops, files, menuGroups);
    const ops = paged.ops;   // use `ops` instead of read.ops from here on (home, product, menu pages, extra pages)
    const extra: ExtraPage[] = [];
    for (const page of paged.pages) {
      if (!ops.some(op => op.page === page.slug)) { extra.push(page); continue; }
      const adds = await compose(page.slug as LayoutPage, page.layout);
      const result = applyLayoutOps(page.layout, ops, adds.added, { page: page.slug as LayoutPage, pageName: page.name, photos });
      extra.push({ ...page, layout: result.layout.slice(0, MAX_PAGE_SECTIONS) });
      pageDone.push(...result.done); pageRefused.push(...result.refused, ...adds.refusedAdds);
    }
    const extraChanged = JSON.stringify(extra) !== JSON.stringify(extraPages);
```

  `compose` gets `where = la página «${name}»` for extra pages, and when the page's name matches a category (`facts.categories`, accent/case-insensitive) its request text adds `Es la página de la categoría «X»: muestra sus productos y un botón «Ver todo» a esa categoría (link category:X).`. Merge `paged.done/refused` and `pageDone/pageRefused` into `done`/`refused`. `filesChange` gains `...(extraChanged ? { extraPages: extra } : {})`; the refill `files` function composes `withExtraPages(list, extra)` and, when `extraChanged`, `withStoreMenuConfig(list, list, withExtraPageLinks(readStoreMenu(list), extra).menu)` (its `refused` go to `refused`). Label `'Cambios de YAPI'` when `extraChanged`. Log `extraPages: extra.map(p => p.slug)`.
  `menuPagesFor`: extra pages with sections always ride; `offer` also when `/\b(crea|agrega|nueva|hazme)\b[^.]{0,30}\b(p[aá]gina|pesta[ñn]a)\b/i` matches or `open` is an extra page's `<slug>.html`.
  `visibleChanges`: `if (!same(was.extraPages, now.extraPages)) out.add('pages');` and include their blocks in `pageBlocks`.
  `keptMenuPages(files, pageLayouts, extraPages?)`: keep `extraPages` with layout (and photos via `BUNDLED_IN` over them); the template-switch caller passes them into the refill (`extraPages`) with `withExtraPages` + `withExtraPageLinks` in its files function.
- [ ] Step 4: run `source-chat-store-edit.spec.ts source-chat-master.spec.ts source-visible-change.spec.ts source-content-pages.spec.ts source-conversation-point.spec.ts source-extra-pages.spec.ts` → PASS; `npx tsc --noEmit --incremental false -p tsconfig.json` clean. Commit `feat(yapi): the quick edit creates, fills, links and removes extra pages in one revision (spec 2026-11-05 creates anything)`.

### Task 6: Point at sections on extra pages

**Files:** `packages/storefront-preview/src/source-preview-edit-mode.js` (`PAGES` check), `source-preview.ts` (`POINT_PAGES` checks → `validPage(page)`: a known page or `^[a-z][a-z0-9-]{0,39}$`), `apps/api/src/storefront-source/dto/source-selection.dto.ts` (`page` → `@Matches(/^(home|product|about|contact|faq|shipping|[a-z][a-z0-9-]{0,39})$/)`), `source-chat.service.ts` (`focusPage` → `<slug>.html` for an extra slug); tests in the preview selection test, the DTO spec, `source-chat-store-edit.spec.ts`.

- [ ] Step 1: failing tests: preview — a `<div data-lb-home data-lb-page="novias">` section click posts `page: 'novias'`; receiver keeps `page: 'novias'`, drops `page: 'No Vale'`; DTO accepts `page: 'novias'`, refuses `page: '../x'`; chat — selection `{ sectionId: 'lb-0', at: 0, page: 'novias' }` gives `focus.pagina === 'novias'`.
- [ ] Step 2: run → FAIL. Step 3: implement (script: `if ((PAGES.indexOf(page) < 0 && !/^[a-z][a-z0-9-]{0,39}$/.test(page)) || at < 0 || at > 40) return null;`; same rule in the receivers and DTO). Step 4: preview package, Studio tsc, DTO + chat specs → PASS. Commit `feat(yapi): point at sections on the pages YAPI made (spec 2026-11-05 creates anything)`.

### Task 7: Live check

- [ ] Rebuild the Studio (`pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded`). No YAPI job running before API saves.
- [ ] On NOA nvkv5rvk (Symmetry) via `examples/full-stores-2026-11-02/send-point.cjs`, and one in the real Studio:
  1. Point at the steps section (`lb-9`) → «agrega un paso aquí: Entrega — Recoges tu vestido en el atelier después de la última prueba.» → a 4th step.
  2. «quita el tercer paso» → removed. 3. «crea una página Novias» → `novias.html`, cover + sections with bridal dresses, link in the bar. 4. «ponla dentro de Colecciones» (or an existing dropdown's name). 5. Open `novias.html` → «agrega una pregunta aquí: ¿Cuánto tarda un vestido? 10 a 14 semanas.» 6. «quita la página Novias» → page and link gone.
- [ ] Each: reply «Listo…», only that part changed (`layout.cjs` / the revision's files), seconds. Notes in the ledger; failures reported as they are.
