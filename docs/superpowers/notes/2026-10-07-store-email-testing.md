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

---

# Rich emails (stage 2) — 2026-10-07

## 5. Apply the second migration (owner) — before the API restarts
`apps/api/prisma/migrations/20261007180000_store_email_content/migration.sql` adds `PromoCode.showInEmails` (off for every existing code) and the `StoreEmailContent` table.
The Prisma client is already regenerated with them, so **an API restarted before this migration fails every promo-code query that reads all columns** (Descuentos, checkout code lookups). Receipts still send: the store-facts and content lookups are guarded and fall back to the standard sections.
Back up, then apply both migrations: `pg_dump -h localhost -p 54329 -U postgres -Fc pagosya > ~/pagosya-before-email-content.dump`, then `cd apps/api && npx prisma migrate deploy`.

## 6. Icons
Committed PNGs in `packages/storefront-kit/kit/emails/icons/` (18 icons × dark/light, 96×96), served at `/v1/email-assets/icons/<name>-<tone>.png`.
Rebuild only when the set changes: `cd apps/api && npx ts-node --transpile-only scripts/build-email-icons.ts`.

## 7. Real Gmail check, with photos and icons
Section 3's tunnel, plus `EMAIL_TEST_TO=<your Gmail>` in `apps/api/.env` so every local test send lands in one inbox (ignored in production). Restart the API after both settings.
Before sending, give the test store the facts the email reads: a logo and banner, two products with photos, a social link (Instagram) and an unknown one (a Linktree), an address on a location, a returns policy, a published 4★+ review, and one code marked «Mostrar en correos» in Descuentos. In Ajustes › Correos › Contenido, write an announcement.
Then Enviar una prueba for each receipt and check:
- [ ] Desktop Gmail and the Gmail phone app, light and dark mode
- [ ] Hero photo, product photos and every icon load (steps, trust, contact, footer socials in white)
- [ ] Announcement bar, header links, delivery box (order) / Tu cita box (appointment), steps, trust row, promo card with the real code, review quote with stars, brand story, recommendations, contact cards, footer address and policy links
- [ ] Unknown social link shows as text; a store with nothing set up shows no empty box
- [ ] "Mostrar en correos" off on the code, or the code deactivated → the next test has no promo card
- [ ] The email is not clipped by Gmail ("[Mensaje recortado]")

A local render of the standard kit with sample facts was checked in a browser on 2026-10-07 (three layout fixes followed: icon placeholder, photo-less story, product card gap). **The real Gmail check is pending:** no tunnel was open during the build.

## 8. Known limits of stage 2
- Stores whose kit was designed in stage 1 get the standard block for each new section, in their own colours, until they redesign (Actualizar correos).
- Promo codes carry no currency; fixed discounts read as bolivianos.
- Collections link to `/c/<slug>`; a site without `coleccion.html` shows its homepage there.

