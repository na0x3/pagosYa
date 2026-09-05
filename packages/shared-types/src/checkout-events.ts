// postMessage envelope exchanged between packages/widget-js (parent frame)
// and apps/checkout (iframe). `source` lets the widget ignore unrelated
// postMessage traffic on the page; origin-checking is the caller's job.

export type CheckoutEventType =
  | "CHECKOUT_READY"
  | "CHECKOUT_RESIZE"
  | "STORE_PREVIEW_SCROLL_BOUNDARY"
  | "STORE_PREVIEW_EXTERNAL_LINK"
  | "STORE_EDITOR_PAGE_CONTEXT"
  | "STORE_EDITOR_SELECT"
  | "STORE_EDITOR_INLINE_TEXT"
  | "STORE_EDITOR_INLINE_IMAGE"
  | "STORE_EDITOR_ANIMATION_LAYOUT"
  | "STORE_EDITOR_SITE_TEXT_LAYOUT"
  | "STORE_EDITOR_SECTION_HEIGHT"
  | "STORE_EDITOR_MOVE_TEXT_SECTION"
  | "STORE_EDITOR_ANIMATION_BUTTON_LAYOUT"
  | "STORE_EDITOR_LOCATION_MAP"
  | "STORE_EDITOR_DELETE_LOCATION"
  | "STORE_EDITOR_DELETE_ANIMATION"
  | "STORE_EDITOR_DELETE_SECTION"
  | "STORE_EDITOR_ANNOUNCEMENT_STYLE"
  | "STORE_EDITOR_ANNOUNCEMENT_REMOVE"
  | "STORE_EDITOR_INSERT_SECTION"
  | "STORE_EDITOR_UNDO"
  | "STORE_EDITOR_COPY_TEXT"
  | "STORE_EDITOR_PASTE_TEXT"
  | "STORE_EDITOR_TEXT_STYLE"
  | "STORE_EDITOR_ANIMATION_FIELD"
  | "STORE_EDITOR_SITE_FIELD"
  | "STORE_EDITOR_SITE_PRODUCTS"
  | "STORE_EDITOR_NAVIGATION_FIELD"
  | "STORE_EDITOR_NAVIGATION_STYLE"
  | "STORE_EDITOR_COLLECTION_FIELD"
  | "STORE_EDITOR_FOOTER_FIELD"
  | "STORE_EDITOR_FOOTER_STRUCTURE"
  | "STORE_EDITOR_SECTION_LOCK"
  | "STORE_EDITOR_SECTION_STYLE"
  | "STORE_EDITOR_ADD_TEXT"
  | "STORE_EDITOR_DUPLICATE_TEXT"
  | "STORE_EDITOR_DELETE_TEXT"
  | "STORE_EDITOR_MOVE_SECTION"
  | "STORE_EDITOR_CREATE_CATEGORY"
  | "STORE_EDITOR_CREATE_PRODUCT"
  | "STORE_EDITOR_UPDATE_PRODUCT_RECOMMENDATIONS"
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
