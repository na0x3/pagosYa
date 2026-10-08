import { PayoutStatus, Prisma } from "@prisma/client";

/**
 * A payout created but not yet delivered: PENDING (queued or being delivered), or FAILED and still due a retry
 * (PayoutDeliveryWorker sets nextRetryAt to null once a payout succeeds or exhausts its attempts, and to a lease
 * while an attempt is running — so this also covers the last attempt in progress). Its amount is still in
 * MERCHANT_PAYABLE (the payout journal posts only on success) but is already promised to the bank.
 */
export function inFlightPayoutWhere(merchantId: string, currency: string): Prisma.PayoutWhereInput {
  return {
    merchantId,
    currency,
    OR: [{ status: PayoutStatus.PENDING }, { status: PayoutStatus.FAILED, nextRetryAt: { not: null } }],
  };
}
