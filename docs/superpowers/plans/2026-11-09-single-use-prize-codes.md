# Single-use prize codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every game winner gets their own one-use code (`RULETA15-K7QM2X`); no shared, guessable prize codes.
**Spec:** `docs/superpowers/specs/2026-11-09-popup-games-design.md` § Addendum 2026-11-09.
**Facts:** the order's code is `PaymentIntent.metadata.promoCode` (store-checkout.service.ts ~275); paid = `PaymentIntent.status SUCCEEDED`;
`PaymentIntent.merchantId`; checkout resolves codes in `PromoCodesService.resolveActiveForStore(storeId, raw)` (promo-codes.service.ts:57).

## Tasks
1. **popup-games.ts** — `GamePrize = { percent, label, chance }` (read old `{promoCodeId,label}` rows by `percentOf(label)`); token signs
   `storeId:percent:exp` (`createGameToken(storeId, percent, exp, secret)`, `readGameToken → number | null`); `winnerCode(game, percent, rand)`
   → `RULETA15-XXXXXX` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Tests first (popup-games.spec.ts).
2. **popup-game.service.ts** — enable/setTopPrize store percents only (no promo codes); `usable` = all saved prizes (≥ 2); `play` draws by
   chance; `validPrize(storeId, token)` = token readable; `claim(storeId, token, wasSubscribed)` creates the winner's PromoCode
   (PERCENT, value percent, `maxUses: 1`, active, showInEmails false, showInAssistant false; retry on P2002) and returns its code;
   disable just turns the game off. `activeSlices` = labels. Tests first (popup-game.service.spec.ts).
3. **Schema + checkout** — `PromoCode.maxUses Int?`; migration `prisma/migrations/<ts>_promo_code_max_uses` (ALTER TABLE "PromoCode" ADD COLUMN
   "maxUses" INTEGER); `resolveActiveForStore` refuses when `maxUses` and `paymentIntent.count({ merchantId, status: SUCCEEDED,
   metadata: { path: ['promoCode'], equals: code } }) >= maxUses` → «Este código ya se usó». Test first (promo-codes service spec).
   Apply: `pnpm dev:doctor --backup`, then `npx prisma migrate deploy` in apps/api, then `npx prisma generate`.
4. **Callers** — retention controller/service unchanged in shape (`validPrize`, `claim`, `activeSlices`); Studio prize list reads `label`;
   chat ops unchanged. Run retention-popup, store-edit, chat-store-edit, render specs one by one.
5. **Live** — Remolino via API: enable wheel, play, claim → `RULETA{n}-XXXXXX`; claim with a new email → a different code; restore
   (game off). Report.
