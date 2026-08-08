import { PaymentIntent, PaymentMethodType } from "@pagosya/shared-types";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1";
const API_ROOT_URL = API_BASE_URL.replace(/\/v1\/?$/, "");

export interface CheckoutSession {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  merchantName: string;
  metadata: Record<string, unknown> | null;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error((body as { message?: string })?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export async function fetchSession(clientSecret: string): Promise<CheckoutSession> {
  const url = new URL(`${API_BASE_URL}/checkout/session`);
  url.searchParams.set("client_secret", clientSecret);
  const response = await fetch(url);
  return parseOrThrow<CheckoutSession>(response);
}

/**
 * No-code entry point: a merchant with no developer shares this page's URL
 * directly (?link=<slug>) instead of embedding the widget. Any of a merchant's
 * link slugs opens their whole catalog (Store), not just that one item — a
 * customer buying several things adds them to one Cart and pays once.
 */
export interface StoreItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrls: string[];
  tags: string[];
  // null = unlimited/not tracked, 0 = genuinely sold out.
  stock: number | null;
  color: string | null;
  amount: number;
  currency: string;
  // Units sold via store-checkout carts — powers the "Más vendidos" sort.
  soldCount: number;
}

export interface StoreCategory {
  id: string;
  name: string;
}

/** Merchant-defined link button (social profile, catalog, map, ...) shown under the store header. */
export interface StoreLink {
  id: string;
  label: string;
  url: string;
}

export interface Store {
  storeId: string;
  storeName: string;
  tagline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  // Long-form brand story; blank lines separate paragraphs.
  aboutText: string | null;
  // "#RRGGBB" brand accent; null = default palette accent.
  accentColor: string | null;
  // "rounded" | "pill" | "square"
  buttonStyle: string;
  // Short promo/notice bar text shown at the very top of the storefront.
  announcement: string | null;
  links: StoreLink[];
  categories: StoreCategory[];
  items: StoreItem[];
}

/** Resolve a "/v1/uploads/..." path (product photo, store logo) against the API host. */
export function assetUrl(path: string | null): string | null {
  return path ? `${API_ROOT_URL}${path}` : null;
}

export async function fetchStore(slug: string): Promise<Store> {
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/store`);
  return parseOrThrow<Store>(response);
}

export interface CartCheckoutResult {
  clientSecret: string;
  storeName: string;
  cartDescription: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

/** This call is what would otherwise be a merchant backend's own POST /v1/payment_intents —
 * one PaymentIntent for the whole cart, so one QR/payment covers every item in it. */
export async function checkoutCart(
  slug: string,
  items: { paymentLinkId: string; quantity: number }[],
): Promise<CartCheckoutResult> {
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/cart-checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  return parseOrThrow<CartCheckoutResult>(response);
}

export interface CustomerContact {
  name: string;
  email: string;
  phone: string;
}

export async function confirmPaymentIntent(
  paymentIntentId: string,
  clientSecret: string,
  paymentMethod: { type: PaymentMethodType; token: string },
  customer: CustomerContact,
): Promise<{ paymentIntent: PaymentIntent; railResult: { status: string; actionRequired?: unknown; failureReason?: string } }> {
  const response = await fetch(`${API_BASE_URL}/payment_intents/${paymentIntentId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clientSecret}` },
    body: JSON.stringify({
      paymentMethod,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
    }),
  });
  return parseOrThrow(response);
}

export async function cancelPaymentIntent(clientSecret: string): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/checkout/session/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${clientSecret}` },
  });
  return parseOrThrow(response);
}

/**
 * Dev-only: stands in for the real bank/Tigo Money confirmation callback so
 * the requires_action path is testable without live rail infra. Never
 * reachable outside import.meta.env.DEV — see main.ts.
 */
export async function simulateRailCallback(
  railId: string,
  paymentIntentId: string,
  status: "succeeded" | "failed",
): Promise<void> {
  const internalSecret = import.meta.env.VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET;
  if (!internalSecret) throw new Error("VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET is not set");

  await fetch(`${API_ROOT_URL}/internal/rails/${railId}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${internalSecret}` },
    body: JSON.stringify({ paymentIntentId, status, railReference: `dev_sim_${Date.now()}` }),
  });
}
