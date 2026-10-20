# Store Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner prefers inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store's email-signup popup opens at the right moment (after a delay and/or on exit intent), remembers the visitor for 30 days, sits as a bottom sheet on phones, and can hand out the store's welcome discount code after a real signup.

**Architecture:** The kit's existing signup dialog (`packages/storefront-kit/kit/retention.js`, opened on arrival today) becomes the popup. Its new settings live in the store's existing retention settings JSON (`StoreRetention.settings`), so there is **no migration**. The public retention endpoints carry the timing and whether a code exists; the code itself is returned only by a successful popup signup.

**Tech Stack:** NestJS + Jest (`apps/api`), plain browser JS (`kit/retention.js`), Vitest + jsdom (`apps/checkout/test`), Studio TS (`apps/merchant-studio/src/retention.ts`).

**Spec:** `docs/superpowers/specs/2026-10-19-store-popup-suggestions-design.md` §1 (Store popup). §2 (YAPI suggestions) is out of scope for this plan.

## Deliberate deviations from the spec (owner request 2026-10-20 «start it»)

- No `Store.popup*` columns or migration: the fields go in `StoreRetention.settings` next to `signupTitle/Body/Button`, which the popup already uses. Same behaviour, nothing for the owner to apply.
- Popup texts are the existing signup title/body/button (already per store, editable in Studio «Tu comunidad»).
- Demo stores (`config.demo`, the pagosya.bo showcase) show the popup too so investors see it; signup there is simulated (no API, no code). Never in the Studio preview (`config.preview` or the editor's `PAGOSYA_PREVIEW` without `demo`).

## Global Constraints

- Settings: `popupTrigger: 'load' | 'delay' | 'exit' | 'both'` (default `'both'`), `popupDelaySeconds: 0–60` (default 8), `popupPromoCodeId: string | null` (default null). `'load'` keeps today's behaviour.
- Shown at most once per visitor per store for 30 days: closing or signing up stores a timestamp in `localStorage` key `pagosya:popup:<slug>`; storage errors mean "show at most once this page view".
- Never opens on checkout, account/login pages, legal pages, a receipt/recovery/unsubscribe link (`comeback`, `recover`, `unsubscribe` query), while another dialog is open, or in the Studio preview.
- Code: only the store's own `isActive` promo code, only in the response to a successful `source: 'popup'` subscribe; never in config, settings or page source.
- Accessible: native `<dialog>` with `aria-labelledby`, Esc and a visible close button, focus returns; no motion under `prefers-reduced-motion`.
- Phone ≤ 700px: bottom sheet (full width, rounded top, slides up); desktop: the current centred card.
- Copy in Spanish (Bolivia).
- Saving `apps/api` files restarts the owner's API: one burst, check RUNNING YAPI jobs first.

## Review Focus

1. A promo code id from another store or an inactive code must never be returned → API test in Task 1.
2. A visitor who closed the popup must not see it again on the next page or tomorrow → kit test in Task 2.
3. Exit intent must not fire on phones (no pointer) → kit test in Task 2 (`both` on a touch device uses only the delay).
4. The popup must not open over the checkout shell or an open cart drawer → kit test in Task 2.
5. Demo stores: signup must not call the network → kit test in Task 2.

---

### Task 1: API — popup settings, public timing, code on popup signup

**Files:**
- Modify: `apps/api/src/retention/retention.dto.ts` (`RetentionSettingsDto`, `DEFAULT_RETENTION`, `RetentionSubscribeDto`)
- Modify: `apps/api/src/retention/retention.service.ts` (`save`, `subscribe`)
- Modify: `apps/api/src/retention/retention.controller.ts` (public `GET` settings, `subscribe` passes `source`)
- Modify: `apps/api/src/stores/stores-public.controller.ts:81-87` (newsletter path passes `source`)
- Test: `apps/api/src/retention/retention.service.spec.ts`

- [ ] **Step 1: Failing tests** (add to the existing service spec, using its prisma mock style)
  - `save` rejects a `popupPromoCodeId` whose code belongs to another store or is inactive (`BadRequestException('Elige un código activo de esta tienda.')`), accepts the store's own active code, and keeps `popupTrigger/popupDelaySeconds` in the saved settings.
  - `subscribe(store, email, { source: 'popup' })` returns `{ subscribed: true, code: 'PEPPA10' }` when `popupPromoCodeId` points to the store's active code; returns `{ subscribed: true }` (no `code`) for `source` absent, for an inactive code, and when no code is set.
  - Public settings include `popupTrigger`, `popupDelaySeconds`, `popupHasCode` and never `popupPromoCodeId` or a code string.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/retention` → the new tests FAIL.
- [ ] **Step 3: Implement**
  - DTO: `@IsOptional() @IsIn(['load','delay','exit','both']) popupTrigger?`, `@IsOptional() @IsInt() @Min(0) @Max(60) popupDelaySeconds?`, `@IsOptional() @ValidateIf(v => v !== null) @IsString() @MaxLength(40) popupPromoCodeId?: string | null`; defaults `popupTrigger: 'both', popupDelaySeconds: 8, popupPromoCodeId: null`. `RetentionSubscribeDto`: `@IsOptional() @IsIn(['popup']) source?: 'popup'`.
  - `save`: when `popupPromoCodeId` is set, `findFirst({ where: { id, storeId, isActive: true } })` or throw the message above.
  - `subscribe(store, rawEmail, profile = {})`: keep everything; at the end, if `profile.source === 'popup' && settings.popupPromoCodeId`, look the code up with the same `storeId + isActive` filter and return `{ subscribed: true, ...(code ? { code: code.code } : {}) }`.
  - Public `GET`: add `popupTrigger: s.popupTrigger, popupDelaySeconds: s.popupDelaySeconds, popupHasCode: Boolean(s.popupPromoCodeId)`.
  - Controllers pass `dto.source` through to `subscribe`.
- [ ] **Step 4: Run** `npx jest src/retention src/stores/stores-public` → PASS.
- [ ] **Step 5: Commit** `feat(api): the signup popup's timing and welcome code live in the store's retention settings`

### Task 2: Kit — the popup's timing, memory, phone sheet and code

**Files:**
- Modify: `packages/storefront-kit/kit/retention.js` (`mountSignup`, `mountRetention`, signup styles)
- Test: `apps/checkout/test/retention-popup.test.ts` (new; jsdom evaluates `kitPath('retention.js')`, fake timers, `fetch` stubbed)

- [ ] **Step 1: Failing tests**
  - `popupTrigger: 'delay', popupDelaySeconds: 8`: dialog closed at 7.9s, open at 8s.
  - `'exit'` on a pointer device: opens on `mouseout` with `relatedTarget === null` and `clientY <= 0`; never on a touch device (`matchMedia('(pointer: coarse)')` true).
  - `'both'` on touch: opens on the delay only.
  - Closing writes `pagosya:popup:<slug>` with a timestamp; a second mount within 30 days does not open; after 31 days it opens.
  - Never opens when `[data-pagosya-checkout-page]` exists, when `.pya-checkout` is visible, when a `dialog[open]` exists, or with `?unsubscribe=…`.
  - Popup signup posts `{ email, consent: true, source: 'popup' }`; a `{ code }` response shows the code with a «Copiar» button; no `code` → thanks text only.
  - `config.demo`: opens on its trigger, submit makes no `fetch` call and says «Prueba completada: en tu tienda aquí llega el correo de bienvenida.»; `config.preview`: never opens.
- [ ] **Step 2: Run** `pnpm --filter @pagosya/checkout exec vitest run test/retention-popup.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `retention.js`:
  - Replace the arrival `open()` at the end of `mountSignup` with `schedulePopup(open, settings, config, query)` that honours trigger/delay, the exclusions above, and the 30-day key (`localStorage`, try/catch).
  - `remember()` writes the 30-day key (keep the sessionStorage write for compatibility).
  - Submit sends `source: 'popup'` when the dialog (not the inline launcher) submitted; render `result.code` in `<p class="signup-code"><strong>CODE</strong> <button type="button" data-copy>Copiar</button></p>`; copy via `navigator.clipboard?.writeText`, fallback select.
  - Demo: in `mountRetention`, `const demo = Boolean(config.demo) && !config.preview;` — demo opens the popup and its submit shows the simulated message without calling `api`.
  - CSS: `@media(max-width:700px){.pagosya-signup-dialog{inset:auto 0 0 0;width:100%;max-height:85dvh;margin:0;border-radius:20px 20px 0 0}.pagosya-signup-layout{grid-template-columns:1fr;min-height:0}.pagosya-signup-photo{display:none}}` plus a slide-up keyframe guarded by `prefers-reduced-motion:no-preference`.
- [ ] **Step 4: Run** the test file and `pnpm --filter @pagosya/checkout test` → PASS.
- [ ] **Step 5: Commit** `feat(kit): the signup popup waits for its moment, remembers the visitor for 30 days, and shows the welcome code`

### Task 3: Studio — popup settings in «Tu comunidad»

**Files:**
- Modify: `apps/merchant-studio/src/retention.ts` (section 02 «Tu comunidad», save mapping lines 95–97)
- Test: `apps/merchant-studio/src/retention.test.ts`

- [ ] **Step 1: Failing test:** the section renders «Cuándo aparece» (`popupTrigger` select: Al entrar / Después de unos segundos / Al querer salir / Ambos), «Segundos» (`popupDelaySeconds`, 0–60) and «Código de bienvenida» (`popupPromoCodeId` select: «Sin código» + the store's active codes passed in), and saving sends those three values.
- [ ] **Step 2: Run** `pnpm --filter @pagosya/merchant-studio exec vitest run src/retention.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three fields; the codes come from the promo-codes list the Studio already loads for the store (find it with `grep -n "promo" apps/merchant-studio/src/api.ts`; if none exists, add `listPromoCodes(storeId)` calling the existing dashboard promo-codes endpoint and pass the active ones in).
- [ ] **Step 4: Run** the test → PASS; `pnpm --filter @pagosya/merchant-studio exec tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(studio): merchants choose when the signup popup appears and its welcome code`; then `pnpm run build:studio` in `apps/merchant-dashboard`.

### Task 4: PEPPA please showcase + redeploy

**Depends on:** the owner's pickup address for «Cómo pedir» step 3.

- [ ] YAPI edit on revision 6: step 3 «Elige retiro» uses the owner's address; nothing else changes.
- [ ] Export the new revision, `npm run build` it, run the showcase publish script (`.superpowers/…/peppa/publish.mjs` pattern: prefix `/tiendas/peppaplease`, demo config) and add `data.retention = { signupEnabled: true, signupTitle: 'Get hotter news', signupBody: …, signupButton: 'Suscribirme', popupTrigger: 'both', popupDelaySeconds: 8, popupHasCode: false }` to its `config.js`; copy the new `kit/retention.js` into `site/`.
- [ ] `node showcase/build.mjs peppaplease && node showcase/capture.mjs peppaplease`; check locally (popup after 8s, inline contact form, footer signup), then `npm run deploy` in `pagosYaWeb` (owner approved deploys of this store), uncommitted per the owner's rule.
