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

  it("never waits for an old checkout another transaction holds: it opens a new one and leaves the old one alone", async () => {
    const { documents, cobros, prisma } = setup();
    const { id, token } = await sentCobro(documents);
    await cobros.pay(token);
    await documents.update("m_1", "store_1", id, { items: [{ description: "Boceto", quantity: 3, unitAmount: 1500 }] });
    await documents.send("m_1", "store_1", id, { email: false });
    prisma.lockedIntents.add("pi_1"); // being confirmed right now
    expect((await cobros.pay(token)).paymentIntentId).toBe("pi_2");
    expect(prisma.paymentIntents[0].status).toBe("REQUIRES_PAYMENT_METHOD");
    expect(prisma.rawQueries.some((sql) => /"PaymentIntent".*FOR UPDATE SKIP LOCKED/s.test(sql))).toBe(true);
  });

  it("cancels an old checkout only if it is still unstarted once locked", async () => {
    const { documents, cobros, prisma } = setup();
    const { id, token } = await sentCobro(documents);
    await cobros.pay(token);
    await documents.update("m_1", "store_1", id, { items: [{ description: "Boceto", quantity: 3, unitAmount: 1500 }] });
    await documents.send("m_1", "store_1", id, { email: false });
    // The customer's confirm committed between pay's read and its lock.
    prisma.onIntentLock = (intentId) => { prisma.paymentIntents.find((row) => row.id === intentId)!.status = "PROCESSING"; };
    await cobros.pay(token);
    expect(prisma.paymentIntents[0].status).toBe("PROCESSING");
  });

  it.each([
    ["a suspended merchant", (prisma: FakePrisma) => { prisma.merchants[0].status = "SUSPENDED"; }, /no está recibiendo pagos/],
    ["an archived store", (prisma: FakePrisma) => { prisma.stores[0].status = "ARCHIVED"; }, /tienda ya no está activa/],
  ])("refuses to take a payment for %s, with a message the customer understands", async (_case, change, message) => {
    const { documents, cobros, prisma, paymentIntents } = setup();
    const { token } = await sentCobro(documents);
    change(prisma);
    const refused = await cobros.pay(token).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ConflictException);
    expect((refused as Error).message).toMatch(message);
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
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

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("CobrosService — reminders and sharing", () => {
  it("emails a reminder with the PDF and records it", async () => {
    const { documents, cobros, prisma, email } = setup();
    const { id } = await sentCobro(documents);
    const result = await cobros.remind("m_1", "store_1", id, { channel: "email" });
    expect(result.emailed).toBe(true);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "ana@example.com",
      subject: "Recordatorio: Cobro COB-0001 de Estudio Illimani",
      replyTo: "hola@illimani.bo",
      attachments: [expect.objectContaining({ filename: "COB-0001.pdf", contentType: "application/pdf" })],
      failLoudly: true,
    }));
    expect(email.send.mock.calls[0][0].html).toContain("Ver y pagar");
    expect(prisma.events.filter((event) => event.type === "reminded")).toEqual([
      expect.objectContaining({ version: 1, data: { channel: "email", automatic: false, to: "ana@example.com" } }),
    ]);
  });

  it("waits six hours before another email reminder, and points to WhatsApp meanwhile", async () => {
    const { documents, cobros, email } = setup();
    const { id } = await sentCobro(documents);
    await cobros.remind("m_1", "store_1", id, { channel: "email" });
    const refused = await cobros.remind("m_1", "store_1", id, { channel: "email" }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ConflictException);
    expect((refused as Error).message).toMatch(/WhatsApp/);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("keeps reminder emails under the store's daily cap", async () => {
    const { documents, cobros, email } = setup({ "app.documentEmailsPerDay": 1 });
    const { id } = await sentCobro(documents);
    const other = await sentCobro(documents);
    await cobros.remind("m_1", "store_1", id, { channel: "email" });
    await expect(cobros.remind("m_1", "store_1", other.id, { channel: "email" })).rejects.toThrow(/límite/);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("records a WhatsApp reminder without emailing", async () => {
    const { documents, cobros, prisma, email } = setup();
    const { id } = await sentCobro(documents);
    await expect(cobros.remind("m_1", "store_1", id, { channel: "whatsapp" })).resolves.toEqual(expect.objectContaining({ emailed: false }));
    expect(email.send).not.toHaveBeenCalled();
    expect(prisma.events.find((event) => event.type === "reminded")!.data).toEqual({ channel: "whatsapp", automatic: false });
  });

  it("only reminds about a sent, unpaid cobro of the merchant's own store", async () => {
    const { documents, cobros, prisma } = setup();
    const draft = await documents.create("m_1", "store_1", invoice);
    await expect(cobros.remind("m_1", "store_1", draft.id, { channel: "whatsapp" })).rejects.toThrow(ConflictException);
    const { id } = await sentCobro(documents);
    prisma.documents.find((doc) => doc.id === id)!.status = "PAID";
    await expect(cobros.remind("m_1", "store_1", id, { channel: "whatsapp" })).rejects.toThrow(ConflictException);
    await expect(cobros.remind("m_2", "store_1", id, { channel: "whatsapp" })).rejects.toThrow(NotFoundException);
  });

  it("asks for an email address when the customer has none", async () => {
    const { documents, cobros } = setup();
    const { id } = await sentCobro(documents, { customerEmail: "" });
    await expect(cobros.remind("m_1", "store_1", id, { channel: "email" })).rejects.toThrow(/correo/);
  });

  it("records where the merchant shared the link", async () => {
    const { documents, cobros, prisma } = setup();
    const { id } = await sentCobro(documents);
    await cobros.shared("m_1", "store_1", id, { channel: "whatsapp" });
    expect(prisma.events.find((event) => event.type === "shared")).toEqual(expect.objectContaining({ version: 1, data: { channel: "whatsapp" } }));
    const draft = await documents.create("m_1", "store_1", invoice);
    await expect(cobros.shared("m_1", "store_1", draft.id, { channel: "link" })).rejects.toThrow(ConflictException);
  });
});

describe("CobrosService — customer suggestions", () => {
  it("merges the store's CRM, earlier cobros and paying buyers, without duplicates or other stores", async () => {
    const { documents, cobros, prisma } = setup();
    prisma.customers.push(
      { id: "cust_1", storeId: "store_1", name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: "4567890", updatedAt: new Date() },
      { id: "cust_2", storeId: "store_2", name: "Ajena", email: "ajena@example.com", phone: null, document: null, updatedAt: new Date() },
    );
    await documents.create("m_1", "store_1", { ...invoice, customerName: "Ana Quispe", customerEmail: "ANA@example.com" });
    await documents.create("m_1", "store_1", { ...invoice, customerName: "Beto Mamani", customerEmail: "", customerPhone: "71111111" });
    prisma.paymentIntents.push(
      { id: "pi_a", merchantId: "m_1", status: "SUCCEEDED", customerName: "Carla Rojas", customerEmail: "carla@example.com", customerPhone: null, customerDocument: null, metadata: { storeId: "store_1" }, createdAt: new Date() },
      { id: "pi_b", merchantId: "m_1", status: "SUCCEEDED", customerName: "De otra tienda", customerEmail: "otra@example.com", customerPhone: null, customerDocument: null, metadata: { storeId: "store_9" }, createdAt: new Date() },
      { id: "pi_c", merchantId: "m_1", status: "FAILED", customerName: "Fallida", customerEmail: "f@example.com", customerPhone: null, customerDocument: null, metadata: { storeId: "store_1" }, createdAt: new Date() },
    );
    const all = await cobros.customerSuggestions("m_1", "store_1");
    expect(all).toEqual([
      { businessCustomerId: "cust_1", name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: "4567890", source: "crm" },
      expect.objectContaining({ businessCustomerId: null, name: "Beto Mamani", phone: "71111111", source: "cobro" }),
      expect.objectContaining({ name: "Carla Rojas", email: "carla@example.com", source: "buyer" }),
    ]);
    expect(await cobros.customerSuggestions("m_1", "store_1", "carl")).toEqual([expect.objectContaining({ name: "Carla Rojas" })]);
    await expect(cobros.customerSuggestions("m_2", "store_1")).rejects.toThrow(NotFoundException);
  });
});

describe("CobrosService — maintenance (overdue and automatic reminders)", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  async function cobroDue(setupResult: ReturnType<typeof setup>, dueAt: Date, sentAt: Date, extra: Record<string, unknown> = {}, shared = true) {
    const { id } = await sentCobro(setupResult.documents, extra);
    const row = setupResult.prisma.documents.find((doc) => doc.id === id)!;
    Object.assign(row, { dueAt, sentAt });
    // The merchant shared the link (Crear cobro alone only freezes it).
    if (shared) await setupResult.cobros.shared("m_1", "store_1", id, { channel: "whatsapp" });
    return row;
  }

  it("never reminds automatically about a cobro nobody shared yet", async () => {
    const context = setup();
    await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY), {}, false);
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(0);
    expect(context.email.send).not.toHaveBeenCalled();
  });

  it.each(["emailed", "viewed"])("reminds once the cobro was %s, even without a share from the dashboard", async (type) => {
    const context = setup();
    const row = await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY), {}, false);
    context.prisma.events.push({ id: `e_${type}`, documentId: row.id, type, version: 1, at: new Date(now.getTime() - 2 * DAY), data: {} });
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(1);
  });

  it("waits out the 6-hour cooldown after a manual email reminder, then sends while its window is open", async () => {
    const context = setup();
    const row = await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY));
    context.prisma.events.push({ id: "e_manual", documentId: row.id, type: "reminded", version: 1, at: new Date(now.getTime() - 2 * HOUR), data: { channel: "email", automatic: false } });
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(0);
    expect(context.email.send).not.toHaveBeenCalled();
    expect(context.prisma.events.some((event) => event.dedupeKey === "reminder:due:v1")).toBe(false);
    // A WhatsApp reminder does not count toward the email cooldown.
    context.prisma.events.find((event) => event.id === "e_manual")!.data = { channel: "whatsapp", automatic: false };
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(1);
  });

  it("marks sent and viewed cobros overdue once their date passed, once per version", async () => {
    const context = setup();
    const late = await cobroDue(context, new Date(now.getTime() - HOUR), new Date(now.getTime() - 5 * DAY));
    const viewed = await cobroDue(context, new Date(now.getTime() - DAY), new Date(now.getTime() - 5 * DAY));
    viewed.status = "VIEWED";
    const future = await cobroDue(context, new Date(now.getTime() + DAY), new Date(now.getTime() - 5 * DAY));
    const paid = await cobroDue(context, new Date(now.getTime() - DAY), new Date(now.getTime() - 5 * DAY));
    paid.status = "PAID";
    const voided = await cobroDue(context, new Date(now.getTime() - DAY), new Date(now.getTime() - 5 * DAY));
    voided.status = "VOIDED";
    const first = await context.cobros.runMaintenance(now);
    expect(first.overdue).toBe(2);
    expect([late.status, viewed.status, future.status, paid.status, voided.status]).toEqual(["OVERDUE", "OVERDUE", "SENT", "PAID", "VOIDED"]);
    await context.cobros.runMaintenance(now);
    expect(context.prisma.events.filter((event) => event.type === "overdue").map((event) => event.dedupeKey)).toEqual(["overdue:v1", "overdue:v1"]);
  });

  it("never marks a proposal overdue", async () => {
    const context = setup();
    const proposal = await context.documents.create("m_1", "store_1", { ...invoice, kind: "PROPOSAL" });
    await context.documents.send("m_1", "store_1", proposal.id, { email: false });
    Object.assign(context.prisma.documents[0], { dueAt: new Date(now.getTime() - DAY) });
    expect((await context.cobros.runMaintenance(now)).overdue).toBe(0);
  });

  it("reminds on the due day once, only when the cobro was sent at least a day earlier", async () => {
    const context = setup();
    const dueTonight = new Date(now.getTime() + 8 * HOUR);
    await cobroDue(context, dueTonight, new Date(now.getTime() - 3 * DAY));
    await cobroDue(context, dueTonight, new Date(now.getTime() - 2 * HOUR)); // just sent: no reminder
    await cobroDue(context, new Date(now.getTime() + 20 * HOUR), new Date(now.getTime() - 3 * DAY)); // due tomorrow
    const result = await context.cobros.runMaintenance(now);
    expect(result.reminders).toBe(1);
    expect(context.email.send).toHaveBeenCalledTimes(1);
    expect(context.email.send.mock.calls[0][0].subject).toMatch(/^Recordatorio/);
    expect(context.email.send.mock.calls[0][0].html).toContain("vence hoy");
    await context.cobros.runMaintenance(now);
    expect(context.email.send).toHaveBeenCalledTimes(1);
    expect(context.prisma.events.filter((event) => event.type === "reminded")).toEqual([
      expect.objectContaining({ dedupeKey: "reminder:due:v1", data: expect.objectContaining({ channel: "email", automatic: true, stage: "due" }) }),
    ]);
  });

  it("reminds three days after the due date, once, and stops after ten", async () => {
    const context = setup();
    await cobroDue(context, new Date(now.getTime() - 3 * DAY - HOUR), new Date(now.getTime() - 9 * DAY));
    await cobroDue(context, new Date(now.getTime() - 2 * DAY), new Date(now.getTime() - 9 * DAY)); // too early
    await cobroDue(context, new Date(now.getTime() - 11 * DAY), new Date(now.getTime() - 20 * DAY)); // too late
    const result = await context.cobros.runMaintenance(now);
    expect(result.reminders).toBe(1);
    expect(context.email.send.mock.calls[0][0].html).toContain("venció");
    await context.cobros.runMaintenance(now);
    expect(context.email.send).toHaveBeenCalledTimes(1);
  });

  it("skips cobros with reminders off or no customer email", async () => {
    const context = setup();
    await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY), { autoReminders: false });
    await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY), { customerEmail: "" });
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(0);
    expect(context.email.send).not.toHaveBeenCalled();
  });

  it("leaves a reminder for the next run when the store reached its email cap", async () => {
    const context = setup({ "app.documentEmailsPerDay": 1 });
    const row = await cobroDue(context, new Date(now.getTime() + 8 * HOUR), new Date(now.getTime() - 3 * DAY));
    context.prisma.events.push({ id: "e_cap", documentId: row.id, type: "emailed", at: new Date(), data: {} });
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(0);
    expect(context.prisma.events.some((event) => event.type === "reminded")).toBe(false);
    context.prisma.events = context.prisma.events.filter((event) => event.id !== "e_cap");
    expect((await context.cobros.runMaintenance(now)).reminders).toBe(1);
  });
});

describe("CobrosService — marcar como pagado and the reminders switch", () => {
  const now = new Date("2026-10-10T15:00:00Z");

  it("marks an open cobro paid by hand with the method and note, closes its unstarted checkout and stops reminders", async () => {
    const { documents, cobros, prisma, email } = setup();
    const { id, token } = await sentCobro(documents);
    await cobros.pay(token);
    const result = await cobros.markPaid("m_1", "store_1", id, { method: "transfer", reference: "Transferencia BNB 123" });
    expect(result).toEqual(expect.objectContaining({ id, status: "PAID", paidAt: expect.any(Date) }));
    expect(prisma.events.find((event) => event.type === "paid_manually")).toEqual(expect.objectContaining({ version: 1, data: { method: "transfer", reference: "Transferencia BNB 123" } }));
    expect(prisma.paymentIntents[0].status).toBe("CANCELED");
    // A paid cobro is never reminded again.
    Object.assign(prisma.documents[0], { dueAt: new Date(now.getTime() + 8 * 3600_000), sentAt: new Date(now.getTime() - 3 * 86_400_000) });
    await cobros.shared("m_1", "store_1", id, { channel: "whatsapp" }).catch(() => undefined);
    expect((await cobros.runMaintenance(now)).reminders).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("refuses a draft, a paid, a voided cobro and another merchant's", async () => {
    const { documents, cobros, prisma } = setup();
    const draft = await documents.create("m_1", "store_1", invoice);
    await expect(cobros.markPaid("m_1", "store_1", draft.id, { method: "cash" })).rejects.toThrow(ConflictException);
    const { id } = await sentCobro(documents);
    await expect(cobros.markPaid("m_2", "store_1", id, { method: "cash" })).rejects.toThrow(NotFoundException);
    for (const status of ["PAID", "VOIDED"]) {
      prisma.documents.find((doc) => doc.id === id)!.status = status;
      await expect(cobros.markPaid("m_1", "store_1", id, { method: "cash" })).rejects.toThrow(ConflictException);
    }
  });

  it("turns automatic reminders off and back on after creation, and records it", async () => {
    const { documents, cobros, prisma } = setup();
    const { id } = await sentCobro(documents);
    await expect(cobros.setAutoReminders("m_1", "store_1", id, { autoReminders: false })).resolves.toEqual(expect.objectContaining({ autoReminders: false }));
    expect(prisma.documents[0].autoReminders).toBe(false);
    await cobros.setAutoReminders("m_1", "store_1", id, { autoReminders: true });
    expect(prisma.documents[0].autoReminders).toBe(true);
    expect(prisma.events.filter((event) => event.type.startsWith("reminders_")).map((event) => event.type)).toEqual(["reminders_off", "reminders_on"]);
    prisma.documents[0].status = "PAID";
    await expect(cobros.setAutoReminders("m_1", "store_1", id, { autoReminders: false })).rejects.toThrow(ConflictException);
  });
});

describe("CobrosService — summary", () => {
  it("counts and sums every cobro of the store per currency — not a page — with overdue computed from the due date", async () => {
    const { documents, cobros, prisma } = setup();
    for (let index = 0; index < 105; index += 1) await sentCobro(documents); // Bs 30,00 each, open
    const late = await sentCobro(documents);
    Object.assign(prisma.documents.find((doc) => doc.id === late.id)!, { dueAt: new Date(Date.now() - 3600_000) }); // worker not run yet
    await sentCobro(documents, { currency: "USD" });
    const paid = await sentCobro(documents);
    await cobros.markPaid("m_1", "store_1", paid.id, { method: "cash" });
    await documents.create("m_1", "store_1", invoice); // a draft
    const voided = await sentCobro(documents);
    await documents.void("m_1", "store_1", voided.id, {});
    const summary = await cobros.summary("m_1", "store_1");
    expect(summary.counts).toEqual({ all: 110, draft: 1, open: 107, overdue: 1, paid: 1, voided: 1 });
    expect(summary.totals).toEqual([
      { currency: "BOB", owed: 106 * 3000, overdue: 3000, collected: 3000, testCollected: 0 },
      { currency: "USD", owed: 3000, overdue: 0, collected: 0, testCollected: 0 },
    ]);
    expect(summary.testMode).toBe(false);
    await expect(cobros.summary("m_2", "store_1")).rejects.toThrow(NotFoundException);
  });

  it("keeps test payments out of Cobrado, and says payments are tests while the merchant is not verified", async () => {
    const { documents, cobros, prisma } = setup();
    prisma.merchants[0].status = "PENDING";
    const test = await sentCobro(documents);
    Object.assign(prisma.documents.find((doc) => doc.id === test.id)!, { status: "PAID", paidAt: new Date() });
    prisma.events.push({ id: "p_test", documentId: test.id, type: "paid", at: new Date(), data: { livemode: false } });
    const summary = await cobros.summary("m_1", "store_1");
    expect(summary.testMode).toBe(true);
    expect(summary.merchantStatus).toBe("PENDING");
    expect(summary.totals).toEqual([{ currency: "BOB", owed: 0, overdue: 0, collected: 0, testCollected: 3000 }]);
  });

  it("lists the payments to refund or reconcile from the last 30 days", async () => {
    const { documents, cobros, prisma } = setup();
    const voided = await sentCobro(documents);
    await documents.void("m_1", "store_1", voided.id, {});
    const mismatch = await sentCobro(documents);
    prisma.events.push(
      { id: "p_after", documentId: voided.id, type: "payment_after_close", at: new Date(), data: { amount: 3000, currency: "BOB", statusBefore: "VOIDED" } },
      { id: "p_mis", documentId: mismatch.id, type: "payment_mismatch", at: new Date(), data: { amount: 1500, currency: "BOB" } },
      { id: "p_old", documentId: mismatch.id, type: "payment_after_close", at: new Date(Date.now() - 40 * 86_400_000), data: {} },
    );
    const { attention } = await cobros.summary("m_1", "store_1");
    expect(attention).toEqual(expect.arrayContaining([
      { documentId: voided.id, numberLabel: "COB-0001", type: "payment_after_close", statusBefore: "VOIDED", amount: 3000, currency: "BOB", at: expect.any(Date) },
      { documentId: mismatch.id, numberLabel: "COB-0002", type: "payment_mismatch", statusBefore: null, amount: 1500, currency: "BOB", at: expect.any(Date) },
    ]));
    expect(attention).toHaveLength(2);
  });
});
