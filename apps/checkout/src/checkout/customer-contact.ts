/** Buyer contact details collected at checkout, and the remembered lead email. */
import { CustomerContact } from "../api";

export const CONSUMER_DASHBOARD_ORIGIN: string = import.meta.env.VITE_CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324";
// Survives renderForm() re-renders (e.g. switching payment method tabs) so
// typed contact info isn't lost mid-checkout.
export const customerContact: CustomerContact = { name: "", email: "", phone: "", deliveryRequested: false, deliveryAddress: "" };
// Keyed by field id so an error survives a payment-method tab switch
// (renderForm fully re-renders on every tab click) until the field is fixed.
export const contactFieldErrors: Partial<Record<"customerName" | "customerEmail" | "customerPhone" | "deliveryAddress", string>> = {};
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^[0-9+()\-\s]{6,}$/;

export function leadEmailStorageKey(storeId: string): string {
  return `pagosya_lead_email_${storeId}`;
}

export function loadLeadEmail(storeId: string): string {
  try {
    return sessionStorage.getItem(leadEmailStorageKey(storeId)) || "";
  } catch {
    return "";
  }
}

export function saveLeadEmail(storeId: string, email: string): void {
  try {
    sessionStorage.setItem(leadEmailStorageKey(storeId), email);
  } catch {
    // The form still prefills for the current render when storage is blocked.
  }
}
