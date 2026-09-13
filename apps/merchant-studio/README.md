# pagosYa Merchant Studio

Merchant Studio is the conversation-first editor for a merchant's real pagosYa store. The default route is connected mode; `/?demo=1` keeps the isolated A+C interaction prototype available for design reviews.

## Run it locally

Start the API and checkout with the normal pagosYa development command, then run the Studio in another terminal:

```bash
pnpm dev
pnpm dev:studio
```

Open `http://127.0.0.1:4312` and sign in with the same merchant email and password used by the dashboard. In local development, Vite proxies `/api` to `http://localhost:3001`. Studio uses `VITE_CHECKOUT_ORIGIN`, then the dashboard's saved checkout origin, then `http://localhost:5175` (the `pnpm dev` stack). When running checkout separately on port 5174, set `VITE_CHECKOUT_ORIGIN=http://localhost:5174`.

For a deployed Studio, set:

```bash
VITE_API_BASE_URL=https://api.example.com/v1
VITE_CHECKOUT_ORIGIN=https://stores.example.com
VITE_DASHBOARD_ORIGIN=https://merchants.example.com
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


## Source editor: store tools and photo creation

In `/?source=1` (including the embedded editor), **Mi tienda** in the canvas toolbar groups brand/content, marketing, shipping, digital files and gift-card/store-credit tools. Digital files and balances open separate panels; article redirects remain accessible under content tools. The composer stays focused on the conversation.

**Crear tienda desde una foto** starts with one JPG, PNG or WebP product image. Existing sites also expose **Mi tienda → Diseñar desde una foto**. Review the photo, optionally add details in chat, and choose **Crear tienda desde esta foto**. This sends `setupAction: product-photo` through the existing authenticated upload and source-message APIs. It explicitly delegates design and bypasses the two discovery questions only for this photo workflow. Ordinary chat and legacy quick creation retain their discovery gate. An unclear photo can still require clarification.

The result is a draft using the real photograph. Names, prices, stock and selling policies are not inferred from pixels; missing product information must be completed before selling. This flow does not publish. Generation uses the selected AI model and credit limit; image requests need a vision-capable model. Upload and generation errors preserve the draft or offer a retry using the same uploaded URL.

Focused checks: `source-product-photo.spec.ts`, `source-composer.spec.ts`, `brand-commerce.spec.ts`, `commerce-parity.spec.ts`, and API `source-chat.service.spec.ts` / `source-conversation.service.spec.ts`. Browser tests mock external AI responses; they do not assess a live generated design.
