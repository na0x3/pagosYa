# Store email look — stage 1 testing

## 1. Apply the migration (owner)
`apps/api/prisma/migrations/20261007120000_store_email_kits/migration.sql` adds `StoreEmailKit` and `StoreEmailCopyOverride`.
Back up first: `pg_dump -h localhost -p 54329 -U postgres -Fc pagosya > ~/pagosya-before-email-kits.dump`.
Then `cd apps/api && npx prisma migrate deploy`. Never `migrate dev` or `migrate reset` against the dev database.

## 2. Example set
`cd apps/api && npx ts-node --transpile-only scripts/email-kit-examples.ts <scratch dir> --i-accept-costs` (billed: at most 25 credits per kit), open `<scratch dir>/index.html`.
Judge quality and uniqueness side by side. Record the credits per kit below. A repair that repeats across stores is a prompt bug: fix `emailKitPrompt` and rerun.

## 3. Real Gmail with photos
1. `cloudflared tunnel --url http://localhost:3001` and copy the https URL.
2. Set `PUBLIC_ASSET_BASE_URL=<that URL>` in `apps/api/.env` and restart the API.
3. Sign in to the dashboard with the Gmail account, open Ajustes › Correos.
4. Enviar una prueba for each receipt. Check desktop and phone, light and dark mode. Attach screenshots here.

## 4. Known limits of stage 1
- Hero photos and site `assets/` images come with stage 2 (no stage-1 email uses a hero).
- From local dev without a tunnel, emails arrive without photos by design.

## Results
| Store | Mode | Credits | Repairs | Notes |
|---|---|---|---|---|
| — | — | — | — | Not run on 2026-10-07: the OpenAI API account in `apps/api/.env` returned `credit_balance_exhausted`, and the ChatGPT-plan bridge only reaches the API process. Run the script after adding API credits, or design from Ajustes › Correos (which uses the plan) once the migration is applied. |
