import { InboxService } from "./inbox.service";

describe("InboxService.reply", () => {
  function db() {
    return {
      storeInboxThread: { findUnique: jest.fn().mockResolvedValue({
        id: "thread-1", storeId: "store-1", merchantId: "m-1",
        customerEmail: "ana@gmail.test", subject: "Pedido",
      }), update: jest.fn() },
      storeInboxMessage: { create: jest.fn().mockResolvedValue({ id: "msg-1" }) },
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: { emailWorkspace: {
        domain: { name: "tienda.test", senderName: "Tienda", status: "verified" },
      } } }) },
      store: { findUnique: jest.fn().mockResolvedValue({ id: "store-1", name: "Tienda" }) },
      storeEmailDelivery: { upsert: jest.fn() },
    };
  }

  it("queues the reply from the store's verified domain and files it in the thread", async () => {
    const prisma = db();
    await new InboxService(prisma as any).reply("m-1", "thread-1", "store-1", "Sí, llega en 3 días.");

    const queued = prisma.storeEmailDelivery.upsert.mock.calls[0][0].create;
    expect(queued.email).toBe("ana@gmail.test");
    expect(queued.body).toBe("Sí, llega en 3 días.");
    expect(prisma.storeInboxMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      direction: "OUTBOUND", body: "Sí, llega en 3 días.",
    }) });
    expect(prisma.storeInboxThread.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "thread-1" },
      data: expect.objectContaining({ unreadForMerchant: false }),
    }));
  });

  it("refuses a thread that belongs to another merchant", async () => {
    const prisma = db();
    await expect(new InboxService(prisma as any).reply("otro-merchant", "thread-1", "store-1", "hola"))
      .rejects.toThrow();
    expect(prisma.storeEmailDelivery.upsert).not.toHaveBeenCalled();
  });

  it("refuses to reply when the store has no verified email domain", async () => {
    const prisma = db();
    prisma.storeRetention.findUnique.mockResolvedValue({ settings: { emailWorkspace: {
      domain: { name: "tienda.test", senderName: "Tienda", status: "pending" },
    } } });

    await expect(new InboxService(prisma as any).reply("m-1", "thread-1", "store-1", "hola"))
      .rejects.toThrow("Verifica el dominio de correo de la tienda para responder desde aquí.");
    expect(prisma.storeEmailDelivery.upsert).not.toHaveBeenCalled();
    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });

  it("refuses a thread that belongs to a different store of the same merchant", async () => {
    const prisma = db();

    await expect(new InboxService(prisma as any).reply("m-1", "thread-1", "store-ajena", "hola"))
      .rejects.toThrow("Conversación no encontrada");
    expect(prisma.storeEmailDelivery.upsert).not.toHaveBeenCalled();
    expect(prisma.storeInboxMessage.create).not.toHaveBeenCalled();
  });
});
