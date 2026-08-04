import { PaymentIntentStatus, PaymentMethodType } from "./enums";

export interface PaymentIntent {
  id: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  paymentMethodType: PaymentMethodType | null;
  clientSecret: string;
  livemode: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  railId: string | null;
  lastError: { message: string; railReference?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentIntentInput {
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfirmPaymentIntentInput {
  paymentMethod: {
    type: PaymentMethodType;
    token: string;
    metadata?: Record<string, unknown>;
  };
}

export interface CreateRefundInput {
  paymentIntentId: string;
  amount?: number;
  reason?: string;
}
