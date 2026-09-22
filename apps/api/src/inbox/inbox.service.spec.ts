import { InboxService } from "./inbox.service";

function fakeDb() {
  return {
    storeInboxThread: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    storeInboxMessage: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
}

/** The compound-unique-key shape that throws PrismaClientValidationError in production
 * (Prisma's runtime validator rejects null in a compound unique key even though the
 * columns are nullable). No call to Prisma may use this shape ever again. */
function assertNeverUsesCompoundKey(db: ReturnType<typeof fakeDb>) {
  const allCalls = [...db.storeInboxThread.findFirst.mock.calls, ...db.storeInboxThread.create.mock.calls];
  for (const call of allCalls) {
    expect(JSON.stringify(call)).not.toContain("storeId_customerEmail_leadId_orderId");
  }
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
  it("creates a thread when the lead has none yet", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst.mockResolvedValue(null);
    db.storeInboxThread.create.mockResolvedValue({ id: "thread-1" });

    const thread = await new InboxService(db as any).threadForLead({
      id: "lead-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "Ana@Gmail.test", customerName: "Ana", message: "¿Llega a Santa Cruz?",
    } as any);

    expect(thread).toEqual({ id: "thread-1" });
    expect(db.storeInboxThread.findFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", customerEmail: "ana@gmail.test", leadId: "lead-1" },
    });
    const created = db.storeInboxThread.create.mock.calls[0][0].data;
    expect(created.subject).toBe("Consulta desde la tienda");
    expect(created.leadId).toBe("lead-1");
    expect(created.orderId).toBeUndefined();
    assertNeverUsesCompoundKey(db);
  });

  it("reuses the existing thread and never calls create", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst.mockResolvedValue({ id: "thread-1" });

    const thread = await new InboxService(db as any).threadForLead({
      id: "lead-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana", message: null,
    } as any);

    expect(thread).toEqual({ id: "thread-1" });
    expect(db.storeInboxThread.create).not.toHaveBeenCalled();
    assertNeverUsesCompoundKey(db);
  });

  it("re-reads and returns the winning thread when create loses a race (P2002)", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "thread-1" });
    db.storeInboxThread.create.mockRejectedValue({ code: "P2002" });

    const thread = await new InboxService(db as any).threadForLead({
      id: "lead-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana", message: null,
    } as any);

    expect(thread).toEqual({ id: "thread-1" });
    expect(db.storeInboxThread.findFirst).toHaveBeenCalledTimes(2);
    assertNeverUsesCompoundKey(db);
  });
});

describe("InboxService.threadForOrder", () => {
  it("creates a thread titled with the order id when the order has none yet", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst.mockResolvedValue(null);
    db.storeInboxThread.create.mockResolvedValue({ id: "thread-2" });

    await new InboxService(db as any).threadForOrder({
      id: "order-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana",
    } as any);

    expect(db.storeInboxThread.findFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", customerEmail: "ana@gmail.test", orderId: "order-1" },
    });
    const created = db.storeInboxThread.create.mock.calls[0][0].data;
    expect(created.orderId).toBe("order-1");
    expect(created.subject).toBe("Pedido order-1");
    expect(created.unreadForMerchant).toBe(false);
    assertNeverUsesCompoundKey(db);
  });

  it("reuses the existing thread and never calls create", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst.mockResolvedValue({ id: "thread-2" });

    const thread = await new InboxService(db as any).threadForOrder({
      id: "order-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana",
    } as any);

    expect(thread).toEqual({ id: "thread-2" });
    expect(db.storeInboxThread.create).not.toHaveBeenCalled();
    assertNeverUsesCompoundKey(db);
  });

  it("re-reads and returns the winning thread when create loses a race (P2002)", async () => {
    const db = fakeDb();
    db.storeInboxThread.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "thread-2" });
    db.storeInboxThread.create.mockRejectedValue({ code: "P2002" });

    const thread = await new InboxService(db as any).threadForOrder({
      id: "order-1", storeId: "store-1", merchantId: "m-1",
      customerEmail: "ana@gmail.test", customerName: "Ana",
    } as any);

    expect(thread).toEqual({ id: "thread-2" });
    expect(db.storeInboxThread.findFirst).toHaveBeenCalledTimes(2);
    assertNeverUsesCompoundKey(db);
  });
});
