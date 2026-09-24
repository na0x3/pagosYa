import { InboxService } from "./inbox.service";

function db() {
  return {
    store: { findFirst: jest.fn() },
    storeInboxThread: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    storeInboxMessage: { findMany: jest.fn() },
  };
}

describe("InboxService.listThreads", () => {
  it("returns the store's threads newest-activity first, once ownership is confirmed", async () => {
    const prisma = db();
    prisma.store.findFirst.mockResolvedValue({ id: "store-1", merchantId: "m-1" });
    const rows = [
      { id: "thread-1", subject: "Pedido", customerName: "Ana", customerEmail: "ana@gmail.test", unreadForMerchant: true, lastMessageAt: new Date("2026-09-20"), leadId: null, orderId: "order-1" },
    ];
    prisma.storeInboxThread.findMany.mockResolvedValue(rows);

    const result = await new InboxService(prisma as any).listThreads("m-1", "store-1");

    expect(prisma.store.findFirst).toHaveBeenCalledWith({ where: { id: "store-1", merchantId: "m-1" } });
    expect(prisma.storeInboxThread.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1" },
      orderBy: { lastMessageAt: "desc" },
    }));
    expect(result).toEqual(rows);
  });

  it("refuses to list threads for a store that does not belong to the merchant", async () => {
    const prisma = db();
    prisma.store.findFirst.mockResolvedValue(null);

    await expect(new InboxService(prisma as any).listThreads("m-1", "store-ajeno")).rejects.toThrow();
    expect(prisma.storeInboxThread.findMany).not.toHaveBeenCalled();
  });
});

describe("InboxService.readThread", () => {
  it("returns the thread and its messages oldest first, and clears unreadForMerchant", async () => {
    const prisma = db();
    prisma.storeInboxThread.findUnique.mockResolvedValue({
      id: "thread-1", storeId: "store-1", merchantId: "m-1", unreadForMerchant: true,
    });
    const messages = [{ id: "msg-1", createdAt: new Date("2026-09-19") }, { id: "msg-2", createdAt: new Date("2026-09-20") }];
    prisma.storeInboxMessage.findMany.mockResolvedValue(messages);

    const result = await new InboxService(prisma as any).readThread("m-1", "thread-1", "store-1");

    expect(prisma.storeInboxMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { threadId: "thread-1" },
      orderBy: { createdAt: "asc" },
    }));
    expect(prisma.storeInboxThread.update).toHaveBeenCalledWith({
      where: { id: "thread-1" },
      data: { unreadForMerchant: false },
    });
    expect(result.messages).toEqual(messages);
    expect(result.thread.unreadForMerchant).toBe(false);
  });

  it("refuses a thread that belongs to another merchant", async () => {
    const prisma = db();
    prisma.storeInboxThread.findUnique.mockResolvedValue({
      id: "thread-1", storeId: "store-1", merchantId: "otro-merchant", unreadForMerchant: true,
    });

    await expect(new InboxService(prisma as any).readThread("m-1", "thread-1", "store-1")).rejects.toThrow();
    expect(prisma.storeInboxMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.storeInboxThread.update).not.toHaveBeenCalled();
  });

  it("refuses a thread that does not exist", async () => {
    const prisma = db();
    prisma.storeInboxThread.findUnique.mockResolvedValue(null);

    await expect(new InboxService(prisma as any).readThread("m-1", "thread-inexistente", "store-1")).rejects.toThrow();
    expect(prisma.storeInboxMessage.findMany).not.toHaveBeenCalled();
  });

  it("refuses a thread that belongs to a different store of the same merchant", async () => {
    const prisma = db();
    prisma.storeInboxThread.findUnique.mockResolvedValue({
      id: "thread-1", storeId: "store-ajena", merchantId: "m-1", unreadForMerchant: true,
    });

    await expect(new InboxService(prisma as any).readThread("m-1", "thread-1", "store-1")).rejects.toThrow(
      "Conversación no encontrada",
    );
    expect(prisma.storeInboxMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.storeInboxThread.update).not.toHaveBeenCalled();
  });
});
