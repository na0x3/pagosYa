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
 * Simulates a card acquirer (Visa/Mastercard). Test tokens follow Stripe's
 * documented-test-card convention so behavior is both testable and directly
 * shareable in merchant-facing docs:
 *   tok_visa_success  -> authorizes immediately
 *   tok_visa_decline  -> declined synchronously
 *   tok_visa_error    -> simulated gateway error
 * Any other token defaults to success, so ad-hoc demo tokens still work.
 */
@Injectable()
export class MockCardRailAdapter implements PaymentRailAdapter {
  readonly railId = "mock_card" as const;
  readonly supportedMethodTypes = [PaymentMethodType.CARD];

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    await simulateLatency();
    const railReference = generateRailReference("card_auth");
    const token = req.paymentMethod.token;

    if (token.includes("decline")) {
      return outcomeResult("mock_card", railReference, "failed", {
        failureReason: "card_declined",
      });
    }
    if (token.includes("error")) {
      return outcomeResult("mock_card", railReference, "failed", {
        failureReason: "acquirer_error",
      });
    }
    return outcomeResult("mock_card", railReference, "succeeded");
  }

  async capture(req: RailCaptureRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_card", req.railReference, "succeeded");
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_card", req.railReference, "succeeded");
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return outcomeResult("mock_card", railReference, "succeeded");
  }
}
