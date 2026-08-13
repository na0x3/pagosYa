import { BadRequestException } from "@nestjs/common";
import { PaymentLinkStatus } from "@prisma/client";
import { PaymentIntentsService } from "./payment-intents.service";

function makeService() {
  return new PaymentIntentsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

describe("PaymentIntentsService cart option inventory", () => {
  it("atomically decrements each selected option", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    await (service as any).decrementStockForCart(tx, {
      cart: [
        { paymentLinkId: "link_1", variantId: "var_small", name: "Hamburguesa", quantity: 1 },
        { paymentLinkId: "link_1", variantId: "var_large", name: "Hamburguesa", quantity: 2 },
      ],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.paymentLink.updateMany).not.toHaveBeenCalled();
  });

  it("blocks confirmation when a selected option was removed after cart creation", async () => {
    const service = makeService();
    const tx = {
      paymentLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "link_1",
            name: "Hamburguesa",
            status: PaymentLinkStatus.ACTIVE,
            stock: 5,
            variants: [{ id: "var_small", name: "Pequeña", amount: 5000 }],
          },
        ]),
      },
    };

    await expect(
      (service as any).assertCartStillAvailable(tx, {
        cart: [{ paymentLinkId: "link_1", variantId: "var_removed", name: "Hamburguesa", quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("blocks confirmation when the selected option lacks stock", async () => {
    const service = makeService();
    const tx = {
      paymentLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "link_1",
            name: "Hamburguesa",
            status: PaymentLinkStatus.ACTIVE,
            stock: 4,
            variants: [
              { id: "var_small", name: "Pequeña", amount: 5000, stock: 0 },
              { id: "var_large", name: "Grande", amount: 8000, stock: 4 },
            ],
          },
        ]),
      },
    };

    await expect(
      (service as any).assertCartStillAvailable(tx, {
        cart: [{ paymentLinkId: "link_1", variantId: "var_small", variantName: "Pequeña", name: "Hamburguesa", quantity: 1 }],
      }),
    ).rejects.toThrow('Solo quedan 0 unidades de "Hamburguesa (Pequeña)"');
  });

  it("aggregates option lines into one persisted product total", async () => {
    const service = makeService();
    const tx = { storeProductStat: { upsert: jest.fn().mockResolvedValue({}) } };

    await (service as any).recordProductStats(tx, "merchant_1", {
      storeId: "store_1",
      cart: [
        { paymentLinkId: "link_1", variantId: "small", name: "Hamburguesa", quantity: 2, unitAmount: 5000 },
        { paymentLinkId: "link_1", variantId: "large", name: "Hamburguesa", quantity: 1, unitAmount: 8000 },
      ],
    });

    expect(tx.storeProductStat.upsert).toHaveBeenCalledWith({
      where: { storeId_paymentLinkId: { storeId: "store_1", paymentLinkId: "link_1" } },
      create: { merchantId: "merchant_1", storeId: "store_1", paymentLinkId: "link_1", productName: "Hamburguesa", quantity: 3, revenue: 18000 },
      update: { productName: "Hamburguesa", quantity: { increment: 3 }, revenue: { increment: 18000 } },
    });
  });
});

describe("PaymentIntentsService merchant transaction list", () => {
  it("filters transactions by the selected store when requested", async () => {
    const prisma = { paymentIntent: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await service.listForMerchant("merchant_1", "store_1");

    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith({
      where: {
        merchantId: "merchant_1",
        metadata: { path: ["storeId"], equals: "store_1" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
});
