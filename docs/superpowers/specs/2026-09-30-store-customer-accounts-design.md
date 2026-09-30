# Store customer accounts (sub-projects 4 and 5 of Complete store pages)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Decision recorded by
the owner: **accounts are per store** (each store has its own customers, in the store's own look). The owner asked for
sub-projects 3 to 6 without further questions, so the choices below were taken by the implementer and each states why.
Both sub-projects are designed together because the account pages are useless without the access pages and share one
API module, one data model and one threat review.

## Goal

A shopper can register, confirm their email, sign in, recover a forgotten password and see their own orders,
subscriptions, profile and addresses inside one store, in that store's design. Nothing is shared between stores.

## What exists (verified 2026-09-30)

- `apps/api/src/consumer/consumer-session.service.ts`: a pagosYa-wide account with argon2id hashing, a dummy hash so
  a login for an unknown email takes as long as a real one, sessions stored as `sha256:` digests with expiry and
  revocation, and email tokens with expiry. The store accounts follow the same patterns.
- Mail goes through `EMAIL_PROVIDER` (`email.send({ to, subject, body })`); in development it is the mock that logs.
- `ThrottlerGuard` is global; routes opt in with `@Throttle`. CORS already allows the `authorization` header and
  `credentials: false`, which suits bearer tokens held by the storefront runtime.
- Orders: `StoreOrder` (`storeId`, `paymentIntentId`, `items`, `amount`, `status`) and `PaymentIntent.customerEmail`.
  Subscriptions: `CustomerSubscription` (`storeId`, `customerEmail`, `status`, plan). Both key on email.
- There is no store-customer record, no saved card, and no single place that lists a shopper's digital downloads.

## Data model (new tables, one migration)

- `StoreCustomer`: `id`, `storeId` (cascade), `email` (lower case), `name`, `phone?`, `hashedPassword` (argon2id),
  `emailVerifiedAt?`, `deletedAt?`, `addresses Json` (at most 10 entries), timestamps; `@@unique([storeId, email])`.
- `StoreCustomerSession`: `customerId` (cascade), `hashedToken` (unique), `expiresAt` (30 days), `revokedAt?`.
- `StoreCustomerToken`: `customerId` (cascade), `purpose` (`VERIFY_EMAIL` | `RESET_PASSWORD`), `hashedToken` (unique),
  `expiresAt` (24 h for verification, 1 h for reset), `usedAt?`.

Decision: addresses are a bounded JSON list on the customer, not a table: they are only ever read and written as a
whole by their owner.

## API (module `store-customers`, public under `/stores/public/:slug/customers`)

| Route | Behaviour |
|---|---|
| `POST register` | `{ name, email, password }`; always answers the same generic message; creates an unverified customer (or re-sends the link for an unverified one); an already verified email gets no new account and no signal |
| `POST verify-email` | `{ token }` consumes a `VERIFY_EMAIL` token |
| `POST login` | `{ email, password }`; generic 401 for unknown email, wrong password or deleted; 401 "Confirma tu correo" only after the password matched; returns a bearer token |
| `POST logout` | revokes the session |
| `POST forgot-password` | always the same answer; sends a reset link only for a verified customer of this store |
| `POST reset-password` | `{ token, password }`; single use; revokes every session of the customer |
| `GET me`, `PATCH me` | profile (`name`, `phone`) |
| `PUT me/addresses` | replaces the list (at most 10, fields length-checked) |
| `GET me/orders` | this store's orders whose `PaymentIntent.customerEmail` equals the customer's **verified** email, newest first, at most 50 |
| `GET me/subscriptions` | this store's `CustomerSubscription` rows for the verified email |
| `GET me/export` | everything held about the customer as JSON |
| `DELETE me` | requires the password; revokes sessions and tokens, removes the personal fields (`name`, `phone`, `addresses`, password) and frees the email; order history stays with the merchant as it always did |

**Threat review (decisions):**
- Passwords: 8 to 128 characters, argon2id; unknown email runs a dummy verification (no timing oracle).
- Tokens: 32 random bytes, only their SHA-256 is stored, compared by the database unique lookup; reset and verify tokens
  are single use and expire; a password reset revokes all sessions.
- No account enumeration: register, forgot-password and login answer identically whether or not the email exists
  (the "confirm your email" 401 is sent only after a correct password).
- Orders are shown only for a **verified** email, so registering someone else's address never exposes their orders.
- Rate limits: login 10/min, register 5/hour, forgot-password 5/hour, reset/verify 10/hour, per IP.
- Scope: every query includes the `storeId` resolved from the slug; a token from one store never works in another.
- The runtime escapes everything it draws; the bearer token lives in `localStorage` under `pagosya:customer:<slug>`
  (an XSS on a store would expose it, the same exposure the cart already has; it is never sent outside the API origin).
- Deliberately not built: social login, two-factor, magic links, saved cards.

## Storefront pages

Eight more `InfoPage` kinds and files, filled by the runtime (`commerce.js`) like the other information pages:
`login`, `register`, `forgot`, `reset` (under `components/auth/`) and `orders`, `addresses`, `profile`, `subscriptions`
(under `components/account/`), at the URLs fixed in sub-project 1 (`acceso-ingresar.html`, `acceso-registro.html`,
`acceso-olvide-mi-contrasena.html`, `acceso-restablecer-contrasena.html`, `cuenta-pedidos.html`, `cuenta-direcciones.html`,
`cuenta-perfil.html`, `cuenta-suscripciones.html`).

- The verification link lands on `acceso-ingresar.html?verify=<token>`; the reset link on
  `acceso-restablecer-contrasena.html?token=<token>`. Both send the token in a POST body, never in a header or another URL.
- An account page without a session sends the shopper to the login page; with a session it loads its data.
- The footer nav shows "Ingresar" (with "Crear cuenta") when signed out and "Mi cuenta", "Mis pedidos" and "Salir"
  when signed in.
- Every `auth` and `account` page is baked `noindex` and left out of the sitemap and `llms.txt`.
- The cookies page gains one line for the session token, and its pin test gains the `customer` prefix.
- The page files are written on template apply like the others (19 pages, 57 files; the source limit was raised to
  250 files in sub-project 3 for this).

Decision: `downloads` and `payment-methods` are not built. There is no saved card anywhere, and downloads are delivered
through order tracking links that have no list to show. Their URLs stay reserved in the slug table.

## Testing

API: unit tests with a mocked Prisma like `consumer.service.spec.ts` (register, verify, login incl. timing path and
unverified, logout, forgot/reset incl. single use and session revocation, scope by store, orders only for verified email,
export, delete), plus a controller test that the throttles are declared. Runtime: JSDOM tests with a fake `fetch` (forms
post the right body, errors show, redirect without session, escaping, nav states). Seeded migration applied to the dev
database only with `migrate deploy`.

## Out of scope

The Studio page picker and agent changes (sub-project 6), merchant-facing customer lists, marketing consent, social login.
