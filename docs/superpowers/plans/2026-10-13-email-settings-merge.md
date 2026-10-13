# Email settings merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store email is set up once, in Correos y marketing › Correos; Ajustes keeps only non-email settings; the designed receipt is the only order confirmation, and it threads into the inbox when the store's sender domain is verified.

**Architecture:** API: `ORDER_CONFIRMATION` leaves `EMAIL_TEMPLATES`; `queueStoreEmail` only queues templates the workspace still offers (the team's `NEW_ORDER` notice is unchanged); `sendReceiptEmail` always runs and, for a live payment from a verified sender domain, sends with `from`, Reply-To and Message-ID and returns what it sent, which `InboxService.threadForOrder` files into the order's thread. Saving the Carrito abandonado template learns `recoveryHours`. Dashboard: a native Correos tab (`email-list.mjs` model + `email-list-panel.mjs` DOM) lists every store email once and hosts the existing designed editor (`email-studio-panel.mjs`, now openable per email) plus a plain-text editor ported from the Studio; Ajustes loses its Correos tab. Studio: Plantillas/Flujos and the Comeback form's email fields go; the Studio is rebuilt once.

**Tech Stack:** NestJS + Jest (ts-jest) API; vanilla ES-module dashboard tested with `node --test` + jsdom and Playwright; Vite/TypeScript Studio tested with Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-email-settings-merge-design.md`

## Global Constraints

- NEVER run `prisma migrate` (any subcommand), `prisma db push`, `prisma db pull`, `prisma migrate reset`, `prisma migrate diff` or `prisma migrate resolve` against any database. This plan needs no migration and must not add one: every affected setting lives in `storeRetention.settings` JSON. `npx prisma generate` (no database) is allowed.
- Never run `apps/api/src/inbox/inbox-persistence.integration.spec.ts` or `npm run test`/`pnpm test` in `apps/api`: the integration pool creates and drops databases on the `DATABASE_URL` server, which is the owner's dev Postgres.
- API unit tests: `cd apps/api && npx jest <path>`. Never run the whole API suite with default workers; if a wide run is needed use `--maxWorkers=2`. API e2e (not needed by this plan): `cd apps/api && npx jest --config test/jest-e2e.json <path>` (embedded throwaway Postgres, safe).
- API type check: `cd apps/api && npx tsc -p tsconfig.json --noEmit`. Studio type check: `cd apps/merchant-studio && npx tsc -p tsconfig.json --noEmit`.
- Dashboard unit tests: `cd apps/merchant-dashboard && node --test <file>`; all of them: `npm run test:unit`. Dashboard browser tests: ONLY through the worktree config from "Before you start": `npx playwright test --config playwright.worktree.config.mjs <file>`. The stock `playwright.config.mjs` reuses whatever listens on :4323, and the owner's dashboard (`~/pagosYa`) is listening there now, so the stock config silently tests the wrong code.
- Studio unit tests: `cd apps/merchant-studio && npx vitest run <file>`; browser tests: `npx playwright test --config playwright.worktree.config.mjs <file>` (port 4361, never the stock config, same reason).
- Rebuild the embedded Studio after Studio changes: `cd apps/merchant-dashboard && pnpm run build:studio` (the script is `pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded`; output `apps/merchant-dashboard/public/studio/` is gitignored, so it is never committed and must be rebuilt in `~/pagosYa` after the merge too).
- `apps/merchant-dashboard/unit/served-modules.test.mjs` requires every `/src` module the dashboard loads to be in `server.mjs`'s `/src` allow-list (line 151, one long array line). This plan extends that test to modules imported by served modules.
- Do not edit `apps/api/src/retention/retention.service.ts`, `PaymentIntentsService.confirm()` (payment-intents.service.ts ~348-460) or `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts`: plan B owns them.
- Copy is Spanish (Bolivia). Labels verbatim from the spec: tabs "Correos", "Remitente", "Dominio web"; groups "Compras", "Suscripciones", "Automáticos"; rows "Confirmación de compra", "Cita confirmada", "Enviado", "Entregado", "Cancelado", "Reembolso", "Tarjeta de regalo", "Pago de suscripción fallido", "Suscripción omitida", "Bienvenida", "Carrito abandonado", "Pedir reseña"; Ajustes line "Tus correos están en Correos y marketing".
- Match the surrounding style: dense one-liners where the file uses them, comments that say why, `escapeHtml` (`./html.mjs`) for every interpolated value in dashboard markup.
- Commit with explicit paths only (`git add <paths>`). Never commit `playwright.worktree.config.mjs`, `public/studio/`, `.env` files or anything under `node_modules`.
- Known pre-existing failures, not caused by this work, not to be fixed here: 9 suites in `apps/api/src/storefront-source` (jsdom `getComputedStyle` pseudoElt in kit specs, product-card DNA tests, source-email-direction, source-validation-error, source-next-pages, source-dna hash, agent-tools.theme, product-card-distance, source-generation-agent). This plan never runs that folder.
- Line numbers below are from `HEAD` = `842753ad` (what the worktree is branched from). The owner's main checkout has uncommitted bulk-delete work that shifts `index.html` by +19 and `dashboard.js` by about +40 lines; always locate edits by the quoted text, not the number.

## Review Focus

1. **Toggling the switch of the email whose unsaved text is open in the editor.** The switch saves the stored wording and reloads; the merchant's typing must not vanish silently: they are asked first, and declining reverts the switch and keeps the draft. Pinned in Task 6 ("a switch on the email being edited asks before dropping unsaved text").
2. **Saving on a stale revision (409) after another tab or the Studio saved first.** The draft must survive, the revision must refresh underneath it, and the second save must use the new revision. Pinned in Task 6 ("a conflicting save keeps the draft and retries on the refreshed revision").
3. **Saving the Comeback Card form after its email fields left.** `RetentionSettingsDto` still requires `welcomeEnabled/Subject/Body`, `recoveryEnabled/Hours` and `RetentionService.save` replaces the whole settings object, so the form must send the stored values back unchanged, never 400 and never reset them. Pinned in Task 8 ("leaves the welcome, reminder and review emails to Correos y marketing and saves them unchanged").
4. **A verified domain whose provider rejects the receipt.** Nothing may be filed into the order's thread as if the buyer had it, and `confirm()` must still succeed. Pinned in Task 2 ("files nothing when the provider rejects the receipt").
5. **The sender lookup fails (database hiccup) while sending a receipt.** The buyer must still get the receipt, sent plainly; only the threading is lost. Pinned in Task 2 ("still sends the receipt when the sender lookup fails").

## Shared files with plan B

Plan A is merged first, then plan B. Plan A edits only these regions of shared files (HEAD line numbers):

| File | Plan A edits | Plan B (for reference) |
|---|---|---|
| `apps/api/src/payment-intents/payment-intents.service.ts` | imports at line 2 (`email-workspace.config`) and line 29 (`inbox.service`); inside `applyRailResult()`: line 671 (`receiptQueued` removed), 675 (`inboxOrder` type), 716-727 (the `ORDER_CONFIRMATION` queue call, now team-notice only), 778 (return object), 781-808 (receipt send and `threadForOrder` call); `sendReceiptEmail()` 813-909 and a new private `receiptThreading()` right after it. | `confirm()` ~348-460, the confirm DTO, a post-confirm hook. Plan B must put its hook in `confirm()` after `applyRailResult` returns, not inside lines 781-811. |
| `apps/merchant-dashboard/index.html` | Correos y marketing: lines 558 (tab nav) and 560-561 (new `#marketingEmails` div inserted after the empty-state `<p>`); Ajustes: lines 861-866 (tab list and panels). | Crecer nav item ~192-197 and a new view section. |
| `apps/merchant-dashboard/src/dashboard.js` | 625-631 (`selectMarketingTab`), 643 and 650-652 (`syncStoreResourceViews`), 663 (marketing message), 728 (Studio editor message), 767 (discounts alias), 796 (removed line), 3249-3263 (settings tabs + `openSettingsSection` + new `openMarketingEmails`), 3288-3293 (mount). Lines 440 (`let emailStudio`) and 1721 (`emailStudio?.reset()`) are deliberately NOT touched: the variable keeps its name. | A new view (variables, `reset()` calls, mount). If B adds a `reset()` next to `emailStudio?.reset()` it merges cleanly because A leaves that line alone. |
| `apps/merchant-dashboard/server.mjs` | Line 151: inserts `"/src/email-list.mjs", "/src/email-list-panel.mjs", ` after `"/src/email-content-panel.mjs", `. | Also appends to line 151. **A textual conflict on this single line is expected**; resolve by keeping both plans' entries. |
| Retention | A removes the welcome/recovery/review fields from `apps/merchant-studio/src/retention.ts` (Comeback form) and moves their editing to the native Correos tab (API side: `email-workspace.dto.ts` / `email-workspace.service.ts`). A does NOT edit `apps/api/src/retention/retention.service.ts`. | Only adds a method to `retention.service.ts`. |
| `apps/api/src/email-workspace/email-workspace.config.ts` | `EMAIL_TEMPLATES` (line 2 removed), comments on `workspaceDedupeKey`/`receiptMessageId`, body of `queueStoreEmail` (67-99). | Should not need it; if B queues mail through `queueStoreEmail`, it must not touch those lines. |

Before merging either plan into `feature/store-page-architecture`, the owner's uncommitted bulk-delete changes in `~/pagosYa` (`index.html`, `server.mjs`, `dashboard.js`, `workspace-design.css`, …) must be committed or stashed: git refuses a merge that touches locally modified files. After merging A, run `cd ~/pagosYa/apps/merchant-dashboard && pnpm run build:studio`.

## Before you start (worktree setup, no commit)

Run from the plan-A worktree root; `WT` is that path.

- [ ] **Step 1: Install and generate**

```bash
WT=$(git rev-parse --show-toplevel)
cd "$WT" && pnpm install --frozen-lockfile --prefer-offline
cd "$WT/apps/api" && npx prisma generate
```

Expected: install finishes; `prisma generate` prints "Generated Prisma Client". (Generate only. No other Prisma command.)

- [ ] **Step 2: Build the embedded Studio once** (the worktree has no `public/studio/`, and the dashboard browser tests load it)

```bash
cd "$WT/apps/merchant-dashboard" && pnpm run build:studio
```

Expected: Vite prints `✓ built in …`; `apps/merchant-dashboard/public/studio/index.html` exists.

- [ ] **Step 3: Create the per-plan Playwright configs (untracked, never committed)**

```bash
cat > "$WT/apps/merchant-dashboard/playwright.worktree.config.mjs" <<'EOF'
// Plan A only, never committed. The owner's dashboard already listens on :4323 and the stock config
// reuses it, which would test ~/pagosYa instead of this worktree. Plan B uses another port.
import { defineConfig } from "@playwright/test";
const port = Number(process.env.DASHBOARD_TEST_PORT || 4351);
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.CI ? undefined : "chrome", trace: "retain-on-failure", headless: true },
  webServer: { command: "node server.mjs", env: { PORT: String(port) }, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
});
EOF
cat > "$WT/apps/merchant-studio/playwright.worktree.config.mjs" <<'EOF'
// Plan A only, never committed: a Studio dev server of this worktree on its own port.
import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.STUDIO_TEST_PORT || 4361);
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: [{ command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 30_000 }],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" } }],
});
EOF
printf '%s\n' apps/merchant-dashboard/playwright.worktree.config.mjs apps/merchant-studio/playwright.worktree.config.mjs >> "$(git -C "$WT" rev-parse --git-path info/exclude)"
lsof -nP -iTCP:4351 -sTCP:LISTEN; lsof -nP -iTCP:4361 -sTCP:LISTEN
```

Expected: both `lsof` lines print nothing (ports free). If one is taken, export `DASHBOARD_TEST_PORT` / `STUDIO_TEST_PORT` to a free port for every run.

- [ ] **Step 4: Baseline (all must pass before any change)**

```bash
cd "$WT/apps/api" && npx jest src/email-workspace src/inbox/inbox-order-receipt.spec.ts src/inbox/inbox.service.spec.ts src/payment-intents/payment-intents.service.spec.ts
cd "$WT/apps/merchant-dashboard" && node --test src/email-studio-panel.test.mjs src/email-content-panel.test.mjs src/settings-tabs.test.mjs unit/served-modules.test.mjs
cd "$WT/apps/merchant-studio" && npx vitest run src/retention.test.ts src/source-business-workspace.test.ts
```

Expected (2026-10-13): API 5 suites / 99 tests pass; dashboard 39 tests pass; Studio 2 files / 22 tests pass.

## File Structure

**API**
- Modify `apps/api/src/email-workspace/email-workspace.config.ts`: `EMAIL_TEMPLATES` without `ORDER_CONFIRMATION`; `queueStoreEmail` queues a buyer email only for an offered template and no longer builds inbound Reply-To/Message-ID (that moved to the designed receipt).
- Modify `apps/api/src/email-workspace/email-workspace.dto.ts` and `email-workspace.service.ts`: optional `recoveryHours` saved with the RECOVERY template.
- Modify `apps/api/src/payment-intents/payment-intents.service.ts`: designed receipt always sent; sender domain + thread hand-off.
- Modify `apps/api/src/inbox/inbox.service.ts`: `SentReceipt` type; `threadForOrder` files the receipt it is handed; `recordQueuedReceipt` removed.
- Tests: `email-workspace.spec.ts`, `email-workspace-events.spec.ts`, `inbox/inbox-order-receipt.spec.ts`, `payment-intents/payment-intents.service.spec.ts`.

**Dashboard** (`apps/merchant-dashboard`)
- Create `src/email-list.mjs`: pure model of the Correos list (rows, groups, save body, validation, sample text). One responsibility, no DOM.
- Create `src/email-list-panel.mjs`: the Correos tab DOM: list with switches, plain-text editor, hosts the designed editor.
- Modify `src/email-studio-panel.mjs`: `show(type)` opens a given designed email; `types: false` hides its own email switcher; header comment.
- Modify `src/email-content-panel.mjs`: "Descuentos" hint → "Códigos promocionales"; header comment.
- Modify `src/email-studio.css`: list/editor styles, root id rename, Ajustes note.
- Modify `src/settings-tabs.mjs`, `index.html`, `src/dashboard.js`, `server.mjs`.
- Tests: create `src/email-list.test.mjs`, `src/email-list-panel.test.mjs`, `tests/marketing-emails.spec.mjs`; modify `src/email-studio-panel.test.mjs`, `src/email-content-panel.test.mjs`, `src/settings-tabs.test.mjs`, `unit/served-modules.test.mjs`, `tests/email-studio-panel.spec.mjs`, `tests/store-settings-tabs.spec.mjs`, `tests/store-settings.spec.mjs`, `tests/merchant-workspace.spec.mjs`.

**Studio** (`apps/merchant-studio`)
- Modify `src/source-business-workspace.ts`: Plantillas/Flujos branch removed, default tab `staff`, integrations email card → `emails`.
- Modify `src/retention.ts`: Comeback form without welcome/recovery/review fields; their stored values are passed through on save.
- Tests: `src/source-business-workspace.test.ts`, `src/retention.test.ts`, `tests/retention.spec.ts`.

---

### Task 1: Only the designed receipt confirms an order

**Files:**
- Modify: `apps/api/src/email-workspace/email-workspace.config.ts:1-13, 66-99`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts:671, 716-727, 778, 784-787`
- Test: `apps/api/src/email-workspace/email-workspace.spec.ts`, `apps/api/src/email-workspace/email-workspace-events.spec.ts`, `apps/api/src/inbox/inbox-order-receipt.spec.ts`, `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EMAIL_TEMPLATES` without `ORDER_CONFIRMATION` (so `GET /email-workspace` no longer lists it and `PUT /email-workspace/templates/ORDER_CONFIRMATION` answers 400 "Plantilla desconocida."); `queueStoreEmail(db, storeId, 'ORDER_CONFIRMATION', …)` returns `false` and queues only `STAFF_NEW_ORDER` rows; `applyRailResult` always calls `sendReceiptEmail` on success. `inboxOrder` still carries `receiptSourceId` until Task 2.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/email-workspace/email-workspace.spec.ts`, replace the whole test `it('queues customer and opted-in staff mail with stable store-scoped idempotency keys', …)` (lines 66-77) with these four tests:

```ts
    it('queues customer and opted-in staff mail with stable store-scoped idempotency keys', async () => {
        const { db } = harness({ emailWorkspace: { templates: { REFUND: { enabled: true, subject: '{{store}} / {{order}}', body: 'Hola {{customer}}' } }, staff: { enabled: true, recipients: [{ email: 'staff@store.test', events: ['NEW_ORDER'] }, { email: 'refund@store.test', events: ['REFUND'] }] } } });
        const values = { store: 'Merchant profile', order: 'order-1', customer: 'Ana', amount: 'BOB 10', details: 'Private tracking URL' };
        await queueStoreEmail(db, 'store-a', 'REFUND', 'refund-1', 'Buyer@Example.test', values);
        await queueStoreEmail(db, 'store-a', 'REFUND', 'refund-1', 'Buyer@Example.test', values);
        const calls = db.storeEmailDelivery.upsert.mock.calls.map(([call]: any) => call);
        expect(calls).toHaveLength(4);
        expect(calls[0].where).toEqual(calls[2].where);
        expect(calls[0].create).toMatchObject({ storeId: 'store-a', email: 'buyer@example.test', subject: 'Tienda A / order-1', body: 'Hola Ana\n\nPrivate tracking URL', replyTo: null, messageIdHeader: null });
        expect(calls[1].create.kind).toBe('STAFF_REFUND');
        expect(calls.every((call: any) => call.create.email !== 'staff@store.test')).toBe(true);
    });
    // The designed receipt is the one order confirmation (2026-10-13). A store that switched the old
    // plain-text one on still has it in its JSON; that must not become a second confirmation.
    it('never queues a buyer order confirmation, even one saved enabled, and still tells the team', async () => {
        const { db } = harness({ emailWorkspace: { templates: { ORDER_CONFIRMATION: { enabled: true, subject: 'Pedido {{order}}', body: 'Hola {{customer}}' } }, staff: { enabled: true, recipients: [{ email: 'staff@store.test', events: ['NEW_ORDER'] }] } } });
        expect(await queueStoreEmail(db, 'store-a', 'ORDER_CONFIRMATION', 'payment-1', 'buyer@example.test', { store: 'A', order: 'order-1', customer: 'Ana', amount: 'BOB 10' }, { email: 'buyer@example.test', name: 'Ana' })).toBe(false);
        const rows = db.storeEmailDelivery.upsert.mock.calls.map(([call]: any) => call.create);
        expect(rows.map((row: any) => row.kind)).toEqual(['STAFF_NEW_ORDER']);
        expect(rows[0]).toMatchObject({ email: 'staff@store.test', replyTo: 'buyer@example.test' });
    });
    it('no longer offers or saves a plain-text order confirmation', async () => {
        const { service } = harness({ emailWorkspace: { templates: { ORDER_CONFIRMATION: { enabled: true, subject: 'x', body: 'y' } }, staff: { enabled: false, recipients: [] } } });
        const overview = await service.overview('merchant', 'store-a');
        expect(overview.templates.map((item: any) => item.id)).not.toContain('ORDER_CONFIRMATION');
        await expect(service.template('merchant', 'store-a', 'ORDER_CONFIRMATION', { revision: 2, enabled: true, subject: 'Pedido', body: 'Hola' })).rejects.toThrow('Plantilla desconocida.');
    });
```

(The existing `harness()` already mocks `retention.owner`, `retention.settings` and `storeEmailDelivery.findMany`, which `overview()` and its `logs()` call.)

In `apps/api/src/email-workspace/email-workspace-events.spec.ts`, replace the first test `it('queues a paid receipt with selected variant and tracking, without a duplicate default receipt', …)` (lines 33-41) with:

```ts
    // The harness store saved ORDER_CONFIRMATION enabled: that plain-text receipt is ignored now and
    // the designed receipt (sendReceiptEmail) is the one confirmation the buyer gets.
    it('sends the designed receipt with variant and tracking, and queues no plain-text confirmation', async () => {
        const { db, payment, email } = harness();
        await (payment as any).applyRailResult('payment-1', 'merchant', 'rail', { status: 'succeeded', raw: {} }, TransactionType.CAPTURE);
        expect(db.storeEmailDelivery.upsert).not.toHaveBeenCalled();
        expect(email.send).toHaveBeenCalledTimes(1);
        const sent = email.send.mock.calls[0][0];
        expect(sent.to).toBe('buyer@example.test');
        expect(sent.body).toContain('Suéter (Azul / S)');
        expect(sent.body).toContain('/track/');
    });
```

In `apps/api/src/inbox/inbox-order-receipt.spec.ts`, delete the helper `async function queueReceipt(…) {…}` (lines 30-34) and replace the whole `describe("order receipt routing", …)` block (lines 36-75) with:

```ts
describe("plain-text workspace mail after the designed receipt took over", () => {
  it("queues no buyer confirmation, even for a store that saved ORDER_CONFIRMATION enabled", async () => {
    const { db, upsert } = outbox(verified);

    expect(await queueStoreEmail(db, "store-1", "ORDER_CONFIRMATION", "payment-1", "ana@gmail.test", { order: "order-1", customer: "Ana", store: "Tienda" })).toBe(false);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not put an inbound Reply-To or Message-ID on any template", async () => {
    const { db, upsert } = outbox({ emailWorkspace: {
      ...verified.emailWorkspace,
      templates: { SHIPPED: { enabled: true, subject: "Enviado", body: "Va en camino" } },
    } });

    await queueStoreEmail(db, "store-1", "SHIPPED", "order-1", "ana@gmail.test", { order: "order-1", customer: "Ana", store: "Tienda" });

    const row = upsert.mock.calls.map((call) => call[0].create).find((r) => r.kind === "WORKSPACE_SHIPPED");
    expect(row.replyTo).toBeNull();
    expect(row.messageIdHeader).toBeNull();
  });
});
```

Leave the `describe("InboxService.threadForOrder — …")` block as it is (Task 2 rewrites it).

In `apps/api/src/payment-intents/payment-intents.service.spec.ts`, replace the test `it("starts the buyer's subscription when the first order is paid and puts the manage link in the receipt", …)` (lines 729-736) with:

```ts
  it("starts the buyer's subscription when the first order is paid and puts the manage link in the receipt", async () => {
    // enabledTemplate is a stored plain-text ORDER_CONFIRMATION: ignored now, the designed receipt carries the block.
    const { tx, pay, activeKey, service } = harness(enabledTemplate);
    await pay();

    expect(tx.customerSubscription.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(tx.customerSubscription.createMany.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ sourceOrderId: "order_1", merchantId: "m1", activeKey }));
    expect(tx.storeEmailDelivery.upsert).not.toHaveBeenCalled();
    expect((service as any).sendReceiptEmail).toHaveBeenCalledWith(expect.anything(), "Tienda", expect.stringContaining("Administra tu suscripción: https://pagar.test/suscripcion/"));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/email-workspace src/inbox/inbox-order-receipt.spec.ts src/payment-intents/payment-intents.service.spec.ts`
Expected: FAIL. "never queues a buyer order confirmation…" gets `true` / two rows; "no longer offers…" finds `ORDER_CONFIRMATION`; the events test sees one `upsert` and no `send`; the subscription test sees an `upsert` and no `sendReceiptEmail` call; the inbox "queues no buyer confirmation" test sees an upsert.

- [ ] **Step 3: Implement in `email-workspace.config.ts`**

Replace lines 1-2:

```ts
export const EMAIL_TEMPLATES = [
    { id: 'ORDER_CONFIRMATION', name: 'Confirmación de pedido', group: 'transactional', trigger: 'Después de confirmar el pago', subject: 'Pedido {{order}} confirmado · {{store}}', body: 'Hola {{customer}}, tu pago de {{amount}} fue confirmado. Gracias por comprar en {{store}}.', supported: true },
```

with:

```ts
/**
 * The plain-text emails a store can switch on, edited in Correos y marketing › Correos. The buyer's
 * order confirmation is NOT one of them: since 2026-10-13 it is always the store's designed receipt
 * (PaymentIntentsService.sendReceiptEmail). A `templates.ORDER_CONFIRMATION` saved before then stays
 * in the store's JSON and is ignored.
 */
export const EMAIL_TEMPLATES = [
```

Replace the body of `queueStoreEmail` (from `    const enqueue = async (` through `    return queued;`, lines 73-98) with:

```ts
    const enqueue = async (recipient: string, kind: string, subject: string, body: string, replyTo?: string) => db.storeEmailDelivery.upsert({ where: { dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, create: { storeId, email: recipient.toLowerCase(), kind, sourceId, subject, body, replyTo: replyTo || null, messageIdHeader: null, dedupeKey: workspaceDedupeKey(storeId, kind, sourceId, recipient) }, update: {} });
    let queued = false;
    // Only a template the workspace still offers reaches a buyer. ORDER_CONFIRMATION is called for its
    // team notice alone; the order's inbound Reply-To and Message-ID now travel on the designed receipt.
    if (email && template?.enabled && EMAIL_TEMPLATES.some(item => item.id === key)) {
        await enqueue(email, `WORKSPACE_${key}`, renderEmailText(template.subject, values), renderEmailText(template.body, values) + (values.details ? '\n\n' + values.details : ''));
        queued = true;
    }
    // The team's notices are decided on their own, never by the buyer's template: NEW_ORDER keeps going
    // out although ORDER_CONFIRMATION no longer sends anything to the buyer.
    const staffEvent = key === 'ORDER_CONFIRMATION' ? 'NEW_ORDER' : key === 'REFUND' ? 'REFUND' : null;
    if (staffEvent && mail.staff.enabled)
        for (const recipient of mail.staff.recipients.filter(item => item.events.includes(staffEvent)))
            // Reply on this notification must reach the buyer, not the void:
            // that is the whole answer-from-your-inbox flow.
            await enqueue(recipient.email, `STAFF_${staffEvent}`, `${staffEvent === 'NEW_ORDER' ? 'Nuevo pedido' : 'Reembolso'} · ${values.store}`, `Pedido: ${values.order}\nImporte: ${values.amount}${buyer?.name ? `\nComprador: ${buyer.name}` : ''}${buyer?.email ? `\nCorreo: ${buyer.email}\n\nResponde a este mensaje para escribirle directamente.` : ''}\n\nRevisa los detalles en el panel de tu tienda.`, buyer?.email || undefined);
    return queued;
```

(`receiptMessageId` stays exported and unchanged; Task 2 uses it from the receipt path.)

- [ ] **Step 4: Implement in `payment-intents.service.ts`**

Delete line 671:

```ts
      let receiptQueued = false;
```

Replace lines 716-722 (from `        if (order?.storeId && updated.livemode) {` through the `receiptQueued = await queueStoreEmail(…);` line) with:

```ts
        if (order?.storeId && updated.livemode) {
          // Only the team's NEW_ORDER notice comes out of this call now. The buyer's confirmation is the
          // store's designed receipt, sent after commit by sendReceiptEmail; a plain-text
          // ORDER_CONFIRMATION a store switched on before 2026-10-13 is ignored by queueStoreEmail.
          await queueStoreEmail(tx,order.storeId,'ORDER_CONFIRMATION',updated.id,updated.customerEmail,{store:merchant.name,order:order.id,customer:updated.customerName || 'cliente',amount:formatAmount(updated.amount,updated.currency)},{email:updated.customerEmail,name:updated.customerName});
```

(The removed `cart`, `lineCurrency`, `originalTotal`, `lines` and `tracking` consts only built the plain-text receipt's `details`. Lines 723-727 — the `receiptSourceId` comment, `inboxOrder = …` and the closing `}` — stay for now.)

Replace line 778:

```ts
      return { paymentIntent: updated, railResult: result, merchantName: merchant.name, receiptQueued, inboxOrder, subscriptionBlock };
```

with:

```ts
      return { paymentIntent: updated, railResult: result, merchantName: merchant.name, inboxOrder, subscriptionBlock };
```

Replace line 785:

```ts
      if (!('receiptQueued' in outcome && outcome.receiptQueued)) await this.sendReceiptEmail(outcome.paymentIntent, outcome.merchantName, outcome.subscriptionBlock);
```

with:

```ts
      // The designed receipt is the order confirmation, always (2026-10-13): nothing upstream stands in for it.
      await this.sendReceiptEmail(outcome.paymentIntent, outcome.merchantName, outcome.subscriptionBlock);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/email-workspace src/inbox src/payment-intents/payment-intents.service.spec.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; `tsc` prints nothing. (`src/inbox` excludes `*.integration.spec.ts` through `jest.config.js`.)

- [ ] **Step 6: Run the other `queueStoreEmail` callers' specs**

Run: `cd apps/api && npx jest src/refunds src/shipping src/consumer src/commerce-platform src/retention --maxWorkers=2`
Expected: PASS (they queue REFUND, SHIPPED, DELIVERED, CANCELED, GIFT_CARD, all still offered).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/email-workspace/email-workspace.config.ts apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/email-workspace/email-workspace.spec.ts apps/api/src/email-workspace/email-workspace-events.spec.ts apps/api/src/inbox/inbox-order-receipt.spec.ts apps/api/src/payment-intents/payment-intents.service.spec.ts
git commit -m "feat(api): the designed receipt is the only order confirmation; the plain-text ORDER_CONFIRMATION is no longer offered or sent, the team's new-order notice stays"
```

---

### Task 2: The designed receipt sends from the store's domain and lands in the order's thread

**Files:**
- Modify: `apps/api/src/inbox/inbox.service.ts:5, 151-211`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts:2, 29, 675, 719-724 (post-Task-1), 781-808, 813-909`
- Modify: `apps/api/src/email-workspace/email-workspace.config.ts:44-65` (comments only)
- Test: `apps/api/src/inbox/inbox-order-receipt.spec.ts`, `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: `receiptMessageId(storeId, sourceId)`, `workspaceMail(settings)`, `workspaceSender(settings)` from `email-workspace.config.ts`.
- Produces:
  - `export type SentReceipt = { subject: string; body: string; messageId: string; from: string }` in `apps/api/src/inbox/inbox.service.ts` (`messageId` without angle brackets; `from` is the full `Name <notificaciones@domain>` sender).
  - `InboxService.threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; receipt?: SentReceipt | null })`; `receiptSourceId` is gone.
  - `PaymentIntentsService.sendReceiptEmail(...)` returns `Promise<SentReceipt | null>` (non-null only for a live payment sent from a verified domain without a provider error).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/inbox/inbox-order-receipt.spec.ts`, change line 1 to:

```ts
import { queueStoreEmail, receiptMessageId } from "../email-workspace/email-workspace.config";
```

and replace the whole `describe("InboxService.threadForOrder — filing the receipt into the thread", …)` block with:

```ts
describe("InboxService.threadForOrder — filing the sent receipt into the thread", () => {
  function db() {
    return {
      storeInboxThread: { findFirst: jest.fn().mockResolvedValue({ id: "thread-2", storeId: "store-1" }), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      storeInboxMessage: { create: jest.fn().mockResolvedValue({ id: "msg-1" }), findFirst: jest.fn() },
      storeEmailDelivery: { findUnique: jest.fn() },
      storeRetention: { findUnique: jest.fn() },
    };
  }
  const receipt = { subject: "Recibo de tu compra en Tienda", body: "Hola Ana,\n\nTu pago fue confirmado.", messageId: receiptMessageId("store-1", "payment-1"), from: "Tienda <notificaciones@tienda.test>" };
  const order = { id: "order-1", storeId: "store-1", merchantId: "m-1", customerEmail: "Ana@Gmail.test", customerName: "Ana", receipt };

  it("records the receipt under the id it was sent with, from the store's sender", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder(order);

    const recorded = prisma.storeInboxMessage.create.mock.calls[0][0].data;
    // This exact string is what the shopper's client quotes back in
    // In-Reply-To, and resolveInboundThread matches it against this column.
    expect(recorded.messageId).toBe(receiptMessageId("store-1", "payment-1"));
    expect(recorded.direction).toBe("OUTBOUND");
    expect(recorded.fromEmail).toBe("notificaciones@tienda.test");
    expect(recorded.toEmail).toBe("ana@gmail.test");
    expect(recorded.body).toBe(`${receipt.subject}\n\n${receipt.body}`);
  });

  it("reads no outbox row and no settings: the receipt is handed over as sent", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder(order);

    expect(prisma.storeEmailDelivery.findUnique).not.toHaveBeenCalled();
    expect(prisma.storeRetention.findUnique).not.toHaveBeenCalled();
  });

  it("records nothing when no receipt went out from the store's domain", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder({ ...order, receipt: null });

    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });

  it("tolerates a retried confirm() recording the same receipt twice (P2002)", async () => {
    const prisma = db();
    prisma.storeInboxMessage.create.mockRejectedValue({ code: "P2002" });

    await expect(new InboxService(prisma as any).threadForOrder(order)).resolves.toBeTruthy();
  });

  it("a reply quoting the receipt's Message-ID resolves to the order's thread", async () => {
    const prisma = db();
    const inbox = new InboxService(prisma as any);
    await inbox.threadForOrder(order);
    const recorded = prisma.storeInboxMessage.create.mock.calls[0][0].data.messageId;
    prisma.storeInboxMessage.findFirst.mockResolvedValue({ threadId: "thread-2" });
    prisma.storeInboxThread.findUnique.mockResolvedValue({ id: "thread-2", storeId: "store-1", customerEmail: "ana@gmail.test" });

    const thread = await inbox.resolveInboundThread("store-1", { inReplyTo: `<${recorded}>`, references: null }, "Ana@Gmail.test");

    expect(prisma.storeInboxMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { messageId: { in: [recorded] } } }));
    expect(thread).toMatchObject({ id: "thread-2" });
  });
});
```

In `apps/api/src/payment-intents/payment-intents.service.spec.ts`, add after line 4:

```ts
import { receiptMessageId } from "../email-workspace/email-workspace.config";
```

and add this block after the `describe("PaymentIntentsService receipt subscription block", …)` block (after line 648):

```ts
describe("PaymentIntentsService receipt from the store's verified domain", () => {
  const verified = { emailWorkspace: { domain: { id: "d1", name: "tienda.test", senderName: "Tienda", status: "verified", records: [] } } };
  const config = { get: jest.fn((key: string) => key === "app.checkoutOrigin" ? "https://pagar.test" : key === "app.orderTrackingSecret" ? "secret" : { bobPerUsd: 0, intlFeeBps: 590, costBps: 0 }) };
  function receiptService(settings: unknown, send: jest.Mock = jest.fn()) {
    const prisma = {
      storeOrder: { findUnique: jest.fn().mockResolvedValue({ id: "order_1", storeId: "store_1" }) },
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings }) },
    };
    const email = { send };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, email as any, config as any, inertLimits() as any, { notify: jest.fn() } as any, { recordCapture: jest.fn() } as any);
    return { service, email, prisma };
  }
  const intent = (livemode = true) => ({ id: "pi_9", livemode, amount: 5000, currency: "BOB", customerEmail: "ana@example.com", customerName: "Ana", metadata: { cart: [{ paymentLinkId: "link_1", name: "Café", quantity: 1, unitAmount: 5000 }] } });

  it("sends from the store's domain, with Reply-To on its inbound address and the receipt's Message-ID", async () => {
    const { service, email } = receiptService(verified);

    const receipt = await (service as any).sendReceiptEmail(intent(), "Tienda");

    const sent = email.send.mock.calls[0][0];
    expect(sent).toMatchObject({ to: "ana@example.com", from: "Tienda <notificaciones@tienda.test>", replyTo: "hola@inbound.tienda.test", headers: { "Message-ID": `<${receiptMessageId("store_1", "pi_9")}>` }, failLoudly: true });
    expect(receipt).toEqual({ subject: sent.subject, body: sent.body, messageId: receiptMessageId("store_1", "pi_9"), from: "Tienda <notificaciones@tienda.test>" });
  });

  it("sends exactly as before when the domain is not verified, and hands nothing to the inbox", async () => {
    const { service, email } = receiptService({ emailWorkspace: { domain: { ...verified.emailWorkspace.domain, status: "pending" } } });

    expect(await (service as any).sendReceiptEmail(intent(), "Tienda")).toBeNull();

    expect(Object.keys(email.send.mock.calls[0][0]).sort()).toEqual(["body", "subject", "to"]);
  });

  it("leaves a test-mode receipt alone even with a verified domain", async () => {
    const { service, email, prisma } = receiptService(verified);

    expect(await (service as any).sendReceiptEmail(intent(false), "Tienda")).toBeNull();

    expect(email.send.mock.calls[0][0].from).toBeUndefined();
    expect(prisma.storeRetention.findUnique).not.toHaveBeenCalled();
  });

  it("files nothing when the provider rejects the receipt", async () => {
    const { service, email } = receiptService(verified, jest.fn().mockRejectedValue(new Error("Email delivery failed: rejected")));

    await expect((service as any).sendReceiptEmail(intent(), "Tienda")).resolves.toBeNull();

    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("still sends the receipt when the sender lookup fails", async () => {
    const { service, email, prisma } = receiptService(verified);
    prisma.storeRetention.findUnique.mockRejectedValue(new Error("connection reset"));

    expect(await (service as any).sendReceiptEmail(intent(), "Tienda")).toBeNull();

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].from).toBeUndefined();
  });
});
```

In the same file, change the subscription-enrollment harness signature (line 690) from:

```ts
  function harness(settings: unknown, livemode = true, settlementMode = "T0") {
```

to:

```ts
  function harness(settings: unknown, livemode = true, settlementMode = "T0", inbox?: unknown) {
```

and its constructor's last argument (line 723) from `settlement as any);` to `settlement as any, inbox as any);`. Then add these two tests at the end of that `describe` (before its closing `});` at line 771):

```ts
  it("files the receipt it sent into the order's thread, after the payment commits", async () => {
    const inbox = { threadForOrder: jest.fn().mockResolvedValue({ id: "thread_1" }) };
    const { service, pay } = harness({}, true, "T0", inbox);
    const receipt = { subject: "Recibo", body: "Hola Ana", messageId: "receipt.store_1.pi_1@pagosya", from: "Tienda <notificaciones@tienda.test>" };
    (service as any).sendReceiptEmail.mockResolvedValue(receipt);

    await pay();

    expect(inbox.threadForOrder).toHaveBeenCalledWith({ id: "order_1", storeId: "store_1", merchantId: "m1", customerEmail: "ana@mail.com", customerName: "Ana", receipt });
  });

  it("opens the order's thread without a receipt when none went out from the store's domain", async () => {
    const inbox = { threadForOrder: jest.fn().mockResolvedValue({ id: "thread_1" }) };
    const { service, pay } = harness({}, true, "T0", inbox);
    (service as any).sendReceiptEmail.mockResolvedValue(null);

    await pay();

    expect(inbox.threadForOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "order_1", receipt: null }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/inbox/inbox-order-receipt.spec.ts src/payment-intents/payment-intents.service.spec.ts`
Expected: FAIL. The inbox tests see `storeEmailDelivery.findUnique` called and no message created; the receipt tests see no `from`/`replyTo` and `undefined` returned; the harness tests see `receiptSourceId` instead of `receipt`.

- [ ] **Step 3: Implement in `inbox.service.ts`**

Change line 5 to:

```ts
import { workspaceMail, workspaceSender } from "../email-workspace/email-workspace.config";
```

Add after line 7 (`export interface InboundHeaders …`):

```ts

/**
 * The buyer's receipt as it was actually sent from the store's verified domain. PaymentIntentsService
 * hands it over after the send, so the order's thread shows the exact text the shopper received (the
 * receipt's text alternative) under the exact Message-ID (no angle brackets) their reply will quote.
 */
export type SentReceipt = { subject: string; body: string; messageId: string; from: string };
```

Replace everything from `  async threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; receiptSourceId?: string }) {` through the closing `  }` of `recordQueuedReceipt` (HEAD lines 155-211; keep the JSDoc above `threadForOrder`) with:

```ts
  async threadForOrder(order: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null; receipt?: SentReceipt | null }) {
    const customerEmail = order.customerEmail.trim().toLowerCase();
    const { thread } = await this.findOrCreateThread(
      { storeId: order.storeId, customerEmail, orderId: order.id },
      {
        storeId: order.storeId, merchantId: order.merchantId, subject: `Pedido ${order.id}`,
        customerEmail, customerName: order.customerName, orderId: order.id, unreadForMerchant: false,
      },
    );
    if (order.receipt) await this.recordSentReceipt(thread, order.receipt, customerEmail);
    return thread;
  }

  /**
   * Files the order receipt into the thread it belongs to.
   *
   * The receipt's own Message-ID becomes the StoreInboxMessage.messageId, so
   * when the shopper answers their receipt the In-Reply-To they quote resolves
   * through resolveInboundThread to this very thread — the same correlation a
   * dashboard reply gets, over the same two columns.
   *
   * Only a receipt sent from the store's verified domain is handed over: one
   * sent without our Message-ID cannot be answered into this thread, and
   * recording it would promise a conversation the mail cannot deliver.
   */
  private async recordSentReceipt(thread: { id: string }, receipt: SentReceipt, customerEmail: string) {
    const fromEmail = receipt.from.match(/<([^<>]+)>/)?.[1]?.trim() || receipt.from;
    try {
      await this.prisma.storeInboxMessage.create({
        data: {
          threadId: thread.id, direction: "OUTBOUND", fromEmail, toEmail: customerEmail,
          body: `${receipt.subject}\n\n${receipt.body}`,
          messageId: receipt.messageId, inReplyTo: null, hadAttachments: false,
        },
      });
    } catch (error) {
      // A retried confirm() recomputes the same deterministic id, so the repeat
      // is a no-op rather than an error, exactly as in recordInbound.
      if ((error as { code?: string } | null)?.code !== "P2002") throw error;
    }
  }
```

(`workspaceMail` and `workspaceSender` are still used by the reply path further down the file.)

- [ ] **Step 4: Implement in `payment-intents.service.ts`**

Change line 2 to:

```ts
import { queueStoreEmail, receiptMessageId, workspaceMail, workspaceSender } from '../email-workspace/email-workspace.config';
```

Change line 29 to:

```ts
import { InboxService, type SentReceipt } from "../inbox/inbox.service";
```

Change the `inboxOrder` declaration (HEAD line 675) to:

```ts
      let inboxOrder: { id: string; storeId: string; merchantId: string; customerEmail: string; customerName: string | null } | null = null;
```

Replace the comment and assignment that follow the `queueStoreEmail` call (the three `// receiptSourceId …` comment lines and the `if (updated.customerEmail) inboxOrder = { …, receiptSourceId: updated.id };` line) with:

```ts
          // The thread is opened after commit (see below); the receipt it files is the one
          // sendReceiptEmail reports it sent.
          if (updated.customerEmail) inboxOrder = { id: order.id, storeId: order.storeId, merchantId, customerEmail: updated.customerEmail, customerName: updated.customerName };
```

Replace the post-commit block (HEAD 784-787 as left by Task 1):

```ts
    if (outcome.railResult.status === "succeeded") {
      // The designed receipt is the order confirmation, always (2026-10-13): nothing upstream stands in for it.
      await this.sendReceiptEmail(outcome.paymentIntent, outcome.merchantName, outcome.subscriptionBlock);
      await this.sendDebtPaymentNotification(outcome.paymentIntent);
    }
```

with:

```ts
    let receipt: SentReceipt | null = null;
    if (outcome.railResult.status === "succeeded") {
      // The designed receipt is the order confirmation, always (2026-10-13): nothing upstream stands in for it.
      receipt = await this.sendReceiptEmail(outcome.paymentIntent, outcome.merchantName, outcome.subscriptionBlock);
      await this.sendDebtPaymentNotification(outcome.paymentIntent);
    }
```

and the last line of that section (HEAD 808):

```ts
    if (outcome.inboxOrder) await this.inbox?.threadForOrder(outcome.inboxOrder).catch(() => undefined);
```

with:

```ts
    //
    // The receipt is filed only when sendReceiptEmail reports it went out from the store's verified
    // domain with our Message-ID; a reply to any other receipt can never reach this thread.
    if (outcome.inboxOrder) await this.inbox?.threadForOrder({ ...outcome.inboxOrder, receipt }).catch(() => undefined);
```

In `sendReceiptEmail`, replace its JSDoc and signature head (HEAD 813-835, from `  /**` through `    if (!intent.customerEmail) return;`) with:

```ts
  /**
   * This is the customer's own receipt for their order — sent on the
   * store/merchant's behalf (subject line, no pagosYa branding), same as the
   * WhatsApp/email contact shown on the checkout receipt screen. Since
   * 2026-10-13 it is the only order confirmation a buyer gets. Both
   * EmailProvider implementations already catch and log send failures
   * internally, but the try/catch here is a second layer: nothing in this
   * method — a malformed cart, a missing field — should ever be able to turn
   * an already-succeeded payment into a failed confirm() response.
   *
   * Returns what was sent when it went out from the store's verified domain
   * (receiptThreading), so the inbox can file it into the order's thread;
   * null otherwise, including when the provider rejected it.
   */
  private async sendReceiptEmail(
    intent: {
      livemode?: boolean;
      id: string;
      amount: number;
      currency: string;
      customerEmail: string | null;
      customerName: string | null;
      metadata: Prisma.JsonValue;
    },
    merchantName: string,
    subscriptionBlock = "",
  ): Promise<SentReceipt | null> {
    if (!intent.customerEmail) return null;
```

Replace the send and the end of the method (HEAD 900-909, from `      await this.email.send({` through the method's closing `  }`) with:

```ts
      const sentSubject = subject ?? (appointment ? `Cita confirmada en ${merchantName}` : `Recibo de tu compra en ${merchantName}`);
      const body = `Hola${intent.customerName ? ` ${intent.customerName}` : ""},\n\nTu pago fue confirmado.${appointment ? `\nServicio: ${appointment.offeringName ?? "Cita"}${appointment.startsAt ? `\nFecha: ${new Date(appointment.startsAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })}` : ""}` : ""}\n\nOrden: ${intent.id}\n${itemLines}Total: ${formatAmount(intent.amount, intent.currency)}${originalTotal}${trackingLine}${subscriptionBlock ? `\n${subscriptionBlock}\n` : ""}\nGracias por tu compra.`;
      // A failed lookup costs the threading, never the receipt.
      const threaded = await this.receiptThreading(order?.storeId ?? null, intent).catch(() => null);
      await this.email.send({
        to: intent.customerEmail,
        ...(html ? { html } : {}),
        subject: sentSubject,
        body,
        // failLoudly: a provider rejection must throw here (caught below), so a receipt that never
        // left is not filed into the order's thread as if the buyer had it.
        ...(threaded ? { from: threaded.from, replyTo: threaded.replyTo, headers: { "Message-ID": `<${threaded.messageId}>` }, failLoudly: true } : {}),
      });
      return threaded ? { subject: sentSubject, body, messageId: threaded.messageId, from: threaded.from } : null;
    } catch (err) {
      this.logger.warn(`Failed to send receipt email for ${intent.id}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * The buyer's receipt is the ONLY thing most order threads ever contain, so it is the message their
   * reply answers. Sent from the store's verified domain, with Reply-To on its inbound address and our
   * own Message-ID, the reply comes back to us and lands in the order's thread; sent without, it goes
   * to the merchant's personal mailbox. The same three fields the plain-text receipt carried until
   * 2026-10-13, and the same Message-ID, so replies to receipts sent before then still thread.
   *
   * Only for a verified domain (no inbound address otherwise) and a live payment (a test payment opens
   * no thread): every other receipt goes out exactly as before.
   */
  private async receiptThreading(storeId: string | null, intent: { id: string; livemode?: boolean }) {
    if (!storeId || !intent.livemode || typeof this.prisma.storeRetention?.findUnique !== "function") return null;
    const row = await this.prisma.storeRetention.findUnique({ where: { storeId }, select: { settings: true } });
    const from = workspaceSender(row?.settings), domain = workspaceMail(row?.settings).domain;
    if (!from || !domain) return null;
    return { from, replyTo: `hola@inbound.${domain.name}`, messageId: receiptMessageId(storeId, intent.id) };
  }
```

- [ ] **Step 5: Update the two comments in `email-workspace.config.ts`**

Replace the JSDoc above `workspaceDedupeKey` (lines 44-46) with:

```ts
/** The outbox dedupe key for a workspace mail: one row per store, kind, source and recipient. */
```

Replace the JSDoc above `receiptMessageId` (lines 50-62) with:

```ts
/**
 * The RFC 5322 Message-ID the order receipt is sent with, without angle brackets.
 *
 * A PURE FUNCTION of (storeId, paymentIntentId) on purpose: a retried confirm() recomputes the very
 * same id, which is what the unique index on StoreInboxMessage.messageId wants, and a buyer's reply
 * quoting it resolves to the order's thread (InboxService.resolveInboundThread). The format is the one
 * the plain-text receipt used until 2026-10-13, so replies to receipts sent before then still thread.
 */
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/inbox src/payment-intents/payment-intents.service.spec.ts src/email-workspace && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/inbox/inbox.service.ts apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/email-workspace/email-workspace.config.ts apps/api/src/inbox/inbox-order-receipt.spec.ts apps/api/src/payment-intents/payment-intents.service.spec.ts
git commit -m "feat(api): the designed receipt sends from the store's verified domain with Reply-To and Message-ID, and is filed into the order's inbox thread as sent"
```

---

### Task 3: Carrito abandonado's wait time saves with its email

**Files:**
- Modify: `apps/api/src/email-workspace/email-workspace.dto.ts:1-17`
- Modify: `apps/api/src/email-workspace/email-workspace.service.ts:59-60`
- Test: `apps/api/src/email-workspace/email-workspace.spec.ts`

**Interfaces:**
- Consumes: `EmailWorkspaceService.template(merchantId, storeId, key, dto)`.
- Produces: `PUT /v1/stores/:storeId/email-workspace/templates/RECOVERY` accepts optional `recoveryHours` (integer 1-168) and stores it in `settings.recoveryHours`; ignored for other keys; omitted → stored value unchanged. `GET` already reports it as `templates[RECOVERY].delayHours`.

- [ ] **Step 1: Write the failing tests**

Add at the top of `apps/api/src/email-workspace/email-workspace.spec.ts` (after line 5):

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmailTemplateDto } from './email-workspace.dto';
```

and add these tests at the end of the `describe('per-store email workspace', …)` block:

```ts
    it('saves the cart reminder wait with its email, and only there', async () => {
        const { service, row } = harness({ recoveryHours: 24 });
        await service.template('merchant', 'store-a', 'RECOVERY', { revision: 2, enabled: true, subject: 'Tu carrito', body: 'Vuelve', recoveryHours: 72 });
        expect(row.settings).toMatchObject({ recoveryEnabled: true, recoveryHours: 72 });
        await service.template('merchant', 'store-a', 'SHIPPED', { revision: 3, enabled: true, subject: 'Enviado', body: 'Va en camino', recoveryHours: 5 });
        expect(row.settings.recoveryHours).toBe(72);
    });
    it('keeps the stored wait when the reminder is saved without one', async () => {
        const { service, row } = harness({ recoveryHours: 36 });
        await service.template('merchant', 'store-a', 'RECOVERY', { revision: 2, enabled: false, subject: 'Tu carrito', body: 'Vuelve' });
        expect(row.settings).toMatchObject({ recoveryEnabled: false, recoveryHours: 36 });
    });
    it('reports the reminder wait in the overview', async () => {
        const { service } = harness({ recoveryEnabled: true, recoveryHours: 48 });
        const overview = await service.overview('merchant', 'store-a');
        expect(overview.templates.find((item: any) => item.id === 'RECOVERY')).toMatchObject({ enabled: true, delayHours: 48 });
    });
    it('accepts a reminder wait of 1 to 168 whole hours', async () => {
        const errors = async (recoveryHours: unknown) => (await validate(plainToInstance(EmailTemplateDto, { revision: 1, enabled: true, subject: 'a', body: 'b', recoveryHours }))).map(error => error.property);
        expect(await errors(1)).toEqual([]);
        expect(await errors(168)).toEqual([]);
        expect(await errors(undefined)).toEqual([]);
        expect(await errors(0)).toEqual(['recoveryHours']);
        expect(await errors(169)).toEqual(['recoveryHours']);
        expect(await errors(2.5)).toEqual(['recoveryHours']);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/email-workspace/email-workspace.spec.ts`
Expected: FAIL. `recoveryHours` stays 24; the DTO accepts 0/169/2.5 (whitelist-free class has no rule), and TypeScript reports `recoveryHours` does not exist on `EmailTemplateDto` (ts-jest diagnostics).

- [ ] **Step 3: Implement**

In `email-workspace.dto.ts`, change line 2 to:

```ts
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
```

and add inside `EmailTemplateDto`, after `body!: string;`:

```ts
    /** Carrito abandonado's wait before the reminder. Saved with its email since 2026-10-13, when it
     *  left the Comeback form; the same `recoveryHours` setting the cart worker reads. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(168)
    recoveryHours?: number;
```

In `email-workspace.service.ts`, replace:

```ts
            if (key === 'RECOVERY')
                settings.recoveryEnabled = dto.enabled;
```

with:

```ts
            if (key === 'RECOVERY') {
                settings.recoveryEnabled = dto.enabled;
                if (dto.recoveryHours !== undefined)
                    settings.recoveryHours = dto.recoveryHours;
            }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/email-workspace && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/email-workspace/email-workspace.dto.ts apps/api/src/email-workspace/email-workspace.service.ts apps/api/src/email-workspace/email-workspace.spec.ts
git commit -m "feat(api): Carrito abandonado saves its wait time with its email template"
```

---

### Task 4: The Correos list model

**Files:**
- Create: `apps/merchant-dashboard/src/email-list.mjs`
- Test: `apps/merchant-dashboard/src/email-list.test.mjs`

**Interfaces:**
- Consumes: the `GET /stores/:id/email-workspace` overview shape `{ storeName, revision, templates: [{ id, name, trigger, supported, enabled, subject, body, delayHours }] }`.
- Produces (all named exports of `./email-list.mjs`):
  - `EMAIL_GROUPS: [key, title][]`, `EMAIL_ROWS: { id, label, group, designed?, trigger? }[]`, `STORE_ONLY_VARIABLES: string[]`, `EMAIL_HELP: Record<string, string>`
  - `normalizeOverview(value) → { ...overview, templates: any[] }`
  - `emailListGroups(templates) → { key, title, rows: Row[] }[]` where `Row = { id, label, group, designed?, trigger, enabled, supported, subject?, body?, delayHours? }`
  - `templateSaveBody(row, draft, revision) → { revision, enabled, subject, body, recoveryHours? }` (`draft = { enabled, subject, body, recoveryHours }`)
  - `templateDraftError(row, draft) → string` ("" when savable)
  - `sampleText(text, storeName) → string`

- [ ] **Step 1: Write the failing test** — create `apps/merchant-dashboard/src/email-list.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_ROWS, emailListGroups, normalizeOverview, sampleText, templateDraftError, templateSaveBody } from './email-list.mjs';

const T = (id, extra = {}) => ({ id, name: id, trigger: `Cuando ${id}`, supported: true, enabled: false, subject: `Asunto ${id}`, body: `Mensaje ${id}`, delayHours: 0, ...extra });
const ALL = ['REFUND', 'SHIPPED', 'WELCOME', 'CANCELED', 'DELIVERED', 'GIFT_CARD', 'SUBSCRIPTION_FAILED', 'SUBSCRIPTION_SKIPPED', 'RECOVERY', 'REVIEW_REQUEST'].map(id => T(id));

test('every store email appears once, grouped in the order a buyer meets them', () => {
  const groups = emailListGroups(ALL);
  assert.deepEqual(groups.map(g => g.title), ['Compras', 'Suscripciones', 'Automáticos']);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => r.label)), ['Confirmación de compra', 'Cita confirmada', 'Enviado', 'Entregado', 'Cancelado', 'Reembolso', 'Tarjeta de regalo', 'Pago de suscripción fallido', 'Suscripción omitida', 'Bienvenida', 'Carrito abandonado', 'Pedir reseña']);
  assert.equal(new Set(groups.flatMap(g => g.rows.map(r => r.id))).size, EMAIL_ROWS.length);
});

test('a plain-text order confirmation from the API never becomes a second confirmation', () => {
  const ids = emailListGroups([...ALL, T('ORDER_CONFIRMATION', { enabled: true })]).flatMap(g => g.rows.map(r => r.id));
  assert.equal(ids.includes('ORDER_CONFIRMATION'), false);
  assert.equal(ids.filter(id => id === 'order_confirmation').length, 1);
});

test('the confirmations are always on and listed even when the workspace is unavailable', () => {
  const groups = emailListGroups(undefined);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => [r.id, r.designed, r.enabled])), [['order_confirmation', true, true], ['appointment_confirmed', true, true]]);
});

test('plain-text rows carry the stored switch, wording and wait', () => {
  const recovery = emailListGroups([T('RECOVERY', { enabled: true, delayHours: 48, subject: 'Tu carrito' })]).flatMap(g => g.rows).find(r => r.id === 'RECOVERY');
  assert.deepEqual([recovery.enabled, recovery.supported, recovery.subject, recovery.delayHours, recovery.trigger], [true, true, 'Tu carrito', 48, 'Cuando RECOVERY']);
});

test('the save body trims, keeps unsupported emails off and carries the wait only for Carrito abandonado', () => {
  const row = id => emailListGroups([...ALL]).flatMap(g => g.rows).find(r => r.id === id);
  assert.deepEqual(templateSaveBody(row('SHIPPED'), { enabled: true, subject: '  Va  ', body: ' En camino ', recoveryHours: 9 }, 4), { revision: 4, enabled: true, subject: 'Va', body: 'En camino' });
  assert.deepEqual(templateSaveBody(row('RECOVERY'), { enabled: false, subject: 'a', body: 'b', recoveryHours: '48' }, 4), { revision: 4, enabled: false, subject: 'a', body: 'b', recoveryHours: 48 });
  const skipped = emailListGroups([T('SUBSCRIPTION_SKIPPED', { supported: false })]).flatMap(g => g.rows).find(r => r.id === 'SUBSCRIPTION_SKIPPED');
  assert.equal(templateSaveBody(skipped, { enabled: true, subject: 'a', body: 'b' }, 1).enabled, false);
});

test('a draft needs a subject, a message and, for the reminder, 1 to 168 whole hours', () => {
  const recovery = { id: 'RECOVERY', supported: true }, shipped = { id: 'SHIPPED', supported: true };
  assert.equal(templateDraftError(shipped, { subject: ' ', body: 'b' }), 'Completa el asunto y el mensaje.');
  assert.equal(templateDraftError(shipped, { subject: 'a', body: 'b' }), '');
  for (const hours of ['0', '169', '2.5', '']) assert.equal(templateDraftError(recovery, { subject: 'a', body: 'b', recoveryHours: hours }), 'Las horas de espera van de 1 a 168.');
  assert.equal(templateDraftError(recovery, { subject: 'a', body: 'b', recoveryHours: '168' }), '');
});

test('the sample fills example values and the store name', () => {
  assert.equal(sampleText('Hola {{customer}}, {{order}} por {{amount}} en {{store}}', 'Café'), 'Hola María, PEDIDO-123 por Bs 180,00 en Café');
});

test('an odd overview reply leaves an empty list of templates', () => {
  assert.deepEqual(normalizeOverview([]), { templates: [] });
  assert.deepEqual(normalizeOverview(null), { templates: [] });
  assert.deepEqual(normalizeOverview({ revision: 3 }), { revision: 3, templates: [] });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/email-list.test.mjs`
Expected: FAIL with `Cannot find module '…/src/email-list.mjs'`.

- [ ] **Step 3: Create `apps/merchant-dashboard/src/email-list.mjs`**

```js
/**
 * Correos y marketing › Correos: what the list shows. Every store email appears once, in the order a
 * buyer meets them. The two confirmations are the store's designed emails (email-studio-panel.mjs) and
 * always go out; the rest are the plain-text emails of the email workspace (/email-workspace
 * templates), each with its own switch. The rows are fixed here, so a template the API stops offering
 * (ORDER_CONFIRMATION, 2026-10-13) can never come back as a second confirmation.
 */
export const EMAIL_GROUPS = [["purchases", "Compras"], ["subscriptions", "Suscripciones"], ["automatic", "Automáticos"]];
export const EMAIL_ROWS = [
  { id: "order_confirmation", label: "Confirmación de compra", group: "purchases", designed: true, trigger: "Después de confirmar el pago" },
  { id: "appointment_confirmed", label: "Cita confirmada", group: "purchases", designed: true, trigger: "Después de pagar una cita" },
  { id: "SHIPPED", label: "Enviado", group: "purchases" },
  { id: "DELIVERED", label: "Entregado", group: "purchases" },
  { id: "CANCELED", label: "Cancelado", group: "purchases" },
  { id: "REFUND", label: "Reembolso", group: "purchases" },
  { id: "GIFT_CARD", label: "Tarjeta de regalo", group: "purchases" },
  { id: "SUBSCRIPTION_FAILED", label: "Pago de suscripción fallido", group: "subscriptions" },
  { id: "SUBSCRIPTION_SKIPPED", label: "Suscripción omitida", group: "subscriptions" },
  { id: "WELCOME", label: "Bienvenida", group: "automatic" },
  { id: "RECOVERY", label: "Carrito abandonado", group: "automatic" },
  { id: "REVIEW_REQUEST", label: "Pedir reseña", group: "automatic" },
];
/** The automatic emails know the store's name and nothing about an order. */
export const STORE_ONLY_VARIABLES = ["WELCOME", "RECOVERY", "REVIEW_REQUEST"];
/** What each automatic email does, moved here with its switch from the Comeback Card form. */
export const EMAIL_HELP = {
  WELCOME: "Se envía a quien se suscribe desde el formulario de tu tienda. Todos los correos comerciales incluyen un enlace para darse de baja.",
  RECOVERY: "Al activarlo, tu tienda ofrece guardar el carrito: el cliente deja su correo y acepta recibir un recordatorio. Recupera los productos guardados con un enlace; si ya pagó, el correo se cancela. Se envía un solo recordatorio por carrito, con un máximo de uno por cliente cada siete días. No lo suscribe a campañas.",
  REVIEW_REQUEST: "Se envía 24 horas después de entregar, un solo correo por pedido, con un enlace privado para reseñar los productos comprados. Las reseñas quedan pendientes de moderación y nunca se publican automáticamente.",
};

/** A usable overview whatever the API answered: a failed or odd reply leaves only the confirmations. */
export function normalizeOverview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { templates: [] };
  return { ...value, templates: Array.isArray(value.templates) ? value.templates : [] };
}

/** The groups that have at least one row, each row merged with what the API stores for it. */
export function emailListGroups(templates) {
  const byId = new Map((Array.isArray(templates) ? templates : []).map(template => [template.id, template]));
  return EMAIL_GROUPS.map(([key, title]) => ({ key, title, rows: EMAIL_ROWS.filter(row => row.group === key).flatMap(row => {
    if (row.designed) return [{ ...row, enabled: true, supported: true }];
    const template = byId.get(row.id);
    // An email the API does not offer is left out, rather than shown as a switch that cannot save.
    if (!template) return [];
    return [{ ...row, trigger: template.trigger || "", enabled: Boolean(template.enabled), supported: template.supported !== false, subject: template.subject ?? "", body: template.body ?? "", delayHours: Number(template.delayHours) || 0 }];
  }) })).filter(group => group.rows.length);
}

/** The PUT /email-workspace/templates/:id body. Carrito abandonado also carries its wait time. */
export function templateSaveBody(row, draft, revision) {
  const body = { revision, enabled: Boolean(row.supported && draft.enabled), subject: String(draft.subject ?? "").trim(), body: String(draft.body ?? "").trim() };
  if (row.id === "RECOVERY") body.recoveryHours = Number(draft.recoveryHours);
  return body;
}

/** What stops a draft from saving, in the merchant's words; "" when it can be saved. */
export function templateDraftError(row, draft) {
  const body = templateSaveBody(row, draft, 0);
  if (!body.subject || !body.body) return "Completa el asunto y el mensaje.";
  if (row.id === "RECOVERY" && !(Number.isInteger(body.recoveryHours) && body.recoveryHours >= 1 && body.recoveryHours <= 168)) return "Las horas de espera van de 1 a 168.";
  return "";
}

/** The sample the merchant previews: never sent, filled with example values. */
export function sampleText(text, storeName) {
  return String(text ?? "").replace(/\{\{store\}\}/g, () => storeName).replace(/\{\{customer\}\}/g, "María").replace(/\{\{order\}\}/g, "PEDIDO-123").replace(/\{\{amount\}\}/g, "Bs 180,00");
}
```

(`Number("")` is 0, so an emptied hours field fails validation instead of saving 0.)

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/email-list.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/email-list.mjs apps/merchant-dashboard/src/email-list.test.mjs
git commit -m "feat(dashboard): the Correos list model, every store email once with its stored switch and wording"
```

---

### Task 5: The designed editor opens for one email

**Files:**
- Modify: `apps/merchant-dashboard/src/email-studio-panel.mjs:4-10, 58-62, 89-117, 208-217`
- Modify: `apps/merchant-dashboard/src/email-content-panel.mjs:4, 83`
- Test: `apps/merchant-dashboard/src/email-studio-panel.test.mjs`, `apps/merchant-dashboard/src/email-content-panel.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mountEmailStudio(container, { api, storeId, assetUrl?, types?: boolean })` → `{ show(type?: "order_confirmation" | "appointment_confirmed"), reset() }`. With `types: false` the panel draws no email switcher of its own and titles itself with the shown email's label. `show(type)` on an already loaded store switches email without re-reading the status.

- [ ] **Step 1: Write the failing tests**

Append to `apps/merchant-dashboard/src/email-studio-panel.test.mjs`:

```js
function mountOwn(api) {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  return { container, panel: mountEmailStudio(container, { api, storeId: () => 'store_1', types: false }) };
}

test('opened for one email from the Correos list, it shows that email and no switcher of its own', async () => {
  const calls = [];
  const { container, panel } = mountOwn(fakeApi(status(), calls));
  panel.show('appointment_confirmed'); await settle();
  assert.equal(container.querySelector('[data-email-type]'), null);
  assert.equal(container.querySelector('.email-studio-head h3').textContent, 'Cita confirmada');
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=appointment_confirmed&which=active')));
});

test("asked for another email once open, it switches without re-reading the store's look", async () => {
  const calls = [];
  const { container, panel } = mountOwn(fakeApi(status(), calls));
  panel.show('order_confirmation'); await settle();
  const statusReads = () => calls.filter(([, p]) => p.endsWith('/emails')).length;
  const before = statusReads();
  panel.show('appointment_confirmed'); await settle();
  assert.equal(statusReads(), before);
  assert.equal(container.querySelector('.email-studio-head h3').textContent, 'Cita confirmada');
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/copy/appointment_confirmed')));
});
```

In `apps/merchant-dashboard/src/email-content-panel.test.mjs`, in the test `'without shared codes the promo row says where to mark one'`, add after its `assert.match(…/Mostrar en correos/)` line:

```js
  assert.match(container.querySelector('[data-content-row="promo"]').textContent, /en Códigos promocionales/);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/email-studio-panel.test.mjs src/email-content-panel.test.mjs`
Expected: FAIL: `[data-email-type]` buttons are present, the title is "Correos", the preview is for `order_confirmation`; the hint still says "en Descuentos".

- [ ] **Step 3: Implement in `email-studio-panel.mjs`**

Replace the header comment (lines 4-10) with:

```js
/**
 * Correos y marketing › Correos: the store's one email look, for the two designed confirmations. The
 * merchant designs it (or asks for a bolder version), previews each email at phone and desktop width,
 * edits its wording, undoes a redesign and mails themselves a copy. Previews run in fully closed
 * sandboxes: email HTML never needs to run anything. Below it, the content of the emails
 * (email-content-panel.mjs) lives in its own element, so redrawing the studio never wipes what the
 * merchant is typing there. Opened from the Correos list (email-list-panel.mjs) with `types: false`,
 * it shows the email picked there and draws no switcher of its own, so no email is listed twice.
 */
```

Replace `typeList` (lines 58-62) with:

```js
  function typeList(s) {
    const types = Array.isArray(s.types) ? s.types : [];
    const groups = [...new Set(types.map(t => t.group))];
    return groups.map(group => `<div class="email-studio-group"><span>${esc(group)}</span>${types.filter(t => t.group === group).map(t =>
      `<button type="button" data-email-type="${esc(t.type)}" aria-pressed="${t.type === state.type}">${esc(t.label)}</button>`).join("")}</div>`).join("");
  }
```

In `render()`, replace:

```js
      <div class="email-studio-head"><div><h3>Correos</h3><p>${esc(statusLine(s))}</p></div><div class="email-studio-actions">${actions(s)}</div></div>
      <div class="email-studio-types">${typeList(s)}</div>
```

with:

```js
      <div class="email-studio-head"><div><h3>${esc(title(s))}</h3><p>${esc(statusLine(s))}</p></div><div class="email-studio-actions">${actions(s)}</div></div>
      ${deps.types === false ? "" : `<div class="email-studio-types">${typeList(s)}</div>`}
```

and replace the type-button wiring line:

```js
    view.querySelectorAll("[data-email-type]").forEach(button => button.addEventListener("click", () => { state = { ...state, type: button.dataset.emailType, edits: {} }; content?.render(); void loadEmail(); }));
```

with:

```js
    view.querySelectorAll("[data-email-type]").forEach(button => button.addEventListener("click", () => select(button.dataset.emailType)));
```

Add these two functions right after `typeList`:

```js
  /** Without its own switcher the panel is titled with the email it shows. */
  function title(s) {
    if (deps.types !== false) return "Correos";
    return (Array.isArray(s.types) ? s.types : []).find(t => t.type === state.type)?.label ?? "Correos";
  }

  /** Switches the email shown; its preview, wording and the content's per-email switches follow. */
  function select(type) {
    state = { ...state, type, edits: {} };
    content?.render();
    void loadEmail();
  }
```

Replace `show()` in the returned object (lines 209-217) with:

```js
    show(type) {
      const storeId = deps.storeId();
      if (!storeId) return;
      // Re-fetched when the merchant switches store, not on every visit to the tab.
      if (shownFor === storeId && state.status) { if (type && type !== state.type) select(type); return; }
      shownFor = storeId;
      state = { ...fresh(), ...(type ? { type } : {}) };
      void load();
    },
```

- [ ] **Step 4: Implement in `email-content-panel.mjs`**

Line 4: change ` * Ajustes › Correos › Contenido: what the merchant says in their emails. The announcement, the` to ` * Correos y marketing › Correos › Contenido: what the merchant says in their emails. The announcement, the`.

Line 83: change `Marca códigos con «Mostrar en correos» en Descuentos para ofrecerlos aquí.` to `Marca códigos con «Mostrar en correos» en Códigos promocionales para ofrecerlos aquí.`

- [ ] **Step 5: Run them to verify they pass**

Run: `cd apps/merchant-dashboard && node --test src/email-studio-panel.test.mjs src/email-content-panel.test.mjs`
Expected: PASS (all old tests still pass: without `types: false` the switcher and the "Correos" title are unchanged).

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-dashboard/src/email-studio-panel.mjs apps/merchant-dashboard/src/email-content-panel.mjs apps/merchant-dashboard/src/email-studio-panel.test.mjs apps/merchant-dashboard/src/email-content-panel.test.mjs
git commit -m "feat(dashboard): the designed email editor opens for one email, without a second email switcher"
```

---

### Task 6: The Correos tab panel

**Files:**
- Create: `apps/merchant-dashboard/src/email-list-panel.mjs`
- Modify: `apps/merchant-dashboard/src/email-studio.css:1-2` and append
- Test: `apps/merchant-dashboard/src/email-list-panel.test.mjs`

**Interfaces:**
- Consumes: `mountEmailStudio(container, { api, storeId, assetUrl, types: false })` → `{ show(type), reset() }` (Task 5); everything exported by `./email-list.mjs` (Task 4); `PUT /stores/:id/email-workspace/templates/:key` (Task 3 for `recoveryHours`).
- Produces: `mountEmailList(container, { api, storeId, assetUrl?, confirm?: (message) => boolean })` → `{ show(), reset() }`. DOM hooks used by later tests: `[data-email-row="<id>"]` (row buttons, `aria-pressed`), `[data-email-switch="<id>"]` (checkbox, `aria-label="Enviar <label>"`), `[data-email-text-root]`, `[data-email-designed-root]`, `[data-email-text-form="<id>"]` with fields `enabled`, `subject`, `body`, `recoveryHours`, button "Guardar correo", `[data-email-sample]`, `[data-email-sample-out]`, `.email-list-status`.

- [ ] **Step 1: Write the failing test** — create `apps/merchant-dashboard/src/email-list-panel.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEmailList } from './email-list-panel.mjs';

const T = (id, extra = {}) => ({ id, name: id, trigger: `Cuando ${id}`, supported: true, enabled: false, subject: `Asunto ${id}`, body: `Mensaje ${id}`, delayHours: 0, ...extra });
const OVERVIEW = { storeName: 'Café', revision: 4, templates: [T('REFUND'), T('SHIPPED'), T('WELCOME'), T('CANCELED'), T('DELIVERED'), T('GIFT_CARD'), T('SUBSCRIPTION_FAILED'), T('SUBSCRIPTION_SKIPPED', { supported: false }), T('RECOVERY', { delayHours: 24 }), T('REVIEW_REQUEST', { delayHours: 24 })] };
const STATUS = { kit: 'active', candidate: false, previous: false, siteChanged: false, maxCredits: 25, types: [{ type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' }, { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' }] };
const CONTENT = { available: true, content: {}, promos: [], photos: [], defaults: { announcement: 'Gracias.', storyTitle: 'Sobre {tienda}', storyText: 'Somos {tienda}.', note: 'Gracias.' } };

function fakeApi({ calls = [], handle = () => undefined } = {}) {
  return async (path, init = {}) => {
    const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    calls.push([method, path, body]);
    const custom = await handle(method, path, body);
    if (custom !== undefined) return custom;
    if (path.endsWith('/email-workspace')) return structuredClone(OVERVIEW);
    if (path.includes('/email-workspace/templates/')) return { saved: true };
    if (path.endsWith('/emails')) return STATUS;
    if (path.endsWith('/emails/content')) return CONTENT;
    if (path.includes('/emails/preview')) return { html: '<p>PREVIEW</p>', subject: 'x', repairs: [] };
    if (path.includes('/emails/copy/')) return { storeName: 'Café', fields: [] };
    return { ok: true };
  };
}
function mount(api, { storeId = () => 'store_1', confirm = () => true } = {}) {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  return { container, window, panel: mountEmailList(container, { api, storeId, confirm }) };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };
const type = (window, el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const submit = (window, container) => container.querySelector('[data-email-text-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const puts = (calls, id) => calls.filter(([m, p]) => m === 'PUT' && p.endsWith(`/email-workspace/templates/${id}`));

test('lists every store email once, grouped, the confirmations always on', async () => {
  const { container, panel } = mount(fakeApi({ handle: (m, p) => p.endsWith('/email-workspace') ? { ...structuredClone(OVERVIEW), templates: [...OVERVIEW.templates, T('ORDER_CONFIRMATION', { enabled: true })] } : undefined }));
  panel.show(); await settle();
  assert.deepEqual([...container.querySelectorAll('[data-email-row]')].map(b => b.dataset.emailRow), ['order_confirmation', 'appointment_confirmed', 'SHIPPED', 'DELIVERED', 'CANCELED', 'REFUND', 'GIFT_CARD', 'SUBSCRIPTION_FAILED', 'SUBSCRIPTION_SKIPPED', 'WELCOME', 'RECOVERY', 'REVIEW_REQUEST']);
  assert.deepEqual([...container.querySelectorAll('.email-list-group h3')].map(h => h.textContent), ['Compras', 'Suscripciones', 'Automáticos']);
  assert.equal(container.querySelector('[data-email-switch="order_confirmation"]'), null);
  assert.equal(container.querySelectorAll('.email-list-state').length, 2);
  assert.match(container.querySelector('[data-email-row="RECOVERY"]').textContent, /24 h/);
});

test('opens on the purchase confirmation in the designed editor, with its content below and no second switcher', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  assert.equal(container.querySelector('[data-email-row="order_confirmation"]').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelector('[data-email-designed-root]').hidden, false);
  assert.equal(container.querySelector('[data-email-text-root]').hidden, true);
  assert.equal(container.querySelector('[data-email-type]'), null);
  assert.ok(container.querySelector('[data-email-content-root] [data-content-save]'));
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=order_confirmation&which=active')));
});

test('selecting Cita confirmada shows that designed email', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-row="appointment_confirmed"]').click(); await settle();
  assert.equal(container.querySelector('.email-studio-head h3').textContent, 'Cita confirmada');
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=appointment_confirmed&which=active')));
});

test('a switch saves its email with the stored wording and reloads the list', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-switch="REVIEW_REQUEST"]').click(); await settle();
  assert.deepEqual(puts(calls, 'REVIEW_REQUEST').map(([, , body]) => body), [{ revision: 4, enabled: true, subject: 'Asunto REVIEW_REQUEST', body: 'Mensaje REVIEW_REQUEST' }]);
  assert.equal(calls.filter(([m, p]) => m === 'GET' && p.endsWith('/email-workspace')).length, 2);
  assert.match(container.querySelector('.email-list-status').textContent, /Pedir reseña: activado/);
});

test('an email that cannot be sent yet has no working switch', async () => {
  const { container, panel } = mount(fakeApi());
  panel.show(); await settle();
  const box = container.querySelector('[data-email-switch="SUBSCRIPTION_SKIPPED"]');
  assert.equal(box.disabled, true);
  assert.match(box.closest('label').textContent, /Por conectar/);
});

test('Carrito abandonado saves its wait time with its email', async () => {
  const calls = [];
  const { container, window, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-row="RECOVERY"]').click(); await settle();
  const hours = container.querySelector('[data-email-text-form="RECOVERY"] [name=recoveryHours]');
  assert.equal(hours.value, '24');
  assert.match(container.querySelector('[data-email-text-root]').textContent, /ofrece guardar el carrito/);
  type(window, hours, '0'); submit(window, container); await settle();
  assert.equal(puts(calls, 'RECOVERY').length, 0);
  assert.match(container.textContent, /Las horas de espera van de 1 a 168/);
  type(window, container.querySelector('[name=recoveryHours]'), '48'); submit(window, container); await settle();
  assert.deepEqual(puts(calls, 'RECOVERY').map(([, , body]) => body), [{ revision: 4, enabled: false, subject: 'Asunto RECOVERY', body: 'Mensaje RECOVERY', recoveryHours: 48 }]);
  assert.match(container.textContent, /Correo guardado/);
});

test('Bienvenida edits its wording, offers only {{store}} and previews a sample', async () => {
  const { container, window, panel } = mount(fakeApi());
  panel.show(); await settle();
  container.querySelector('[data-email-row="WELCOME"]').click(); await settle();
  const form = container.querySelector('[data-email-text-form="WELCOME"]');
  assert.doesNotMatch(form.textContent, /\{\{customer\}\}/);
  type(window, form.querySelector('[name=subject]'), 'Hola desde {{store}}');
  form.querySelector('[data-email-sample]').click();
  assert.equal(form.querySelector('[data-email-sample-out]').hidden, false);
  assert.match(form.querySelector('[data-email-sample-out]').textContent, /Hola desde Café/);
});

test('a conflicting save keeps the draft and retries on the refreshed revision', async () => {
  const calls = [];
  let revision = 4, attempts = 0;
  const api = fakeApi({ calls, handle: (method, path) => {
    if (method === 'PUT' && path.endsWith('/templates/SHIPPED') && ++attempts === 1) { revision = 5; throw Object.assign(new Error('La configuración cambió. Actualiza antes de guardar.'), { status: 409 }); }
    if (method === 'GET' && path.endsWith('/email-workspace')) return { ...structuredClone(OVERVIEW), revision };
  } });
  const { container, window, panel } = mount(api);
  panel.show(); await settle();
  container.querySelector('[data-email-row="SHIPPED"]').click(); await settle();
  type(window, container.querySelector('[name=subject]'), 'Ya va en camino');
  submit(window, container); await settle();
  assert.match(container.textContent, /conservamos tu borrador/);
  assert.equal(container.querySelector('[name=subject]').value, 'Ya va en camino');
  assert.equal(container.querySelector('.email-list-status').getAttribute('role'), 'alert');
  submit(window, container); await settle();
  assert.deepEqual(puts(calls, 'SHIPPED').at(-1)[2], { revision: 5, enabled: false, subject: 'Ya va en camino', body: 'Mensaje SHIPPED' });
});

test('a switch on the email being edited asks before dropping unsaved text', async () => {
  const calls = [];
  const { container, window, panel } = mount(fakeApi({ calls }), { confirm: () => false });
  panel.show(); await settle();
  container.querySelector('[data-email-row="SHIPPED"]').click(); await settle();
  type(window, container.querySelector('[name=subject]'), 'Borrador sin guardar');
  const box = container.querySelector('[data-email-switch="SHIPPED"]');
  box.click(); await settle();
  assert.equal(puts(calls, 'SHIPPED').length, 0);
  assert.equal(box.checked, false);
  assert.equal(container.querySelector('[name=subject]').value, 'Borrador sin guardar');
  // Leaving for another email asks too, and declining stays.
  container.querySelector('[data-email-row="DELIVERED"]').click(); await settle();
  assert.ok(container.querySelector('[data-email-text-form="SHIPPED"]'));
});

test('a failed load still lists the confirmations and says why', async () => {
  const { container, panel } = mount(fakeApi({ handle: (m, p) => { if (p.endsWith('/email-workspace')) throw new Error('Sin conexión'); } }));
  panel.show(); await settle();
  assert.deepEqual([...container.querySelectorAll('[data-email-row]')].map(b => b.dataset.emailRow), ['order_confirmation', 'appointment_confirmed']);
  assert.equal(container.querySelector('.email-list-status[role=alert]').textContent, 'Sin conexión');
});

test('without a store nothing loads; a store switch reloads; reset clears', async () => {
  const calls = [];
  let store = null;
  const { container, panel } = mount(fakeApi({ calls }), { storeId: () => store });
  panel.show(); await settle();
  assert.equal(calls.length, 0);
  store = 'store_1'; panel.show(); await settle();
  store = 'store_2'; panel.reset(); panel.show(); await settle();
  assert.ok(calls.some(([, p]) => p === '/stores/store_2/email-workspace'));
  assert.ok(calls.some(([, p]) => p.startsWith('/stores/store_2/source-project/emails')));
  panel.reset();
  assert.equal(container.innerHTML, '');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/email-list-panel.test.mjs`
Expected: FAIL with `Cannot find module '…/src/email-list-panel.mjs'`.

- [ ] **Step 3: Create `apps/merchant-dashboard/src/email-list-panel.mjs`**

```js
import { escapeHtml as esc } from "./html.mjs";
import { mountEmailStudio } from "./email-studio-panel.mjs";
import { EMAIL_HELP, STORE_ONLY_VARIABLES, emailListGroups, normalizeOverview, sampleText, templateDraftError, templateSaveBody } from "./email-list.mjs";

const LEAVE = "Hay cambios sin guardar. ¿Descartarlos?";

/**
 * Correos y marketing › Correos (2026-10-13): every email the store sends, once, each with its switch.
 * The two confirmations open the designed editor (email-studio-panel.mjs, with "Contenido de tus
 * correos" below it); a plain-text email opens the editor that used to be the Studio's Plantillas tab.
 * The list and both editors are separate elements, so redrawing the list never wipes what the merchant
 * is typing in an editor.
 */
export function mountEmailList(container, deps) {
  if (!container) return { show() {}, reset() {} };
  const fresh = () => ({ overview: null, selected: "order_confirmation", draft: null, dirty: false, busy: false, message: "", failed: false });
  let state = fresh();
  let generation = 0;
  let shownFor = null;
  let designedFor = null;
  let list = null, editor = null, designed = null, studio = null;
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/email-workspace`;
  const ask = (message) => (deps.confirm ? deps.confirm(message) : true);
  const rows = () => emailListGroups(state.overview?.templates).flatMap(group => group.rows);
  const selectedRow = () => rows().find(row => row.id === state.selected) ?? rows()[0];

  function ensureDom() {
    if (list && container.contains(list)) return;
    list = document.createElement("div");
    list.className = "email-list";
    editor = document.createElement("div");
    editor.setAttribute("data-email-text-root", "");
    designed = document.createElement("div");
    designed.setAttribute("data-email-designed-root", "");
    container.replaceChildren(list, editor, designed);
    studio = mountEmailStudio(designed, { api: deps.api, storeId: deps.storeId, assetUrl: deps.assetUrl, types: false });
    designedFor = null;
  }

  function canLeave() {
    return !state.busy && (!state.dirty || ask(LEAVE));
  }

  function render() {
    ensureDom();
    renderList();
    renderEditor();
  }

  function renderList() {
    const current = selectedRow()?.id;
    const note = state.message ? `<p class="email-list-status" role="${state.failed ? "alert" : "status"}">${esc(state.message)}</p>` : "";
    const loading = state.overview ? "" : '<p class="email-list-status" role="status">Cargando tus correos…</p>';
    list.innerHTML = note + loading + emailListGroups(state.overview?.templates).map(group => `<section class="email-list-group" aria-labelledby="email-group-${group.key}">
      <h3 id="email-group-${group.key}">${esc(group.title)}</h3>
      <ul>${group.rows.map(row => `<li class="email-list-row">
        <button type="button" class="email-list-open" data-email-row="${esc(row.id)}" aria-pressed="${row.id === current}"><strong>${esc(row.label)}</strong><small>${esc(row.trigger)}${row.id === "RECOVERY" && row.delayHours ? ` · ${row.delayHours} h` : ""}</small></button>
        ${row.designed
          ? '<span class="email-list-state">Siempre activo</span>'
          : `<label class="email-list-switch"><input type="checkbox" data-email-switch="${esc(row.id)}" aria-label="Enviar ${esc(row.label)}" ${row.enabled ? "checked" : ""} ${!row.supported || state.busy ? "disabled" : ""}><span>${!row.supported ? "Por conectar" : row.enabled ? "Activo" : "Desactivado"}</span></label>`}
      </li>`).join("")}</ul></section>`).join("");
    list.querySelectorAll("[data-email-row]").forEach(button => button.addEventListener("click", () => select(button.dataset.emailRow)));
    list.querySelectorAll("[data-email-switch]").forEach(box => box.addEventListener("change", () => void toggle(box)));
  }

  function renderEditor() {
    const row = selectedRow();
    const isDesigned = !row || Boolean(row.designed);
    editor.hidden = isDesigned;
    designed.hidden = !isDesigned;
    if (isDesigned) {
      editor.replaceChildren();
      const type = row?.id ?? "order_confirmation", key = `${deps.storeId()}:${type}`;
      // The designed editor loads its own preview: told once per store and email, not on every list redraw.
      if (designedFor !== key) { designedFor = key; studio.show(type); }
      return;
    }
    state.draft ??= { enabled: row.enabled, subject: row.subject, body: row.body, recoveryHours: row.delayHours || 24 };
    const draft = state.draft, off = state.busy ? "disabled" : "";
    editor.innerHTML = `<form class="email-text-editor" data-email-text-form="${esc(row.id)}" novalidate>
      <header><h3>${esc(row.label)}</h3><p>${esc(row.trigger)}</p></header>
      ${EMAIL_HELP[row.id] ? `<p class="faint">${esc(EMAIL_HELP[row.id])}</p>` : ""}
      <label class="email-list-switch"><input type="checkbox" name="enabled" ${draft.enabled ? "checked" : ""} ${row.supported ? off : "disabled"}> Activar este correo</label>
      ${row.supported ? "" : `<p class="faint">${esc(row.trigger)}. Puedes preparar el mensaje; el envío aún no está disponible.</p>`}
      ${row.id === "RECOVERY" ? `<label>Horas de espera<input type="number" name="recoveryHours" min="1" max="168" step="1" required value="${esc(draft.recoveryHours)}" ${off}></label>` : ""}
      <label>Asunto<input name="subject" maxlength="160" required value="${esc(draft.subject)}" ${off}></label>
      <label>Mensaje<textarea name="body" rows="7" maxlength="5000" required ${off}>${esc(draft.body)}</textarea></label>
      <p class="faint">Variables: {{store}}${STORE_ONLY_VARIABLES.includes(row.id) ? "" : " · {{customer}} · {{order}} · {{amount}}"}. Los enlaces necesarios se conservan en los correos de recuperación y reseñas.</p>
      <div class="email-studio-actions"><button type="submit" class="primary" ${off}>Guardar correo</button><button type="button" class="ghost" data-email-sample>Vista previa</button></div>
      <article class="email-text-sample" data-email-sample-out hidden></article>
    </form>`;
    const form = editor.querySelector("form");
    const track = () => { state.draft = readDraft(form); state.dirty = true; };
    form.addEventListener("input", track);
    form.addEventListener("change", track);
    form.addEventListener("submit", event => { event.preventDefault(); void save(row); });
    editor.querySelector("[data-email-sample]").addEventListener("click", () => {
      const sample = readDraft(form), store = state.overview?.storeName || "tu tienda", out = editor.querySelector("[data-email-sample-out]");
      out.innerHTML = `<small>Ejemplo · no se enviará</small><h4>${esc(sampleText(sample.subject, store))}</h4><p>${esc(sampleText(sample.body, store))}</p>`;
      out.hidden = false;
    });
  }

  function readDraft(form) {
    const field = (name) => form.elements.namedItem(name);
    return { enabled: Boolean(field("enabled")?.checked), subject: field("subject")?.value ?? "", body: field("body")?.value ?? "", recoveryHours: field("recoveryHours")?.value ?? state.draft?.recoveryHours ?? 24 };
  }

  function select(id) {
    if (id === selectedRow()?.id || !canLeave()) return;
    state = { ...state, selected: id, draft: null, dirty: false, message: "", failed: false };
    render();
  }

  async function toggle(box) {
    const row = rows().find(item => item.id === box.dataset.emailSwitch);
    // A switch saves the stored wording. Unsaved text open for this same email would be reloaded away
    // by that save, so the merchant decides first; declining puts the switch back.
    if (!row || (row.id === selectedRow()?.id && !canLeave())) { box.checked = !box.checked; return; }
    const stored = { enabled: box.checked, subject: row.subject, body: row.body, recoveryHours: row.delayHours || 24 };
    await run(templateSaveBody(row, stored, state.overview?.revision ?? 0), row, `${row.label}: ${box.checked ? "activado" : "desactivado"}.`, row.id === selectedRow()?.id);
  }

  async function save(row) {
    const problem = templateDraftError(row, state.draft);
    if (problem) { state = { ...state, message: problem, failed: true }; render(); return; }
    await run(templateSaveBody(row, state.draft, state.overview?.revision ?? 0), row, "Correo guardado.", true);
  }

  /**
   * One save at a time. On success the list re-reads the workspace; on failure what the merchant typed
   * stays, and a conflict refreshes the revision underneath the draft, as the Studio's Plantillas did.
   */
  async function run(payload, row, done, clearDraft) {
    if (state.busy) return;
    const mine = generation;
    state = { ...state, busy: true, message: "Guardando…", failed: false };
    render();
    try {
      await deps.api(`${base()}/templates/${encodeURIComponent(row.id)}`, { method: "PUT", body: JSON.stringify(payload) });
    } catch (error) {
      let message = error?.message || "No se pudo completar. Tus datos siguen aquí.";
      if (error?.status === 409) {
        try {
          const overview = normalizeOverview(await deps.api(base()));
          if (mine !== generation) return;
          state = { ...state, overview };
          message += " Se actualizó la versión guardada y conservamos tu borrador. Revisa tus cambios antes de volver a guardar.";
        } catch {
          message += " No se pudo cargar la versión actual. Inténtalo cuando se restablezca la conexión.";
        }
      }
      if (mine !== generation) return;
      state = { ...state, busy: false, message, failed: true };
      render();
      return;
    }
    let overview = state.overview;
    // The save went through; if the list cannot be re-read now, it is on the next visit.
    try { overview = normalizeOverview(await deps.api(base())); } catch { /* keep the last list */ }
    if (mine !== generation) return;
    state = { ...state, overview, busy: false, message: done, failed: false, ...(clearDraft ? { draft: null, dirty: false } : {}) };
    render();
  }

  async function load() {
    const mine = ++generation;
    render();
    let overview, message = "", failed = false;
    try { overview = normalizeOverview(await deps.api(base())); }
    catch (error) { overview = normalizeOverview(null); message = error?.message || "No pudimos cargar tus correos."; failed = true; }
    if (mine !== generation) return;
    state = { ...state, overview, message, failed };
    render();
  }

  return {
    show() {
      const storeId = deps.storeId();
      if (!storeId) return;
      // Re-fetched when the merchant switches store, not on every visit to the tab.
      if (shownFor === storeId && state.overview) return;
      shownFor = storeId;
      state = fresh();
      void load();
    },
    reset() {
      generation += 1;
      shownFor = null;
      designedFor = null;
      state = fresh();
      studio?.reset();
      list = editor = designed = studio = null;
      container.innerHTML = "";
    },
  };
}
```

- [ ] **Step 4: Add the styles to `apps/merchant-dashboard/src/email-studio.css`**

Replace lines 1-2:

```css
/* Ajustes › Correos: calm light workspace. Uses the palette tokens from calm.css / workspace-design.css. */
#orderEmailRoot { display: grid; gap: 16px; }
```

with:

```css
/* Correos y marketing › Correos: calm light workspace. Uses the palette tokens from calm.css / workspace-design.css. */
#marketingEmails[hidden] { display: none !important; }
#marketingEmailsRoot { display: grid; gap: 24px; }
```

and append at the end of the file:

```css
/* The list of every store email: one bordered list per group, the switch at the end of each row. */
.email-list { display: grid; gap: 18px; }
.email-list-status { margin: 0; color: var(--pg-text-muted); font-size: 14px; }
.email-list-status[role="alert"] { color: var(--pg-error); }
.email-list-group h3 { margin: 0 0 8px; color: var(--pg-text-muted); font-size: 12px; font-weight: 600; }
.email-list-group ul { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--pg-border); border-radius: var(--calm-radius, 12px); background: var(--pg-surface, #fff); }
.email-list-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 4px 14px 4px 4px; }
.email-list-row + .email-list-row { border-top: 1px solid var(--pg-border); }
.email-list-open { display: grid; gap: 2px; flex: 1 1 auto; min-width: 0; width: auto; min-height: 48px; padding: 8px 10px; border: 0; border-radius: 8px; background: none; box-shadow: none; color: var(--pg-text); font-size: 14px; text-align: left; }
.email-list-open small { color: var(--pg-text-muted); font-size: 12px; font-weight: 400; }
.email-list-open[aria-pressed="true"] { background: var(--pg-accent-soft); }
.email-list-state, .email-list-switch span { color: var(--pg-text-muted); font-size: 12px; white-space: nowrap; }
.email-list-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
.email-list-switch input { width: auto; margin: 0; }
/* The plain-text editor, under the list. */
.email-text-editor { display: grid; gap: 14px; max-width: 640px; padding-top: 20px; border-top: 1px solid var(--pg-border); }
.email-text-editor header h3 { margin: 0 0 4px; font-size: 15px; }
.email-text-editor header p, .email-text-editor .faint { margin: 0; color: var(--pg-text-muted); font-size: 13px; }
.email-text-editor > label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
.email-text-editor > label.email-list-switch { display: inline-flex; font-weight: 500; }
.email-text-sample { padding: 14px 16px; border: 1px solid var(--pg-border); border-radius: var(--calm-radius, 12px); background: var(--pg-surface, #fff); }
.email-text-sample small { color: var(--pg-text-muted); }
.email-text-sample h4 { margin: 6px 0; font-size: 15px; }
.email-text-sample p { margin: 0; white-space: pre-wrap; }
/* Ajustes › General: where the emails went. */
.settings-emails-moved { margin: 0 0 16px; color: var(--pg-text-muted); font-size: 13px; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/merchant-dashboard && node --test src/email-list-panel.test.mjs src/email-list.test.mjs src/email-studio-panel.test.mjs`
Expected: PASS (11 new panel tests; the list-model and designed-editor tests still pass).

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-dashboard/src/email-list-panel.mjs apps/merchant-dashboard/src/email-list-panel.test.mjs apps/merchant-dashboard/src/email-studio.css
git commit -m "feat(dashboard): the Correos panel lists every store email with its switch, opens the designed editor or the plain-text editor below"
```

---

### Task 7: Correos moves into Correos y marketing; Ajustes keeps only non-email settings

**Files:**
- Modify: `apps/merchant-dashboard/index.html:558-561, 861-866`
- Modify: `apps/merchant-dashboard/src/settings-tabs.mjs:1-3`
- Modify: `apps/merchant-dashboard/src/dashboard.js:625-652, 663, 728, 767, 796, 3249-3263, 3288-3293`
- Modify: `apps/merchant-dashboard/server.mjs:151`
- Test: `apps/merchant-dashboard/src/settings-tabs.test.mjs`, `apps/merchant-dashboard/unit/served-modules.test.mjs`, `apps/merchant-dashboard/tests/marketing-emails.spec.mjs` (create), `apps/merchant-dashboard/tests/email-studio-panel.spec.mjs`, `apps/merchant-dashboard/tests/store-settings-tabs.spec.mjs`, `apps/merchant-dashboard/tests/store-settings.spec.mjs`

**Interfaces:**
- Consumes: `mountEmailList(container, { api, storeId, assetUrl, confirm })` → `{ show(), reset() }` (Task 6).
- Produces: marketing tab id `emails` (default) with `#marketingEmails` / `#marketingEmailsRoot`; `selectMarketingTab("templates" | "flows")` lands on `emails`; `openSettingsSection("emails")` and the Ajustes › General link `[data-open-marketing-emails]` open Correos y marketing › Correos; `SETTINGS_TABS = ["general", "brand", "shipping", "domain"]`.

- [ ] **Step 1: Write the failing unit tests**

In `apps/merchant-dashboard/src/settings-tabs.test.mjs`:
- delete the MARKUP line `  <div role="tabpanel" data-settings-panel="emails"></div>`;
- replace the test `'clicking a tab selects it'` with:

```js
test('clicking a tab selects it', () => {
  const { root } = mount();
  root.querySelector('[data-settings-tab="shipping"]').click();
  assert.deepEqual(selected(root), ['shipping']);
  assert.deepEqual(visible(root), ['studio']);
});
```

- in `'arrow keys move between tabs, as a tablist should'` change `assert.deepEqual(selected(root), ['emails']);` to `assert.deepEqual(selected(root), ['domain']);`;
- add at the end:

```js
test('Correos is no longer an Ajustes tab: the emails live in Correos y marketing', () => {
  assert.deepEqual(SETTINGS_TABS, ['general', 'brand', 'shipping', 'domain']);
  const { root, tabs } = mount();
  tabs.select('emails');
  assert.deepEqual(selected(root), ['general']);
});
```

In `apps/merchant-dashboard/unit/served-modules.test.mjs`, append:

```js
test("every module a served module imports is served too", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
  // Relative imports inside a served module resolve to /src/… in the browser and 404 the same way.
  const seen = new Set();
  const queue = [...dashboard.matchAll(/(?:import\(|from )"(\/src\/[^"]+)"/g)].map((match) => match[1]);
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith(".mjs")) continue;
    const source = readFileSync(new URL(`..${file}`, import.meta.url), "utf8");
    for (const [, name] of source.matchAll(/(?:import\(|from )"(?:\.\/|\/src\/)([^"]+)"/g)) queue.push(`/src/${name}`);
  }
  assert.ok(seen.has("/src/email-list-panel.mjs"), "the dashboard loads the Correos list");
  assert.deepEqual([...seen].filter((file) => !server.includes(`"${file}"`)), []);
});
```

- [ ] **Step 2: Write the failing browser tests**

Create `apps/merchant-dashboard/tests/marketing-emails.spec.mjs`:

```js
import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id, merchantId: "merchant_1", slug: id, name, websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [], showLowStockToCustomers: false,
});

const WORKSPACE = "/stores/store_1/email-workspace";
const BASE = "/stores/store_1/source-project/emails";
const template = (id, name, extra = {}) => ({ id, name, trigger: `Cuando ${name.toLowerCase()}`, supported: true, enabled: false, subject: `${name} · {{store}}`, body: `Hola, ${name}.`, delayHours: 0, ...extra });
const overview = () => ({ storeName: "Café Illimani", revision: 4, emailConfigured: true, domain: null, staff: { enabled: false, recipients: [] }, logs: { items: [], nextBefore: null }, templates: [
  template("REFUND", "Confirmación de reembolso"), template("SHIPPED", "Pedido enviado"), template("WELCOME", "Bienvenida a la comunidad"),
  template("CANCELED", "Pedido cancelado"), template("DELIVERED", "Pedido entregado"), template("GIFT_CARD", "Entrega de tarjeta de regalo"),
  template("SUBSCRIPTION_FAILED", "Pago de suscripción fallido"), template("SUBSCRIPTION_SKIPPED", "Entrega de suscripción omitida", { supported: false }),
  template("RECOVERY", "Carrito abandonado", { delayHours: 24 }), template("REVIEW_REQUEST", "Solicitud de reseña", { delayHours: 24 }),
] });
const STATUS = { kit: "active", candidate: false, previous: false, siteChanged: false, maxCredits: 25, types: [{ type: "order_confirmation", label: "Confirmación de compra", group: "Compras" }, { type: "appointment_confirmed", label: "Cita confirmada", group: "Compras" }] };
const CONTENT = { available: true, content: {}, defaults: { announcement: "Gracias por comprar en {tienda}.", storyTitle: "Sobre {tienda}", storyText: "Somos {tienda}.", note: "Gracias." }, promos: [], photos: [] };

/** The email workspace keeps what a PUT saved, so the list redraws the way the API would answer. */
function correos() {
  const workspace = overview();
  return ({ path, request }) => {
    if (path === WORKSPACE) return workspace;
    if (path.startsWith(`${WORKSPACE}/templates/`) && request.method() === "PUT") {
      const body = request.postDataJSON(), row = workspace.templates.find((item) => item.id === path.split("/").pop());
      Object.assign(row, { enabled: body.enabled, subject: body.subject, body: body.body }, body.recoveryHours ? { delayHours: body.recoveryHours } : {});
      workspace.revision += 1;
      return { saved: true };
    }
    if (path === BASE) return STATUS;
    if (path.startsWith(`${BASE}/preview`)) return { html: "<p>Recibo de Café Illimani</p>", subject: "x", repairs: [] };
    if (path.startsWith(`${BASE}/copy/`)) return { storeName: "Café Illimani", fields: [] };
    if (path === `${BASE}/content`) return CONTENT;
    return undefined;
  };
}

async function openDashboard(page, stores, responseForRequest) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = { ...request.postDataJSON(), websiteRevision: request.postDataJSON().revision + 1 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(stores[0].name);
  return requests;
}

async function navigateDashboard(page, view) {
  const sidebar = page.locator(".dashboard-sidebar");
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await sidebar.evaluate((element) => element.classList.contains("is-store-nav-pinned")))) await handle.click();
  const link = page.locator(`.dashboard-nav-button[data-dashboard-view="${view}"]`);
  await link.evaluate((element) => element.closest("details.dashboard-nav-group")?.setAttribute("open", ""));
  await link.click();
}

test("Correos y marketing opens on Correos and lists every store email once", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await expect(page.locator("#marketingTabs button")).toHaveText(["Correos", "Equipo", "Remitente", "Registros", "Comeback Card", "Campañas", "Clientes", "Códigos promocionales"]);
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#storeMarketingFrame")).toBeHidden();
  await expect(page.locator("[data-email-row] strong")).toHaveText(["Confirmación de compra", "Cita confirmada", "Enviado", "Entregado", "Cancelado", "Reembolso", "Tarjeta de regalo", "Pago de suscripción fallido", "Suscripción omitida", "Bienvenida", "Carrito abandonado", "Pedir reseña"]);
  // The purchase confirmation opens in the designed editor, with no second list of emails inside it.
  await expect(page.locator(".email-studio-frame iframe")).toHaveCount(2);
  await expect(page.locator(".email-studio-types")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Contenido de tus correos" })).toBeVisible();
  // A Studio tab still loads in the frame, and coming back shows the list again.
  await page.locator('[data-marketing-tab="staff"]').click();
  await expect(page.locator("#storeMarketingFrame")).toHaveAttribute("src", /library=marketing&tab=staff/);
  await expect(page.locator("#marketingEmails")).toBeHidden();
  await page.locator('[data-marketing-tab="emails"]').click();
  await expect(page.locator("#marketingEmails")).toBeVisible();
});

test("a switch saves its email, and Carrito abandonado saves its wait time", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.getByRole("checkbox", { name: "Enviar Pedir reseña" }).click();
  await expect.poll(() => requests.find((r) => r.method === "PUT" && r.path === `${WORKSPACE}/templates/REVIEW_REQUEST`)?.body).toEqual({ revision: 4, enabled: true, subject: "Solicitud de reseña · {{store}}", body: "Hola, Solicitud de reseña." });
  await expect(page.getByRole("checkbox", { name: "Enviar Pedir reseña" })).toBeChecked();
  await page.locator('[data-email-row="RECOVERY"]').click();
  const form = page.locator('[data-email-text-form="RECOVERY"]');
  await form.getByLabel("Horas de espera").fill("48");
  await form.getByRole("button", { name: "Guardar correo" }).click();
  await expect.poll(() => requests.find((r) => r.method === "PUT" && r.path === `${WORKSPACE}/templates/RECOVERY`)?.body).toEqual({ revision: 5, enabled: false, subject: "Carrito abandonado · {{store}}", body: "Hola, Carrito abandonado.", recoveryHours: 48 });
  await expect(page.locator('[data-email-row="RECOVERY"]')).toContainText("48 h");
});

test("selecting Cita confirmada opens the designed editor for that email", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.locator('[data-email-row="appointment_confirmed"]').click();
  await expect(page.locator("[data-email-designed-root] .email-studio-head h3")).toHaveText("Cita confirmada");
  await expect(page.locator('[data-email-row="appointment_confirmed"]')).toHaveAttribute("aria-pressed", "true");
});

test("a Studio request for the old Plantillas tab lands on Correos", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.locator('[data-marketing-tab="program"]').click();
  await page.evaluate(() => {
    const studio = /** @type {HTMLIFrameElement} */ (document.getElementById("merchantStudioFrame"));
    /** @type {any} */ (studio.contentWindow).eval(`parent.postMessage({ type: "pagosya:workspace", view: "marketing", tab: "templates" }, ${JSON.stringify(location.origin)})`);
  });
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#marketingEmails")).toBeVisible();
});

test("at 390 px the list and the editor fit without the page scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await expect(page.locator('[data-email-row="REVIEW_REQUEST"]')).toBeVisible();
  await page.locator('[data-email-row="RECOVERY"]').click();
  await expect(page.locator('[data-email-text-form="RECOVERY"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
```

In `apps/merchant-dashboard/tests/store-settings-tabs.spec.mjs`:
- line 90: `["General", "Marca", "Envíos y retiro", "Dominio", "Correos"]` → `["General", "Marca", "Envíos y retiro", "Dominio web"]`;
- line 114: `[["Dominio", "domain"], …]` → `[["Dominio web", "domain"], …]`;
- line 131: `{ name: "Dominio" }` → `{ name: "Dominio web" }`;
- append:

```js
test("General points to Correos y marketing, where the store's emails live", async ({ page }) => {
  await openSettings(page);
  await page.locator("#settingsPanelGeneral").getByRole("link", { name: "Correos y marketing" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "marketing");
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#marketingEmails")).toBeVisible();
});

test("a Studio request for Ajustes › Correos lands on Correos y marketing › Correos", async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => {
    const studio = /** @type {HTMLIFrameElement} */ (document.getElementById("merchantStudioFrame"));
    /** @type {any} */ (studio.contentWindow).eval(`parent.postMessage({ type: "pagosya:workspace", view: "store-settings", section: "emails" }, ${JSON.stringify(location.origin)})`);
  });
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "marketing");
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
});
```

In `apps/merchant-dashboard/tests/email-studio-panel.spec.mjs`:
- in `openCorreos`, replace the two lines `await navigateDashboard(page, "store-settings");` and `await page.getByRole("tab", { name: "Correos" }).click();` with:

```js
  await navigateDashboard(page, "marketing");
  await page.locator('[data-marketing-tab="emails"]').click();
```

- in `"a failed preview says so instead of showing an empty frame"`, replace the same two lines the same way;
- in `"the test send goes to the signed-in merchant, …"` and in `"the content of the emails is edited below the preview, …"`, replace `await page.getByRole("button", { name: "Cita confirmada" }).click();` with `await page.locator('[data-email-row="appointment_confirmed"]').click();`.

In `apps/merchant-dashboard/tests/store-settings.spec.mjs`, after line 727 (`await expect(page.locator('[data-marketing-tab="domain"]')).toHaveAttribute("aria-pressed", "true");`) add:

```js
  // The email sender domain is "Remitente" here; Ajustes' "Dominio web" is the website's domain.
  await expect(page.locator('[data-marketing-tab="domain"]')).toHaveText("Remitente");
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/settings-tabs.test.mjs unit/served-modules.test.mjs`
Expected: FAIL (`SETTINGS_TABS` still has `emails`; `/src/email-list-panel.mjs` not yet loaded by the dashboard).

Run: `cd apps/merchant-dashboard && npx playwright test --config playwright.worktree.config.mjs tests/marketing-emails.spec.mjs tests/store-settings-tabs.spec.mjs`
Expected: FAIL (tabs "Plantillas"/"Flujos", no `[data-email-row]`, Ajustes has five tabs).

- [ ] **Step 4: Implement `index.html`**

Replace line 558 (the `<nav class="marketing-tabs" id="marketingTabs" …>…</nav>` line) with:

```html
      <nav class="marketing-tabs" id="marketingTabs" aria-label="Herramientas de marketing" data-tab="emails"><button type="button" data-marketing-tab="emails" aria-pressed="true">Correos</button><button type="button" data-marketing-tab="staff" aria-pressed="false">Equipo</button><button type="button" data-marketing-tab="domain" aria-pressed="false">Remitente</button><button type="button" data-marketing-tab="logs" aria-pressed="false">Registros</button><button type="button" data-marketing-tab="program" aria-pressed="false">Comeback Card</button><button type="button" data-marketing-tab="campaigns" aria-pressed="false">Campañas</button><button type="button" data-marketing-tab="customers" aria-pressed="false">Clientes</button><button type="button" data-marketing-tab="promotions" aria-pressed="false">Códigos promocionales</button></nav>
```

After line 560 (`      <p data-resource-empty="marketing" hidden>Selecciona una tienda para configurar su marketing.</p>`) insert:

```html
      <div id="marketingEmails"><div class="panel"><div id="marketingEmailsRoot"></div></div></div>
```

Replace lines 861-866:

```html
        <button type="button" role="tab" id="settingsTabDomain" aria-controls="settingsPanelStudio" data-settings-tab="domain">Dominio</button>
        <button type="button" role="tab" id="settingsTabEmails" aria-controls="settingsPanelEmails" data-settings-tab="emails">Correos</button>
      </div>
      <div role="tabpanel" id="settingsPanelGeneral" aria-labelledby="settingsTabGeneral" data-settings-panel="general"><div id="storeSettingsRoot"></div></div>
      <div role="tabpanel" id="settingsPanelStudio" aria-label="Ajustes del Studio" data-settings-panel="studio" hidden><iframe class="settings-embed" title="Ajustes de la tienda"></iframe></div>
      <div role="tabpanel" id="settingsPanelEmails" aria-labelledby="settingsTabEmails" data-settings-panel="emails" hidden><div id="orderEmailRoot"></div></div>
```

with:

```html
        <button type="button" role="tab" id="settingsTabDomain" aria-controls="settingsPanelStudio" data-settings-tab="domain">Dominio web</button>
      </div>
      <div role="tabpanel" id="settingsPanelGeneral" aria-labelledby="settingsTabGeneral" data-settings-panel="general"><p class="settings-emails-moved">Tus correos están en <a href="#dashboard-marketing" data-open-marketing-emails>Correos y marketing</a>.</p><div id="storeSettingsRoot"></div></div>
      <div role="tabpanel" id="settingsPanelStudio" aria-label="Ajustes del Studio" data-settings-panel="studio" hidden><iframe class="settings-embed" title="Ajustes de la tienda"></iframe></div>
```

- [ ] **Step 5: Implement `settings-tabs.mjs`**

Replace lines 1-3:

```js
/** Ajustes is one page with tabs. General and Correos are the dashboard's own; Marca, Envíos y retiro and
 * Dominio are the Studio's panels, drawn inline in a same-origin frame that grows with its content. */
export const SETTINGS_TABS = ["general", "brand", "shipping", "domain", "emails"];
```

with:

```js
/** Ajustes is one page with tabs. General is the dashboard's own; Marca, Envíos y retiro and Dominio web are
 * the Studio's panels, drawn inline in a same-origin frame that grows with its content. The store's emails
 * moved to Correos y marketing › Correos on 2026-10-13. */
export const SETTINGS_TABS = ["general", "brand", "shipping", "domain"];
```

- [ ] **Step 6: Implement `dashboard.js`** (nine edits, each located by its quoted text)

(a) Replace `selectMarketingTab` and its comment (HEAD 625-631):

```js
  /* Deja Correos y marketing en una pestaña concreta; el iframe se recarga con ese tab. */
  function selectMarketingTab(tab) {
    document.getElementById("marketingTabs").dataset.tab = tab;
    document.querySelectorAll("[data-marketing-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.marketingTab === tab)));
    document.getElementById("marketingPromotions").hidden = tab !== "promotions";
    document.getElementById("storeMarketingFrame").removeAttribute("src");
  }
```

with:

```js
  /* Deja Correos y marketing en una pestaña concreta. Correos y Códigos promocionales los dibuja el panel; las demás
     son el Studio en el iframe, que se recarga con ese tab. Plantillas y Flujos eran las pestañas de correos del
     Studio hasta 2026-10-13: quien todavía las pida (un Studio sin recompilar, un enlace guardado) llega a Correos. */
  function selectMarketingTab(tab) {
    if (tab === "templates" || tab === "flows") tab = "emails";
    document.getElementById("marketingTabs").dataset.tab = tab;
    document.querySelectorAll("[data-marketing-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.marketingTab === tab)));
    document.getElementById("marketingPromotions").hidden = tab !== "promotions";
    document.getElementById("marketingEmails").hidden = tab !== "emails";
    document.getElementById("storeMarketingFrame").removeAttribute("src");
  }
```

(b) Replace (HEAD 643):

```js
      frame.hidden = !currentStoreId || !sessionToken || kind === "marketing" && document.getElementById("marketingTabs").dataset.tab === "promotions";
```

with:

```js
      frame.hidden = !currentStoreId || !sessionToken || kind === "marketing" && ["emails", "promotions"].includes(document.getElementById("marketingTabs").dataset.tab);
```

(c) At the end of `syncStoreResourceViews` (HEAD 649-652), replace:

```js
        frame.src = `/studio/?embedded=1&${kind === "products" ? "productGuide=1" : `library=${kind}${kind === "marketing" ? `&tab=${document.getElementById("marketingTabs").dataset.tab}` : ""}`}&store=${encodeURIComponent(currentStoreId)}`;
      }
    }
  }
```

with:

```js
        frame.src = `/studio/?embedded=1&${kind === "products" ? "productGuide=1" : `library=${kind}${kind === "marketing" ? `&tab=${document.getElementById("marketingTabs").dataset.tab}` : ""}`}&store=${encodeURIComponent(currentStoreId)}`;
      }
    }
    // Correos is drawn here, not in the frame: shown for the selected store (loaded once per store).
    if (view === "marketing" && sessionToken && document.getElementById("marketingTabs").dataset.tab === "emails") emailStudio?.show();
  }
```

(d) Replace (HEAD 663):

```js
      if (event.data.view === "marketing" && ["program", "templates"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
```

with:

```js
      if (event.data.view === "marketing" && ["program", "emails", "templates", "flows"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
```

(e) Replace (HEAD 728):

```js
      if (event.data.view === "marketing" && event.data.tab === "program") selectMarketingTab("program");
```

with:

```js
      if (event.data.view === "marketing" && ["program", "emails", "templates", "flows"].includes(event.data.tab)) selectMarketingTab(event.data.tab);
```

(f) Replace (HEAD 767):

```js
    if (view === "discounts") { view = "marketing"; document.getElementById("marketingTabs").dataset.tab = "promotions"; document.getElementById("marketingPromotions").hidden = false; document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed",String(tab.dataset.marketingTab === "promotions"))); }
```

with:

```js
    if (view === "discounts") { view = "marketing"; selectMarketingTab("promotions"); }
```

(g) Delete (HEAD 796):

```js
    if (nextView === "store-settings" && sessionToken && settingsTabs?.current() === "emails") emailStudio?.show();
```

(h) Replace (HEAD 3249-3263):

```js
  // The settings page lives under "Tu tienda" rather than a top-level entry of
  // its own: everything it edits is scoped to the selected store. Its tabs show
  // Marca, Envíos y retiro and Dominio as the Studio's own panels, inline.
  import("/src/settings-tabs.mjs").then(({ mountSettingsTabs }) => {
    settingsTabs = mountSettingsTabs(document.getElementById("storeSettingsSection"), {
      storeId: () => currentStoreId,
      // The Studio frame reads the API base from the shared session before it loads.
      beforeLoad: () => sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, "")),
      onShow: (tab) => { if (tab === "emails" && sessionToken) emailStudio?.show(); },
    });
  });
  /** Opens Ajustes on one of its tabs, for example when the Studio asks for Dominio. */
  function openSettingsSection(section) {
    settingsTabs?.select(section);
  }
```

with:

```js
  // The settings page lives under "Tu tienda" rather than a top-level entry of
  // its own: everything it edits is scoped to the selected store. Its tabs show
  // Marca, Envíos y retiro and Dominio web as the Studio's own panels, inline.
  // Its emails moved to Correos y marketing › Correos on 2026-10-13.
  import("/src/settings-tabs.mjs").then(({ mountSettingsTabs }) => {
    settingsTabs = mountSettingsTabs(document.getElementById("storeSettingsSection"), {
      storeId: () => currentStoreId,
      // The Studio frame reads the API base from the shared session before it loads.
      beforeLoad: () => sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, "")),
    });
  });
  /** Opens Ajustes on one of its tabs, for example when the Studio asks for Dominio. A request for
   *  Ajustes › Correos (an older Studio, a saved link) lands on Correos y marketing › Correos. */
  function openSettingsSection(section) {
    if (section === "emails") { openMarketingEmails(); return; }
    settingsTabs?.select(section);
  }
  function openMarketingEmails() {
    if (!canLeaveMerchantStudio()) return;
    selectMarketingTab("emails");
    history.pushState(null, "", "#dashboard-marketing");
    setDashboardView("marketing");
  }
  document.querySelector("[data-open-marketing-emails]").addEventListener("click", (event) => { event.preventDefault(); openMarketingEmails(); });
```

(i) Replace (HEAD 3288-3293):

```js
  import("/src/email-studio-panel.mjs").then(({ mountEmailStudio }) => {
    emailStudio = mountEmailStudio(document.getElementById("orderEmailRoot"), { api, storeId: () => currentStoreId, assetUrl: (path) => `${apiRoot()}${path}` });
    if (document.body.dataset.dashboardView === "store-settings" && sessionToken && settingsTabs?.current() === "emails") emailStudio.show();
  }).catch(() => {
    document.getElementById("orderEmailRoot").textContent = "No pudimos cargar la vista previa del correo. Recarga la página para volver a intentar.";
  });
```

with:

```js
  // Correos y marketing › Correos: the list of every store email, which mounts the designed editor
  // (email-studio-panel.mjs) itself. It keeps the `emailStudio` name so selectStore's reset needs no edit.
  import("/src/email-list-panel.mjs").then(({ mountEmailList }) => {
    emailStudio = mountEmailList(document.getElementById("marketingEmailsRoot"), { api, storeId: () => currentStoreId, assetUrl: (path) => `${apiRoot()}${path}`, confirm: (message) => window.confirm(message) });
    if (document.body.dataset.dashboardView === "marketing" && sessionToken && document.getElementById("marketingTabs").dataset.tab === "emails") emailStudio.show();
  }).catch(() => {
    document.getElementById("marketingEmailsRoot").textContent = "No pudimos cargar tus correos. Recarga la página para volver a intentar.";
  });
```

(`let emailStudio = null;` at line 440 and `emailStudio?.reset();` in `selectStore` at line 1721 stay as they are.)

- [ ] **Step 7: Implement `server.mjs`** — in line 151 replace

```
"/src/email-studio-panel.mjs", "/src/email-content-panel.mjs", "/src/email-studio.css",
```

with

```
"/src/email-studio-panel.mjs", "/src/email-content-panel.mjs", "/src/email-list.mjs", "/src/email-list-panel.mjs", "/src/email-studio.css",
```

- [ ] **Step 8: Run the unit tests to verify they pass**

Run: `cd apps/merchant-dashboard && npm run test:unit`
Expected: PASS, all files (including the new `email-list*.test.mjs` and the extended served-modules test).

- [ ] **Step 9: Run the browser tests to verify they pass**

Run: `cd apps/merchant-dashboard && npx playwright test --config playwright.worktree.config.mjs tests/marketing-emails.spec.mjs tests/email-studio-panel.spec.mjs tests/store-settings-tabs.spec.mjs tests/store-settings.spec.mjs tests/dashboard-smoke.spec.mjs tests/merchant-workspace.spec.mjs`
Expected: PASS. (`dashboard-smoke` proves the marketing view opens without a script error now that Correos draws itself; its API stub answers `[]`, which `normalizeOverview` turns into an empty list.)

- [ ] **Step 10: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/settings-tabs.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs apps/merchant-dashboard/src/settings-tabs.test.mjs apps/merchant-dashboard/unit/served-modules.test.mjs apps/merchant-dashboard/tests/marketing-emails.spec.mjs apps/merchant-dashboard/tests/email-studio-panel.spec.mjs apps/merchant-dashboard/tests/store-settings-tabs.spec.mjs apps/merchant-dashboard/tests/store-settings.spec.mjs
git commit -m "feat(dashboard): every store email is set up in Correos y marketing › Correos; Ajustes loses its Correos tab, Dominio web and Remitente are told apart"
```

---

### Task 8: The Studio drops Plantillas, Flujos and the Comeback form's email fields

**Files:**
- Modify: `apps/merchant-studio/src/source-business-workspace.ts:21, 78, 87-106, 222`
- Modify: `apps/merchant-studio/src/retention.ts:81-83, 97-99`
- Test: `apps/merchant-studio/src/source-business-workspace.test.ts:57-83`, `apps/merchant-studio/src/retention.test.ts`, `apps/merchant-studio/tests/retention.spec.ts:94-97`, `apps/merchant-dashboard/tests/merchant-workspace.spec.mjs`

**Interfaces:**
- Consumes: the dashboard's handling of `pagosya:workspace` `{ view: "marketing", tab: "emails" }` (Task 7).
- Produces: `library=marketing` Studio page serves only `staff` (default), `domain`, `logs`, `program`, `campaigns`, `customers`; the integrations "Correos y campañas" card posts `tab: "emails"`; the Comeback form saves `welcomeEnabled`, `welcomeSubject`, `welcomeBody`, `recoveryEnabled`, `recoveryHours`, `reviewRequestsEnabled` exactly as loaded.

- [ ] **Step 1: Write the failing tests**

In `apps/merchant-studio/src/source-business-workspace.test.ts`, replace the two tests `'keeps a failed template draft and blocks navigation during save'` and `'refreshes a conflicted revision without losing the draft before retry'` (lines 57-83) with:

```ts
    it('no longer draws email templates: Correos lives in the dashboard', async () => {
        await mount('library=marketing&tab=templates');
        expect(app.querySelector('[data-template], .email-groups, [data-template-form]')).toBeNull();
    });
    it('keeps a failed recipients draft and blocks navigation during save', async () => {
        await mount('library=marketing&tab=staff');
        click('[data-add-recipient]');
        input('[data-recipient-email="0"]', 'equipo@tienda.test');
        let reject!: (error: Error) => void;
        mocks.workspace.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
        submit('form');
        expect((window as any).pagosyaStudioCanLeave()).toBe(false);
        expect((app.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(true);
        reject(Error('Conflicto de revisión'));
        await vi.waitFor(() => expect(app.textContent).toContain('Conflicto de revisión'));
        expect((app.querySelector('[data-recipient-email="0"]') as HTMLInputElement).value).toBe('equipo@tienda.test');
        expect((app.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(false);
        expect(mocks.workspace).toHaveBeenLastCalledWith('store-a', '/staff', 'PUT', expect.objectContaining({ revision: 2, recipients: [{ email: 'equipo@tienda.test', events: ['NEW_ORDER'] }] }));
    });
    it('refreshes a conflicted revision without losing the recipients draft before retry', async () => {
        await mount('library=marketing&tab=staff');
        click('[data-add-recipient]');
        input('[data-recipient-email="0"]', 'equipo@tienda.test');
        mocks.workspace.mockRejectedValueOnce(Object.assign(Error('La configuración cambió.'), { status: 409 }));
        mocks.workspace.mockResolvedValueOnce({ revision: 3 });
        submit('form');
        await vi.waitFor(() => expect(app.textContent).toContain('conservamos tu borrador'));
        expect((app.querySelector('[data-recipient-email="0"]') as HTMLInputElement).value).toBe('equipo@tienda.test');
        submit('form');
        await vi.waitFor(() => expect(mocks.workspace).toHaveBeenCalledWith('store-a', '/staff', 'PUT', expect.objectContaining({ revision: 3, recipients: [{ email: 'equipo@tienda.test', events: ['NEW_ORDER'] }] })));
    });
    it('sends the email card to the dashboard Correos tab', async () => {
        const send = vi.spyOn(window.parent, 'postMessage');
        await mount('library=integrations');
        click('[data-open-integration=email]');
        expect(send).toHaveBeenCalledWith({ type: 'pagosya:workspace', view: 'marketing', tab: 'emails', storeId: 'store-a' }, location.origin);
    });
```

In `apps/merchant-studio/src/retention.test.ts`, add inside `describe('Comeback workspaces', …)`:

```ts
  it('leaves the welcome, reminder and review emails to Correos y marketing and saves them unchanged', async () => {
    const loaded = state();
    Object.assign(loaded.settings, { welcomeEnabled: true, welcomeSubject: 'Hola {{store}}', welcomeBody: 'Bienvenida', recoveryEnabled: true, recoveryHours: 48, reviewRequestsEnabled: true });
    vi.mocked(api.retention).mockResolvedValue(loaded);
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    for (const name of ['welcomeEnabled', 'welcomeSubject', 'welcomeBody', 'recoveryEnabled', 'recoveryHours', 'reviewRequestsEnabled']) expect(host.querySelector(`[name=${name}]`)).toBeNull();
    expect(host.textContent).toContain('Correos y marketing');
    input('rewardLabel', 'Un postre');
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalled());
    expect(vi.mocked(api.writeRetention).mock.calls[0][3]).toMatchObject({ rewardLabel: 'Un postre', welcomeEnabled: true, welcomeSubject: 'Hola {{store}}', welcomeBody: 'Bienvenida', recoveryEnabled: true, recoveryHours: 48, reviewRequestsEnabled: true });
  });
```

In `apps/merchant-studio/tests/retention.spec.ts`, line 94: replace ` await page.getByLabel('Ofrecer un recordatorio por correo').check();` (the last statement on that line) with ` await expect(page.getByLabel('Ofrecer un recordatorio por correo')).toHaveCount(0);`; line 97: replace `recoveryEnabled: true });` with `recoveryEnabled: false, recoveryHours: 24 });`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-business-workspace.test.ts src/retention.test.ts`
Expected: FAIL: the templates tab still draws `.email-groups`; the email card posts `tab: 'templates'`; the Comeback form still has `[name=welcomeEnabled]`.

- [ ] **Step 3: Implement `source-business-workspace.ts`**

Remove the Plantillas/Flujos branch with a guarded script (the two template lines are over 1,000 characters, so they are not retyped):

```bash
cd apps/merchant-studio && node - <<'EOF'
const fs = require("node:fs");
const file = "src/source-business-workspace.ts";
const lines = fs.readFileSync(file, "utf8").split("\n");
const start = lines.findIndex(line => line.trim() === "if (tab === 'templates' || tab === 'flows') {");
const end = lines.findIndex((line, i) => i > start && line.trim() === "else if (tab === 'staff') {");
if (start < 0 || end - start !== 19) throw new Error(`anchors moved: ${start}..${end}`);
lines.splice(start, end - start);
lines[start] = lines[start].replace("else if (tab === 'staff') {", "// Correos (the list of every email and both editors) is drawn by the dashboard since 2026-10-13;\n                // this page keeps Equipo, Remitente and Registros.\n                if (tab === 'staff') {");
fs.writeFileSync(file, lines.join("\n"));
EOF
grep -n "templates' || tab === 'flows'\|data-template\|// Correos (the list" src/source-business-workspace.ts
```

Expected: the grep prints only the new `// Correos (the list …` comment line.

Then three one-line edits:
- `tab = params.get('tab') || 'templates';` → `tab = params.get('tab') || 'staff';`
- `let state = await api.businessWorkspace(storeId), editing: string | null = null;` → `let state = await api.businessWorkspace(storeId);`
- `send({ type: 'pagosya:workspace', view: item.view, tab: item.id === 'comeback' ? 'program' : 'templates' });` → `send({ type: 'pagosya:workspace', view: item.view, tab: item.id === 'comeback' ? 'program' : 'emails' });`

- [ ] **Step 4: Implement `retention.ts`**

Replace line 81:

```ts
        ${toggle('welcomeEnabled', 'Enviar correo de bienvenida al suscribirse', s.welcomeEnabled)}<div class="brand-fields"><label>Asunto de bienvenida<input name="welcomeSubject" required maxlength="160" value="${esc(s.welcomeSubject)}"></label><label>Mensaje de bienvenida<textarea name="welcomeBody" required rows="4" maxlength="5000">${esc(s.welcomeBody)}</textarea></label></div><p>Puedes usar {{store}} para incluir el nombre del negocio. Todos los correos comerciales incluyen un enlace para darse de baja.</p></section>
```

with:

```ts
        <p>El correo de bienvenida para quienes se suscriben, el recordatorio de carrito y la solicitud de reseña se configuran en Correos y marketing › Correos.</p></section>
```

Delete lines 82 and 83 (the `<section class="retention-section"><h3>03 / Recuperar carritos</h3>…</section>` and `<section class="retention-section"><h3>04 / Reseñas después de la entrega</h3>…</section>` lines).

Replace the three lines in the `[data-settings]` submit handler:

```ts
      for (const key of ['comebackEnabled', 'signupEnabled', 'welcomeEnabled', 'recoveryEnabled', 'reviewRequestsEnabled']) data[key] = form.has(key);
      for (const key of ['visitsRequired', 'recoveryHours']) data[key] = Number(form.get(key));
      for (const key of ['rewardLabel', 'timezone', 'signupTitle', 'signupBody', 'signupButton', 'welcomeSubject', 'welcomeBody']) data[key] = String(form.get(key) || '').trim();
```

with:

```ts
      for (const key of ['comebackEnabled', 'signupEnabled']) data[key] = form.has(key);
      data.visitsRequired = Number(form.get('visitsRequired'));
      for (const key of ['rewardLabel', 'timezone', 'signupTitle', 'signupBody', 'signupButton']) data[key] = String(form.get(key) || '').trim();
      // The welcome, cart-reminder and review emails are edited in Correos y marketing › Correos. This PUT
      // still replaces every setting at once (RetentionSettingsDto requires them), so they go back as loaded.
      for (const key of ['welcomeEnabled', 'welcomeSubject', 'welcomeBody', 'recoveryEnabled', 'recoveryHours', 'reviewRequestsEnabled']) data[key] = s[key];
```

- [ ] **Step 5: Run the Studio tests and type check**

Run: `cd apps/merchant-studio && npx vitest run src/source-business-workspace.test.ts src/retention.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; `tsc` prints nothing.

Run: `cd apps/merchant-studio && npx playwright test --config playwright.worktree.config.mjs tests/retention.spec.ts -g "merchant configures retention"`
Expected: PASS (1 test).

- [ ] **Step 6: Rebuild the embedded Studio and check it in the dashboard**

In `apps/merchant-dashboard/tests/merchant-workspace.spec.mjs`, in `'Comeback, campaigns and customers show distinct pages with the current font'`, after `await expect(frame.locator('.comeback-card')).toBeVisible();` (the first one) add:

```js
  // The welcome, reminder and review switches live only with their emails, in Correos y marketing › Correos.
  await expect(frame.locator('[name=welcomeEnabled], [name=recoveryEnabled], [name=recoveryHours], [name=reviewRequestsEnabled]')).toHaveCount(0);
```

Run:

```bash
cd apps/merchant-dashboard && pnpm run build:studio && npx playwright test --config playwright.worktree.config.mjs tests/merchant-workspace.spec.mjs -g "Comeback"
```

Expected: build `✓ built in …`; 1 test PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/merchant-studio/src/source-business-workspace.ts apps/merchant-studio/src/retention.ts apps/merchant-studio/src/source-business-workspace.test.ts apps/merchant-studio/src/retention.test.ts apps/merchant-studio/tests/retention.spec.ts apps/merchant-dashboard/tests/merchant-workspace.spec.mjs
git commit -m "feat(studio): Plantillas and Flujos leave the Studio and the Comeback form keeps only the card and the signup popup; their emails are set up in Correos y marketing"
```

---

### Task 9: Whole-branch verification

**Files:** none changed unless a check fails (fix in the owning task's files, commit as `fix(…): …`).

- [ ] **Step 1: API**

Run: `cd apps/api && npx jest src/email-workspace src/inbox src/payment-intents src/retention src/refunds src/shipping src/consumer src/commerce-platform src/store-emails --maxWorkers=2 && npx tsc -p tsconfig.json --noEmit`
Expected: PASS; `tsc` silent. (Do not widen this to `src/storefront-source`: 9 known pre-existing failures live there.)

- [ ] **Step 2: Dashboard**

Run: `cd apps/merchant-dashboard && npm run test:unit && npx playwright test --config playwright.worktree.config.mjs`
Expected: all unit tests and the whole browser suite PASS.

- [ ] **Step 3: Studio**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc -p tsconfig.json --noEmit && cd ../merchant-dashboard && pnpm run build:studio`
Expected: PASS; build succeeds.

- [ ] **Step 4: Leftovers**

Run:

```bash
git grep -n "orderEmailRoot\|settingsPanelEmails\|data-settings-tab=\"emails\"\|recordQueuedReceipt\|receiptSourceId\|receiptQueued\|data-marketing-tab=\"templates\"\|data-marketing-tab=\"flows\"" -- apps
git status --short
```

Expected: the grep prints nothing; `git status` shows nothing to commit apart from the untracked, excluded Playwright configs (not listed because of `info/exclude`).

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Correos tab replaces Plantillas and Flujos; one grouped list with switches; content panel below | 4, 6, 7 |
| Remitente label (id `domain`); Equipo, Registros, Campañas, Clientes, Códigos promocionales unchanged | 7 |
| Comeback Card holds only the card and signup popup | 8 |
| Designed editor for Confirmación de compra / Cita confirmada | 5, 6, 7 |
| Plain-text editor (enabled, subject, body, sample); Carrito abandonado wait time 1-168 h; same fields as today | 3, 4, 6 |
| Correos drawn natively; plain-text editor ported; Studio Plantillas/Flujos and Comeback email fields removed; Studio rebuilt | 6, 7, 8 |
| Ajustes: General, Marca, Envíos y retiro, Dominio web; Correos removed; General line linking to Correos | 7 |
| `ORDER_CONFIRMATION` never queues a buyer email, dropped from `EMAIL_TEMPLATES`; `NEW_ORDER` independent | 1 |
| `receiptQueued` no longer suppresses the designed receipt | 1 |
| Designed receipt: `from`, Reply-To, Message-ID with a verified domain; filed into the thread after send; `recordQueuedReceipt` removed; unchanged without a domain | 2 |
| Render failure sends the plain fallback; inbox filing best-effort | 2 (unchanged paths, kept by the edits) |
| Inbox domain notice opens marketing `domain` (Remitente) | 7 (`store-settings.spec.mjs`) |
| `pagosya:workspace` tab `templates` opens Correos; `openSettingsSection('emails')` → Correos y marketing › Correos | 7, 8 |
| "en Descuentos" → "en Códigos promocionales" | 5 |
| served-modules allow-list gains the new modules | 7 |
| Testing list (updated and new) | 1, 2, 3, 5, 6, 7, 8 |
