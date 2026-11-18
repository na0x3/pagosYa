# Popup games — design (rasca y gana, ruleta)

Owner 2026-11-09: «lets also make the scratch pop ups and like gambling pop ups those cause a lot of clients», with a recording of
The Merman's popup (themerman.com): scratch first → «You've got up to 35% OFF» → CLAIM → «First, who are we styling?» (4 taps) →
email → code; after closing, a «TRY YOUR LUCK ×» tab stays in a corner. Built on the popup looks
(docs/superpowers/specs/2026-11-09-popup-looks-design.md): a game is drawn inside the store's look, where the form usually sits.

## Decisions (owner)

- Games: **rasca y gana** (scratch card), **ruleta** (spin the wheel), and the **corner tab**.
- **Everyone wins** a real discount; the reveal shows the **exact prize** («¡Ganaste 15 % de descuento!»), never «hasta X %».
- **Play first, email to claim**, with **one tap question** before the email.
- **YAPI sets default prizes, the merchant edits** them (Ajustes or chat).
- **Off by default**: the merchant (or the owner by chat) turns a game on; YAPI suggests it once.
- **Shared codes for now** (one code per prize, like today's welcome code); per-shopper single-use codes are a later change.

## 1. Settings (StoreRetention.settings, JSON, no migration; kept by Ajustes saves)

```ts
popupGame?: 'scratch' | 'wheel' | null;            // null/absent = the plain look
popupGamePrizes?: Array<{ promoCodeId: string; label: string; chance: number }>;  // 2–6 prizes, chances sum to 100
popupQuestion?: { text: string; answers: string[] } | null;                     // 3–4 answers, ≤ 40 chars each
```

Prize codes are ordinary `PromoCode` rows (PERCENT or FIXED), active, of this store. A prize whose code was switched off or deleted is
skipped at draw time; with no usable prize the game falls back to the plain look.

## 2. Server

- `POST /v1/stores/public/:slug/retention/play` (throttle 10/min per IP): when the store's game is on, draws a prize by its chances
  (`crypto.randomInt`), and returns `{ prize: { label }, gameToken, slices }` where `gameToken` is an HMAC-signed `{ storeId,
  promoCodeId, exp: 30 min }` (secret from config, like `createOrderTrackingToken`) and `slices` the prize labels in wheel order. The
  code itself is not returned.
- `subscribe` accepts `gameToken` and `answer` (one of the question's answers): a valid, unexpired token for this store with a still
  usable code returns that code (instead of the welcome code); `answer` is added to the subscriber's `interests`. An email that was
  already subscribed before this request gets no prize: «Este correo ya recibió su premio.» A bad or expired token: the signup still
  works, no code, «Tu premio venció; vuelve a jugar.»
- `publicRetentionSettings` adds `popupGame`, `popupQuestion` and the prize labels (never codes or code ids).

## 3. Store page (retention.js)

- The popup opens in the store's look; with a game, `pya-form` holds the game step, then the question, then the short email form.
- **Rasca y gana:** a canvas card (gold, the store accent tint) over the prize text; pointer/touch scratching clears it; at 45%
  cleared it reveals fully. Keyboard and screen readers: a «Rascar» button reveals at once.
- **Ruleta:** an SVG wheel with the prize labels in slices (store colours alternating), a «Girar» button; it spins 4 s
  (`cubic-bezier(.17,.67,.2,1)`) and lands on the drawn prize's slice; reduced motion → no spin, the prize shows at once.
- Reveal: «¡Ganaste {label}!» + «Reclamar». Then the question (tap buttons, «Saltar» link). Then email + consent + «Recibir mi
  código». Then the code with «Copiar».
- One play per device: the drawn prize and token are kept in `localStorage` (`pagosya:game:{slug}`) for 30 min; reopening shows the
  same prize, never a new draw. Demo stores and the Studio preview draw locally and never send.
- **Corner tab:** after the popup is closed without claiming, «Prueba tu suerte ×» sits bottom-left on later pages (not at checkout,
  receipts, recovery links, or after a claim); tapping opens the popup at its current step; × hides it for 30 days.
- Hosted (published) stores: the email is typed in the secure form as today; the token and answer travel with the subscribe request.

## 4. YAPI and Ajustes

- Turning a game on (chat «pon un rasca y gana» / «pon una ruleta», or the Ajustes switch) creates four codes when the store has none
  for the game — `RASCA5`/`RASCA10`/`RASCA15`/`RASCA20` (or `RULETA…`), PERCENT, chances 40/30/20/10 — and YAPI writes the question
  from the store's categories and products (one short model call; on failure the question is left out).
- Chat ops (part `popup`): `game` (value `scratch`/`wheel`/`off`), `prize` (value «25 %» for the top prize, or «agrega 30 %»,
  «quita 5 %»; chances rebalanced so they sum to 100, smaller prizes likelier), `question` (text + answers, or «sin pregunta»).
- Ajustes › Marketing: «Juego» (Ninguno / Rasca y gana / Ruleta), the prize list (code, label, chance %), the question.
- YAPI suggests the game once after the popup look is set (a suggestion card, like the existing retention suggestions).

## Testing

- Draw: over 10,000 draws each prize within ±2 points of its chance; skipped inactive codes; signed token verifies, a changed or
  expired one fails; a second claim with the same email gets no code.
- `subscribe` with token/answer: code returned, answer stored, welcome code not returned instead.
- Render (real retention.js): scratch and wheel steps in each of the six looks at 1280 and 390 pass the render rules; the reveal,
  question and email steps visible; corner tab placement.
- Quick-edit spec for `game`/`prize`/`question`.
- Live: a test store with each game, played with a mouse and with phone-sized touch; the code applies at checkout.

## Out of scope

Single-use per-shopper codes, «try again» slots, free-shipping prizes (no such code type yet), other games, A/B tests.

## Addendum 2026-11-09 — single-use prize codes (owner: «Yes, as described»)

Replaces «Shared codes for now» (the review showed RASCA20/RULETA20 are guessable and the draw can be fished).
- Prizes are `{ percent, label, chance }` (no shared codes). The game token signs `{ storeId, percent, exp }`.
- A valid claim creates the winner's own code `RULETA15-K7QM2X` / `RASCA15-…` (6 characters from A–Z and 2–9, no 0/O/1/I), PERCENT,
  `maxUses: 1`, active, not shown in emails or the assistant; it is returned and sent in the welcome email as today.
- `PromoCode.maxUses Int?` (null = unlimited; migration, applied after a DB backup). Checkout (`resolveActiveForStore`) refuses a code
  whose paid orders already reach `maxUses`: «Este código ya se usó». Two checkouts started before either is paid may both pass (rare).
- The four shared codes are no longer created; stores already holding them keep them as ordinary codes. Old saved prizes are read
  with their percent taken from the label.
