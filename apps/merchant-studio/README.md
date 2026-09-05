# pagosYa Merchant Studio

Merchant Studio is the conversation-first editor for a merchant's real pagosYa store. The default route is connected mode; `/?demo=1` keeps the isolated A+C interaction prototype available for design reviews.

## Run it locally

Start the API and checkout with the normal pagosYa development command, then run the Studio in another terminal:

```bash
pnpm dev
pnpm dev:studio
```

Open `http://127.0.0.1:4312` and sign in with the same merchant email and password used by the dashboard. In local development, Vite proxies `/api` to `http://localhost:3001`, while the embedded storefront uses `http://localhost:5174`.

For a deployed Studio, set:

```bash
VITE_API_BASE_URL=https://api.example.com/v1
VITE_CHECKOUT_ORIGIN=https://stores.example.com
```

The Studio origin must also be included in the API's `ADDITIONAL_CORS_ORIGINS` setting.

## How the connected section works

1. **Authentication and store selection** — the Studio uses the existing `dash_…` merchant session and loads `GET /v1/stores`. The selected store ID is remembered for the browser session.
2. **Persistent YAPI conversation** — `GET /v1/stores/:id/agent-conversation` restores the saved thread. Sending a command posts to `/agent-conversation/messages`, so refreshing the Studio does not erase the task history.
3. **Three-image batch** — one picker event is validated as one ordered batch. Every accepted file immediately gets its own stable slot, is read independently, then each file is uploaded through `POST /v1/uploads`. YAPI receives all returned URLs in one command. This avoids the old behavior where a file read could overwrite another slot or appear only after a second selection.
4. **Private proposal** — YAPI saves a `StoreVisualProposal`; it does not alter the live store. The left panel shows what changed and what was preserved, and the right iframe renders the actual checkout/storefront with the proposal passed as a sanitized preview patch.
5. **Checkout review** — choosing **Carrito / checkout** sends the checkout app a preview-navigation message. This lets the merchant inspect the real cart and checkout presentation. Payment rails, prices, stock, fulfillment, KYC, and publication state remain protected from free-form visual commands.
6. **Approval and publishing** — the publish button stays disabled until the active proposal is explicitly approved. **Aplicar y publicar** calls the existing proposal-apply endpoint, which updates the public store and saves a pre-change version.
7. **Restore** — the undo control restores the newest saved `StoreVisualVersion`, providing a persistent rollback rather than a local-only undo.

The main integration lives in `src/connected-studio.ts`; API contracts and preview URL construction are isolated in `src/api.ts`; the deterministic upload behavior remains independently tested in `src/batch-upload.ts`.

## Verification

```bash
pnpm --filter @pagosya/merchant-studio test
pnpm --filter @pagosya/merchant-studio test:e2e
pnpm --filter @pagosya/merchant-studio build
```

The end-to-end suite covers both the design prototype and the connected flow: login, one three-image selection, three uploads, YAPI proposal review, checkout review, approval, and publish.
