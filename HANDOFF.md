<!-- last-updated-commit: fa9a6e6dc5846aa925e9d7353f066b1330f1b4a2 -->
# HANDOFF

Session handoff notes for pagosYa. Updated at the end of each Claude Code
session (see `.claude/settings.json` Stop hook) so a new session can read
this instead of re-deriving project state from scratch. Keep it short.
Architecture/regulatory model/how-to-run-locally: see `README.md` — don't
duplicate it here.

## Project state

Working tree clean, `main` matches `origin/main`. CI (GitHub Actions
build+test) configured. Two leftover test stores in the live local DB —
see "Leftover test data" below.

## This session

Chrome connected for the first time — did a full visual QA pass on the
multi-store UI (storefront, cart, checkout, dashboard CRUD flows) and
fixed two real bugs found along the way:
1. Empty-store message reused the red error style — gave it a neutral
   `.status.empty` variant (`apps/checkout/src/{style.css,main.ts}`).
2. Dashboard's product-create button silently relabeled itself "Crear
   link" (a pre-multi-store leftover) after first use — fixed in
   `resetPaymentLinkForm()`, `apps/merchant-dashboard/index.html`.

**Branding applied.** User dropped the real pagosYa logo (meerkat mark,
amber `#ffbd59`) at the repo root — moved the source to
`assets/brand/logo.png`, cropped a mark-only variant, and used it to
replace the placeholder "pY" square in the merchant dashboard + ops
console headers and as the favicon on all three apps. Primary buttons in
both dashboards re-themed from navy to the brand amber (dark text,
10.8:1 contrast, checked). Checkout's own storefront palette was left
alone on purpose — each store already shows the *merchant's* logo/colors,
not pagosYa's, and per-store "Color de fondo" (background color) already
existed in the dashboard before this session, wired end-to-end — it
wasn't new work, just confirmed working.

**Leftover test data, not cleaned up:** two duplicate stores named "Tienda
QA Test" (ids `cmsiekdis000cbeezgjf6h8mp` and `cmsiejum0000abeezl50yzcia`,
one has a product "Producto QA") from manually testing store/product
creation. Deleting them via the dashboard's "Eliminar" button trips a
native `confirm()` dialog, which hangs Claude-in-Chrome's automation (no
way to dismiss it programmatically) — left them rather than risk getting
stuck unattended. Delete both from "Tus Tiendas" next time a human's at
the keyboard, or ask a fresh session to do it via curl with the merchant's
dashboard session token.

## Known problems / open gaps

- **`settlementMode` (AGGREGATOR vs FACILITATOR) is API-only, no dashboard
  toggle, and defaults to FACILITATOR.** Explained to the user this
  session: FACILITATOR merchants are explicitly skipped by pagosYa's own
  payout worker (`payouts.service.ts` `createDuePayouts` filters to
  `AGGREGATOR` only) — the design intent is the card network/bank settles
  directly to the merchant, pagosYa never holds the money. AGGREGATOR is
  the "I collect it, then I credit merchants" model the user actually
  described wanting — pagosYa pools funds, deducts its fee, and
  auto-sweeps the payable balance to the KYC bank account once the
  merchant is `ACTIVE`. Every merchant actually used this session so far
  is FACILITATOR + still PENDING KYC. `seed.ts` already seeds one of each
  mode side by side (`demo-aggregator@pagosya.bo` walked to ACTIVE,
  `demo-facilitator@pagosya.bo` left PENDING) to demonstrate the contrast.
  User hasn't asked for a fix yet — flagged that AGGREGATOR probably
  should be easier to reach (a dashboard toggle, or just the new-signup
  default) if that's really the intended business model.
- **No per-merchant/per-store payment-method opt-out.** Every checkout
  always shows all four rails (Tarjeta, Tigo Money, Transferencia, QR);
  QR's only toggle is the single global `BANECO_QR_ENABLED` env flag, not
  a per-merchant setting. Confirmed via code read this session (no such
  field on `Merchant`/`Store` in `schema.prisma`) — user asked, this is a
  real gap, not a hidden feature. Not built yet; user hasn't asked for it
  to be built, just knows about it now.
- **SIN/SIAT e-invoicing is a mock** — no real CUF/CUFD algorithm or XML
  (siatinfo.impuestos.gob.bo was unreachable when built, broken TLS chain).
- **All payment rails are mocks** except Banco Económico QR Simple (real,
  flagged off by default via `BANECO_QR_ENABLED`). This also covers
  payouts: the KYC → ops-review → automatic-payout workflow is fully
  built (`apps/api/src/payouts/payout-delivery.worker.ts` sweeps payable
  balances every 10s to the bank account merchants give in KYC), but the
  actual disbursement is `mock-bank-disbursement.adapter.ts` — no real
  bank integration yet.
- Product data on "Ropa Urbana" is inconsistent (names say "Camiseta" /
  t-shirt, uploaded photos are caps) — leftover from manual testing, not a
  code bug, safe to ignore or reseed over.
- No other known open bugs — check `git log` for anything past this file's
  `last-updated-commit`.

## Persistence model (came up this session, worth stating once)

Stores/products live in Postgres — permanent, survive any browser closing.
The merchant dashboard's login token is `sessionStorage` — cleared when the
tab/window closes, so re-login is needed next time (nothing is lost, just
re-auth). A buyer's cart is `localStorage` per store — survives closing the
tab until checkout completes.

## Local dev notes

- `pnpm` isn't on PATH as a real binary, only a corepack shim that fails
  signature verification in this sandbox. `~/.local/bin/pnpm` wraps a
  cached 9.15.9 build directly — add `~/.local/bin` to PATH. Install with
  `--no-frozen-lockfile` under 9.x, then `git checkout -- pnpm-lock.yaml`
  (don't commit the 9.x-regenerated lockfile over the pinned 11.20.0 one).
- `apps/api` watch mode needs `packages/shared-types` built first
  (`pnpm --filter @pagosya/shared-types run build`) — nothing rebuilds it
  automatically.
- Postgres/API/checkout/dashboard may still be running in the background
  (ports 54329/3000/5173/4323) — check
  `ps aux | grep -E "nest start|vite|node server.mjs|postgres -D"` before
  starting fresh copies. Note the wrapper `sh -c` process can survive while
  the real process underneath has died (happened once this session with
  Postgres) — `pnpm run dev:db` restarts just the DB. The ops console
  (port 4322, `apps/ops`) isn't normally left running — only started for a
  one-off branding check this session, then stopped again.
- If the dev DB gets reset (`prisma migrate reset` / breaking schema
  changes), re-run `pnpm run seed` after — doesn't happen automatically,
  and the ops reviewer/demo merchants silently disappear otherwise.
- Live local state, if still running: dashboard login
  `demo@pagosya.bo` / `demopassword123`; merchant secret key
  `sk_test_xOguOoTUgaAl2ipGcNbR96t5ZykZck10`; stores "Ropa Urbana"
  (`?link=3xfvwail`) and "theStore" (`?link=5d6goo2l`, empty).
