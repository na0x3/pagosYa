import { OpsRole, SupportCaseStatus } from "@prisma/client";
import { DomainOrdersService } from "./domain-orders.service";

const actor = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

const stalled = {
  id: "order_1",
  storeId: "store_1",
  hostname: "tienda.com",
  status: "REVIEW_REQUIRED",
  providerOrderId: null,
  registrationStartedAt: new Date("2026-09-15T00:00:00Z"),
  paymentIntentId: "pi_1",
};

function makeFakePrisma(order: Record<string, unknown> = stalled) {
  const prisma: any = {
    domainOrder: {
      findUnique: jest.fn().mockResolvedValue(order),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ ...order, ...data })),
    },
    customDomain: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    supportCase: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    store: { findUnique: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1" }) },
  };
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}

describe("DomainOrdersService", () => {
  it("returns a stalled order that never reached the registrar to AWAITING_PAYMENT", async () => {
    const prisma = makeFakePrisma();
    const auditLog = { record: jest.fn() };
    const service = new DomainOrdersService(prisma, auditLog as any);

    await service.retry("order_1", "Credencial del registrador restaurada", actor);

    expect(prisma.domainOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order_1" },
      data: expect.objectContaining({
        status: "AWAITING_PAYMENT",
        attempts: 0,
        leaseUntil: null,
        // Re-armed so advance's 24-hour conciliation guard does not fire on the
        // first pass; register() is keyed on the order id, so it stays idempotent.
        registrationStartedAt: null,
        retriedAt: expect.any(Date),
      }),
    }));
  });

  it("resumes an order the registrar already accepted at CONNECTING, keeping its registration clock", async () => {
    const prisma = makeFakePrisma({ ...stalled, providerOrderId: "99123" });
    const auditLog = { record: jest.fn() };
    const service = new DomainOrdersService(prisma, auditLog as any);

    await service.retry("order_1", "Cloudflare volvió a responder", actor);

    const { data } = prisma.domainOrder.update.mock.calls[0][0];
    expect(data.status).toBe("CONNECTING");
    // Clearing it would re-arm a 24-hour window that only guards registration,
    // and this order is already registered.
    expect(data.registrationStartedAt).toBeUndefined();
  });

  it("refuses to retry an order that is not waiting for an operator", async () => {
    const prisma = makeFakePrisma({ ...stalled, status: "ACTIVE" });
    const service = new DomainOrdersService(prisma, { record: jest.fn() } as any);

    await expect(service.retry("order_1", "Se ve mal", actor)).rejects.toThrow("REVIEW_REQUIRED");
    expect(prisma.domainOrder.update).not.toHaveBeenCalled();
  });

  it("refuses an action without a reason, so the audit trail cannot be empty", async () => {
    const prisma = makeFakePrisma();
    const service = new DomainOrdersService(prisma, { record: jest.fn() } as any);

    await expect(service.retry("order_1", "   ", actor)).rejects.toThrow("reason");
    expect(prisma.domainOrder.update).not.toHaveBeenCalled();
  });

  it("frees the hostname and resolves the support case when an operator settles an order", async () => {
    const prisma = makeFakePrisma();
    prisma.supportCase.findFirst.mockResolvedValue({ id: "case_1", merchantId: "merchant_1", status: SupportCaseStatus.PENDING });
    const auditLog = { record: jest.fn() };
    const service = new DomainOrdersService(prisma, auditLog as any);

    await service.markReconciled("order_1", "Reembolso emitido el 16/09", actor);

    expect(prisma.customDomain.deleteMany).toHaveBeenCalledWith({ where: { domainOrderId: "order_1" } });
    expect(prisma.domainOrder.update.mock.calls[0][0].data.status).toBe("CANCELED");
    expect(prisma.supportCase.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "case_1" },
      data: expect.objectContaining({ status: SupportCaseStatus.RESOLVED, resolution: "Reembolso emitido el 16/09" }),
    }));
    expect(auditLog.record).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: "domain_order.reconciled",
      targetType: "DomainOrder",
      targetId: "order_1",
    }));
  });

  it("keeps the operator's internal reason out of what the merchant reads", async () => {
    const prisma = makeFakePrisma();
    const service = new DomainOrdersService(prisma, { record: jest.fn() } as any);

    await service.markReconciled("order_1", "Fraude sospechado, no reembolsar", actor);

    expect(prisma.domainOrder.update.mock.calls[0][0].data.message).not.toContain("Fraude");
  });

  it("settles an order whose support case was already resolved by hand", async () => {
    const prisma = makeFakePrisma();
    prisma.supportCase.findFirst.mockResolvedValue({ id: "case_1", merchantId: "merchant_1", status: SupportCaseStatus.RESOLVED });
    const service = new DomainOrdersService(prisma, { record: jest.fn() } as any);

    await service.markReconciled("order_1", "Registrado a mano", actor);

    expect(prisma.domainOrder.update.mock.calls[0][0].data.status).toBe("CANCELED");
    expect(prisma.supportCase.update).not.toHaveBeenCalled();
  });
});
