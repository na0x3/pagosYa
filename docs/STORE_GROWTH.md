# Store growth and customer inquiries

The dashboard's **Consultas y crecimiento** workspace contains an inbox, partner links, and YAPI suggestions. It is scoped to the signed-in merchant's store.

## Customer forms

New stores start with the contact form disabled. Existing preferences are preserved. Merchants can enable or disable it from the inbox or **Publicación y pruebas** in Studio, including before first generation. The setting also changes the live store; it does not require another design publication. Generated websites use `[data-pagosya-contact]`; the commerce runtime adds a section on the homepage when the hook is absent. The hosted storefront uses its existing contact section. Fields: name, email, optional WhatsApp, and message (600 characters maximum). Email remains required for a reply.

Public submissions use `POST /v1/stores/public/:slug/leads`. The backend validates the active store, enabled form, and submitted product IDs. It saves the inquiry before attempting the email notification; an unavailable email provider does not lose a saved message. The existing public rate limit remains in place. Preview submissions are simulated and do not reach the backend.

Owners can filter and paginate inquiries and mark them NEW, READ, or RESOLVED. Email and phone links open the owner's contact application; changing an inquiry status does not send a reply.

## Partner attribution

Create a named partner with a commission percentage. Share a store URL containing `?partner=CODE`. The dashboard defaults to the hosted store URL and also accepts the published generated website's address. On hosted and newly exported storefronts, the latest explicit partner code is kept in session storage for that store. It survives page navigation and is forwarded to cart checkout. Codes from paused partners, unknown codes, and codes belonging to other stores do not receive attribution.

The server resolves the active partner and saves its ID and commission rate on the new StoreOrder. Browser-supplied percentages are never accepted. Pausing a partner stops attribution for new orders and preserves historical orders.

Reports cover orders created in the last 30 days with live payments. Only SUCCEEDED payments contribute sales. Successful refund transactions reduce the commission base, clamped to zero. Commissions are rounded to minor currency units per order; currencies remain separate. These are calculated commissions for manual settlement, not automatic payouts. Refunds to orders created before the reporting window are not included. At more than 10,000 orders, the UI explicitly marks totals as partial.

## YAPI suggestions

Suggestions are deterministic and evidence-based: unanswered inquiries, low stock, products appearing in paid orders after refunds, and preparation for the first real sale. Test payments never count as sales. Each suggestion states its evidence and opens the relevant workspace. Suggestions do not alter pricing or publish changes automatically.

## Automatic website checks

Opening a saved revision in Studio, including a newly generated revision, runs isolated browser checks at 1280px and 390px. Results appear beneath the revision controls and can be rerun. Checks cover internal link destinations, page content, horizontal overflow, JavaScript errors, cart add/remove, the payment-form handoff, and simulated contact submission when enabled. Every authored HTML page is loaded. Tests use a representative available simple product; variants/extras requiring hosted selection are reported as untested when no simple product is available.

Diagnostic frames use an opaque sandbox, restrictive CSP, and no network access. They cannot create orders, send inquiries, or charge customers. Results are local diagnostics for the current Studio session, not a persisted certification, security review, or bank-rail test. Visual review and real payment-provider verification remain separate.

## Setup and validation

Apply `20260906200000_store_growth`, regenerate Prisma Client, rebuild/restart the API, and rebuild embedded Studio. Existing source exports retain their historical runtime; regenerate or save a new revision with the current `commerce.js`, then export/deploy it. PEANU was upgraded locally to revision 12 without removing earlier revisions.

Tests: `store-growth.service.spec.ts`, `store-growth.e2e-spec.ts`, Studio `source-checks.spec.ts`, and dashboard `store-growth.spec.mjs`. The integration test uses a disposable PostgreSQL database and a failing fake email provider to verify durable delivery and merchant isolation. Browser tests use intercepted APIs and synthetic customer details.
