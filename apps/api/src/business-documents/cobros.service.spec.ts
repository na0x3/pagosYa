import { ConflictException, NotFoundException } from "@nestjs/common";
import { BusinessDocumentsService } from "./business-documents.service";
import { CobrosService } from "./cobros.service";
import { FakePrisma, type Row } from "./testing/fake-document-prisma";

const SECRET = "test-document-link-secret-with-at-least-32-chars";

function setup(config: Record<string, unknown> = {}) {
  const prisma = new FakePrisma();
  prisma.stores.push(
    { id: "store_1", merchantId: "m_1", name: "Estudio Illimani", status: "ACTIVE", logoUrl: null, contactEmail: "hola@illimani.bo", contactPhone: null },
    { id: "store_2", merchantId: "m_2", name: "Otra tienda", status: "ACTIVE", logoUrl: null, contactEmail: null, contactPhone: null },
  );
  prisma.merchants.push({ id: "m_1", status: "ACTIVE" }, { id: "m_2", status: "ACTIVE" });
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const values: Record<string, unknown> = { "app.documentLinkSecret": SECRET, "app.checkoutOrigin": "https://pay.example/", ...config };
  const settings = { get: (key: string) => values[key] };
  const documents = new BusinessDocumentsService(prisma as any, settings as any, email as any);
  let created = 0;
  const paymentIntents = {
    createInTransaction: jest.fn(async (tx: FakePrisma, merchantId: string, livemode: boolean, dto: Row, audience: string) => {
      created += 1;
      const intent = { id: `pi_${created}`, clientSecret: `pi_${created}_secret_abc`, status: "REQUIRES_PAYMENT_METHOD", merchantId, livemode, audience, ...dto };
      tx.paymentIntents.push(intent);
      return { ...intent };
    }),
  };
  const cobros = new CobrosService(prisma as any, settings as any, email as any, paymentIntents as any, documents);
  return { prisma, email, documents, cobros, paymentIntents };
}

const invoice = {
  kind: "INVOICE" as const,
  title: "Diseño de logo",
  customerName: "Ana Quispe",
  customerEmail: "ana@example.com",
  customerPhone: "70000000",
  customerDocument: "4567890",
  items: [{ description: "Boceto", quantity: 2, unitAmount: 1500 }],
};

async function sentCobro(documents: BusinessDocumentsService, extra: Record<string, unknown> = {}) {
  const doc = await documents.create("m_1", "store_1", { ...invoice, ...extra });
  const result = await documents.send("m_1", "store_1", doc.id, { email: false });
  return { id: doc.id, token: result.publicUrl.split("/d/")[1] };
}

describe("CobrosService — pay", () => {
  it("charges the frozen total of the latest sent version, never the working copy", async () => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { id, token } = await sentCobro(documents);
    // An unsent edit must not change what the customer pays.
    await documents.update("m_1", "store_1", id, { items: [{ description: "Boceto", quantity: 9, unitAmount: 1500 }] });
    const result = await cobros.pay(token);
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(prisma, "m_1", true, {
      amount: 3000,
      currency: "BOB",
      description: "COB-0001 · Diseño de logo · Estudio Illimani",
      customerName: "Ana Quispe",
      customerEmail: "ana@example.com",
      customerPhone: "70000000",
      customerDocument: "4567890",
      metadata: { storeId: "store_1", businessDocument: { documentId: id, version: 1, numberLabel: "COB-0001" } },
    }, "buyer");
    expect(result).toEqual({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret_abc", checkoutUrl: "https://pay.example/#client_secret=pi_1_secret_abc" });
    expect(prisma.documents[0].paymentIntentId).toBe("pi_1");
    expect(prisma.events.filter((event) => event.type === "checkout_started")).toEqual([expect.objectContaining({ version: 1, data: { paymentIntentId: "pi_1" } })]);
    // Two taps on Pagar at once are serialized on the document row.
    expect(prisma.rawQueries.some((sql) => /FOR UPDATE/.test(sql))).toBe(true);
  });

  it("reuses the open checkout when the customer taps Pagar again", async () => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { token } = await sentCobro(documents);
    const first = await cobros.pay(token);
    const second = await cobros.pay(token);
    expect(second.clientSecret).toBe(first.clientSecret);
    expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.events.filter((event) => event.type === "checkout_started")).toHaveLength(1);
  });

  it("opens a new checkout for a re-sent change and closes the old one the customer never started", async () => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { id, token } = await sentCobro(documents);
    await cobros.pay(token);
    await documents.update("m_1", "store_1", id, { items: [{ description: "Boceto", quantity: 3, unitAmount: 1500 }] });
    await documents.send("m_1", "store_1", id, { email: false });
    const next = await cobros.pay(token);
    expect(next.paymentIntentId).toBe("pi_2");
    expect(paymentIntents.createInTransaction.mock.calls[1][3]).toEqual(expect.objectContaining({ amount: 4500, metadata: expect.objectContaining({ businessDocument: expect.objectContaining({ version: 2 }) }) }));
    expect(prisma.paymentIntents.find((intent) => intent.id === "pi_1")!.status).toBe("CANCELED");
  });

  it("replaces a failed checkout, and leaves one in progress to finish", async () => {
    const { documents, cobros, prisma } = setup();
    const { id, token } = await sentCobro(documents);
    await cobros.pay(token);
    prisma.paymentIntents[0].status = "FAILED";
    expect((await cobros.pay(token)).paymentIntentId).toBe("pi_2");
    expect(prisma.paymentIntents[0].status).toBe("CANCELED");

    prisma.paymentIntents[1].status = "REQUIRES_ACTION";
    await documents.update("m_1", "store_1", id, { items: [{ description: "Boceto", quantity: 1, unitAmount: 1500 }] });
    await documents.send("m_1", "store_1", id, { email: false });
    expect((await cobros.pay(token)).paymentIntentId).toBe("pi_3");
    expect(prisma.paymentIntents[1].status).toBe("REQUIRES_ACTION");
  });

  it("uses test mode while the merchant or the store is not active", async () => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    prisma.merchants[0].status = "PENDING_REVIEW";
    const { token } = await sentCobro(documents);
    await cobros.pay(token);
    expect(paymentIntents.createInTransaction.mock.calls[0][2]).toBe(false);
  });

  it("still takes payment for an overdue cobro", async () => {
    const { documents, cobros, prisma } = setup();
    const { token } = await sentCobro(documents);
    prisma.documents[0].status = "OVERDUE";
    await expect(cobros.pay(token)).resolves.toEqual(expect.objectContaining({ paymentIntentId: "pi_1" }));
  });

  it.each([
    ["VOIDED", /anulado/],
    ["PAID", /ya está pagado/],
    ["EXPIRED", /venció/],
  ])("refuses a %s cobro", async (status, message) => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { token } = await sentCobro(documents);
    prisma.documents[0].status = status;
    const refused = await cobros.pay(token).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ConflictException);
    expect((refused as Error).message).toMatch(message);
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("never charges twice once a checkout succeeded", async () => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { token } = await sentCobro(documents);
    await cobros.pay(token);
    prisma.paymentIntents[0].status = "SUCCEEDED";
    await expect(cobros.pay(token)).rejects.toThrow(/ya está pagado/);
    expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
  });

  it("404s a bad token, a draft and a proposal", async () => {
    const { documents, cobros } = setup();
    const draft = await documents.create("m_1", "store_1", invoice);
    const proposal = await documents.create("m_1", "store_1", { ...invoice, kind: "PROPOSAL" });
    const sentProposal = await documents.send("m_1", "store_1", proposal.id, { email: false });
    await expect(cobros.pay("nope")).rejects.toThrow(NotFoundException);
    await expect(cobros.pay(documents.publicUrl(draft.id).split("/d/")[1])).rejects.toThrow(NotFoundException);
    await expect(cobros.pay(sentProposal.publicUrl.split("/d/")[1])).rejects.toThrow(NotFoundException);
  });
});
