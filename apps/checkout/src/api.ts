import { PaymentIntent, PaymentMethodType } from "@pagosya/shared-types";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1";
const API_ROOT_URL = API_BASE_URL.replace(/\/v1\/?$/, "");

export interface CheckoutSession {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
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
  name: string;
  description: string | null;
  imageUrl: string | null;
  color: string | null;
  amount: number;
  currency: string;
}

export interface Store {
  storeId: string;
  storeName: string;
  logoUrl: string | null;
  backgroundColor: string | null;
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

export async function confirmPaymentIntent(
  paymentIntentId: string,
  clientSecret: string,
  paymentMethod: { type: PaymentMethodType; token: string },
): Promise<{ paymentIntent: PaymentIntent; railResult: { status: string; actionRequired?: unknown; failureReason?: string } }> {
  const response = await fetch(`${API_BASE_URL}/payment_intents/${paymentIntentId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clientSecret}` },
    body: JSON.stringify({ paymentMethod }),
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
