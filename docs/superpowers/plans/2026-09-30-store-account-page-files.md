# Account and login pages as files in every store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store project gets eight thin page files (`components/auth/*`, `components/account/*`) that open inside the store's own `Shell` and send the shopper to the trusted account app on the checkout origin with one click.

**Architecture:** One new kit component, `AccountGatePage`, draws a heading, one sentence and one anchor `a[data-pagosya-account="<view>"]` and renders no input. The storefront runtime (`commerce.js`) fills each anchor's `href` with `<checkoutOrigin>/cuenta/<slug>/<path>`, and the existing click handler posts `pagosya:source-external`. The checkout bridge allowlist grows from one address to seven. The eight files join the files `contentPagesFor`/`withStandardPages` already add, so new stores, applied templates and the existing "Agregar páginas estándar" action all pick them up. A build check rejects password inputs in store code.

**Tech Stack:** TypeScript, React (kit `ui.tsx`), esbuild-compiled Next.js static export, Jest (`apps/api`), Vitest (`apps/checkout`, `apps/merchant-studio`), jsdom.

**Spec:** `docs/superpowers/specs/2026-09-30-store-account-page-files-design.md`

**Repo and branch:** `/Users/saramia/pagosYa`, branch `feature/store-page-architecture`. The working tree has unrelated uncommitted changes owned by the user; **commit only the files each task names** (`git add <paths>`, `git commit -- <paths>`), never `git add -A`.

**Dev DB rule:** never run `prisma migrate`, `diff` or `reset`. This plan needs no database change.

## Global Constraints

- The eight files, slugs and destinations are exactly those in the spec table; `downloads` and `payment-methods` are **not** created.
- Every page file starts with the line `// @pagosya-page` (the first line, nothing before it).
- `AccountGatePage` renders **no** `input`, `textarea`, `select` or `form`.
- Copy is Spanish, fixed per view, no merchant text.
- Reset-password gate leads to `/cuenta/<slug>/recuperar`; `verificar` and `restablecer` are never gate destinations or bridge-allowed.
- The eight pages are private: `noindex`, absent from `sitemap.xml`.
- The compressed runtime is ~420,000 characters against a 400,000 limit on *saved* files; it is valid only because the platform injects it at render time. Keep additions to `commerce.js` small (about 1 KB) and run the kit test.
- Published stores render byte-for-byte as before unless they receive the new files by publishing a new revision.

## Review Focus

- A store with a Shell that has no footer slot: the pages are still added and nothing throws (Task 1 test keeps it true with eight more files).
- A store that already has `components/auth/login.tsx` of its own: it is kept untouched and not duplicated (Task 1 test).
- A store not yet published, or opened in the Studio preview, has no `slug`/`checkoutOrigin`: every gate shows "Cuenta no disponible", no link, no error (Task 2 test).
- A hostile or unknown `data-pagosya-account` value (`"__proto__"`, `"x"`, `"constructor"`): no link, no throw (Task 2 test).
- A bridge message for `/cuenta/<other-slug>/pedidos`, `/cuenta/<slug>/restablecer`, `/cuenta/<slug>/pedidos/../x`, or a different origin must be refused (Task 3 test).
- YAPI or a template adding `type="password"` anywhere, including through `autoComplete="new-password"`: the build fails with a Spanish message naming the file (Task 4 test).

---

### Task 1: Kit component `AccountGatePage` and the eight page files

**Files:**
- Modify: `packages/storefront-kit/kit/ui.tsx` (add after `InfoPage`, near line 490)
- Modify: `apps/api/src/storefront-source/source-content-pages.ts`
- Modify: `apps/api/src/storefront-source/source-content-pages.spec.ts`

**Interfaces:**
- Produces (kit): `export type AccountGateView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'orders' | 'addresses' | 'profile' | 'subscriptions'` and `export function AccountGatePage({ view }: { view: AccountGateView })`, exported from `@pagosya/ui`.
- Produces (api): `export const ACCOUNT_PAGE_FILES: SourceProjectFileDto[]` (8 files) and `export const STANDARD_PAGE_FILES: SourceProjectFileDto[]` (the 11 `CONTENT_PAGE_FILES` followed by the 8 account files). `contentPagesFor` and `withStandardPages` now work over `STANDARD_PAGE_FILES`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/storefront-source/source-content-pages.spec.ts` (add `ACCOUNT_PAGE_FILES, STANDARD_PAGE_FILES` to the existing import from `./source-content-pages`):

```ts
describe('account page files', () => {
  const SLUGS: Record<string, string> = {
    'components/auth/login.tsx': 'acceso-ingresar.html', 'components/auth/register.tsx': 'acceso-registro.html',
    'components/auth/forgot-password.tsx': 'acceso-olvide-mi-contrasena.html', 'components/auth/reset-password.tsx': 'acceso-restablecer-contrasena.html',
    'components/account/orders.tsx': 'cuenta-pedidos.html', 'components/account/addresses.tsx': 'cuenta-direcciones.html',
    'components/account/profile.tsx': 'cuenta-perfil.html', 'components/account/subscriptions.tsx': 'cuenta-suscripciones.html',
  };

  it('are eight thin files, each marked as a page and drawing the account gate', () => {
    expect(ACCOUNT_PAGE_FILES.map(file => file.path).sort()).toEqual(Object.keys(SLUGS).sort());
    for (const file of ACCOUNT_PAGE_FILES) {
      expect(file.content.startsWith('// @pagosya-page\n')).toBe(true);
      expect(file.content).toContain('<AccountGatePage view=');
    }
    expect(STANDARD_PAGE_FILES).toHaveLength(19);
  });

  it('are added to an applied template, compile to their own pages and draw no input', async () => {
    const revision = await apply(templateSourceFiles('acuarela'));
    const paths = revision.files.map(f => f.path);
    for (const [file, html] of Object.entries(SLUGS)) { expect(paths).toContain(file); expect(paths).toContain(html); }
    const login = revision.files.find(f => f.path === 'acceso-ingresar.html')!.content;
    expect(login).toContain('data-pagosya-account="login"');
    const main = /<main[^>]*data-account-gate[^]*?<\/main>/.exec(login)?.[0] ?? '';
    expect(main).not.toBe('');
    expect(main).not.toMatch(/<(input|textarea|select|form)\b/i);
  });

  it('keep a page the store already has and add the rest', () => {
    const own = { path: 'components/auth/login.tsx', content: '// @pagosya-page\nexport default function Login() { return null; }\n' };
    const shell = { path: 'components/Shell.tsx', content: "export default function Shell({ children }: any) { return <div>{children}</div>; }\n" };
    const result = withStandardPages([shell, own]);
    expect(result.added).not.toContain('components/auth/login.tsx');
    expect(result.added).toContain('components/account/orders.tsx');
    expect(result.files.filter(f => f.path === 'components/auth/login.tsx')).toHaveLength(1);
  });
});
```

Also update the existing `withStandardPages` assertions that compare `result.added` to `CONTENT_PAGE_FILES` (the tests "adds the eleven pages and the footer nav slot", the idempotence test and the "cannot be found safely" test, lines ~57–90) so they compare to `STANDARD_PAGE_FILES`, and rename "eleven" to "standard" in their titles.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-content-pages.spec.ts`
Expected: FAIL — `ACCOUNT_PAGE_FILES` / `STANDARD_PAGE_FILES` are not exported.

- [ ] **Step 3: Add the kit component**

In `packages/storefront-kit/kit/ui.tsx`, directly after the `InfoPage` function:

```tsx
export type AccountGateView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'orders' | 'addresses' | 'profile' | 'subscriptions';
const ACCOUNT_GATE_COPY: Record<AccountGateView, { title: string; lead: string; action: string }> = {
  login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y guarda tus datos para comprar más rápido.', action: 'Ingresar' },
  register: { title: 'Crea tu cuenta', lead: 'Con una cuenta sigues tus pedidos y guardas tus direcciones.', action: 'Crear cuenta' },
  'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace a tu correo para elegir una contraseña nueva.', action: 'Recuperar contraseña' },
  'reset-password': { title: 'Elige una contraseña nueva', lead: 'Pide un enlace a tu correo y desde ahí eliges la contraseña nueva.', action: 'Pedir un enlace' },
  orders: { title: 'Mis pedidos', lead: 'Mira el estado y el detalle de tus compras.', action: 'Ver mis pedidos' },
  addresses: { title: 'Mis direcciones', lead: 'Guarda y cambia las direcciones donde recibes tus pedidos.', action: 'Ver mis direcciones' },
  profile: { title: 'Mi perfil', lead: 'Cambia tus datos, descarga tu información o elimina tu cuenta.', action: 'Ver mi perfil' },
  subscriptions: { title: 'Mis suscripciones', lead: 'Revisa y administra tus entregas recurrentes.', action: 'Ver mis suscripciones' },
};
/** A customer-access or account page: a title, one sentence and one button. The runtime points the button at the shopper's
 * account on the trusted checkout origin (commerce.js, `renderAccountGates`). It draws no input on purpose: authored store
 * code runs in a sandbox and must never receive a password or personal data. */
export function AccountGatePage({ view }: { view: AccountGateView }) {
  const copy = ACCOUNT_GATE_COPY[view];
  return <main id="contenido" className="ui-account-gate" data-account-gate={view}>
    <Container><Display>{copy.title}</Display><Lead>{copy.lead}</Lead>
      <a className="ui-button" data-variant="solid" href="#" data-pagosya-account={view}>{copy.action}</a></Container>
  </main>;
}
```

If `packages/storefront-kit/index.d.ts` or `kit/index.js` re-exports kit names explicitly, add `AccountGatePage` and `AccountGateView` next to `InfoPage` there (check with `grep -rn InfoPage packages/storefront-kit --include=index.*`).

- [ ] **Step 4: Add the page files to the generator**

In `apps/api/src/storefront-source/source-content-pages.ts`, after `CONTENT_PAGE_FILES`:

```ts
/** The customer-access and account pages (spec 2026-09-30-store-account-page-files-design). Each is a gate: the template's Shell
 * around a kit AccountGatePage whose button opens the real form on the trusted checkout origin. No input is ever drawn here. */
const ACCOUNT_PAGES: Array<{ group: 'auth' | 'account'; file: string; component: string; view: string }> = [
  { group: 'auth', file: 'login', component: 'Login', view: 'login' }, { group: 'auth', file: 'register', component: 'Register', view: 'register' },
  { group: 'auth', file: 'forgot-password', component: 'ForgotPassword', view: 'forgot-password' }, { group: 'auth', file: 'reset-password', component: 'ResetPassword', view: 'reset-password' },
  { group: 'account', file: 'orders', component: 'Orders', view: 'orders' }, { group: 'account', file: 'addresses', component: 'Addresses', view: 'addresses' },
  { group: 'account', file: 'profile', component: 'Profile', view: 'profile' }, { group: 'account', file: 'subscriptions', component: 'Subscriptions', view: 'subscriptions' },
];

export const ACCOUNT_PAGE_FILES: SourceProjectFileDto[] = ACCOUNT_PAGES.map(({ group, file, component, view }) => ({
  path: `components/${group}/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { AccountGatePage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><AccountGatePage view="${view}" /></Shell>; }\n`,
}));

/** Every standard page a store gets: the information and catalog pages, then the account gates. */
export const STANDARD_PAGE_FILES: SourceProjectFileDto[] = [...CONTENT_PAGE_FILES, ...ACCOUNT_PAGE_FILES];
```

Change `contentPagesFor` to filter `STANDARD_PAGE_FILES` instead of `CONTENT_PAGE_FILES`, and fix the doc comment of `withStandardPages` ("the information, catalog and account pages").

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-content-pages.spec.ts src/storefront-source/source-next-vendor.spec.ts`
Expected: PASS. If any other spec lists pages by count, update it to the new set.

- [ ] **Step 6: Typecheck the kit**

Run: `cd /Users/saramia/pagosYa && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS (`check-runtimes.mjs` and `tsc`). If `check-runtimes` fails on size, stop and report: the limit needs a decision.

- [ ] **Step 7: Commit**

```bash
cd /Users/saramia/pagosYa
git add packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/source-content-pages.ts apps/api/src/storefront-source/source-content-pages.spec.ts
git commit -m "feat(storefront): account and login pages as files in every store (AccountGatePage, eight thin pages)" -- packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/source-content-pages.ts apps/api/src/storefront-source/source-content-pages.spec.ts
```
(Add `index.d.ts`/`index.js` to both lists if Step 3 changed them.)

---

### Task 2: Runtime fills the gate buttons

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (near `accountUrl`, line ~1060, and the start of `renderInfoPages`, line ~1139)
- Create: `apps/api/src/storefront-source/source-commerce-account-gates.spec.ts`

**Interfaces:**
- Consumes: `accountUrl()` (already in `commerce.js`, returns `<checkoutOrigin>/cuenta/<slug>` or `''`); the existing document click handler for `[data-pagosya-account]` (posts `pagosya:source-external` with `link.href` when `hosted`).
- Produces: `renderAccountGates()` (runtime-internal) — sets `href` or disables each `a[data-pagosya-account]` that has a non-empty value.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/storefront-source/source-commerce-account-gates.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

async function gate(views: string[], config: Record<string, unknown> = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test' }, hosted = false) {
  const anchors = views.map(view => `<a href="#" data-pagosya-account="${view}">Ir</a>`).join('');
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><main>${anchors}</main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  if (hosted) { w.PAGOSYA_HOSTED = true; w.PAGOSYA_HOSTED_REQUEST = jest.fn(async () => ({ ok: true, body: {} })); w.__messages = []; w.addEventListener('message', (event: any) => w.__messages.push(event.data)); }
  w.PAGOSYA_CONFIG = { ...config, data: { storeName: 'Marca', items: [] } };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storeName: 'Marca', items: [] }) }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const link = (w: any, view: string) => w.document.querySelector(`a[data-pagosya-account="${view}"]`) as HTMLAnchorElement;

describe('account gate buttons in the storefront runtime', () => {
  it('point each gate at the shopper account on the checkout origin', async () => {
    const views: Record<string, string> = {
      login: 'https://pay.test/cuenta/marca', register: 'https://pay.test/cuenta/marca/registro', 'forgot-password': 'https://pay.test/cuenta/marca/recuperar',
      'reset-password': 'https://pay.test/cuenta/marca/recuperar', orders: 'https://pay.test/cuenta/marca/pedidos', addresses: 'https://pay.test/cuenta/marca/direcciones',
      profile: 'https://pay.test/cuenta/marca/perfil', subscriptions: 'https://pay.test/cuenta/marca/suscripciones',
    };
    const w = await gate(Object.keys(views));
    for (const [view, href] of Object.entries(views)) expect(link(w, view).href).toBe(href);
    w.close();
  });

  it('shows "Cuenta no disponible", with no link, when the store has no checkout address', async () => {
    const w = await gate(['login', 'orders'], { slug: 'marca', apiBaseUrl: 'https://api.test' });
    for (const view of ['login', 'orders']) {
      expect(link(w, view).hasAttribute('href')).toBe(false);
      expect(link(w, view).getAttribute('aria-disabled')).toBe('true');
      expect(link(w, view).textContent).toBe('Cuenta no disponible');
    }
    w.close();
  });

  it('never links an unknown or hostile view', async () => {
    const w = await gate(['__proto__', 'x', 'constructor']);
    for (const view of ['__proto__', 'x', 'constructor']) expect(link(w, view).hasAttribute('href')).toBe(false);
    w.close();
  });

  it('asks the host to open the account page when a gate is clicked in a hosted store', async () => {
    const w = await gate(['orders'], undefined, true);
    link(w, 'orders').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(w.__messages).toContainEqual({ type: 'pagosya:source-external', url: 'https://pay.test/cuenta/marca/pedidos' });
    w.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-commerce-account-gates.spec.ts`
Expected: FAIL — `href` is still `#`.

- [ ] **Step 3: Implement**

In `packages/storefront-kit/kit/commerce.js`, directly after the `accountUrl` line (~1060):

```js
  // The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.
  const ACCOUNT_GATE_PATHS = { login: '', register: '/registro', 'forgot-password': '/recuperar', 'reset-password': '/recuperar', orders: '/pedidos', addresses: '/direcciones', profile: '/perfil', subscriptions: '/suscripciones' };
  function renderAccountGates() {
    const base = accountUrl();
    document.querySelectorAll('a[data-pagosya-account]').forEach(link => {
      const view = link.getAttribute('data-pagosya-account');
      if (!view) return;
      if (base && Object.prototype.hasOwnProperty.call(ACCOUNT_GATE_PATHS, view)) { link.setAttribute('href', base + ACCOUNT_GATE_PATHS[view]); link.removeAttribute('aria-disabled'); return; }
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.textContent = 'Cuenta no disponible';
    });
  }
```

At the very top of `function renderInfoPages(force = false) {` (before `const live = ...`) add `renderAccountGates();`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-commerce-account-gates.spec.ts src/storefront-source/source-commerce-info-pages.spec.ts`
Expected: PASS. If the gate test cannot reach `renderInfoPages` (it never runs in the harness), find where it is first invoked at start-up (`grep -n "renderInfoPages(" packages/storefront-kit/kit/commerce.js`) and make sure `renderAccountGates()` also runs on that path.

- [ ] **Step 5: Kit size check**

Run: `cd /Users/saramia/pagosYa && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/saramia/pagosYa
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-account-gates.spec.ts
git commit -m "feat(storefront): runtime points the account gate buttons at the trusted account pages" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-account-gates.spec.ts
```

---

### Task 3: Checkout bridge allows the seven account addresses

**Files:**
- Create: `apps/checkout/src/account-destinations.ts`
- Create: `apps/checkout/src/account-destinations.test.ts`
- Modify: `apps/checkout/src/source-storefront.ts` (the `accountPage` line, ~200)

**Interfaces:**
- Produces: `export function isAccountDestination(url: URL, origin: string, slug: string): boolean` — true only for `origin` + `/cuenta/<slug>` or `/cuenta/<slug>/<view>` with `<view>` in `registro | recuperar | pedidos | direcciones | perfil | suscripciones`, optional trailing slash, same origin.

- [ ] **Step 1: Write the failing test**

Create `apps/checkout/src/account-destinations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAccountDestination } from './account-destinations';

const ok = (path: string, origin = 'https://pay.test', slug = 'marca') => isAccountDestination(new URL(`https://pay.test${path}`), origin, slug);

describe('isAccountDestination', () => {
  it('allows the sign-in page and the six token-free views, with or without a trailing slash', () => {
    for (const path of ['/cuenta/marca', '/cuenta/marca/', '/cuenta/marca/registro', '/cuenta/marca/recuperar', '/cuenta/marca/pedidos', '/cuenta/marca/direcciones', '/cuenta/marca/perfil', '/cuenta/marca/suscripciones/']) expect(ok(path)).toBe(true);
  });
  it('refuses views that need an email token', () => {
    expect(ok('/cuenta/marca/restablecer')).toBe(false);
    expect(ok('/cuenta/marca/verificar')).toBe(false);
  });
  it('refuses another store, an unknown view, a deeper path and a traversal', () => {
    for (const path of ['/cuenta/otra/pedidos', '/cuenta/marca/otra', '/cuenta/marca/pedidos/x', '/cuenta/marca/pedidos/../x', '/cuenta/marca%2Fpedidos']) expect(ok(path)).toBe(false);
  });
  it('refuses a different origin', () => {
    expect(isAccountDestination(new URL('https://evil.test/cuenta/marca/pedidos'), 'https://pay.test', 'marca')).toBe(false);
  });
  it('matches a slug with special characters literally', () => {
    expect(isAccountDestination(new URL('https://pay.test/cuenta/a.b/pedidos'), 'https://pay.test', 'a.b')).toBe(true);
    expect(isAccountDestination(new URL('https://pay.test/cuenta/axb/pedidos'), 'https://pay.test', 'a.b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/checkout && npx vitest run src/account-destinations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/checkout/src/account-destinations.ts`:

```ts
const VIEWS = new Set(['registro', 'recuperar', 'pedidos', 'direcciones', 'perfil', 'suscripciones']);

/** Where a sandboxed store may send the shopper: its own account pages on this trusted origin (spec
 * 2026-09-30-store-account-page-files-design). `verificar` and `restablecer` are left out: they only work with an email token. */
export function isAccountDestination(url: URL, origin: string, slug: string): boolean {
  if (url.origin !== origin) return false;
  const base = `/cuenta/${encodeURIComponent(slug)}`;
  const path = url.pathname.replace(/\/$/, '');
  if (path === base) return true;
  return path.startsWith(`${base}/`) && VIEWS.has(path.slice(base.length + 1));
}
```

In `apps/checkout/src/source-storefront.ts` add `import { isAccountDestination } from './account-destinations';` and replace the `accountPage` definition with:

```ts
        const accountPage = isAccountDestination(url, location.origin, slug);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/checkout && npx vitest run src/account-destinations.test.ts && npx tsc --noEmit -p . | head`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/checkout/src/account-destinations.ts apps/checkout/src/account-destinations.test.ts apps/checkout/src/source-storefront.ts
git commit -m "feat(checkout): the store bridge opens the shopper's account views, never the token-only ones" -- apps/checkout/src/account-destinations.ts apps/checkout/src/account-destinations.test.ts apps/checkout/src/source-storefront.ts
```

---

### Task 4: Build check — no password inputs in store code

**Files:**
- Modify: `apps/api/src/storefront-source/source-next.ts` (the JSX visitor near line 137, and `SOURCE_NEXT_INSTRUCTIONS` near line 77)
- Modify: `apps/api/src/storefront-source/source-next.spec.ts`

**Interfaces:**
- Consumes: the existing validator that throws `BadGatewayException` with a Spanish message for forbidden JSX (the `dangerouslySetInnerHTML` branch).
- Produces: the same validator now also throws for a password field in any authored file.

- [ ] **Step 1: Write the failing test**

First find how the existing `dangerouslySetInnerHTML` case is tested: `grep -n "dangerouslySetInnerHTML\|no insertes HTML" apps/api/src/storefront-source/source-next.spec.ts`. Add next to it (same helper and fixtures that case uses; names below are the likely ones — adjust to match the file):

```ts
it.each([
  ['type="password"', '<input type="password" />'],
  ["type='password'", "<input type='password' />"],
  ['autoComplete current-password', '<input autoComplete="current-password" />'],
  ['autoComplete new-password', '<input autoComplete="new-password" />'],
])('rejects a password field in store code (%s)', async (_label, markup) => {
  const files = nextStoreFiles().map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('export default function', `const Extra = () => ${markup};\nexport default function`) } : f);
  await expect(compileNextPreview(files)).rejects.toThrow(/contraseña/i);
});

it('accepts an ordinary text input', async () => {
  const files = nextStoreFiles().map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('export default function', 'const Extra = () => <input type="text" aria-label="Nombre" />;\nexport default function') } : f);
  await expect(compileNextPreview(files)).resolves.toBeDefined();
});
```

(If the existing test calls a different entry point than `compileNextPreview`, use that one; the assertion is that the call throws a `BadGatewayException` whose message matches `/contraseña/i`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-next.spec.ts -t "password"`
Expected: FAIL — compile succeeds.

- [ ] **Step 3: Implement**

In `source-next.ts`, in the same visitor, directly after the `dangerouslySetInnerHTML`/`srcDoc` line, add:

```ts
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(source);
        const literal = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text.toLowerCase() : '';
        if (name === 'type' && literal === 'password' || /^autocomplete$/i.test(name) && ['current-password', 'new-password'].includes(literal)) {
          throw new BadGatewayException(`Quita el campo de contraseña de ${file.path}: las contraseñas solo se piden en la cuenta segura de pagosYa.`);
        }
      }
```

- [ ] **Step 4: Run to verify it passes, then run every template through the check**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-next.spec.ts src/storefront-source/source-commerce-templates.spec.ts`
Expected: PASS. If a shipped template fails because it contains a password input, remove that input from the template (no template should have one) and say so in the commit message.

- [ ] **Step 5: Add the same rule to YAPI's plain-words instructions**

Append to `SOURCE_NEXT_INSTRUCTIONS` (the long template string at line ~77, before the closing backtick) the sentence: `Never add password fields (type="password" or autoComplete current-password/new-password) to any file; sign-in forms belong to the platform's secure account pages.` Re-run the specs from Step 4; update any assertion that snapshots the instructions text.

- [ ] **Step 6: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next.spec.ts
git commit -m "feat(storefront): store code can never contain a password field" -- apps/api/src/storefront-source/source-next.ts apps/api/src/storefront-source/source-next.spec.ts
```

---

### Task 5: The eight pages are private (noindex, not in the sitemap)

**Files:**
- Modify: `apps/api/src/storefront-source/source-seo.ts` (the `pages` filter near line 19 and the `privatePage` line near line 31)
- Modify: `apps/api/src/store-seo/store-seo.spec.ts`

**Interfaces:**
- Consumes: `withSourceSeo(snapshot)`; the existing `privatePage` list (`checkout.html`, `404.html`, `buscar.html`).
- Produces: `ACCOUNT_PRIVATE_PAGES` (a module constant in `source-seo.ts`) used by both the sitemap filter and the `privatePage` check.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/store-seo/store-seo.spec.ts` (the file already imports `withSourceSeo`; if it names the import differently, use that name):

```ts
describe('account gate pages in the source SEO pass', () => {
  const PRIVATE = ['acceso-ingresar.html', 'acceso-registro.html', 'acceso-olvide-mi-contrasena.html', 'acceso-restablecer-contrasena.html', 'cuenta-pedidos.html', 'cuenta-direcciones.html', 'cuenta-perfil.html', 'cuenta-suscripciones.html'];
  const page = (title: string) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;
  const snapshot = () => ({
    schemaVersion: 1, brief: {},
    files: [
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'marca', checkoutOrigin: 'https://pay.test', data: { storeName: 'Marca', items: [] } })};` },
      { path: 'index.html', content: page('Inicio') },
      ...PRIVATE.map(path => ({ path, content: page(path) })),
    ],
  }) as any;

  it('marks them noindex and leaves them out of the sitemap', () => {
    const out = withSourceSeo(snapshot());
    for (const path of PRIVATE) expect(out.files.find((f: any) => f.path === path).content).toMatch(/name="robots"[^>]*noindex|noindex[^>]*name="robots"/);
    const sitemap = out.files.find((f: any) => f.path === 'sitemap.xml').content as string;
    for (const path of PRIVATE) expect(sitemap).not.toContain(path.replace(/\.html$/, ''));
    expect(sitemap).toContain('https://pay.test/s/marca');
  });
});
```

(If `seoHead` spells the noindex meta differently, read `seoHead` in `store-seo.ts` and adjust the regex; the requirement is that each page carries a noindex robots directive.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/store-seo/store-seo.spec.ts -t "account gate"`
Expected: FAIL — the pages are indexable.

- [ ] **Step 3: Implement**

In `source-seo.ts`, above `withSourceSeo`:

```ts
/** Customer-access and account gates (spec 2026-09-30-store-account-page-files-design): private like checkout. */
const ACCOUNT_PRIVATE_PAGES = ['acceso-ingresar.html', 'acceso-registro.html', 'acceso-olvide-mi-contrasena.html', 'acceso-restablecer-contrasena.html', 'cuenta-pedidos.html', 'cuenta-direcciones.html', 'cuenta-perfil.html', 'cuenta-suscripciones.html'];
```

Add `...ACCOUNT_PRIVATE_PAGES` inside the array in the `pages` filter (the one containing `'product.html', 'checkout.html', 'coleccion.html', '404.html', 'buscar.html'`) and inside the `privatePage` array (`['checkout.html', '404.html', 'buscar.html']`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/store-seo src/storefront-source/source-content-pages.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-seo.ts apps/api/src/store-seo/store-seo.spec.ts
git commit -m "feat(storefront): account gate pages are noindex and out of the sitemap" -- apps/api/src/storefront-source/source-seo.ts apps/api/src/store-seo/store-seo.spec.ts
```

---

### Task 6: Studio lists the eight pages; YAPI knows the rule

**Files:**
- Modify: `apps/merchant-studio/src/source-pages.ts` (the `STANDARD` table near line 11, and the group regex in `listStorePages`)
- Modify: `apps/merchant-studio/src/source-pages.test.ts`
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.ts` (the `STANDARD PAGES.` paragraph near line 41)
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.spec.ts`

**Interfaces:**
- Consumes: `STANDARD: Record<string, [label, url]>` keyed `group/file`, used by `listStorePages`, `previewPages` and `canAddStandardPages` (which derives `STANDARD_FILES` from the keys).
- Produces: eight more entries, so the pages panel and the preview picker name them and "Agregar páginas estándar" appears for stores missing them.

- [ ] **Step 1: Write the failing tests**

Append to `apps/merchant-studio/src/source-pages.test.ts` (it already imports `listStorePages`, `canAddStandardPages` and `previewPages`):

```ts
describe('account gate pages', () => {
  const gate = (path: string) => ({ path, content: '// @pagosya-page\nexport default function P() { return null; }\n' });
  it('are listed as standard pages with their address', () => {
    const pages = listStorePages([gate('components/auth/login.tsx'), gate('components/account/orders.tsx')]);
    expect(pages).toEqual([
      { file: 'components/auth/login.tsx', label: 'Ingresar', url: 'acceso-ingresar.html', standard: true },
      { file: 'components/account/orders.tsx', label: 'Mis pedidos', url: 'cuenta-pedidos.html', standard: true },
    ]);
  });
  it('are named in the preview picker', () => {
    expect(previewPages([{ path: 'acceso-ingresar.html', content: '' }, { path: 'cuenta-pedidos.html', content: '' }]).map(p => p.label).sort()).toEqual(['Ingresar', 'Mis pedidos']);
  });
  it('make "Agregar páginas estándar" available when only they are missing', () => {
    const shell = { path: 'components/Shell.tsx', content: 'export function Footer() { return <footer><nav data-pagosya-pages /></footer>; }\nexport default function Shell() { return null; }\n' };
    const existing = ['pages/about', 'pages/contact', 'pages/shipping', 'pages/faq', 'pages/refund-policy', 'pages/privacy', 'pages/terms', 'pages/cookies', 'pages/not-found', 'catalog/collections', 'catalog/search'].map(key => gate(`components/${key}.tsx`));
    expect(canAddStandardPages([shell, ...existing])).toBe(true);
  });
});
```

In `apps/api/src/storefront-source/agent/agent-prompt.spec.ts`, next to the existing STANDARD PAGES test (find it with `grep -n "STANDARD PAGES" apps/api/src/storefront-source/agent/agent-prompt.spec.ts`), add an assertion on the same text that test already reads:

```ts
expect(instructions).toMatch(/AccountGatePage/);
expect(instructions).toMatch(/never add a form, input, password field or script/i);
```
(use the variable name the neighbouring test uses in place of `instructions`).

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-pages.test.ts; cd ../api && npx jest src/storefront-source/agent/agent-prompt.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `source-pages.ts`, add to the `STANDARD` table:

```ts
  'auth/login': ['Ingresar', 'acceso-ingresar.html'], 'auth/register': ['Crear cuenta', 'acceso-registro.html'],
  'auth/forgot-password': ['Recuperar contraseña', 'acceso-olvide-mi-contrasena.html'], 'auth/reset-password': ['Nueva contraseña', 'acceso-restablecer-contrasena.html'],
  'account/orders': ['Mis pedidos', 'cuenta-pedidos.html'], 'account/addresses': ['Mis direcciones', 'cuenta-direcciones.html'],
  'account/profile': ['Mi perfil', 'cuenta-perfil.html'], 'account/subscriptions': ['Mis suscripciones', 'cuenta-suscripciones.html'],
```

and widen the group regex in `listStorePages` from `(pages|catalog)` to `(pages|catalog|auth|account)`.

In `agent-prompt.ts`, at the end of the `STANDARD PAGES.` paragraph add: ` The pages under components/auth and components/account are gates to the platform's secure account app: restyle their layout and CSS, keep AccountGatePage and the first-line marker, and never add a form, input, password field or script to them.` Also add "acceso, cuenta" to that paragraph's list of page names.

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-pages.test.ts && npx tsc -p tsconfig.json --noEmit; cd ../api && npx jest src/storefront-source/agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-studio/src/source-pages.ts apps/merchant-studio/src/source-pages.test.ts apps/api/src/storefront-source/agent/agent-prompt.ts apps/api/src/storefront-source/agent/agent-prompt.spec.ts
git commit -m "feat(studio): list the account pages; YAPI treats them as gates" -- apps/merchant-studio/src/source-pages.ts apps/merchant-studio/src/source-pages.test.ts apps/api/src/storefront-source/agent/agent-prompt.ts apps/api/src/storefront-source/agent/agent-prompt.spec.ts
```

---

### Task 7: Whole-suite check and a real look at Bhakara

**Files:** none modified, except fixes the checks demand.

- [ ] **Step 1: Run the affected suites**

```bash
cd /Users/saramia/pagosYa
(cd apps/api && npx tsc --noEmit -p . | head && npx jest src/storefront-source src/store-seo)
(cd apps/checkout && npx vitest run)
(cd apps/merchant-studio && npx vitest run && npx tsc -p tsconfig.json --noEmit)
pnpm --filter @pagosya/storefront-kit test
```
Expected: all PASS. A failure caused by the new files (a test that counts pages, a template snapshot, a size limit) is fixed in the test or code that owns it, with its own commit. A failure unrelated to this work is reported with its output, not fixed.

- [ ] **Step 2: Rebuild the Studio**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && pnpm run build:studio
```
The API watcher (`nest start --watch`) recompiles by itself; confirm `lsof -tiTCP:3001 -sTCP:LISTEN` belongs to the watcher's child, not an orphan process.

- [ ] **Step 3: Look at it in the browser (the owner's store)**

With the dev stack running (`pnpm dev:chatgpt`), open `http://localhost:4323`, open the store in "Diseñar sitio", choose "Administrar páginas…" in the preview page picker, press "Agregar páginas estándar", then pick "Ingresar" and "Mis pedidos" in the picker. Expected: each page shows its title, sentence and button inside the store's Shell; the button reads "Cuenta no disponible" in the Studio preview (the preview has no checkout address) — that is correct. Report what you saw. Do not publish the revision.

- [ ] **Step 4: Report**

State which suites ran and passed, the commits made, and anything seen on screen that differs from the spec.
