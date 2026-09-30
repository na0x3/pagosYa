# Store page architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a store's source place page files in `components/pages|catalog|auth|account/` and have each become a route, without touching any real store.

**Architecture:** One pure route rule (`standardPageRoute`) in `source-next.ts`, consumed by the existing `nextContentPages`, so the scaffold, compiler and validators pick the new pages up unchanged. The kit gets one generic placeholder so the mechanism is tested end to end against all 61 templates. No page file is added to any real store.

**Tech Stack:** TypeScript (NestJS API, jest), `@pagosya/storefront-kit` (`ui.tsx`), `@pagosya/store-templates` (node:test).

**Spec:** `docs/superpowers/specs/2026-09-30-store-page-architecture-design.md` (program: `2026-09-30-complete-store-pages-program.md`)

## Global Constraints

- Existing stores keep working: `components/page-SLUG.tsx` → `SLUG.html` is unchanged.
- Only files directly inside `components/pages/`, `components/catalog/`, `components/auth/`, `components/account/` become routes; slug of the file is `[a-z][a-z0-9-]{0,47}`.
- Two files that produce the same `.html` fail with `BadGatewayException` naming both files.
- No page file is added to a real store, and no `Shell.tsx` is edited, in this plan.
- Spanish URL slugs are the table in Task 2; unknown files in a group use `<prefix><file>` (`acceso-`, `cuenta-`, or none).
- Work on branch `feature/store-page-architecture`. The working tree already holds uncommitted Ajustes/Dominio changes in `apps/merchant-studio/src`; **never `git add -A` or `git add .`** — commit only the paths named in each task.
- Commands run from `/Users/saramia/pagosYa`. API tests: `cd apps/api && npx jest <file>`. Never run prisma commands.

## Review Focus

- A file in a group folder with an odd name (`Faq.tsx`, `-x.tsx`, `faq/deep.tsx`) is silently not a route, never a crash — pinned in Task 2.
- Two files claiming the same URL (`page-faq.tsx` + `pages/faq.tsx`, or `pages/checkout.tsx` vs `checkout.tsx`) fail with a message naming both — Task 2.
- A merchant-added file in a group (`account/wishlist.tsx`) still routes with its prefix — Task 2.
- `not-found` becomes `404.html` and the scaffold writes `pages/404.tsx` (Next's special page) — Task 4.
- A store with none of the new folders yields exactly the same route list as before — Task 2.

---

### Task 1: Branch and spec commit

**Files:**
- Commit: `docs/superpowers/specs/2026-09-30-complete-store-pages-program.md`, `docs/superpowers/specs/2026-09-30-store-page-architecture-design.md`, `docs/superpowers/plans/2026-09-30-store-page-architecture.md`

- [ ] **Step 1: Create the branch (carries the uncommitted Ajustes changes, which stay unstaged)**

```bash
git switch -c feature/store-page-architecture
git status --short
```
Expected: branch created; `M apps/merchant-studio/src/...` files still listed, not staged.

- [ ] **Step 2: Commit only the three docs**

```bash
git add docs/superpowers/specs/2026-09-30-complete-store-pages-program.md docs/superpowers/specs/2026-09-30-store-page-architecture-design.md docs/superpowers/plans/2026-09-30-store-page-architecture.md
git commit -m "docs: complete store pages program, page architecture spec and plan"
```

---

### Task 2: Route rule for grouped pages

**Files:**
- Modify: `apps/api/src/storefront-source/source-next.ts:21-29`
- Create: `apps/api/src/storefront-source/source-next-pages.spec.ts`

**Interfaces:**
- Produces: `standardPageRoute(path: string): { name: string; path: string } | null` (exported) — `name` is `group/file` (used as `components/${name}`), `path` is the `.html` URL. `nextContentPages` keeps its signature and now also returns grouped pages, in `files` order, after the `page-*` ones.

- [ ] **Step 1: Write the failing test**

```ts
import { nextContentPages, standardPageRoute } from './source-next';
import { nextStoreFiles } from './fixtures/next-store';

const file = (path: string) => ({ path, content: 'export default function P() { return null; }' });
const base = () => nextStoreFiles();
const commerce = ['index.html', 'product.html', 'checkout.html'];

describe('standard page routes', () => {
  it('gives a store with none of the new folders the same routes as before, old page-SLUG form included', () => {
    expect(nextContentPages(base()).map(p => p.path)).toEqual(commerce);
    expect(nextContentPages([...base(), file('components/page-nosotros.tsx')]).map(p => p.path)).toEqual([...commerce, 'nosotros.html']);
  });

  it('routes each group folder to its Spanish slug, in file order', () => {
    const pages = nextContentPages([...base(), file('components/pages/faq.tsx'), file('components/pages/shipping.tsx'), file('components/pages/not-found.tsx'),
      file('components/catalog/collections.tsx'), file('components/auth/login.tsx'), file('components/account/orders.tsx')]);
    expect(pages.slice(3)).toEqual([
      { name: 'pages/faq', path: 'faq.html' }, { name: 'pages/shipping', path: 'envios.html' }, { name: 'pages/not-found', path: '404.html' },
      { name: 'catalog/collections', path: 'colecciones.html' }, { name: 'auth/login', path: 'acceso-ingresar.html' }, { name: 'account/orders', path: 'cuenta-pedidos.html' },
    ]);
  });

  it('routes a file the table does not know with its group prefix', () => {
    expect(standardPageRoute('components/account/wishlist.tsx')).toEqual({ name: 'account/wishlist', path: 'cuenta-wishlist.html' });
    expect(standardPageRoute('components/auth/sso.tsx')).toEqual({ name: 'auth/sso', path: 'acceso-sso.html' });
    expect(standardPageRoute('components/pages/careers.tsx')).toEqual({ name: 'pages/careers', path: 'careers.html' });
  });

  it.each([
    'components/Shell.tsx', 'components/account.tsx', 'components/pages/Faq.tsx', 'components/pages/-x.tsx',
    'components/pages/faq/deep.tsx', 'components/other/faq.tsx', 'components/pages/faq.ts', 'pages/faq.tsx',
  ])('does not treat %s as a route', path => {
    expect(standardPageRoute(path)).toBeNull();
    expect(nextContentPages([...base(), file(path)]).map(p => p.path)).toEqual(commerce);
  });

  it('fails naming both files when two produce the same page', () => {
    expect(() => nextContentPages([...base(), file('components/page-faq.tsx'), file('components/pages/faq.tsx')])).toThrow(/components\/page-faq\.tsx.*components\/pages\/faq\.tsx.*faq\.html/);
    expect(() => nextContentPages([...base(), file('components/pages/checkout.tsx')])).toThrow(/components\/checkout\.tsx.*components\/pages\/checkout\.tsx.*checkout\.html/);
  });

  it('still routes only the home page for a non-shop site that has no grouped files', () => {
    expect(nextContentPages(base(), 'portfolio').map(p => p.path)).toEqual(['index.html']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts`
Expected: FAIL — `standardPageRoute` is not exported.

- [ ] **Step 3: Implement**

Replace `source-next.ts:21-29` (the `nextPages` constant and `nextContentPages`) with:

```ts
export const nextPages = [{ name: 'home', path: 'index.html' }, { name: 'product', path: 'product.html' }, { name: 'checkout', path: 'checkout.html' }] as const;

/** Folders under components/ whose files are standard store pages (spec 2026-09-30-store-page-architecture). The value
 * is the prefix of the URL for a file the table below does not know. */
const STANDARD_PAGE_GROUPS: Record<string, string> = { pages: '', catalog: '', auth: 'acceso-', account: 'cuenta-' };
/** Spanish URL slug of each known page, keyed by `group/file`. */
const STANDARD_PAGE_SLUGS: Record<string, string> = {
  'pages/faq': 'faq', 'pages/shipping': 'envios', 'pages/refund-policy': 'reembolsos', 'pages/privacy': 'privacidad', 'pages/terms': 'terminos',
  'pages/cookies': 'cookies', 'pages/contact': 'contacto', 'pages/about': 'nosotros', 'pages/not-found': '404',
  'catalog/collections': 'colecciones', 'catalog/search': 'buscar',
  'auth/login': 'acceso-ingresar', 'auth/register': 'acceso-registro', 'auth/forgot-password': 'acceso-olvide-mi-contrasena', 'auth/reset-password': 'acceso-restablecer-contrasena',
  'account/orders': 'cuenta-pedidos', 'account/addresses': 'cuenta-direcciones', 'account/profile': 'cuenta-perfil', 'account/downloads': 'cuenta-descargas',
  'account/payment-methods': 'cuenta-metodos-de-pago', 'account/subscriptions': 'cuenta-suscripciones',
};
const STANDARD_PAGE_FILE = /^components\/(pages|catalog|auth|account)\/([a-z][a-z0-9-]{0,47})\.tsx$/;

/** The route of a file in one of the standard page folders, or null for any other file (shared components never route). */
export function standardPageRoute(path: string): { name: string; path: string } | null {
  const match = STANDARD_PAGE_FILE.exec(path);
  if (!match) return null;
  const name = `${match[1]}/${match[2]}`;
  return { name, path: `${STANDARD_PAGE_SLUGS[name] ?? `${STANDARD_PAGE_GROUPS[match[1]]}${match[2]}`}.html` };
}

/** Explicit page-* convention avoids treating shared components as routes; the standard page folders are explicit too. */
export function nextContentPages(files: SourceProjectFileDto[], purpose: SourceSitePurpose = 'shop'): Array<{ name: string; path: string }> {
  const pages = [...nextPages.filter(page => purpose === 'shop' || page.name === 'home' || files.some(file => file.path === `components/${page.name}.tsx`)),
    ...files.filter(file => /^components\/page-(?!index\.|product\.|checkout\.)[a-z][a-z0-9-]{0,47}\.tsx$/.test(file.path))
      .map(file => ({ name: file.path.slice(11, -4), path: file.path.slice(16, -4) + '.html' })),
    ...files.flatMap(file => standardPageRoute(file.path) ?? [])];
  const owners = new Map<string, string>();
  for (const page of pages) {
    const owner = `components/${page.name}.tsx`, other = owners.get(page.path);
    if (other) throw new BadGatewayException(`${other} y ${owner} producen la misma página ${page.path}. Cambia el nombre de uno.`);
    owners.set(page.path, owner);
  }
  return pages;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts src/storefront-source/source-site-purpose.spec.ts`
Expected: PASS (the second file proves `nextContentPages` users for non-shop sites are unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next-pages.spec.ts
git commit -m "feat(storefront): standard page folders become routes"
```

---

### Task 3: Content pages need no runtime hooks

**Files:**
- Modify: `apps/api/src/storefront-source/source-next.ts:101` (the `hooks` ternary inside `validateNextSources`)
- Modify: `apps/api/src/storefront-source/source-next-pages.spec.ts`

**Interfaces:**
- Consumes: `standardPageRoute` from Task 2.

- [ ] **Step 1: Write the failing test** (append to `source-next-pages.spec.ts`)

```ts
import { validateNextSources } from './source-next';

describe('validating standard pages', () => {
  const faq = { path: 'components/pages/faq.tsx', content: "import Header from '../Header';\nexport default function Faq() { return <><Header /><main id=\"contenido\"><h1>Preguntas frecuentes</h1></main></>; }" };

  it('does not ask a content page for the checkout mount', () => {
    expect(() => validateNextSources([...nextStoreFiles(), faq], 'shop')).not.toThrow();
  });

  it('still asks a hand-written page-SLUG page for the hooks it always needed', () => {
    const old = { ...faq, path: 'components/page-faq.tsx' };
    expect(() => validateNextSources([...nextStoreFiles(), old], 'shop')).toThrow(/page-faq necesita data-pagosya-checkout-page/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts -t "validating standard pages"`
Expected: FAIL — first test throws `pages/faq necesita data-pagosya-checkout-page en JSX visible.`

- [ ] **Step 3: Implement** — in the `hooks` line of `validateNextSources`, change the final branch:

```ts
// before
: ['data-pagosya-checkout-page', 'data-pagosya-status'];
// after
: standardPageRoute(`components/${page.name}.tsx`) ? [] : ['data-pagosya-checkout-page', 'data-pagosya-status'];
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts src/storefront-source/source-next.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next-pages.spec.ts
git commit -m "feat(storefront): standard content pages require no commerce mounts"
```

---

### Task 4: Kit placeholder and end-to-end compile across all 61 templates

**Files:**
- Modify: `packages/storefront-kit/kit/ui.tsx` (add after `Badge`, line ~468)
- Modify: `apps/api/src/storefront-source/source-next-pages.spec.ts`

**Interfaces:**
- Produces: `StandardPagePlaceholder({ title }: { title: string })` exported from `@pagosya/ui`. Renders `<main id="contenido" className="ui-standard-page" data-standard-page>` with a `Display` heading and a `Lead`.

- [ ] **Step 1: Write the failing tests** (append to `source-next-pages.spec.ts`)

```ts
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { compileNextPreview, nextPageMarkup, nextProjectScaffold } from './source-next';
import { templateStoreDataFile } from './source-templates';

jest.setTimeout(60_000);

const thinPage = (path: string, title: string) => ({ path, content: `import Shell from '../Shell';\nimport { StandardPagePlaceholder } from '@pagosya/ui';\nexport default function Page() { return <Shell><StandardPagePlaceholder title="${title}" /></Shell>; }\n` });

describe('standard pages end to end', () => {
  it.each(listTemplates().map(t => t.id))('%s renders a standard page inside its own Shell', id => {
    const files = [...templateSourceFiles(id), templateStoreDataFile({ name: 'Tienda' }, {}), thinPage('components/pages/faq.tsx', 'Preguntas frecuentes')];
    const markup = nextPageMarkup(files, 'pages/faq');
    expect(markup).toMatch(/<h1\b/);
    expect(markup).toContain('data-standard-page');
  });

  it('compiles a grouped page to its own html and script, and the scaffold routes it', async () => {
    const files = [...nextStoreFiles(), { path: 'components/pages/faq.tsx', content: "import Header from '../Header';\nimport { StandardPagePlaceholder } from '@pagosya/ui';\nexport default function Faq() { return <><Header /><StandardPagePlaceholder title=\"Preguntas\" /></>; }" }];
    const out = await compileNextPreview(files, 'shop');
    expect(out.some(f => f.path === 'faq.html')).toBe(true);
    expect(out.some(f => f.path === '_compiled/pages/faq.js')).toBe(true);
    const scaffold = nextProjectScaffold('tienda', nextContentPages(files));
    expect(scaffold.find(f => f.path === 'pages/faq.tsx')!.content).toContain("../components/pages/faq");
  });

  it('writes the not-found page as Next\'s own 404', () => {
    const scaffold = nextProjectScaffold('tienda', nextContentPages([...nextStoreFiles(), { path: 'components/pages/not-found.tsx', content: 'export default function NotFound() { return null; }' }]));
    expect(scaffold.some(f => f.path === 'pages/404.tsx')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts -t "standard pages end to end"`
Expected: FAIL — `StandardPagePlaceholder` is not exported by `@pagosya/ui` (markup lacks `data-standard-page`; the compile test fails on the import).

- [ ] **Step 3: Implement** — add to `packages/storefront-kit/kit/ui.tsx` right after `export function Badge(...)`:

```tsx
/** The body of a standard store page that has no content yet. Only tests use it: a customer must never see it, so no
 * store gets a page file until the sub-project that owns that page replaces this with real content. */
export function StandardPagePlaceholder({ title }: { title: string }) {
  return <main id="contenido" className="ui-standard-page" data-standard-page>
    <Container><Display>{title}</Display><Lead>Esta página se completa pronto.</Lead></Container>
  </main>;
}
```

- [ ] **Step 4: Run them to see them pass, plus the kit's own checks**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts && cd ../.. && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS for all 61 templates + compile + 404; kit `check-runtimes` and `tsc` pass.

If a template fails, fix that template's markup only if the failure is real (its `Shell` cannot take the page); do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/source-next-pages.spec.ts
git commit -m "feat(kit): StandardPagePlaceholder; all templates host a standard page"
```

---

### Task 5: Pin the Shell contract for every template

**Files:**
- Create: `packages/store-templates/test/shell-contract.test.mjs`

**Interfaces:**
- Consumes: `loadTemplates()` from `packages/store-templates/index.js` (returns `{ dir, manifest }[]`).

- [ ] **Step 1: Write the test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');

// Standard store pages are rendered inside each template's Shell (spec 2026-09-30-store-page-architecture), so every
// template, now and future, must default-export a Shell that takes children.
test('every template default-exports a Shell that takes children', () => {
  for (const { dir, manifest } of templates.loadTemplates()) {
    const source = readFileSync(join(dir, 'components', 'Shell.tsx'), 'utf8');
    assert.match(source, /export default function Shell\(\{ children \}: \{ children: ReactNode \}\)/, `${manifest.id}: Shell must be the default export and take children`);
  }
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @pagosya/store-templates test`
Expected: PASS (all 61 already comply; this pins it).

- [ ] **Step 3: Commit**

```bash
git add packages/store-templates/test/shell-contract.test.mjs
git commit -m "test(templates): every template's Shell takes children"
```

---

### Task 6: Whole-area check

- [ ] **Step 1: Run the storefront-source and kit suites and the type check**

Run: `cd apps/api && npx jest src/storefront-source && npx tsc --noEmit -p tsconfig.json && cd ../.. && pnpm --filter @pagosya/storefront-kit test && pnpm --filter @pagosya/store-templates test`
Expected: all green. Any failure that did not exist on `main` is caused by this branch: fix it, do not skip it.

- [ ] **Step 2: Confirm nothing outside the plan changed**

Run: `git status --short && git diff main --stat`
Expected: the only modified files are those named in Tasks 1-5, plus the unrelated Ajustes files in `apps/merchant-studio/src` that remain uncommitted.

---

## Self-review

- **Spec coverage:** file model and routing → Task 2; hooks for content pages (found while planning, needed for routes to validate) → Task 3; kit placeholder → Task 4; template contract + "every template compiles with standard page files" → Tasks 4-5; collision/invalid-slug/old-store-unchanged → Task 2; 404 → Task 4; "no real store gets files" and navigation deferral → Global Constraints. Spec's "Shell receives no broken links" is moved to sub-project 2 per the updated spec.
- **Placeholders:** none.
- **Consistency:** `standardPageRoute` (Task 2) is used in Task 3; `StandardPagePlaceholder` (Task 4) only in tests; names match across tasks.
