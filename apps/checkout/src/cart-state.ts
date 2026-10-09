import type { Store, StoreItem } from "./api";
import { subscriptionsAvailable } from "./cart/subscription-choice";
const CART_VARIANT_SEPARATOR = "::";
const CART_EXTRAS_SEPARATOR = "~~";
const CART_CADENCE_SEPARATOR = "@@";

type SelectableExtra = Store["items"][number]["extras"][number];

/** One extra per selection, in the product's order. Ids repeat only inside a "choose N" group. */
export function pickedExtras<T extends SelectableExtra>(extras: T[], extraIds: string[]): T[] {
  return extras.flatMap((extra) => Array<T>(extraIds.filter((id) => id === extra.id).length).fill(extra));
}

/** Each "choose N" group with how many picks it has so far. */
export function pickGroups(extras: SelectableExtra[], extraIds: string[]) {
  const groups = new Map<string, { name: string; pickCount: number; picked: number; extras: SelectableExtra[] }>();
  for (const extra of extras) {
    if (!extra.groupName || !extra.pickCount) continue;
    const key = extra.groupName.trim().toLocaleLowerCase("es");
    const group = groups.get(key) ?? { name: extra.groupName, pickCount: extra.pickCount, picked: 0, extras: [] };
    group.extras.push(extra);
    group.picked += extraIds.filter((id) => id === extra.id).length;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** "Matcha ×2 · Pistacho ×2"; a single pick keeps its plain name. */
export function pickedExtrasLabel(extras: Array<{ id?: string; name: string }>, separator = " · "): string {
  const picks = new Map<string, { name: string; count: number }>();
  for (const extra of extras) {
    const key = extra.id ?? extra.name, pick = picks.get(key);
    if (pick) pick.count++; else picks.set(key, { name: extra.name, count: 1 });
  }
  return [...picks.values()].map((pick) => (pick.count > 1 ? `${pick.name} ×${pick.count}` : pick.name)).join(separator);
}

export type CartCadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
const isCartCadence = (value: unknown): value is CartCadence => value === "WEEKLY" || value === "BIWEEKLY" || value === "MONTHLY";

export function cartItemKey(paymentLinkId: string, variantId?: string, extraIds: string[] = [], cadence?: CartCadence): string {
  const base = variantId ? `${paymentLinkId}${CART_VARIANT_SEPARATOR}${variantId}` : paymentLinkId;
  const normalizedExtras = [...extraIds].sort();
  const withExtras = normalizedExtras.length ? `${base}${CART_EXTRAS_SEPARATOR}${normalizedExtras.join(",")}` : base;
  return cadence ? `${withExtras}${CART_CADENCE_SEPARATOR}${cadence}` : withExtras;
}

export function parseCartItemKey(key: string): { paymentLinkId: string; variantId?: string; extraIds: string[]; cadence?: CartCadence } {
  const [withExtras, cadence] = key.split(CART_CADENCE_SEPARATOR, 2);
  const [base, encodedExtras = ""] = withExtras.split(CART_EXTRAS_SEPARATOR, 2);
  const [paymentLinkId, variantId] = base.split(CART_VARIANT_SEPARATOR, 2);
  const extraIds = encodedExtras.split(",").filter(Boolean);
  return { paymentLinkId, ...(variantId ? { variantId } : {}), extraIds, ...(isCartCadence(cadence) ? { cadence } : {}) };
}

function cartStorageKey(storeId: string) { return `pagosya_cart_${storeId}`; }
export function restoreCart(store: Store, productStockLimit: (item: StoreItem) => number | null, optionStock: (item: StoreItem, variant?: StoreItem['variants'][number]) => number | null) {
  const cart = new Map<string, number>();
  const selectedVariantByItem = new Map<string, string>();
  const selectedExtraIdsByItem = new Map<string, string[]>();
  try {
    const raw = localStorage.getItem(cartStorageKey(store.storeId));
    if (!raw) return { cart, selectedVariantByItem, selectedExtraIdsByItem };
    const saved = JSON.parse(raw) as Record<string, number>;
    const loadedByProduct = new Map<string, number>();
    const loadedByOption = new Map<string, number>();
    for (const [key, qty] of Object.entries(saved)) {
      // Drop entries for items archived/deleted since the cart was saved, and any
      // corrupt values — a stale or tampered cart must never crash the storefront.
      const { paymentLinkId, variantId, extraIds, cadence } = parseCartItemKey(key);
      const item = store.items.find((candidate) => candidate.id === paymentLinkId);
      if (!item || item.fulfillmentType === 'MEMBERSHIP' || !Number.isInteger(qty) || qty <= 0) continue;
      if (cadence && !(subscriptionsAvailable(store) && item.subscriptionOptions?.some((option) => option.cadence === cadence))) continue;
      const variants = (item.variants ?? []);
      if (variants.length > 0 && (!variantId || !variants.some((variant) => variant.id === variantId))) continue;
      if (variants.length === 0 && variantId) continue;
      const extras = (item.extras ?? []);
      if (extraIds.some((id) => !extras.some((extra) => extra.id === id))) continue;
      if (extras.some((extra) => extra.required && !extraIds.includes(extra.id))) continue;
      if (extras.some((extra) => !extra.pickCount && extraIds.filter((id) => id === extra.id).length > 1)) continue;
      if (pickGroups(extras, extraIds).some((group) => group.picked !== group.pickCount)) continue;

      const variant = variants.find((candidate) => candidate.id === variantId);
      const optionKey = cartItemKey(item.id, variantId);
      const cartKey = cartItemKey(item.id, variantId, extraIds, cadence);
      const alreadyLoaded = loadedByProduct.get(item.id) ?? 0;
      const alreadyLoadedForOption = loadedByOption.get(optionKey) ?? 0;
      const productLimit = productStockLimit(item);
      const productAvailable = productLimit === null ? qty : Math.max(0, productLimit - alreadyLoaded);
      const availableForOption = optionStock(item, variant);
      const optionAvailable = availableForOption === null ? qty : Math.max(0, availableForOption - alreadyLoadedForOption);
      const clamped = Math.min(qty, productAvailable, optionAvailable);
      if (clamped > 0) {
        cart.set(cartKey, clamped);
        loadedByProduct.set(item.id, alreadyLoaded + clamped);
        loadedByOption.set(optionKey, alreadyLoadedForOption + clamped);
        if (variantId && !selectedVariantByItem.has(item.id)) selectedVariantByItem.set(item.id, variantId);
        if (!selectedExtraIdsByItem.has(item.id)) selectedExtraIdsByItem.set(item.id, [...extraIds]);
      }
    }
  } catch {
    // Corrupt localStorage — fall back to an empty cart rather than throwing.
  }
  return { cart, selectedVariantByItem, selectedExtraIdsByItem };
}
export function persistCart(storeId: string, cart: Map<string, number>): void {
  try {
    const key = cartStorageKey(storeId);
    if (cart.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(cart)));
  } catch { /* Shopping remains usable when storage is disabled or full. */ }
}
