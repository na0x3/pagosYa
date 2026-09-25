import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { createDocumentLinkToken, createDocumentPreviewToken, readDocumentLinkToken, readDocumentPreviewToken } from "./document-link-token";

describe("document link tokens", () => {
  const secret = "test-document-link-secret-with-at-least-32-chars";
  const id = "cmt3sw7rs000h45900a1woug3";

  it("round-trips a signed document id", () => {
    expect(readDocumentLinkToken(createDocumentLinkToken(id, secret), secret)).toBe(id);
  });

  it("rejects tampered, differently-signed and malformed tokens", () => {
    const token = createDocumentLinkToken(id, secret);
    expect(readDocumentLinkToken(`${token}x`, secret)).toBeNull();
    expect(readDocumentLinkToken(token, "another-secret-with-at-least-32-characters")).toBeNull();
    expect(readDocumentLinkToken("a.b.c", secret)).toBeNull();
    expect(readDocumentLinkToken("", secret)).toBeNull();
  });

  // Both links are signed the same way; a separate context keeps an order link
  // from ever opening a document with the same id, even with a shared secret.
  it("does not accept an order-tracking token signed with the same secret", () => {
    expect(readDocumentLinkToken(createOrderTrackingToken(id, secret), secret)).toBeNull();
  });
});

describe("document preview tokens", () => {
  const secret = "test-document-link-secret-with-at-least-32-chars";
  const id = "cmt3sw7rs000h45900a1woug3";
  const other = "cmt3sw7rs000h45900a1wouzz";
  const now = new Date("2026-09-25T12:00:00Z");
  const inTwoHours = new Date(now.getTime() + 2 * 3600_000);

  it("round-trips until it expires", () => {
    const token = createDocumentPreviewToken(id, secret, inTwoHours);
    expect(readDocumentPreviewToken(token, secret, now)).toBe(id);
    expect(readDocumentPreviewToken(token, secret, new Date(inTwoHours.getTime() + 1000))).toBeNull();
  });

  it("rejects a tampered expiry, another secret and malformed input", () => {
    const token = createDocumentPreviewToken(id, secret, inTwoHours);
    const [encodedId, , sig] = token.split(".");
    expect(readDocumentPreviewToken(`${encodedId}.${Math.floor(inTwoHours.getTime() / 1000) + 99999}.${sig}`, secret, now)).toBeNull();
    expect(readDocumentPreviewToken(token, "another-secret-with-at-least-32-characters", now)).toBeNull();
    expect(readDocumentPreviewToken("a.b", secret, now)).toBeNull();
    expect(readDocumentPreviewToken(createDocumentPreviewToken(other, secret, inTwoHours), secret, now)).toBe(other);
  });

  // A customer's link must never double as a preview, and a preview never opens as a link.
  it("is not interchangeable with a link token", () => {
    expect(readDocumentPreviewToken(createDocumentLinkToken(id, secret), secret, now)).toBeNull();
    expect(readDocumentLinkToken(createDocumentPreviewToken(id, secret, inTwoHours), secret)).toBeNull();
  });
});
