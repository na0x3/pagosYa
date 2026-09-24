/** Storefront URLs: parsing the current route and building store, collection, category, and product links. */
import { state } from "../state";
import { storePreviewMode, storeEditorMode, storeOwnerMode } from "../preview-mode";


export type StorefrontRoute = { slug: string | null; productId: string | null; categoryId: string | null };

export function storefrontRouteFromPathname(pathname: string): StorefrontRoute {
  const match = pathname.match(/^\/s\/([^/]+)(?:\/productos|(?:\/c\/([^/]+))|(?:\/p\/([^/]+)))?\/?$/);
  if (!match) {
    const customProduct = state.activeCustomDomainSlug ? pathname.match(/^\/p\/([^/]+)\/?$/) : null;
    const customCategory = state.activeCustomDomainSlug ? pathname.match(/^\/c\/([^/]+)\/?$/) : null;
    const customCatalog = state.activeCustomDomainSlug ? /^\/productos\/?$/.test(pathname) : false;
    if (!state.activeCustomDomainSlug || (pathname !== "/" && !customProduct && !customCategory && !customCatalog)) {
      return { slug: null, productId: null, categoryId: null };
    }
    try {
      return {
        slug: state.activeCustomDomainSlug,
        productId: customProduct?.[1] ? decodeURIComponent(customProduct[1]) : null,
        categoryId: customCategory?.[1] ? decodeURIComponent(customCategory[1]) : null,
      };
    } catch {
      return { slug: null, productId: null, categoryId: null };
    }
  }
  try {
    return {
      slug: decodeURIComponent(match[1]),
      categoryId: match[2] ? decodeURIComponent(match[2]) : null,
      productId: match[3] ? decodeURIComponent(match[3]) : null,
    };
  } catch {
    return { slug: null, productId: null, categoryId: null };
  }
}

export function storefrontRouteFromLocation(): StorefrontRoute {
  return storefrontRouteFromPathname(window.location.pathname);
}

export function storeCatalogUrl(slug: string): string {
  const params = new URLSearchParams();
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = state.activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

export function storePageUrl(slug: string, pageSlug: string): string {
  const params = new URLSearchParams();
  params.set("page", pageSlug);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const pathname = state.activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}?${params.toString()}${storePreviewFragment()}`;
}

export function storeCollectionUrl(slug: string, collectionId: string): string {
  const params = new URLSearchParams();
  if (collectionId !== "ALL") params.set("collection", collectionId);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = state.activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment() || "#store-products"}`;
}

export function categoryPageUrl(slug: string, categoryId: string): string {
  const params = new URLSearchParams();
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = state.activeCustomDomainSlug === slug
    ? `/c/${encodeURIComponent(categoryId)}`
    : `/s/${encodeURIComponent(slug)}/c/${encodeURIComponent(categoryId)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

export function productPageUrl(slug: string, productId: string, categoryId = state.selectedCategoryId): string {
  const params = new URLSearchParams();
  if (categoryId !== "ALL") params.set("category", categoryId);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = state.activeCustomDomainSlug === slug
    ? `/p/${encodeURIComponent(productId)}`
    : `/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

export function storePreviewFragment(): string {
  if (!storePreviewMode || !window.location.hash) return "";
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.has("proposal") || params.has("parent_origin") ? window.location.hash : "";
}

export function productIdFromLocation(): string | null {
  return storefrontRouteFromLocation().productId ?? new URLSearchParams(window.location.search).get("product");
}

export function categoryIdFromLocation(): string | null {
  return storefrontRouteFromLocation().categoryId ?? new URLSearchParams(window.location.search).get("category");
}

export function collectionIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("collection");
}
