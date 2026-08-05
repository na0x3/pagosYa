import { BadRequestException, NotFoundException } from "@nestjs/common";
import { KycStatus, MerchantStatus } from "@prisma/client";
import { KycService } from "./kyc.service";

const submitDto = {
  legalName: "Tienda Ejemplo S.R.L.",
  taxId: "1023456028",
  legalRepName: "Maria Fernanda Rojas",
  legalRepDocumentId: "7654321 LP",
  payoutBankAccount: "BNB 4012345678",
};

const actor = { id: "ops_1", name: "Ana Gutierrez", email: "ana@pagosya.bo" };

function makeFakePrisma() {
  const prisma = {
    merchant: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    merchantKycSubmission: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  // The transaction callback receives `tx` — hand it the same mocked prisma
  // object so `tx.merchant.update` etc. resolve to the spies asserted below.
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function makeFakeAuditLog() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

describe("KycService.submit", () => {
  it("creates a PENDING_REVIEW submission for a non-active merchant", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.PENDING });
    prisma.merchantKycSubmission.findFirst.mockResolvedValue(null);
    prisma.merchantKycSubmission.create.mockResolvedValue({ id: "kyc_1", ...submitDto, status: KycStatus.PENDING_REVIEW });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any);
    const result = await service.submit("m_1", submitDto);

    expect(result.status).toBe(KycStatus.PENDING_REVIEW);
    expect(prisma.merchantKycSubmission.create).toHaveBeenCalledWith({
      data: { merchantId: "m_1", ...submitDto },
    });
  });

  it("rejects a new submission when the merchant is already active", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.ACTIVE });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any);
    await expect(service.submit("m_1", submitDto)).rejects.toThrow(BadRequestException);
  });

  it("rejects a new submission while one is already pending review", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.PENDING });
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ id: "kyc_0", status: KycStatus.PENDING_REVIEW });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any);
    await expect(service.submit("m_1", submitDto)).rejects.toThrow(BadRequestException);
  });
});

describe("KycService.review", () => {
  it("approving a submission activates the merchant and attributes it to the reviewing actor", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.PENDING_REVIEW,
    });
    prisma.merchantKycSubmission.update.mockResolvedValue({ id: "kyc_1", status: KycStatus.APPROVED });
    const auditLog = makeFakeAuditLog();

    const service = new KycService(prisma as any, auditLog as any);
    await service.review("kyc_1", { decision: KycStatus.APPROVED }, actor);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { status: MerchantStatus.ACTIVE },
    });
    expect(prisma.merchantKycSubmission.update).toHaveBeenCalledWith({
      where: { id: "kyc_1" },
      data: expect.objectContaining({
        reviewedByOpsUserId: "ops_1",
        reviewedByLabel: "Ana Gutierrez <ana@pagosya.bo>",
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        actorType: "OPS_USER",
        actorId: "ops_1",
        actorLabel: "Ana Gutierrez <ana@pagosya.bo>",
        action: "kyc.approved",
        targetType: "MerchantKycSubmission",
        targetId: "kyc_1",
      }),
    );
  });

  it("rejecting a submission does not touch merchant status but still logs the actor", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.PENDING_REVIEW,
    });
    prisma.merchantKycSubmission.update.mockResolvedValue({ id: "kyc_1", status: KycStatus.REJECTED });
    const auditLog = makeFakeAuditLog();

    const service = new KycService(prisma as any, auditLog as any);
    await service.review("kyc_1", { decision: KycStatus.REJECTED, note: "Missing NIT" }, actor);

    expect(prisma.merchant.update).not.toHaveBeenCalled();
    expect(auditLog.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: "kyc.rejected", metadata: expect.objectContaining({ note: "Missing NIT" }) }),
    );
  });

  it("throws for an unknown submission", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantKycSubmission.findUnique.mockResolvedValue(null);

    const service = new KycService(prisma as any, makeFakeAuditLog() as any);
    await expect(service.review("missing", { decision: KycStatus.APPROVED }, actor)).rejects.toThrow(NotFoundException);
  });

  it("throws when reviewing a submission that was already decided", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.APPROVED,
    });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any);
    await expect(service.review("kyc_1", { decision: KycStatus.APPROVED }, actor)).rejects.toThrow(BadRequestException);
  });
});
