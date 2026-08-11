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
});
