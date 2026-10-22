import { normalizeCheckoutBranding, type CheckoutBranding } from '@pagosya/shared-types';
import { assetUrl } from './api';

/** The one calm checkout (spec 2026-10-20) takes only the store's name, logo, photo and accent: its background, fonts,
 *  button form and radius stay on the storefront. */
export function applyCheckoutBranding(_app: HTMLElement, value: CheckoutBranding | null | undefined) {
  // The body never takes store-branded-checkout: checkout-branding.css's #app rules would beat the shell.
  document.body.classList.remove('store-branded-checkout');
  if (!value) return null;
  const brand = normalizeCheckoutBranding(value, value.name);
  document.title = `${brand.name} · Pago seguro`;
  return { ...brand, logoUrl: brand.logoUrl ? assetUrl(brand.logoUrl) : null };
}
