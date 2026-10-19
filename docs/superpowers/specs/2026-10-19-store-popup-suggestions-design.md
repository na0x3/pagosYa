# Store popup and YAPI suggestions — design (Spec B)

Date: 2026-10-19. Status: designed with the owner in conversation. Follows Spec A
(`2026-10-19-esencial-variety-design.md`); built after Spec A.

## 0. Why

Owner compared pagosYa stores with Amboras stores (craverly.co, n3mah.com) whose popups and extra sections make them
feel personal. Measured: Craverly's popup is a connected Klaviyo integration; pagosYa's store kit has no popup. Owner
chose: email signup with a welcome discount; and YAPI proposing 2–3 personal touches after creation.

## 1. Store popup

### 1.1 Behaviour
- Rendered by the store kit (`packages/storefront-kit/commerce-src`), so every store has it, Esencial or not.
- Look from the store: its colours (`--store-*` / `--es-*`), heading/body fonts, corner style and button shape. Phone:
  bottom sheet; desktop: centred card with an optional photo (the store's hero photo when it has one).
- Trigger: after `popupDelaySeconds` (default 8) or exit intent (desktop pointer leaving the top edge), per
  `popupTrigger` (`delay` | `exit` | `both`, default `both`).
- Shown at most once per visitor: closing or signing up stores a timestamp in localStorage; not shown again for 30 days.
  Never on cart, checkout, account, login pages, the store's legal pages, or inside the Studio preview's edit mode.
- Accessible: `role="dialog"`, `aria-modal`, focus trapped while open, Esc and a visible close button, focus returns
  to where it was; motion off under `prefers-reduced-motion`.

### 1.2 Signup
- The form posts to the existing public endpoint `POST /v1/stores/public/:slug/newsletter` (same validation, rate
  limit, consent text and unsubscribe). Extra field `source: 'popup'` recorded in `interests` as `popup`.
- When the store has `popupPromoCodeId` and that code is active and belongs to the store, the endpoint's success
  response for a popup signup includes `{ code }`; the popup shows it with a copy button. The code is never in the page
  source or config before a successful signup.
- No promo code: thanks message only ("Te avisaremos de novedades").

### 1.3 Data and dashboard
- Migration (owner applies): `Store.popupEnabled Boolean @default(false)`, `popupTitle String?`, `popupBody String?`,
  `popupCta String?`, `popupPromoCodeId String?` (FK to PromoCode, `onDelete: SetNull`), `popupTrigger String
  @default("both")`, `popupDelaySeconds Int @default(8)`.
- Public store config carries `popup: { enabled, title, body, cta, trigger, delaySeconds, hasCode }` (no code).
- Dashboard «Correos y marketing»: a «Popup de bienvenida» card — switch, three texts (with YAPI's default), promo code
  dropdown (the store's own active codes; a link to create one), trigger and delay.
- At master-store creation the fill call also writes popup texts in the store's voice (saved to the store, popup left
  off until the merchant or a suggestion turns it on).

## 2. YAPI suggestions

- When: after the personal touch finishes (Spec A §5), or right after creation when it is off.
- What: 2–3 cards in YAPI's chat message (`metadata.suggestions: [{ id, title, instruction, kind }]`), made for that
  business by one small structured call over the store's current state (variants, sections, products, popup state).
  Never something the store already has. Kinds: `design` (a section or detail), `popup` (turn the popup on),
  `product` (feature a product).
- Tap: sends the card's `instruction` as a normal chat message (`kind: design/product` → design edit; `popup` → turns
  the popup on through the settings path, attaching the store's welcome code if one is marked, else the card says to
  create one first). Dismiss: removes the cards; they are not offered again for that store.
- Studio renders the cards under the message (same component family as the old template cards).

## 3. Testing and order of work

1. Migration + config + public endpoint (`code` only after a valid popup signup, only the store's own active code).
2. Kit popup: shows once, respects the 30 days, never on excluded pages, focus trap/Esc, reduced motion, signup posts and
   shows the code; screenshot QA at 1280/390 on Esencial and two non-Esencial templates.
3. Dashboard card.
4. Suggestions: never repeats what exists, at most 3, tap runs the instruction, dismiss sticks.
5. Live check (owner approval, ChatGPT plan): one store — popup signup with a code, a suggestion tapped.
