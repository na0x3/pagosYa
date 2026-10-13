# Email settings merge — design

**Date:** 2026-10-13 · **Branch:** feature/store-page-architecture · **Status:** approved in conversation, awaiting spec review

## Goal

One place to set up everything about a store's emails, with nothing shown twice. Today the merchant dashboard has email settings in two pages — Ajustes › Correos and Crecer › Correos y marketing — and the two disagree about the order confirmation.

Success: every store email appears once, in Correos y marketing; Ajustes holds only non-email settings; the order confirmation the merchant designs is the one buyers receive; nothing either page could do is lost.

## What is wrong today (audit, 2026-10-13)

1. **Two order confirmations, one silently replaces the other.** Ajustes › Correos edits the designed HTML receipt (`StoreEmailService.renderReceipt`). Correos y marketing › Plantillas has a plain-text `ORDER_CONFIRMATION` (`email-workspace.config.ts:2`). When that template is enabled, `payment-intents.service.ts:722` queues it and `:785` skips the designed receipt.
2. **The designed receipt ignores the verified sender domain.** `sendReceiptEmail` (`payment-intents.service.ts:895`) sends without `from`, Reply-To or Message-ID, so a buyer's reply never reaches the order's inbox thread. Only the plain-text receipt gets these (`email-workspace.config.ts:84-86`), and the inbox files only that one (`inbox.service.ts:186`, `recordQueuedReceipt`).
3. **Two tabs called "Dominio" mean different things.** Ajustes › Dominio is the website domain (domain-shop); Correos y marketing › Dominio is the email sender domain.
4. **Duplicates inside Correos y marketing.** Plantillas and Flujos show the same list. The welcome, cart-reminder and review-request switches appear in Plantillas and again in the Comeback Card form (`retention.ts:64-71`); both edit the same `storeRetention.settings` fields.

## Decisions (owner, 2026-10-13)

- All email settings live in **Correos y marketing**. Ajustes loses its Correos tab.
- The **designed email is the only order confirmation.** The plain-text `ORDER_CONFIRMATION` is no longer offered or sent to buyers.
- The welcome, cart-reminder and review-request switches live **only with their email** in the email list.

## 1. Page layout

### Correos y marketing (`#dashboard-marketing`)

| Tab | Holds |
|---|---|
| **Correos** (new; replaces Plantillas and Flujos) | One list of every store email, grouped: *Compras* — Confirmación de compra, Cita confirmada, Enviado, Entregado, Cancelado, Reembolso, Tarjeta de regalo; *Suscripciones* — Pago de suscripción fallido, Suscripción omitida; *Automáticos* — Bienvenida, Carrito abandonado, Pedir reseña. Each row has its on/off switch. Below the list: "Contenido de tus correos" (today's `email-content-panel.mjs`). |
| Remitente (label of the old Dominio tab; id stays `domain`) | Sender domain and name, DNS records. Unchanged. |
| Equipo, Registros, Campañas, Clientes, Códigos promocionales | Unchanged. |
| Comeback Card | The card and the signup popup only. |

- Selecting **Confirmación de compra** or **Cita confirmada** opens the designed editor (today's `email-studio-panel.mjs`): 390 px and 640 px previews, AI design, wording, test send.
- Selecting a **plain-text email** opens its editor: enabled, subject, body, sample preview. **Carrito abandonado** also has the wait time (`recoveryHours`, 1–168 h). **Bienvenida** edits `welcomeEnabled` / `welcomeSubject` / `welcomeBody`; **Carrito abandonado** edits `recoveryEnabled` / `recoveryHours`; **Pedir reseña** edits `reviewRequestsEnabled`. These are the same fields as today; only the place that edits them changes.
- The Correos tab is drawn natively by the dashboard, like Códigos promocionales (`index.html:561-575`), not inside the Studio iframe. The designed editor and content panel are already native and move without a rewrite. The plain-text editor (`source-business-workspace.ts:87-105`) is ported to a native module.
- The Studio's Plantillas and Flujos tabs and the Comeback form's welcome/recovery/review fields are removed. The Studio is rebuilt once (`pnpm run build:studio`).

### Ajustes (`#dashboard-store-settings`)

Tabs: General, Marca, Envíos y retiro, **Dominio web** (label only; id stays `domain`). The Correos tab is removed. General gets one line: "Tus correos están en Correos y marketing", linking to the Correos tab.

## 2. Sending and data

### Order confirmation

- `queueStoreEmail(..., 'ORDER_CONFIRMATION', ...)` never queues a buyer email again, whatever a store's stored `templates.ORDER_CONFIRMATION.enabled` says. `ORDER_CONFIRMATION` is dropped from `EMAIL_TEMPLATES`.
- The staff `NEW_ORDER` notification (Equipo) keeps working. It is decided independently of the buyer template today (`staffEvent`, `email-workspace.config.ts`) and must stay so.
- `receiptQueued` no longer suppresses the designed receipt: `sendReceiptEmail` always runs for a succeeded live payment with a customer email.

### Designed receipt gets the sender domain and the inbox thread

When the store's sender domain is verified (`workspaceMail(settings).domain.status === 'verified'`):

- `from` = `workspaceSender(settings)`
- Reply-To = `hola@inbound.<domain>`
- Message-ID header = `receiptMessageId(storeId, paymentIntentId)`, the same id the plain-text receipt used, so `resolveInboundThread` finds the thread unchanged.

After the send succeeds, the inbox records the receipt in the order's thread. `threadForOrder` takes the sent receipt (subject, text body, Message-ID) instead of reading an outbox row. The recorded body is the receipt's text alternative, the same `body` passed to `email.send`. `recordQueuedReceipt` and its outbox lookup are removed.

Without a verified domain, the designed receipt is sent exactly as today and nothing is filed into the thread (unchanged behaviour: there is no inbound address to reply to).

The store's support email (Ajustes › General › Correo de soporte) remains the Reply-To fallback for other workspace mails, as today.

### Existing stores

- Stores that enabled the plain-text order confirmation now send the designed email. Their plain-text subject and body are not carried over: the placeholders differ (`{{store}}` vs `{tienda}`), and the designed email has its own wording fields. The stored JSON is left in place and ignored.
- No database migration. All affected settings live in `storeRetention.settings` JSON.

### Errors

- A designed-receipt render failure sends the plain fallback, as today (`payment-intents.service.ts:897-899`).
- Filing into the inbox is best-effort and never blocks or fails the send (as today, `.catch(() => undefined)` at `:808`).

## 3. Links

- The inbox domain notice (`index.html:886`, `dashboard.js:2706-2712`) still opens marketing tab `domain`, now labelled Remitente.
- `pagosya:workspace` messages asking for marketing tab `templates` (`source-business-workspace.ts:192-193, 222`, `dashboard.js:661-664`) open the new Correos tab.
- `openSettingsSection('emails')` and any request for Ajustes tab `emails` open Correos y marketing › Correos.
- `email-content-panel.mjs:83` hint "en Descuentos" becomes "en Códigos promocionales".
- `served-modules` allow-list (`server.mjs:151`) gains the new native module(s).

## 4. Testing

Updated:
- `apps/merchant-dashboard/tests/email-studio-panel.spec.mjs`: open the designed editor from Correos y marketing › Correos.
- `store-settings-tabs.spec.mjs`: Ajustes has four tabs; Dominio web label.
- `store-settings.spec.mjs` (inbox domain notice, promo codes), `merchant-workspace.spec.mjs`, `dashboard-smoke.spec.mjs`: follow the new tabs.
- `src/settings-tabs.test.mjs`, `unit/served-modules.test.mjs`.
- Studio: `source-business-workspace.test.ts`, `retention.test.ts`, `tests/retention.spec.ts`.
- API: `email-workspace.spec.ts`, `email-workspace-events.spec.ts`, `inbox-order-receipt.spec.ts`.

New:
- With a verified domain, the designed receipt is sent with `from`, Reply-To and Message-ID, and appears in the order's inbox thread; a reply to it resolves to that thread.
- Without one, the designed receipt is sent as before and nothing is filed.
- An enabled stored `ORDER_CONFIRMATION` template sends nothing to the buyer; the designed receipt still goes out.
- The team's `NEW_ORDER` notification still goes out.
- The Correos list shows each email exactly once; each switch saves to its field; Carrito abandonado saves `recoveryHours`.
- Welcome, reminder and review switches appear nowhere else (Comeback Card tab).
- Ajustes › Correos requests land on Correos y marketing › Correos.

## Out of scope

- Moving the plain-text emails (Enviado, Reembolso, …) to the designed look.
- Abandoned-cart work (opt-in checkbox, merchant list, single funnel): separate spec.
- Bulk store deletion: separate spec.

## Rollout

Lands on `feature/store-page-architecture`, then `pnpm run build:studio`; the owner's dev servers serve the working tree. No dev-database changes; API e2e tests use their own embedded Postgres.

## Corrections found while planning (2026-10-13)

The plan (`docs/superpowers/plans/2026-10-13-email-settings-merge.md`) supersedes the spec on these points:
- **`recoveryHours` has no route from the email list today.** `EmailTemplateDto` gains an optional `recoveryHours` (1–168), saved by the RECOVERY template.
- **The Comeback form keeps sending the welcome/recovery/review values** it no longer shows: `RetentionSettingsDto` requires them and `RetentionService.save` replaces the whole settings object.
- **The two designed confirmations have no switch**; their rows say "Siempre activo".
- **`recoveryEnabled` also turns on the storefront's "save my cart" offer**; its help text in Correos says so.
- **The domain sender and inbox thread apply to live payments only**, as the old plain-text receipt did. The verified-domain send uses `failLoudly`, so a rejected send files nothing in the inbox.
- **The designed editor's own type switcher is hidden** (`types: false`) so the confirmations are not listed twice.
