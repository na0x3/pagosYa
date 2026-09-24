/** In-store navigation: which page a URL shows, history entries, and returning to the same spot in the catalog. */
import { Store } from "../api";
import { state } from "../state";
import { app } from "../ui/app";
import { activeProductDiscount, discountRemainingLabel } from "../cart/cart";
import { productIdFromLocation, categoryIdFromLocation, collectionIdFromLocation, productPageUrl, storeCatalogUrl, storefrontRouteFromPathname } from "./routes";


export function bindTimedDiscountSchedule(slug: string, store: Store): void {
  state.activeDiscountCleanup?.();
  state.activeDiscountCleanup = null;
  const scheduledItems = store.items.filter((item) => Number.isFinite(Date.parse(item.discountStartsAt || "")) && Number.isFinite(Date.parse(item.discountEndsAt || "")) && Date.parse(item.discountEndsAt || "") > Date.now());
  if (!scheduledItems.length) return;
  const updateLabels = () => {
    app.querySelectorAll<HTMLElement>("[data-discount-ends-at]").forEach((element) => {
      const item = store.items.find((candidate) => candidate.discountEndsAt === element.dataset.discountEndsAt);
      if (item && activeProductDiscount(item) !== null) element.textContent = discountRemainingLabel(item);
    });
  };
  const now = Date.now();
  const nextBoundary = scheduledItems
    .flatMap((item) => [Date.parse(item.discountStartsAt || ""), Date.parse(item.discountEndsAt || "")])
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
    .sort((a, b) => a - b)[0];
  const interval = window.setInterval(updateLabels, 30_000);
  const timeout = nextBoundary
    ? window.setTimeout(() => renderStoreRoute(slug, store, { focusPromotion: false }), Math.min(nextBoundary - now + 100, 2_147_000_000))
    : undefined;
  updateLabels();
  state.activeDiscountCleanup = () => {
    window.clearInterval(interval);
    if (timeout !== undefined) window.clearTimeout(timeout);
  };
}
export type CatalogReturnPosition = {
  scrollY: number;
  productId?: string;
  productViewportTop?: number;
};

export const catalogScrollByStore = new Map<string, number>();
export const catalogReturnByStore = new Map<string, CatalogReturnPosition>();

export function catalogProductCard(productId: string): HTMLElement | null {
  return Array.from(app.querySelectorAll<HTMLElement>(".store-item[data-id]"))
    .find((card) => card.dataset.id === productId) ?? null;
}

/**
 * The two pages the storefront router renders. The pages import navigation,
 * so navigation cannot import them back; main.ts registers them at startup.
 */
export const storefrontPages = {
  renderStore: (_slug: string, _store: Store, _options?: { focusPromotion?: boolean }): void => { throw new Error("storefront pages not registered"); },
  renderProductPage: (_slug: string, _store: Store, _productId: string): void => { throw new Error("storefront pages not registered"); },
};

export function renderStoreRoute(slug: string, store: Store, options: { focusPromotion?: boolean } = {}): void {
  state.activeStoreRoute = { slug, store };
  const productId = productIdFromLocation();
  if (productId) storefrontPages.renderProductPage(slug, store, productId);
  else {
    state.selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    state.selectedCollectionId = collectionIdFromLocation() ?? "ALL";
    storefrontPages.renderStore(slug, store, options);
  }
}

export function restoreCatalogScroll(scrollY: unknown): void {
  const top = typeof scrollY === "number" && Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  requestAnimationFrame(() => window.scrollTo(0, top));
}

export function restoreCatalogPosition(slug: string, fallback: Partial<CatalogReturnPosition> = {}): void {
  const remembered = catalogReturnByStore.get(slug);
  const position: CatalogReturnPosition = {
    scrollY: remembered?.scrollY ?? (typeof fallback.scrollY === "number" ? fallback.scrollY : 0),
    productId: remembered?.productId ?? fallback.productId,
    productViewportTop: remembered?.productViewportTop ?? fallback.productViewportTop,
  };
  const restore = () => {
    const card = position.productId ? catalogProductCard(position.productId) : null;
    if (card && typeof position.productViewportTop === "number") {
      const anchoredTop = window.scrollY + card.getBoundingClientRect().top - position.productViewportTop;
      window.scrollTo(0, Math.max(0, anchoredTop));
      return;
    }
    window.scrollTo(0, Math.max(0, position.scrollY));
  };
  requestAnimationFrame(() => {
    restore();
    // Re-anchor after the next layout as responsive controls and images settle.
    requestAnimationFrame(restore);
  });
}

export function navigateWithinStore(slug: string, store: Store, productId?: string): void {
  if (productId) {
    const catalogScrollY = Math.max(0, window.scrollY);
    const productCard = catalogProductCard(productId);
    const returnPosition: CatalogReturnPosition = {
      scrollY: catalogScrollY,
      productId,
      ...(productCard ? { productViewportTop: productCard.getBoundingClientRect().top } : {}),
    };
    catalogScrollByStore.set(slug, catalogScrollY);
    catalogReturnByStore.set(slug, returnPosition);
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...currentState, pagosyaView: "catalog", catalogScrollY, catalogProductId: productId, catalogProductViewportTop: returnPosition.productViewportTop }, "", window.location.href);
    window.history.pushState({ pagosyaView: "product", fromCatalog: true, catalogScrollY, catalogProductId: productId, catalogProductViewportTop: returnPosition.productViewportTop }, "", productPageUrl(slug, productId));
  } else {
    window.history.pushState({ pagosyaView: "catalog", catalogScrollY: 0 }, "", storeCatalogUrl(slug));
  }
  renderStoreRoute(slug, store);
  restoreCatalogScroll(0);
  app.focus({ preventScroll: true });
}

export function bindInternalStoreLinks(slug: string, store: Store): void {
  app.querySelectorAll<HTMLAnchorElement>("[data-store-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const selector = link.dataset.storeScrollTarget || "";
      const target = selector ? app.querySelector<HTMLElement>(selector) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  });
  app.querySelectorAll<HTMLAnchorElement>(".product-page-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const url = new URL(link.href);
      const productId = storefrontRouteFromPathname(url.pathname).productId ?? url.searchParams.get("product");
      if (productId) navigateWithinStore(slug, store, productId);
    });
  });
  app.querySelectorAll<HTMLAnchorElement>(".store-catalog-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (window.history.state?.fromCatalog) {
        const catalogPosition = catalogReturnByStore.get(slug) ?? {
          scrollY: catalogScrollByStore.get(slug) ?? window.history.state.catalogScrollY,
          productId: window.history.state.catalogProductId,
          productViewportTop: window.history.state.catalogProductViewportTop,
        };
        window.history.back();
        // Render immediately so the shopper never flashes at the top of the
        // catalog while the browser dispatches popstate asynchronously.
        storefrontPages.renderStore(slug, store);
        restoreCatalogPosition(slug, catalogPosition);
        app.focus({ preventScroll: true });
        return;
      }
      navigateWithinStore(slug, store);
    });
  });
}
