# Popups 2.0 — Part 1: the engine (YAPI-written popups with flows)

**Status:** design approved by the owner 2026-11-18 («lets do a», free version; «it looks»); this spec awaits review.
**Programme (owner order 2026-11-18):** 1 engine (this spec) → 2 who sees what, when (triggers, intent offers, cart rescue,
suppression) → 3 shopper data (profiles, merchant view, export) → 4 results in Bs and continuous A/B tests. Reference: Alia Popups
(aliapopups.com) — the owner wants pagosYa to be «the real deal of pop ups and data gathering».

## 1. Goal and success

Every store gets a popup that looks made for it — any composition, its own decorations and motion — written by YAPI, and a flow
that turns a discount into a sale: offer (or a game) → «¿qué buscas?» product tiles and/or a short quiz → WhatsApp or email →
the code → the chosen product's page with the discount already in the cart. The merchant changes anything by chat or in a
Popups page.

Success = on a batch of 10 real stores: 10 designs pass both checks (a second YAPI try allowed), no two share a composition, every
flow completes on a phone end to end (contact saved, code in the cart, product page open), and the owner judges them «real good
looking» next to Alia's examples.

**Owner decisions (2026-11-18):** YAPI sets up every store, the merchant tweaks; free version — YAPI writes each step's HTML and
CSS, no fixed skeleton, no YAPI JavaScript; capture is WhatsApp or email, the store chooses (WhatsApp default); flows in scope for
the programme: discount → product → its page, quiz → recommendation, smart offer by intent (Part 2), cart rescue (Part 2).

**Out of Part 1:** who sees which popup and when (Part 2); the shopper profile page and export (Part 3); sales in Bs and
automatic tests (Part 4). Part 1 only tags codes and signups with the design id so Part 4 can count them.

## 2. What exists and is reused

| Need | Existing piece |
|---|---|
| Popup runtime on the storefront | `packages/storefront-kit/kit/retention.js` (today: 6 looks, games, «Rasca y elige») |
| Games, signed prizes, personal codes | `apps/api/src/store-popups/popup-games.ts`, `popup-game.service.ts` |
| Real-browser popup check | `apps/api/src/store-popups/popup-render.ts` (retention.js in demo mode, 1280 and 390, part boxes) |
| Looks | `popup-looks.ts` — become *examples* in YAPI's prompt, no longer skeletons |
| Subscribers with interests and favourite | `StoreNewsletterSubscriber` (`interests`, `favourite`, `sourceVisitId`) |
| «Tu favorito» on later visits, product page landing | «Rasca y elige» (spec 2026-11-10) |
| A/B popup tests by chat | YAPI A/B tests (spec 2026-11-09) — Part 4 widens them to whole designs |
| Brand input | brand profile, store palette/fonts/photos, «Mejorar mi marca» brief when present |

## 3. A popup design

A new table `StorePopupDesign` (one row per version; the store points at its current one, `Store.popupDesignId`):

```
id, storeId, version, status (DRAFT | LIVE | FAILED | RETIRED), createdAt, createdBy (yapi | merchant-chat | batch)
flow        Json   — ordered steps: [{ id, kind, ...kind settings }]
steps       Json   — { [stepId]: html }   YAPI's markup for each step, cleaned
css         Text   — one sheet, scoped under [data-pya-popup="<id>"], cleaned
launcher    Text?  — optional corner tab markup
capture     'whatsapp' | 'email'
percent     Int    — the discount the code gives (5–30, store setting)
composition String — YAPI's one-line name for the layout («ticket de cupón a la izquierda, botella en escenario»)
fingerprint String — structural hash used by the variety check (§6)
checks      Json   — the last browser check (per step, per size: pass/fail + reasons)
```

The current settings in `Store.retention` (look, game, question) stay readable; a store without a LIVE design keeps today's popup.

## 4. Steps the platform understands

YAPI chooses which steps, how many and in what order (2–6), and draws each one freely. The platform owns all logic.

| Kind | Settings | Hooks YAPI's HTML must carry | What the runtime does |
|---|---|---|---|
| `offer` | — | `data-next` | goes to the next step |
| `game` | `scratch` \| `wheel`, prizes | `data-game-surface` | draws and signs the prize (existing service) |
| `pick` | product ids (2–6) or «auto» | one element `data-tile` with `data-slot="photo\|name\|price"` inside | clones the tile per product with real photo, name, live price; stores the choice; `data-next` optional |
| `quiz` | 1–3 questions, each answer → product ids | per answer `data-choice="<answerId>"` | records answers; picks 1–3 products from the answers |
| `capture` | channel from the design | `data-field="whatsapp"` or `data-field="email"`, `data-submit` | validates, adds the platform consent line (never YAPI's), saves the subscriber |
| `reveal` | — | `data-slot="code"`, optional `data-slot="percent"` | issues a personal code tied to the design |
| `land` | `product` \| `scroll` | none (no markup) | opens the chosen product with the code applied to the cart; marks it «Tu favorito» on later visits |

Every step: `data-close` (required), optional `data-back`. Rules checked on save: `capture` before `reveal`; `land` last; at
most one `game`; a `pick`/`quiz` product id must be an active product of the store.

«Rasca y elige» is the flow `game → quiz → pick → capture → reveal → land`; existing stores that use it keep working through
the old path until they get a design.

## 5. How YAPI writes a design

One structured model call per design (the store's YAPI engine), input:
- brand: palette, fonts, logo, photos (owned uploads only), voice; the «Mejorar mi marca» brief when present;
- 6–12 products (names, photos, prices), the store's sector;
- the six looks as reference pictures and short descriptions — examples, not templates;
- **compositions already used**: the merchant's other stores and the last 30 designs platform-wide (§6);
- the step vocabulary and hooks of §4; the merchant's request when it came from chat.

Output (schema-checked): `{ composition, flow, steps: {id: html}, css, launcher? }`.

**Cleaning (server, before anything is stored):**
- HTML: allowlist of tags (div, section, header, footer, p, h1–h4, span, strong, em, img, picture, source, button, ul, ol, li,
  figure, figcaption, svg + basic shapes, label, input[type=email|tel|text], small, br, hr); allowlist of attributes (class,
  data-*, aria-*, role, alt, src, srcset, width, height, viewBox, d, fill, stroke…); `src` only `/v1/uploads/<own>` or `assets/…`
  of the store; no script, style attribute limited to custom properties, no `on…`, no iframe/object/embed/form action/links out.
- CSS: every selector prefixed with `[data-pya-popup="<id>"]`; no `@import`, no `url()` outside the store's own images, no
  `position: fixed` outside the root, no `display/visibility/opacity` on `[data-close]`, `[data-field]`, `[data-submit]`;
  max 24 KB.
- Hooks present per §4 or the design is refused before the browser check.

## 6. Checks before it goes live

**Browser check** (extends `popup-render.ts`): the real runtime plays every step with the design at 390×844 and 1280×800, and
with reduced motion. Per step it measures: the close control visible, inside the viewport, at least 40×40; text contrast ≥ 4.5:1
on the dialog's computed colours; no horizontal overflow; the dialog fits the viewport (scrolls inside if taller); fields
focusable and typeable; `pick` tiles filled with real photos. A screenshot per step is kept for the Popups page preview.

**Variety check:** `fingerprint` = hash of the layout skeleton (step root's child structure, grid/flex direction, photo position,
dialog size bucket). It must differ from the merchant's other stores' LIVE designs and from the last 30 designs; YAPI's
`composition` line is compared too (same words → refused).

A failure goes back to YAPI once with the list of what failed; a second failure stores the design as FAILED and the store keeps
its current popup. YAPI says so in the chat when the run came from chat.

## 7. Shopper side

One runtime (`retention.js`, new `flow` branch) plays a LIVE design: entrance as the CSS defines (the runtime adds the
open/close classes and respects reduced motion), step transitions, back and close, Escape, focus trap, phone and desktop.
- **Contact:** WhatsApp numbers and emails are saved on the store's subscribers with `interests` (quiz answers), `favourite`
  (picked product), `popupDesignId` and `channel`. Migration: `StoreNewsletterSubscriber.email` becomes optional, `phone` gets
  `@@unique([storeId, phone])`, new `channel` and `popupDesignId` columns. pagosYa does not send WhatsApp; the merchant sees the
  list (as today).
- **Code:** personal, single-use, `percent` of the design, tagged with the design id (for Part 4).
- **Land:** the chosen product page opens with the code already applied to the cart and the product marked «Tu favorito».
- Shown once per visitor per design (today's frequency rules); Part 2 replaces this with real targeting.

## 8. Set up by YAPI, tweaked by the merchant

- **New stores:** a design is written in the first build's last step (where the popup look is set today).
- **Existing stores:** `apps/api/scripts/design-popups.ts` in batches the owner names (default 10), each store once; stores
  keep their current popup until their design passes.
- **Chat:** «hazlo más divertido», «otra forma», «descuento 15 %», «agrega una pregunta sobre tallas», «pide email», «quita el
  juego» → YAPI writes a new version (or changes settings directly when no redesign is needed: percent, channel, products).
- **Popups page** (dashboard, Crecimiento): the current design's step previews (from the check's screenshots), on/off, discount,
  WhatsApp/email, products in «¿qué buscas?», «Rediseñar», history of versions with «Volver a esta».

## 9. Failures

| What fails | What happens |
|---|---|
| Model call fails twice | no new design; current popup stays; chat says so |
| Cleaning removes required hooks | refused before the check; counts as one try |
| Browser check or variety check fails twice | FAILED version kept for diagnosis; current popup stays |
| A product in `pick`/`quiz` is archived later | the runtime drops it; with fewer than 2 left the step is skipped |
| Capture fails (network) | the shopper sees a retry; the code is not revealed until the contact is saved |
| No credits | a redesign by chat says so; the batch skips the store |

## 10. Testing

- Unit: flow rules; HTML/CSS cleaning (scripts, handlers, outside URLs, hidden close, fixed positioning, size cap); fingerprint
  stability and difference; quiz answer → products; subscriber save by phone or email.
- Browser: the extended render check on fixture designs (pass, a hidden close, overflow at 390, low contrast).
- Runtime: a fixture design played end to end in a page (offer → pick → capture → reveal → land) — code in the cart, product page.
- Light checks rule: one spec file per run.
- Live: a batch of 10 owner-chosen stores; owner judges them beside Alia's examples.

## 11. Cost

One call per design + the browser check: about 1–2 minutes and a few credits. Batch designs are platform cost; chat redesigns
come from the merchant's credits.
