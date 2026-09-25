import { createHmac, timingSafeEqual } from "crypto";

/** Its own context: an order-tracking token for the same id never opens a document. */
const TOKEN_CONTEXT = "pagosya-business-document-link-v1";

export const DEVELOPMENT_DOCUMENT_LINK_SECRET = "development-only-document-link-secret-change-me";

function signature(documentId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${documentId}`).digest();
}

/**
 * The link a customer receives for a cobro, proposal or contract. It names the
 * document, not a version: the page always shows the latest sent version, and
 * voiding the document is how a link is revoked.
 */
export function createDocumentLinkToken(documentId: string, secret: string): string {
  const encodedId = Buffer.from(documentId, "utf8").toString("base64url");
  return `${encodedId}.${signature(documentId, secret).toString("base64url")}`;
}

export function readDocumentLinkToken(token: string, secret: string): string | null {
  const [encodedId, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !encodedSignature || rest.length) return null;
  try {
    const documentId = Buffer.from(encodedId, "base64url").toString("utf8");
    if (!/^c[a-z0-9]{20,40}$/i.test(documentId)) return null;
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(documentId, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    return documentId;
  } catch {
    return null;
  }
}
