import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LegalDocumentKind, OpsRole, Prisma } from "@prisma/client";
import { LegalDocumentsService, kindFromSlug, sha256Hex } from "./legal-documents.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const now = new Date("2026-10-01T12:00:00Z");
const input = { kind: LegalDocumentKind.MERCHANT_TERMS, version: "2026-10-01", title: "Términos", body: "Texto", effectiveAt: now };

function makePrisma() {
  const prisma = {
    legalDocument: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function makeAuditLog() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

describe("kindFromSlug", () => {
  it("maps the public slugs and 404s anything else", () => {
    expect(kindFromSlug("merchant-terms")).toBe(LegalDocumentKind.MERCHANT_TERMS);
    expect(kindFromSlug("buyer-terms")).toBe(LegalDocumentKind.BUYER_TERMS);
    expect(kindFromSlug("privacy-policy")).toBe(LegalDocumentKind.PRIVACY_POLICY);
    expect(() => kindFromSlug("MERCHANT_TERMS")).toThrow(NotFoundException);
  });
});

describe("LegalDocumentsService.publish", () => {
  it("stores the server-computed hash and audits the publish in the same transaction", async () => {
    const prisma = makePrisma();
    const auditLog = makeAuditLog();
    prisma.legalDocument.create.mockImplementation(({ data }) => ({ id: "doc_1", ...data }));
    const service = new LegalDocumentsService(prisma as any, auditLog as any);

    const document = await service.publish(input, admin, now);

    expect(document.sha256).toBe(sha256Hex("Texto"));
    expect(document.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.legalDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ publishedByOpsUserId: "ops_1", publishedByLabel: "Ana <ana@pagosya.bo>" }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: "legal_document.publish", targetType: "LegalDocument", targetId: "doc_1" }),
    );
  });

  it("only lets an admin publish", async () => {
    const prisma = makePrisma();
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(service.publish(input, { ...admin, role: OpsRole.SUPPORT_AGENT }, now)).rejects.toThrow(ForbiddenException);
    expect(prisma.legalDocument.create).not.toHaveBeenCalled();
  });

  it("refuses to back-date a document by more than a minute", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.create.mockImplementation(({ data }) => ({ id: "doc_1", ...data }));
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(
      service.publish({ ...input, effectiveAt: new Date(now.getTime() - 61_000) }, admin, now),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.publish({ ...input, effectiveAt: new Date(now.getTime() - 30_000) }, admin, now),
    ).resolves.toMatchObject({ id: "doc_1" });
  });

  it("turns a duplicate version into a conflict", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" }),
    );
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(service.publish(input, admin, now)).rejects.toThrow(ConflictException);
  });
});

describe("LegalDocumentsService lookups", () => {
  it("current asks for the latest document already in force", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.findFirst.mockResolvedValue(null);

    await new LegalDocumentsService(prisma as any, makeAuditLog() as any).current(LegalDocumentKind.BUYER_TERMS, now);

    expect(prisma.legalDocument.findFirst).toHaveBeenCalledWith({
      where: { kind: LegalDocumentKind.BUYER_TERMS, effectiveAt: { lte: now } },
      orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
    });
  });

  it("upcoming asks for the next document not yet in force", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.findFirst.mockResolvedValue(null);

    await new LegalDocumentsService(prisma as any, makeAuditLog() as any).upcoming(LegalDocumentKind.BUYER_TERMS, now);

    expect(prisma.legalDocument.findFirst).toHaveBeenCalledWith({
      where: { kind: LegalDocumentKind.BUYER_TERMS, effectiveAt: { gt: now } },
      orderBy: [{ effectiveAt: "asc" }, { publishedAt: "desc" }],
    });
  });

  it("resolveAcceptable accepts the current or the upcoming version and nothing else", async () => {
    const prisma = makePrisma();
    const current = { id: "cur", version: "v1" };
    const upcoming = { id: "up", version: "v2" };
    prisma.legalDocument.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.effectiveAt.lte ? current : upcoming),
    );
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(service.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, "v1", now)).resolves.toBe(current);
    await expect(service.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, "v2", now)).resolves.toBe(upcoming);
    await expect(service.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, "v0", now)).rejects.toThrow(BadRequestException);
  });

  it("resolveAcceptable rejects everything when nothing is published", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.findFirst.mockResolvedValue(null);
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(service.resolveAcceptable(LegalDocumentKind.MERCHANT_TERMS, "v1", now)).rejects.toThrow(BadRequestException);
  });

  it("getVersion 404s an unknown version", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.findUnique.mockResolvedValue(null);
    const service = new LegalDocumentsService(prisma as any, makeAuditLog() as any);

    await expect(service.getVersion(LegalDocumentKind.MERCHANT_TERMS, "x")).rejects.toThrow(NotFoundException);
    expect(prisma.legalDocument.findUnique).toHaveBeenCalledWith({
      where: { kind_version: { kind: LegalDocumentKind.MERCHANT_TERMS, version: "x" } },
    });
  });

  it("list never returns bodies", async () => {
    const prisma = makePrisma();
    prisma.legalDocument.findMany.mockResolvedValue([]);

    await new LegalDocumentsService(prisma as any, makeAuditLog() as any).list();

    const [{ select }] = prisma.legalDocument.findMany.mock.calls[0];
    expect(select.body).toBeUndefined();
    expect(select.sha256).toBe(true);
  });
});
