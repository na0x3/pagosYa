import { businessDocumentLink, markBusinessDocumentPaid } from "./cobro-payment";

function tx(document: Record<string, unknown> | null) {
  return {
    businessDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
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
      where: { id: "cdoc1", status: { in: ["SENT", "VIEWED", "OVERDUE"] } },
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
