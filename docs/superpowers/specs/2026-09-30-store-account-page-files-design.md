# Account and login pages as files in every store (sub-project 1 of Full theme tree)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Builds on
[store-page-architecture](2026-09-30-store-page-architecture-design.md),
[store-customer-accounts](2026-09-30-store-customer-accounts-design.md) and
[store-studio-pages](2026-09-30-store-studio-pages-design.md).

## Owner's request and decisions (2026-09-30)

The owner compared a store project (about 6 files) with Amboras' Default Theme (178 files, one folder per page including
`account` and `auth`, shown read-only in a Code tab) and asked for the same shape. Answers given in conversation:

| Question | Decision |
|---|---|
| What is wanted | A full copy of the theme: every page, including account and login, as its own file |
| Who edits | **View everything, edit through YAPI**; platform-critical files stay read-only (as in Amboras) |
| How it is stored | **Pages are real files in the store; the platform scaffold is a read-only virtual view** |

The program splits into four sub-projects, each with its own spec, plan and build:

1. **This one:** account and login pages as files in every store.
2. Read-only theme tree in the Code tab (scaffold, runtime config, folder view).
3. Header login/account icon, and the preview page picker covering the new pages.
4. One-click upgrade for stores that already exist (Bhakara and older).

## Goal

Every store project contains a file for each customer-access page (login, register, forgot password, reset password) and
each account page (orders, addresses, profile, subscriptions), in the folders `components/auth/` and
`components/account/`. Each page opens inside the store's own design (its `Shell`), YAPI can restyle it by editing that
file, and the shopper reaches the real, trusted form with one click.

## What exists (verified 2026-09-30)

- Route slugs for these files are already reserved in `apps/api/src/storefront-source/source-next.ts`:
  `auth/login → acceso-ingresar`, `auth/register → acceso-registro`, `auth/forgot-password → acceso-olvide-mi-contrasena`,
  `auth/reset-password → acceso-restablecer-contrasena`, `account/orders → cuenta-pedidos`,
  `account/addresses → cuenta-direcciones`, `account/profile → cuenta-perfil`, `account/subscriptions → cuenta-suscripciones`
  (plus `downloads` and `payment-methods`, which are not built).
- The working account pages are served by the checkout app on its own origin at `/cuenta/<slug>[/<view>]`
  (`ingresar`, `registro`, `recuperar`, `verificar`, `restablecer`, `pedidos`, `suscripciones`, `direcciones`, `perfil`).
- **Security rule from the customer-accounts spec:** authored store code runs in the sandboxed frame and must never receive
  a password or personal data. Account forms therefore stay on the checkout origin. The store reaches them through the
  `pagosya:source-external` bridge, which already allows exactly `/cuenta/<slug>`.
- `withStandardPages(files)` and the `standard-pages` endpoint add the eleven content and catalog pages to an existing
  store; the files carry the `// @pagosya-page` marker.

## Design

### File model

Eight thin page files, each starting with the `// @pagosya-page` marker:

| File | Slug | Opens (checkout origin) |
|---|---|---|
| `components/auth/login.tsx` | `acceso-ingresar` | `/cuenta/<slug>` |
| `components/auth/register.tsx` | `acceso-registro` | `/cuenta/<slug>/registro` |
| `components/auth/forgot-password.tsx` | `acceso-olvide-mi-contrasena` | `/cuenta/<slug>/recuperar` |
| `components/auth/reset-password.tsx` | `acceso-restablecer-contrasena` | `/cuenta/<slug>/restablecer` |
| `components/account/orders.tsx` | `cuenta-pedidos` | `/cuenta/<slug>/pedidos` |
| `components/account/addresses.tsx` | `cuenta-direcciones` | `/cuenta/<slug>/direcciones` |
| `components/account/profile.tsx` | `cuenta-perfil` | `/cuenta/<slug>/perfil` |
| `components/account/subscriptions.tsx` | `cuenta-suscripciones` | `/cuenta/<slug>/suscripciones` |

Not created: `downloads` and `payment-methods` (not built; a customer must never see a page with nothing behind it).

A page file is this and nothing more:

```tsx
// @pagosya-page
import Shell from '../Shell';
import { AccountGatePage } from '@pagosya/ui';
export default function Login() { return <Shell><AccountGatePage view="login" /></Shell>; }
```

### The shared piece: `AccountGatePage`

One component in `@pagosya/ui` (`packages/storefront-kit/kit/ui.tsx`). Given a `view`, it draws, in the template's own
styles, a heading, one explanatory sentence (Spanish, fixed per view, no merchant text) and one button. The button is an
ordinary anchor with a `data-pagosya-account="<view>"` attribute; the storefront runtime turns the click into the existing
`pagosya:source-external` message for the matching `/cuenta/<slug>/<view>` address (the store's slug is already known to the
runtime). **It renders no input of any kind.** A store with custom layout can restyle the heading, spacing, imagery and
button through its file and `styles/globals.css`, but the form itself is the checkout app's.

Why a gate and not an embedded form: it keeps the existing security guarantee unchanged and needs no new bridge. Embedding
the real form in the page through the platform's trusted-form mechanism is a possible later improvement and is out of scope.

### Guard against passwords in store code

A source check fails the build when a file under `components/auth/` or `components/account/` (or any page file) contains
`type="password"`, `type='password'`, or an `autoComplete` of `current-password` / `new-password`. YAPI's instructions get
the same rule in plain words. The check exists because the whole design depends on no store code ever handling credentials.

### Routing

No new route rule: the folders and slugs are already recognised. This sub-project only starts creating the files.

### When files are created

- New stores and applied templates: the eight files are written together with the eleven content/catalog pages.
- Existing stores: `withStandardPages` gains the eight files, so the existing "Agregar páginas estándar" action adds them
  too (new revision, not published, idempotent). The dedicated one-click upgrade for older stores is sub-project 4.
- Published stores are untouched until the merchant publishes the new revision.

### Navigation

The footer slot `data-pagosya-pages` already links "Mi cuenta" to `/cuenta/<slug>`. This sub-project adds no new
navigation. The header icon is sub-project 3.

### YAPI

`agentOpening` already lists "Pages of this store (file -> address)"; the eight files appear there with the standard-page
marker. The STANDARD PAGES rule is extended: these pages are gates to the checkout app, YAPI may restyle them but must not
add forms, inputs or scripts, and keeps the marker and `AccountGatePage`.

## Errors

- A gate whose slug is unknown to the runtime renders the button disabled with the text "Cuenta no disponible" (a store
  that is not published has no checkout address); it never throws.
- A page file importing `AccountGatePage` before the kit exports it fails at build time (existing behaviour for kit imports).
- Route collisions fail with the existing message naming both files.

## Testing

- Kit: `AccountGatePage` renders heading, sentence and one anchor for each of the eight views and renders no `input`.
- Pages: `contentPagesFor`/`withStandardPages` produce the eight files with the marker, are idempotent, keep an edited page.
- Guard: build check rejects `type="password"` and password autocomplete in a page file; accepts the generated files.
- Routing: each file maps to the slug above; the preview and the static export include all eight pages.
- Runtime: a click on `[data-pagosya-account]` posts the external-open message for the right `/cuenta/<slug>/<view>`.
- Every template compiles with all eight files added.
- A published store without the new folders renders byte-for-byte as before.

## Out of scope

The read-only theme tree and scaffold view (2), the header icon and picker polish (3), the upgrade flow for old stores (4),
`downloads` and `payment-methods` pages, embedding the real form in the store page, applying the full store branding to the
checkout-origin account pages.

## Open for the plan

Nothing. The wording of the eight sentences is fixed in the plan.
