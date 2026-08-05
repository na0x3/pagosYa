import { Injectable } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { DisburseRequest, DisburseResult, PayoutProvider } from "../interfaces/payout-provider.interface";

const referenceId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

function simulateLatency(minMs = 200, maxMs = 600): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Stands in for the partner bank's real disbursement/transfer-out API — no
 * such integration exists yet, this only makes the payout flow testable.
 * Test hook: a bankAccount containing "fail_disbursement" simulates the bank
 * rejecting the transfer (e.g. closed/invalid account), mirroring the mock
 * rail adapters' token-based failure convention.
 */
@Injectable()
export class MockBankDisbursementAdapter implements PayoutProvider {
  async disburse(req: DisburseRequest): Promise<DisburseResult> {
    await simulateLatency();

    if (req.bankAccount.includes("fail_disbursement")) {
      return { status: "failed", failureReason: "bank_account_rejected", raw: { mock: true } };
    }

    return {
      status: "succeeded",
      railReference: `payout_${referenceId()}`,
      raw: { mock: true, disbursedAt: new Date().toISOString() },
    };
  }
}
