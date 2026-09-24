import { BadRequestException, NotFoundException } from "@nestjs/common";
import { KycStatus, MerchantStatus } from "@prisma/client";
import { KycService } from "./kyc.service";

const submitDto = {
  legalName: "Tienda Ejemplo S.R.L.",
  taxId: "1023456028",
  legalRepName: "Maria Fernanda Rojas",
  legalRepDocumentId: "7654321 LP",
  payoutBankAccount: "BNB 4012345678",
  ciFrontDocId: "d1",
  ciBackDocId: "d2",
  selfieDocId: "d3",
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

function termsAccepted() {
  return { needsMerchantAcceptance: jest.fn().mockResolvedValue(false) };
}

const docsOk = () => ({ assertOwned: jest.fn().mockResolvedValue(undefined) });
const person = {
  targetLevel: 1,
  legalName: "Juana Mamani",
  legalRepDocumentId: "7654321 LP",
  payoutBankAccount: "BNB 4012345678",
  ciFrontDocId: "d1",
  ciBackDocId: "d2",
  selfieDocId: "d3",
};
const kycPrisma = (merchant: Record<string, unknown>) => ({
  merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
  merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "kyc_1" }) },
});

describe("KycService.submit", () => {
  it("creates a PENDING_REVIEW submission for a non-active merchant", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.PENDING, level: 0 });
    prisma.merchantKycSubmission.findFirst.mockResolvedValue(null);
    prisma.merchantKycSubmission.create.mockResolvedValue({ id: "kyc_1", ...submitDto, status: KycStatus.PENDING_REVIEW });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    const result = await service.submit("m_1", submitDto);

    expect(result.status).toBe(KycStatus.PENDING_REVIEW);
    expect(prisma.merchantKycSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantId: "m_1", targetLevel: 2, ...submitDto, payoutUsdBankAccount: null }),
    });
  });

  it("blocks submission until the merchant accepts the terms in force", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.PENDING, level: 0 });
    prisma.merchantKycSubmission.findFirst.mockResolvedValue(null);
    const terms = { needsMerchantAcceptance: jest.fn().mockResolvedValue(true) };

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, terms as any, docsOk() as any);

    await expect(service.submit("m_1", submitDto)).rejects.toThrow("Términos y Condiciones");
    expect(terms.needsMerchantAcceptance).toHaveBeenCalledWith("m_1");
    expect(prisma.merchantKycSubmission.create).not.toHaveBeenCalled();
  });

  it("rejects a new submission while one is already pending review", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", status: MerchantStatus.PENDING, level: 0 });
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ id: "kyc_0", status: KycStatus.PENDING_REVIEW });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.submit("m_1", submitDto)).rejects.toThrow(BadRequestException);
  });

  it("accepts a level 1 submission without NIT when all three photos are there", async () => {
    const prisma = kycPrisma({ id: "m_1", status: "PENDING", level: 0 });
    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await service.submit("m_1", person as any);
    expect(prisma.merchantKycSubmission.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetLevel: 1, taxId: null, ciFrontDocId: "d1" }) });
  });

  it("rejects level 1 without the photos and level 2 without NIT", async () => {
    const service = new KycService(kycPrisma({ id: "m_1", status: "PENDING", level: 0 }) as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.submit("m_1", { ...person, selfieDocId: undefined } as any)).rejects.toThrow("Sube las dos caras de tu CI y una selfie con tu CI");
    await expect(service.submit("m_1", { ...person, targetLevel: 2 } as any)).rejects.toThrow("Para el nivel Negocio necesitamos NIT, razón social y representante legal");
  });

  it("lets an ACTIVE level 1 merchant apply for level 2 but not re-apply for level 1", async () => {
    const prisma = kycPrisma({ id: "m_1", status: "ACTIVE", level: 1 });
    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.submit("m_1", person as any)).rejects.toThrow("Ya tienes este nivel");
    await service.submit("m_1", { ...person, targetLevel: 2, taxId: "1023456028", legalRepName: "Juana Mamani" } as any);
    expect(prisma.merchantKycSubmission.create).toHaveBeenCalledTimes(1);
  });

  it("lets a grandfathered level 2 merchant apply for nothing lower", async () => {
    const service = new KycService(kycPrisma({ id: "m_1", status: "ACTIVE", level: 2 }) as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.submit("m_1", { ...person, targetLevel: 2, taxId: "1023456028", legalRepName: "X" } as any)).rejects.toThrow("Ya tienes este nivel");
  });
});

describe("KycService.review", () => {
  it("approving a submission activates the merchant and attributes it to the reviewing actor", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", level: 0 });
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.PENDING_REVIEW,
      targetLevel: 2,
    });
    prisma.merchantKycSubmission.update.mockResolvedValue({ id: "kyc_1", status: KycStatus.APPROVED });
    const auditLog = makeFakeAuditLog();

    const service = new KycService(prisma as any, auditLog as any, termsAccepted() as any, docsOk() as any);
    await service.review("kyc_1", { decision: KycStatus.APPROVED }, actor);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { status: MerchantStatus.ACTIVE, level: 2 },
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

  it("approving a level 1 submission raises the merchant to level 1", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", level: 0 });
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.PENDING_REVIEW,
      targetLevel: 1,
    });
    prisma.merchantKycSubmission.update.mockResolvedValue({ id: "kyc_1", status: KycStatus.APPROVED });
    const auditLog = makeFakeAuditLog();

    const service = new KycService(prisma as any, auditLog as any, termsAccepted() as any, docsOk() as any);
    await service.review("kyc_1", { decision: KycStatus.APPROVED }, actor);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { status: MerchantStatus.ACTIVE, level: 1 },
    });
  });

  it("never lowers the merchant's level when approving a stale lower-level submission", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", level: 3 });
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.PENDING_REVIEW,
      targetLevel: 1,
    });
    prisma.merchantKycSubmission.update.mockResolvedValue({ id: "kyc_1", status: KycStatus.APPROVED });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await service.review("kyc_1", { decision: KycStatus.APPROVED }, actor);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { status: MerchantStatus.ACTIVE, level: 3 },
    });
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

    const service = new KycService(prisma as any, auditLog as any, termsAccepted() as any, docsOk() as any);
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

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.review("missing", { decision: KycStatus.APPROVED }, actor)).rejects.toThrow(NotFoundException);
  });

  it("throws when reviewing a submission that was already decided", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantKycSubmission.findUnique.mockResolvedValue({
      id: "kyc_1",
      merchantId: "m_1",
      status: KycStatus.APPROVED,
    });

    const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
    await expect(service.review("kyc_1", { decision: KycStatus.APPROVED }, actor)).rejects.toThrow(BadRequestException);
  });
});
