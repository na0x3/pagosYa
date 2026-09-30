# Store page architecture (sub-project 1 of Complete store pages)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Approved by the
owner in conversation on 2026-09-30. Decisions recorded: visible thin files per page, folders per group.

## Goal

Give every generated store a structured set of page files (like Amboras' `app/` tree) without copying page logic
into each template. This sub-project builds the structure and its mechanism; the real content of each page comes
from sub-projects 2 to 5.

## What exists today (verified 2026-09-30)

- A store's site is a Next.js Pages Router project whose scaffold the platform supplies
  (`apps/api/src/storefront-source/source-next.ts`). The author returns only `components/**/*.tsx` and
  `styles/globals.css`.
- Routes come from `nextPages` (`home` → `index.html`, `product` → `product.html`, `checkout` → `checkout.html`)
  plus files matching `components/page-SLUG.tsx`, which become `SLUG.html`. The regex deliberately keeps shared
  components from becoming routes.
- The scaffold writes `pages/<slug>.tsx` for each route, wrapping the component with `withCommerce` and `Seo`.
- There are 61 templates in `packages/store-templates/templates`. All have the same four files (`checkout.tsx`,
  `home.tsx`, `product.tsx`, `Shell.tsx`), and all export `Shell` as default.
- `@pagosya/ui` (`packages/storefront-kit/kit/ui.tsx`) already holds shared pieces (`SiteHeader`, `KitSlot`,
  `ProductPageTemplate`, sections, buttons).
- A template's header and footer links are a hard-coded `links` array in its own `Shell.tsx`.

## Design

### File model

One thin file per page, in a folder per group:

| Folder | Pages |
|---|---|
| `components/pages/` | `faq`, `shipping`, `refund-policy`, `privacy`, `terms`, `cookies`, `contact`, `about`, `not-found` |
| `components/catalog/` | `collections`, `search` |
| `components/auth/` | `login`, `register`, `forgot-password`, `reset-password` |
| `components/account/` | `orders`, `addresses`, `profile`, `downloads`, `payment-methods`, `subscriptions` |

`home`, `product` and `checkout` stay where they are. The table is the target layout for the whole program; a
folder's files appear in a store only when the sub-project that owns those pages ships. A page file is this and
nothing more:

```tsx
import Shell from '../Shell';
import { FaqPage } from '@pagosya/ui';
export default function Faq() { return <Shell><FaqPage /></Shell>; }
```

The page's logic lives once in `@pagosya/ui`. The template contributes only its `Shell`, styles and DNA.

### Routing

Extend the route rule so a route is either:

- `components/page-SLUG.tsx` → `SLUG.html` (unchanged, so existing stores keep working), or
- a file directly inside one of the four recognised group folders → `SLUG.html` for `pages/` and `catalog/`,
  `GROUP-SLUG.html` for `auth/` and `account/` (for example `account/orders.tsx` → `cuenta-pedidos.html`,
  `auth/login.tsx` → `acceso-ingresar.html`; exact Spanish slugs are fixed in the plan).

Files elsewhere in `components/` (like `Shell.tsx`) never become routes. Slugs must be unique across both forms;
a collision fails the build with a clear message.

### Shared pages in the kit

`@pagosya/ui` gains one generic `StandardPagePlaceholder` (heading, lead), used only by tests so the mechanism is
verified end to end. The per-page components (`FaqPage`, …) are added by the sub-project that owns each page. **No page file is added to a real store in this sub-project**: a customer
must never see a placeholder. Each of sub-projects 2 to 5 replaces its placeholders with real content and only
then starts creating those files in stores.

### Template contract

No new files per template. A template satisfies the contract if its default-exported `Shell` accepts `children`,
which all 61 already do. A registry test enforces this for every template, now and for future ones.

### Navigation

Moved to sub-project 2 (decided while planning, 2026-09-30). The 61 `Shell.tsx` footers come in at least eight
different markups, and editing them now would change 61 files with nothing visible to check. Sub-project 2 adds
the page list to `store-data.tsx`, a `StandardLinks` kit component and the `Shell` edits together with the first
real pages, so the links can be verified on screen. Until then no store has standard pages, so there is nothing to
link to.

### When files are created

When a template is applied and when a new store is generated, for the pages whose sub-project has shipped (none,
until sub-project 2). Published stores are untouched. A later explicit
"add standard pages" action for them belongs to sub-project 6.

### Errors

- A page file that imports a kit page that does not exist fails at build time, not in production.
- A route collision fails with a message naming both files.
- A store whose files include none of the new folders behaves exactly as today.

## Testing

- Route rule: old `page-SLUG` form, each new folder, shared files excluded, collision, invalid slug.
- Registry: every template exports a default `Shell` that accepts `children`.
- Every template compiles with all current standard page files added.
- A published store with no new folders renders byte-for-byte as before.

## Out of scope

Real content of the pages (2), collections and search behaviour (3), customer auth and accounts (4 and 5), the
editor page picker and agent changes (6), and moving to a Next.js `app/` directory.

## Open for the plan

Nothing. Spanish slugs are fixed in the plan. YAPI's edit scope (`source-edit-scope.ts`) is specific to the home
page and needs no change for page files; teaching the agent about the new folders is sub-project 6.
