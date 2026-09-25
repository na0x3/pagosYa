# AI Contracts with e-signature (D3) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md`
(§2 row D3, §3 decisions 2, 3, 4 and 6, §4 shared rules). Builds on D0 (`2026-09-25-document-foundations-design.md`),
D1 (`2026-09-25-cobros-design.md`) and D2 (`2026-09-25-proposals-design.md`). Owner request: "AI Contract — Generate
eSignature-ready contracts — all in one workflow … i want everything guided and easy for the user, i want the user
experience to be bomb". The owner asked not to be asked: every choice below is a ruling the owner may overturn.

## 1. What exists (from the code, 2026-09-25)

- D0: `BusinessDocument` kind `CONTRACT` (number `CON-0001`), status `SIGNED`, typed blocks, frozen hashed versions,
  the signed link `/d/<token>`, preview tokens, HTML email + PDF, the per-store daily document email cap,
  `{{placeholders}}` that block a send, `BusinessDocumentSignature` (role, name, method TYPED|DRAWN, `imageUrl`,
  email, `codeVerifiedAt`, IP, UA, version, `versionSha256`, `signedAt`; unique per document+version+role).
  D0 deferred: the issuer (store/legal data) is not inside the hashed snapshot.
- D2: `StructuredCompletionService` (luna, metered, strict schema, untrusted-input rule), the money scanner
  (`proposal-money.ts`) and text guard (`guardMoneyText`), confirm-tap markers, If-Match `editTag`, the lock order
  (document row `FOR UPDATE` first), `oneLine()`, request-context IP/UA, the dashboard module pattern.
- Legal data: `MerchantInvoicingProfile` (razonSocial, NIT), `MerchantKycSubmission` (legalName, taxId, legalRepName,
  legalRepDocumentId), store name / contact email. No store address column.

## 2. Decisions

1. **No schema change.** Contract data lives in D0's `content` JSON as a leading block
   `{ type: "contract", contract: ContractMeta }` followed by `clause` blocks; OTP codes, verifications and
   signing context live in events; signatures use the existing `BusinessDocumentSignature` table (a drawn signature
   is a PNG data URL in `imageUrl`, ≤ 60 000 characters). Nothing to migrate; D0–D2 rows are untouched.
2. **Issuer and parties frozen in the signed version (fixes D0's deferral for contracts).**
   `ContractMeta = { contractType, city, signingOrder, merchantParty { legalName, document, representative,
   representativeDocument, address, email }, customerParty { address, representative, representativeDocument } }`
   (customer name / CI-NIT / email are D0's customer columns). `buildSnapshot` moves the meta block into
   `snapshot.contract` (hashed with everything else); `snapshot.blocks` are the clauses. Other kinds never carry it
   (a `contract` block is dropped for them), so their hashes do not change. A voided link drops `contract` too.
3. **Contract types**: `servicios` (prestación de servicios), `compraventa` (bienes muebles), `alquiler` (bienes muebles
   / equipos), `confidencialidad` (NDA), `personalizado`. Each has role labels (EL PRESTADOR / EL CLIENTE,
   EL VENDEDOR / EL COMPRADOR, EL ARRENDADOR / EL ARRENDATARIO, LA PARTE REVELADORA / LA PARTE RECEPTORA,
   PRIMERA PARTE / SEGUNDA PARTE) and a fixed clause outline (partes, objeto, precio y forma de pago, plazo,
   obligaciones, confidencialidad where relevant, resolución, jurisdicción y ley aplicable, domicilios, firmas).
4. **Never invent party details.** The *Partes* (comparecencia) and *Domicilios* clauses and the signature block are
   written by the server from the party data, never by the model. A missing field becomes a placeholder in the meta
   (`{{NIT del comercio}}`, `{{CI o NIT del cliente}}`, `{{domicilio del cliente}}`, `{{ciudad}}`…), and D0's
   placeholder check (extended to the contract meta) blocks the send (422). Sending a contract also needs a customer
   email (the signing code goes there) — 422 otherwise.
5. **Merchant party prefill**: invoicing profile (razonSocial, NIT) → latest approved KYC (legalName, taxId,
   legalRepName, legalRepDocumentId) → store name; email = store contact email → merchant email. Address has no
   source → placeholder. The merchant can edit every field.
6. **Draft with AI** — `POST v1/stores/:storeId/contracts/draft` `{ contractType, objeto (5–2000), priceAmount?
   (minor units), currency?, paymentTerms? (≤500), plazo? (≤300), city? (≤60), extra? (≤1000), signingOrder?,
   customerName?, customerDocument?, customerEmail?, customerPhone?, customerAddress?, fromProposalId?, ai? }`.
   - The model (luna, stage `contract-draft`, throttled 10/min) gets the type, role labels, city, the merchant's terms
     as JSON data, and writes `{ title, clauses[{ key, title, text }] }` for the type's outline only (partes,
     domicilios and firmas excluded — the server writes those). Clauses refer to parties by role label only.
   - **Money guard (D2's, reused)**: `priceAmount` (typed in a money field) is allowed as is; amounts the merchant wrote
     in `paymentTerms`/`extra`/`objeto` (D2's `merchantAmounts`) are allowed but the clause gets `{{confirmar monto}}`
     (a confirm tap in the editor removes it; the send is blocked until then); every other money mention becomes
     `{{precio}}`. From an accepted proposal, its accepted total counts as typed.
   - `ai: false` (and the dashboard's "Empezar sin IA", also offered on 503) builds the same outline from built-in
     Bolivian-Spanish templates with `{{…}}` for the objeto, price, plazo — no AI call.
   - Validity ("Firmar antes de") defaults to 30 days (end of day, La Paz). Event `ai_drafted { terms, model }`.
7. **Regenerate one clause** — `POST v1/stores/:storeId/contracts/:id/regenerate-clause { index, instruction? }` →
   `{ block }` (same title), guarded, not persisted. Partes/Domicilios are rebuilt from the meta instead (no AI).
   409 for a final contract or one the customer already signed.
8. **AI notice** in the editor: "Borrador generado con IA — revísalo; no es asesoría legal". A plain legal notice
   on the composer, the editor and the public page: "Esta firma electrónica simple sirve para acuerdos comerciales
   privados. Para escrituras públicas, compraventa de inmuebles o vehículos, y ciertos actos laborales o societarios
   se necesita notario o firma digital: consulta a un abogado o notario." Choosing *alquiler* shows "Solo bienes
   muebles o equipos — para inmuebles consulta a un abogado o notario."
9. **Signing order** (`merchant_first` default, or `customer_first`). merchant_first: the customer page says
   "Esperando la firma de <comercio>" until the merchant signs the current version; the dashboard offers
   "Firmar y enviar" (send, then sign). customer_first: the merchant can sign only after the customer.
10. **Customer signing** on `/d/:token` (contract view): read the contract → "He leído el contrato" (checkbox, enabled
    once the end is scrolled into view or tapped explicitly) → "Enviar código" to the frozen customer email (masked on
    screen) → 6-digit code → full name (prefilled from the party, editable) + optional drawn signature (canvas, PNG,
    ≤ 60 000 chars) → "Firmar contrato".
    - `POST v1/documents/public/:token/sign/code { version }`: a 6-digit code, stored only as
      HMAC-SHA256(link secret, documentId:nonce:code) in a `sign_code_sent` event (nonce, expiresAt = +10 min, version,
      masked email). 60 s between codes, 5 codes per document per 24 h (429), counted in the store's daily document
      email cap (`assertEmailQuota` counts `sign_code_sent`; over the cap → 429 with a plain message).
    - `POST …/sign/verify { code, version }`: the latest code for this version; 5 wrong attempts (`sign_code_failed`
      events) kill it ("pide un código nuevo"); expired → 410-like 400 message; right → `sign_code_verified`
      (valid 30 min for this version).
    - `POST …/sign { version, name, method, image?, readConfirmed: true }`: document row locked (`FOR UPDATE`);
      CONTRACT in SENT|VIEWED, not past `validUntil` (then EXPIRED + 409), `version === currentVersion` (409 "El comercio
      actualizó el contrato. Vuelve a leerlo antes de firmar."), order respected, a verified code for this version
      within 30 min; the signature row (role CUSTOMER, email = frozen customer email, codeVerifiedAt, IP, UA, version,
      versionSha256) and event `signed`. A second tap returns the existing signature (200).
11. **Merchant signing** — `POST v1/stores/:storeId/contracts/:id/sign { version, name, method, image? }` (dashboard,
    no re-auth): same version rule, order rule, row lock; email = the signed-in user's email; IP/UA; event `signed`
    `{ role, userId, sessionRef }` (sessionRef = first 16 hex of sha256 of the bearer token).
12. **Fully signed**: when both roles signed the current version → `SIGNED` (conditional), event `fully_signed`
    (dedupeKey). Then the signed PDF is emailed to the customer and the merchant (dedupeKeys `signed_copy:customer`,
    `signed_copy:merchant`), **outside the daily cap** (once per contract, the parties' own copies). Failures are
    recorded as `email_failed` and the PDF stays downloadable.
13. **Edits after sending**: allowed while the customer has not signed the current version; a changed send makes a new
    version whose signatures start over (the merchant's own earlier signature no longer counts; the customer's page
    shows the new version). Once the customer signed the current version, edits and changed re-sends are refused
    (409 "Tu cliente ya firmó esta versión: fírmala o anúlala").
14. **Void**: allowed until fully signed (D0's NOT_VOIDABLE already refuses SIGNED); a partly signed contract can be
    voided (the merchant decides not to countersign) — the signatures stay as evidence. SIGNED is immutable.
15. **Expiry**: past `validUntil` in SENT|VIEWED → `EXPIRED` on read and by a worker every 15 min (once per version).
16. **Signed PDF** (`contract-pdf.ts`): title, number, parties (issuer and customer as frozen), clauses, signature block
    (typed names, drawn images when present, dates), and an evidence page "Registro de firma electrónica": each signer's
    name, role, email, method, time (Bolivia, UTC-4), IP, user agent (short), code verification time, version and full
    sha256, plus the level-of-signature notice; every page footer carries number, version and sha256 prefix. Unsigned
    contracts get the same PDF without evidence ("Pendiente de firma"). Download: the public `/pdf` link (dashboard
    uses it too).
17. **List and summary**: `state` for contracts = `draft | open | signed | closed` (open = SENT|VIEWED; closed = voided,
    expired). `GET v1/stores/:storeId/contracts/summary` → counts. Views carry `signing { merchantSigned,
    customerSigned, signedAt, signatures[] }` for the current version.
18. **Accepted proposal → contract**: the proposal detail gets **Crear contrato**; it opens the contract composer
    prefilled (servicios, objeto = the accepted title + scope, price = the accepted total, customer from the accepted
    version) with `fromProposalId`; the server re-reads the accepted version (ACCEPTED only), links events
    (`contract_created` on the proposal, `created { fromProposal }` on the contract).
19. **Dashboard: Documentos → Contratos** (`src/contracts.mjs` helpers, `src/contracts-panel.mjs`, `src/contracts.css`):
    first-run guide (three steps: Elige el tipo y los datos · YAPI redacta las cláusulas · Firman los dos en línea; four
    example cards), composer (type cards, party forms with the merchant prefilled, terms, city select, signing order,
    legal notice), editor (full-screen on phones: AI notice, parties, clauses editable / reorder / add / delete /
    regenerate, pending-data chip "Falta N dato(s) ›", autosave with If-Match), send sheet ("Firmar y enviar" or
    "Enviar para firma"), list (tabs, status chips: borrador, enviado, visto, firmado por ti, firmado por el cliente,
    firmado, anulado, vencido), detail (signature progress, timeline, PDF, Ver como cliente, Firmar, Anular, Duplicar).

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| Contract rules | `business-documents/contract-terms.ts` | Types, roles, meta cleaning, party prefill/placeholders, templates, Partes/Domicilios text. |
| Draft rules | `business-documents/contract-draft.ts` | Prompt, schema, money guard + confirm marker, clause assembly. |
| Signing rules | `business-documents/contract-signing.ts` | Code generation/HMAC, masking, PNG data URL check, Bolivia time. |
| Signed PDF | `business-documents/contract-pdf.ts` | Contract + evidence page. |
| Service | `business-documents/contracts.service.ts` | draft, regenerate, summary, codes, verify, sign (both), fully signed, copies, expiry. |
| D0 glue | `business-document-snapshot.ts`, `business-documents.service.ts`, DTOs | contract snapshot/placeholders, send/update locks, public view, PDF, cap, list states. |
| Routes | `contracts.controller.ts`, public controller, module, `contracts.worker.ts` | New routes. |
| Checkout | `apps/checkout/src/documents/contract-page.ts` + `.css`, dispatch in `cobro-page.ts` | Public page. |
| Dashboard | `src/contracts*.mjs`, `src/contracts.css`, glue in `index.html`, `dashboard.js`, `server.mjs`, `proposals-panel.mjs` (Crear contrato) | The view. |

## 4. Tests

- API jest (AI mocked, no paid calls): meta cleaning and snapshot (contract frozen, hashes of other kinds unchanged,
  placeholders found in parties); prefill + placeholders; templates per type; draft guard (typed price kept, brief
  amount → confirm marker, invented → `{{precio}}`, parties never from the model); code HMAC, expiry, attempts,
  cooldown, per-day limit, email cap; sign (version 409, order, verification required, idempotent, evidence fields);
  merchant sign; fully signed → SIGNED + copies once; edit/send lock after the customer signed; void; expiry; PDF has the
  evidence page and hash; from-proposal.
- Checkout vitest: contract page renders parties/clauses/notice; read → code → sign flow posts; stale version message;
  waiting-for-merchant, signed, voided, expired, preview states.
- Dashboard: `node --test` for `contracts.mjs`; Playwright `tests/contracts.spec.mjs` at 390 and 1280 (API and AI mocked).

## 5. Out of scope

Qualified digital signature (ADSIB / Ley 164), notarization, more than two signers, witnesses, SMS codes, contract
templates library beyond the five types, clause-level comments from the customer, the larger AI tier toggle.
