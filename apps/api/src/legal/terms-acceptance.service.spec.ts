import { BadRequestException } from "@nestjs/common";
import { LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import { TermsAcceptanceService, truncateUserAgent } from "./terms-acceptance.service";

const now = new Date("2026-10-01T12:00:00Z");
const doc = (id: string, version: string, effectiveAt: string) => ({
  id,
  version,
  kind: LegalDocumentKind.MERCHANT_TERMS,
  title: `Términos ${version}`,
  effectiveAt: new Date(effectiveAt),
  sha256: `hash_${id}`,
});

function setup({ current = null as unknown, upcoming = null as unknown, accepted = [] as unknown[] } = {}) {
  const prisma = {
    merchantTermsAcceptance: {
      findMany: jest.fn().mockResolvedValue(accepted),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const legal = {
    current: jest.fn().mockResolvedValue(current),
    upcoming: jest.fn().mockResolvedValue(upcoming),
    resolveAcceptable: jest.fn(),
  };
  return { prisma, legal, service: new TermsAcceptanceService(prisma as any, legal as any) };
}

describe("TermsAcceptanceService.merchantStatus", () => {
  it("asks for nothing while no merchant terms are in force", async () => {
    const { service } = setup();

    await expect(service.merchantStatus("m_1", now)).resolves.toEqual({
      current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false,
    });
  });

  it("asks a merchant who never accepted", async () => {
    const { service } = setup({ current: doc("d1", "v1", "2026-09-01T00:00:00Z") });

    await expect(service.merchantStatus("m_1", now)).resolves.toMatchObject({ acceptedVersion: null, needsAcceptance: true });
  });

  it("asks again when only an older version was accepted", async () => {
    const { service } = setup({
      current: doc("d2", "v2", "2026-09-01T00:00:00Z"),
      accepted: [{ document: doc("d1", "v1", "2026-01-01T00:00:00Z") }],
    });

    await expect(service.merchantStatus("m_1", now)).resolves.toMatchObject({ acceptedVersion: "v1", needsAcceptance: true });
  });

  it("counts a version accepted early once it comes into force", async () => {
    const current = doc("d2", "v2", "2026-09-01T00:00:00Z");
    const { service } = setup({ current, accepted: [{ document: current }] });

    await expect(service.merchantStatus("m_1", now)).resolves.toMatchObject({ acceptedVersion: "v2", needsAcceptance: false });
  });

  it("lets an accepted upcoming version cover the one in force today", async () => {
    const upcoming = doc("d3", "v3", "2026-11-01T00:00:00Z");
    const { service } = setup({ current: doc("d2", "v2", "2026-09-01T00:00:00Z"), upcoming, accepted: [{ document: upcoming }] });

    await expect(service.merchantStatus("m_1", now)).resolves.toMatchObject({
      acceptedVersion: "v3",
      needsAcceptance: false,
      upcoming: { version: "v3", title: "Términos v3", effectiveAt: upcoming.effectiveAt, sha256: "hash_d3" },
    });
  });

  it("only looks at merchant terms acceptances", async () => {
    const { service, prisma } = setup();

    await service.merchantStatus("m_1", now);

    expect(prisma.merchantTermsAcceptance.findMany).toHaveBeenCalledWith({
      where: { merchantId: "m_1", document: { kind: LegalDocumentKind.MERCHANT_TERMS } },
      include: { document: true },
    });
  });
});

describe("TermsAcceptanceService.acceptMerchantTerms", () => {
  it("records one row per merchant and document, keeping the first as evidence", async () => {
    const current = doc("d2", "v2", "2026-09-01T00:00:00Z");
    const { service, legal, prisma } = setup({ current });
    legal.resolveAcceptable.mockResolvedValue(current);

    await service.acceptMerchantTerms({
      merchantId: "m_1",
      merchantUserId: "u_1",
      version: "v2",
      source: TermsAcceptanceSource.DASHBOARD,
      context: { ipAddress: "1.2.3.4", userAgent: "UA" },
      now,
    });

    expect(legal.resolveAcceptable).toHaveBeenCalledWith(LegalDocumentKind.MERCHANT_TERMS, "v2", now);
    expect(prisma.merchantTermsAcceptance.upsert).toHaveBeenCalledWith({
      where: { merchantId_documentId: { merchantId: "m_1", documentId: "d2" } },
      create: {
        merchantId: "m_1",
        merchantUserId: "u_1",
        documentId: "d2",
        source: TermsAcceptanceSource.DASHBOARD,
        ipAddress: "1.2.3.4",
        userAgent: "UA",
      },
      update: {},
    });
  });

  it("does not record a stale version", async () => {
    const { service, legal, prisma } = setup();
    legal.resolveAcceptable.mockRejectedValue(new BadRequestException("stale"));

    await expect(service.acceptMerchantTerms({
      merchantId: "m_1", version: "v0", source: TermsAcceptanceSource.DASHBOARD, context: {}, now,
    })).rejects.toThrow(BadRequestException);
    expect(prisma.merchantTermsAcceptance.upsert).not.toHaveBeenCalled();
  });
});

describe("TermsAcceptanceService.resolveBuyerDocuments", () => {
  it("returns nothing when the checkout sent no version", async () => {
    const { service, legal } = setup();

    await expect(service.resolveBuyerDocuments({}, now)).resolves.toBeNull();
    expect(legal.resolveAcceptable).not.toHaveBeenCalled();
  });

  it("rejects a privacy version sent without the terms version", async () => {
    const { service } = setup();

    await expect(service.resolveBuyerDocuments({ privacy: "p1" }, now)).rejects.toThrow(BadRequestException);
  });

  it("resolves the buyer terms and the privacy policy", async () => {
    const { service, legal } = setup();
    legal.resolveAcceptable.mockResolvedValueOnce({ id: "t1" }).mockResolvedValueOnce({ id: "p1" });

    await expect(service.resolveBuyerDocuments({ terms: "v1", privacy: "v1" }, now))
      .resolves.toEqual({ termsDocumentId: "t1", privacyDocumentId: "p1" });
    expect(legal.resolveAcceptable).toHaveBeenNthCalledWith(1, LegalDocumentKind.BUYER_TERMS, "v1", now);
    expect(legal.resolveAcceptable).toHaveBeenNthCalledWith(2, LegalDocumentKind.PRIVACY_POLICY, "v1", now);
  });

  it("allows the terms without a privacy version", async () => {
    const { service, legal } = setup();
    legal.resolveAcceptable.mockResolvedValueOnce({ id: "t1" });

    await expect(service.resolveBuyerDocuments({ terms: "v1" }, now)).resolves.toEqual({ termsDocumentId: "t1", privacyDocumentId: null });
  });
});

describe("truncateUserAgent", () => {
  it("caps at 512 characters and maps absence to null", () => {
    expect(truncateUserAgent("x".repeat(600))).toHaveLength(512);
    expect(truncateUserAgent("short")).toBe("short");
    expect(truncateUserAgent(undefined)).toBeNull();
    expect(truncateUserAgent("")).toBeNull();
  });
});
