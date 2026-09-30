# Complete store pages — program

Decided 2026-09-30. The owner recorded Amboras' admin (Code tab, 178 files) and pointed at how every generated
store ships structured, standard pages — account, auth, cart, checkout, collections, contact, cookie policy, FAQ,
privacy, products, refund policy, search, shipping, terms, plus `layout`, `not-found`, `error`. A pagosYa store
today has `Shell`, `home`, `product`, `checkout` and a `globals.css` (about 270 lines per template, 90+ templates).
Policies are a footer dialog fed by the merchant's own text, not pages.

This document splits the work into sub-projects. Each one gets its own spec, plan and build cycle; nothing here is
built yet.

## Goal

A store generated from any template opens with the standard pages already there, in the template's own design,
with content taken from the merchant's data. YAPI and the merchant can edit each page on its own. Customers can
sign up, sign in and see their orders inside the store.

## Decisions so far

| Question | Decision | Why |
|---|---|---|
| Scope | Everything: structure, content pages, catalog pages, customer access and account, Studio/YAPI integration | Owner's choice, 2026-09-30 |
| Customer accounts | **Per store**: each store has its own customers, with login and registration in the store's own look | Owner's choice. Amboras works this way; the login should not carry pagosYa branding |
| Stack | Stay inside the current template system (`Shell` + pages over `@pagosya/ui` and the storefront kit); no move to Next.js | Assumption, to confirm in sub-project 1 |

## Shared pages, not copies

Giving each template its own copy of ~15 new pages would mean 1,000+ files to keep in step. The proposal for
sub-project 1 is that the standard pages live once in the kit and each template supplies only what makes it
different: its `Shell` (header, footer, announce bar), its styles and its DNA. To be confirmed in the sub-project 1
spec, including how a template overrides a single page when it needs to.

## Sub-projects, in build order

1. **Page architecture.** One folder per page, the shared standard-page system in the kit, the contract a
   template must satisfy, routing and navigation links generated from the set of pages a store has. Everything
   else depends on this.
2. **Content pages.** FAQ, shipping, refunds, privacy, terms, cookies, contact, about and 404, filled from the
   merchant's data and existing policies (`source-commerce-policies`, `store-knowledge`). Replaces the footer
   policy dialog with real pages, keeping the rule that only policies the merchant wrote are linked.
3. **Catalog pages.** Collections (the API already has a `collections` module), search and a full product list as
   pages of their own.
4. **Customer access.** Login, register, forgot password, reset password, scoped to one store. New data model:
   `ConsumerUser` today is pagosYa-wide, so this needs a per-store customer record, sessions, email
   verification and reset tokens, rate limiting and the store's own sender identity. The largest security surface
   of the program; needs its own threat review.
5. **Customer account.** Orders, addresses, profile, digital downloads, payment methods and subscriptions inside
   the store. Reuses what exists: `CustomerSubscription` (Subscribe & Save), `CustomerFavorite`,
   `CustomerReturnRequest`, digital downloads, buyer terms acceptance.
6. **Studio and YAPI.** A page picker in the editor (Home, Products, Collections, Pages, Customer account, like
   Amboras), per-page editing, the YAPI agent able to read and edit one page at a time, and publishing that
   serves every route. Partially starts in sub-project 1 (picker skeleton) and finishes here.

## Risks to settle in each spec

- **Existing stores.** Published stores keep working unchanged; new pages apply to new generations and to stores
  that opt in.
- **Generated (YAPI) sites.** The "Sitio a medida" source builder produces its own HTML. Decide whether standard
  pages are injected into those too or only into template-based stores.
- **Customer data.** Per-store accounts mean the merchant becomes responsible for customer data; privacy copy,
  deletion and export must be part of sub-project 4, not added later.
- **Weight.** Standard pages must not slow the storefront: load per page, no shared bundle of all of them.

## Next step

Brainstorm sub-project 1 (page architecture) to a written spec, then its plan.
