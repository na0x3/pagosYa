import { queueStoreEmail, receiptMessageId } from "../email-workspace/email-workspace.config";
import { InboxService } from "./inbox.service";

/**
 * The order thread's whole stated purpose is "so the buyer's reply to their
 * receipt has somewhere to land". That only works if the receipt itself is sent
 * with Reply-To on our inbound address and with a Message-ID we can recognise —
 * otherwise the buyer's reply goes to the merchant's personal Gmail, our
 * webhook is never called, and every order thread stays empty forever unless
 * the merchant writes first. This is C1 one hop upstream.
 */
const verified = { emailWorkspace: {
  templates: { ORDER_CONFIRMATION: { enabled: true, subject: "Pedido {{order}} · {{store}}", body: "Hola {{customer}}" } },
  staff: { enabled: false, recipients: [] },
  domain: { name: "tienda.test", senderName: "Tienda", status: "verified" },
} };

function outbox(settings: unknown) {
  const upsert = jest.fn().mockResolvedValue({});
  return {
    upsert,
    db: {
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings }) },
      store: { findUnique: jest.fn().mockResolvedValue({ name: "Tienda" }) },
      storeEmailDelivery: { upsert },
    },
  };
}

describe("plain-text workspace mail after the designed receipt took over", () => {
  it("queues no buyer confirmation, even for a store that saved ORDER_CONFIRMATION enabled", async () => {
    const { db, upsert } = outbox(verified);

    expect(await queueStoreEmail(db, "store-1", "ORDER_CONFIRMATION", "payment-1", "ana@gmail.test", { order: "order-1", customer: "Ana", store: "Tienda" })).toBe(false);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not put an inbound Reply-To or Message-ID on any template", async () => {
    const { db, upsert } = outbox({ emailWorkspace: {
      ...verified.emailWorkspace,
      templates: { SHIPPED: { enabled: true, subject: "Enviado", body: "Va en camino" } },
    } });

    await queueStoreEmail(db, "store-1", "SHIPPED", "order-1", "ana@gmail.test", { order: "order-1", customer: "Ana", store: "Tienda" });

    const row = upsert.mock.calls.map((call) => call[0].create).find((r) => r.kind === "WORKSPACE_SHIPPED");
    expect(row.replyTo).toBeNull();
    expect(row.messageIdHeader).toBeNull();
  });
});

describe("InboxService.threadForOrder — filing the sent receipt into the thread", () => {
  function db() {
    return {
      storeInboxThread: { findFirst: jest.fn().mockResolvedValue({ id: "thread-2", storeId: "store-1" }), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      storeInboxMessage: { create: jest.fn().mockResolvedValue({ id: "msg-1" }), findFirst: jest.fn() },
      storeEmailDelivery: { findUnique: jest.fn() },
      storeRetention: { findUnique: jest.fn() },
    };
  }
  const receipt = { subject: "Recibo de tu compra en Tienda", body: "Hola Ana,\n\nTu pago fue confirmado.", messageId: receiptMessageId("store-1", "payment-1"), from: "Tienda <notificaciones@tienda.test>" };
  const order = { id: "order-1", storeId: "store-1", merchantId: "m-1", customerEmail: "Ana@Gmail.test", customerName: "Ana", receipt };

  it("records the receipt under the id it was sent with, from the store's sender", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder(order);

    const recorded = prisma.storeInboxMessage.create.mock.calls[0][0].data;
    // This exact string is what the shopper's client quotes back in
    // In-Reply-To, and resolveInboundThread matches it against this column.
    expect(recorded.messageId).toBe(receiptMessageId("store-1", "payment-1"));
    expect(recorded.direction).toBe("OUTBOUND");
    expect(recorded.fromEmail).toBe("notificaciones@tienda.test");
    expect(recorded.toEmail).toBe("ana@gmail.test");
    expect(recorded.body).toBe(`${receipt.subject}\n\n${receipt.body}`);
  });

  it("reads no outbox row and no settings: the receipt is handed over as sent", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder(order);

    expect(prisma.storeEmailDelivery.findUnique).not.toHaveBeenCalled();
    expect(prisma.storeRetention.findUnique).not.toHaveBeenCalled();
  });

  it("records nothing when no receipt went out from the store's domain", async () => {
    const prisma = db();

    await new InboxService(prisma as any).threadForOrder({ ...order, receipt: null });

    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });

  it("tolerates a retried confirm() recording the same receipt twice (P2002)", async () => {
    const prisma = db();
    prisma.storeInboxMessage.create.mockRejectedValue({ code: "P2002" });

    await expect(new InboxService(prisma as any).threadForOrder(order)).resolves.toBeTruthy();
  });

  it("a reply quoting the receipt's Message-ID resolves to the order's thread", async () => {
    const prisma = db();
    const inbox = new InboxService(prisma as any);
    await inbox.threadForOrder(order);
    const recorded = prisma.storeInboxMessage.create.mock.calls[0][0].data.messageId;
    prisma.storeInboxMessage.findFirst.mockResolvedValue({ threadId: "thread-2" });
    prisma.storeInboxThread.findUnique.mockResolvedValue({ id: "thread-2", storeId: "store-1", customerEmail: "ana@gmail.test" });

    const thread = await inbox.resolveInboundThread("store-1", { inReplyTo: `<${recorded}>`, references: null }, "Ana@Gmail.test");

    expect(prisma.storeInboxMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { messageId: { in: [recorded] } } }));
    expect(thread).toMatchObject({ id: "thread-2" });
  });
});
