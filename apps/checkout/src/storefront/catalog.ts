/** Catalog sections, sorting and search, image positions, and one-time content playback. */
import { StoreItem, Store } from "../api";
import { state } from "../state";
import { storeEditorMode, storePreviewMode } from "../preview-mode";
import { discountedProductAmount } from "../cart/cart";


export type CatalogSection = { id: string; name: string; bannerUrl: string | null; highlights: string[]; items: StoreItem[] };

export function catalogSectionsForStore(store: Store): CatalogSection[] {
  const byCategory = new Map<string | null, StoreItem[]>();
  for (const item of store.items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  return [
    ...store.categories.map((category) => ({
      id: category.id,
      name: category.name,
      bannerUrl: category.bannerUrl || null,
      highlights: Array.isArray(category.highlights) ? category.highlights.slice(0, 4) : [],
      items: byCategory.get(category.id) ?? [],
    })),
    ...(byCategory.get(null)?.length ? [{ id: "null", name: "Otros", bannerUrl: null, highlights: [], items: byCategory.get(null)! }] : []),
  ].filter((section) => section.items.length > 0 || storeEditorMode);
}

export function sortStoreItems(items: StoreItem[]): StoreItem[] {
  if (state.sortMode === "price-asc") return [...items].sort((a, b) => discountedProductAmount(a, a.amount) - discountedProductAmount(b, b.amount));
  if (state.sortMode === "price-desc") return [...items].sort((a, b) => discountedProductAmount(b, b.amount) - discountedProductAmount(a, a.amount));
  if (state.sortMode === "popular") return [...items].sort((a, b) => b.soldCount - a.soldCount);
  return items;
}

export function itemMatchesSearch(item: StoreItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.description ?? "", ...item.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function productImagePosition(item: StoreItem, index: number): string {
  const position = item.imagePositions?.[index] || "50% 50%";
  return /^(?:0|[1-9]\d?|100)% (?:0|[1-9]\d?|100)%$/.test(position) ? position : "50% 50%";
}

export function storeImagePosition(store: Store, imageUrl: string | null | undefined): string {
  if (!imageUrl) return "50% 50%";
  const imageKey = normalizedAssetKey(imageUrl);
  for (const item of store.items) {
    const imageIndex = item.imageUrls.findIndex((itemImageUrl) => normalizedAssetKey(itemImageUrl) === imageKey);
    if (imageIndex >= 0) return productImagePosition(item, imageIndex);
  }
  return "50% 50%";
}

export function normalizedAssetKey(imageUrl: string): string {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.origin);
    return decodeURIComponent(parsed.pathname).replace(/^\/v1(?=\/uploads\/)/, "");
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/^\/v1(?=\/uploads\/)/, "");
  }
}

export function storeContentFingerprint(parts: unknown[]): string {
  const value = parts.map((part) => String(part ?? "")).join("\u241f");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function consumeStoreContentOnce(kind: "announcement" | "promotion", storeId: string, parts: unknown[]): boolean {
  // The appearance editor must keep showing the element being edited. The
  // once-only rule applies to the customer-facing storefront.
  if (storePreviewMode) return true;
  const key = `pagosya_store_${kind}_seen_${storeId}_${storeContentFingerprint(parts)}`;
  try {
    if (localStorage.getItem(key) === "1") return false;
    localStorage.setItem(key, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted browsers. Showing the
    // content again is safer than preventing a merchant notice entirely.
  }
  return true;
}
