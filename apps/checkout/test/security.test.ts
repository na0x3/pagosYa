import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../src/api";

async function loadStore(store: Store) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", "/?link=hostile-store");
  vi.doMock("../src/api", () => ({
      API_BASE_URL: "https://api.example/v1",
    fetchStore: vi.fn().mockResolvedValue(store),
    assetUrl: (path: string | null) => path,
  }));
  await import("../src/main");
  await vi.waitFor(() => {
    if (!document.getElementById("app")?.children.length) throw new Error("not rendered yet");
  });
}

function hostileStore(): Store {
  return {
    storeId: "store_hostile",
    storeName: '<img src=x onerror="globalThis.__xss=1">',
    tagline: "<script>globalThis.__xss=2</script>",
    logoUrl: null,
    bannerUrl: null,
    backgroundColor: null,
    backgroundMode: "solid",
    backgroundGradientStart: "#f8fafc",
    backgroundGradientEnd: "#e0e7ff",
    backgroundGradientAngle: 135,
    backgroundImageUrl: null,
    aboutText: '<svg onload="globalThis.__xss=3"></svg>',
    aboutImageUrl: null,
    accentColor: null,
    fontStyle: "modern",
    buttonStyle: "rounded",
    buttonVariant: "solid",
    buttonMotion: "lift",
    cartButtonLabel: "Comprar",
    checkoutMode: "payment",
    leadCaptureUrl: null,
    cartRecommendationsEnabled: false,
    cartRecommendationProductIds: [],
    showLowStockToCustomers: false,
    boardTexture: "chalkboard",
    announcement: '<img src=x onerror="globalThis.__xss=4">',
    announcementMode: "static",
    announcementSpeed: 18,
    announcementSize: "medium",
    announcementColor: "#c58b3c",
    promotionEnabled: true,
    promotionImageUrl: null,
    promotionTitle: "<script>globalThis.__xss=5</script>",
    promotionBody: "Plain <b>merchant</b> text",
    promotionCtaLabel: "Bad link",
    promotionCtaUrl: "javascript:globalThis.__xss=6",
    locationMapUrl: "javascript:globalThis.__xss=7",
    locationDescription: '<iframe src="https://attacker.example"></iframe>',
    locationHighlight: "<b>Near the plaza</b>",
    heroSlides: [],
    links: [
      { label: "Unsafe", url: "javascript:globalThis.__xss=8" },
      { label: "Safe", url: "https://example.com/store" },
    ],
    categories: [],
    items: [{
      id: "product_hostile",
      categoryId: null,
      name: '<img src=x onerror="globalThis.__xss=9">',
      description: "<script>globalThis.__xss=10</script>",
      imageUrls: [],
      tags: ["<svg onload=globalThis.__xss=11>"],
      stock: null,
      color: null,
      variants: [],
      extras: [],
      amount: 1_000,
      currency: "BOB",
      discountPercent: null,
      discountStartsAt: null,
      discountEndsAt: null,
      soldCount: 0,
    }],
  } as Store;
}

describe("storefront hostile-content rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    localStorage.clear();
    sessionStorage.clear();
    delete (globalThis as typeof globalThis & { __xss?: number }).__xss;
  });

  afterEach(() => {
    vi.doUnmock("../src/api");
    vi.resetModules();
  });

  it("renders merchant and Yapi copy as inert text and drops executable destinations", async () => {
    await loadStore(hostileStore());

    expect((globalThis as typeof globalThis & { __xss?: number }).__xss).toBeUndefined();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('iframe[src="https://attacker.example"]')).toBeNull();
    expect(document.body.textContent).toContain('<img src=x onerror="globalThis.__xss=1">');
    expect(document.body.textContent).toContain("<script>globalThis.__xss=10</script>");
    expect([...document.querySelectorAll<HTMLAnchorElement>("a")].some((link) => link.href.startsWith("javascript:"))).toBe(false);
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://example.com/store"]')?.textContent).toContain("Safe");
  });
});
