import { NotFoundException } from "@nestjs/common";
import { LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import { LegalController } from "./legal.controller";
import { DashboardTermsController } from "./dashboard-terms.controller";
import { requestContext } from "./request-context";

const current = {
  id: "d1",
  kind: LegalDocumentKind.BUYER_TERMS,
  version: "v1",
  title: "Términos",
  body: "Texto",
  sha256: "hash",
  effectiveAt: new Date("2026-09-01T00:00:00Z"),
  publishedAt: new Date("2026-08-25T00:00:00Z"),
  publishedByOpsUserId: "ops_1",
  publishedByLabel: "Ana <ana@pagosya.bo>",
};

describe("LegalController", () => {
  it("returns the document in force with a summary of the next one, without internal fields", async () => {
    const next = { ...current, id: "d2", version: "v2", effectiveAt: new Date("2026-11-01T00:00:00Z") };
    const legal = { current: jest.fn().mockResolvedValue(current), upcoming: jest.fn().mockResolvedValue(next) };

    await expect(new LegalController(legal as any).current("buyer-terms")).resolves.toEqual({
      kind: "BUYER_TERMS",
      version: "v1",
      title: "Términos",
      body: "Texto",
      sha256: "hash",
      effectiveAt: current.effectiveAt,
      upcoming: { version: "v2", title: "Términos", effectiveAt: next.effectiveAt },
    });
    expect(legal.current).toHaveBeenCalledWith(LegalDocumentKind.BUYER_TERMS);
  });

  it("404s while nothing is in force", async () => {
    const legal = { current: jest.fn().mockResolvedValue(null), upcoming: jest.fn().mockResolvedValue(null) };

    await expect(new LegalController(legal as any).current("buyer-terms")).rejects.toThrow(NotFoundException);
  });

  it("404s an unknown kind before touching the database", async () => {
    const legal = { current: jest.fn(), upcoming: jest.fn() };

    await expect(new LegalController(legal as any).current("anything")).rejects.toThrow(NotFoundException);
    expect(legal.current).not.toHaveBeenCalled();
  });

  it("serves a historical version", async () => {
    const legal = { getVersion: jest.fn().mockResolvedValue(current) };

    await expect(new LegalController(legal as any).version("buyer-terms", "v1")).resolves.toMatchObject({ version: "v1", upcoming: null });
    expect(legal.getVersion).toHaveBeenCalledWith(LegalDocumentKind.BUYER_TERMS, "v1");
  });
});

describe("DashboardTermsController", () => {
  it("records a DASHBOARD acceptance for the signed-in person with the request's ip and user agent", async () => {
    const terms = { acceptMerchantTerms: jest.fn().mockResolvedValue({ needsAcceptance: false }) };
    const req = { merchant: { id: "m_1" }, merchantUser: { id: "u_1" }, ip: "1.2.3.4", headers: { "user-agent": "UA" } };

    await new DashboardTermsController(terms as any).accept(req, { version: "v1" });

    expect(terms.acceptMerchantTerms).toHaveBeenCalledWith({
      merchantId: "m_1",
      merchantUserId: "u_1",
      version: "v1",
      source: TermsAcceptanceSource.DASHBOARD,
      context: { ipAddress: "1.2.3.4", userAgent: "UA" },
    });
  });

  it("reports the signed-in merchant's status", async () => {
    const terms = { merchantStatus: jest.fn().mockResolvedValue({ needsAcceptance: true }) };
    const req = { merchant: { id: "m_1" }, merchantUser: { id: "u_1" }, headers: {} };

    await expect(new DashboardTermsController(terms as any).status(req)).resolves.toEqual({ needsAcceptance: true });
    expect(terms.merchantStatus).toHaveBeenCalledWith("m_1");
  });
});

describe("requestContext", () => {
  it("reads the ip and the first user-agent value", () => {
    expect(requestContext({ ip: "9.9.9.9", headers: { "user-agent": ["A", "B"] } })).toEqual({ ipAddress: "9.9.9.9", userAgent: "A" });
    expect(requestContext({ headers: {} })).toEqual({ ipAddress: null, userAgent: null });
  });
});
