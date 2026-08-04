import { Injectable } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import {
  PaymentRailAdapter,
  RailAuthorizeRequest,
  RailCaptureRequest,
  RailRefundRequest,
  RailResult,
} from "../interfaces/payment-rail-adapter.interface";
import { generateRailReference, outcomeResult, simulateLatency } from "./mock-rail.util";

/**
 * Simulates a bank transfer rail (e.g. BNB). Bank confirmations are
 * asynchronous in reality, so authorize() returns `requires_action`
 * (redirect to the bank's confirmation page) unless a shortcut token is used.
 */
@Injectable()
export class MockBankTransferRailAdapter implements PaymentRailAdapter {
  readonly railId = "mock_bank_transfer" as const;
  readonly supportedMethodTypes = [PaymentMethodType.BANK_TRANSFER];

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    await simulateLatency();
    const railReference = generateRailReference("bank_auth");
    const token = req.paymentMethod.token;

    if (token.includes("decline")) {
      return outcomeResult("mock_bank_transfer", railReference, "failed", {
        failureReason: "insufficient_funds",
      });
    }
    if (token.includes("instant_success")) {
      return outcomeResult("mock_bank_transfer", railReference, "succeeded");
    }
    return outcomeResult("mock_bank_transfer", railReference, "requires_action", {
      actionRequired: {
        type: "redirect",
        data: { redirectUrl: `https://bank.mock.pagosya.bo/confirm/${railReference}` },
      },
    });
  }

  async capture(req: RailCaptureRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_bank_transfer", req.railReference, "succeeded");
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_bank_transfer", req.railReference, "succeeded");
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return outcomeResult("mock_bank_transfer", railReference, "requires_action");
  }
}
