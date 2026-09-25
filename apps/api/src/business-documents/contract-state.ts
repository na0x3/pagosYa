import { BusinessDocumentStatus, Prisma } from "@prisma/client";
import type { DocumentListState } from "./dto/business-document.dto";
import type { DocumentSnapshot } from "./business-document-snapshot";
import { maskEmail, VERIFIED_TTL_MS } from "./contract-signing";

/**
 * Contract state shared by D0's service (list, view, public page, edit locks) and the
 * contracts service, kept free of Nest providers so neither service depends on the other.
 */

const S = BusinessDocumentStatus;

/** Sent and waiting for signatures. */
export const OPEN_CONTRACT: BusinessDocumentStatus[] = [S.SENT, S.VIEWED];

export function contractStateWhere(state: DocumentListState, now: Date): Prisma.BusinessDocumentWhereInput {
  if (state === "draft") return { status: S.DRAFT };
  if (state === "signed") return { status: S.SIGNED };
  if (state === "open") return { status: { in: OPEN_CONTRACT }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  if (state === "closed") return { OR: [{ status: { in: [S.EXPIRED, S.VOIDED] } }, { status: { in: OPEN_CONTRACT }, validUntil: { lt: now } }] };
  return { status: { in: [] } };
}

/** Past "Firmar antes de": closed, conditional (never over a signed or voided one), once per version. */
export async function expireContract(db: Pick<Prisma.TransactionClient, "businessDocument" | "businessDocumentEvent">, id: string, version: number, now = new Date()) {
  const { count } = await db.businessDocument.updateMany({
    where: { id, kind: "CONTRACT", status: { in: OPEN_CONTRACT }, validUntil: { lt: now } },
    data: { status: S.EXPIRED },
  });
  if (count) await db.businessDocumentEvent.createMany({ data: [{ documentId: id, type: "expired", version, dedupeKey: `expired:v${version}` }], skipDuplicates: true });
  return count > 0;
}

export type SignatureRow = {
  role: "MERCHANT" | "CUSTOMER";
  name: string;
  method: "TYPED" | "DRAWN";
  version: number;
  signedAt: Date;
  imageUrl?: string | null;
};

/** What the dashboard shows about the current version's signatures. */
export function signingSummary(signatures: SignatureRow[] | undefined, currentVersion: number) {
  const current = (signatures ?? []).filter((signature) => signature.version === currentVersion && currentVersion > 0);
  const merchant = current.find((signature) => signature.role === "MERCHANT") ?? null;
  const customer = current.find((signature) => signature.role === "CUSTOMER") ?? null;
  const pick = (signature: SignatureRow | null) => (signature ? { name: signature.name, method: signature.method, signedAt: signature.signedAt } : null);
  return { merchant: pick(merchant), customer: pick(customer), merchantSigned: Boolean(merchant), customerSigned: Boolean(customer) };
}

/** Who has to sign next, given the order the merchant chose. */
export function waitingFor(order: string, merchantSigned: boolean, customerSigned: boolean): "merchant" | "customer" | null {
  if (merchantSigned && customerSigned) return null;
  if (order === "customer_first") return customerSigned ? "merchant" : "customer";
  return merchantSigned ? "customer" : "merchant";
}

type EventDb = Pick<Prisma.TransactionClient, "businessDocumentEvent" | "businessDocumentSignature">;

/** The customer's view of the signing: who signed (names, drawings), what is next, where the code goes. */
export async function contractPublicFields(db: EventDb, doc: { id: string; status: BusinessDocumentStatus; currentVersion: number; validUntil: Date | null }, snapshot: DocumentSnapshot) {
  const [signatures, verified] = await Promise.all([
    db.businessDocumentSignature.findMany({ where: { documentId: doc.id, version: doc.currentVersion } }),
    db.businessDocumentEvent.findMany({ where: { documentId: doc.id, type: "sign_code_verified", version: doc.currentVersion } }),
  ]);
  const summary = signingSummary(signatures as SignatureRow[], doc.currentVersion);
  const order = snapshot.contract?.signingOrder ?? "merchant_first";
  const next = doc.status === S.SIGNED ? null : waitingFor(order, summary.merchantSigned, summary.customerSigned);
  const open = OPEN_CONTRACT.includes(doc.status);
  const email = snapshot.customer.email;
  const since = Date.now() - VERIFIED_TTL_MS;
  return {
    validUntil: doc.validUntil,
    signing: {
      order,
      waitingFor: next,
      signable: open && next === "customer",
      codeSentTo: email ? maskEmail(email) : null,
      verified: open && verified.some((event) => event.at.getTime() >= since),
      signatures: (signatures as SignatureRow[]).map((signature) => ({
        role: signature.role,
        name: signature.name,
        method: signature.method,
        signedAt: signature.signedAt,
        imageUrl: signature.method === "DRAWN" ? signature.imageUrl ?? null : null,
      })),
    },
  };
}
