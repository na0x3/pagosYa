import { PrismaClient } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { InboxService } from "./inbox.service";

/**
 * The ONE test in this feature that talks to a real database.
 *
 * Every other inbox test mocks Prisma with a hand-rolled fake, and that is
 * precisely how a runtime-fatal PrismaClientValidationError reached "done":
 * a fake object cannot reject a compound unique key containing null, cannot
 * enforce a CHECK constraint, cannot raise 22021 on a NUL byte and cannot
 * raise P2002 on a unique index. Every one of those is a real failure mode of
 * this feature, so they are exercised here against real Postgres with the real
 * migrations applied — not against a stand-in that agrees with whatever the
 * code happens to do.
 *
 * ── How to run ──────────────────────────────────────────────────────────────
 * Needs a reachable Postgres server. It does NOT touch your application
 * database: it CREATEs a throwaway database of its own, applies every
 * migration to it, and DROPs it afterwards.
 *
 *   # uses INBOX_IT_ADMIN_URL, else DATABASE_URL's server with the
 *   # "postgres" maintenance database
 *   npx jest src/inbox/inbox-persistence.integration.spec.ts
 *
 *   # or point it somewhere explicitly
 *   INBOX_IT_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx jest src/inbox/inbox-persistence.integration.spec.ts
 *
 * If no server answers, the suite SKIPS with a message rather than failing, so
 * it never turns a laptop without Postgres into a red build — but it also never
 * silently passes: a skip is visible in the runner's output.
 */

const harness = integrationDatabase("inbox");

harness.describeDb("inbox persistence (real Postgres, real migrations)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  let db: PrismaClient;
  let inbox: InboxService;
  let storeId: string;
  let merchantId: string;
  let leadId: string;
  let orderId: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    db = await harness.create();
    inbox = new InboxService(db as never);

    const merchant = await db.merchant.create({ data: { name: "Comercio", email: `m-${harness.databaseName}@test.test` } });
    merchantId = merchant.id;
    const store = await db.store.create({ data: { merchantId, name: "Tienda", slug: `tienda-${harness.databaseName}` } });
    storeId = store.id;
    // storeId is the only foreign key on StoreInboxThread; leadId and orderId
    // are plain nullable columns (see migration 20260922030000), so plain ids
    // exercise the constraints under test without dragging in the whole
    // lead/order/payment-intent fixture chain.
    leadId = `lead-${harness.databaseName}`;
    orderId = `order-${harness.databaseName}`;
  });

  afterAll(async () => {
    await harness.drop();
  });

  /**
   * Case 1 — the original Critical. Both of these threw
   * PrismaClientValidationError in production while 236 mocked tests stayed
   * green, because the compound unique key they used rejects null at runtime.
   * Nothing short of a real client can catch that.
   */
  describe("a lead thread and an order thread are two distinct rows, each created once", () => {
    it("persists one row per origin and returns the same row on a second call", async () => {
      const lead = { id: leadId, storeId, merchantId, customerEmail: "Ana@Gmail.test", customerName: "Ana", message: "¿Llega a Santa Cruz?" };
      const order = { id: orderId, storeId, merchantId, customerEmail: "ana@gmail.test", customerName: "Ana" };

      const leadThread = await inbox.threadForLead(lead);
      const orderThread = await inbox.threadForOrder(order);

      expect(leadThread.id).not.toBe(orderThread.id);
      expect(leadThread.leadId).toBe(leadId);
      expect(leadThread.orderId).toBeNull();
      expect(orderThread.orderId).toBe(orderId);
      expect(orderThread.leadId).toBeNull();

      // Second call: reuse, never a duplicate. This is what the shopper's
      // every later message and every later payment attempt does.
      const leadAgain = await inbox.threadForLead(lead);
      const orderAgain = await inbox.threadForOrder(order);

      expect(leadAgain.id).toBe(leadThread.id);
      expect(orderAgain.id).toBe(orderThread.id);
      expect(await db.storeInboxThread.count({ where: { storeId } })).toBe(2);
    });
  });

  /**
   * Case 2 — the drift alarm for I5. schema.prisma cannot express either of
   * these, so `prisma migrate dev` will offer to drop them. If someone accepts
   * that migration, these two assertions are what goes red.
   */
  describe("the constraints that live only in migration 20260922040000", () => {
    it("rejects a thread that belongs to neither a lead nor an order (CHECK one_origin)", async () => {
      await expect(db.storeInboxThread.create({
        data: { storeId, merchantId, subject: "Sin origen", customerEmail: "nadie@test.test", leadId: null, orderId: null },
      })).rejects.toThrow();
    });

    it("rejects a thread that claims both a lead and an order (CHECK one_origin)", async () => {
      await expect(db.storeInboxThread.create({
        data: { storeId, merchantId, subject: "Dos orígenes", customerEmail: "nadie@test.test", leadId, orderId },
      })).rejects.toThrow();
    });

    it("rejects a duplicate (storeId, customerEmail, leadId) via the partial unique index", async () => {
      // A plain @@unique over all four columns would NOT catch this, because
      // Postgres treats NULL as distinct from NULL and orderId is null here.
      await expect(db.storeInboxThread.create({
        data: { storeId, merchantId, subject: "Duplicado", customerEmail: "ana@gmail.test", leadId, orderId: null },
      })).rejects.toMatchObject({ code: "P2002" });
    });

    it("rejects a duplicate (storeId, customerEmail, orderId) via the partial unique index", async () => {
      await expect(db.storeInboxThread.create({
        data: { storeId, merchantId, subject: "Duplicado", customerEmail: "ana@gmail.test", leadId: null, orderId },
      })).rejects.toMatchObject({ code: "P2002" });
    });
  });

  /**
   * Case 3 — I2 and I3. Both of these made the webhook answer 500, and Svix
   * reads a 500 as "retry", so either one turns a single mail into a retry
   * storm against a public endpoint.
   */
  describe("recordInbound survives hostile and repeated deliveries", () => {
    it("does not throw on a body containing &#0;, which Postgres text rejects (22021)", async () => {
      const thread = await inbox.threadForLead({ id: leadId, storeId, merchantId, customerEmail: "ana@gmail.test", customerName: "Ana", message: null });

      await expect(inbox.recordInbound({
        threadId: thread.id, fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
        html: "&#0;", text: null, messageId: "nul-probe@gmail.test", inReplyTo: null, hadAttachments: false,
      })).resolves.toBeUndefined();

      const stored = await db.storeInboxMessage.findUnique({ where: { messageId: "nul-probe@gmail.test" } });
      expect(stored).not.toBeNull();
      expect(stored!.body).not.toContain("\u0000");
    });

    it("does not throw when the same messageId is delivered twice", async () => {
      const thread = await inbox.threadForLead({ id: leadId, storeId, merchantId, customerEmail: "ana@gmail.test", customerName: "Ana", message: null });
      const args = {
        threadId: thread.id, fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
        html: null, text: "mismo mensaje", messageId: "repeat@gmail.test", inReplyTo: null, hadAttachments: false,
      };

      await inbox.recordInbound(args);
      await expect(inbox.recordInbound(args)).resolves.toBeUndefined();

      expect(await db.storeInboxMessage.count({ where: { messageId: "repeat@gmail.test" } })).toBe(1);
    });
  });
});
