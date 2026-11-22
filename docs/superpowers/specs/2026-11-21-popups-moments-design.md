# Popups 2.0 — Part 2: who sees what, when (four moments)

**Status:** §3 approved by the owner in chat 2026-11-21 («yes do it please»); the rest of this spec awaits review.
**Programme:** 1 engine (spec 2026-11-18, merged) → **2 who sees what, when (this spec)** → 3 shopper data (profiles, merchant
view, export) → 4 results in Bs and continuous A/B tests.

## 1. Goal and success

Today a store has one YAPI popup, shown once per visitor every 30 days at one fixed moment. Part 2 gives every store a **family
of four popups**, one per moment of the shopper's visit, and a rule that a shopper only ever sees the one that fits — never two
in a visit, never a nag.

**Owner decisions (2026-11-21):**
- Several popups, each for its own moment (not one smarter popup).
- All four moments: welcome, cart rescue, interest offer, returning shopper.
- At most one popup per visit and a 24 h gap; cart rescue may skip the gap; closing a popup hides it 7 days.
- One discount per shopper: later popups remind the code the shopper already has, they never issue a second one.
- YAPI writes the family in one run (shared look, each moment its own words, layout and steps).
- The browser decides which popup opens; the server keeps a record of shown / closed / completed (approach A).

**Success** = on the 11 stores with a LIVE popup (Remolino, Fishwife, goodProtein, rhode, Oh Belly, BOXY, Meat House, NOA, Miga,
DooBoo, Antojo):
1. YAPI writes rescue, interest and return to match each store's live welcome; every moment passes the browser check (two repairs
   allowed per moment).
2. A scripted phone visitor walks each store through all four moments end to end (contact saved once, the same code reminded and
   applied, the right product or checkout opened).
3. The same script proves the limits: never two popups in one visit, the 24 h gap, the 7-day close memory.
4. The owner judges each family «one brand» next to its welcome popup.

**Out of Part 2:** shopper profiles and export (Part 3); counting sales in Bs per moment, automatic A/B tests (Part 4); sending
WhatsApp messages (pagosYa still never sends; the merchant sees the list).

## 2. What exists and is reused

| Need | Existing piece |
|---|---|
| A popup design, its steps, cleaning, checks, repairs | `apps/api/src/store-popups/` (`popup-design.service.ts`, `popup-flow.ts`, `popup-html.ts`, `popup-css.ts`, `popup-render.ts`, `popup-fingerprint.ts`) |
| Storefront runtime and today's timing (`load` / `delay` / `exit` / `both`, 30-day memory, blockers, cookie wait) | `packages/storefront-kit/kit/retention.js` |
| Contact + personal single-use code tagged with the design | `retention.service.ts` `subscribeToDesign`, `designCode` |
| Code into the cart, product landing, «Tu favorito» | `pagosya:apply-promo`, `pagosya:favourite`, `pagosya:open-product` (commerce.js) |
| Cart contents in the browser | `pagosya:serialize-cart`, `pagosya:cart-updated` |
| Product being viewed | `pagosya:current-product` (commerce.js fills `id`, `name`) |
| Analytics consent | `privacy.js` (`pagosya:privacy:<slug>`, `pagosya:privacy-change` with `analytics`) |
| Popups page, chat redesign, batch | `popup-design.controller.ts`, `popup-chat.ts`, `apps/api/scripts/design-popups.ts`, dashboard Crecimiento → Popups |

## 3. The four moments and their rules (approved)

| Moment | Who | When it opens | What it does |
|---|---|---|---|
| `welcome` | no contact saved in this browser | the store's current trigger setting (`load` / `delay` / `exit` / `both`, delay 8 s default) | today's flow: offer → pick or quiz → contact → code → product with the code in the cart |
| `rescue` | cart not empty, not on checkout | desktop: pointer leaves the window; phone: a fast scroll up after 10 s on the page, or the tab regains focus after ≥ 20 s away | shows the shopper's own cart items; no contact → asks for it and reveals the code; contact → reminds the code, applies it, opens checkout |
| `interest` | anyone; the contact step only without a contact | 3 product pages of one collection in this visit, or 40 s on one product page | names that product or collection, shows it with 2–3 related products; then contact + code or the reminder; lands on the product with the code in the cart |
| `return` | this browser saved a contact before, visit 2 or later | 6 s after the visit starts | no form: «hola de nuevo», the favourite or newest products, the code if still unused; lands on the product |

- **Priority** when several qualify at once: rescue > interest > return > welcome. One popup per visit.
- **Gap:** no popup within 24 h of the last one shown; rescue skips the gap but still counts as the visit's popup.
- **Closed** without acting → that moment is not shown again for 7 days.
- **Completed** (contact saved, or the land step reached) → that moment's contact step is never shown again; a completed welcome
  is never shown again.
- **Blockers stay:** checkout, another open dialog, `comeback` / `recover` / `unsubscribe` links, the cookie question first,
  Studio editor. A **visit** starts after 30 min without a page view.
- **On / off per moment** (merchant): welcome and rescue on by default; interest and return on as soon as their design is LIVE.
- **One code per shopper:** the first popup that saves a contact issues the code (today's `designCode`). Later moments show it
  («tu 10 % sigue esperando») and their button applies it. A used or expired code is never reminded.

## 4. Data

**`StorePopupDesign`** gains (one migration):
- `moment String @default("welcome")` — `welcome | rescue | interest | return`; every existing row is a welcome.
- `family String?` — the id of the run that wrote it; siblings share it.
- index `[storeId, moment, status]`. At most one LIVE row per store and moment (enforced in the service, as today per store).

**`StoreRetention.settings`:** `popupDesignId` stays the welcome's pointer (published pages and old code keep working). New:
`popupMoments: { rescue?: { id: string | null, off?: true }, interest?: …, return?: … }`. `popupDesignPercent` and
`popupDesignCapture` become the family's (one percent, one channel per store).

**`StorePopupEvent`** (new table, the server's record for Parts 3–4):
```
id, storeId, designId, moment, visitor (random 16-byte id from the browser, never a contact), kind (shown | closed | completed),
step String? (the step id on closed), createdAt; index [storeId, createdAt], [designId, kind]
```
No IP, no user agent. Rows older than 180 days are deleted by the existing nightly cleanup.

**Code status:** `POST /stores/public/:slug/retention/code-status { code }` → `{ active: boolean, percent }` for the store's own
popup codes only (unguessable HMAC codes; throttle 20/min). Used by reminders before showing a code.

## 5. Steps per moment

Part 1's step kinds stay. Part 2 adds these platform pieces and per-moment shape rules (checked on save, like Part 1's):

| New piece | Hooks YAPI's HTML carries | What the runtime does |
|---|---|---|
| step `cart` | one `data-tile` with `data-slot="photo\|name\|price\|qty"` inside; optional `data-slot="total"` | clones the tile per cart line (max 4, then «+N más»), live prices, the cart total |
| step `remind` | `data-slot="code"`, optional `data-slot="percent"`, `data-apply` | shows the shopper's code; `data-apply` sends `pagosya:apply-promo` then goes on |
| `pick` source `context` / `favourite` / `new` | as Part 1's `pick` | `context`: the viewed product first, then 2–3 of its collection; `favourite`: the saved favourite then newest; `new`: newest active products |
| `land` target `checkout` | none | opens the cart panel's checkout with the code applied |
| text slots `data-slot="product-name"`, `"collection-name"` | inline in any step | filled from the moment's context; a step with an empty slot is skipped |

**Shapes** (the runtime walks the flow and skips the branch that does not apply to this shopper):
- `welcome`: as Part 1 (must hold `capture` → `reveal`).
- `rescue`: `cart` first; must hold both `capture` → `reveal` and `remind`; `land` target `checkout`.
- `interest`: `pick` source `context` first; must hold both `capture` → `reveal` and `remind`; `land` target `product`.
- `return`: `pick` source `favourite` or `new`; `remind` optional (skipped without an active code); no `capture`; `land` `product`.

## 6. How YAPI writes the family

**One run, one call** for the whole family (same engine and bridge as Part 1). Input as Part 1 plus each moment's job and shape
(§3, §5). Output (schema-checked):
```
{ composition, css (shared, ≤ 24 KB), moments: { welcome?: { composition, flow, steps, css? (≤ 6 KB own) }, rescue: …, interest: …, return: … } }
```
- **New store:** all four moments in the call.
- **Store with a LIVE welcome** (the 11 stores): the call receives the live welcome's steps and CSS as the family's look and writes
  only rescue, interest and return; their shared CSS starts from the welcome's.
- Each moment is stored as its own row (`css` = shared + own, so the runtime plays it exactly like a Part 1 design) with the run's
  `family`.
- **Checks per moment:** cleaning, shape rules, then the browser check (390×844, 1280×800, reduced motion) with a fake context — two
  cart lines for rescue, a product + its collection for interest, a favourite for return, and both «new shopper» and «has a code»
  passes for the moments that branch.
- **Repairs:** a failing moment goes back alone with its problems (up to two repairs); the moments that passed are kept. A moment
  that still fails is stored FAILED and stays off; the others go LIVE.
- **Variety:** each moment's fingerprint is compared with the same moment of other stores (merchant's stores + last 30); siblings
  are not compared with each other — they are meant to look related.
- **Cost:** one call writes the family; a repair is one small call per failing moment.

## 7. Shopper side (browser decides)

`retention.js` gains a pure rule function `chooseMoment(memory, visit, signal, now)` — exported for tests — and a small watcher.

**Browser memory** (`localStorage` `pagosya:popups:<slug>`, JSON; every read and write in try/catch):
`{ visitor, visits, lastSeenAt, lastShownAt, closed: { moment: ts }, done: { moment: ts }, contact: bool, code?, favourite? }`.
Today's 30-day popup key is read once on upgrade: a recent one counts as `lastShownAt` and `done.welcome`.

**Signals:**
- product views per collection in this visit — commerce.js adds `collectionIds` to `pagosya:current-product`;
- time on the current product page;
- cart lines from `pagosya:serialize-cart`, refreshed on `pagosya:cart-updated`;
- leave intent: desktop `mouseout` to the top (today's rule); phone: scroll up ≥ 60 % of the screen height within 400 ms after
  10 s on the page, or `visibilitychange` back to visible after ≥ 20 s hidden. The back button is never hijacked.

**Events:** `POST /stores/public/:slug/retention/popup-events` (throttle 30/min, `sendBeacon` when leaving) for `shown`, `closed`,
`completed`, sent only when the shopper allowed analytics (`privacy.js`); without it nothing is sent and only the contact itself
(already consented) reaches the server. The visitor id is random, kept in the browser memory, and gone when the shopper clears it.

**Stores without a family** keep today's single popup and its 30-day rule, untouched.

## 8. Merchant side

- **Popups page:** four cards (Bienvenida, Carrito, Interés, Regreso), each with its step previews, on/off, «Rediseñar», and its
  version history with «Volver a esta». Percent and channel are set once for the family. Shown / closed / completed counts for the
  last 30 days under each card (from `StorePopupEvent`; Part 4 adds sales).
- **Chat:** «el popup del carrito más simple», «apaga el de regreso», «rediseña todos» → `popupDesign` jobs gain a `moment`
  (or `all`); a single-moment redesign keeps the family's shared CSS.
- **Batch:** `design-popups.ts --moments` writes the missing moments for the named stores, one job at a time (bridge limit).

## 9. Failures

| What fails | What happens |
|---|---|
| A moment fails its checks after two repairs | stored FAILED, that moment stays off, the others go LIVE; chat says which |
| The whole call fails twice | nothing changes; the store keeps what it has |
| Cart emptied while rescue is open | the cart step shows an empty-cart line and the close; no code is revealed for an empty cart |
| Code used or expired | `remind` is skipped; a flow left without a step that applies does not open |
| Event POST fails | dropped silently (never retried, never blocks the popup) |
| `localStorage` blocked | memory lives for the page only: at most one popup per page view, no phone rescue (no 10 s history) |
| Interest product archived | the runtime drops it; with no product left the moment does not open |

## 10. Testing

- **Rule function:** table tests for `chooseMoment` — priority, one per visit, 24 h gap, rescue skipping it, 7-day close, done
  moments, visit boundary at 30 min, upgrade from the old key, every blocker.
- **Runtime:** `cart`, `remind`, `pick` sources, text slots and branch skipping in the existing runtime tests.
- **API:** migration on the dev DB after a pg_dump; family write with partial failure; one LIVE per store and moment; events and
  code-status endpoints (throttle, other stores' codes rejected); variety compares the same moment only.
- **Live:** the 11 stores in batch, one job at a time; then the scripted phone visitor of §1 on each; previews in the gallery page.
