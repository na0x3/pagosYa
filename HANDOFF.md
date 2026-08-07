<!-- last-updated-commit: e371ccc547e6da0bdde3fede774a12a3d1fc9daf -->
# HANDOFF

Session handoff notes for pagosYa. Updated at the end of each Claude Code
session (see `.claude/settings.json` Stop hook) so a new session can read
this instead of re-deriving project state from scratch. Keep it short.
Architecture/regulatory model/how-to-run-locally: see `README.md` — don't
duplicate it here.

## Project state

Working tree has one **uncommitted** change (see below). `main` otherwise
matches `origin/main` at `e371ccc`. CI (GitHub Actions build+test) configured.

## This session

Chrome connected for the first time (prior session's tooling never came
up) — did a visual QA pass on the multi-store UI shipped previously.
Local Postgres had died since the last session (`/health` was 503);
restarted with `pnpm run dev:db`, no data lost. Confirmed working as
designed: centered store name/logo, stacked full-width product photos,
color swatches, per-store scoping in the dashboard, archive/delete
buttons.

**Found + fixed one real bug:** the empty-store message ("Esta tienda no
tiene productos disponibles todavía") reused the red `.status.failed`
error style, indistinguishable from a genuinely broken link. Added a
neutral `.status.empty` variant (`apps/checkout/src/style.css`) and
pointed `renderStore`'s empty branch at it (`apps/checkout/src/main.ts`).
Verified both states render distinctly. **Uncommitted** — plain edits on
top of a clean tree; ask the user before committing (solo-dev repo,
direct-to-`origin/main`, no PR, per established convention).

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
