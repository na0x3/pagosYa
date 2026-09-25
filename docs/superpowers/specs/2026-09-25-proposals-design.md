# AI Proposals (D2) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md`
(§2 row D2, §3 decisions 3, 4 and 6, §4 shared rules). Builds on D0
(`2026-09-25-document-foundations-design.md`) and D1 (`2026-09-25-cobros-design.md`). Owner request: "AI Proposal —
Create professional online proposals in seconds — with AI … i want everything guided and easy for the user, i want
the user experience to be bomb." The owner asked not to be asked questions: every choice below is a ruling the owner
may overturn.

## 1. What exists (from the code, 2026-09-25)

- D0: `BusinessDocument` of kind `PROPOSAL` with typed blocks (`heading | paragraph | list | clause`), items, the
  `PRO-0001` number on first send, frozen hashed versions, the signed link `${CHECKOUT_ORIGIN}/d/<token>`, HTML email +
  PDF, the per-store email cap, and `{{placeholders}}` that block a send (title, customer, item descriptions, blocks).
  Statuses already include `ACCEPTED`, `CHANGES_REQUESTED`, `EXPIRED`; `ACCEPTED`/`EXPIRED` are final (no edits).
- D0 `StructuredCompletionService` (`ai/structured-completion.ts`): strict JSON schema, `store: false`, luna by
  default, metered, a fixed untrusted-input rule that also forbids inventing people, amounts and dates.
- D1: the checkout page `/d/:token` (`cobro-page.ts`), merchant preview tokens, WhatsApp/email/copy sharing,
  `shared` events, the dashboard module pattern (`cobros-panel.mjs` + `cobros.mjs` + `cobros.css`, glue in
  `dashboard.js`, `server.mjs` whitelist), the lock order (document row first, never wait for an intent).
- Inbox: `StoreInboxThread` / `StoreInboxMessage` (a thread is keyed by store + customer email; `leadId`/`orderId`
  optional), listed in the dashboard Inbox.

## 2. Decisions

1. **No schema change.** Everything fits D0's tables: the brief lives in an `ai_drafted` event, acceptance in an
   `accepted` event (dedupeKey `accepted`), the link to the cobro in `cobro_created` (dedupeKey `cobro`) on the
   proposal and `created` `{ fromProposal }` on the cobro. `schema.prisma` is not touched (G1 is editing it).
2. **Draft with AI** — `POST v1/stores/:storeId/proposals/draft`
   `{ brief (10–2000), customerName?, customerEmail?, customerPhone?, budgetHint? (≤200), deadline? (≤120), tone: formal | cercano }`.
   - Context sent to the model: store name, tagline, a 400-char excerpt of the about text, category names (≤20),
     and a catalog excerpt of ≤60 active products `{ id, name, price, category }`. The merchant's brief is sent as
     JSON data in the user message; the system prompt says it is untrusted (plus the helper's fixed rule).
   - The model returns a strict schema: `title`, `intro`, `problem`, `scope[]`, `deliverables[]`,
     `timeline[{ when, milestone }]`, `investmentNote`, `paymentTerms`, `revisions`, `nextStep`,
     `items[{ description, quantity, source: catalog | merchant | unknown, catalogId, merchantAmount }]`.
   - It becomes a DRAFT `PROPOSAL` (through D0 `create`) with nine blocks in this order: Introducción (paragraph),
     Entendimiento del problema (paragraph), Alcance (list), Entregables (list), Cronograma (list, "when — milestone"),
     Inversión (paragraph; the items table renders under it), Condiciones de pago (clause), Revisiones (clause),
     Próximo paso (paragraph). `validUntil` = 15 days (end of that day in La Paz). The customer fields are the
     merchant's, never the model's. An `ai_drafted` event keeps `{ brief, budgetHint, deadline, tone, model }`.
   - Model: luna by default (the helper's default). Stage `proposal-draft`. Throttled 10/min per client.
3. **Never invent prices (server-enforced, not only prompted).**
   - `source: catalog` with a `catalogId` from the excerpt → the unit price is the catalog's, whatever number the
     model wrote. An unknown id counts as `unknown`.
   - `source: merchant` → accepted only when that amount appears literally in the brief or the budget hint
     (normalized: `1500`, `1.500`, `1,500.00`, `Bs 1500` are the same number). Anything else is `unknown`.
   - `unknown` → `unitAmount: 0` and the description ends with ` {{precio}}`; D0's placeholder check then blocks the
     send with 422 until the merchant types a price (the editor removes the marker when a price is typed).
   - In every block text/list line, a money mention (`Bs 1.500`, `$200`, `1500 bolivianos`, `US$ 90`) whose value is
     not an allowed amount (catalog prices, brief/budget numbers, accepted item amounts and the accepted total) is
     replaced by `{{precio}}`.
   - Quantities are clamped to 1–100000; at most 20 items; descriptions ≤ 480 characters (room for the marker).
4. **Regenerate one section** — `POST v1/stores/:storeId/documents/:id/regenerate-section`
   `{ block, instruction? (≤300) }` → `{ block }` of the same type and title. Uses the stored brief, the proposal
   title and the other section titles as context; the price guard runs on it; nothing is persisted (the editor
   autosaves). Refused (409) for a final document; 404 for another store or a non-proposal. Stage `proposal-section`.
5. **AI notice.** Every AI draft shows "Borrador generado con IA — revísalo antes de enviarlo" in the editor
   (umbrella decision 3); a pending-data list names each `{{…}}` and the send button stays disabled while any remain.
   A missing AI key (503) offers "Empezar sin IA" (the same nine sections, empty, as a template).
6. **Public page, proposal kind** (same `/d/:token`, rendered by `apps/checkout/src/documents/proposal-page.ts`).
   Store brand, `PRO-0001`, status line, title, "Para …", the sections, Inversión (items + total), a validity
   countdown ("Válida hasta el 10 de octubre · quedan 9 días" / "vence hoy"), Descargar PDF, contact line, and two
   actions: **Aceptar propuesta** (name + email + a line saying it accepts version N) and **Pedir cambios**
   (name, email, message). On phones a sticky bar keeps the total and "Aceptar" in reach.
   States: open, accepted ("Aceptada por Ana el …"), changes requested (still acceptable, says the merchant is
   reviewing), expired (no actions), voided (D0's reduced view), preview (actions disabled, banner).
7. **Accept** — `POST v1/documents/public/:token/accept { name, email, version }` (throttled 10/min, no-store).
   - Inside a transaction the document row is locked (`FOR UPDATE`). Only `PROPOSAL`s in `SENT | VIEWED |
     CHANGES_REQUESTED`, not past `validUntil` (then it is expired and 409), and only for `version ===
     currentVersion` (409 "El comercio actualizó esta propuesta…" so nobody accepts a text they did not read).
   - Conditional `updateMany` → `ACCEPTED`; event `accepted { name, email, version, sha256 }` with IP and user agent,
     dedupeKey `accepted` (signature-lite evidence: who, when, from where, which exact version).
   - An already accepted proposal answers 200 with its acceptance (a double tap is not an error), no second event.
8. **Request changes** — `POST v1/documents/public/:token/changes { name?, email, message (3–2000) }`.
   - Allowed in `SENT | VIEWED | CHANGES_REQUESTED` before `validUntil`; at most 5 per proposal per 24 h (429).
   - Status → `CHANGES_REQUESTED` (conditional); event `changes_requested { name, email, message, version }`
     with IP/UA; an Inbox thread "Propuesta PRO-0001" for that customer email (found or created, unread) gets the
     message as an INBOUND message (`messageId proposal.<eventId>@pagosya`).
   - The merchant gets an email (to the store contact email, else the merchant's email, `replyTo` = the customer)
     **within the store's daily document email cap**: a `merchant_notified` event is claimed in a transaction that
     checks the cap, and the cap now counts `emailed + merchant_notified + reminded(email)`. Over the cap the email
     is skipped (the timeline and Inbox still have it). The same notification goes out on acceptance.
   - The merchant edits the working copy and re-sends; a changed send makes version 2 and status `SENT` (D0).
9. **Expiry.** A proposal past `validUntil` in `SENT | VIEWED | CHANGES_REQUESTED` becomes `EXPIRED` on read (the
   public view, conditional `updateMany`) and by a worker every 15 minutes; `expired` is recorded once per version
   (`expired:v<n>`). Expired is final (D0): the dashboard offers **Duplicar** (a new draft with the same content).
10. **Crear cobro** — `POST v1/stores/:storeId/documents/:id/cobro { dueAt? }` (default: 7 days).
    - Only an `ACCEPTED` proposal. Locks the proposal row; if a `cobro_created` event exists, the existing cobro is
      returned (idempotent, also after a failed send). Otherwise an INVOICE is created from the **accepted
      version's** frozen items, discount, currency and title, the customer from that version (falling back to the
      accepter's name and email), a note "Según la propuesta PRO-0001 aceptada el …", event `created
      { fromProposal }`; on the proposal `cobro_created { cobroId }` (dedupeKey `cobro`). Then it is sent with
      `email: false` (D1's one-tap rule) and returned `{ cobro, created }`.
    - A proposal without priced items answers 422 ("crea el cobro a mano").
11. **List and summary.** `GET …/documents?kind=PROPOSAL&state=` gains `draft | open | accepted | closed` for
    proposals (open excludes past-validity; closed = expired, voided, declined, or open past validity).
    `GET v1/stores/:storeId/proposals/summary` → counts `{ all, draft, open, changes, accepted, closed }` and per
    currency `{ open, accepted30 }` (value of open proposals; accepted in the last 30 days).
12. **Dashboard: Documentos → Propuestas** (`src/proposals.mjs` pure helpers with `node --test`,
    `src/proposals-panel.mjs` `mountProposalsPanel(deps)`, `src/proposals.css`).
    - First run: "Propuestas profesionales en segundos", three steps (Describe el trabajo · YAPI arma la propuesta ·
      Tu cliente la acepta en línea) and three example prompts ("Diseño de logo e identidad para una cafetería",
      "Mantenimiento mensual de jardín", "Catering para 50 personas") that open the composer prefilled.
    - Composer: one big box, example chips, "Más detalles (opcional)" (customer name/WhatsApp/email, presupuesto,
      fecha límite), tone Formal/Cercano, "Crear borrador con IA", a staged progress message while it works.
    - Editor (full-screen on phones): AI notice, title, customer, every block editable (title + text, or one line
      per list item), move up/down, delete, "Regenerar con IA" per block, "Agregar sección"; the Inversión items table
      (description, quantity, price, catalog picker, missing prices marked) with a live total; validity presets
      (7/15/30 días, otra fecha); pending-data list; autosave (debounced PATCH) with a saved indicator; "Vista previa"
      (signed preview) and "Enviar propuesta" → share sheet (WhatsApp, Email, Copiar enlace, Ver como cliente).
    - List: summary (Abiertas value, Aceptadas 30 días), tabs Todas / Abiertas / Aceptadas / Borradores / Cerradas,
      cards with status chips: borrador, enviada, vista, aceptada, cambios pedidos, vencida, anulada.
    - Detail: status, value, validity, customer, the customer's change request (quoted) with "Editar y reenviar",
      acceptance card with **Crear cobro** (or "Ver cobro"), timeline, Compartir, Ver como cliente, PDF, Editar,
      Duplicar, Anular.
    - Crear cobro switches to Cobros and opens that cobro's share sheet (`cobros.open(id, { share: true })`).

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| Draft rules | `business-documents/proposal-draft.ts` | Prompt, schema, catalog context, price guard, blocks. |
| Proposals service | `business-documents/proposals.service.ts` | draft, regenerate, summary, accept, changes, expiry, cobro. |
| Merchant email | `business-documents/proposal-email.ts` | Accepted / changes requested notification (escaped). |
| Worker | `business-documents/proposals.worker.ts` | Expiry every 15 min. |
| Routes | `proposals.controller.ts`, `business-documents-public.controller.ts` | New routes. |
| D0 service | `business-documents.service.ts` | Proposal list states, public view fields + expiry on read, cap counts `merchant_notified`. |
| DTOs | `dto/business-document.dto.ts` | New DTOs, list states. |
| Checkout | `apps/checkout/src/documents/proposal-page.ts` + `.css`, dispatch in `cobro-page.ts` | The public page. |
| Dashboard | `src/proposals.mjs`, `src/proposals-panel.mjs`, `src/proposals.css`, `index.html`, `dashboard.js`, `server.mjs`, `cobros-panel.mjs` (`open`) | The view. |

## 4. Tests

- API (jest, AI mocked — no paid calls): price guard (catalog price wins over the model's, merchant amount only if
  in the brief, unknown → `{{precio}}` + 0, money in text replaced, allowed amounts kept); prompt carries the catalog
  and the brief as data; draft creates a DRAFT proposal with the nine blocks, validity, the merchant's customer and
  the `ai_drafted` event, and 404s another store; regenerate returns one block of the same type, guarded, and refuses
  a final document; send is blocked by `{{precio}}`; accept (version check, expiry, idempotent, evidence, once);
  changes (status, inbox thread + message, merchant email within the cap, 5/day); expiry on read and in the worker
  (once, never over accepted/voided); cobro (accepted only, frozen items, idempotent, linked events, sent);
  list states and summary.
- Checkout (vitest): proposal page renders sections, items, total and validity; accept posts name, email and
  version and shows the accepted state; changes posts the message; expired/accepted/voided/preview states.
- Dashboard: `node --test` for `proposals.mjs`; Playwright `tests/proposals.spec.mjs` (API and AI mocked) at 390 and
  1280: empty state → example prompt → AI draft → edit a block, fix a missing price, regenerate a section → send →
  share; list chips; accepted → Crear cobro. The smoke suite includes the view.

## 5. Out of scope

E-signature with codes (D3), PDF styling per section beyond D0's renderer, proposal templates library, multiple
options/packages per proposal, a customer confirmation email on acceptance (the page is the receipt), declining
(`DECLINED` is left for later; "Pedir cambios" covers it), the larger model tier toggle (the helper supports it; no UI).
