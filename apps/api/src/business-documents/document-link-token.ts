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

/** Its own context, so a preview never opens as a customer link and a link never counts as a preview. */
const PREVIEW_CONTEXT = "pagosya-business-document-preview-v1";

function previewSignature(documentId: string, expiresAtSeconds: number, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${PREVIEW_CONTEXT}:${documentId}:${expiresAtSeconds}`).digest();
}

/**
 * The merchant's own look at a sent document. The public page opened with it
 * records no view; it expires, so a forwarded preview soon stops suppressing views.
 */
export function createDocumentPreviewToken(documentId: string, secret: string, expiresAt: Date): string {
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  const encodedId = Buffer.from(documentId, "utf8").toString("base64url");
  return `${encodedId}.${expiresAtSeconds}.${previewSignature(documentId, expiresAtSeconds, secret).toString("base64url")}`;
}

export function readDocumentPreviewToken(token: string, secret: string, now = new Date()): string | null {
  const [encodedId, expiry, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !expiry || !encodedSignature || rest.length || !/^\d{1,12}$/.test(expiry)) return null;
  try {
    const documentId = Buffer.from(encodedId, "base64url").toString("utf8");
    if (!/^c[a-z0-9]{20,40}$/i.test(documentId)) return null;
    const expiresAtSeconds = Number(expiry);
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = previewSignature(documentId, expiresAtSeconds, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    if (expiresAtSeconds * 1000 < now.getTime()) return null;
    return documentId;
  } catch {
    return null;
  }
}
