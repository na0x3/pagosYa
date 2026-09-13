import type { Store, StoreItem } from "./api";
const CART_VARIANT_SEPARATOR = "::";
const CART_EXTRAS_SEPARATOR = "~~";

export function cartItemKey(paymentLinkId: string, variantId?: string, extraIds: string[] = []): string {
  const base = variantId ? `${paymentLinkId}${CART_VARIANT_SEPARATOR}${variantId}` : paymentLinkId;
  const normalizedExtras = [...new Set(extraIds)].sort();
  return normalizedExtras.length ? `${base}${CART_EXTRAS_SEPARATOR}${normalizedExtras.join(",")}` : base;
}

export function parseCartItemKey(key: string): { paymentLinkId: string; variantId?: string; extraIds: string[] } {
  const [base, encodedExtras = ""] = key.split(CART_EXTRAS_SEPARATOR, 2);
  const [paymentLinkId, variantId] = base.split(CART_VARIANT_SEPARATOR, 2);
  const extraIds = encodedExtras.split(",").filter(Boolean);
  return { paymentLinkId, ...(variantId ? { variantId } : {}), extraIds };
}

function cartStorageKey(storeId: string) { return `pagosya_cart_${storeId}`; }
export function restoreCart(store: Store, productStockLimit: (item: StoreItem) => number | null, optionStock: (item: StoreItem, variant?: StoreItem['variants'][number]) => number | null) {
  const cart = new Map<string, number>();
  const selectedVariantByItem = new Map<string, string>();
  const selectedExtraIdsByItem = new Map<string, Set<string>>();
  try {
    const raw = localStorage.getItem(cartStorageKey(store.storeId));
    if (!raw) return { cart, selectedVariantByItem, selectedExtraIdsByItem };
    const saved = JSON.parse(raw) as Record<string, number>;
    const loadedByProduct = new Map<string, number>();
    const loadedByOption = new Map<string, number>();
    for (const [key, qty] of Object.entries(saved)) {
      // Drop entries for items archived/deleted since the cart was saved, and any
      // corrupt values — a stale or tampered cart must never crash the storefront.
      const { paymentLinkId, variantId, extraIds } = parseCartItemKey(key);
      const item = store.items.find((candidate) => candidate.id === paymentLinkId);
      if (!item || !Number.isInteger(qty) || qty <= 0) continue;
      const variants = (item.variants ?? []);
      if (variants.length > 0 && (!variantId || !variants.some((variant) => variant.id === variantId))) continue;
      if (variants.length === 0 && variantId) continue;
      const extras = (item.extras ?? []);
      if (extraIds.some((id) => !extras.some((extra) => extra.id === id))) continue;
      if (extras.some((extra) => extra.required && !extraIds.includes(extra.id))) continue;

      const variant = variants.find((candidate) => candidate.id === variantId);
      const optionKey = cartItemKey(item.id, variantId);
      const cartKey = cartItemKey(item.id, variantId, extraIds);
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
        if (!selectedExtraIdsByItem.has(item.id)) selectedExtraIdsByItem.set(item.id, new Set(extraIds));
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
