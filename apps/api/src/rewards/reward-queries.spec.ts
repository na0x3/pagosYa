import { PaymentIntentStatus } from "@prisma/client";
import { countStoreSales, type Db } from "./reward-queries";

describe("countStoreSales", () => {
  it("counts only live succeeded payments, so free test-mode payments cannot earn board rolls", async () => {
    const count = jest.fn().mockResolvedValue(10);
    const db = { paymentIntent: { count } } as unknown as Db;

    await expect(countStoreSales(db, "m_1", "s_1")).resolves.toBe(10);
    expect(count).toHaveBeenCalledWith({
      where: { merchantId: "m_1", status: PaymentIntentStatus.SUCCEEDED, livemode: true, metadata: { path: ["storeId"], equals: "s_1" } },
    });
  });
});
