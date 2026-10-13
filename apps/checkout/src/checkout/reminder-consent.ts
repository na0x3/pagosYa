/**
 * «Avísame» (spec 2026-10-13-abandoned-carts): under the email field of a store-cart payment whose store has cart
 * reminders on (the API decides: CheckoutSession.reminderAvailable). Unticked by default and disabled until there is
 * an email to write to; it takes effect when the shopper presses Pagar.
 */
export const REMINDER_CONSENT_LABEL = "Avísame por correo si no termino la compra";

export function reminderConsentHtml(available: boolean, checked: boolean, email: string): string {
  if (!available) return "";
  const enabled = Boolean(email.trim());
  return `<label class="reminder-consent" for="reminderConsent"><input id="reminderConsent" type="checkbox"${checked && enabled ? " checked" : ""}${enabled ? "" : " disabled"}><span>${REMINDER_CONSENT_LABEL}</span></label>`;
}
