// postMessage envelope exchanged between packages/widget-js (parent frame)
// and apps/checkout (iframe). `source` lets the widget ignore unrelated
// postMessage traffic on the page; origin-checking is the caller's job.

export type CheckoutEventType =
  | "CHECKOUT_READY"
  | "CHECKOUT_RESIZE"
  | "STORE_EDITOR_SELECT"
  | "STORE_EDITOR_INLINE_TEXT"
  | "STORE_EDITOR_INLINE_IMAGE"
  | "STORE_EDITOR_ANIMATION_LAYOUT"
  | "STORE_EDITOR_ANIMATION_BUTTON_LAYOUT"
  | "STORE_EDITOR_UNDO"
  | "STORE_EDITOR_COPY_TEXT"
  | "STORE_EDITOR_PASTE_TEXT"
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
