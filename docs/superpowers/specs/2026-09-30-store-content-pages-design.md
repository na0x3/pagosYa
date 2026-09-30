# Store content pages (sub-project 2 of Complete store pages)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Builds on
[2026-09-30-store-page-architecture-design.md](2026-09-30-store-page-architecture-design.md) (routes, `// @pagosya-page`
marker, `StandardPagePlaceholder`). Approved by the owner in conversation on 2026-09-30. Decisions recorded:

- A legal page exists for customers only when the merchant wrote that text; nothing is invented.
- The FAQ is built only from facts the store data already states; no merchant-editable FAQ in this sub-project.

## Goal

Every store opens with the standard information pages (about, contact, shipping, refunds, privacy, terms, FAQ,
cookies, not found), in the template's own design, showing the merchant's real data live.

## What exists today (verified 2026-09-30)

- The storefront runtime (`packages/storefront-kit/kit/commerce.js`) receives the store as `store` (from `config.js`)
  with `policies` (`{ returns, delivery, privacy, terms }`, plain text written by the merchant), `locations`
  (`name`, `address`, `pickupEnabled`, `deliveryEnabled`, hours), `shippingEnabled`, `shippingPickupEnabled`.
- Policies are rendered there as escaped text in a runtime-owned dialog (`policyLinks`, `data-pagosya-policy`), and
  only the policies the merchant wrote are linked. A test pins this
  (`apps/api/src/storefront-source/source-commerce-policies.spec.ts`, JSDOM).
- `Store` also has `aboutText`, `tagline`, `contactPhone`, `contactEmail`, `contactFormEnabled`.
  `STORE_POLICY_KEYS` lives in `apps/api/src/stores/store-presentation.ts`.
- A template's authored source must contain no merchant text; runtime mounts are empty and filled by the runtime.
- The 61 templates share the same `Shell.tsx` shape; each `Footer` ends with `</footer>`.

## Design

### Pages and their content

| Page (file, URL) | Content source | Has content when |
|---|---|---|
| `pages/about` → `nosotros.html` | `aboutText` (paragraphs), `tagline` | either is set |
| `pages/contact` → `contacto.html` | phone, email, contact form, locations with hours | any exists |
| `pages/shipping` → `envios.html` | `policies.delivery`, locations (pickup / delivery, hours) | a policy or a location exists |
| `pages/refund-policy` → `reembolsos.html` | `policies.returns` | the merchant wrote it |
| `pages/privacy` → `privacidad.html` | `policies.privacy` | the merchant wrote it |
| `pages/terms` → `terminos.html` | `policies.terms` | the merchant wrote it |
| `pages/faq` → `faq.html` | derived questions, below | at least two answers are possible |
| `pages/cookies` → `cookies.html` | fixed platform text | always |
| `pages/not-found` → `404.html` | fixed message and a link home | always |

### Mechanism: live, filled by the runtime

Each page file is the thin file of sub-project 1 (first line `// @pagosya-page`), rendering inside the template's
`Shell`. Its body comes from a new kit component per page (`AboutPage`, `ContactPage`, `ShippingPage`,
`PolicyPage kind="refund|privacy|terms"`, `FaqPage`, `CookiesPage`, `NotFoundPage`) that draws a title and one
empty runtime mount, `data-pagosya-page="<kind>"`. `commerce.js` fills the mount from `store` with escaped text
(the same discipline as the policy dialog: text nodes and paragraph splitting, never markup). Editing a policy in
Ajustes changes the page without republishing. `StandardPagePlaceholder` from sub-project 1 stays exported and is not used by any of these pages.

### Pages with no data

Files exist for every page (they cost a few lines). When there is nothing to show, the mount renders
"Esta información aún no está disponible." with a link home, sets `<meta name="robots" content="noindex">` and the
page is not linked. The merchant's nav never shows a dead page, and no policy text is ever invented.

### Derived FAQ

Questions are emitted only when their answer is a stated fact:

| Question | Emitted when | Answer states |
|---|---|---|
| ¿Hacen envíos? | `shippingEnabled` or a location with delivery | the stated delivery options |
| ¿Puedo retirar mi pedido? | a location with pickup, or `shippingPickupEnabled` | the pickup places and hours |
| ¿Dónde están? | at least one location | names and addresses |
| ¿Cómo pago? | `checkoutMode` is payment | the payment methods pagosYa offers (QR, card) |
| ¿Cómo los contacto? | phone or email | that contact data |

Fewer than two answerable questions: the page has no content (above).

### Cookies text

States only what the storefront runtime actually stores in the visitor's browser and why. The exact list is taken
from reading `commerce.js` and `privacy.js` during implementation and pinned by a test that fails if the runtime
starts storing a key the text does not list.

### Navigation

Each `Shell.tsx` gets one line, `<nav data-pagosya-pages aria-label="Información" />`, just before `</footer>`.
`commerce.js` fills it with links to the pages that have content, in a fixed order (about, contact, shipping, FAQ,
refunds, privacy, terms, cookies), with the runtime's base style inheriting the template's colours. Editing 61
files is one mechanical insertion each, verified by a test over every template. Stores without the slot keep
working; they simply have no links.

### When files are created

When a template is applied and when a new store is generated (all nine files). Published stores are untouched; the
explicit "add standard pages" action is sub-project 6.

### Errors and safety

- Text is escaped; a hostile policy (`<script>`, backticks, `${}`) renders as text. Covered by a test per page.
- A page never throws for missing data: it falls back to the unavailable state.
- Missing or malformed `store.policies` (null, array, non-string values) behaves as "not written".

## Testing

- JSDOM tests beside `source-commerce-policies.spec.ts`: each page with data, without data, with hostile data, with
  malformed `policies`.
- FAQ: each question appears only with its fact; fewer than two answers gives the unavailable state.
- Cookies: the listed keys equal the keys the runtime writes (scan of `commerce.js` and `privacy.js` storage calls).
- Every template's `Shell` contains the `data-pagosya-pages` slot, and its page files render inside it.
- Navigation: links appear only for pages with content; none when the store has none.
- A store applied before this change renders byte-for-byte as before.

## Out of scope

Merchant-editable FAQ, generic legal text, adding pages to published stores (6), collections and search (3),
customer auth and accounts (4 and 5), the Ajustes screens for writing policies (they already exist).

## Open for the plan

The exact Spanish copy of the fixed texts (cookies, not found, unavailable); the runtime's base style for the
information nav; whether `contact` reuses the existing contact form mount (`data-pagosya-contact`) or links to it.
