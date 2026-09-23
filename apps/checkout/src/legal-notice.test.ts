import { describe, expect, it, vi } from "vitest";
import { fetchBuyerLegal, legalConfirmFields, legalNoticeHtml, parseBuyerLegal } from "./legal-notice";

describe("parseBuyerLegal", () => {
  it("reads the versions and ignores malformed payloads", () => {
    expect(parseBuyerLegal({ version: "v1" }, { version: "p1" })).toEqual({ termsVersion: "v1", privacyVersion: "p1" });
    expect(parseBuyerLegal({ version: "v1" }, null)).toEqual({ termsVersion: "v1", privacyVersion: null });
    expect(parseBuyerLegal(null, { version: "p1" })).toBeNull();
    expect(parseBuyerLegal({ version: 3 }, null)).toBeNull();
    expect(parseBuyerLegal({ version: "<script>" }, null)).toBeNull();
  });
});

describe("legalNoticeHtml", () => {
  it("renders nothing while no buyer terms are published", () => {
    expect(legalNoticeHtml(null)).toBe("");
  });

  it("links the exact versions the buyer is shown", () => {
    const html = legalNoticeHtml({ termsVersion: "v1", privacyVersion: "p1" }, "https://pagosya.bo");

    expect(html).toContain("Al pagar aceptas los");
    expect(html).toContain('href="https://pagosya.bo/terminos/compradores?version=v1"');
    expect(html).toContain('href="https://pagosya.bo/privacidad?version=p1"');
  });

  it("leaves the privacy link out when no policy is published", () => {
    expect(legalNoticeHtml({ termsVersion: "v1", privacyVersion: null })).not.toContain("privacidad");
  });
});

describe("legalConfirmFields", () => {
  it("sends only what was shown", () => {
    expect(legalConfirmFields(null)).toEqual({});
    expect(legalConfirmFields({ termsVersion: "v1", privacyVersion: null })).toEqual({ buyerTermsVersion: "v1" });
    expect(legalConfirmFields({ termsVersion: "v1", privacyVersion: "p1" })).toEqual({ buyerTermsVersion: "v1", buyerPrivacyVersion: "p1" });
  });
});

describe("fetchBuyerLegal", () => {
  it("reads both public documents", async () => {
    const fetchImpl = vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => ({ version: url.endsWith("buyer-terms") ? "v1" : "p1" }),
    }));

    await expect(fetchBuyerLegal("http://api/v1", fetchImpl as any)).resolves.toEqual({ termsVersion: "v1", privacyVersion: "p1" });
    expect(fetchImpl).toHaveBeenCalledWith("http://api/v1/legal/buyer-terms");
    expect(fetchImpl).toHaveBeenCalledWith("http://api/v1/legal/privacy-policy");
  });

  it("returns null instead of blocking the payment when the API fails", async () => {
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchBuyerLegal("http://api/v1", offline as any)).resolves.toBeNull();

    const unpublished = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(fetchBuyerLegal("http://api/v1", unpublished as any)).resolves.toBeNull();
  });
});
