/**
 * pagosYa-side contract for disbursing an AGGREGATOR merchant's payable
 * balance to their bank account. Modeled on PaymentRailAdapter/InvoicingProvider:
 * swap MockBankDisbursementAdapter for the partner bank's real disbursement
 * API once one exists, without touching PayoutsService/PayoutDeliveryWorker.
 */
export interface DisburseRequest {
  bankAccount: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export type PayoutResultStatus = "succeeded" | "failed";

export interface DisburseResult {
  status: PayoutResultStatus;
  railReference?: string;
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface PayoutProvider {
  disburse(req: DisburseRequest): Promise<DisburseResult>;
}
