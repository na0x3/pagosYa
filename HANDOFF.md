<!-- last-updated-commit: 5730e2c75f8189410e67c8b2f0767aa30d067760 -->
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

Chrome connected for the first time (prior session's tooling never came
up) — did a full visual QA pass on the multi-store UI: storefront browse,
add-to-cart, checkout, test payment, dashboard store creation, product
create/edit/cancel, and a CSS audit for mobile (window resize doesn't
actually change the captured viewport in this sandbox, so verified via
`style.css` instead — global `border-box`, fluid `max-width:640px`
container, no fixed widths that would overflow narrow screens). Local
Postgres had died since the prior session (`/health` was 503); restarted
with `pnpm run dev:db`, no data lost.

**Two real bugs found and fixed, both committed to `origin/main`:**
1. Empty-store message ("Esta tienda no tiene productos disponibles
   todavía") reused the red `.status.failed` error style, indistinguishable
   from a genuinely broken link. Added a neutral `.status.empty` variant
   (`apps/checkout/src/style.css`) and pointed `renderStore`'s empty branch
   at it (`apps/checkout/src/main.ts`).
2. In the merchant dashboard, `resetPaymentLinkForm()`
   (`apps/merchant-dashboard/index.html`) hardcoded the product-form submit
   button to "Crear link" — a leftover label from before products were
   grouped into stores. It fired after every successful create, so the
   button silently went stale/wrong right after first use. Changed to
   "Crear producto" (matches the static HTML default and the real create
   endpoint being `/stores/:id/payment_links`).

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

- **SIN/SIAT e-invoicing is a mock** — no real CUF/CUFD algorithm or XML
  (siatinfo.impuestos.gob.bo was unreachable when built, broken TLS chain).
- **All payment rails are mocks** except Banco Económico QR Simple (real,
  flagged off by default via `BANECO_QR_ENABLED`).
- Product data on "Ropa Urbana" is inconsistent (names say "Camiseta" /
  t-shirt, uploaded photos are caps) — leftover from manual testing, not a
  code bug, safe to ignore or reseed over.
- No other known open bugs — check `git log` for anything past this file's
  `last-updated-commit`.

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
  the real process underneath has died (happened this session with
  Postgres) — `pnpm run dev:db` restarts just the DB.
- If the dev DB gets reset (`prisma migrate reset` / breaking schema
  changes), re-run `pnpm run seed` after — doesn't happen automatically,
  and the ops reviewer/demo merchants silently disappear otherwise.
- Live local state, if still running: dashboard login
  `demo@pagosya.bo` / `demopassword123`; merchant secret key
  `sk_test_xOguOoTUgaAl2ipGcNbR96t5ZykZck10`; stores "Ropa Urbana"
  (`?link=3xfvwail`) and "theStore" (`?link=5d6goo2l`, empty).
