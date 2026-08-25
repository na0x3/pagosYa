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
  extras: [],
  amount: 5000,
  currency: "BOB",
  discountPercent: null,
  discountStartsAt: null,
  discountEndsAt: null,
  soldCount: 0,
};

const baseStoreFields = {
  storeId: "store_1",
  tagline: null,
  logoUrl: null,
  bannerUrl: null,
  backgroundColor: null,
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  backgroundImageUrl: null,
  aboutText: null,
  aboutImageUrl: null,
  accentColor: null,
  fontStyle: "mono",
  buttonStyle: "rounded",
  buttonVariant: "solid",
  buttonMotion: "lift",
  cartButtonLabel: "Ir a pagar",
  checkoutMode: "payment",
  leadCaptureUrl: null,
  cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
  boardTexture: "chalkboard",
  announcement: null,
  announcementMode: "static",
  announcementSpeed: 18,
  announcementSize: "medium",
  announcementColor: "#c58b3c",
  promotionEnabled: false,
  promotionImageUrl: null,
  promotionTitle: null,
  promotionBody: null,
  promotionCtaLabel: null,
  promotionCtaUrl: null,
  locationMapUrl: null,
  locationDescription: null,
  locationHighlight: null,
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

describe("storefront routes", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps merchant preview and owner-device loads out of storefront views", async () => {
    const fetchStore = vi.fn().mockResolvedValue({
      ...baseStoreFields,
      storeName: "Tienda propia",
      items: [baseItem],
    } satisfies Store);
    vi.doMock("../src/api", () => ({
      fetchStore,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=tienda-propia&owner=1");
    expect(fetchStore).toHaveBeenLastCalledWith("tienda-propia", { preview: true });
    expect(document.querySelector(".store-directory-back")).toBeNull();

    await loadCheckout("/?link=tienda-propia");
    expect(fetchStore).toHaveBeenLastCalledWith("tienda-propia", { preview: true });

    await loadCheckout("/?link=cliente-externo");
    expect(fetchStore).toHaveBeenLastCalledWith("cliente-externo", { preview: false });
    expect(document.querySelector<HTMLAnchorElement>(".store-directory-back")?.getAttribute("href")).toBe("/stores/");
  });

  it("shows a neutral empty-state, not the red failure style, for a store with no items", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda Vacía",
        backgroundColor: "#f5f1e8",
        accentColor: "#7c3aed",
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
    const entrance = document.querySelector<HTMLElement>(".store-entry-loader")!;
    expect(entrance.getAttribute("aria-label")).toBe("Cargando Tienda Vacía con pagosYa");
    expect(document.querySelector(".store-entry-loader-brand")?.textContent).toBe("pagosYa");
    expect(document.querySelector<HTMLImageElement>(".store-entry-loader-logo")?.src).toContain("/logo-mark.png");
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
  });

  it("lets a customer choose a calendar-backed appointment slot before paying", async () => {
    const fetchAppointmentAvailability = vi.fn().mockResolvedValue({
      date: "2099-09-01",
      connectedToGoogleCalendar: true,
      offering: { id: "cut_1", name: "Corte clásico", durationMinutes: 45, bufferMinutes: 15, price: 5000, currency: "BOB", color: null },
      slots: [{ startsAt: "2099-09-01T14:00:00.000Z", endsAt: "2099-09-01T15:00:00.000Z", label: "10:00" }],
    });
    const createAppointmentPayment = vi.fn().mockResolvedValue({ appointmentId: "appointment_1", clientSecret: null, checkoutUrl: null, holdExpiresAt: null, status: "CONFIRMED" });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Barbería Norte",
        items: [],
        appointmentOfferings: [{ id: "cut_1", name: "Corte clásico", durationMinutes: 45, bufferMinutes: 15, price: 5000, currency: "BOB", color: null }],
      } satisfies Store),
      fetchAppointmentAvailability,
      createAppointmentPayment,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=barberia-norte");
    await vi.waitFor(() => expect(document.querySelectorAll("[data-appointment-slot]")).toHaveLength(1));
    expect(document.querySelector("#store-appointment-calendar-status")?.textContent).toContain("Google Calendar");
    document.querySelector<HTMLButtonElement>("[data-appointment-slot]")!.click();
    const form = document.querySelector<HTMLFormElement>("#store-appointment-form")!;
    (form.elements.namedItem("customerName") as HTMLInputElement).value = "Juan Pérez";
    (form.elements.namedItem("customerEmail") as HTMLInputElement).value = "juan@example.com";
    form.requestSubmit();

    await vi.waitFor(() => expect(createAppointmentPayment).toHaveBeenCalledWith("barberia-norte", expect.objectContaining({
      offeringId: "cut_1",
      customerName: "Juan Pérez",
      customerEmail: "juan@example.com",
      startsAt: "2099-09-01T14:00:00.000Z",
    })));
  });

  it("renders a flat solid canvas even for legacy stores that saved a gradient", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda Fondo Plano",
        backgroundColor: "#f8fafc",
        backgroundMode: "gradient",
        backgroundGradientStart: "#fef3c7",
        backgroundGradientEnd: "#fbcfe8",
        backgroundGradientAngle: 120,
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=gradient1");

    expect(document.documentElement.style.getPropertyValue("--pg-page-background")).toBe("#f8fafc");
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

    const directoryLink = document.querySelector<HTMLAnchorElement>(".store-directory-back");
    expect(directoryLink?.getAttribute("href")).toBe("/stores/");
    expect(directoryLink?.textContent).toContain("Volver a Mi Tienda");
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

  it("highlights an active timed discount and uses the lower price in the cart", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Café Norte",
        items: [{
          ...baseItem,
          name: "Café Geisha",
          discountPercent: 25,
          discountStartsAt: "2000-01-01T00:00:00.000Z",
          discountEndsAt: "2100-01-01T00:00:00.000Z",
        }],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=cafe-norte");

    expect(document.querySelector(".product-sale-badge")?.textContent).toContain("25% OFF");
    expect(document.querySelector(".product-sale-badge")?.getAttribute("aria-label")).toBe("25% de descuento activo");
    expect(document.querySelector(".store-item-price del")?.textContent).toBe("50.00 BOB");
    expect(document.querySelector(".store-item-price")?.textContent).toContain("37.50 BOB");
    expect(document.querySelector(".store-item-price")?.textContent).toContain("50.00 BOB");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector(".cart-summary")?.textContent).toContain("37.50 BOB");
  });

  it("opens a product's own shareable page from its catalog card and returns to the store", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        announcement: "ENVÍOS A TODO EL PAÍS",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/taller-norte");
    const productLink = document.querySelector<HTMLAnchorElement>(".store-item-name")!;
    expect(productLink.pathname).toBe("/s/taller-norte/p/link_1");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 684 });
    productLink.focus();
    expect(document.activeElement).toBe(productLink);
    productLink.click();
    expect(window.location.pathname).toBe("/s/taller-norte/p/link_1");
    expect(document.querySelector(".store-announcement")).toBeNull();
    expect(document.querySelector(".product-detail-content h1")?.textContent).toContain("Corte de cabello");
    expect(document.querySelector(".product-detail-description")?.textContent).toBe("Incluye lavado y peinado");

    document.querySelector<HTMLAnchorElement>(".product-back-link")!.click();
    await vi.waitFor(() => expect(window.location.pathname).toBe("/s/taller-norte"));
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 684));
    expect(document.querySelector(".store-item-name")?.textContent).toContain("Corte de cabello");
    expect(document.querySelector(".store-announcement")).toBeNull();
  });

  it("resolves a verified custom hostname at the root and keeps product URLs on that domain", async () => {
    const resolveStoreDomain = vi.fn().mockResolvedValue({ hostname: "mitienda.bo", slug: "taller-norte" });
    const fetchStore = vi.fn().mockResolvedValue({
      ...baseStoreFields,
      storeName: "Taller Norte",
      items: [baseItem],
    } satisfies Store);
    vi.doMock("../src/api", () => ({
      resolveStoreDomain,
      fetchStore,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/");

    expect(resolveStoreDomain).toHaveBeenCalledWith(window.location.hostname);
    expect(fetchStore).toHaveBeenCalledWith("taller-norte", { preview: false });
    const productLink = document.querySelector<HTMLAnchorElement>(".store-item-name")!;
    expect(productLink.pathname).toBe("/p/link_1");
    productLink.click();
    expect(window.location.pathname).toBe("/p/link_1");
    expect(document.querySelector(".product-detail-content h1")?.textContent).toContain("Corte de cabello");
  });

  it("renders multiple photos and selectable product types on a direct product URL", async () => {
    const productWithGallery = {
      ...baseItem,
      imageUrls: ["/v1/uploads/frente.webp", "/v1/uploads/detalle.webp"],
      imagePositions: ["50% 18%", "72% 84%"],
      variants: [
        { id: "small", name: "Pequeño", amount: 4000, stock: 2 },
        { id: "large", name: "Grande", amount: 6500, stock: 4 },
      ],
    };
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        items: [productWithGallery],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/taller-norte/p/link_1");

    expect(document.querySelectorAll(".product-detail-thumbnail")).toHaveLength(2);
    expect(document.querySelectorAll(".product-detail-option")).toHaveLength(2);
    expect(document.querySelector(".product-detail-price")?.textContent).toBe("50.00 BOB");
    expect(document.querySelector<HTMLButtonElement>(".product-add")!.disabled).toBe(true);
    expect(document.querySelector<HTMLImageElement>(".product-detail-main-image")?.style.objectPosition).toBe("50% 18%");

    document.querySelector<HTMLButtonElement>(".product-detail-image-arrow.next")!.click();
    expect(document.querySelector<HTMLImageElement>(".product-detail-main-image")?.src).toContain("detalle.webp");

    document.querySelectorAll<HTMLButtonElement>(".product-detail-thumbnail")[1].click();
    expect(document.querySelector<HTMLImageElement>(".product-detail-main-image")?.src).toContain("detalle.webp");
    expect(document.querySelector<HTMLImageElement>(".product-detail-main-image")?.style.objectPosition).toBe("72% 84%");

    document.querySelector<HTMLButtonElement>('[data-variant-id="large"]')!.click();
    expect(document.querySelector(".product-detail-price")?.textContent).toBe("65.00 BOB");
    document.querySelector<HTMLButtonElement>(".product-add")!.click();
    expect(document.querySelector(".qty-value")?.textContent).toBe("1");
    expect(document.querySelector(".cart-summary")?.textContent).toContain("65.00 BOB");
    expect(document.querySelector<HTMLButtonElement>("#cart-pay")?.disabled).toBe(false);
  });

  it("renders merchant hero slides and lets the shopper move between them", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        layoutStyle: "editorial",
        backgroundImageUrl: "http://localhost:3000/uploads/uno.webp",
        heroSlides: [
          { imageUrl: "http://localhost:3000/uploads/uno.webp", title: "Nueva colección", body: "Hecha en Bolivia", ctaLabel: "Explorar" },
          { imageUrl: "/v1/uploads/dos.webp", title: "Piezas de temporada", ctaLabel: "Ver temporada" },
          { imageUrl: "/v1/uploads/tres.webp", title: "La mirada del taller", body: "Una tercera perspectiva para recorrer la marca." },
          { imageUrl: "/v1/uploads/cuatro.webp", title: "Elige tu pieza", body: "El recorrido termina cerca del catálogo." },
        ],
        editorialGallery: [{ imageUrl: "http://localhost:3000/uploads/uno.webp", title: "Materia y detalle", caption: "Una mirada cercana", body: "La imagen comparte espacio con un relato más amplio sobre la selección." }],
        items: [{ ...baseItem, imageUrls: ["/v1/uploads/uno.webp"], imagePositions: ["17% 81%"] }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=taller-norte");
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".store-slide")).toHaveLength(4);
    });
    expect(document.body.dataset.layoutStyle).toBe("editorial");
    expect(document.querySelectorAll(".store-carousel-dots button")).toHaveLength(4);
    expect(document.querySelector(".store-editorial-item figcaption strong")?.textContent).toBe("Materia y detalle");
    expect(document.querySelector(".store-editorial-item figcaption p")?.textContent).toContain("relato más amplio");
    const slides = document.querySelectorAll<HTMLElement>(".store-slide");
    expect(slides[0].classList.contains("active")).toBe(true);
    const firstHeroImage = slides[0].querySelector<HTMLImageElement>(".store-fidelity-media-source");
    expect(firstHeroImage?.style.objectPosition).toBe("17% 81%");
    expect(firstHeroImage?.getAttribute("fetchpriority")).toBe("high");
    expect(slides[0].querySelector<HTMLImageElement>(".store-fidelity-media-backdrop")?.getAttribute("aria-hidden")).toBe("true");
    expect(slides[1].querySelector<HTMLImageElement>(".store-fidelity-media-source")?.getAttribute("loading")).toBe("lazy");
    expect(document.querySelector<HTMLImageElement>(".store-editorial-item img")?.style.objectPosition).toBe("17% 81%");
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
        experienceStyle: "story-scroller",
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
      expect(document.querySelector<HTMLVideoElement>(".store-story-panel video")?.src).toContain("coleccion.mp4");

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

    expect(document.querySelector<HTMLSelectElement>(".variant-select")?.value).toBe("");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
    const firstVariantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    firstVariantSelect.value = "var_small";
    firstVariantSelect.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();

    const variantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    variantSelect.value = "var_large";
    variantSelect.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();

    expect(document.querySelector(".cart-summary")?.textContent).toContain("130.00 BOB");
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    expect(document.querySelector("#cart-review-title")?.textContent).toBe("Mi carrito");
    expect(document.querySelectorAll(".cart-review-line")).toHaveLength(2);
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();
    await vi.waitFor(() => expect(checkoutCart).toHaveBeenCalled());
    expect(checkoutCart).toHaveBeenCalledWith("burger-options", [
      { paymentLinkId: "link_1", variantId: "var_small", quantity: 1 },
      { paymentLinkId: "link_1", variantId: "var_large", quantity: 1 },
    ]);
  });

  it("quotes a promo code, shows the reduced total, and submits the code with checkout", async () => {
    const checkoutCart = vi.fn().mockResolvedValue({
      clientSecret: "pi_promo_secret_x",
      storeName: "Café Norte",
      cartDescription: "Café x1",
      contactPhone: null,
      contactEmail: null,
    });
    const quotePromoCode = vi.fn().mockResolvedValue({ code: "VERANO20", discountType: "PERCENT", discountValue: 20 });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({ ...baseStoreFields, storeName: "Café Norte", items: [baseItem] } satisfies Store),
      quotePromoCode,
      checkoutCart,
      fetchSession: vi.fn().mockResolvedValue({
        id: "pi_promo", amount: 4000, currency: "BOB", status: "REQUIRES_PAYMENT_METHOD", description: null, merchantName: "Café Norte",
      }),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=cafe-norte");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    const input = document.querySelector<HTMLInputElement>("#promo-code-input")!;
    input.value = "verano20";
    document.querySelector<HTMLFormElement>("#promo-code-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.querySelector(".cart-review-discount")?.textContent).toContain("10.00 BOB"));
    expect(document.querySelector(".cart-review-total")?.textContent).toContain("40.00 BOB");
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();
    await vi.waitFor(() => expect(checkoutCart).toHaveBeenCalled());
    expect(checkoutCart).toHaveBeenCalledWith("cafe-norte", [{ paymentLinkId: "link_1", quantity: 1 }], "VERANO20");
  });

  it("blocks adding until required choices are selected and prices chosen extras", async () => {
    const checkoutCart = vi.fn().mockResolvedValue({
      clientSecret: "pi_extras_secret_x",
      storeName: "Pizzería",
      cartDescription: "Pizza (Grande) + Queso + Caja regalo x1",
      contactPhone: null,
      contactEmail: null,
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Pizzería",
        items: [{
          ...baseItem,
          name: "Pizza",
          variants: [{ id: "large", name: "Grande", amount: 8000 }],
          extras: [
            { id: "cheese", name: "Queso", amount: 500, required: true, available: true },
            { id: "gift", name: "Caja regalo", amount: 300, required: false, available: true },
          ],
        }],
      } satisfies Store),
      checkoutCart,
      fetchSession: vi.fn().mockResolvedValue({ id: "pi_extras", amount: 8800, currency: "BOB", status: "REQUIRES_PAYMENT_METHOD", description: null, merchantName: "Pizzería" }),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=pizzeria");

    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
    const variantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    variantSelect.value = "large";
    variantSelect.dispatchEvent(new Event("change"));
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);

    document.querySelector<HTMLInputElement>('[data-extra-id="cheese"]')!.click();
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(false);
    document.querySelector<HTMLInputElement>('[data-extra-id="gift"]')!.click();
    expect(document.querySelector(".store-item-price")?.textContent).toContain("88.00 BOB");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    expect(document.querySelector(".cart-line-extras")?.textContent).toContain("Queso · Caja regalo");
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();
    await vi.waitFor(() => expect(checkoutCart).toHaveBeenCalled());
    expect(checkoutCart).toHaveBeenCalledWith("pizzeria", [{ paymentLinkId: "link_1", variantId: "large", extraIds: ["cheese", "gift"], quantity: 1 }]);
  });

  it("includes two sides for free and charges only the third grouped choice", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "El Almuerzo",
        items: [{
          ...baseItem,
          name: "Menú del día",
          amount: 3000,
          extras: [
            { id: "rice", name: "Arroz", amount: 500, required: false, available: true, groupName: "Guarniciones", freeAllowance: 2 },
            { id: "salad", name: "Ensalada", amount: 600, required: false, available: true, groupName: "Guarniciones", freeAllowance: 2 },
            { id: "fries", name: "Papas", amount: 700, required: false, available: true, groupName: "Guarniciones", freeAllowance: 2 },
          ],
        }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=almuerzo");
    expect(document.querySelector(".store-item-extras")?.textContent).toContain("Guarniciones: 2 incluidas");

    document.querySelector<HTMLInputElement>('[data-extra-id="rice"]')!.click();
    document.querySelector<HTMLInputElement>('[data-extra-id="salad"]')!.click();
    expect(document.querySelector(".store-item-price")?.textContent).toContain("30.00 BOB");
    expect(document.querySelector<HTMLInputElement>('[data-extra-id="fries"]')!.parentElement?.textContent).toContain("+7.00 BOB");

    document.querySelector<HTMLInputElement>('[data-extra-id="fries"]')!.click();
    expect(document.querySelector(".store-item-price")?.textContent).toContain("37.00 BOB");
  });

  it("marks a product unavailable when a required shared extra is exhausted", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Pizzería",
        items: [{
          ...baseItem,
          name: "Pizza cottage",
          extras: [{ id: "cottage", name: "Queso cottage", amount: 500, required: true, available: false }],
        }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=pizzeria-sin-cottage");
    expect(document.querySelector(".stock-note.out")?.textContent).toBe("Queso cottage agotado");
    expect(document.querySelector(".qty-stepper")).toBeFalsy();
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
    const firstVariantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    firstVariantSelect.value = "var_small";
    firstVariantSelect.dispatchEvent(new Event("change"));
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
        showLowStockToCustomers: true,
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
    const firstVariantSelect = document.querySelector<HTMLSelectElement>(".variant-select")!;
    firstVariantSelect.value = "var_small";
    firstVariantSelect.dispatchEvent(new Event("change"));
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

  it("requires an explicit purchasable option and disables exhausted choices", async () => {
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
    expect(options[0].value).toBe("");
    expect(options[1].disabled).toBe(true);
    expect(options[1].textContent).toContain("agotado");
    expect(document.querySelector<HTMLSelectElement>(".variant-select")!.value).toBe("");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
    expect(document.querySelector(".store-item")?.classList.contains("sold-out")).toBe(false);
  });

  it("renders merchant marquee, promotion, and button customization", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda Promo",
        announcement: "Envío gratis hoy • Compra local",
        announcementMode: "marquee",
        announcementSpeed: 12,
        announcementSize: "large",
        announcementColor: "#f5d90a",
        promotionEnabled: true,
        promotionImageUrl: "/v1/uploads/promo.webp",
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
    expect(document.querySelector(".store-announcement.marquee")?.getAttribute("style")).toContain("--announcement-bg:#f5d90a");
    // Legacy/proposal values cannot enlarge the top band: storefront
    // announcements are intentionally compact everywhere.
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-size-small")).toBe(true);
    expect(document.querySelectorAll(".store-announcement-sequence")).toHaveLength(2);
    expect(document.querySelectorAll(".store-announcement-phrase")).toHaveLength(4);
    expect(document.querySelector(".store-announcement-a11y")?.textContent).toBe("Envío gratis hoy • Compra local");
    expect(document.querySelector(".promotion-dialog")?.textContent).toContain("20% de descuento");
    expect(document.querySelector<HTMLImageElement>(".promotion-image")?.src).toContain("promo.webp");
    expect(document.body.dataset.buttonStyle).toBe("pill");
    expect(document.body.dataset.buttonVariant).toBe("outline");
    expect(document.body.dataset.buttonMotion).toBe("pulse");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Completar pedido");

    const promotionBackdrop = document.querySelector<HTMLElement>("[data-promotion-backdrop]")!;
    document.querySelector<HTMLButtonElement>(".promotion-close")!.click();
    expect(promotionBackdrop.classList.contains("is-closing")).toBe(true);
    promotionBackdrop.dispatchEvent(new Event("animationend"));
    expect(document.querySelector(".promotion-dialog")).toBeNull();
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some((key) => key?.startsWith("pagosya_store_promotion_seen_store_1_"))).toBe(true);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    expect(document.querySelector(".promotion-dialog")).toBeNull();
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
            announcementSize: "small",
            announcementColor: "#123456",
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
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-size-small")).toBe(true);
    expect(document.querySelector(".store-announcement.marquee")?.getAttribute("style")).toContain("--announcement-bg:#123456");
    expect(document.querySelector(".promotion-dialog")?.textContent).toContain("Solo hoy");
    expect(document.activeElement).not.toBe(document.querySelector(".promotion-close"));
    expect(document.body.dataset.buttonVariant).toBe("soft");
    expect(document.body.dataset.buttonMotion).toBe("pulse");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Completar pedido");
  });

  it("enlarges a preview logo when the store name is blank and reveals the edited section", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Nombre publicado",
        logoUrl: "/published-logo.webp",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));
    const previewScrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: previewScrollTo });

    await loadCheckout("/?link=preview-store&preview=1");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "brand",
          patch: { storeName: "", logoUrl: "/draft-logo.webp" },
        },
      }),
    );

    const header = document.querySelector(".merchant-header");
    expect(header?.classList.contains("has-prominent-logo")).toBe(true);
    expect(header?.classList.contains("is-logo-only")).toBe(true);
    expect(document.querySelector(".store-title")).toBeNull();
    expect(document.querySelector(".merchant-header-logo")?.getAttribute("alt")).toBe("Logo de la tienda");
    expect(document.querySelector(".store-catalog-heading p")?.textContent).toBe("Explora nuestra selección.");
    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" })));
  });

  it("opens and updates the cart when the merchant edits a cart control", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista previa",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));
    const previewScrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: previewScrollTo });

    await loadCheckout("/?link=preview-store&preview=1");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "products",
          previewAction: "cart",
          patch: { cartButtonLabel: "Finalizar pedido" },
        },
      }),
    );

    const dialog = document.querySelector<HTMLDialogElement>(".cart-review-dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.classList.contains("is-preview-open")).toBe(true);
    expect(dialog?.querySelector("#cart-confirm")?.textContent).toBe("Finalizar pedido");
    expect(document.activeElement).not.toBe(dialog?.querySelector(".cart-review-close"));

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "products",
          previewAction: "cart",
          patch: { cartButtonLabel: "Comprar ahora", checkoutMode: "whatsapp" },
        },
      }),
    );
    expect(document.querySelectorAll(".cart-review-dialog")).toHaveLength(1);
    expect(dialog?.querySelector("#cart-confirm")?.textContent).toBe("Comprar ahora");
    expect(dialog?.querySelector(".cart-review-head")?.textContent).toContain("WhatsApp");

    previewScrollTo.mockClear();
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "brand",
          previewAction: "scroll",
          patch: { tagline: "Nueva presentación" },
        },
      }),
    );
    expect(document.querySelector(".cart-review-dialog")).toBeNull();
    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalled());
  });

  it("opens the exact product detail and previews its draft description", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista previa",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));
    const previewScrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: previewScrollTo });

    await loadCheckout("/?link=preview-store&preview=1");
    previewScrollTo.mockClear();
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "products",
          previewAction: "product",
          patch: {},
          previewProduct: {
            ...baseItem,
            name: "Corte editorial",
            description: "La descripción que el comercio está escribiendo.",
            amount: 7250,
          },
        },
      }),
    );

    expect(document.body.classList.contains("product-detail-page")).toBe(true);
    expect(document.querySelector(".product-detail-content h1")?.textContent).toBe("Corte editorial");
    expect(document.querySelector(".product-detail-description")?.textContent).toBe("La descripción que el comercio está escribiendo.");
    expect(document.querySelector(".product-detail-price")?.textContent).toContain("72.50");
    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" }));
  });

  it("targets the matching animated story when an editorial field is touched", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista previa",
        experienceStyle: "story-scroller",
        motionDuoEnabled: true,
        motionExperience: "story-scroll",
        heroSlides: [
          { imageUrl: "/hero-1.webp", title: "Primera portada" },
          { imageUrl: "/hero-2.webp", title: "Segunda portada" },
        ],
        editorialGallery: [
          { imageUrl: "/story-1.webp", title: "Primera", body: "Uno" },
          { imageUrl: "/story-2.webp", title: "Segunda", body: "Dos" },
          { imageUrl: "/story-3.webp", title: "Tercera", body: "Tres" },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));
    const previewScrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: previewScrollTo });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3200 });

    await loadCheckout("/?link=preview-store&preview=1");
    previewScrollTo.mockClear();
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "hero",
          previewAction: "hero-item",
          previewTargetIndex: 1,
          patch: {},
        },
      }),
    );
    await vi.waitFor(() => expect(document.querySelectorAll(".store-carousel-dots [data-slide-to]")[1]?.getAttribute("aria-current")).toBe("true"));

    previewScrollTo.mockClear();
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "PAGOSYA_STORE_PREVIEW",
          previewSection: "gallery",
          previewAction: "editorial-item",
          previewTargetIndex: 1,
          previewTargetKind: "text",
          patch: {},
        },
      }),
    );
    const target = document.querySelectorAll<HTMLElement>(".store-flow-section")[1];
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ x: 0, y: 900, top: 900, right: 500, bottom: 1200, left: 0, width: 500, height: 300, toJSON: () => ({}) });

    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) })));
    expect(previewScrollTo.mock.calls.at(-1)?.[0].top).toBeGreaterThan(0);
  });

  it("renders a standalone AI proposal preview from the URL without publishing it", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda publicada",
        tagline: "Contenido publicado",
        accentColor: "#818cf8",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));
    const hash = new URLSearchParams({
      proposal: JSON.stringify({
        storeName: "Tienda publicada",
        tagline: "Propuesta sin publicar",
        accentColor: "#b4532a",
        cartButtonLabel: "Probar esta dirección",
      }),
    });

    await loadCheckout(`/?link=preview-store&preview=1#${hash}`);

    expect(document.querySelector(".store-tagline")?.textContent).toBe("Propuesta sin publicar");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Probar esta dirección");
    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("#b4532a");
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
    expect(document.querySelector(".cart-review-total")?.textContent).toContain("50.00 BOB");
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();

    await vi.waitFor(() => {
      expect(document.querySelector(".amount")?.textContent).toBe("50.00 BOB");
    });
    expect(document.querySelector(".description")?.textContent).toBe("Corte de cabello x1");
    // Cart-checkout flow shows the store name as a big header, not the
    // avatar+name row used for direct client_secret links.
    expect(document.querySelector(".merchant-row")).toBeFalsy();
  });

  it("sends the composed cart to WhatsApp without creating a payment", async () => {
    const checkoutCart = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller WhatsApp",
        checkoutMode: "whatsapp",
        contactPhone: "+591 71234567",
        cartButtonLabel: "Pedir por WhatsApp",
        items: [baseItem],
      } satisfies Store),
      checkoutCart,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=taller-whatsapp");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();

    expect(checkoutCart).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/59171234567\?text=/), "_blank", "noopener,noreferrer");
    const message = decodeURIComponent(String(open.mock.calls[0][0]).split("?text=")[1]);
    expect(message).toContain("Corte de cabello x1");
    expect(message).toContain("Total: 50.00 BOB");
    expect(document.querySelector(".secure-note")?.textContent).toContain("WhatsApp");
  });

  it("asks for an interested customer's email only at checkout and sends it without charging", async () => {
    const checkoutCart = vi.fn();
    const submitStoreLead = vi.fn().mockResolvedValue({ submitted: true });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Estudio de interiores",
        checkoutMode: "external",
        cartButtonLabel: "Solicitar asesoría",
        items: [baseItem],
      } satisfies Store),
      checkoutCart,
      submitStoreLead,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=estudio-leads");
    expect(document.querySelector("#early-lead-form")).toBeFalsy();
    expect(document.querySelector("#lead-email")).toBeFalsy();
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();

    expect(document.querySelector(".cart-review-head")?.textContent).toContain("pagosYa no procesará un cobro");
    const form = document.querySelector<HTMLFormElement>("#store-lead-form")!;
    expect(form.querySelector("#lead-name")).toBeFalsy();
    expect(form.querySelector("#lead-phone")).toBeFalsy();
    expect(form.querySelector("#lead-message")).toBeFalsy();
    form.querySelector<HTMLInputElement>("#lead-email")!.value = "maria@gmail.com";
    form.requestSubmit();

    expect(checkoutCart).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(submitStoreLead).toHaveBeenCalledWith(
      "estudio-leads",
      { email: "maria@gmail.com" },
      [{ paymentLinkId: "link_1", quantity: 1 }],
    ));
    expect(document.querySelector(".lead-capture-success")?.textContent).toContain("La tienda ya recibió tu solicitud");
  });

  it("renders an optional contact section and sends its message independently of checkout mode", async () => {
    const submitStoreLead = vi.fn().mockResolvedValue({ submitted: true });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller abierto",
        checkoutMode: "whatsapp",
        contactFormEnabled: true,
        contentOrder: ["hero", "products", "about", "gallery", "contact", "links"],
        items: [baseItem],
      } satisfies Store),
      submitStoreLead,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=taller-contacto");
    const form = document.querySelector<HTMLFormElement>("#store-contact-form")!;
    expect(form).toBeTruthy();
    const siteHeader = document.querySelector<HTMLElement>(".store-site-header")!;
    expect(siteHeader.querySelector(".store-site-brand .store-title")?.textContent).toBe("Taller abierto");
    expect([...siteHeader.querySelectorAll<HTMLAnchorElement>(".store-site-nav a")].map((link) => [link.textContent, link.hash])).toEqual([
      ["Tienda", "#store-products"],
      ["Contacto", "#store-contact"],
    ]);
    form.querySelector<HTMLInputElement>("#store-contact-name")!.value = "Ana";
    form.querySelector<HTMLInputElement>("#store-contact-email")!.value = "ana@gmail.com";
    form.querySelector<HTMLTextAreaElement>("#store-contact-message")!.value = "¿Abren los sábados?";
    form.requestSubmit();

    await vi.waitFor(() => expect(submitStoreLead).toHaveBeenCalledWith(
      "taller-contacto",
      { name: "Ana", email: "ana@gmail.com", message: "¿Abren los sábados?" },
      [],
    ));
    expect(form.querySelector(".store-contact-status")?.textContent).toContain("Pregunta enviada");
  });

  it("renders a safe location map, highlighted reference, and description near the bottom", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        locationMapUrl: "https://www.openstreetmap.org/export/embed.html?bbox=-68.2%2C-16.6%2C-68.1%2C-16.4",
        locationHighlight: "A media cuadra de la plaza",
        locationDescription: "Atendemos de lunes a sábado. <img src=x onerror=alert(1)>",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=taller-norte");

    const location = document.querySelector<HTMLElement>(".store-location-section")!;
    const iframe = location.querySelector<HTMLIFrameElement>("iframe")!;
    expect(location.querySelector("h2")?.textContent).toBe("Visítanos");
    expect(location.querySelector("mark")?.textContent).toBe("A media cuadra de la plaza");
    expect(location.querySelector(".store-location-description")?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(location.querySelector("img")).toBeNull();
    expect(iframe.getAttribute("src")).toContain("openstreetmap.org/export/embed.html");
    expect(iframe.getAttribute("sandbox")).toContain("allow-scripts");
    expect(document.querySelector<HTMLAnchorElement>('.store-site-nav a[href="#store-location"]')?.textContent).toBe("Ubicación");
    expect(location.compareDocumentPosition(document.querySelector(".secure-note")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("lets the merchant move location through the same section order", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller móvil",
        locationMapUrl: "https://www.openstreetmap.org/export/embed.html?bbox=-68.2%2C-16.6%2C-68.1%2C-16.4",
        contentOrder: ["location", "hero", "products", "about", "gallery", "links", "contact"],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=taller-movil");

    const location = document.querySelector(".store-location-section")!;
    const products = document.querySelector(".store-products")!;
    expect(location.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not embed an untrusted location URL", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Seguro",
        locationMapUrl: "https://maps.google.evil.com/maps/embed?pb=tracking",
        locationDescription: "Encuéntranos junto al mercado.",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=taller-seguro");

    expect(document.querySelector(".store-location-section")).toBeTruthy();
    expect(document.querySelector(".store-location-map")).toBeNull();
    expect(document.querySelector(".store-location-link")).toBeNull();
  });

  it("reveals multiple locations and checks branch stock before checkout", async () => {
    const checkoutCart = vi.fn().mockResolvedValue({
      clientSecret: "pi_multi_secret_x",
      trackingToken: "track_multi",
      storeName: "Cocina Norte",
      cartDescription: "Corte x1",
      contactPhone: null,
      contactEmail: null,
      fulfillmentLocationName: "Sucursal Centro",
      fulfillmentMethod: "delivery",
    });
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/La_Paz", weekday: "short" }).format(new Date());
    const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday as "Sun"] ?? 0;
    const openingHours = Array.from({ length: 7 }, (_, day) => ({ day, open: "09:00", close: "18:00", closed: day !== (dayIndex + 1) % 7 }));
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Cocina Norte",
        locations: [
          { id: "centro", name: "Sucursal Centro", address: "Av. Arce 123", pickupEnabled: true, deliveryEnabled: true, openingHours, inventory: [{ paymentLinkId: "link_1", stock: 4 }] },
          { id: "sur", name: "Sucursal Sur", address: "Calle 8", pickupEnabled: true, deliveryEnabled: true, openingHours, inventory: [{ paymentLinkId: "link_1", stock: 0 }] },
        ],
        items: [baseItem],
      } satisfies Store),
      checkoutCart,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=cocina-norte");
    const locationsToggle = document.querySelector<HTMLButtonElement>(".store-locations-toggle")!;
    expect(locationsToggle.textContent).toContain("Ver ubicaciones");
    locationsToggle.click();
    expect(document.querySelector("#store-locations-list")?.hasAttribute("hidden")).toBe(false);

    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    expect(document.querySelector(".cart-fulfillment")?.textContent).toContain("Solo mostramos ubicaciones con stock");
    expect(document.querySelector<HTMLInputElement>('input[name="fulfillmentLocation"][value="sur"]')?.disabled).toBe(true);
    document.querySelector<HTMLInputElement>('input[name="fulfillmentMethod"][value="delivery"]')!.click();
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();

    await vi.waitFor(() => expect(checkoutCart).toHaveBeenCalledWith(
      "cocina-norte",
      [{ paymentLinkId: "link_1", quantity: 1 }],
      undefined,
      { locationId: "centro", fulfillmentMethod: "delivery" },
    ));
  });

  it("confirms a zero-priced order by contact form instead of opening payment", async () => {
    const checkoutCart = vi.fn();
    const submitStoreLead = vi.fn().mockResolvedValue({ submitted: true });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda de muestras",
        checkoutMode: "payment",
        items: [{ ...baseItem, name: "Muestra gratis", amount: 0 }],
      } satisfies Store),
      checkoutCart,
      submitStoreLead,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=muestras");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    expect(document.querySelector("#cart-confirm")?.textContent).toContain("Confirmar pedido gratis");
    expect(document.querySelector(".cart-review-head")?.textContent).toContain("no tiene costo");
    const form = document.querySelector<HTMLFormElement>("#store-lead-form")!;
    form.querySelector<HTMLInputElement>("#lead-name")!.value = "María Pérez";
    form.querySelector<HTMLInputElement>("#lead-email")!.value = "maria@gmail.com";
    form.querySelector<HTMLInputElement>("#lead-phone")!.value = "+591 71234567";
    form.requestSubmit();

    await vi.waitFor(() => expect(submitStoreLead).toHaveBeenCalled());
    expect(checkoutCart).not.toHaveBeenCalled();
  });

  it("does not open WhatsApp when the store has an invalid recipient number", async () => {
    const checkoutCart = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller sin teléfono",
        checkoutMode: "whatsapp",
        contactPhone: "+1",
        cartButtonLabel: "Pedir por WhatsApp",
        items: [baseItem],
      } satisfies Store),
      checkoutCart,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=taller-sin-telefono");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    document.querySelector<HTMLButtonElement>("#cart-confirm")!.click();

    expect(open).not.toHaveBeenCalled();
    expect(checkoutCart).not.toHaveBeenCalled();
    expect(document.querySelector(".cart-review-dialog .cart-checkout-error")?.textContent).toContain("número de WhatsApp válido");
  });

  it("keeps the cart available and lets the customer retry when checkout fails", async () => {
    const checkoutCart = vi
      .fn()
      .mockRejectedValueOnce(new Error("Servicio temporalmente no disponible"))
      .mockResolvedValueOnce({
        clientSecret: "pi_retry_secret_abc",
        storeName: "Tienda reintento",
        cartDescription: "Producto x1",
      } satisfies CartCheckoutResult);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda reintento",
        items: [baseItem],
      } satisfies Store),
      checkoutCart,
      fetchSession: vi.fn().mockResolvedValue({
        id: "pi_retry",
        amount: 5000,
        currency: "BOB",
        status: "REQUIRES_PAYMENT_METHOD",
        description: null,
        merchantName: "Tienda reintento",
      }),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=retry-store");
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    const payButton = document.querySelector<HTMLButtonElement>("#cart-pay")!;
    payButton.click();
    const confirmButton = document.querySelector<HTMLButtonElement>("#cart-confirm")!;
    confirmButton.click();

    await vi.waitFor(() => expect(document.querySelector(".cart-review-dialog .cart-checkout-error")?.textContent).toContain("Intenta nuevamente"));
    expect(document.querySelector(".store-products")).toBeTruthy();
    expect(confirmButton.disabled).toBe(false);
    expect(confirmButton.textContent).toBe("Continuar al pago");

    confirmButton.click();
    await vi.waitFor(() => expect(document.querySelector(".amount")?.textContent).toBe("50.00 BOB"));
    expect(checkoutCart).toHaveBeenCalledTimes(2);
  });

  it("shows image-led section choices before disclosing categorized products", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con categorías",
        categories: [{ id: "cat_1", name: "Servicios" }],
        items: [
          { ...baseItem, id: "link_1", name: "Corte de cabello", categoryId: "cat_1", imageUrls: ["/servicios.webp"] },
          { ...baseItem, id: "link_2", name: "Manicure sin categoría", categoryId: null, imageUrls: ["/otros.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=multi-cat");

    const sections = [...document.querySelectorAll<HTMLButtonElement>(".catalog-section-card")];
    expect(sections.map((section) => section.querySelector("strong")?.textContent)).toEqual(["Servicios", "Otros"]);
    expect(sections.map((section) => section.querySelector("img")?.getAttribute("src"))).toEqual(["/servicios.webp", "/otros.webp"]);
    expect(document.querySelector(".store-toolbar")).toBeFalsy();
    expect(document.querySelectorAll(".store-item")).toHaveLength(0);

    sections[0].click();

    expect(document.querySelector(".store-toolbar")).toBeTruthy();
    expect(document.body.textContent).toContain("Corte de cabello");
    expect(document.body.textContent).not.toContain("Manicure sin categoría");
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
        showLowStockToCustomers: true,
        items: [{ ...baseItem, tags: ["Nuevo", "Popular"], stock: 1 }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=stocked");

    expect(document.querySelectorAll(".tag-badge")).toHaveLength(2);
    expect(document.querySelector(".stock-note")?.textContent).toBe("¡Solo queda 1!");

    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    await vi.waitFor(() => expect(document.querySelector(".qty-value")?.textContent).toBe("1"));

    // Stock is exhausted at qty 1 — the + button must now be disabled rather
    // than letting the cart silently exceed what's actually available.
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
  });

  it("hides healthy stock, reveals it below five, and announces exhaustion at the cart limit", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con inventario",
        showLowStockToCustomers: true,
        items: [{ ...baseItem, stock: 6 }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=private-stock");
    expect(document.querySelector(".stock-note")).toBeFalsy();

    for (let quantity = 1; quantity <= 2; quantity += 1) {
      document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
      await vi.waitFor(() => expect(document.querySelector(".qty-value")?.textContent).toBe(String(quantity)));
    }
    expect(document.querySelector(".stock-note")?.textContent).toBe("¡Solo quedan 4!");

    for (let quantity = 3; quantity <= 6; quantity += 1) {
      document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
      await vi.waitFor(() => expect(document.querySelector(".qty-value")?.textContent).toBe(String(quantity)));
    }
    expect(document.querySelector(".stock-note.out")?.textContent).toBe("¡Stock agotado!");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);
  });

  it("keeps inventory quantities private unless the store opts in", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con inventario privado",
        showLowStockToCustomers: false,
        items: [{ ...baseItem, stock: null, purchaseLimit: 2 }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=hidden-stock");
    expect(document.querySelector(".stock-note")).toBeFalsy();
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector(".stock-note")).toBeFalsy();
    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector(".stock-note.out")?.textContent).toBe("¡Stock agotado!");
    expect(document.querySelector<HTMLButtonElement>(".qty-plus")!.disabled).toBe(true);

    document.querySelector<HTMLButtonElement>(".qty-plus")!.click();
    expect(document.querySelector(".qty-value")?.textContent).toBe("2");
  });

  it("offers pictured recommendations in the cart and adds one without leaving the review", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Cafetería",
        cartRecommendationProductIds: ["link_2"],
        items: [
          { ...baseItem, imageUrls: ["/v1/uploads/cafe.png"] },
          { ...baseItem, id: "link_2", name: "Cheesecake", amount: 4400, imageUrls: ["/v1/uploads/cheesecake.png"], imagePositions: ["72% 18%"], soldCount: 8 },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=cart-recommendations");
    document.querySelector<HTMLButtonElement>('.store-item[data-id="link_1"] .qty-plus')!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();

    expect(document.querySelector("#cart-recommendations-title")?.textContent).toBe("Súmale algo más");
    expect(document.querySelector<HTMLImageElement>(".cart-recommendation img")?.src).toContain("cheesecake.png");
    expect(document.querySelector<HTMLImageElement>(".cart-recommendation img")?.style.objectPosition).toBe("72% 18%");
    expect(document.querySelector(".cart-recommendation")?.textContent?.trim()).toBe("");
    expect(document.querySelector(".cart-recommendation")?.getAttribute("aria-label")).toBe("Agregar Cheesecake");

    document.querySelector<HTMLButtonElement>('[data-recommend-product="link_2"]')!.click();
    expect(document.querySelectorAll(".cart-review-line")).toHaveLength(2);
    expect(document.querySelector(".cart-recommendations")).toBeFalsy();
  });

  it("does not render cart recommendations when the merchant disables them", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        cartRecommendationsEnabled: false,
        storeName: "Catálogo directo",
        items: [
          { ...baseItem, imageUrls: ["/v1/uploads/uno.png"] },
          { ...baseItem, id: "link_2", name: "Otro producto", imageUrls: ["/v1/uploads/dos.png"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=no-recommendations");
    document.querySelector<HTMLButtonElement>('.store-item[data-id="link_1"] .qty-plus')!.click();
    document.querySelector<HTMLButtonElement>("#cart-pay")!.click();
    expect(document.querySelector(".cart-recommendations")).toBeFalsy();
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

    expect(document.querySelector(".stock-note.out")?.textContent).toBe("¡Stock agotado!");
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

    document.querySelector<HTMLButtonElement>(".product-gallery-arrow.previous")!.click();
    await vi.waitFor(() => expect(mainImg.src).toContain("a.png"));
  });

  it("ignores legacy background images and keeps the canvas brand-color only", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con fondo",
        backgroundColor: "#f4ead7",
        backgroundImageUrl: "/v1/uploads/backdrop.jpg",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=backdrop");

    expect(document.body.classList.contains("has-bg-image")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--pg-page-bg")).toBe("#f4ead7");
    expect(document.documentElement.style.getPropertyValue("--pg-page-bg-image")).toBe("");
    // Theme contrast follows the brand canvas color, never a photograph.
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

    document.querySelector<HTMLButtonElement>('[data-catalog-section="cat_1"]')!.click();
    expect(document.querySelector(".catalog-section-banner.is-placeholder")).toBeTruthy();
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

    document.querySelector<HTMLButtonElement>('[data-catalog-section="cat_1"]')!.click();
    const search = document.querySelector<HTMLInputElement>(".store-search")!;
    search.value = "algo que no existe";
    search.dispatchEvent(new Event("input"));

    expect(document.querySelector(".status.empty")?.textContent).toContain("No encontramos productos");
  });

  it("opens one section's products and browsing tools when its picture is touched", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Catálogo con categorías",
        categories: [
          { id: "cat_1", name: "Cortes" },
          { id: "cat_2", name: "Manicure" },
        ],
        items: [
          { ...baseItem, id: "link_1", name: "Corte clásico", categoryId: "cat_1", imageUrls: ["/cortes.webp"] },
          { ...baseItem, id: "link_2", name: "Manicure básico", categoryId: "cat_2", imageUrls: ["/manicure.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=chips");

    expect(document.querySelectorAll(".catalog-section-card")).toHaveLength(2);
    expect(document.querySelector(".store-search")).toBeFalsy();
    document.querySelector<HTMLButtonElement>('[data-catalog-section="cat_2"]')!.click();

    expect(document.querySelector(".store-search")).toBeTruthy();
    expect(document.querySelector(".store-sort")).toBeTruthy();
    expect(document.querySelector(".catalog-section-banner h3")?.textContent).toBe("Manicure");
    expect(document.querySelector<HTMLImageElement>(".catalog-section-banner > img")?.getAttribute("src")).toBe("/manicure.webp");
    expect(document.querySelector(".store-catalog-browser")?.firstElementChild?.classList.contains("catalog-section-banner")).toBe(true);
    const names = [...document.querySelectorAll(".store-item-name")].map((el) => el.textContent);
    expect(names).toEqual(["Manicure básico"]);

    document.querySelector<HTMLButtonElement>(".catalog-section-back")!.click();
    expect(document.querySelectorAll(".catalog-section-card")).toHaveLength(2);
    expect(document.querySelector(".store-search")).toBeFalsy();
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
      document.querySelector(".store-about")!.compareDocumentPosition(document.querySelector("#store-grid")!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector(".store-about")?.classList.contains("has-image")).toBe(false);
    expect(document.querySelector(".store-about")?.classList.contains("story-intro")).toBe(true);
    expect(document.querySelector(".store-about-heading h2")?.textContent?.trim()).toBe("Conoce la marca");
    expect(document.querySelector(".store-about-title-text")?.textContent?.trim()).toBe("Conoce la marca");
    expect(document.querySelector(".store-about-body p")?.getAttribute("style")).toContain("--story-delay:340ms");
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

  it("respects the merchant's free section order, including animation", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller seguro",
        aboutText: "Nuestra historia va después de las fotos.",
        contentOrder: ["motion", "gallery", "hero", "links", "products", "about"],
        motionDuoEnabled: true,
        motionExperience: "coverflow-carousel",
        editorialGallery: [
          {
            imageUrl: "/v1/uploads/taller.webp",
            caption: '<img id="injected-caption" src=x onerror="alert(1)"> Hecho a mano',
            boxColor: "#f4ead7",
          },
          {
            imageUrl: "/v1/uploads/detalle.webp",
            caption: "Detalle del proceso",
            boxColor: "#f4ead7",
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
    const motion = document.querySelector(".store-motion-section")!;
    expect(motion.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gallery.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(products.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector("#injected-caption")).toBeNull();
    expect(document.querySelector(".store-editorial-item figcaption")?.textContent).toContain("<img");
    const editorialCard = document.querySelector<HTMLElement>(".store-editorial-gallery .store-editorial-item")!;
    expect(editorialCard.style.getPropertyValue("--store-editorial-card-bg")).toBe("#f4ead7");
    expect(editorialCard.style.getPropertyValue("--store-editorial-card-ink")).toBe("#000000");
  });

  it.each([
    ["coverflow", ".store-coverflow"],
    ["diagonal-marquee", ".store-diagonal-marquee"],
    ["story-scroller", ".store-story-scroller"],
  ] as const)("renders the AI-selected %s experience after the catalog", async (experienceStyle, selector) => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda inmersiva",
        experienceStyle,
        editorialGallery: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Primer capítulo", caption: "El inicio", body: "Una mirada que abre la historia visual de la marca." },
          { imageUrl: "/v1/uploads/dos.webp", title: "Segundo capítulo", caption: "El detalle", body: "Otra perspectiva que completa el recorrido después del catálogo." },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout(`/?link=experience-${experienceStyle}`);

    const experience = document.querySelector(selector)!;
    const products = document.querySelector(".store-products")!;
    expect(products.compareDocumentPosition(experience) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    if (experienceStyle === "coverflow") {
      expect(document.querySelectorAll(".store-coverflow-card")).toHaveLength(2);
      document.querySelector<HTMLButtonElement>('[data-coverflow-step="1"]')!.click();
      expect(document.querySelector<HTMLElement>('[data-coverflow-index="1"]')?.getAttribute("aria-hidden")).toBe("false");
    } else if (experienceStyle === "diagonal-marquee") {
      expect(document.querySelectorAll(".store-diagonal-set")).toHaveLength(2);
    } else {
      document.querySelector<HTMLButtonElement>('[data-story-to="1"]')!.click();
      expect(document.querySelector("#store-story-1")?.classList.contains("active")).toBe(true);
    }
  });

  it("renders the default opt-in coverflow animation as its own ordered section", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con movimiento",
        motionDuoEnabled: true,
        editorialGallery: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Origen", caption: "Primer plano", body: "La primera parte del relato real de la tienda." },
          { imageUrl: "/v1/uploads/dos.webp", title: "Proceso", caption: "Segundo plano", body: "La segunda parte amplía el contexto del comercio." },
          { imageUrl: "/v1/uploads/tres.webp", title: "Detalle", caption: "Tercer plano", body: "La tercera parte completa la historia visual del comercio." },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=motion-duo");

    expect(document.querySelector(".store-motion-section[data-motion-experience='coverflow-carousel']")).not.toBeNull();
    expect(document.querySelectorAll(".store-motion-coverflow [data-coverflow-index]")).toHaveLength(3);
  });

  it.each([
    ["story-scroll", "[data-motion-flow]"],
    ["coverflow-carousel", ".store-motion-coverflow"],
    ["hero-carousel", "[data-motion-hero]"],
    ["image-stream", "[data-image-stream]"],
    ["scroll-expansion", "[data-scroll-expansion]"],
    ["hero-gallery-scroll", "[data-gallery-scroll]"],
    ["stagger-testimonials", "[data-testimonials]"],
    ["zoom-parallax", "[data-motion-zoom]"],
    ["video-pill", "[data-video-pill]"],
    ["portfolio-scroller", "[data-portfolio-scroller]"],
    ["circle-reveal", "[data-circle-reveal]"],
    ["clarity-marquee", "[data-clarity-marquee]"],
    ["full-screen-chapters", "[data-full-chapters]"],
    ["magnetic-target", "[data-magnetic-target]"],
    ["frame-sequence", "[data-frame-sequence]"],
    ["3d-gallery", "[data-space-gallery]"],
  ] as const)("renders only the selected %s motion experience", async (motionExperience, selector) => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con movimiento elegido",
        motionDuoEnabled: true,
        motionExperience,
        editorialGallery: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Origen", caption: "Primer plano", body: "La primera parte del relato real de la tienda." },
          { imageUrl: "/v1/uploads/dos.webp", title: "Proceso", caption: "Segundo plano", body: "La segunda parte amplía el contexto del comercio." },
          { imageUrl: "/v1/uploads/tres.webp", title: "Detalle", caption: "Tercer plano", body: "La tercera parte completa la historia visual del comercio." },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout(`/?link=motion-${motionExperience}`);

    expect(document.querySelector(selector)).not.toBeNull();
    expect(document.querySelector(".store-motion-section")?.getAttribute("data-motion-experience")).toBe(motionExperience);
  });

  it("renders the text-only marquee without animation media and links its featured product", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Heladería tropical",
        contentOrder: ["hero", "products", "animation-questions", "links"],
        animations: [{
          id: "questions",
          name: "Preguntas y respuestas",
          type: "clarity-marquee",
          title: "Todo sobre nuestros sabores",
          subtitle: "Una guía rápida para elegir.",
          productId: baseItem.id,
          media: [],
        }],
        items: [{ ...baseItem, name: "Amarillo tropical", tags: ["Frutal", "Temporada"] }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=text-only-product");

    const section = document.querySelector<HTMLElement>("[data-clarity-marquee]");
    expect(section).not.toBeNull();
    expect(section?.querySelector("img, video")).toBeNull();
    expect(section?.textContent).toContain("Amarillo tropical");
    const productLink = document.querySelector<HTMLAnchorElement>(".store-motion-product-link");
    expect(productLink?.textContent).toContain("Amarillo tropical");
    expect(productLink?.getAttribute("href")).toContain(`/p/${baseItem.id}`);
  });

  it("renders every selected animation in the merchant's saved order", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con varias animaciones",
        motionDuoEnabled: true,
        motionExperience: "coverflow-carousel",
        motionExperiences: ["hero-carousel", "coverflow-carousel", "stagger-testimonials"],
        contentOrder: ["motion-stagger-testimonials", "hero", "about", "products", "motion-hero-carousel", "gallery", "links", "motion-coverflow-carousel"],
        editorialGallery: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Origen", caption: "Ana", body: "Una experiencia excelente." },
          { imageUrl: "/v1/uploads/dos.webp", title: "Proceso", caption: "María", body: "Volvería a comprar." },
          { imageUrl: "/v1/uploads/tres.webp", title: "Detalle", caption: "Luis", body: "Todo fue muy claro." },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=multiple-motion");

    const sections = [...document.querySelectorAll<HTMLElement>(".store-motion-section[data-motion-experience]")];
    expect(sections.map((section) => section.dataset.motionExperience)).toEqual([
      "stagger-testimonials",
      "hero-carousel",
      "coverflow-carousel",
    ]);
    expect(sections).toHaveLength(3);
    expect(document.querySelector("[data-motion-hero]")).not.toBeNull();
    expect(document.querySelector(".store-motion-coverflow")).not.toBeNull();
    expect(document.querySelector("[data-testimonials]")).not.toBeNull();
  });

  it("keeps named animation instances independent and renders their own media and copy", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda por capítulos",
        contentOrder: ["animation-finale", "hero", "products", "animation-opening", "links"],
        animations: [
          {
            id: "opening",
            name: "Organizador · apertura",
            type: "coverflow-carousel",
            title: "Nueva temporada",
            subtitle: "Piezas para empezar el recorrido.",
            media: [
              { imageUrl: "/v1/uploads/open-1.webp", title: "Primera pieza", caption: "Apertura" },
              { imageUrl: "/v1/uploads/open-2.webp", title: "Segunda pieza", caption: "Detalle" },
            ],
          },
          {
            id: "finale",
            name: "Organizador · cierre",
            type: "coverflow-carousel",
            title: "Últimos detalles",
            subtitle: "Una selección distinta para cerrar la tienda.",
            media: [
              { imageUrl: "/v1/uploads/end-1.webp", title: "Textura final", caption: "Cierre" },
              { imageUrl: "/v1/uploads/end-2.webp", title: "Empaque", caption: "Entrega" },
            ],
          },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=independent-animations");

    const sections = [...document.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]")];
    expect(sections.map((section) => section.dataset.animationId)).toEqual(["finale", "opening"]);
    expect(sections[0].querySelector(".store-motion-intro h2")?.textContent).toBe("Últimos detalles");
    expect(sections[1].querySelector(".store-motion-intro h2")?.textContent).toBe("Nueva temporada");
    expect(sections[0].querySelector<HTMLImageElement>("img")?.src).toContain("end-1.webp");
    expect(sections[1].querySelector<HTMLImageElement>("img")?.src).toContain("open-1.webp");
    expect(sections[0].textContent).not.toContain("Organizador · cierre");
    expect(sections[1].textContent).not.toContain("Organizador · apertura");
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

  it("keeps the default color canvas when a store has no custom background color", async () => {
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

  it("keeps the merchant background color authoritative and derives a readable theme from it", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda crema",
        backgroundColor: "#f4ead7",
        boardTexture: "kraft",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=cream-background");

    expect(document.documentElement.style.getPropertyValue("--pg-page-bg")).toBe("#f4ead7");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.body.dataset.boardTexture).toBe("kraft");
    expect(document.documentElement.style.getPropertyValue("--pg-text")).toBe("#000000");
    expect(document.documentElement.style.getPropertyValue("--pg-text-muted")).toBe("#000000");
    expect(document.documentElement.style.getPropertyValue("--pg-text-faint")).toBe("#000000");
  });

  it("uses pure white text for every text role on a dark merchant background", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda oscura",
        backgroundColor: "#302b2b",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=dark-background");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--pg-text")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--pg-text-muted")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--pg-text-faint")).toBe("#ffffff");
  });

  it("chooses the higher-contrast pure foreground on a mid-tone background", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda tono medio",
        backgroundColor: "#777777",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=midtone-background");

    const foreground = document.documentElement.style.getPropertyValue("--pg-text");
    expect(["#000000", "#ffffff"]).toContain(foreground);
    expect(contrastRatio(foreground, "#777777")).toBeGreaterThanOrEqual(4.5);
    expect(document.documentElement.style.getPropertyValue("--pg-text-muted")).toBe(foreground);
    expect(document.documentElement.style.getPropertyValue("--pg-text-faint")).toBe(foreground);
  });
});
