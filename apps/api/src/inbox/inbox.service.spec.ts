import { InboxService } from "./inbox.service";

function fakeDb() {
  return {
    storeInboxThread: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    storeInboxMessage: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
}

describe("InboxService.resolveInboundThread", () => {
  it("follows In-Reply-To to the thread that sent that message", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue({ threadId: "thread-1" });
    db.storeInboxThread.findUnique.mockResolvedValue({ id: "thread-1", storeId: "store-1" });

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: "<sent-1@pagosya>", references: null }, "ana@gmail.test",
    );

    expect(thread).toEqual({ id: "thread-1", storeId: "store-1" });
    expect(db.storeInboxMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { messageId: { in: ["sent-1@pagosya"] } } }),
    );
  });

  it("falls back to the sender's most recent open thread when headers are missing", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue(null);
    db.storeInboxThread.findFirst.mockResolvedValue({ id: "thread-2", storeId: "store-1" });

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: null, references: null }, "ANA@gmail.test",
    );

    expect(thread).toEqual({ id: "thread-2", storeId: "store-1" });
    expect(db.storeInboxThread.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", customerEmail: "ana@gmail.test", status: "OPEN" },
      orderBy: { lastMessageAt: "desc" },
    }));
  });

  it("returns null for a sender with no thread, so the message is dropped", async () => {
    const db = fakeDb();
    db.storeInboxMessage.findFirst.mockResolvedValue(null);
    db.storeInboxThread.findFirst.mockResolvedValue(null);

    const thread = await new InboxService(db as any).resolveInboundThread(
      "store-1", { inReplyTo: null, references: null }, "spam@nowhere.test",
    );

    expect(thread).toBeNull();
  });
});

describe("InboxService.recordInbound", () => {
  it("stores the flattened text and marks the thread unread", async () => {
    const db = fakeDb();
    await new InboxService(db as any).recordInbound({
      threadId: "thread-1", fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
      html: "<p>¿Llega a Santa Cruz?</p>", text: null, messageId: "in-1", inReplyTo: "sent-1",
      hadAttachments: false,
    });

    expect(db.storeInboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      threadId: "thread-1", direction: "INBOUND", body: "¿Llega a Santa Cruz?",
    }) });
    expect(db.storeInboxThread.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "thread-1" },
      data: expect.objectContaining({ unreadForMerchant: true }),
    }));
  });

  it("prefers the plain-text part when the message carries both", async () => {
    const db = fakeDb();
    await new InboxService(db as any).recordInbound({
      threadId: "thread-1", fromEmail: "ana@gmail.test", toEmail: "hola@inbound.tienda.test",
      html: "<p>version html</p>", text: "version texto", messageId: "in-2", inReplyTo: null,
      hadAttachments: true,
    });

    const data = db.storeInboxMessage.create.mock.calls[0][0].data;
    expect(data.body).toBe("version texto");
    expect(data.hadAttachments).toBe(true);
  });
});

describe("InboxService.threadForLead", () => {
  it("opens one thread per lead and reuses it on a repeat call", async () => {
    const db = fakeDb();
    db.storeInboxThread.upsert.mockResolvedValue({ id: "thread-1" });

    const thread = await new InboxService(db as any).threadForLead({
      id: "lead-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "Ana@Gmail.test", customerName: "Ana", message: "¿Llega a Santa Cruz?",
    } as any);

    expect(thread).toEqual({ id: "thread-1" });
    const call = db.storeInboxThread.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ storeId_customerEmail_leadId_orderId: {
      storeId: "store-1", customerEmail: "ana@gmail.test", leadId: "lead-1", orderId: null,
    } });
    expect(call.create.subject).toBe("Consulta desde la tienda");
    expect(call.update).toEqual({});
  });
});

describe("InboxService.threadForOrder", () => {
  it("opens one thread per order, titled with the order id", async () => {
    const db = fakeDb();
    db.storeInboxThread.upsert.mockResolvedValue({ id: "thread-2" });

    await new InboxService(db as any).threadForOrder({
      id: "order-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana",
    } as any);

    const call = db.storeInboxThread.upsert.mock.calls[0][0];
    expect(call.create.orderId).toBe("order-1");
    expect(call.create.subject).toBe("Pedido order-1");
    expect(call.create.unreadForMerchant).toBe(false);
  });
});
