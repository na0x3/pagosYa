// postMessage envelope exchanged between packages/widget-js (parent frame)
// and apps/checkout (iframe). `source` lets the widget ignore unrelated
// postMessage traffic on the page; origin-checking is the caller's job.

export type CheckoutEventType =
  | "CHECKOUT_READY"
  | "CHECKOUT_RESIZE"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELED";

export interface CheckoutEventEnvelope<T = unknown> {
  source: "pagosya-checkout";
  type: CheckoutEventType;
  payload: T;
}

export interface CheckoutResizePayload {
  height: number;
}

export interface PaymentProcessingPayload {
  paymentIntentId: string;
}

export interface PaymentSucceededPayload {
  paymentIntentId: string;
  status: "succeeded";
}

export interface PaymentFailedPayload {
  paymentIntentId: string;
  error: { message: string };
}

export interface PaymentCanceledPayload {
  paymentIntentId: string;
}
