import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { ConsumerAffiliationStatus, DebtRecordStatus, OrderFulfillmentStatus, StoreStatus } from "@prisma/client";
import { ConsumerService } from "./consumer.service";
import { createOrderTrackingToken } from "./order-tracking-token";

function setup() {
  const prisma: any = {
    consumerUser: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "user_1", email: "ana@example.com", carnet: "778899" }) },
    consumerInstitutionAffiliation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: "aff_1" }),
    },
    debtRecord: { findFirst: jest.fn(), findMany: jest.fn() },
    store: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    storeOrder: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    paymentIntent: { update: jest.fn() },
    deliveryAssignment: { findUnique: jest.fn() },
    storeOrderStatusEvent: { create: jest.fn() },
    $transaction: jest.fn(async (value: any) => typeof value === "function" ? value(prisma) : Promise.all(value)),
  };
  return { prisma, service: new ConsumerService(prisma, {} as any, {} as any, {} as any) };
}

describe("ConsumerService affiliation consent", () => {
  it("offers only organizations that match both verified email and carnet", async () => {
    const { prisma, service } = setup();
    await service.affiliationOffers("user_1");
    expect(prisma.store.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: StoreStatus.ACTIVE,
        debtCollectionLinks: { some: {
          status: "ACTIVE",
          debts: { some: { normalizedDocument: "778899", customerEmail: "ana@example.com" } },
        } },
      }),
    }));
  });

  it("refuses affiliation when the organization has no verified invitation", async () => {
    const { prisma, service } = setup();
    prisma.debtRecord.findFirst.mockResolvedValue(null);
    await expect(service.acceptAffiliation("user_1", "store_1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.consumerInstitutionAffiliation.upsert).not.toHaveBeenCalled();
  });

  it("shows every obligation for the carnet after explicit affiliation", async () => {
    const { prisma, service } = setup();
    prisma.consumerInstitutionAffiliation.findFirst.mockResolvedValue({
      id: "aff_1", consumerUserId: "user_1", storeId: "store_1", status: ConsumerAffiliationStatus.ACTIVE,
      store: { id: "store_1", name: "Organización Norte" },
    });
    prisma.debtRecord.findMany.mockResolvedValue([{ id: "debt_1", customerName: "Dependiente", description: "Cuota", amount: 5000, currency: "BOB", status: DebtRecordStatus.PENDING, paidAt: null, reference: "AGO", debtCollectionLink: { name: "Mensualidades" } }]);
    const result = await service.obligations("user_1", "aff_1");
    expect(prisma.debtRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { normalizedDocument: "778899", debtCollectionLink: { storeId: "store_1", status: "ACTIVE" } },
    }));
    expect(result.obligations[0]).toMatchObject({ personName: "Dependiente", concept: "Cuota" });
  });
});

describe("ConsumerService guest order tracking", () => {
  const secret = "test-order-tracking-secret-with-at-least-32-characters";
  const orderId = "cmt3sw7rs000h45900a1woug3";

  it("returns payment and fulfillment as separate public states", async () => {
    const { prisma } = setup();
    const service = new ConsumerService(prisma, { get: jest.fn().mockReturnValue(secret) } as any, {} as any, {} as any);
    prisma.storeOrder.findUnique.mockResolvedValue({
      id: orderId, paymentIntentId: "pi_1", storeId: "store_1", storeName: "Tienda Uno", items: [], amount: 1200, currency: "BOB",
      status: OrderFulfillmentStatus.PREPARING, createdAt: new Date("2026-08-23T10:00:00Z"), updatedAt: new Date("2026-08-23T10:05:00Z"),
      paymentIntent: { status: "SUCCEEDED" }, statusEvents: [{ status: OrderFulfillmentStatus.PAID, createdAt: new Date("2026-08-23T10:01:00Z") }],
    });
    prisma.store.findUnique.mockResolvedValue({ slug: "tienda-uno", logoUrl: null, contactPhone: null, contactEmail: null });
    prisma.deliveryAssignment.findUnique.mockResolvedValue(null);

    await expect(service.trackOrder(createOrderTrackingToken(orderId, secret))).resolves.toMatchObject({
      reference: "0A1WOUG3", paymentStatus: "SUCCEEDED", status: OrderFulfillmentStatus.PREPARING,
    });
  });

  it("claims an order only for the account that matches the checkout email", async () => {
    const { prisma } = setup();
    const service = new ConsumerService(prisma, { get: jest.fn().mockReturnValue(secret) } as any, {} as any, {} as any);
    prisma.storeOrder.findUnique.mockResolvedValue({ id: orderId, paymentIntentId: "pi_1", paymentIntent: { customerEmail: "ana@example.com" } });
    await expect(service.claimTrackedOrder("user_1", createOrderTrackingToken(orderId, secret))).resolves.toEqual({ claimed: true });
    expect(prisma.storeOrder.update).toHaveBeenCalledWith({ where: { id: orderId }, data: { consumerUserId: "user_1" } });
  });
});

describe("ConsumerService account verification", () => {
  it("returns a recoverable error when verification email delivery fails", async () => {
    const prisma: any = {
      consumerUser: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "user_1", name: "Ana", email: "ana@gmail.com", carnet: "778899" }),
      },
      consumerVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: "token_1" }),
      },
    };
    const email = { send: jest.fn().mockRejectedValue(new Error("provider unavailable")) };
    const service = new ConsumerService(prisma, { get: jest.fn().mockReturnValue("http://localhost:4324") } as any, {} as any, email as any);

    await expect(service.signup("Ana", "ana@gmail.com", "778899", "password123")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("ConsumerService fulfillment transitions", () => {
  it("records a valid delivery transition", async () => {
    const { prisma, service } = setup();
    prisma.storeOrder.findFirst.mockResolvedValue({ id: "order_1", merchantId: "merchant_1", status: OrderFulfillmentStatus.PAID });
    prisma.storeOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.storeOrder.findUniqueOrThrow.mockResolvedValue({ id: "order_1", status: OrderFulfillmentStatus.PREPARING });
    await service.updateOrderStatus("merchant_1", "order_1", OrderFulfillmentStatus.PREPARING);
    expect(prisma.storeOrderStatusEvent.create).toHaveBeenCalledWith({ data: { orderId: "order_1", status: OrderFulfillmentStatus.PREPARING } });
  });

  it("rejects skipping from paid directly to delivered", async () => {
    const { prisma, service } = setup();
    prisma.storeOrder.findFirst.mockResolvedValue({ id: "order_1", merchantId: "merchant_1", status: OrderFulfillmentStatus.PAID });
    await expect(service.updateOrderStatus("merchant_1", "order_1", OrderFulfillmentStatus.DELIVERED)).rejects.toBeInstanceOf(BadRequestException);
  });
});
