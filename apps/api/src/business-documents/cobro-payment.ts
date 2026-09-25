import { BusinessDocumentStatus, PaymentIntentStatus, Prisma } from "@prisma/client";

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
 * Three outcomes, one event each (keyed `paid:<paymentIntentId>`):
 * - `paid`: the cobro is open and the payment is exactly the frozen version the customer
 *   was shown (link version === currentVersion, same amount and currency). Only then PAID.
 * - `payment_after_close`: the cobro was already voided or paid by another checkout —
 *   nothing changes, the merchant sees it and refunds.
 * - `payment_mismatch`: the cobro is open but the payment was for another version (a
 *   checkout left on screen while the merchant re-sent a change) or another amount or
 *   currency. The status stays as it is; the merchant reconciles or refunds.
 *
 * Lock order: the caller already holds the PaymentIntent row (FOR UPDATE); this takes the
 * BusinessDocument row. pay() and void() take the document first and never *wait* for a
 * PaymentIntent lock (SKIP LOCKED), so the two orders can never deadlock.
 */
export async function markBusinessDocumentPaid(
  tx: Prisma.TransactionClient,
  intent: { id: string; amount: number; currency: string; livemode: boolean; metadata: unknown },
): Promise<void> {
  const link = businessDocumentLink(intent.metadata);
  if (!link) return;
  const doc = await tx.businessDocument.findUnique({ where: { id: link.documentId }, select: { id: true, status: true, currentVersion: true } });
  if (!doc) return;
  const base = { paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency, livemode: intent.livemode, statusBefore: doc.status };
  const record = (type: "paid" | "payment_after_close" | "payment_mismatch", extra: Record<string, unknown> = {}) =>
    tx.businessDocumentEvent.createMany({
      data: [{ documentId: doc.id, type, version: link.version, dedupeKey: `paid:${intent.id}`, data: { ...base, ...extra } as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
  if (!PAYABLE.includes(doc.status)) {
    await record("payment_after_close");
    return;
  }
  const latest = await tx.businessDocumentVersion.findUnique({
    where: { documentId_version: { documentId: doc.id, version: doc.currentVersion } },
    select: { content: true },
  });
  const frozen = latest?.content as { totalAmount?: unknown; currency?: unknown } | undefined;
  if (link.version !== doc.currentVersion || !frozen || frozen.totalAmount !== intent.amount || frozen.currency !== intent.currency) {
    await record("payment_mismatch", { currentVersion: doc.currentVersion, expectedAmount: frozen?.totalAmount ?? null, expectedCurrency: frozen?.currency ?? null });
    return;
  }
  // Conditional on status and version: a void or a re-send committed meanwhile wins.
  const { count } = await tx.businessDocument.updateMany({
    where: { id: doc.id, status: { in: PAYABLE }, currentVersion: link.version! },
    data: { status: S.PAID, paidAt: new Date(), paymentIntentId: intent.id },
  });
  await record(count ? "paid" : "payment_after_close");
}

/** A checkout the customer never started, or one that failed and could be retried. */
const CANCELABLE: PaymentIntentStatus[] = [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.FAILED];

/**
 * Closes a cobro's stale checkout (pay on a new version, void, "marcar como pagado").
 *
 * Lock order (the one rule that keeps pay/void/mark-paid and a capture from deadlocking):
 * - applyRailResult / confirm: PaymentIntent (FOR UPDATE, waits) → BusinessDocument (updateMany).
 * - pay / void / mark-paid:    BusinessDocument (FOR UPDATE or updateMany) → PaymentIntent
 *   with FOR UPDATE SKIP LOCKED — never waiting. A held intent is being confirmed or captured
 *   right now, so it is left to finish; the paid hook then records whatever it becomes.
 *
 * The cancel itself is conditional on the status, so a confirm that committed between the
 * caller's read and this lock is never overwritten. Returns whether it was canceled.
 */
export async function cancelStaleCheckout(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE SKIP LOCKED`;
  if (!locked.length) return false;
  const { count } = await tx.paymentIntent.updateMany({
    where: { id: paymentIntentId, status: { in: CANCELABLE } },
    data: { status: PaymentIntentStatus.CANCELED },
  });
  return count > 0;
}
