# YAPI Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner prefers inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After YAPI builds a store (when the personal touch finishes, or right after creation when it is off), its chat message carries 2–3 tappable cards with personal next steps for that business — a section or detail, turning the signup popup on, or featuring a product — never something the store already has.

**Architecture:** One small structured model call (`SourceDialogueService.suggestNext`) reads the store's current state and returns at most 3 cards; the API filters out anything the store already has and stores them in the assistant message's `metadata.suggestions`. The Studio draws them under the message like the clarification buttons: tapping a design/product card sends its instruction as a normal chat message; tapping the popup card turns signup + popup on through the retention settings; «No, gracias» dismisses them for good.

**Tech Stack:** NestJS + Jest (`apps/api/src/storefront-source`), Studio TS + Vitest (`apps/merchant-studio/src/source-studio.ts`).

**Spec:** `docs/superpowers/specs/2026-10-19-store-popup-suggestions-design.md` §2. The popup (§1) is built (plan `2026-10-20-store-popup.md`).

## Global Constraints

- At most 3 cards; each `{ id, title, instruction, kind: 'design' | 'popup' | 'product' }`; titles ≤ 60 chars, instructions ≤ 400 chars, Spanish, in the store's voice, no invented facts, prices or reviews.
- Never offer what exists: no `popup` card when signup is already on; no `product` card for a product already featured/spotlighted; no `design` card whose section kind the store already has (compare against the master state's section list).
- One structured call, on the ChatGPT plan like the other dialogue calls; a failed or empty call means no cards (the build message is unchanged).
- Dismissed suggestions never come back for that store. Store the dismissal without a migration: read `StoreSourceProject` first; if it has a JSON settings column use it, otherwise use `StoreRetention.settings.suggestionsDismissedAt`, and note the choice in the ledger.
- Saving `apps/api` files restarts the owner's API: one burst, check RUNNING YAPI jobs first.

## Review Focus

1. A store with signup already on must never see the popup card → API test in Task 1.
2. A failed model call must leave the «Tu tienda está lista» message intact, without cards → API test in Task 1.
3. Tapping a card while YAPI is busy must not send twice → Studio test in Task 2 (disabled like `[data-clarification]`).
4. After «No, gracias», reloading the Studio must not show the cards again → Studio + API tests.
5. The popup card when the store has no active promo code still turns the popup on, without a code, and says a code can be added in «Tu comunidad».

---

### Task 1: API — make, filter and store the cards; dismiss them

**Files:**
- Modify: `apps/api/src/storefront-source/source-dialogue.service.ts` (new `suggestNext(merchantId, input)` structured call; copy the schema/transport pattern of `fillMaster`, found with `grep -n "fillMaster" source-dialogue.service.ts`)
- Create: `apps/api/src/storefront-source/source-suggestions.ts` (pure `filterSuggestions(cards, state)` and `suggestionInput(state)`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` — the personal-touch success reply and, when `app.yapiPersonalTouch` is off, the «Tu tienda … está lista» reply (~line 270) add `metadata.suggestions`, skipped when dismissed.
- Modify: the source-project controller — `POST v1/stores/:storeId/source-project/suggestions/dismiss` records the dismissal.
- Test: `apps/api/src/storefront-source/source-suggestions.spec.ts`

- [ ] **Step 1: Failing tests:** `filterSuggestions` drops a `popup` card when `signupEnabled`, a `product` card for an already-featured product id, a `design` card whose `section` is already present, duplicates, and anything past 3; trims titles/instructions. The chat reply: a stubbed `suggestNext` returning 4 cards yields ≤ 3 in `metadata.suggestions`; a throwing `suggestNext` yields the same content with no `suggestions`; a dismissed store gets none. The dismiss endpoint stores the timestamp and is idempotent.
- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-suggestions` → FAIL.
- [ ] **Step 3: Implement** the filter, the dialogue call (schema `{ suggestions: [{ title, instruction, kind, section?, productId? }] }`, max 3), the two reply hooks (try/catch → no cards), and the dismiss endpoint.
- [ ] **Step 4: Run** the spec plus `npx jest src/storefront-source/source-chat --maxWorkers=2` → PASS.
- [ ] **Step 5: Commit** `feat(yapi): after building a store, YAPI suggests two or three personal next steps it doesn't have yet`

### Task 2: Studio — draw the cards and act on a tap

**Files:**
- Modify: `apps/merchant-studio/src/source-studio.ts` (message renderer ~line 787, click wiring ~line 1184, busy/disabled list ~line 1210)
- Modify: `apps/merchant-studio/src/api.ts` (`dismissSuggestions(storeId)`)
- Test: `apps/merchant-studio/src/source-suggestions.test.ts`

- [ ] **Step 1: Failing tests:** an assistant message with `metadata.suggestions` renders up to 3 `button[data-suggestion-card]` plus «No, gracias»; a design/product tap goes through the existing `send(instruction)` path; a popup tap calls `api.writeRetention(storeId, '', 'PUT', { ...current, signupEnabled: true, popupTrigger: 'both' })` and shows «Listo: el popup de suscripción está activado.»; cards are disabled while busy; «No, gracias» calls `api.dismissSuggestions` and removes them; historical messages after a newer revision draw no cards.
- [ ] **Step 2: Run** `pnpm --filter @pagosya/merchant-studio exec vitest run src/source-suggestions.test.ts` → FAIL.
- [ ] **Step 3: Implement** following the `clarification-options` pattern (`disabled(busy || dirty() || historical())`).
- [ ] **Step 4: Run** the test, the Studio suite (`source-focus-debug.test.ts` already fails before this work) and `tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(studio): YAPI's suggestion cards — tap to apply, or dismiss for good`; then `pnpm run build:studio` in `apps/merchant-dashboard`.

### Task 3: Live check (owner approval, ChatGPT plan)

- [ ] On one dev store, run a build or a personal touch, confirm 2–3 relevant cards, tap a design card (YAPI edits), tap the popup card (signup + popup on), dismiss on another store and reload. Screenshots to `tmp/`.
