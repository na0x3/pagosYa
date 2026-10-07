/**
 * The contract between the store that authors the confirmation email and the platform
 * that fills it. The author writes these attributes and never an order fact; the renderer
 * fills them from the payment intent. A model that cannot type a total cannot invent one.
 */
export const ORDER_EMAIL_TEMPLATE_PATH = 'emails/order-confirmation.html';

/** Authored template clamp. The rendered form gets its own, larger budget. */
export const ORDER_EMAIL_MAX_BYTES = 80 * 1024;
/** Rendered clamp. Gmail clips a message at 102 KB and hides everything after it. */
export const ORDER_EMAIL_RENDER_MAX_BYTES = 90 * 1024;

export const ORDER_EMAIL_SLOTS = [
  'data-order-greeting',
  'data-order-id',
  'data-order-items',
  'data-order-item',
  'data-order-item-name',
  'data-order-item-variant',
  'data-order-item-extras',
  'data-order-item-quantity',
  'data-order-item-amount',
  'data-order-total',
  'data-order-original-total',
  'data-order-tracking',
  'data-order-subscription',
  'data-order-appointment-name',
  'data-order-appointment-date',
  'data-store-name',
  'data-store-logo',
] as const;

/** Without these the document is not a receipt, and the floor is used instead. */
export const ORDER_EMAIL_REQUIRED_SLOTS = ['data-order-items', 'data-order-total'] as const;

/** Slots the renderer fills as an attribute rather than as text. */
export const ORDER_EMAIL_ATTRIBUTE_SLOTS: Record<string, 'href' | 'src'> = {
  'data-order-tracking': 'href',
  'data-store-logo': 'src',
};
