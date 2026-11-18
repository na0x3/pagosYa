# YAPI A/B tests — design

Owner 2026-11-09: «y después pasemos a las pruebas a/b» (order: game prizes by chat → YAPI store tour → **this** → Merman
cart/checkout → catalogue looks). Approved section by section in chat 2026-11-09 (Partes 1–4: «ok», «si», «si», «si»).

## Decisions (owner)
- **YAPI runs the tests by chat.** The merchant asks («prueba otra portada», «prueba si 15% atrae más que 10%»); YAPI builds B, launches,
  reports, recommends; the merchant decides.
- **What can be tested:** any design change YAPI already makes (a source revision), and the subscription popup — its discount and its
  look. Prices are out of scope.
- **Ending:** YAPI recommends when there is a clear winner and applies it only on «sí». After 4 weeks without a clear difference it says
  so and proposes keeping A (or 2 more weeks). The merchant may end a test at any time.

## Assumptions (stated to the owner, not corrected)
One test at a time per store (as today); only published stores with integrated payments; test purchases never count; popup tests are
judged on signups first, purchases second.

## What exists (built before this spec)
`StoreSourceExperiment` (controlRevision, variantRevision, status RUNNING/STOPPED/COMPLETED, winner, activeStoreId unique) and
`StoreSourceVisit` (experimentId, visitorHash, token, variant A|B). `SourcePublishingService.start/finish` (source-publishing.service.ts)
start a revision-vs-revision test and apply the winner; the public site resolves a visitor's variant (random, sticky by visitor hash) and
hands the page a visit token; checkout links an order to its visit (`StoreOrder.sourceVisitId`, store-checkout.service.ts).
`experimentEvidence` declares a winner when 95 % Wilson intervals separate after ≥ 7 days, ≥ 200 visitors and ≥ 20 buyers per version.
The dashboard has a «Pruebas A/B» page (Studio business workspace `experiments`). Publishing during a running test is refused
(«Detén la prueba antes de publicar otro diseño»); unpublishing stops the test. Starting requires a paid plan, `checkoutMode: payment`,
an authored difference between A and B, and the Studio's desktop/mobile checks on B (`requireSourceChecks`).

## 1. The merchant's experience (chat)
**Start.** A design ask → YAPI makes the change by its normal path and saves it as an unpublished revision (B); the published store
stays A. A popup ask → YAPI only records what B changes (discount 15 %, look Revista); the live popup is untouched. YAPI shows B in the
preview and asks «¿Lanzo la prueba? La mitad de tus visitantes verá esta versión.» with **Lanzar prueba** / **Ver otra opción** /
**Cancelar**.

**While it runs.** «¿Cómo va mi prueba?» → plain numbers («Llevas 9 días: A 140 visitantes y 6 compras, B 152 y 11. Todavía no hay una
diferencia clara.»). When the Studio opens and the test moved since the last note (at most one per day), YAPI posts one line. The
«Pruebas A/B» page shows the same numbers.

**End.** Clear winner → «B vende más (7,2 % contra 4,1 %). ¿La dejo como tu tienda?» **Sí, deja B** / **Quedarme con A**. Four weeks
without a clear difference → «No se nota diferencia; te recomiendo quedarte con A.» **Quedarme con A** / **Seguir 2 semanas más**.
«termina la prueba» ends it any time and YAPI asks which version stays.

**Rules while a test runs.** Design test: the merchant may keep asking for changes (they stay drafts); publishing waits for the end and
YAPI says why. Popup test: changing the live popup (A) is allowed but YAPI warns it muddies the comparison and asks whether to go on.
Launch requires what publishing requires: paid plan, integrated payments, and (design tests) the desktop/mobile checks on B — **Lanzar
prueba** runs them exactly as the Publish button does.

## 2. Data and split
`StoreSourceExperiment` gains:
- `kind` — `'design' | 'popup'` (default `'design'`, so existing rows read as before);
- `variantSettings Json?` — popup tests only: `{ discount?: number; look?: PopupLookId }`;
- `variantPromoCodeId String?` — the hidden code B gives when its discount differs;
- `request String?` — the merchant's words («15% vs 10%»), for YAPI's lines and the dashboard;
- `lastNoteAt DateTime?` — the once-a-day progress note.

A popup test uses the published revision for both A and B (`controlRevision = variantRevision`); only the popup differs. The
authored-difference check applies to design tests only.

`StoreNewsletterSubscriber` gains `sourceVisitId String?` (relation to `StoreSourceVisit`), set when a signup carries a visit token of a
running test.

**Split.** Unchanged: random, sticky per visitor; the page receives its visit token. New: the kit sends the token when it reads the
public retention settings and when it subscribes. For a B visitor of a running popup test the public settings carry B's look and
`popupHasCode`/discount wording from B; on subscribe the welcome code is B's code. A visitor without a valid token gets A and is not
counted.

**B's code.** If B's discount differs from A's, starting the test creates a PERCENT `PromoCode` (`showInEmails: false`, code
`{A's code stem or BIENVENIDA}{pct}-{4 chars}`), stored in `variantPromoCodeId`. It is deactivated when the test ends unless B wins.

**Metrics.** Design: buyers per visitor and revenue (as today). Popup: signups per visitor (primary) and buyers (secondary).
**Evidence.** Purchases: existing rule (7 days, 200 visitors, 20 buyers per version). Signups: 7 days, **100 visitors and 20 signups**
per version, same 95 % interval rule. **Stale:** 28 days since start (or since the last «Seguir 2 semanas más», which adds 14 days)
without a winner → recommend A.

**Finish.** Design: as today (B wins → B published). Popup: B wins → B's discount and look become the store's popup settings (B's code
becomes the popup code); A wins or stopped → B's code is deactivated.

## 3. How YAPI understands and answers
- **Recognising the ask:** a fixed rule (`AB_REQUEST`, no model) hears «prueba si…», «prueba otra…», «haz una prueba A/B»,
  «compara…», «¿qué funciona mejor…?». Status words («¿cómo va mi prueba?») and end words («termina la prueba») are separate rules.
- **Popup ask:** the store edit reads B (a new op on the popup part, e.g. `test-discount` / `test-style`) and never applies it; the job
  saves a test proposal and replies with the card. Seconds.
- **Design ask:** the request runs through the normal edit path; the reply ends with the test card instead of «Listo», the new revision
  being B.
- **Unclear ask:** one question — «¿Qué quieres probar: la portada, un texto, el descuento de la ventana…?»
- **The card:** a YAPI message with chips (`abChips`, like the tour's): **Lanzar prueba** (Studio runs the checks for design, then calls
  start), **Ver otra opción** (rebuilds B), **Cancelar**.
- **Status / end / notes:** a small service (`SourceAbService`) reads `publicationState` numbers and writes plain lines; no model call.
  Notes are posted when the Studio loads the thread (≤ 1 per day per test, only when numbers moved), and the end card when evidence
  names a winner or the test goes stale.
- **Screens:** the «Pruebas A/B» page shows kind («Diseño» / «Ventana»), the merchant's words and, for popup tests, signups. The
  Studio's Publish button explains why it waits while a design test runs.

## 4. Errors
Each says what happened in plain Spanish and changes nothing it should not:
- not published / free plan / no integrated payments → said before building B, nothing spent;
- a test already running → «Ya tienes una prueba de «…» corriendo. ¿La termino para empezar esta?»;
- B equals A → not launched, «La versión B quedó igual a tu tienda; dime qué cambio quieres probar.»;
- B's checks fail → not launched, the plain-failure message (source-validation-error `plainFailure`);
- B's build fails → published store untouched, no test;
- applying the winner fails → the test stays RUNNING and the merchant can retry (never half done);
- unpublishing mid-test → test stopped (as today) and B's code deactivated;
- a visitor without a token → A, not counted.

## Testing
Unit (named spec files, `--maxWorkers=2`): `AB_REQUEST` and status/end phrases; popup B read never applies; split (B visitor → B look +
B code; A → A; no token → A); signup linked to its visit and counted per variant; evidence for signups (100/20) and stale (28 days, +14);
finish (popup B wins → settings + code; A wins → B code off); Studio card chips and the Publish wait note.
Live on Remolino (published, test payments): «prueba si 15% atrae más que 10%» → launch → two browsers (A and B) see their popup and
subscribe → «¿cómo va mi prueba?» → «termina la prueba» choosing B; then a short design test («prueba la portada con otra foto») up to
launch. Winner numbers are simulated with test rows in the dev DB and removed afterwards.

## Out of scope
Prices; more than two versions; more than one test at a time; tests on unpublished stores; email or WhatsApp notices of results (chat
and dashboard only).
