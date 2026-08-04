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
