import { inflateSync } from "node:zlib";
import { createFinancesPdf, createOrdersPdf, createPayoutsPdf } from "./finance-pdfs";

/**
 * These three build the documents a merchant downloads from the dashboard.
 * `reports` had no tests, and the failure that matters here is not a wrong
 * number on the page — it is a throw, which reaches the merchant as a failed
 * download with no explanation. Empty result sets and null columns are the
 * ordinary cases that get there: a store with no payouts yet, a payment with
 * no customer name, a payout that has not been paid out.
 */

const PDF_MAGIC = "%PDF-";

function isPdf(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
}

/**
 * pdfkit Flate-compresses its content streams, so the drawn text is not
 * readable in the raw buffer. Inflate every stream, then pull the literals out
 * of the text-showing operators: pdfkit emits them as hex runs inside a TJ
 * array, separated by kerning offsets that are not part of the text.
 */
function text(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  let inflated = "";
  const pattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      inflated += inflateSync(Buffer.from(raw.slice(start, end), "latin1")).toString("latin1");
    } catch {
      // Not a Flate stream (fonts, images) — nothing to read here.
    }
  }

  const runs = inflated.match(/\[[^\]]*\]\s*TJ|<[0-9a-fA-F]+>\s*Tj/g) || [];
  return runs
    .map((run) =>
      (run.match(/<[0-9a-fA-F]+>/g) || [])
        .map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1"))
        .join(""),
    )
    .join("\n");
}

describe("finance PDFs", () => {
  describe("createOrdersPdf", () => {
    const order = {
      kind: "PAYMENT" as const,
      id: "pi_1",
      storeName: "Tienda",
      createdAt: new Date("2026-09-01T12:00:00Z"),
      status: "SUCCEEDED",
      paymentMethodType: "QR",
      customerName: "Ana",
      customerEmail: "ana@test.test",
      customerPhone: "+59170000000",
      description: "Pedido",
      itemsLabel: "2 x Café",
      amount: 12345,
      currency: "BOB",
    };

    it("produces a PDF for an ordinary payment", async () => {
      const pdf = await createOrdersPdf([order]);
      expect(isPdf(pdf)).toBe(true);
    });

    it("produces a PDF when there is nothing to report", async () => {
      const pdf = await createOrdersPdf([]);
      expect(isPdf(pdf)).toBe(true);
      expect(text(pdf)).toContain("Total de registros: 0");
    });

    /** Every one of these columns is nullable on the row type. */
    it("does not throw when the optional customer and store columns are null", async () => {
      const pdf = await createOrdersPdf([
        { ...order, storeName: null, customerName: null, customerEmail: null, customerPhone: null, description: null },
      ]);
      expect(isPdf(pdf)).toBe(true);
    });

    it("counts payments and leads separately", async () => {
      const pdf = await createOrdersPdf([order, { ...order, kind: "LEAD", id: "lead_1" }]);
      expect(text(pdf)).toContain("Pagos: 1");
      expect(text(pdf)).toContain("Interesados: 1");
    });

    /**
     * Amounts are cents. A total rendered 100x too large is worse than a
     * crash, because nobody notices.
     */
    it("renders amounts as currency, not as raw cents", async () => {
      const pdf = await createOrdersPdf([{ ...order, amount: 123456 }]);
      const body = text(pdf);
      expect(body).toContain("1.234,56 BOB");
      expect(body).not.toContain("123456 BOB");
    });

    it("only totals the payments, never the leads", async () => {
      const pdf = await createOrdersPdf([
        { ...order, amount: 10000 },
        { ...order, kind: "LEAD", id: "lead_1", amount: 99900 },
      ]);
      expect(text(pdf)).toContain("Monto total de pagos: 100,00 BOB");
    });
  });

  describe("createPayoutsPdf", () => {
    const payout = {
      id: "po_1",
      amount: 50000,
      currency: "BOB",
      bankAccount: "****1234",
      status: "PAID",
      paidOutAt: new Date("2026-09-02T12:00:00Z"),
      createdAt: new Date("2026-09-01T12:00:00Z"),
    };

    it("produces a PDF for an ordinary payout", async () => {
      expect(isPdf(await createPayoutsPdf([payout]))).toBe(true);
    });

    it("produces a PDF for a merchant with no payouts yet", async () => {
      const pdf = await createPayoutsPdf([]);
      expect(isPdf(pdf)).toBe(true);
      expect(text(pdf)).toContain("Total de desembolsos: 0");
    });

    /** A payout that has been requested but not yet paid has a null date. */
    it("does not throw on a payout that has not been paid out", async () => {
      expect(isPdf(await createPayoutsPdf([{ ...payout, paidOutAt: null, status: "PENDING" }]))).toBe(true);
    });
  });

  describe("createFinancesPdf", () => {
    const finances = {
      scope: { type: "STORE" as const, storeName: "Tienda" },
      currency: "BOB",
      totalRevenue: 250000,
      paymentCount: 12,
      unattributedRevenue: 0,
      unattributedPaymentCount: 0,
      inventoryValue: 90000,
      totalStoreViews: 340,
      revenueByPaymentMethod: [{ paymentMethodType: "QR", amount: 250000, paymentCount: 12 }],
      topProducts: [{ name: "Café", quantity: 20, revenue: 150000 }],
      monthlyProjection: { monthToDateRevenue: 250000, projectedRevenue: 500000, elapsedDays: 15, daysInMonth: 30 },
      bestSalesDay: { name: "viernes", paymentCount: 5 },
      salesByWeekday: [{ name: "viernes", paymentCount: 5, amount: 100000 }],
    };

    it("produces a PDF for a store with activity", async () => {
      expect(isPdf(await createFinancesPdf(finances))).toBe(true);
    });

    /** A brand-new store: every list empty, every total zero, no best day. */
    it("produces a PDF for a store that has sold nothing", async () => {
      expect(
        isPdf(
          await createFinancesPdf({
            ...finances,
            totalRevenue: 0,
            paymentCount: 0,
            inventoryValue: 0,
            totalStoreViews: 0,
            revenueByPaymentMethod: [],
            topProducts: [],
            monthlyProjection: { monthToDateRevenue: 0, projectedRevenue: 0, elapsedDays: 1, daysInMonth: 30 },
            bestSalesDay: null,
            salesByWeekday: [],
          }),
        ),
      ).toBe(true);
    });

    it("does not throw on a merchant-wide scope with no store name", async () => {
      expect(isPdf(await createFinancesPdf({ ...finances, scope: { type: "MERCHANT" } }))).toBe(true);
    });

    it("does not throw on a payment method that has no type recorded", async () => {
      expect(
        isPdf(await createFinancesPdf({ ...finances, revenueByPaymentMethod: [{ paymentMethodType: null, amount: 100, paymentCount: 1 }] })),
      ).toBe(true);
    });
  });
});
