import { BusinessDocumentStatus, Prisma } from "@prisma/client";

const S = BusinessDocumentStatus;

/** A cobro the customer is still expected to pay. */
const PAYABLE: BusinessDocumentStatus[] = [S.SENT, S.VIEWED, S.OVERDUE];

/** The cobro a PaymentIntent pays, from the metadata the pay endpoint wrote. */
export function businessDocumentLink(metadata: unknown): { documentId: string; version: number | null } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const link = (metadata as Record<string, unknown>).businessDocument;
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  const { documentId, version } = link as Record<string, unknown>;
  if (typeof documentId !== "string" || !documentId) return null;
  return { documentId, version: Number.isInteger(version) ? (version as number) : null };
}

/**
 * Runs inside the payment's success transaction (PaymentIntentsService.applyRailResult).
 * Nothing here may fail: a Postgres error would abort that transaction and roll back a
 * payment the rail already captured. So the status change is a conditional updateMany
 * and the event is a createMany that skips the once-per-payment duplicate.
 *
 * A payment for a cobro that is already closed (voided, or paid by another checkout)
 * changes nothing and is recorded as `payment_after_close`, so the merchant sees it and refunds.
 */
export async function markBusinessDocumentPaid(
  tx: Prisma.TransactionClient,
  intent: { id: string; amount: number; currency: string; livemode: boolean; metadata: unknown },
): Promise<void> {
  const link = businessDocumentLink(intent.metadata);
  if (!link) return;
  const doc = await tx.businessDocument.findUnique({ where: { id: link.documentId }, select: { id: true, status: true } });
  if (!doc) return;
  const { count } = await tx.businessDocument.updateMany({
    where: { id: doc.id, status: { in: PAYABLE } },
    data: { status: S.PAID, paidAt: new Date(), paymentIntentId: intent.id },
  });
  await tx.businessDocumentEvent.createMany({
    data: [{
      documentId: doc.id,
      type: count ? "paid" : "payment_after_close",
      version: link.version,
      dedupeKey: `paid:${intent.id}`,
      data: { paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency, livemode: intent.livemode, statusBefore: doc.status },
    }],
    skipDuplicates: true,
  });
}
