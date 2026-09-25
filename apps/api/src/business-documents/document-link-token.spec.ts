import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { createDocumentLinkToken, readDocumentLinkToken } from "./document-link-token";

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
