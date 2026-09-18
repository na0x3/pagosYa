import { BadRequestException, NotFoundException, ValidationPipe } from "@nestjs/common";
import { ProductSubscriptionCadence } from "@prisma/client";
import { PaymentLinksService } from "./payment-links.service";
import { RemoveProductSubscriptionsDto, UpdateProductSubscriptionsDto } from "./dto/update-product-subscriptions.dto";
import { PaymentLinksController } from "./payment-links.controller";
import { ProductSubscriptionsPublicController } from "./product-subscriptions-public.controller";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";

const weekly = { cadence: ProductSubscriptionCadence.WEEKLY, discountPercent: 10 };
const monthly = { cadence: ProductSubscriptionCadence.MONTHLY, discountPercent: 20 };

function setup() {
  let options: any[] = [];
  let nextId = 0;
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
    paymentLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockImplementation(async () => ({ id: "p1", subscriptionOptions: options })),
    },
    productSubscriptionOption: {
      upsert: jest.fn().mockImplementation(async ({ create, update }) => {
        const existing = options.find(option => option.paymentLinkId === create.paymentLinkId && option.cadence === create.cadence);
        if (existing) { Object.assign(existing, update); return existing; }
        const option = { id: `option_${++nextId}`, ...create };
        options.push(option);
        return option;
      }),
      deleteMany: jest.fn().mockImplementation(async ({ where }) => {
        const before = options.length;
        options = options.filter(option => option.paymentLinkId !== where.paymentLinkId || option.cadence !== where.cadence);
        return { count: before - options.length };
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => options.filter(option => option.paymentLinkId === where.paymentLinkId)),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async callback => {
    const before = structuredClone(options);
    try { return await callback(prisma); } catch (error) { options = before; throw error; }
  });
  return { prisma, service: new PaymentLinksService(prisma as any, {} as any, {} as any, {} as any) };
}

describe("Product subscription offers", () => {
  it("creates options, updates a stable ID and preserves omitted cadences", async () => {
    const { service, prisma } = setup();
    const created = structuredClone(await service.updateSubscriptions("m1", "s1", "p1", { options: [weekly, monthly] }));
    const updated = await service.updateSubscriptions("m1", "s1", "p1", { options: [{ ...weekly, discountPercent: 0 }] });
    expect(updated).toEqual([{ ...created[0], discountPercent: 0 }, created[1]]);
    expect(prisma.store.findFirst).toHaveBeenCalledWith({ where: { id: "s1", merchantId: "m1" } });
    expect(prisma.paymentLink.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", storeId: "s1", status: "ACTIVE" }, data: { updatedAt: expect.any(Date) },
    });
    expect(prisma.productSubscriptionOption.upsert).toHaveBeenLastCalledWith({
      where: { paymentLinkId_cadence: { paymentLinkId: "p1", cadence: "WEEKLY" } },
      create: { paymentLinkId: "p1", cadence: "WEEKLY", discountPercent: 0 }, update: { discountPercent: 0 },
    });
  });

  it("removes only requested cadences, including from an archived product, and is idempotent", async () => {
    const { service, prisma } = setup();
    await service.updateSubscriptions("m1", "s1", "p1", { options: [weekly, monthly] });
    const remove = () => service.removeSubscriptions("m1", "s1", "p1", { cadences: [weekly.cadence] });
    expect(await remove()).toEqual([expect.objectContaining(monthly)]);
    expect(await remove()).toEqual([expect.objectContaining(monthly)]);
    expect(prisma.paymentLink.updateMany).toHaveBeenLastCalledWith({ where: { id: "p1", storeId: "s1" }, data: { updatedAt: expect.any(Date) } });
    expect(await service.removeSubscriptions("m1", "s1", "p1", { cadences: Object.values(ProductSubscriptionCadence) })).toEqual([]);
  });

  it("denies foreign stores before reading or writing cadence data", async () => {
    const { service, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue(null);
    for (const call of [
      () => service.listSubscriptions("other", "s1", "p1"),
      () => service.updateSubscriptions("other", "s1", "p1", { options: [weekly] }),
      () => service.removeSubscriptions("other", "s1", "p1", { cadences: [weekly.cadence] }),
    ]) await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.paymentLink.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects missing/cross-store products and prevents configuring archived products", async () => {
    const { service, prisma } = setup();
    prisma.paymentLink.updateMany.mockResolvedValue({ count: 0 });
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await expect(service.listSubscriptions("m1", "s1", "p2")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateSubscriptions("m1", "s1", "p2", { options: [weekly] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeSubscriptions("m1", "s1", "p2", { cadences: [weekly.cadence] })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productSubscriptionOption.upsert).not.toHaveBeenCalled();
    expect(prisma.productSubscriptionOption.deleteMany).not.toHaveBeenCalled();
  });

  it("rolls back a multi-cadence edit if one write fails", async () => {
    const { service, prisma } = setup();
    prisma.productSubscriptionOption.upsert.mockImplementationOnce(prisma.productSubscriptionOption.upsert.getMockImplementation()!).mockRejectedValueOnce(new Error("write failed"));
    await expect(service.updateSubscriptions("m1", "s1", "p1", { options: [weekly, monthly] })).rejects.toThrow("write failed");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(await service.listSubscriptions("m1", "s1", "p1")).toEqual([]);
  });

  it("exposes an empty array or confirmed options only for an active product in an available public store", async () => {
    const { service, prisma } = setup();
    expect(await service.listPublicSubscriptions("coffee", "p1")).toEqual([]);
    expect(prisma.paymentLink.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", status: "ACTIVE", store: { slug: "coffee", status: "ACTIVE", sourcePublicationPaused: false } },
      select: { subscriptionOptions: { orderBy: { cadence: "asc" }, select: { id: true, paymentLinkId: true, cadence: true, discountPercent: true } } },
    });
    await service.updateSubscriptions("m1", "s1", "p1", { options: [weekly] });
    expect(await service.listPublicSubscriptions("coffee", "p1")).toEqual([expect.objectContaining(weekly)]);
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await expect(service.listPublicSubscriptions("hidden", "p1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    {}, { options: [] }, { options: null }, { options: [null] }, { options: [weekly, weekly] },
    { options: [weekly, monthly, weekly, monthly] },
    ...[-1, 100, 1.5, "10", null, undefined].map(discountPercent => ({ options: [{ ...weekly, discountPercent }] })),
    { options: [{ ...weekly, cadence: "DAILY" }] }, { options: [{ ...weekly, id: "foreign" }] },
  ])("rejects invalid DTOs both at the HTTP boundary and on direct service calls: %j", async value => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(value, { type: "body", metatype: UpdateProductSubscriptionsDto })).rejects.toBeInstanceOf(BadRequestException);
    const { service, prisma } = setup();
    await expect(service.updateSubscriptions("m1", "s1", "p1", value as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([{}, { cadences: [] }, { cadences: ["DAILY"] }, { cadences: ["WEEKLY", "WEEKLY"] }, { cadences: null }])("validates explicit removals: %j", async value => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(value, { type: "body", metatype: RemoveProductSubscriptionsDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.removeSubscriptions("m1", "s1", "p1", value as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("wires merchant management under its auth guard and public reads on a separate controller", async () => {
    const { service } = setup();
    const merchant = new PaymentLinksController(service);
    const storefront = new ProductSubscriptionsPublicController(service);
    expect(Reflect.getMetadata(GUARDS_METADATA, PaymentLinksController)).toContain(MerchantAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, ProductSubscriptionsPublicController)).toBe("v1/stores/public/:slug/payment_links");
    await merchant.updateSubscriptions({ id: "m1" }, "s1", "p1", { options: [weekly] });
    expect(await merchant.listSubscriptions({ id: "m1" }, "s1", "p1")).toEqual(await storefront.list("coffee", "p1"));
    expect(await merchant.removeSubscriptions({ id: "m1" }, "s1", "p1", { cadences: [weekly.cadence] })).toEqual([]);
  });
});
