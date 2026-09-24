import { RetentionService } from "./retention.service";

describe("review request automation", () => {
  function makeService() {
    const prisma = {
      storeOrder: { findMany: jest.fn().mockResolvedValue([{
        id: "order_review_1",
        storeId: "store_1",
        items: [{ paymentLinkId: "product_1", name: "Café" }, { paymentLinkId: "product_2", name: "Galletas" }],
        paymentIntent: { customerEmail: "buyer@example.com", customerName: "Ana" },
      }]) },
      store: { findUnique: jest.fn().mockResolvedValue({ name: "Café Norte", slug: "cafe-norte", contactEmail: "hola@example.com", status: "ACTIVE" }) },
      storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: { reviewRequestsEnabled: true }, revision: 1, startedAt: new Date() }) },
      storeEmailDelivery: { upsert: jest.fn().mockResolvedValue({ id: "delivery_1" }) },
    };
    const config = { get: jest.fn((key: string) => ({
      "app.checkoutOrigin": "https://checkout.example.com",
      "app.orderTrackingSecret": "a-development-secret",
    } as Record<string, string>)[key]) };
    return { retention: new RetentionService(prisma as any, config as any, {} as any), prisma };
  }

  it("queues one signed, deduplicated request for an eligible delivered order", async () => {
    const { retention, prisma } = makeService();
    await retention.scheduleReviewRequests();
    expect(prisma.storeEmailDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "review-request:order_review_1" },
      create: expect.objectContaining({ kind: "REVIEW_REQUEST", email: "buyer@example.com", body: expect.stringContaining("/track/") }),
      update: {},
    }));
  });

  it("does not queue requests until the merchant enables them", async () => {
    const { retention, prisma } = makeService();
    prisma.storeRetention.findUnique.mockResolvedValue({ settings: { reviewRequestsEnabled: false }, revision: 1, startedAt: new Date() });
    await retention.scheduleReviewRequests();
    expect(prisma.storeEmailDelivery.upsert).not.toHaveBeenCalled();
  });
});
