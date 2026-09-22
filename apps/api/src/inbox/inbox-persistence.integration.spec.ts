import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
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

const MIGRATIONS_DIR = join(__dirname, "..", "..", "prisma", "migrations");
const DB_NAME = `pagosya_inbox_it_${process.pid}_${Date.now().toString(36)}`;

function adminUrl(): string | null {
  if (process.env.INBOX_IT_ADMIN_URL) return process.env.INBOX_IT_ADMIN_URL;
  let raw = process.env.DATABASE_URL;
  if (!raw) {
    // The app reads .env through ConfigModule, which jest does not load.
    const envFile = join(__dirname, "..", "..", ".env");
    if (!existsSync(envFile)) return null;
    raw = readFileSync(envFile, "utf8").split("\n")
      .find((line) => line.startsWith("DATABASE_URL="))
      ?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Same server, maintenance database — never the application's own.
    url.pathname = "/postgres";
    url.search = "";
    return url.href;
  } catch {
    return null;
  }
}

function reachable(url: string): boolean {
  try {
    const { host, port } = new URL(url);
    execSync(
      `node -e "const n=require('net'),s=n.connect(${port || 5432},'${host.split(":")[0]}');s.setTimeout(2000);s.on('connect',()=>{s.destroy();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))"`,
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the real migration files in order. Splitting on ";" is safe for this
 * repo specifically: no migration uses dollar-quoting, a DO block, or a
 * semicolon inside a string literal. If one ever does, this is the line to fix.
 */
function statements(sql: string): string[] {
  return sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
}

const ADMIN_URL = adminUrl();
const AVAILABLE = Boolean(ADMIN_URL) && reachable(ADMIN_URL!);
const IN_CI = Boolean(process.env.CI);
const UNAVAILABLE_MESSAGE =
  "No reachable Postgres for the inbox integration test. Set INBOX_IT_ADMIN_URL " +
  "(or DATABASE_URL) to a server where this test may CREATE and DROP a throwaway database.";

/**
 * On a developer laptop with no database this skips, so a missing Postgres does
 * not turn every local run red. In CI it must NOT skip: a skipped suite exits 0,
 * and a build box without a database would then report success for the one test
 * that exists specifically because the mocked ones cannot catch these failures.
 * So CI gets a failing test instead of a quiet green.
 */
const describeDb = AVAILABLE || IN_CI ? describe : describe.skip;

if (!AVAILABLE && !IN_CI) {
  // Visible in the runner's output; not a silent omission.
  // eslint-disable-next-line no-console
  console.warn(`[inbox integration] SKIPPED — ${UNAVAILABLE_MESSAGE}`);
}

describeDb("inbox persistence (real Postgres, real migrations)", () => {
  if (!AVAILABLE) {
    // Only reachable when CI is set, because otherwise the suite is skipped.
    it("requires a database in CI", () => {
      throw new Error(`${UNAVAILABLE_MESSAGE} Refusing to report success in CI (CI=${process.env.CI}).`);
    });
    return;
  }

  const testUrl = (() => {
    if (!ADMIN_URL) return "";
    const url = new URL(ADMIN_URL);
    url.pathname = `/${DB_NAME}`;
    url.search = "?schema=public";
    return url.href;
  })();

  let db: PrismaClient;
  let inbox: InboxService;
  let storeId: string;
  let merchantId: string;
  let leadId: string;
  let orderId: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL! } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    await admin.$disconnect();

    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const names = readdirSync(MIGRATIONS_DIR)
      .filter((name) => existsSync(join(MIGRATIONS_DIR, name, "migration.sql")))
      .sort();
    for (const name of names) {
      for (const statement of statements(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"))) {
        await db.$executeRawUnsafe(statement);
      }
    }

    inbox = new InboxService(db as never);

    const merchant = await db.merchant.create({ data: { name: "Comercio", email: `m-${DB_NAME}@test.test` } });
    merchantId = merchant.id;
    const store = await db.store.create({ data: { merchantId, name: "Tienda", slug: `tienda-${DB_NAME}` } });
    storeId = store.id;
    // storeId is the only foreign key on StoreInboxThread; leadId and orderId
    // are plain nullable columns (see migration 20260922030000), so plain ids
    // exercise the constraints under test without dragging in the whole
    // lead/order/payment-intent fixture chain.
    leadId = `lead-${DB_NAME}`;
    orderId = `order-${DB_NAME}`;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
    if (!ADMIN_URL) return;
    const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    await admin.$disconnect();
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
