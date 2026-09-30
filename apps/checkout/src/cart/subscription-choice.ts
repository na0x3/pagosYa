/** Compra única vs. Suscríbete y ahorra: the choice on a product page, its price rule and the consent wording. */
import type { StoreItem } from "../api";
import { parseCartItemKey, type CartCadence } from "../cart-state";
import { discountedProductAmount, selectedExtrasAmount } from "./cart";
import { escapeHtml, formatAmount } from "../ui/html";

const LABEL: Record<CartCadence, string> = { WEEKLY: "cada semana", BIWEEKLY: "cada dos semanas", MONTHLY: "cada mes" };
export const cadenceLabel = (cadence: CartCadence) => LABEL[cadence];

/** Same wording the API rejects with when a cart mixes frequencies. */
export const CADENCE_CONFLICT_MESSAGE = "Por ahora solo puedes suscribirte a una frecuencia por pedido. Separa las frecuencias en pedidos distintos.";

/** The message to show when `cadence` differs from a subscription line already in the cart, else null. */
export function cartCadenceConflict(cartKeys: Iterable<string>, cadence: CartCadence | null): string | null {
  if (!cadence) return null;
  for (const key of cartKeys) {
    const existing = parseCartItemKey(key).cadence;
    if (existing && existing !== cadence) return CADENCE_CONFLICT_MESSAGE;
  }
  return null;
}

export function subscriptionConsentText(cadence: CartCadence): string {
  return `Acepto que este pedido se repita ${LABEL[cadence]}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
}

/** Same rule as the API (subscriptionPrices): min(one-time, base − discount) + extras at full price. */
export function subscriptionUnitAmount(item: StoreItem, variant: StoreItem["variants"][number] | undefined, extras: StoreItem["extras"], cadence: CartCadence): number {
  const offer = item.subscriptionOptions?.find((option) => option.cadence === cadence);
  const base = variant?.amount ?? item.amount;
  const oneTime = discountedProductAmount(item, base);
  const unit = offer ? Math.min(oneTime, Math.round(base * (100 - offer.discountPercent) / 100)) : oneTime;
  return unit + selectedExtrasAmount(extras);
}

export function subscriptionChoiceHtml(item: StoreItem, selected: CartCadence | null, variant?: StoreItem["variants"][number], extras: StoreItem["extras"] = [], conflict: string | null = null): string {
  const offers = item.subscriptionOptions ?? [];
  if (!offers.length) return "";
  const best = Math.max(...offers.map((offer) => offer.discountPercent));
  const current = offers.find((offer) => offer.cadence === selected) ?? offers[offers.length - 1];
  const oneTime = discountedProductAmount(item, variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
  const subscribed = subscriptionUnitAmount(item, variant, extras, current.cadence);
  return `<fieldset class="subscription-choice">
    <legend class="sr-only">Cómo quieres comprarlo</legend>
    <label><input type="radio" name="purchaseMode" value="once" ${selected ? "" : "checked"}> <span>Compra única</span> <strong>${formatAmount(oneTime, item.currency)}</strong></label>
    <label><input type="radio" name="purchaseMode" value="subscribe" ${selected ? "checked" : ""}> <span>${best > 0 ? `Suscríbete y ahorra hasta ${best}%` : "Suscríbete"}</span> <strong>${formatAmount(subscribed, item.currency)} / ${escapeHtml(LABEL[current.cadence])}</strong></label>
    ${offers.length > 1 ? `<select name="subscriptionCadence" aria-label="Frecuencia" ${selected ? "" : "disabled"}>${offers.map((offer) => `<option value="${offer.cadence}" ${offer.cadence === current.cadence ? "selected" : ""}>${escapeHtml(LABEL[offer.cadence])}${offer.discountPercent ? ` · −${offer.discountPercent}%` : ""}</option>`).join("")}</select>` : `<input type="hidden" name="subscriptionCadence" value="${current.cadence}">`}
    ${conflict ? `<p class="subscription-choice__conflict" role="alert">${escapeHtml(conflict)}</p>` : ""}
    <p class="subscription-choice__note">Te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente. Cancela cuando quieras.</p>
  </fieldset>`;
}
