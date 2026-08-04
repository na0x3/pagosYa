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
 * Simulates Tigo Money, a USSD-prompt-confirmed rail: authorize() usually
 * returns `requires_action` (the real flow: customer confirms on their
 * phone), resolved later via the internal rail-callback endpoint.
 *   tok_tigo_instant_success -> succeeds synchronously (skip the prompt)
 *   tok_tigo_decline         -> declined synchronously
 *   anything else            -> requires_action (ussd_prompt)
 */
@Injectable()
export class MockTigoMoneyAdapter implements PaymentRailAdapter {
  readonly railId = "mock_tigo_money" as const;
  readonly supportedMethodTypes = [PaymentMethodType.TIGO_MONEY];

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    await simulateLatency();
    const railReference = generateRailReference("tigo_auth");
    const token = req.paymentMethod.token;

    if (token.includes("decline")) {
      return outcomeResult("mock_tigo_money", railReference, "failed", {
        failureReason: "customer_declined",
      });
    }
    if (token.includes("instant_success")) {
      return outcomeResult("mock_tigo_money", railReference, "succeeded");
    }
    return outcomeResult("mock_tigo_money", railReference, "requires_action", {
      actionRequired: {
        type: "ussd_prompt",
        data: { message: "Confirme el pago en su celular Tigo Money" },
      },
    });
  }

  async capture(req: RailCaptureRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_tigo_money", req.railReference, "succeeded");
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_tigo_money", req.railReference, "succeeded");
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return outcomeResult("mock_tigo_money", railReference, "requires_action");
  }
}
