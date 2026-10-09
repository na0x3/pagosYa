# Built-in Store Account Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every shopper account view (sign in, sign up, forgot/reset password, verification, orders, subscriptions, addresses, profile) inside each store with the store's design, replacing the sliding `/cuenta` overlay.

**Architecture:** The store runtime (`commerce.js`) renders the views into the existing `[data-account-gate]` slot and talks only to its trusted parent through a new `pagosya:account-request` bridge. The published store's parent (checkout `source-storefront.ts`) answers with the existing customer API and keeps the session token; the Studio answers with demo data. A password guard in the published parent drops store messages that carry a password. YAPI styles the views with `set_account_theme` (layout + sanitized CSS), saved as `config.accountTheme`.

**Tech Stack:** Plain JS runtime (`packages/storefront-kit/kit/commerce.js`), TypeScript packages (`shared-types`, `storefront-preview`), NestJS API (Jest), Vite apps `checkout` and `merchant-studio` (Vitest), Playwright visual sandbox for the theme check.

**Spec:** `docs/superpowers/specs/2026-10-08-store-built-in-account-pages-design.md`

## Global Constraints

- Store pages never call the API and never receive the session token, a verify token or a reset token.
- Bridge actions (exact): `state`, `login`, `register`, `verify`, `forgot`, `reset`, `me`, `update-me`, `orders`, `subscriptions`, `addresses`, `export`, `delete`, `logout`.
- Session key stays `pagosya:customer:<slug>` in the checkout origin's `localStorage` (existing `account-session.ts`).
- Layouts (exact): `card` (default), `split`, `minimal`, `panel`.
- `data-part` names (exact): `account`, `card`, `media`, `title`, `lead`, `form`, `field`, `label`, `input`, `hint`, `submit`, `link`, `error`, `notice`, `nav`, `nav-item`, `list`, `order`, `order-status`, `address`, `empty`, `danger`.
- Password guard ignores strings shorter than 8 characters (API minimum, `store-customers.service.ts`).
- Preview copy (exact): "Vista previa · No se crean cuentas". Network error copy (exact): "No pudimos conectar. Inténtalo de nuevo.".
- Theme storage: `config.accountTheme { layout, photo?, css? }` (the spec said `dna.accountTheme`; it is stored beside `productAssurances` instead so it carries over without the DNA re-seeding rules — Task 1 updates the spec line).
- Old `--account-background|foreground|accent|radius` variables in a store's CSS take precedence over the `--ui-*` defaults (this is the migration of `set_account_appearance`).
- Exported static sites (no `window.PAGOSYA_ACCOUNT_REQUEST`) keep today's gate link to `/cuenta/<slug>`.

## Review Focus

- An emailed reset link opened in a fresh tab: the token is read from `#restablecer=` on load and never reaches the store frame (Task 7 test).
- A store without `acceso-*`/`cuenta-*` page files: the footer "Mi cuenta" link still leads to the `/cuenta` app, never a dead link (Task 4 test: no parent → link).
- A session that expires mid-visit: `orders` answers 401 → the view shows sign-in with "Tu sesión terminó. Vuelve a ingresar." and returns to the page after signing in (Task 4 test).
- A review that legitimately contains the shopper's password as a word: dropped with a neutral message, the store keeps working (Task 7 wiring test).
- A YAPI theme hiding `[data-part=input]` or making `[data-part=submit]` transparent: the sanitizer drops it (Task 3) and verify catches anything left (Task 6).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/account-bridge.ts` (new) | Bridge contract: actions, view→page map, allowed body fields. |
| `packages/storefront-preview/src/account-bridge.ts` (new) | `mountSourceAccountBridge(frame, handler, guard?)`; `createPasswordGuard()`. |
| `packages/storefront-preview/src/source-preview.ts` | Injects `window.PAGOSYA_ACCOUNT_REQUEST` when `accountForms`; drops the slot runtime. |
| `packages/storefront-kit/kit/commerce.js` | Account views, layouts, kit CSS, routing, link fallback. |
| `apps/checkout/src/account/account-bridge-handler.ts` (new) | Live handler on the customer API; email tokens from the URL fragment. |
| `apps/checkout/src/source-storefront.ts` | Mounts the bridge and the guard instead of the overlay. |
| `apps/merchant-studio/src/source-account-demo.ts` (new, replaces `source-account-preview.ts`) | Demo handler for Studio and full-window preview. |
| `apps/api/src/storefront-source/account-theme.ts` (new) | Layouts, `resolveAccountTheme`, `normalizeAccountTheme`. |
| `apps/api/src/storefront-source/account-theme-check.ts` (new) | Browser check of sign-in / sign-up controls. |
| `apps/api/src/storefront-source/agent/agent-tools.ts` | `set_account_theme` replaces `set_account_appearance`; verify runs the check. |
| `apps/api/src/storefront-source/source-generation.service.ts` | Saves and carries `config.accountTheme`; checkpoint keeps it. |
| `apps/api/src/store-customers/store-customers.service.ts` | Email links to the store's pages. |
| Removed | `packages/storefront-preview/src/source-account-host.ts`, `source-account-slot.js` (+ tests, exports); `apps/merchant-studio/src/source-account-preview.ts`. |

---

### Task 1: Bridge contract

**Files:** Create `packages/shared-types/src/account-bridge.ts`, test `packages/shared-types/src/account-bridge.test.ts`; modify `packages/shared-types/src/index.ts`; spec storage line.

**Interfaces — Produces:** `ACCOUNT_ACTIONS`, `type AccountAction`, `type AccountGateView`, `ACCOUNT_VIEW_PAGES`, `ACCOUNT_PASSWORD_FIELDS`, `accountActionBody(action, body): Record<string, unknown> | null`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ACCOUNT_ACTIONS, ACCOUNT_VIEW_PAGES, accountActionBody } from './account-bridge';

describe('account bridge contract', () => {
  it('lists exactly the spec actions and maps every gate view to its page file', () => {
    expect(ACCOUNT_ACTIONS).toEqual(['state', 'login', 'register', 'verify', 'forgot', 'reset', 'me', 'update-me', 'orders', 'subscriptions', 'addresses', 'export', 'delete', 'logout']);
    expect(ACCOUNT_VIEW_PAGES).toEqual({ login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html', 'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html', profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html' });
  });
  it('keeps only the fields each action may send', () => {
    expect(accountActionBody('login', { email: ' a@b.bo ', password: 'secreto123', token: 'x' })).toEqual({ email: 'a@b.bo', password: 'secreto123' });
    expect(accountActionBody('reset', { password: 'nueva12345', token: 'stolen' })).toEqual({ password: 'nueva12345' });
    expect(accountActionBody('addresses', { addresses: [{ label: 'Casa', city: 'La Paz', evil: 1 }] })).toEqual({ addresses: [{ label: 'Casa', city: 'La Paz' }] });
    expect(accountActionBody('login', { email: 3 })).toBeNull();
    expect(accountActionBody('nope' as never, {})).toBeNull();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @pagosya/shared-types exec vitest run src/account-bridge.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
/** The store runtime ↔ trusted parent account bridge (spec 2026-10-08-store-built-in-account-pages-design). */
export const ACCOUNT_ACTIONS = ['state', 'login', 'register', 'verify', 'forgot', 'reset', 'me', 'update-me', 'orders', 'subscriptions', 'addresses', 'export', 'delete', 'logout'] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];
export type AccountGateView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'orders' | 'addresses' | 'profile' | 'subscriptions';
export const ACCOUNT_VIEW_PAGES: Record<AccountGateView, string> = {
  login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html',
  'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html',
  profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html',
};
/** The field of each action that carries a password, for the password guard. */
export const ACCOUNT_PASSWORD_FIELDS: Partial<Record<AccountAction, string>> = { login: 'password', register: 'password', reset: 'password', delete: 'password' };
const FIELDS: Record<AccountAction, readonly string[]> = {
  state: [], login: ['email', 'password'], register: ['name', 'email', 'password'], verify: [], forgot: ['email'], reset: ['password'],
  me: [], 'update-me': ['name', 'phone'], orders: [], subscriptions: [], addresses: [], export: [], delete: ['password'], logout: [],
};
const ADDRESS_FIELDS = ['id', 'label', 'recipient', 'phone', 'department', 'city', 'street', 'references'] as const;
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null;

export function accountActionBody(action: AccountAction, body: unknown): Record<string, unknown> | null {
  if (!(ACCOUNT_ACTIONS as readonly string[]).includes(action)) return null;
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const field of FIELDS[action]) {
    if (input[field] === undefined) continue;
    const value = text(input[field], field === 'password' ? 128 : 200);
    if (value === null) return null;
    out[field] = field === 'password' ? input[field] : value;
  }
  if (action === 'addresses') {
    const list = Array.isArray(input.addresses) ? input.addresses.slice(0, 10) : [];
    out.addresses = list.map(address => Object.fromEntries(ADDRESS_FIELDS.flatMap(key => { const value = text((address as Record<string, unknown>)?.[key], 200); return value === null ? [] : [[key, value]]; })));
  }
  return out;
}
```

Export from `index.ts`. Spec: replace the `dna.accountTheme` storage sentence with "Stored in `config.accountTheme { layout, photo?, css? }`, carried over between saves like `productAssurances`".
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat(accounts): the account bridge contract`.

---

### Task 2: Parent bridge and password guard

**Files:** Create `packages/storefront-preview/src/account-bridge.ts` (+ test); modify `index.ts`, `source-preview.ts:135-198` (+ `source-preview.test.ts`).

**Interfaces — Consumes** Task 1. **Produces:** `type AccountBridgeHandler = (action: AccountAction, body: Record<string, unknown>) => Promise<{ ok: boolean; body: unknown }>`; `type PasswordGuard = { remember(password: string): void; carries(payload: unknown): boolean }`; `createPasswordGuard()`; `mountSourceAccountBridge(frame, handler, guard?) => () => void`.

- [ ] **Step 1: Failing tests**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPasswordGuard, mountSourceAccountBridge } from './account-bridge';

describe('password guard', () => {
  it('catches a remembered password plain, reversed or base64, ignoring short ones', () => {
    const guard = createPasswordGuard();
    guard.remember('Gelato2026!'); guard.remember('corta');
    expect(guard.carries({ review: { text: 'me encantó gelato2026! sí' } })).toBe(true);
    expect(guard.carries(['x', '!6202otaleG'])).toBe(true);
    expect(guard.carries({ q: btoa('Gelato2026!') })).toBe(true);
    expect(guard.carries({ text: 'corta' })).toBe(false);
    expect(guard.carries({ text: 'Excelente helado' })).toBe(false);
  });
});
describe('account bridge', () => {
  it('answers only its own frame, only allowed actions, and never echoes a token', async () => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    const handler = vi.fn(async () => ({ ok: true, body: { signedIn: true, name: 'Ana', token: 'secret' } }));
    const guard = createPasswordGuard();
    const dispose = mountSourceAccountBridge(frame, handler, guard);
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { type: 'pagosya:account-request', id: 1, action: 'login', body: { email: 'a@b.bo', password: 'Gelato2026!' } } }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(handler).toHaveBeenCalledWith('login', { email: 'a@b.bo', password: 'Gelato2026!' });
    expect(post.mock.calls[0][0]).toEqual({ type: 'pagosya:account-response', id: 1, ok: true, body: { signedIn: true, name: 'Ana' } });
    expect(guard.carries('gelato2026!')).toBe(true);
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data: { type: 'pagosya:account-request', id: 2, action: 'me', body: {} } }));
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { type: 'pagosya:account-request', id: 3, action: 'drop-db', body: {} } }));
    await new Promise(r => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.at(-1)![0]).toEqual({ type: 'pagosya:account-response', id: 3, ok: false, body: { message: 'Solicitud no válida.' } });
    dispose();
  });
});
```

`source-preview.test.ts`: with `accountForms: true` the document contains `PAGOSYA_ACCOUNT_REQUEST` and `pagosya:account-request`; without it, neither; never `pagosya:account-slot`.
- [ ] **Step 2:** `pnpm --filter @pagosya/storefront-preview exec vitest run src/account-bridge.test.ts src/source-preview.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
import { ACCOUNT_PASSWORD_FIELDS, accountActionBody, type AccountAction } from '@pagosya/shared-types';
export type AccountBridgeHandler = (action: AccountAction, body: Record<string, unknown>) => Promise<{ ok: boolean; body: unknown }>;
export type PasswordGuard = { remember(password: string): void; carries(payload: unknown): boolean };
const SECRET_KEYS = /token|secret/i;

/** Remembers the passwords the store page sent this visit and finds them hidden in its other messages. */
export function createPasswordGuard(): PasswordGuard {
  const needles = new Set<string>();
  const strings = (value: unknown, out: string[] = [], depth = 0): string[] => {
    if (depth > 6) return out;
    if (typeof value === 'string') out.push(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach(item => strings(item, out, depth + 1));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out, depth + 1));
    return out;
  };
  return {
    remember(password) {
      if (typeof password !== 'string' || password.length < 8) return;
      let encoded = '';
      try { encoded = btoa(unescape(encodeURIComponent(password))); } catch { /* keep plain forms */ }
      for (const form of [password, [...password].reverse().join(''), encoded, encoded.replace(/=+$/, '')]) if (form.length >= 8) needles.add(form.toLowerCase());
    },
    carries(payload) {
      if (!needles.size) return false;
      return strings(payload).some(text => [...needles].some(needle => text.includes(needle)));
    },
  };
}

const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, strip(item)])) : value;

/** The trusted side of the bridge. Replies carry no token, whatever the handler returns. */
export function mountSourceAccountBridge(frame: HTMLIFrameElement, handler: AccountBridgeHandler, guard?: PasswordGuard): () => void {
  const receive = async (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'pagosya:account-request' || !Number.isSafeInteger(event.data.id)) return;
    const reply = (ok: boolean, body: unknown) => frame.contentWindow?.postMessage({ type: 'pagosya:account-response', id: event.data.id, ok, body: strip(body) }, '*');
    const action = event.data.action as AccountAction;
    const body = accountActionBody(action, event.data.body);
    if (!body) { reply(false, { message: 'Solicitud no válida.' }); return; }
    const field = ACCOUNT_PASSWORD_FIELDS[action];
    if (field && typeof body[field] === 'string') guard?.remember(body[field] as string);
    try { const result = await handler(action, body); reply(result.ok, result.body); }
    catch { reply(false, { message: 'No pudimos conectar. Inténtalo de nuevo.' }); }
  };
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
```

In `source-preview.ts`, inside the injected script after the `PAGOSYA_HOSTED_REQUEST` block:

```js
    if (${navigation.accountForms === true}) {
      let accountSequence = 0;
      window.PAGOSYA_ACCOUNT_REQUEST = (action, body) => new Promise((resolve, reject) => {
        const id = ++accountSequence;
        const receive = event => { if (event.source !== parent || event.data?.type !== 'pagosya:account-response' || event.data.id !== id) return; clearTimeout(timer); window.removeEventListener('message', receive); resolve({ ok: event.data.ok === true, body: event.data.body }); };
        const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('timeout')); }, 15000);
        window.addEventListener('message', receive);
        parent.postMessage({ type: 'pagosya:account-request', id, action, body }, '*');
      });
    }
```

Remove the `accountSlotRuntime` import and its append. Export the new names from `index.ts`.
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat(accounts): the trusted parent's account bridge and password guard`.

---

### Task 3: Account theme (API)

**Files:** Create `apps/api/src/storefront-source/account-theme.ts` (+ spec); modify `product-theme-css.ts` to expose `sanitizeThemeCss(input, profile)` with `profile = { parts, sizedParts, scope, keyframePrefix, refuse? }`, keeping `sanitizeProductThemeCss(input)` byte-identical.

**Interfaces — Produces:** `ACCOUNT_LAYOUTS`, `type AccountLayout`, `type AccountTheme = { layout; photo?; css? }`, `ACCOUNT_PARTS`, `resolveAccountTheme(input, assetPaths): { theme; dropped: string[] }`, `normalizeAccountTheme(value): AccountTheme | undefined`.

- [ ] **Step 1: Failing tests**

```ts
import { normalizeAccountTheme, resolveAccountTheme } from './account-theme';
describe('account theme', () => {
  it('keeps a known layout, a store photo and cosmetic CSS on account parts, scoped', () => {
    const { theme, dropped } = resolveAccountTheme({ layout: 'split', photo: 'assets/hero.jpg', css: '[data-part=title]{letter-spacing:.02em} [data-part=card]{border-radius:24px}' }, ['assets/hero.jpg']);
    expect(theme.layout).toBe('split');
    expect(theme.photo).toBe('assets/hero.jpg');
    expect(theme.css).toContain('[data-account-gate] [data-part=title]');
    expect(dropped).toEqual([]);
  });
  it('never lets CSS hide controls, and refuses foreign photos and layouts', () => {
    const { theme, dropped } = resolveAccountTheme({ layout: 'fullscreen', photo: 'https://evil.test/x.jpg', css: '[data-part=input]{display:none} [data-part=submit]{opacity:0} [data-part=error]{visibility:hidden} body{color:red}' }, ['assets/hero.jpg']);
    expect(theme).toEqual({ layout: 'card' });
    expect(dropped.length).toBeGreaterThanOrEqual(4);
  });
  it('is idempotent on a stored theme and drops garbage', () => {
    const { theme } = resolveAccountTheme({ layout: 'panel', css: '[data-part=lead]{font-size:18px}' }, []);
    expect(normalizeAccountTheme(theme)).toEqual(theme);
    expect(normalizeAccountTheme('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2:** `cd apps/api && npx jest src/storefront-source/account-theme.spec.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
import { sanitizeThemeCss } from './product-theme-css';
export const ACCOUNT_LAYOUTS = ['card', 'split', 'minimal', 'panel'] as const;
export type AccountLayout = (typeof ACCOUNT_LAYOUTS)[number];
export type AccountTheme = { layout: AccountLayout; photo?: string; css?: string };
export const ACCOUNT_PARTS = ['account', 'card', 'media', 'title', 'lead', 'form', 'field', 'label', 'input', 'hint', 'submit', 'link', 'error', 'notice', 'nav', 'nav-item', 'list', 'order', 'order-status', 'address', 'empty', 'danger'] as const;
/** Parts that must stay usable: restyled, never hidden, transparent, covered or shrunk. */
const PROTECTED = new Set(['input', 'submit', 'error', 'link', 'label', 'field', 'form']);
const HIDING = /^(display|visibility|opacity|clip|clip-path|width|height|max-width|max-height|font-size|transform|position|z-index|inset|top|left|right|bottom)$/;
const PROFILE = { parts: [...ACCOUNT_PARTS], sizedParts: ['card', 'media', 'account', 'nav', 'list', 'order', 'address'], scope: '[data-account-gate] ', keyframePrefix: 'at-', refuse: (part: string, property: string) => PROTECTED.has(part) && HIDING.test(property) };

export function resolveAccountTheme(input: unknown, assetPaths: string[]): { theme: AccountTheme; dropped: string[] } {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const dropped: string[] = [];
  const layout = (ACCOUNT_LAYOUTS as readonly string[]).includes(raw.layout as string) ? raw.layout as AccountLayout : 'card';
  if (raw.layout !== undefined && layout !== raw.layout) dropped.push(`layout ${String(raw.layout)}`);
  const photo = typeof raw.photo === 'string' && assetPaths.includes(raw.photo) && layout === 'split' ? raw.photo : undefined;
  if (raw.photo !== undefined && !photo) dropped.push('photo');
  const report = typeof raw.css === 'string' && raw.css.trim() ? sanitizeThemeCss(raw.css, PROFILE) : { css: '', dropped: [] };
  dropped.push(...report.dropped.map(item => `${item.rule ?? ''} ${item.declaration ?? ''}: ${item.reason}`.trim()));
  return { theme: { layout, ...(photo ? { photo } : {}), ...(report.css ? { css: report.css } : {}) }, dropped };
}

export function normalizeAccountTheme(value: unknown): AccountTheme | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return resolveAccountTheme(raw, typeof raw.photo === 'string' ? [raw.photo] : []).theme;
}
```

`refuse(part, property)` is consulted for every declaration of a rule whose compounds include `part`; a refusal drops the declaration with reason `protected part`.
- [ ] **Step 4:** run this spec and `product-theme-css.spec.ts` → PASS. **Step 5:** commit `feat(accounts): account theme layouts and guarded CSS`.

---

### Task 4: Account views in the store runtime

**Files:** Modify `packages/storefront-kit/kit/commerce.js` (the `renderAccountGates` section ~1146–1175 becomes the account module; today's body becomes `renderAccountGateLinks`); test `packages/storefront-kit/test/account-views.test.mjs` using the kit's existing runtime test loader (find it in `packages/storefront-kit/test`).

**Interfaces — Consumes:** `window.PAGOSYA_ACCOUNT_REQUEST`, `config.accountTheme`, `window.PAGOSYA_PREVIEW`. **Produces:** DOM inside `[data-account-gate]` with the Global Constraints parts.

- [ ] **Step 1: Failing tests** (jsdom page with `<main class="ui-account-gate" data-account-gate="login"><div class="ui-container"></div></main>`; `loadRuntime({ gate, request, preview, config })` returns helpers `document`, `fill(name, value)`, `submit()`, `value(name)`, `settle()`, `navigatedTo()`):

```js
test('signed out, the login view draws its parts and signs in through the bridge', async () => {
  const calls = [];
  const page = await loadRuntime({ gate: 'login', request: async (action, body) => { calls.push([action, body]); return action === 'state' ? { ok: true, body: { signedIn: false } } : { ok: true, body: { signedIn: true, name: 'Ana' } }; } });
  const root = page.document.querySelector('[data-part=account]');
  assert.equal(root.dataset.layout, 'card');
  for (const part of ['title', 'form', 'input', 'submit', 'link']) assert.ok(root.querySelector(`[data-part=${part}]`), part);
  page.fill('email', 'a@b.bo'); page.fill('password', 'Gelato2026!'); await page.submit();
  assert.deepEqual(calls[1], ['login', { email: 'a@b.bo', password: 'Gelato2026!' }]);
  assert.equal(page.navigatedTo(), 'cuenta-pedidos.html');
});
test('a failed login keeps what was typed and shows the message', async () => {
  const page = await loadRuntime({ gate: 'login', request: async action => action === 'state' ? { ok: true, body: { signedIn: false } } : { ok: false, body: { message: 'Correo o contraseña incorrectos.' } } });
  page.fill('email', 'a@b.bo'); page.fill('password', 'malmalmal'); await page.submit();
  assert.equal(page.document.querySelector('[data-part=error]').textContent, 'Correo o contraseña incorrectos.');
  assert.equal(page.value('email'), 'a@b.bo');
});
test('an account page signed out shows sign-in in place and returns there', async () => {
  const page = await loadRuntime({ gate: 'orders', request: async action => action === 'state' ? { ok: true, body: { signedIn: false } } : { ok: true, body: { signedIn: true, name: 'Ana' } } });
  page.fill('email', 'a@b.bo'); page.fill('password', 'Gelato2026!'); await page.submit();
  assert.equal(page.navigatedTo(), 'cuenta-pedidos.html');
});
test('an expired session falls back to sign-in with a short message', async () => {
  const page = await loadRuntime({ gate: 'orders', request: async action => action === 'state' ? { ok: true, body: { signedIn: true, name: 'Ana' } } : { ok: false, body: { status: 401, message: 'Sesión vencida' } } });
  await page.settle();
  assert.match(page.document.querySelector('[data-part=notice]').textContent, /Tu sesión terminó/);
});
test('without a trusted parent the gate keeps the account-app link', async () => {
  const page = await loadRuntime({ gate: 'login', request: undefined, config: { slug: 'cafe', checkoutOrigin: 'https://pagos.test' } });
  assert.equal(page.document.querySelector('[data-part=account]'), null);
  assert.ok(page.document.querySelector('a[data-pagosya-account]').href.startsWith('https://pagos.test/cuenta/cafe'));
});
test('the preview note, the theme layout and its css apply', async () => {
  const page = await loadRuntime({ gate: 'register', preview: true, config: { accountTheme: { layout: 'split', photo: 'assets/hero.jpg', css: '[data-account-gate] [data-part=title]{letter-spacing:1px}' } }, request: async () => ({ ok: true, body: { signedIn: false } }) });
  assert.equal(page.document.querySelector('[data-part=notice]').textContent, 'Vista previa · No se crean cuentas');
  assert.equal(page.document.querySelector('[data-part=account]').dataset.layout, 'split');
  assert.equal(page.document.querySelector('[data-part=media] img').getAttribute('src'), 'assets/hero.jpg');
  assert.ok(page.document.querySelector('style[data-pagosya-kit=account-theme]').textContent.includes('letter-spacing'));
});
test('API text is escaped', async () => {
  const page = await loadRuntime({ gate: 'orders', request: async action => action === 'state' ? { ok: true, body: { signedIn: true, name: '<img onerror=x>' } } : { ok: true, body: [{ id: 'o1', status: 'PAID', amount: 1000, currency: 'BOB', createdAt: '2026-10-01', items: [{ name: '<b>x</b>' }] }] } });
  await page.settle();
  assert.equal(page.document.querySelector('[data-part=account] img[onerror]'), null);
  assert.equal(page.document.querySelector('[data-part=account] b'), null);
});
```

- [ ] **Step 2:** run the kit tests → FAIL.
- [ ] **Step 3: Implement** (helpers `escape`, `preview`, `config` exist in the runtime):

```js
  const ACCOUNT_PAGES = { login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html', 'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html', profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html' };
  const ACCOUNT_LAYOUTS = ['card', 'split', 'minimal', 'panel'];
  const SIGNED_IN = ['orders', 'addresses', 'profile', 'subscriptions'];
  const accountBridge = typeof window.PAGOSYA_ACCOUNT_REQUEST === 'function' ? window.PAGOSYA_ACCOUNT_REQUEST : null;
  const accountAsk = async (action, body = {}) => { try { return await accountBridge(action, body); } catch { return { ok: false, body: { message: 'No pudimos conectar. Inténtalo de nuevo.' } }; } };
  const accountTheme = () => { const t = config.accountTheme && typeof config.accountTheme === 'object' ? config.accountTheme : {}; return { layout: ACCOUNT_LAYOUTS.includes(t.layout) ? t.layout : 'card', photo: typeof t.photo === 'string' ? t.photo : '', css: typeof t.css === 'string' ? t.css : '' }; };
  const goTo = page => { const link = document.createElement('a'); link.href = page; link.hidden = true; document.body.append(link); link.click(); link.remove(); };
  const accountField = (name, label, type, autocomplete) => `<label data-part="field"><span data-part="label">${escape(label)}</span><input data-part="input" name="${name}" type="${type}" autocomplete="${autocomplete}" required></label>`;
  const ACCOUNT_FORMS = {
    login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y compra más rápido.', fields: [['email', 'Correo', 'email', 'email'], ['password', 'Contraseña', 'password', 'current-password']], submit: 'Ingresar', action: 'login', links: [['register', '¿No tienes cuenta? Crea una'], ['forgot-password', '¿Olvidaste tu contraseña?']] },
    register: { title: 'Crea tu cuenta', lead: 'Sigue tus pedidos y guarda tus direcciones.', fields: [['name', 'Nombre', 'text', 'name'], ['email', 'Correo', 'email', 'email'], ['password', 'Contraseña (8 caracteres o más)', 'password', 'new-password']], submit: 'Crear cuenta', action: 'register', links: [['login', 'Ya tengo una cuenta']] },
    'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace para elegir una nueva.', fields: [['email', 'Correo', 'email', 'email']], submit: 'Enviar enlace', action: 'forgot', links: [['login', 'Volver a ingresar']] },
    'reset-password': { title: 'Elige una contraseña nueva', lead: 'Usa 8 caracteres o más.', fields: [['password', 'Contraseña nueva', 'password', 'new-password']], submit: 'Guardar contraseña', action: 'reset', links: [['login', 'Volver a ingresar']] },
  };
  function accountFrame(slot, inner) {
    const { layout, photo } = accountTheme();
    const media = layout === 'split' && photo ? `<figure data-part="media"><img src="${escape(photo)}" alt=""></figure>` : '';
    slot.innerHTML = `<section data-part="account" data-layout="${layout}">${media}<div data-part="card">${preview ? '<p data-part="notice">Vista previa · No se crean cuentas</p>' : ''}${inner}</div></section>`;
  }
  function accountForm(slot, view, { notice = '', after = '' } = {}) {
    const form = ACCOUNT_FORMS[view];
    accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="lead">${escape(form.lead)}</p>${notice ? `<p data-part="notice">${escape(notice)}</p>` : ''}<form data-part="form" novalidate>${form.fields.map(f => accountField(...f)).join('')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">${escape(form.submit)}</button></form>${form.links.map(([target, label]) => `<a data-part="link" href="${ACCOUNT_PAGES[target]}">${escape(label)}</a>`).join('')}`);
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const error = slot.querySelector('[data-part=error]'); error.textContent = '';
      const button = slot.querySelector('[data-part=submit]'); button.disabled = true;
      const result = await accountAsk(form.action, Object.fromEntries(new FormData(event.target)));
      button.disabled = false;
      if (!result.ok) { error.textContent = result.body?.message || 'No pudimos completar la operación.'; return; }
      if (form.action === 'login') goTo(after || ACCOUNT_PAGES.orders);
      else if (form.action === 'reset') goTo(ACCOUNT_PAGES.login);
      else accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="notice">${escape(result.body?.message || 'Listo. Revisa tu correo.')}</p><a data-part="link" href="${ACCOUNT_PAGES.login}">Ir a ingresar</a>`);
    });
  }
```

plus `accountSignedIn(slot, view, name)` (nav with `aria-current`, "Salir" → `logout` then sign-in page; 401 → `accountForm(slot, 'login', { notice: 'Tu sesión terminó. Vuelve a ingresar.', after: ACCOUNT_PAGES[view] })`), `accountList(view, result)` (escaped orders/subscriptions/addresses/profile with `empty` states, profile edit → `update-me`, addresses → `addresses`, "Descargar mis datos" → `export`, `danger` block with password → `delete`), and

```js
  async function renderAccountGates() {
    if (!accountBridge) { renderAccountGateLinks(); return; }
    const slots = [...document.querySelectorAll('[data-account-gate]')];
    if (!slots.length) { renderAccountGateLinks(); return; }
    const theme = accountTheme();
    if (theme.css && theme.css.length <= 8000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|!\s*important/i.test(theme.css)) {
      const style = document.createElement('style'); style.dataset.pagosyaKit = 'account-theme'; style.textContent = theme.css; document.head.append(style);
    }
    const state = await accountAsk('state');
    for (const gate of slots) {
      const view = gate.getAttribute('data-account-gate');
      const slot = gate.querySelector('.ui-container') || gate;
      if (SIGNED_IN.includes(view)) { if (state.ok && state.body?.signedIn) await accountSignedIn(slot, view, state.body.name); else accountForm(slot, 'login', { after: ACCOUNT_PAGES[view] }); }
      else if (view === 'login' && state.ok && state.body?.signedIn && !preview) goTo(ACCOUNT_PAGES.orders);
      else if (ACCOUNT_FORMS[view]) accountForm(slot, view);
    }
  }
```

Kit CSS (in the runtime's kit layer):

```css
[data-account-gate] [data-part=account]{--acc-bg:var(--account-background,var(--ui-paper,#fff));--acc-ink:var(--account-foreground,var(--ui-ink,#111));--acc-accent:var(--account-accent,var(--ui-accent,#111));--acc-radius:var(--account-radius,var(--ui-radius-control,10px));display:grid;gap:var(--ui-s5,24px);color:var(--acc-ink)}
[data-account-gate] [data-layout=card] [data-part=card]{max-width:440px;margin-inline:auto;padding:clamp(24px,4vw,40px);background:var(--ui-surface,var(--acc-bg));border:1px solid var(--ui-line,#0002);border-radius:calc(var(--acc-radius) * 1.6)}
[data-account-gate] [data-layout=split]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}
[data-account-gate] [data-layout=split] [data-part=media] img{width:100%;height:100%;object-fit:cover;border-radius:var(--ui-radius-media,12px)}
[data-account-gate] [data-layout=minimal] [data-part=card]{max-width:560px}
[data-account-gate] [data-layout=panel]{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
[data-account-gate] [data-part=form]{display:grid;gap:var(--ui-s4,16px)}
[data-account-gate] [data-part=field]{display:grid;gap:6px}
[data-account-gate] [data-part=label]{font-size:.85em;font-weight:600}
[data-account-gate] [data-part=input]{min-height:48px;padding:0 14px;border:1px solid var(--ui-line,#0003);border-radius:var(--acc-radius);background:var(--acc-bg);color:var(--acc-ink);font:inherit}
[data-account-gate] [data-part=submit]{min-height:48px;background:var(--acc-accent);color:var(--ui-on-accent,#fff);border-radius:var(--acc-radius)}
[data-account-gate] [data-part=error]:empty{display:none}
[data-account-gate] [data-part=error]{color:#b42318;font-weight:600}
[data-account-gate] [data-part=nav]{display:flex;flex-wrap:wrap;gap:8px 16px}
@media (max-width:720px){[data-account-gate] [data-layout=split],[data-account-gate] [data-layout=panel]{grid-template-columns:1fr}[data-account-gate] [data-layout=split] [data-part=media]{max-height:220px;overflow:hidden}}
```

- [ ] **Step 4:** run the kit tests (new + existing) → PASS. **Step 5:** commit `feat(accounts): the store runtime draws the account pages`.

---

### Task 5: YAPI tool, saving and carry-over

**Files:** `agent/agent-tools.ts` (tool list ~42, handler ~208, `pendingAccountTheme`), `agent/agent-prompt.ts`, `source-generation.service.ts` (checkpoint, config merge ~1376, `accountThemeAllowed`); tests in `agent-tools.spec.ts`, `source-generation-agent.spec.ts`.

**Interfaces — Consumes** Task 3. **Produces:** tool `set_account_theme { layout|null, photo|null, css|null }`, `AgentToolbox.pendingAccountTheme: AccountTheme | null`, `config.accountTheme`.

- [ ] **Step 1: Failing tests**

```ts
it('set_account_theme stores a sanitized theme and reports what it dropped', async () => {
  const box = toolbox({ instruction: 'haz el login más elegante', accountThemeAllowed: true });
  const result = await box.run('set_account_theme', JSON.stringify({ layout: 'split', photo: 'assets/hero.jpg', css: '[data-part=input]{display:none}' }));
  expect(box.pendingAccountTheme).toEqual({ layout: 'split', photo: 'assets/hero.jpg' });
  expect(result.output).toContain('protected part');
});
it('refuses the tool on an edit that is not about the account', async () => {
  const box = toolbox({ instruction: 'cambia el footer', accountThemeAllowed: false });
  expect((await box.run('set_account_theme', JSON.stringify({ layout: 'panel' }))).output).toContain('no cambia la cuenta');
  expect(box.pendingAccountTheme).toBeNull();
});
```

Generation: a run whose agent calls `set_account_theme {layout:'panel'}` saves `"accountTheme":{"layout":"panel"}` in `config.js`; a later edit that does not call it keeps it.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**
  - Tool spec text: `Diseña las páginas de cuenta (ingresar, registro, pedidos, perfil): layout card|split|minimal|panel, photo (ruta assets/ de la tienda, solo split) y CSS opcional sobre [data-part=…]. Los campos, el botón, los errores y los enlaces nunca se ocultan. null conserva el valor.`; remove `set_account_appearance` from the list and `AgentToolName`.
  - Handler:

```ts
      case 'set_account_theme': {
        if (!this.ctx.accountThemeAllowed) return { output: 'Este pedido no cambia la cuenta.' };
        const assets = [...this.workspace.files(), ...(this.ctx.base?.files ?? [])].filter(f => f.path.startsWith('assets/')).map(f => f.path);
        const merged = { ...(this.pendingAccountTheme ?? {}), ...Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null)) };
        const { theme, dropped } = resolveAccountTheme(merged, assets);
        this.pendingAccountTheme = theme;
        step('set_account_theme', 'Diseñó las páginas de cuenta');
        return { output: dropped.length ? 'Tema de cuenta guardado. Se quitó: ' + dropped.join('; ') : 'Tema de cuenta guardado.' };
      }
```

  - Context: `accountThemeAllowed: isNew || redesign || /cuenta|login|ingres|registro|contraseña|perfil|pedidos|acceso/i.test(dto.instruction)` beside `themeAllowed`.
  - Checkpoint: add `accountTheme: toolbox.pendingAccountTheme`; on resume `toolbox.pendingAccountTheme = normalizeAccountTheme(checkpoint.accountTheme) ?? null`.
  - Config merge: `const accountTheme = agentAccountTheme ?? normalizeAccountTheme(previousConfig.accountTheme);` spread `...(accountTheme ? { accountTheme } : {})` into `config` (where `agentAccountTheme = toolbox.pendingAccountTheme` is captured next to `agentTheme`).
  - Prompt (after PRODUCT PAGE THEME): `ACCOUNT PAGES. Sign-in, sign-up and account pages are drawn by the platform with the store's tokens. On a new store or a redesign, call set_account_theme once with a layout that suits the brand (split needs one of the store's own photos) and optional CSS on the account parts; on other edits only when the request concerns the account.`
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat(accounts): YAPI designs the account pages with set_account_theme`.

---

### Task 6: Account check in verify

**Files:** Create `apps/api/src/storefront-source/account-theme-check.ts` (+ spec); modify `agent-tools.ts` (verify runs it when `pendingAccountTheme?.css`).

**Interfaces — Produces:** `checkAccountThemeOnSnapshot(snapshot, { signal? }): Promise<ThemeCheckFailure[]>`.

- [ ] **Step 1: Failing test** (sandbox fixtures as in `product-theme-check.spec.ts`): `config.accountTheme.css` making `[data-part=submit]` 10px tall → failures include `{ control: 'submit', viewport: 'mobile' }` and `desktop` with reason matching `/too small/`; the default theme → `[]`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** following `checkProductThemeOnSnapshot`: in `withVisualSandbox`, `page.addInitScript(() => { window.PAGOSYA_ACCOUNT_REQUEST = async () => ({ ok: true, body: { signedIn: false } }); })`, load `acceso-ingresar.html` and `acceso-registro.html`, wait for `[data-part=form]`, set `[data-part=error]` text to `Mensaje de prueba`, and measure `input`, `submit`, `link`, `error` at 390×844 and 1280×800 (hidden/zero-sized, opacity < 0.6, covered, submit < 120×44, input height < 40, submit contrast < 4.5:1). In `agent-tools.ts` a failure sets `pendingAccountTheme = { ...theme, css: undefined }` and reports `Se quitó el CSS de las páginas de cuenta: <failures>`.
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat(accounts): verify checks the account pages stay usable`.

---

### Task 7: Published store bridge (checkout)

**Files:** Create `apps/checkout/src/account/account-bridge-handler.ts` (+ test); modify `apps/checkout/src/source-storefront.ts` (imports, lines 124–125, top of `receive`, pagehide, initial page for email tokens).

**Interfaces — Consumes** Task 2, `accountApi`, `readSession`/`saveSession`/`clearSession`. **Produces:** `createAccountBridgeHandler(slug, { preview, emailToken, download }): AccountBridgeHandler`; `takeAccountEmailToken(location, history): { kind: 'verificar' | 'restablecer'; token: string } | null`.

- [ ] **Step 1: Failing tests**

```ts
it('signs in, keeps the token here and answers only with the name', async () => {
  vi.spyOn(accountApi, 'login').mockResolvedValue({ token: 't1', expiresAt: '2999-01-01', customer: { name: 'Ana' } } as any);
  const handle = createAccountBridgeHandler('cafe', { preview: false, emailToken: () => null, download: vi.fn() });
  expect(await handle('login', { email: 'a@b.bo', password: 'Gelato2026!' })).toEqual({ ok: true, body: { signedIn: true, name: 'Ana' } });
  expect(readSession('cafe')).toBe('t1');
});
it('adds the emailed reset token itself', async () => {
  const reset = vi.spyOn(accountApi, 'resetPassword').mockResolvedValue({ ok: true });
  const handle = createAccountBridgeHandler('cafe', { preview: false, emailToken: () => ({ kind: 'restablecer', token: 'rt' }), download: vi.fn() });
  expect(await handle('reset', { password: 'nueva12345' })).toEqual({ ok: true, body: { ok: true } });
  expect(reset).toHaveBeenCalledWith('cafe', { token: 'rt', password: 'nueva12345' });
});
it('answers 401 as signed out and clears the session', async () => {
  saveSession('cafe', { token: 'old', expiresAt: '2999-01-01' });
  vi.spyOn(accountApi, 'orders').mockRejectedValue(new AccountError('Sesión vencida', 401));
  const handle = createAccountBridgeHandler('cafe', { preview: false, emailToken: () => null, download: vi.fn() });
  expect(await handle('orders', {})).toEqual({ ok: false, body: { status: 401, message: 'Sesión vencida' } });
  expect(readSession('cafe')).toBeNull();
});
it('takes #restablecer= out of the address bar once', () => {
  history.replaceState(null, '', '/s/cafe?source_page=acceso-restablecer-contrasena.html#restablecer=abcdefghijklmnop');
  expect(takeAccountEmailToken(location, history)).toEqual({ kind: 'restablecer', token: 'abcdefghijklmnop' });
  expect(location.hash).toBe('');
});
it('in the merchant preview never calls the API', async () => {
  const login = vi.spyOn(accountApi, 'login');
  const handle = createAccountBridgeHandler('cafe', { preview: true, emailToken: () => null, download: vi.fn() });
  expect((await handle('login', { email: 'a@b.bo', password: 'Gelato2026!' })).ok).toBe(true);
  expect(login).not.toHaveBeenCalled();
});
```

Wiring (in the storefront test harness if one exists, else a focused test of a `guardedMessage(passwords, data)` helper extracted for it): a review `pagosya:hosted-request` and a `pagosya:analytics` message containing a password sent through `login` are not processed; the review gets `{ ok:false, body:{ message:'No se pudo enviar.' } }`.
- [ ] **Step 2:** `pnpm --filter @pagosya/checkout exec vitest run src/account/account-bridge-handler.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
import type { AccountBridgeHandler } from '@pagosya/storefront-preview';
import { AccountError, accountApi } from './account-api';
import { clearSession, readSession, saveSession } from './account-session';

type EmailToken = { kind: 'verificar' | 'restablecer'; token: string };
export function takeAccountEmailToken(loc: Location, hist: History): EmailToken | null {
  const match = /^#(verificar|restablecer)=([A-Za-z0-9_-]{16,200})$/.exec(loc.hash);
  if (!match) return null;
  hist.replaceState(hist.state, '', loc.pathname + loc.search);
  return { kind: match[1] as EmailToken['kind'], token: match[2] };
}

export function createAccountBridgeHandler(slug: string, options: { preview: boolean; emailToken: () => EmailToken | null; download: (data: unknown) => void }): AccountBridgeHandler {
  const ok = (body: unknown) => ({ ok: true, body });
  return async (action, body) => {
    if (options.preview) return ok(action === 'state' ? { signedIn: false } : { message: 'Vista previa · No se crean cuentas' });
    try {
      const token = readSession(slug);
      switch (action) {
        case 'state': { if (!token) return ok({ signedIn: false }); const me = await accountApi.me(slug, token); return ok({ signedIn: true, name: me.name }); }
        case 'login': { const session = await accountApi.login(slug, body as { email: string; password: string }); saveSession(slug, session); return ok({ signedIn: true, name: session.customer.name }); }
        case 'register': return ok(await accountApi.register(slug, body as { name: string; email: string; password: string }));
        case 'forgot': return ok(await accountApi.forgotPassword(slug, String(body.email)));
        case 'verify': { const email = options.emailToken(); if (email?.kind !== 'verificar') return { ok: false, body: { message: 'El enlace de verificación no es válido.' } }; return ok(await accountApi.verifyEmail(slug, email.token)); }
        case 'reset': { const email = options.emailToken(); if (email?.kind !== 'restablecer') return { ok: false, body: { message: 'Pide un enlace nuevo desde «¿Olvidaste tu contraseña?».' } }; return ok(await accountApi.resetPassword(slug, { token: email.token, password: String(body.password) })); }
        case 'logout': { if (token) await accountApi.logout(slug, token).catch(() => undefined); clearSession(slug); return ok({ signedIn: false }); }
      }
      if (!token) return { ok: false, body: { status: 401, message: 'Ingresa para ver tu cuenta.' } };
      switch (action) {
        case 'me': return ok(await accountApi.me(slug, token));
        case 'update-me': return ok(await accountApi.updateProfile(slug, token, { name: String(body.name ?? ''), phone: String(body.phone ?? '') }));
        case 'orders': return ok(await accountApi.orders(slug, token));
        case 'subscriptions': return ok(await accountApi.subscriptions(slug, token));
        case 'addresses': return ok(await accountApi.replaceAddresses(slug, token, body.addresses as never));
        case 'export': { options.download(await accountApi.exportData(slug, token)); return ok({ message: 'Descargamos tus datos.' }); }
        case 'delete': { await accountApi.deleteAccount(slug, token, String(body.password)); clearSession(slug); return ok({ signedIn: false }); }
      }
      return { ok: false, body: { message: 'Solicitud no válida.' } };
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) { clearSession(slug); return { ok: false, body: { status: 401, message: error.message } }; }
      return { ok: false, body: { message: error instanceof AccountError ? error.message : 'No pudimos conectar. Inténtalo de nuevo.' } };
    }
  };
}
```

`source-storefront.ts`: replace the overlay mount with

```ts
  const emailToken = takeAccountEmailToken(location, history);
  const passwords = createPasswordGuard();
  const disposeAccount = mountSourceAccountBridge(frame, createAccountBridgeHandler(slug, { preview: merchantPreview, emailToken: () => emailToken, download: data => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `mis-datos-${slug}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }), passwords);
```

At the top of `receive`, after the frame/origin check:

```ts
    if (data?.type !== 'pagosya:account-request' && passwords.carries(data)) {
      if (data?.type === 'pagosya:hosted-request' && Number.isSafeInteger(data.id)) (event.source as Window).postMessage({ type: 'pagosya:hosted-response', id: data.id, result: { ok: false, body: { message: 'No se pudo enviar.' } } }, '*');
      return;
    }
```

Initial page: `emailToken?.kind === 'restablecer'` → `acceso-restablecer-contrasena.html`; `verificar` → `acceso-ingresar.html`, and the handler's `state` returns `{ signedIn: false, verified: <result of verifyEmail> }` once so the login view shows "Tu correo quedó confirmado. Ya puedes ingresar." (runtime: `state.body.verified === true` → notice).
- [ ] **Step 4:** run checkout tests → PASS. **Step 5:** commit `feat(accounts): the published store answers the account bridge and guards passwords`.

---

### Task 8: Studio demo bridge

**Files:** Create `apps/merchant-studio/src/source-account-demo.ts` (+ test); delete `source-account-preview.ts`; modify `source-studio.ts:4,260`, `source-browser.ts:1,37-40`.

**Interfaces — Consumes** Task 2. **Produces:** `demoAccountHandler: AccountBridgeHandler`, `mountSourceAccountDemo(frame) => () => void`.

- [ ] **Step 1: Failing test**

```ts
it('behaves like a store and sends nothing: two demo orders after a demo sign-in', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  expect(await demoAccountHandler('state', {})).toEqual({ ok: true, body: { signedIn: false } });
  expect(await demoAccountHandler('login', { email: 'a@b.bo', password: 'x' })).toEqual({ ok: true, body: { signedIn: true, name: 'Cliente de prueba' } });
  const orders = await demoAccountHandler('orders', {});
  expect((orders.body as unknown[]).length).toBe(2);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**

```ts
import { mountSourceAccountBridge, type AccountBridgeHandler } from '@pagosya/storefront-preview';
let signedIn = false;
const DEMO_ORDERS = [
  { id: 'demo-1', status: 'DELIVERED', amount: 8500, currency: 'BOB', createdAt: '2026-09-28T15:00:00Z', items: [{ name: 'Producto de muestra', quantity: 1 }] },
  { id: 'demo-2', status: 'PAID', amount: 15900, currency: 'BOB', createdAt: '2026-10-05T18:30:00Z', items: [{ name: 'Otro producto', quantity: 2 }] },
];
/** Studio and full-window preview: the forms behave, nothing is created or sent. */
export const demoAccountHandler: AccountBridgeHandler = async (action, body) => {
  switch (action) {
    case 'state': return { ok: true, body: signedIn ? { signedIn: true, name: 'Cliente de prueba' } : { signedIn: false } };
    case 'login': signedIn = true; return { ok: true, body: { signedIn: true, name: 'Cliente de prueba' } };
    case 'logout': case 'delete': signedIn = false; return { ok: true, body: { signedIn: false } };
    case 'orders': return { ok: true, body: DEMO_ORDERS };
    case 'subscriptions': return { ok: true, body: [] };
    case 'me': return { ok: true, body: { name: 'Cliente de prueba', email: 'cliente@ejemplo.bo', phone: '', addresses: [] } };
    case 'addresses': case 'update-me': return { ok: true, body: { ...body, message: 'Vista previa · No se guardan cambios' } };
    default: return { ok: true, body: { message: 'Vista previa · No se crean cuentas' } };
  }
};
export const mountSourceAccountDemo = (frame: HTMLIFrameElement) => mountSourceAccountBridge(frame, demoAccountHandler);
```

Replace the `mountSourceAccountPreview(frame, …)` calls with `mountSourceAccountDemo(frame)`; navigation between account pages now uses the normal page links.
- [ ] **Step 4:** run Studio tests (`source-account-demo`, `source-browser`, `source-studio`) → PASS. **Step 5:** commit `feat(accounts): the Studio answers the account bridge with demo data`.

---

### Task 9: Email links; remove the overlay

**Files:** `apps/api/src/store-customers/store-customers.service.ts:58` (+ spec); delete `packages/storefront-preview/src/source-account-host.ts`, `source-account-slot.js` and tests; update comments in `source-static-pages.ts:30-32` and `ui.tsx:566-567`.

- [ ] **Step 1: Failing test:** verify link = `${checkoutOrigin}/s/<slug>?source_page=acceso-ingresar.html#verificar=<token>`; reset link = `${checkoutOrigin}/s/<slug>?source_page=acceso-restablecer-contrasena.html#restablecer=<token>`.
- [ ] **Step 2:** `cd apps/api && npx jest src/store-customers/store-customers.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement** at line 58 (keeping the surrounding names for the view and token):

```ts
const page = view === 'verificar' ? 'acceso-ingresar.html' : 'acceso-restablecer-contrasena.html';
const url = new URL(`/s/${encodeURIComponent(slug)}`, this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174');
url.searchParams.set('source_page', page);
url.hash = `${view}=${token}`;
```

Delete the overlay files and exports; `grep -rn "source-account-host\|source-account-slot\|mountSourceAccountHost\|pagosya:account-slot" apps packages --include=*.ts --include=*.js` returns nothing outside `dist/`.
- [ ] **Step 4:** run the spec and typecheck `api`, `checkout`, `merchant-studio`, `storefront-preview` → PASS. **Step 5:** commit `feat(accounts): emails link to the store's pages; the overlay is removed`.

---

### Task 10: Rebuild and browser verification

- [ ] `cd apps/merchant-dashboard && pnpm run build:studio`; confirm the API watcher reloaded (`apps/api/dist/src/storefront-source/account-theme.js` timestamp).
- [ ] Studio, "QA Plantilla Trigo" → page Ingresar: form in the store's design, preview note, scrolling moves the form with the page, "Crear cuenta" opens the registration page, demo sign-in shows two demo orders.
- [ ] Published dev store (`/s/<slug>`): register, follow the verification link from the dev mail log, sign in, see orders, reset password through the emailed link, sign out.
- [ ] 390px: all layouts stack, no sideways scroll.
- [ ] YAPI on a test store: "haz el login con la foto de la tienda al lado" → `set_account_theme {layout:'split'}` saved and visible.

---

## Self-review

- Spec coverage: runtime views (T4); bridge (T1–T2); parents (T7–T8); email links (T9); guard (T2, T7); retired code (T9); automatic look (T4 CSS); layouts, theme, tool, carry-over (T3, T5); verify (T6); errors (T4, T7); browser checks (T10).
- Names used across tasks: `AccountAction`, `AccountBridgeHandler`, `PasswordGuard`, `AccountTheme`, `ThemeCheckFailure`, `ACCOUNT_VIEW_PAGES` — each defined once.
