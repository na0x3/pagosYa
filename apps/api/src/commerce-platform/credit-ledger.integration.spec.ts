import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import {
  creditHash,
  creditQuote,
  ensureCreditReservation,
  finishCredit,
  refundCredit,
  reserveCredit,
} from "./credit-ledger";

/**
 * The store-credit ledger: gift cards and store credit spent at checkout.
 * commerce-platform had no test of any kind, and this is the file in it that
 * moves money.
 *
 * It is tested against a real database because its correctness is not in its
 * branching — it is in `SELECT ... FOR UPDATE`, which exists only inside a real
 * transaction. A mocked Prisma has no rows to lock and no concurrency to lose,
 * so it would agree that two shoppers can spend the same balance at once.
 *
 * The invariant every test here defends: a credit's balance plus everything
 * outstanding against it always equals what was issued. Money is neither
 * created nor destroyed by reserving, committing, releasing, retrying or
 * refunding.
 */

const harness = integrationDatabase("credit_ledger");

harness.describeDb("store credit ledger (real Postgres, real transactions)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  let db: PrismaClient;
  let storeId: string;
  let merchantId: string;
  let codeSeq = 0;
  const intents = new Map<string, string>();

  jest.setTimeout(120_000);

  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: "Comercio", email: `m-${harness.databaseName}@test.test` } });
    merchantId = merchant.id;
    const store = await db.store.create({ data: { merchantId, name: "Tienda", slug: `tienda-${harness.databaseName}` } });
    storeId = store.id;
  });

  afterAll(async () => {
    await harness.drop();
  });

  /**
   * A real PaymentIntent row per label: StoreCreditReservation.paymentIntentId
   * is a foreign key, so the ledger genuinely cannot hold a reservation against
   * an order that does not exist. Memoised so reserve/finish/refund in one test
   * all address the same order.
   */
  async function pi(label: string) {
    const existing = intents.get(label);
    if (existing) return existing;
    const created = await db.paymentIntent.create({
      data: { merchantId, amount: 1000, clientSecret: `cs_${label}_${harness.databaseName}` },
    });
    intents.set(label, created.id);
    return created.id;
  }

  /** A fresh gift card, so each test is independent of the others' spending. */
  async function giftCard(balance: number, overrides: Record<string, unknown> = {}) {
    const code = `GIFT-${(codeSeq += 1).toString().padStart(4, "0")}-${harness.databaseName.slice(-6)}`;
    const credit = await db.storeCredit.create({
      data: {
        storeId,
        codeHash: creditHash(code),
        reference: `ref-${codeSeq}`,
        label: "Tarjeta de regalo",
        currency: "BOB",
        issuedAmount: balance,
        balance,
        ...overrides,
      },
    });
    return { code, credit };
  }

  /** balance + outstanding reservations + committed-but-unrefunded = issued. */
  async function assertConserved(creditId: string) {
    const credit = await db.storeCredit.findUniqueOrThrow({ where: { id: creditId } });
    const reservations = await db.storeCreditReservation.findMany({ where: { creditId } });
    const held = reservations
      .filter((r) => r.status === "RESERVED" || r.status === "COMMITTED")
      .reduce((sum, r) => sum + r.amount - r.refundedAmount, 0);
    expect(credit.balance + held).toBe(credit.issuedAmount);
  }

  describe("reserving", () => {
    it("moves the amount out of the balance and records the entry", async () => {
      const { code, credit } = await giftCard(500);

      const intentId = await pi("res_1");
      const amount = await db.$transaction(async (tx) => reserveCredit(tx, intentId, storeId, code, "BOB", 300));

      expect(amount).toBe(300);
      const after = await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(after.balance).toBe(200);
      const entry = await db.storeCreditEntry.findUniqueOrThrow({ where: { reference: `reserve:${intentId}` } });
      expect(entry).toMatchObject({ delta: -300, kind: "RESERVE" });
      await assertConserved(credit.id);
    });

    it("never reserves more than the remaining balance", async () => {
      const { code, credit } = await giftCard(120);

      const amount = await db.$transaction(async (tx) => reserveCredit(tx, await pi("res_2"), storeId, code, "BOB", 400));

      expect(amount).toBe(120);
      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(0);
      await assertConserved(credit.id);
    });

    it("refuses a card in another currency, an expired card and an empty card", async () => {
      const other = await giftCard(100, { currency: "USD" });
      await expect(db.$transaction(async (tx) => reserveCredit(tx, await pi("cur"), storeId, other.code, "BOB", 50)))
        .rejects.toThrow(BadRequestException);

      const expired = await giftCard(100, { expiresAt: new Date(Date.now() - 60_000) });
      await expect(db.$transaction(async (tx) => reserveCredit(tx, await pi("exp"), storeId, expired.code, "BOB", 50)))
        .rejects.toThrow(BadRequestException);

      const spent = await giftCard(100);
      await db.storeCredit.update({ where: { id: spent.credit.id }, data: { balance: 0 } });
      await expect(db.$transaction(async (tx) => reserveCredit(tx, await pi("empty"), storeId, spent.code, "BOB", 50)))
        .rejects.toThrow(BadRequestException);
    });

    /**
     * Two shoppers — or one shopper who double-clicked — racing for a balance
     * that can only cover one of them.
     *
     * Note what actually holds the line here: CHECK (balance >= 0) on
     * StoreCredit. Removing the FOR UPDATE from reserveCredit does NOT make
     * this test fail, because the loser's decrement then violates the CHECK and
     * its transaction rolls back. The lock is defence in depth — it turns a
     * constraint violation into an orderly wait — so this is a regression test
     * of the invariant (a card never funds more than it holds), not proof that
     * the lock is doing the work. Still impossible against a mocked Prisma,
     * which has neither the constraint nor the concurrency.
     */
    it("does not let two concurrent reservations overdraw the same card", async () => {
      const { code, credit } = await giftCard(100);

      const results = await Promise.allSettled([
        db.$transaction(async (tx) => reserveCredit(tx, await pi("race_a"), storeId, code, "BOB", 100)),
        db.$transaction(async (tx) => reserveCredit(tx, await pi("race_b"), storeId, code, "BOB", 100)),
      ]);

      const granted = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
        .reduce((sum, r) => sum + r.value, 0);

      expect(granted).toBe(100);
      const after = await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } });
      expect(after.balance).toBe(0);
      expect(after.balance).toBeGreaterThanOrEqual(0);
      await assertConserved(credit.id);
    });
  });

  /**
   * These live only in the migration — schema.prisma cannot express a CHECK, so
   * `prisma migrate dev` will cheerfully offer to drop them. The balance check
   * is the one thing standing between a race and a card that funds more than it
   * holds, so if someone accepts that migration, this is what goes red.
   */
  describe("the constraints that exist only in the migration", () => {
    it("refuses to let a balance go negative", async () => {
      const { credit } = await giftCard(100);

      await expect(
        db.storeCredit.update({ where: { id: credit.id }, data: { balance: { decrement: 150 } } }),
      ).rejects.toThrow();

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(100);
    });

    it("refuses a card issued for nothing", async () => {
      await expect(giftCard(0)).rejects.toThrow();
    });
  });

  describe("finishing", () => {
    it("keeps the money on a successful payment", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ok"), storeId, code, "BOB", 200));

      await db.$transaction(async (tx) => finishCredit(tx, await pi("ok"), true));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(300);
      expect((await db.storeCreditReservation.findUniqueOrThrow({ where: { paymentIntentId: await pi("ok") } })).status).toBe("COMMITTED");
      await assertConserved(credit.id);
    });

    it("returns the money on a failed payment", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("fail"), storeId, code, "BOB", 200));

      await db.$transaction(async (tx) => finishCredit(tx, await pi("fail"), false));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(500);
      expect((await db.storeCreditReservation.findUniqueOrThrow({ where: { paymentIntentId: await pi("fail") } })).status).toBe("RELEASED");
      await assertConserved(credit.id);
    });

    /** Rails deliver the same terminal webhook more than once. */
    it("is idempotent when the same outcome arrives twice", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("twice"), storeId, code, "BOB", 200));

      await db.$transaction(async (tx) => finishCredit(tx, await pi("twice"), false));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("twice"), false));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(500);
      await assertConserved(credit.id);
    });

    it("will not commit a reservation it already released", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("flip"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("flip"), false));

      await db.$transaction(async (tx) => finishCredit(tx, await pi("flip"), true));

      expect((await db.storeCreditReservation.findUniqueOrThrow({ where: { paymentIntentId: await pi("flip") } })).status).toBe("RELEASED");
      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(500);
      await assertConserved(credit.id);
    });
  });

  describe("retrying a failed payment", () => {
    it("reacquires exactly the amount that was released", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("retry"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("retry"), false));

      await db.$transaction(async (tx) => ensureCreditReservation(tx, await pi("retry")));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(300);
      expect((await db.storeCreditReservation.findUniqueOrThrow({ where: { paymentIntentId: await pi("retry") } })).status).toBe("RESERVED");
      await assertConserved(credit.id);
    });

    it("is a no-op when the reservation is still held", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("held"), storeId, code, "BOB", 200));

      await db.$transaction(async (tx) => ensureCreditReservation(tx, await pi("held")));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(300);
      await assertConserved(credit.id);
    });

    it("refuses when the balance was spent elsewhere in the meantime", async () => {
      const { code, credit } = await giftCard(300);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("gone"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("gone"), false));
      // Someone else spends the card before the retry lands.
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("other"), storeId, code, "BOB", 300));

      await expect(db.$transaction(async (tx) => ensureCreditReservation(tx, await pi("gone"))))
        .rejects.toThrow(BadRequestException);

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(0);
      await assertConserved(credit.id);
    });

    it("refuses once the reservation has been committed", async () => {
      const { code } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("done"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("done"), true));

      await expect(db.$transaction(async (tx) => ensureCreditReservation(tx, await pi("done"))))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe("refunding", () => {
    it("returns the amount to the card and records it once", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ref"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("ref"), true));

      await db.$transaction(async (tx) => refundCredit(tx, await pi("ref"), 50, "refund_1"));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(350);
      await assertConserved(credit.id);
    });

    /** The same reference replayed must not pay out twice. */
    it("is idempotent for a repeated reference", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ref2"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("ref2"), true));

      await db.$transaction(async (tx) => refundCredit(tx, await pi("ref2"), 50, "refund_1"));
      await db.$transaction(async (tx) => refundCredit(tx, await pi("ref2"), 50, "refund_1"));

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(350);
      await assertConserved(credit.id);
    });

    it("refuses the same reference carrying a different amount", async () => {
      const { code } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ref3"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("ref3"), true));
      await db.$transaction(async (tx) => refundCredit(tx, await pi("ref3"), 50, "refund_1"));

      await expect(db.$transaction(async (tx) => refundCredit(tx, await pi("ref3"), 80, "refund_1")))
        .rejects.toThrow(BadRequestException);
    });

    it("never refunds more than was applied to the order", async () => {
      const { code, credit } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ref4"), storeId, code, "BOB", 200));
      await db.$transaction(async (tx) => finishCredit(tx, await pi("ref4"), true));

      await expect(db.$transaction(async (tx) => refundCredit(tx, await pi("ref4"), 201, "refund_big")))
        .rejects.toThrow(BadRequestException);

      await db.$transaction(async (tx) => refundCredit(tx, await pi("ref4"), 150, "refund_a"));
      await expect(db.$transaction(async (tx) => refundCredit(tx, await pi("ref4"), 51, "refund_b")))
        .rejects.toThrow(BadRequestException);

      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(450);
      await assertConserved(credit.id);
    });

    it("refuses a refund against a payment that never committed", async () => {
      const { code } = await giftCard(500);
      await db.$transaction(async (tx) => reserveCredit(tx, await pi("ref5"), storeId, code, "BOB", 200));

      await expect(db.$transaction(async (tx) => refundCredit(tx, await pi("ref5"), 50, "refund_1")))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe("quoting", () => {
    it("offers the lesser of the order total and the balance without spending it", async () => {
      const { code, credit } = await giftCard(80);

      const quote = await db.$transaction(async (tx) => creditQuote(tx, storeId, code, "BOB", 500));

      expect(quote.amount).toBe(80);
      expect((await db.storeCredit.findUniqueOrThrow({ where: { id: credit.id } })).balance).toBe(80);
    });

    it("ignores case, spaces and dashes in the code the shopper typed", async () => {
      const { code } = await giftCard(100);
      const typed = code.toLowerCase().replace(/-/g, " ");

      const quote = await db.$transaction(async (tx) => creditQuote(tx, storeId, typed, "BOB", 50));

      expect(quote.amount).toBe(50);
    });
  });
});
