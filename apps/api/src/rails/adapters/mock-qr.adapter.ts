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
 * Simulates a QR rail (e.g. interoperable bank QR). authorize() returns
 * `requires_action` with a mock QR payload; a scan-and-pay confirmation
 * arrives later via the internal rail-callback endpoint.
 */
@Injectable()
export class MockQrRailAdapter implements PaymentRailAdapter {
  readonly railId = "mock_qr" as const;
  readonly supportedMethodTypes = [PaymentMethodType.QR];

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    await simulateLatency();
    const railReference = generateRailReference("qr_auth");
    const token = req.paymentMethod.token;

    if (token.includes("decline")) {
      return outcomeResult("mock_qr", railReference, "failed", {
        failureReason: "qr_expired",
      });
    }
    if (token.includes("instant_success")) {
      return outcomeResult("mock_qr", railReference, "succeeded");
    }
    return outcomeResult("mock_qr", railReference, "requires_action", {
      actionRequired: {
        type: "qr_display",
        data: { qrPayload: `00020101021126360014mock.pagosya.bo0110${railReference}` },
      },
    });
  }

  async capture(req: RailCaptureRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_qr", req.railReference, "succeeded");
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    await simulateLatency(50, 150);
    return outcomeResult("mock_qr", req.railReference, "succeeded");
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return outcomeResult("mock_qr", railReference, "requires_action");
  }
}
