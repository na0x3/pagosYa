# YAPI A/B tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner convention: inline) to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YAPI runs A/B tests by chat — design (a revision) or the subscription popup (discount / look) — reports in plain words and
applies the winner only when the merchant says yes.
**Architecture:** extend the existing `StoreSourceExperiment` (kind + popup variant + hidden B code); the public retention settings and
subscribe read the visitor's visit token to serve B and link signups; a deterministic `SourceAbService` (no model call) answers status,
end and launch; design B comes from the normal edit path and ends in a test card instead of «Listo».
**Tech Stack:** NestJS + Prisma (apps/api), vanilla TS Studio (apps/merchant-studio, vitest), checkout parent (apps/checkout, vitest).
**Spec:** `docs/superpowers/specs/2026-11-09-yapi-ab-tests-design.md` (owner «esta bien» 2026-11-09).

## Global Constraints
- In place on `oct24-clean`, **no commits** (owner convention); ledger `.superpowers/sdd/2026-11-09-yapi-ab-tests/progress.md`.
- Before saving ANY file under `apps/api/src` (specs too): no `StoreSourceChatJob` RUNNING/QUEUED (nest --watch restart kills YAPI jobs).
  Use the Edit tool, never `sed -i` (breaks the watcher).
- Light checks: one named spec file per jest run, `--maxWorkers=2`, never a folder; Studio `npx vitest run src/<file>.test.ts`.
- Migration only after `pnpm dev:doctor --backup`; never `prisma migrate reset/diff` on the dev DB.
- Studio change → `pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- Copy is Spanish, plain, never a diagnostic. Evidence: purchases 7 days / 200 visitors / 20 buyers per version (existing); signups
  7 days / **100 visitors / 20 signups** per version; stale at **28 days** without a winner, «Seguir 2 semanas más» adds **14 days**.
- One test at a time per store; published + `checkoutMode: payment` + paid plan; a visitor without a valid token sees A, uncounted.

## Review Focus
1. A shopper who subscribed before the test (existing row) subscribes again as a B visitor → not counted as a B signup, gets B's code
   only if the popup asks for a code (Task 4 test «an existing subscriber is not a new B signup»).
2. The merchant ends a popup test with no evidence and keeps B → B's discount/look become the popup, B's code becomes the popup code,
   A's code untouched (Task 3 test «keeping B without evidence applies it»).
3. Unpublishing mid popup test → test STOPPED and B's code deactivated (Task 3 test «unpublishing turns B's code off»).
4. «prueba si 15% atrae más que 10%» when the popup already gives 15 % → B is 10 %, never B = A (Task 1 test «B is the other number»).
5. Two «Lanzar prueba» taps / a tap after the test started elsewhere → second refused with «Ya tienes una prueba…», no second code
   (Task 5 test «launching twice starts one test»).

---

### Task 1: `source-ab.ts` — the pure rules
**Files:** Create `apps/api/src/storefront-source/source-ab.ts`, Test `source-ab.spec.ts`.
**Produces:**
- `AB_REQUEST: RegExp` — «prueba si…», «prueba otra/otro…», «haz una prueba (a/b)», «prueba a/b», «compara(r)… versiones», «qué funciona
  mejor»; `AB_STATUS` — «¿cómo va (mi) (la) prueba?», «resultados de la prueba»; `AB_END` — «termina/detén/para la prueba».
- `abKind(text: string): 'popup' | 'design'` — popup when it names ventana/suscripción/popup/descuento de bienvenida/% or a look name.
- `readPopupVariant(text: string, current: { discount: number; look: PopupLookId }): { discount?: number; look?: PopupLookId } | null`
  — percents 5–50 in the text: the one ≠ current is B's (two numbers → the one not current; one number ≠ current → it); a look name
  (`readPopupLook` per word) ≠ current → B's look; nothing different → null.
- `signupEvidence(a: {visitors; signups}, b, startedAt, now?)` → `{ winner: 'A'|'B'|null; reason }` (Wilson 95 % as `experimentEvidence`,
  thresholds 7 d / 100 / 20).
- `staleTest(startedAt: Date, extendedUntil: Date | null, now?): boolean` — now ≥ max(startedAt + 28 d, extendedUntil).
- `progressLine(t: AbNumbers): string`, `endLine(t: AbNumbers): string` where `AbNumbers = { kind; request; days; a: {visitors; buyers;
  signups}; b: {…}; winner: 'A'|'B'|null; stale: boolean }`.
- [ ] Tests (RED first): phrases yes/no (10 each incl. «prueba mi tienda en el celular» = no, «muéstrame mi tienda» = no); `abKind`;
  readPopupVariant: «15% vs 10%» current 10 → {discount:15}; current 15 → {discount:10} (**B is the other number**); «estilo revista»
  current postal → {look:'revista'}; «estilo postal» current postal → null; «60%» → null; signupEvidence below thresholds → null with
  «Recopilando datos…»; separated intervals → winner; stale at 27/28 days and with extension; progressLine for design
  («Llevas 9 días: A 140 visitantes y 6 compras, B 152 y 11. Todavía no hay una diferencia clara.») and popup (suscripciones);
  endLine winner/stale.
- [ ] Implement; run `npx jest src/storefront-source/source-ab.spec.ts --maxWorkers=2` → green.

### Task 2: Schema + migration
**Files:** `apps/api/prisma/schema.prisma`, new `prisma/migrations/20261109180000_ab_tests/migration.sql`.
**Produces:** `StoreSourceExperiment.kind String @default("design")`, `variantSettings Json?`, `variantPromoCodeId String?`,
`request String?`, `lastNoteAt DateTime?`, `extendedUntil DateTime?`; `StoreNewsletterSubscriber.sourceVisitId String?` + relation
`sourceVisit StoreSourceVisit? @relation(fields: [sourceVisitId], references: [id], onDelete: SetNull)` (+ `subscribers` back-relation
on `StoreSourceVisit`) + `@@index([sourceVisitId])`.
- [ ] Write the SQL by hand (ALTER TABLE … ADD COLUMN; FK ON DELETE SET NULL; index). `pnpm dev:doctor --backup`, then
  `npx prisma migrate deploy` and `npx prisma generate` in apps/api. Check: a node one-liner reads `kind` of an existing row = 'design'.

### Task 3: Publishing — popup tests, chosen winner, signups in the numbers
**Files:** `source-publishing.service.ts`, `source-publishing.controller.ts`, Test `source-publishing.service.spec.ts`.
**Consumes:** Task 1 `signupEvidence`, `staleTest`; Task 2 columns.
**Produces:**
- `start(merchantId, storeId, revision, expected, request?: string)` — stores `request`, `kind: 'design'` (existing checks unchanged,
  but the equal-design refusal now reads «La versión B quedó igual a tu tienda; dime qué cambio quieres probar.» — spec §4).
- `startPopupTest(merchantId, storeId, variant: { discount?: number; look?: PopupLookId }, request: string, expected: number)` —
  same gates as `start` (plan, public, payment, no running test) minus the revision checks; `controlRevision = variantRevision =
  publishedSourceRevision`; if `variant.discount` ≠ A's percent creates PromoCode `{stem}{pct}-{4 chars A-Z2-9}` PERCENT,
  `showInEmails: false`, stem = A's code letters or `BIENVENIDA`; all in one `change` transaction.
- `finishWith(merchantId, storeId, expected, experimentId, keep: 'A' | 'B')` — no evidence needed (merchant's choice); design: keep B →
  publish variantRevision; popup: keep B → retention settings `discount`/`popupLook` from variantSettings and `popupPromoCodeId =
  variantPromoCodeId`; keep A → B code `isActive: false`; status COMPLETED, winner = keep. `finish(…apply)` kept for the page.
- `extend(merchantId, storeId, experimentId)` → `extendedUntil = now + 14 d`.
- `visibility(false)` also deactivates a running popup test's B code.
- `publicationState`: `test.kind`, `test.request`, per variant `signups` (subscribers with `sourceVisit.experimentId`, created after
  start), popup evidence via `signupEvidence`, `test.stale` via `staleTest`, `test.days`.
- Controller: `POST experiments` body gains optional `request`; new `POST experiments/popup` `{ discount?, look?, request,
  publicationVersion }`, `POST experiments/keep` `{ experimentId, keep, publicationVersion }`, `POST experiments/extend`.
- [ ] Tests RED→GREEN: popup start creates B code only when the percent differs; second start refused «Ya tienes una prueba…»;
  **keeping B without evidence applies it** (settings + popup code); keep A turns B code off; **unpublishing turns B's code off**;
  state counts signups per variant and only after start; stale flag; design keep B publishes variantRevision.

### Task 4: The popup B for B visitors (retention + checkout parent)
**Files:** `retention/retention.controller.ts`, `retention/retention.service.ts`, `retention/retention.dto.ts`,
`apps/checkout/src/source-storefront.ts`; Tests `retention/retention-popup.spec.ts`, `apps/checkout/test/hosted-retention-path.test.ts`.
**Produces:** `RetentionService.variantFor(storeId, visitToken?: string): Promise<{ visitId: string; variant: 'A'|'B'; settings?:
{ discount?; look? }; codeId?: string } | null>` (running popup test + token of that experiment ≤ 30 days old).
- GET public settings reads `?visit=<token>`: a B visitor's `publicRetentionSettings` gets B's `popupLook`, B's discount wording and
  `popupHasCode: true` when B has a code. Cache header stays `no-store`.
- `RetentionSubscribeDto.sourceVisitToken?: string` (`@IsOptional() @IsString() @MaxLength(64)`); subscribe: B visitor with
  `source: 'popup'` gets B's code; the subscriber row gets `sourceVisitId` on create only.
- Checkout parent: retention GET adds `?visit=` and POST payload adds `sourceVisitToken` from `sourceVisitToken(slug)` (only when
  analytics are allowed — the helper already returns undefined otherwise).
- [ ] Tests RED→GREEN: B token → B look + B code; A token → A; no/unknown/old token → A; **an existing subscriber is not a new B signup**
  (no sourceVisitId set, still gets B's code); a design test's token changes nothing; checkout test: the forwarded URL carries
  `visit=` and the payload `sourceVisitToken`.

### Task 5: `SourceAbService` + controller (deterministic YAPI lines and cards)
**Files:** Create `source-ab.service.ts`, `source-ab.controller.ts` (`v1/stores/:storeId/source-project/ab`, MerchantAuthGuard, owned()
like source-tour.controller.ts), register in `storefront-source.module.ts`; Test `source-ab.service.spec.ts`.
**Consumes:** Tasks 1, 3.
**Produces:** messages posted like `SourceTourService.post` with metadata `abProposal { id; kind; revision?; variant?; request }`,
`abChips: Array<{ label; action }>`; actions `'launch' | 'another' | 'cancel' | 'keepA' | 'keepB' | 'extend'`.
- `blocker(storeId): Promise<string | null>` — unpublished / free plan / no payments / test running («Ya tienes una prueba de «…»
  corriendo. ¿La termino para empezar esta?»).
- `proposePopup(storeId, text, request)` → B read (Task 1) or the one question; card «¿Lanzo la prueba? La mitad de tus visitantes verá
  esta versión.» chips Lanzar prueba / Cancelar.
- `proposeDesign(storeId, revision, request)` → same card with Lanzar prueba / Ver otra opción / Cancelar (B = revision).
- `answer(merchantId, storeId, proposalId, action, expected)`: popup launch → `startPopupTest`; design launch → returns
  `{ needsChecks: revision }` (the Studio runs checks then calls the existing `experiments` start with `request`); keepA/keepB →
  `finishWith`; extend → `extend`; cancel → «Listo, no lanzo la prueba.»; another (design) → returns `{ resend: request }` and the
  Studio sends the request again as a chat message (a new B is built).
- `status(storeId)` → progressLine / «No tienes una prueba corriendo.»; `end(storeId)` → «¿Qué versión dejo?» chips Dejar A / Dejar B.
- `note(storeId)` → at most one per day per test and only when numbers moved: progressLine; winner or stale → end card
  (Sí, deja B / Quedarme con A, or Quedarme con A / Seguir 2 semanas más); updates `lastNoteAt`.
- Endpoints: `POST answer`, `POST note` (Studio on mount).
- [ ] Tests RED→GREEN: blocker messages; popup proposal card + no settings write; **launching twice starts one test**; status lines;
  note once a day and only when moved; winner/stale cards; keepB/keepA call finishWith.

### Task 6: Chat wiring
**Files:** `source-chat.service.ts` (next to the tour hook ~l.1738), `source-chat-jobs.service.ts` (after-edit hook ~l.221),
`dto/send-source-message.dto.ts` (`abRequest?: string` carried by the job input); Tests `source-chat-store-edit.spec.ts` (send-level
cases) and `source-chat-jobs.service.spec.ts`.
**Consumes:** Task 1 rules, Task 5 service.
- `AB_STATUS` / `AB_END` → `ab.status` / `ab.end`, no model call. `AB_REQUEST`: `ab.blocker` first (said, nothing built); popup kind →
  `ab.proposePopup`; design kind → `input.abRequest = instruction` and the normal edit runs with instruction
  `Versión B para una prueba A/B (no publicar): <words>`; the jobs hook, when a job with `abRequest` saved a new revision, posts
  `ab.proposeDesign(storeId, revision, abRequest)`.
- While a popup test runs, a store-edit popup change appends «Ojo: tienes una prueba de la ventana corriendo; este cambio también lo
  ve la versión A.»
- [ ] Tests RED→GREEN: status/end phrases reply without dialogue calls; popup ask → card, no job edit; blocked store → the blocker line;
  design job with abRequest → proposal posted with the new revision; failed design job → no card.

### Task 7: Studio — card, launch with checks, A/B page, Publish note
**Files:** Create `apps/merchant-studio/src/source-ab-ui.ts` (+ `source-ab-ui.test.ts`); extract the check+start from
`source-business-workspace.ts` into `source-test-start.ts` (`checkAndStartTest(api, storeId, revision, publicationVersion, request?)`);
`source-studio.ts` (render chips under the newest YAPI message as `renderTourChips` does; `ab.note` on mount); `api.ts`
(`abAnswer`, `abNote`, `startSourceTest(…, request?)`); business workspace page shows kind/request/signups.
- Publish while a design test runs: button disabled with «Hay una prueba corriendo; publica cuando termine.»
- [ ] Tests RED→GREEN: chips only on the newest message; Lanzar prueba (design) runs checks then starts with request; (popup) calls
  abAnswer launch; a failed check shows the plain message and starts nothing; Publish note. `tsc --noEmit`, build:studio.

### Task 8: Live check (Remolino o7xu4fam, published, test payments)
- [ ] «prueba si 15% atrae más que 10%» → card → Lanzar → two browser profiles: A and B tokens see their popup; subscribe in each
  (B gets B's code) → «¿cómo va mi prueba?» → «termina la prueba» → Dejar B → popup now B's. Then «prueba la portada con otra foto»
  up to the card and Lanzar (checks pass, test running) → «termina la prueba» → Dejar A. Winner/stale cards: simulate rows in the dev
  DB, `ab.note`, then delete the rows. Record in the ledger; restore Remolino's popup if the owner wants.
