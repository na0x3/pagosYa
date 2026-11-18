# Rasca y elige Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner: inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The Bake Me flow in every store's popup game — a scratch card in the business's shape, «¿qué te interesa?», «¿cuál es tu
favorito?» with real photos, WhatsApp or email, and the trip to the favourite, remembered.

**Architecture:** Settings in `StoreRetention.settings` (JSON), written by `PopupGameService` from pure helpers in
`store-popups/popup-games.ts`; `publicRetentionSettings` hands them to the page. The flow is `kit/retention.js` (`mountGame`); the
favourite marking is `commerce.js`. WhatsApp signups get a new table; published stores collect the number in pagosYa's trusted form
and keep the favourite in the parent page.

**Tech Stack:** NestJS + Prisma (jest), storefront kit (Playwright via `measurePopup` / `withVisualSandbox`), apps/checkout (vitest).

**Spec:** docs/superpowers/specs/2026-11-10-rasca-y-elige-design.md (owner «yes»; then «do it… dont ask me any more questions»).

## Global Constraints

- Shapes `cookie | can | bottle | cup | flower | garment | box | bag`; null → plain card; store colours.
- Interests 3–6 answers ≤ 28 chars `{ label, icon }`; multi-select; «Siguiente» needs one; «Saltar».
- Favourite tiles 3–6: products with a photo, not sold out, no memberships; one product with options → its option values with
  photos; < 3 → step skipped. Question «¿Cuál es tu sabor favorito?» / «¿Qué modelo te gusta más?» / «¿Cuál es tu favorito?».
- Contact `whatsapp` (default) | `email`. WhatsApp: Bolivian 7–8 digits, +591 optional, stored `591XXXXXXXX`.
- Scratch strokes from the last point; reveal at 45 %; «Revelar sin rascar». Favourite remembered `pagosya:fav:{slug}`.
- pagosYa never sends WhatsApp. One prize per email and per phone. Spanish, tú.
- Owner conventions: commit per task on oct24-clean; one spec file per run; no YAPI job RUNNING before saving apps/api/src;
  migration only after `pnpm dev:doctor --backup`; rebuild Studio after kit changes.

## Rulings against the spec (made while planning)

1. WhatsApp subscribers get their own table `StoreWhatsappSubscriber` instead of an optional email (email keys deliveries,
   unsubscribe, saved carts and the prize check; additive is safe). Cost if wrong: one list in two tables.
2. Interests from sector templates + the store's categories, no model call (instant, free, never fails; editable by chat).
3. Published stores remember the favourite in the parent page (`window.PAGOSYA_FAVOURITE`), since the store frame cannot store.

## Review Focus

1. < 3 products with photos: no favourite step, flow still ends with the code.
2. Bad WhatsApp («123», an email): clear refusal, prize kept for the retry.
3. Same phone plays again: «Este número ya recibió su premio.»
4. Old store with `popupQuestion`: shown as interests without icons.
5. Favourite deleted / sold out: no badge, no reorder, no error.

---

### Task 1: Pure helpers (popup-games.ts)
Produces `POPUP_SHAPES`, `readShape`, `popupShapeFor(words)`, `InterestAnswer`, `PopupInterests`, `interestsFor(words, categories)`,
`readInterests(settings)`, `favouriteQuestionFor(words, productCount)`, `readContact`, `whatsappDigits(raw)`.
Test popup-games.spec.ts: shapes for bakery/soda/salsa/café/flores/hoodies/canastas/licuadoras(→bag); bakery interests 5 answers with
icons; categories fallback + «Para regalar»; legacy question → no icons; favourite questions; contact default; numbers
`7123 4567`/`+591 71234567` → `59171234567`, `123`/email → null. RED → implement → GREEN → commit.

### Task 2: Settings (popup-game.service.ts, retention.service.ts)
`enable` writes `popupShape`, `popupInterests`, `popupFavourite {text}`, `popupContact` from the store's words (onboarding, categories,
product names), keeping ones already set; `setShape`, `setContact`, `setInterests`; public settings expose the four (game on only;
legacy question via `readInterests`); `KEPT_SETTINGS` keeps them. Tests popup-game.service.spec.ts, retention-popup.spec.ts.

### Task 3: WhatsApp signups + favourite (migration, dto, service)
`pnpm dev:doctor --backup`; migration `20261110120000_rasca_y_elige`: `StoreNewsletterSubscriber.favourite TEXT`, table
`StoreWhatsappSubscriber(id, storeId FK cascade, phone, interests text[], favourite, isActive, sourceVisitId FK set null, createdAt,
updatedAt, unique(storeId, phone))`. DTO: email required only without phone; `answers` (≤6, ≤28), `favourite` (≤140).
`subscribe`: WhatsApp path when contact whatsapp + phone; answers allow-listed by the store's interests; favourite checked against the
store's products (`id` or `id:value` of a variant option); prize once per phone. Tests retention-popup.spec.ts.

### Task 4: Panel (overview + merchant-studio retention.ts)
`overview` adds `whatsappSubscribers` (50), `whatsappCount`, `favourites` top 5 by name across both tables; Studio renders «Por
WhatsApp (N)», chips of interests, «Favorito: X», «Favoritos más elegidos». Tests retention-popup.spec.ts + retention.test.ts.

### Task 5: YAPI chat ops (source-store-edit.ts)
Popup ops `shape` («cambia la forma a una lata»), `contact` («pide el correo»), `interests` («pregunta de intereses: ¿…? a, b, c» /
«sin intereses»); unknown shape refused with the list. Test source-store-edit.spec.ts.

### Task 6: Shopper flow (kit/retention.js + popup-render harness)
Shape painters, stroke scratch, steps `play → interests → favourite → contact → code`, progress dashes, launcher with the shape,
go-to-favourite (localStorage, `pagosya:favourite` event, hosted postMessage, scroll or product page). Tests popup-render.spec.ts:
shape drawn, strokes reveal, interests multi + skip, favourite tiles (items / one-product options / skipped < 3), contact field type,
hosted secure note.

### Task 7: «Tu favorito» in the grid (commerce-src/catalog/favourite.js)
Favourite first + «Tu favorito» tag; live on `pagosya:favourite`; unknown id → nothing. Test source-commerce-favourite.spec.ts.

### Task 8: Published stores (apps/checkout trusted-form + source-storefront)
WhatsApp-only trusted field; `withoutPersonalFields` keeps answers/favourite/contact/gameToken; parent stores `pagosya:favourite`
and injects `window.PAGOSYA_FAVOURITE`. vitest.

### Task 9: Live check + example stores
Studio rebuild; by chat «pon un rasca y gana» on Miga Dorada, Oh Belly, BOXY (+ new stores); verify settings; preview-mode captures
of the full flow; artifact for the owner; commit. Final whole-branch review, fix Critical/Important test-first, ledger minors.
