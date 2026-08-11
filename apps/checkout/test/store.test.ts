import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store, CartCheckoutResult } from "../src/api";

// main.ts has top-level module state (cart, selectedType, linkHeader) and
// calls main() itself on import — vi.resetModules() + a fresh dynamic
// import per test gives each test a clean module instance instead of
// leaking state between tests.
async function loadCheckout(path: string) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", path);
  await import("../src/main");
  await vi.waitFor(() => {
    if (document.getElementById("app")!.children.length === 0) throw new Error("not rendered yet");
  });
}

const baseItem = {
  id: "link_1",
  categoryId: null,
  name: "Corte de cabello",
  description: "Incluye lavado y peinado",
  imageUrls: [],
  tags: [],
  stock: null,
  color: null,
  variants: [],
  amount: 5000,
  currency: "BOB",
  soldCount: 0,
};

const baseStoreFields = {
  storeId: "store_1",
  tagline: null,
  logoUrl: null,
  bannerUrl: null,
  backgroundColor: null,
  backgroundImageUrl: null,
  aboutText: null,
  aboutImageUrl: null,
  accentColor: null,
  fontStyle: "mono",
  buttonStyle: "rounded",
  buttonVariant: "solid",
  buttonMotion: "lift",
  cartButtonLabel: "Ir a pagar",
  boardTexture: "chalkboard",
  announcement: null,
  announcementMode: "static",
  announcementSpeed: 18,
  promotionEnabled: false,
  promotionTitle: null,
  promotionBody: null,
  promotionCtaLabel: null,
  promotionCtaUrl: null,
  heroSlides: [],
  links: [],
  categories: [],
};

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [r, g, b] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("storefront (?link=...)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a neutral empty-state, not the red failure style, for a store with no items", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda Vacía",
        items: [],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=empty1");

    const status = document.querySelector(".status");
    expect(status).toBeTruthy();
    expect(status!.classList.contains("empty")).toBe(true);
    expect(status!.classList.contains("failed")).toBe(false);
    expect(document.querySelector(".store-title")?.textContent).toBe("Tienda Vacía");
  });

  it("renders store items with name, price, and a working quantity stepper", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Corte de cabello",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=a11x43lp");

    expect(document.querySelector(".store-item-name")?.textContent).toContain("Corte de cabello");
    expect(document.querySelector(".store-item-price")?.textContent).toBe("50.00 BOB");

    const payButton = document.querySelector<HTMLButtonElement>("#cart-pay")!;
    expect(payButton.disabled).toBe(true);

    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector(".qty-value")?.textContent).toBe("1");
    });
    expect(document.querySelector<HTMLButtonElement>("#cart-pay")!.disabled).toBe(false);
    expect(document.querySelector(".cart-summary")?.textContent).toContain("50.00 BOB");
  });

  it("renders merchant hero slides and lets the shopper move between them", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        heroSlides: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Nueva colección", body: "Hecha en Bolivia", ctaLabel: "Explorar" },
          { imageUrl: "/v1/uploads/dos.webp", title: "Piezas de temporada", ctaLabel: "Ver temporada" },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=taller-norte");
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".store-slide")).toHaveLength(2);
    });
    const slides = document.querySelectorAll<HTMLElement>(".store-slide");
    expect(slides[0].classList.contains("active")).toBe(true);
    expect(document.querySelector(".store-slide-cta")?.textContent).toBe("Explorar");
    expect(slides[1].querySelector<HTMLButtonElement>(".store-slide-cta")?.tabIndex).toBe(-1);
    expect(document.querySelector<HTMLButtonElement>(".store-carousel-toggle")?.textContent).toBe("Pausar");

    document.querySelector<HTMLButtonElement>(".store-carousel-arrow.next")!.click();
    expect(slides[0].getAttribute("aria-hidden")).toBe("true");
    expect(slides[1].getAttribute("aria-hidden")).toBe("false");
    expect(slides[1].querySelector<HTMLButtonElement>(".store-slide-cta")?.tabIndex).toBe(0);

    document.querySelector<HTMLButtonElement>(".store-carousel-toggle")!.click();
    expect(document.querySelector<HTMLButtonElement>(".store-carousel-toggle")?.textContent).toBe("Reanudar");
  });

  it("renders GIF and video media in the storefront hero", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda multimedia",
        heroSlides: [
          { imageUrl: "/v1/uploads/portada.gif", title: "Movimiento" },
          { imageUrl: "/v1/uploads/coleccion.mp4", title: "Video de colección" },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    try {
      await loadCheckout("/?link=multimedia");
      expect(document.querySelector<HTMLImageElement>(".store-slide img")?.src).toContain("portada.gif");
      const video = document.querySelector<HTMLVideoElement>(".store-slide video");
      expect(video?.src).toContain("coleccion.mp4");
      expect(video?.muted).toBe(true);
      expect(video?.loop).toBe(true);

      document.querySelector<HTMLButtonElement>(".store-carousel-arrow.next")!.click();
      expect(play).toHaveBeenCalled();
      expect(pause).toHaveBeenCalled();
    } finally {
      play.mockRestore();
      pause.mockRestore();
    }
  });

  it("lets a customer add two options of one product as separately priced cart lines", async () => {
    const checkoutCart = vi.fn().mockResolvedValue({
      clientSecret: "pi_variant_secret_x",
      storeName: "Hamburguesas",
      cartDescription: "Hamburguesa (Pequeña) x1, Hamburguesa (Grande) x1",
      contactPhone: null,
      contactEmail: null,
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Hamburguesas",
        items: [
          {
            ...baseItem,
            name: "Hamburguesa",
            variants: [
              { id: "var_small", name: "Pequeña", amount: 5000 },
              { id: "var_large", name: "Grande", amount: 8000 },
            ],
          },
        ],
      } satisfies Store),
      checkoutCart,
      fetchSession: vi.fn().mockResolvedValue({
        id: "pi_variant",
        amount: 13000,
        currency: "BOB",
        status: "REQUIRES_PAYMENT_METHOD",
        description: null,
        merchantName: "Hamburguesas",
      }),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=burger-options");

    expect(document.querySelector<HTMLSelectElement>(".variant-select")?.value).toBe("var_small");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();

    const variantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    variantSelect.value = "var_large";
    variantSelect.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();

    expect(document.querySelector(".cart-summary")?.textContent).toContain("130.00 BOB");
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    await vi.waitFor(() => expect(checkoutCart).toHaveBeenCalled());
    expect(checkoutCart).toHaveBeenCalledWith("burger-options", [
      { paymentLinkId: "link_1", variantId: "var_small", quantity: 1 },
      { paymentLinkId: "link_1", variantId: "var_large", quantity: 1 },
    ]);
  });

  it("shares a product's stock limit across all of its options", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Hamburguesas",
        items: [
          {
            ...baseItem,
            name: "Hamburguesa",
            stock: 1,
            variants: [
              { id: "var_small", name: "Pequeña", amount: 5000 },
              { id: "var_large", name: "Grande", amount: 8000 },
            ],
          },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=burger-stock");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();

    const variantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    variantSelect.value = "var_large";
    variantSelect.dispatchEvent(new Event("change"));

    expect(document.querySelector(".qty-value")?.textContent).toBe("0");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
  });

  it("enforces stock independently for each product option", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Hamburguesas",
        items: [
          {
            ...baseItem,
            name: "Hamburguesa",
            stock: 3,
            variants: [
              { id: "var_small", name: "Pequeña", amount: 5000, stock: 1 },
              { id: "var_large", name: "Grande", amount: 8000, stock: 2 },
            ],
          },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=burger-option-stock");
    expect(document.querySelector(".stock-note")?.textContent).toContain("1");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);

    const variantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    variantSelect.value = "var_large";
    variantSelect.dispatchEvent(new Event("change"));

    expect(document.querySelector(".stock-note")?.textContent).toContain("2");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(false);
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector(".cart-summary")?.textContent).toContain("130.00 BOB");
  });

  it("selects the first purchasable option and disables exhausted choices", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Hamburguesas",
        items: [
          {
            ...baseItem,
            name: "Hamburguesa",
            stock: 2,
            variants: [
              { id: "var_small", name: "Pequeña", amount: 3500, stock: 0 },
              { id: "var_large", name: "Grande", amount: 5500, stock: 2 },
            ],
          },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=available-option");

    const options = document.querySelectorAll<HTMLOptionElement>(".variant-select option");
    expect(options[0].disabled).toBe(true);
    expect(options[0].textContent).toContain("Agotado");
    expect(document.querySelector<HTMLSelectElement>(".variant-select")!.value).toBe("var_large");
    expect(document.querySelector(".stock-note")?.textContent).toContain("2");
    expect(document.querySelector(".store-item")?.classList.contains("sold-out")).toBe(false);
  });

  it("renders merchant marquee, promotion, and button customization", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda Promo",
        announcement: "Envío gratis hoy",
        announcementMode: "marquee",
        announcementSpeed: 12,
        promotionEnabled: true,
        promotionTitle: "20% de descuento",
        promotionBody: "Solo por este fin de semana.",
        promotionCtaLabel: "Entendido",
        buttonStyle: "pill",
        buttonVariant: "outline",
        buttonMotion: "pulse",
        cartButtonLabel: "Completar pedido",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=promo-store");

    expect(document.querySelector(".store-announcement.marquee")).toBeTruthy();
    expect(document.querySelector(".store-announcement.marquee")?.getAttribute("style")).toContain("12s");
    expect(document.querySelector(".promotion-dialog")?.textContent).toContain("20% de descuento");
    expect(document.body.dataset.buttonStyle).toBe("pill");
    expect(document.body.dataset.buttonVariant).toBe("outline");
    expect(document.body.dataset.buttonMotion).toBe("pulse");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Completar pedido");

    document.querySelector<HTMLButtonElement>(".promotion-close")!.click();
    expect(document.querySelector(".promotion-dialog")).toBeNull();
    expect(sessionStorage.getItem("pagosya_promotion_dismissed_store_1")).toBe("1");
  });

  it("applies promotional settings sent by the merchant live preview", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista previa",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=preview-store&preview=1");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          patch: {
            announcement: "Oferta de fin de semana",
            announcementMode: "marquee",
            announcementSpeed: 14,
            promotionEnabled: true,
            promotionTitle: "Solo hoy",
            promotionBody: "Aprovecha antes de que termine.",
            promotionCtaLabel: "Seguir comprando",
            buttonStyle: "pill",
            buttonVariant: "soft",
            buttonMotion: "pulse",
            cartButtonLabel: "Completar pedido",
          },
        },
      }),
    );

    expect(document.querySelector(".store-announcement.marquee")?.textContent).toContain("Oferta de fin de semana");
    expect(document.querySelector(".promotion-dialog")?.textContent).toContain("Solo hoy");
    expect(document.body.dataset.buttonVariant).toBe("soft");
    expect(document.body.dataset.buttonMotion).toBe("pulse");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Completar pedido");
  });

  it("moves into the payment form after checking out the cart", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Corte de cabello",
        items: [baseItem],
      } satisfies Store),
      checkoutCart: vi.fn().mockResolvedValue({
        clientSecret: "pi_1_secret_abc",
        storeName: "Corte de cabello",
        cartDescription: "Corte de cabello x1",
      } satisfies CartCheckoutResult),
      fetchSession: vi.fn().mockResolvedValue({
        id: "pi_1",
        amount: 5000,
        currency: "BOB",
        status: "REQUIRES_PAYMENT_METHOD",
        description: null,
        merchantName: "Should not be used — linkHeader takes priority",
      }),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=a11x43lp");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    await vi.waitFor(() => expect(document.querySelector(".qty-value")?.textContent).toBe("1"));

    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();

    await vi.waitFor(() => {
      expect(document.querySelector(".amount")?.textContent).toBe("50.00 BOB");
    });
    expect(document.querySelector(".description")?.textContent).toBe("Corte de cabello x1");
    // Cart-checkout flow shows the store name as a big header, not the
    // avatar+name row used for direct client_secret links.
    expect(document.querySelector(".merchant-row")).toBeFalsy();
  });

  it("groups products under category section headers, with uncategorized ones under 'Otros'", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con categorías",
        categories: [{ id: "cat_1", name: "Servicios" }],
        items: [
          { ...baseItem, id: "link_1", name: "Corte de cabello", categoryId: "cat_1" },
          { ...baseItem, id: "link_2", name: "Manicure sin categoría", categoryId: null },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=multi-cat");

    const titles = [...document.querySelectorAll(".category-section-title")].map((el) => el.textContent);
    expect(titles).toEqual(["Servicios", "Otros"]);
    expect(document.body.textContent).toContain("Corte de cabello");
    expect(document.body.textContent).toContain("Manicure sin categoría");
  });

  it("renders no section headers at all when the store has no categories", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda simple",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=no-cat");

    expect(document.querySelectorAll(".category-section-title").length).toBe(0);
  });

  it("shows tag badges and a remaining-stock note, and caps the quantity stepper at stock", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con stock",
        items: [{ ...baseItem, tags: ["Nuevo", "Popular"], stock: 1 }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=stocked");

    expect(document.querySelectorAll(".tag-badge")).toHaveLength(2);
    expect(document.querySelector(".stock-note")?.textContent).toBe("Quedan 1");

    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    await vi.waitFor(() => expect(document.querySelector(".qty-value")?.textContent).toBe("1"));

    // Stock is exhausted at qty 1 — the + button must now be disabled rather
    // than letting the cart silently exceed what's actually available.
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
  });

  it("marks a sold-out product (stock 0) as unavailable, with no quantity stepper at all", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda agotada",
        items: [{ ...baseItem, stock: 0 }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=soldout");

    expect(document.querySelector(".stock-note.out")?.textContent).toBe("Agotado");
    expect(document.querySelector(".store-item")?.classList.contains("sold-out")).toBe(true);
    expect(document.querySelector(".qty-stepper")).toBeFalsy();
  });

  it("switches the cover photo when a gallery thumbnail is clicked", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con galería",
        items: [{ ...baseItem, imageUrls: ["/v1/uploads/a.png", "/v1/uploads/b.png"] }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=gallery");

    const mainImg = document.querySelector<HTMLImageElement>(".store-item-image")!;
    expect(mainImg.src).toContain("a.png");

    const thumbs = [...document.querySelectorAll<HTMLButtonElement>(".gallery-thumb-btn")];
    expect(thumbs).toHaveLength(2);
    thumbs[1].click();

    // Active state flips immediately; the image itself crossfades (a brief
    // opacity dip before the src swap), so that assertion needs a wait.
    expect(thumbs[1].classList.contains("active")).toBe(true);
    expect(thumbs[0].classList.contains("active")).toBe(false);
    await vi.waitFor(() => expect(mainImg.src).toContain("b.png"));
  });

  it("applies a background image and the has-bg-image class when the store has one set", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con fondo",
        backgroundImageUrl: "/v1/uploads/backdrop.jpg",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=backdrop");

    expect(document.body.classList.contains("has-bg-image")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--pg-page-bg-image")).toBe('url("/v1/uploads/backdrop.jpg")');
    // A photo background forces the light text palette the same way a solid
    // backgroundColor does, since content sits on the (light) glass card.
    expect(document.documentElement.dataset.theme).toBe("light");

    const palette = getComputedStyle(document.documentElement);
    const foreground = palette.getPropertyValue("--pg-accent-contrast").trim();
    expect(foreground).toBe("#ffffff");
    expect(contrastRatio(foreground, palette.getPropertyValue("--pg-accent").trim())).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, palette.getPropertyValue("--pg-accent-2").trim())).toBeGreaterThanOrEqual(4.5);
  });

  it("hides the search/category toolbar for a small, uncategorized catalog", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda pequeña",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=small");

    expect(document.querySelector(".store-toolbar")).toBeFalsy();
  });

  it("filters the grid by search text without touching the search input's focus", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Catálogo grande",
        categories: [{ id: "cat_1", name: "Servicios" }],
        items: [
          { ...baseItem, id: "link_1", name: "Corte de cabello", categoryId: "cat_1" },
          { ...baseItem, id: "link_2", name: "Manicure", categoryId: "cat_1" },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=big-catalog");

    const search = document.querySelector<HTMLInputElement>(".store-search")!;
    search.focus();
    search.value = "manicure";
    search.dispatchEvent(new Event("input"));

    const names = [...document.querySelectorAll(".store-item-name")].map((el) => el.textContent);
    expect(names).toEqual(["Manicure"]);
    // The grid was replaced, but the search input itself lives outside it —
    // typing must never lose focus on every keystroke.
    expect(document.activeElement).toBe(search);
  });

  it("shows a neutral empty state when a search matches nothing", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Catálogo grande",
        categories: [{ id: "cat_1", name: "Servicios" }],
        items: [{ ...baseItem, id: "link_1", name: "Corte de cabello", categoryId: "cat_1" }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=big-catalog-2");

    const search = document.querySelector<HTMLInputElement>(".store-search")!;
    search.value = "algo que no existe";
    search.dispatchEvent(new Event("input"));

    expect(document.querySelector(".status.empty")?.textContent).toContain("No encontramos productos");
  });

  it("filters to one category's products when its chip is clicked", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Catálogo con categorías",
        categories: [
          { id: "cat_1", name: "Cortes" },
          { id: "cat_2", name: "Manicure" },
        ],
        items: [
          { ...baseItem, id: "link_1", name: "Corte clásico", categoryId: "cat_1" },
          { ...baseItem, id: "link_2", name: "Manicure básico", categoryId: "cat_2" },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=chips");

    const chips = [...document.querySelectorAll<HTMLButtonElement>(".category-chip-filter")];
    const manicureChip = chips.find((c) => c.textContent === "Manicure")!;
    manicureChip.click();

    expect(manicureChip.classList.contains("active")).toBe(true);
    const names = [...document.querySelectorAll(".store-item-name")].map((el) => el.textContent);
    expect(names).toEqual(["Manicure básico"]);
  });

  it("shows the announcement bar, brand links, and brand story when the store sets them", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con marca",
        announcement: "Envío gratis desde Bs 200",
        aboutText: "Empezamos en 2020.\n\nHoy enviamos a todo el país.",
        links: [
          { id: "sl_1", label: "Instagram", url: "https://instagram.com/mitienda" },
          // Must be dropped client-side even if the API ever let it through.
          { id: "sl_2", label: "Malicioso", url: "javascript:alert(1)" },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=branded");

    expect(document.querySelector(".store-announcement")?.textContent).toBe("Envío gratis desde Bs 200");

    const links = [...document.querySelectorAll<HTMLAnchorElement>(".store-link-btn")];
    expect(links.map((a) => a.textContent)).toEqual(["Instagram"]);
    expect(links[0].getAttribute("href")).toBe("https://instagram.com/mitienda");
    expect(links[0].rel).toContain("noopener");

    const paragraphs = [...document.querySelectorAll(".store-about-body p")].map((p) => p.textContent);
    expect(paragraphs).toEqual(["Empezamos en 2020.", "Hoy enviamos a todo el país."]);
    expect(
      document.querySelector("#store-grid")!.compareDocumentPosition(document.querySelector(".store-about")!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector(".store-about")?.classList.contains("has-image")).toBe(false);
    expect(document.querySelector(".store-about-heading")?.textContent?.trim()).toBe("Nuestra historia");
    expect(document.querySelector(".store-about-icon")).toBeFalsy();
  });

  it("uses an optional merchant image behind Nuestra historia", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con historia visual",
        aboutText: "Diseñamos cada pieza en Bolivia.",
        aboutImageUrl: "/v1/uploads/historia.webp",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=story-image");

    const story = document.querySelector<HTMLElement>(".store-about");
    expect(story?.classList.contains("has-image")).toBe(true);
    expect(story?.style.getPropertyValue("--store-about-image")).toContain("/v1/uploads/historia.webp");
  });

  it("honors the merchant section order and renders editorial captions as text", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller seguro",
        aboutText: "Nuestra historia va después de las fotos.",
        contentOrder: ["gallery", "hero", "links", "products", "about"],
        editorialGallery: [
          {
            imageUrl: "/v1/uploads/taller.webp",
            caption: '<img id="injected-caption" src=x onerror="alert(1)"> Hecho a mano',
          },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=ordered-store");

    const gallery = document.querySelector(".store-editorial-gallery")!;
    const products = document.querySelector(".store-products")!;
    const story = document.querySelector(".store-about")!;
    expect(gallery.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(products.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector("#injected-caption")).toBeNull();
    expect(document.querySelector(".store-editorial-item figcaption")?.textContent).toContain("<img");
  });

  it("applies the merchant's selected font to the entire storefront", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Casa Editorial",
        fontStyle: "editorial",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=editorial");

    expect(document.body.dataset.fontStyle).toBe("editorial");
    expect(document.querySelector(".merchant-header")).toBeTruthy();
  });

  it("renders none of the branding chrome when the store customizes nothing", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda sencilla",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=plain");

    expect(document.querySelector(".store-announcement")).toBeFalsy();
    expect(document.querySelector(".store-links")).toBeFalsy();
    expect(document.querySelector(".store-about")).toBeFalsy();
    expect(document.body.classList.contains("has-custom-accent")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("#818cf8");

    const palette = getComputedStyle(document.documentElement);
    const foreground = palette.getPropertyValue("--pg-accent-contrast").trim();
    expect(foreground).toBe("#000000");
    expect(contrastRatio(foreground, palette.getPropertyValue("--pg-accent").trim())).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, palette.getPropertyValue("--pg-accent-2").trim())).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps custom accent text AA-readable on both sides of the black/white boundary", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con contraste límite",
        accentColor: "#757575",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=contrast-boundary&preview=1");
    expect(document.documentElement.style.getPropertyValue("--pg-accent-contrast")).toBe("#ffffff");
    expect(contrastRatio("#ffffff", "#757575")).toBeGreaterThanOrEqual(4.5);

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { type: "PAGOSYA_STORE_PREVIEW", patch: { accentColor: "#767676" } },
      }),
    );

    expect(document.documentElement.style.getPropertyValue("--pg-accent-contrast")).toBe("#000000");
    expect(contrastRatio("#000000", "#767676")).toBeGreaterThanOrEqual(4.5);
  });

  it("applies the merchant accent color and button style to the page", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con acento",
        accentColor: "#e11d48",
        buttonStyle: "pill",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=accented");

    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("#e11d48");
    expect(document.body.classList.contains("has-custom-accent")).toBe(true);
    expect(document.body.dataset.buttonStyle).toBe("pill");
  });

  it("applies visual editor messages only when the storefront is in preview mode", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Nombre guardado",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=preview-store&preview=1");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          patch: {
            storeName: "Nombre sin guardar",
            announcement: "Oferta de hoy",
            accentColor: "#d97706",
            buttonStyle: "square",
            boardTexture: "kraft",
          },
        },
      }),
    );

    expect(document.querySelector(".store-title")?.textContent).toBe("Nombre sin guardar");
    expect(document.querySelector(".store-announcement")?.textContent).toBe("Oferta de hoy");
    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("#d97706");
    expect(document.documentElement.style.getPropertyValue("--pg-accent-contrast")).toBe("#000000");
    expect(document.body.dataset.buttonStyle).toBe("square");
    expect(document.body.dataset.boardTexture).toBe("kraft");
  });

  it("shows the search/sort toolbar as soon as a store has two products", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda de dos",
        items: [
          { ...baseItem, id: "link_1", name: "Corte" },
          { ...baseItem, id: "link_2", name: "Manicure" },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=two-items");

    expect(document.querySelector(".store-search")).toBeTruthy();
    expect(document.querySelector(".store-sort")).toBeTruthy();
  });

  it("sorts products by price and by units sold via the sort select", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda ordenable",
        items: [
          { ...baseItem, id: "link_1", name: "Caro", amount: 30000, soldCount: 1 },
          { ...baseItem, id: "link_2", name: "Barato", amount: 1000, soldCount: 0 },
          { ...baseItem, id: "link_3", name: "Popular", amount: 20000, soldCount: 7 },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=sortable");

    const names = () => [...document.querySelectorAll(".store-item-name")].map((el) => el.textContent);
    const sort = document.querySelector<HTMLSelectElement>(".store-sort")!;

    // Default keeps the merchant's own catalog order.
    expect(names()).toEqual(["Caro", "Barato", "Popular"]);

    sort.value = "price-asc";
    sort.dispatchEvent(new Event("change"));
    expect(names()).toEqual(["Barato", "Popular", "Caro"]);

    sort.value = "price-desc";
    sort.dispatchEvent(new Event("change"));
    expect(names()).toEqual(["Caro", "Popular", "Barato"]);

    sort.value = "popular";
    sort.dispatchEvent(new Event("change"));
    expect(names()).toEqual(["Popular", "Caro", "Barato"]);
  });

  it("does not set has-bg-image or force a theme when the store has no background image", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda sin fondo",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=nobackdrop");

    expect(document.body.classList.contains("has-bg-image")).toBe(false);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
