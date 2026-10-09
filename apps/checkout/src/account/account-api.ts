/** Client of the per-store customer API (apps/api/src/store-customers). Bearer tokens only: no cookies, nothing cross-site. */
import { API_BASE_URL } from "../api";

export type CustomerProfile = { id: string; storeId: string; email: string; name: string; phone: string | null; addresses: CustomerAddress[]; emailVerifiedAt: string | null };
export type CustomerAddress = { id: string; label: string; recipient: string; phone: string; department: string; city: string; street: string; references: string };
export type CustomerOrder = { id: string; status: string; amount: number; currency: string; createdAt: string; items: unknown; fulfillmentMethod?: string | null };
export type CustomerSubscription = { id: string; status: string; itemName: string | null; quantity: number | null; cadence: string | null; startedAt?: string; nextBillingAt: string | null; canceledAt?: string | null };
export type MemberPeriod = { id: string; months: number; label: string; amount?: number };
export type MemberView = { id: string; productId: string; name: string; state: "ACTIVE" | "GRACE" | "LAPSED" | "CANCELED_ACTIVE" | "CANCELED"; stateLabel: string;
  accessUntil: string | null; nextBillingAt: string | null; amount: number; currency: string; period: MemberPeriod | null; pendingPeriod: MemberPeriod | null;
  periods: Array<MemberPeriod & { amount: number }>; renewalUrl: string | null };
export type CustomerSession = { token: string; expiresAt: string; customer: CustomerProfile };

export class AccountError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Options = { method?: string; body?: unknown; token?: string };
async function call<T>(slug: string, path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/customers/${path}`, {
      method: options.method ?? "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch { throw new AccountError("No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.", 0); }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : Array.isArray(data.message) && typeof data.message[0] === "string" ? data.message[0] : "No pudimos completar la operación.";
    throw new AccountError(message, response.status);
  }
  return data as T;
}

export const accountApi = {
  register: (slug: string, body: { name: string; email: string; password: string }) => call<{ message: string }>(slug, "register", { method: "POST", body }),
  verifyEmail: (slug: string, token: string) => call<{ ok: true }>(slug, "verify-email", { method: "POST", body: { token } }),
  login: (slug: string, body: { email: string; password: string }) => call<CustomerSession>(slug, "login", { method: "POST", body }),
  logout: (slug: string, token: string) => call<{ ok: true }>(slug, "logout", { method: "POST", token }),
  forgotPassword: (slug: string, email: string) => call<{ message: string }>(slug, "forgot-password", { method: "POST", body: { email } }),
  resetPassword: (slug: string, body: { token: string; password: string }) => call<{ ok: true }>(slug, "reset-password", { method: "POST", body }),
  me: (slug: string, token: string) => call<CustomerProfile>(slug, "me", { token }),
  updateProfile: (slug: string, token: string, body: { name: string; phone: string }) => call<CustomerProfile>(slug, "me", { method: "PATCH", token, body }),
  replaceAddresses: (slug: string, token: string, addresses: Array<Partial<CustomerAddress>>) => call<CustomerAddress[]>(slug, "me/addresses", { method: "PUT", token, body: { addresses } }),
  orders: (slug: string, token: string) => call<CustomerOrder[]>(slug, "me/orders", { token }),
  subscriptions: (slug: string, token: string) => call<CustomerSubscription[]>(slug, "me/subscriptions", { token }),
  memberships: (slug: string, token: string) => call<MemberView[]>(slug, "me/memberships", { token }),
  joinMembership: (slug: string, token: string, body: { productId: string; periodId: string; consent: true }) => call<{ checkoutUrl: string }>(slug, "me/memberships", { method: "POST", token, body }),
  membershipAction: (slug: string, token: string, id: string, action: "cancel" | "resume" | "period", periodId?: string) => call<MemberView>(slug, `me/memberships/${encodeURIComponent(id)}/${action}`, { method: "POST", token, body: periodId ? { periodId } : {} }),
  exportData: (slug: string, token: string) => call<Record<string, unknown>>(slug, "me/export", { token }),
  deleteAccount: (slug: string, token: string, password: string) => call<{ ok: true }>(slug, "me", { method: "DELETE", token, body: { password } }),
};
