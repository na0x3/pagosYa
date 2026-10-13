import { queueStoreEmail, receiptMessageId, workspaceDedupeKey } from "../email-workspace/email-workspace.config";
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

describe("InboxService.threadForOrder — filing the receipt into the thread", () => {
  function db(delivery: unknown) {
    return {
      storeInboxThread: { findFirst: jest.fn().mockResolvedValue({ id: "thread-2", storeId: "store-1" }), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      storeInboxMessage: { create: jest.fn().mockResolvedValue({ id: "msg-1" }) },
      storeEmailDelivery: { findUnique: jest.fn().mockResolvedValue(delivery) },
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: verified }) },
    };
  }
  const order = { id: "order-1", storeId: "store-1", merchantId: "m-1", customerEmail: "Ana@Gmail.test", customerName: "Ana", receiptSourceId: "payment-1" };

  it("records the receipt under the id it was actually sent with", async () => {
    const prisma = db({ subject: "Pedido order-1 · Tienda", body: "Hola Ana", messageIdHeader: receiptMessageId("store-1", "payment-1") });

    await new InboxService(prisma as any).threadForOrder(order as any);

    const recorded = prisma.storeInboxMessage.create.mock.calls[0][0].data;
    // This exact string is what the shopper's client quotes back in
    // In-Reply-To, and resolveInboundThread matches it against this column.
    expect(recorded.messageId).toBe(receiptMessageId("store-1", "payment-1"));
    expect(recorded.direction).toBe("OUTBOUND");
    expect(recorded.fromEmail).toBe("notificaciones@tienda.test");
    expect(recorded.toEmail).toBe("ana@gmail.test");
    expect(recorded.body).toContain("Hola Ana");
  });

  it("looks the receipt up by the same dedupe key queueStoreEmail wrote it under", async () => {
    const prisma = db({ subject: "s", body: "b", messageIdHeader: receiptMessageId("store-1", "payment-1") });

    await new InboxService(prisma as any).threadForOrder(order as any);

    expect(prisma.storeEmailDelivery.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: workspaceDedupeKey("store-1", "WORKSPACE_ORDER_CONFIRMATION", "payment-1", "ana@gmail.test") },
    }));
  });

  it("records nothing when the receipt went out without a Message-ID", async () => {
    const prisma = db({ subject: "s", body: "b", messageIdHeader: null });

    await new InboxService(prisma as any).threadForOrder(order as any);

    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });

  it("records nothing when no receipt was queued at all", async () => {
    const prisma = db(null);

    await new InboxService(prisma as any).threadForOrder(order as any);

    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });

  it("does not look for a receipt when the caller named no source", async () => {
    const prisma = db(null);

    await new InboxService(prisma as any).threadForOrder({ ...order, receiptSourceId: undefined } as any);

    expect(prisma.storeEmailDelivery.findUnique).not.toHaveBeenCalled();
  });

  it("tolerates a retried confirm() recording the same receipt twice (P2002)", async () => {
    const prisma = db({ subject: "s", body: "b", messageIdHeader: receiptMessageId("store-1", "payment-1") });
    prisma.storeInboxMessage.create.mockRejectedValue({ code: "P2002" });

    await expect(new InboxService(prisma as any).threadForOrder(order as any)).resolves.toBeTruthy();
  });
});
