export type StorePreviewExternalDestination = {
  url: string;
  protocol: "https:" | "http:" | "mailto:" | "tel:";
};

function storeKey(url: URL): string {
  const pathMatch = /^\/s\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (pathMatch) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }
  return url.pathname === "/" || url.pathname === "/index.html"
    ? url.searchParams.get("link") || url.searchParams.get("store") || ""
    : "";
}

/**
 * A merchant-authored link may remain fully functional on the published store,
 * but preview navigation must stay inside the store that is being reviewed.
 * Returning a destination means the parent dashboard must offer a deliberate
 * new-tab handoff instead of letting the iframe replace its trusted contents.
 */
export function storePreviewExternalDestination(
  rawHref: string | null | undefined,
  currentHref: string,
): StorePreviewExternalDestination | null {
  const href = String(rawHref ?? "").trim();
  if (!href || href.startsWith("#")) return null;
  try {
    const current = new URL(currentHref);
    const destination = new URL(href, current);
    if (destination.protocol === "mailto:" || destination.protocol === "tel:") {
      return { url: destination.href.slice(0, 500), protocol: destination.protocol };
    }
    if (destination.protocol !== "https:" && destination.protocol !== "http:") return null;
    const currentStore = storeKey(current);
    const destinationStore = storeKey(destination);
    const staysInsideStore = destination.origin === current.origin
      && Boolean(currentStore)
      && destinationStore === currentStore;
    return staysInsideStore
      ? null
      : { url: destination.href.slice(0, 500), protocol: destination.protocol };
  } catch {
    return null;
  }
}
