import { PaymentMethodType } from "@pagosya/shared-types";

const COUNTRIES: { code: string; name: string }[] = [
  { code: "AR", name: "Argentina" },
  { code: "BR", name: "Brasil" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "EC", name: "Ecuador" },
  { code: "GT", name: "Guatemala" },
  { code: "MX", name: "México" },
  { code: "PA", name: "Panamá" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Perú" },
  { code: "DO", name: "República Dominicana" },
  { code: "UY", name: "Uruguay" },
];

/** Countries offered to foreign shoppers. Trim to what the dLocal contract actually covers. */
export const INTERNATIONAL_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, "es"));

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function formatDualAmount(originalAmount: number, originalCurrency: string, usdAmount: number): string {
  const original = originalCurrency === "BOB" ? `Bs ${money(originalAmount)}` : `${originalCurrency} ${money(originalAmount)}`;
  return `${original} ≈ ${formatUsd(usdAmount)}`;
}

export function formatUsd(usdAmountCents: number): string {
  return `USD ${money(usdAmountCents)}`;
}

const storageKey = (paymentIntentId: string) => `pagosya:intl-return:${paymentIntentId}`;

export function rememberReturn(storage: Pick<Storage, "setItem">, paymentIntentId: string, clientSecret: string): void {
  try {
    storage.setItem(storageKey(paymentIntentId), clientSecret);
  } catch {
    // Private mode: the return page falls back to the "we'll email you" state.
  }
}

export function recallReturn(storage: Pick<Storage, "getItem" | "removeItem">, paymentIntentId: string): string | null {
  try {
    const secret = storage.getItem(storageKey(paymentIntentId));
    storage.removeItem(storageKey(paymentIntentId));
    return secret;
  } catch {
    return null;
  }
}

/**
 * A rail's redirect URL is navigated to directly (popup or top window), so only
 * absolute https URLs qualify; http is allowed in development, where the dLocal
 * fixture redirects back to the local checkout. Anything else (javascript:,
 * data:, relative) must never be followed.
 */
export function isNavigableRedirect(redirectUrl: string, allowHttp: boolean): boolean {
  try {
    const { protocol } = new URL(redirectUrl);
    return protocol === "https:" || (allowHttp && protocol === "http:");
  } catch {
    return false;
  }
}

export function parseReturnParams(search: string): { paymentIntentId: string } | null {
  const params = new URLSearchParams(search);
  const paymentIntentId = params.get("pi");
  return params.get("intl_return") === "1" && paymentIntentId ? { paymentIntentId } : null;
}

export function tokenForMethod(method: { id: string; kind: "CARD" | "LOCAL_METHOD" }) {
  const type = method.kind === "CARD" ? PaymentMethodType.CARD : PaymentMethodType.LOCAL_METHOD;
  return { type, token: `dlocal:${method.id}`, metadata: { dlocalPaymentMethodId: method.id } };
}
