/** The shopping cart: selected variants and extras, prices and discounts, stock limits, promo codes, and persistence. */
import { pickedExtras, pickGroups, parseCartItemKey, restoreCart, persistCart } from "../cart-state";
import { StoreItem, Store } from "../api";
import { state } from "../state";
import { addedProducts, productQuantities } from "../store-analytics";
import { formatAmount } from "../ui/html";


// Product/option key -> quantity, persisted to localStorage (see loadCart/saveCart)
// keyed by storeId. A product with options can carry both Pequeña and Grande
// as separate cart lines without duplicating the product in the catalog.
export const cart = new Map<string, number>();
export const selectedVariantByItem = new Map<string, string>();
export const selectedOptionsByItem = new Map<string, Record<string,string>>();
export const selectedExtraIdsByItem = new Map<string, string[]>();
export const selectedProductImageByItem = new Map<string, number>();

export function itemVariants(item: StoreItem): StoreItem["variants"] {
  return item.variants ?? [];
}

export function itemExtras(item: StoreItem): StoreItem["extras"] {
  return item.extras ?? [];
}

export function selectedVariantFor(item: StoreItem): StoreItem["variants"][number] | undefined {
  const variants = itemVariants(item);
  if (variants.length === 0) return undefined;
  const selectedId = selectedVariantByItem.get(item.id);
  const remembered = variants.find((variant) => variant.id === selectedId);
  if (remembered && optionStock(item, remembered) !== 0) return remembered;
  selectedVariantByItem.delete(item.id);
  return undefined;
}

export function selectedExtrasFor(item: StoreItem): StoreItem["extras"] {
  return pickedExtras(itemExtras(item), selectedExtraIdsByItem.get(item.id) ?? []);
}

export function selectedExtrasAmount(extras: StoreItem["extras"]): number {
  const selectedByGroup = new Map<string, number>();
  return extras.reduce((total, extra) => {
    const group = extra.groupName?.trim().toLocaleLowerCase("es");
    if (!group) return total + extra.amount;
    const selectionNumber = (selectedByGroup.get(group) ?? 0) + 1;
    selectedByGroup.set(group, selectionNumber);
    return total + (selectionNumber <= (extra.freeAllowance ?? 0) ? 0 : extra.amount);
  }, 0);
}

export function extraDisplayAmount(item: StoreItem, extra: StoreItem["extras"][number], selectedExtras: StoreItem["extras"]): number {
  const group = extra.groupName?.trim().toLocaleLowerCase("es");
  if (!group) return extra.amount;
  const selectedIds = new Set(selectedExtras.map((selected) => selected.id));
  selectedIds.add(extra.id);
  const groupSelections = itemExtras(item).filter((candidate) =>
    selectedIds.has(candidate.id) && candidate.groupName?.trim().toLocaleLowerCase("es") === group,
  );
  const selectionNumber = groupSelections.findIndex((candidate) => candidate.id === extra.id) + 1;
  return selectionNumber > 0 && selectionNumber <= (extra.freeAllowance ?? 0) ? 0 : extra.amount;
}

export function extrasCourtesyCopy(item: StoreItem): string {
  const groups = new Map<string, { name: string; allowance: number }>();
  itemExtras(item).forEach((extra) => {
    const name = extra.groupName?.trim();
    if (name && (extra.freeAllowance ?? 0) > 0) groups.set(name.toLocaleLowerCase("es"), { name, allowance: extra.freeAllowance ?? 0 });
  });
  return [...groups.values()].map((group) => `${group.name}: ${group.allowance} ${group.allowance === 1 ? "incluida" : "incluidas"}`).join(" · ");
}

export function productConfigurationComplete(item: StoreItem): boolean {
  if (itemVariants(item).length > 0 && !selectedVariantFor(item)) return false;
  const selectedIds = selectedExtraIdsByItem.get(item.id) ?? [];
  return itemExtras(item).every((extra) => !extra.required || (extra.available && selectedIds.includes(extra.id)))
    && pickGroups(itemExtras(item), selectedIds).every((group) => group.picked === group.pickCount);
}

export function activeProductDiscount(item: StoreItem, now = Date.now()): number | null {
  const percent = item.discountPercent;
  const startsAt = item.discountStartsAt ? Date.parse(item.discountStartsAt) : Number.NaN;
  const endsAt = item.discountEndsAt ? Date.parse(item.discountEndsAt) : Number.NaN;
  return typeof percent === "number" && Number.isInteger(percent) && percent >= 1 && percent <= 99 && Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt
    ? percent
    : null;
}

export function discountedProductAmount(item: StoreItem, amount: number): number {
  const percent = activeProductDiscount(item);
  return percent === null ? amount : Math.max(0, Math.round(amount * (100 - percent) / 100));
}

export function originalSelectedUnitAmount(item: StoreItem, variant = selectedVariantFor(item), extras = selectedExtrasFor(item)): number {
  return (variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
}

export function selectedUnitAmount(item: StoreItem, variant = selectedVariantFor(item), extras = selectedExtrasFor(item)): number {
  return discountedProductAmount(item, variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
}

export function discountRemainingLabel(item: StoreItem): string {
  const remaining = Math.max(0, Date.parse(item.discountEndsAt || "") - Date.now());
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Termina en ${days}d ${hours}h`;
  if (hours > 0) return `Termina en ${hours}h ${minutes}m`;
  return `Termina en ${minutes}m`;
}

export function salePriceHtml(item: StoreItem, discountedAmount: number, originalAmount: number, className: string): string {
  const percent = activeProductDiscount(item);
  if (percent === null) return `<span class="${className}">${formatAmount(discountedAmount, item.currency)}</span>`;
  return `<span class="sale-price-wrap"><span class="${className} sale-price">${formatAmount(discountedAmount, item.currency)}</span><del>${formatAmount(originalAmount, item.currency)}</del></span>`;
}

export function productCartQuantity(paymentLinkId: string): number {
  let quantity = 0;
  for (const [key, lineQuantity] of cart) {
    if (parseCartItemKey(key).paymentLinkId === paymentLinkId) quantity += lineQuantity;
  }
  return quantity;
}

export function optionCartQuantity(paymentLinkId: string, variantId: string | undefined): number {
  let quantity = 0;
  for (const [key, lineQuantity] of cart) {
    const selected = parseCartItemKey(key);
    if (selected.paymentLinkId === paymentLinkId && selected.variantId === variantId) quantity += lineQuantity;
  }
  return quantity;
}

export function productStockLimit(item: StoreItem): number | null {
  return item.purchaseLimit === undefined ? item.stock : item.purchaseLimit;
}

export function optionStock(item: StoreItem, variant: StoreItem["variants"][number] | undefined): number | null {
  if (variant?.purchaseLimit !== undefined) return variant.purchaseLimit;
  if (variant?.stock !== undefined) return variant.stock;
  return productStockLimit(item);
}

export function remainingStock(item: StoreItem, variant: StoreItem["variants"][number] | undefined): number | null {
  const remaining: number[] = [];
  const productLimit = productStockLimit(item);
  if (productLimit !== null) remaining.push(Math.max(0, productLimit - productCartQuantity(item.id)));
  const variantStock = optionStock(item, variant);
  if (variantStock !== null) {
    const lineQuantity = optionCartQuantity(item.id, variant?.id);
    remaining.push(Math.max(0, variantStock - lineQuantity));
  }
  return remaining.length ? Math.min(...remaining) : null;
}

export function stockStatus(remaining: number | null, showLowStock: boolean): { label: string; exhausted: boolean } | null {
  if (remaining === 0) return { label: "¡Stock agotado!", exhausted: true };
  if (!showLowStock) return null;
  if (remaining !== null && remaining < 5) {
    return { label: `¡Solo ${remaining === 1 ? "queda" : "quedan"} ${remaining}!`, exhausted: false };
  }
  return null;
}

export function loadCart(store: Store): void {
  const saved = restoreCart(store, productStockLimit, optionStock);
  cart.clear(); selectedVariantByItem.clear(); selectedExtraIdsByItem.clear();
  saved.cart.forEach((value, key) => cart.set(key, value));
  saved.selectedVariantByItem.forEach((value, key) => selectedVariantByItem.set(key, value));
  saved.selectedExtraIdsByItem.forEach((value, key) => selectedExtraIdsByItem.set(key, value));
}
export function saveCart(store: Store): void {
  const count = cartCount(); if (count > state.funnelCartCount) state.activeStoreFunnel?.track('add_to_cart');
  const quantities = productQuantities(cart, key => parseCartItemKey(key).paymentLinkId);
  for (const productId of addedProducts(state.analyticsCartQuantities, quantities)) state.activeStoreAnalytics?.record({ type: 'add_to_cart', productId });
  state.analyticsCartQuantities = quantities;
  state.funnelCartCount = count; persistCart(store.storeId, cart);
}

export function cartTotal(items: StoreItem[]): number {
  let total = 0;
  for (const [key, quantity] of cart) {
    const { paymentLinkId, variantId, extraIds } = parseCartItemKey(key);
    const item = items.find((candidate) => candidate.id === paymentLinkId);
    if (!item) continue;
    const variant = itemVariants(item).find((candidate) => candidate.id === variantId);
    const extras = pickedExtras(itemExtras(item), extraIds);
    total += selectedUnitAmount(item, variant, extras) * quantity;
  }
  return total;
}

export function cartCount(): number {
  return [...cart.values()].reduce((sum, qty) => sum + qty, 0);
}

export function activePromoForStore(store: Store) {
  return state.appliedPromo?.storeId === store.storeId ? state.appliedPromo : null;
}

export function promoDiscountAmount(store: Store): number {
  const promo = activePromoForStore(store);
  const subtotal = cartTotal(store.items);
  if (!promo || subtotal <= 1) return 0;
  const requested = promo.discountType === "PERCENT"
    ? Math.floor(subtotal * promo.discountValue / 100)
    : promo.discountValue;
  return Math.max(0, Math.min(requested, subtotal - 1));
}
