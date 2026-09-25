import { businessDocumentLink, markBusinessDocumentPaid } from "./cobro-payment";

/** The frozen version 2 of the cobro: Bs 30,00. */
const frozen = { documentId: "cdoc1", version: 2, content: { totalAmount: 3000, currency: "BOB" } };

function tx(document: Record<string, unknown> | null, versions: Array<Record<string, any>> = [frozen]) {
  return {
    businessDocumentVersion: {
      findUnique: jest.fn(async ({ where }: any) => versions.find((row) => row.documentId === where.documentId_version.documentId && row.version === where.documentId_version.version) ?? null),
    },
    businessDocument: {
      findUnique: jest.fn().mockResolvedValue(document && { currentVersion: 2, ...document }),
      updateMany: jest.fn().mockImplementation(async ({ where }: any) => ({ count: document && where.status.in.includes(document.status) ? 1 : 0 })),
    },
    businessDocumentEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

const intent = (metadata: unknown, livemode = true) => ({ id: "pi_1", amount: 3000, currency: "BOB", livemode, metadata });
const linked = { storeId: "store_1", businessDocument: { documentId: "cdoc1", version: 2, numberLabel: "COB-0001" } };

describe("businessDocumentLink", () => {
  it("reads the document id and version, and ignores anything else", () => {
    expect(businessDocumentLink(linked)).toEqual({ documentId: "cdoc1", version: 2 });
    expect(businessDocumentLink({ businessDocument: { documentId: "cdoc1" } })).toEqual({ documentId: "cdoc1", version: null });
    for (const other of [null, "x", [], {}, { businessDocument: "cdoc1" }, { businessDocument: { documentId: 7 } }]) expect(businessDocumentLink(other)).toBeNull();
  });
});

describe("markBusinessDocumentPaid", () => {
  it.each(["SENT", "VIEWED", "OVERDUE"])("marks a %s cobro paid and records it once per payment", async (status) => {
    const db = tx({ id: "cdoc1", status });
    await markBusinessDocumentPaid(db as any, intent(linked));
    expect(db.businessDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "cdoc1", status: { in: ["SENT", "VIEWED", "OVERDUE"] }, currentVersion: 2 },
      data: { status: "PAID", paidAt: expect.any(Date), paymentIntentId: "pi_1" },
    });
    // skipDuplicates: a unique violation inside the payment transaction would roll back a captured payment.
    expect(db.businessDocumentEvent.createMany).toHaveBeenCalledWith({
      data: [{ documentId: "cdoc1", type: "paid", version: 2, dedupeKey: "paid:pi_1", data: { paymentIntentId: "pi_1", amount: 3000, currency: "BOB", livemode: true, statusBefore: status } }],
      skipDuplicates: true,
    });
  });

  it.each(["VOIDED", "PAID"])("records a payment for a %s cobro without changing it, so the merchant can refund", async (status) => {
    const db = tx({ id: "cdoc1", status });
    await markBusinessDocumentPaid(db as any, intent(linked));
    expect(db.businessDocumentEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ type: "payment_after_close", dedupeKey: "paid:pi_1", data: expect.objectContaining({ statusBefore: status }) })],
      skipDuplicates: true,
    }));
  });

  it("leaves the cobro open and records payment_mismatch when the payment was for an older version", async () => {
    // Version 1 was paid in a checkout still on screen while the merchant re-sent version 2.
    const db = tx({ id: "cdoc1", status: "VIEWED", currentVersion: 3 }, [frozen, { documentId: "cdoc1", version: 3, content: { totalAmount: 4500, currency: "BOB" } }]);
    await markBusinessDocumentPaid(db as any, intent(linked));
    expect(db.businessDocument.updateMany).not.toHaveBeenCalled();
    expect(db.businessDocumentEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: "payment_mismatch", version: 2, dedupeKey: "paid:pi_1", data: expect.objectContaining({ paymentIntentId: "pi_1", amount: 3000, currentVersion: 3, expectedAmount: 4500, expectedCurrency: "BOB" }) })],
      skipDuplicates: true,
    });
  });

  it.each([
    ["amount", { id: "pi_1", amount: 2999, currency: "BOB" }],
    ["currency", { id: "pi_1", amount: 3000, currency: "USD" }],
  ])("never marks paid when the %s differs from the frozen version", async (_field, paid) => {
    const db = tx({ id: "cdoc1", status: "SENT" });
    await markBusinessDocumentPaid(db as any, { ...intent(linked), ...paid });
    expect(db.businessDocument.updateMany).not.toHaveBeenCalled();
    expect(db.businessDocumentEvent.createMany.mock.calls[0][0].data[0].type).toBe("payment_mismatch");
  });

  it("treats a payment without a version as a mismatch", async () => {
    const db = tx({ id: "cdoc1", status: "SENT" });
    await markBusinessDocumentPaid(db as any, intent({ businessDocument: { documentId: "cdoc1" } }));
    expect(db.businessDocument.updateMany).not.toHaveBeenCalled();
    expect(db.businessDocumentEvent.createMany.mock.calls[0][0].data[0].type).toBe("payment_mismatch");
  });

  it("says when the payment was made in test mode", async () => {
    const db = tx({ id: "cdoc1", status: "SENT" });
    await markBusinessDocumentPaid(db as any, intent(linked, false));
    expect(db.businessDocumentEvent.createMany.mock.calls[0][0].data[0].data.livemode).toBe(false);
  });

  it("touches nothing for a payment that is not for a cobro, or for a missing document", async () => {
    const plain = tx({ id: "cdoc1", status: "SENT" });
    await markBusinessDocumentPaid(plain as any, intent({ storeId: "store_1", cart: [] }));
    expect(plain.businessDocument.findUnique).not.toHaveBeenCalled();
    const missing = tx(null);
    await markBusinessDocumentPaid(missing as any, intent(linked));
    expect(missing.businessDocument.updateMany).not.toHaveBeenCalled();
    expect(missing.businessDocumentEvent.createMany).not.toHaveBeenCalled();
  });
});
