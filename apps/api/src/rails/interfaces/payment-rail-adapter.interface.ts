import { PaymentMethodType } from "@prisma/client";
import type { RailId } from "@pagosya/shared-types";

export interface RailAuthorizeRequest {
  paymentIntentId: string;
  amount: number;
  currency: string;
  paymentMethod: { type: PaymentMethodType; token: string; metadata?: Record<string, unknown> };
  idempotencyKey: string;
}

export interface RailCaptureRequest {
  railReference: string;
  amount: number;
  idempotencyKey: string;
}

export interface RailRefundRequest {
  railReference: string;
  amount: number;
  reason?: string;
  idempotencyKey: string;
}

export type RailResultStatus = "succeeded" | "failed" | "pending" | "requires_action";

export interface RailResult {
  status: RailResultStatus;
  railReference: string;
  raw: Record<string, unknown>;
  failureReason?: string;
  actionRequired?: {
    type: "redirect" | "qr_display" | "ussd_prompt";
    data: Record<string, unknown>;
  };
}

export interface PaymentRailAdapter {
  readonly railId: RailId;
  readonly supportedMethodTypes: PaymentMethodType[];
  authorize(req: RailAuthorizeRequest): Promise<RailResult>;
  capture(req: RailCaptureRequest): Promise<RailResult>;
  refund(req: RailRefundRequest): Promise<RailResult>;
  getStatus(railReference: string): Promise<RailResult>;
}
