import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store, StoreMotionExperience, CartCheckoutResult } from "../src/api";

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
  fontStyle: "modern",
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

  it("starts every embedded store preview at the top", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista desde arriba",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=preview-top&preview=1&editor=1");

    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" }));
    expect(window.history.scrollRestoration).toBe("manual");
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
    expect(document.querySelector(".store-entry-loader")).toBeNull();
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

  it("renders connected Paya events and creates a ticket reservation through the shared checkout", async () => {
    const createEventReservation = vi.fn().mockRejectedValue(new Error("Prueba de reserva detenida"));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Casa Norte",
        items: [baseItem],
        events: [{
          id: "event_1",
          slug: "noche-norte",
          name: "Noche Norte",
          description: "Música en vivo",
          publicityImageUrl: "",
          startsAt: "2099-10-10T00:00:00.000Z",
          endsAt: "2099-10-10T04:00:00.000Z",
          doorsOpenAt: "2099-10-09T23:00:00.000Z",
          timezone: "America/La_Paz",
          venue: { name: "Patio Norte", city: "La Paz" },
          ticketTypes: [{ id: "ticket_1", name: "General", price: 8000, currency: "BOB", available: 50 }],
        }],
      } satisfies Store),
      createEventReservation,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=casa-norte#event-event_1");

    expect(document.querySelector("#event-event_1")?.textContent).toContain("Noche Norte");
    const form = document.querySelector<HTMLFormElement>("[data-event-reservation]")!;
    form.querySelector<HTMLInputElement>("[data-ticket-type]")!.value = "2";
    (form.elements.namedItem("buyerName") as HTMLInputElement).value = "Ana";
    form.requestSubmit();

    await vi.waitFor(() => expect(createEventReservation).toHaveBeenCalledWith("noche-norte", expect.objectContaining({
      items: [{ ticketTypeId: "ticket_1", quantity: 2 }],
      buyerName: "Ana",
    })));
    await vi.waitFor(() => expect(form.textContent).toContain("Prueba de reserva detenida"));
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
    expect(document.querySelector(".store-announcement")?.textContent).toContain("ENVÍOS A TODO EL PAÍS");
    expect(document.querySelector(".store-announcement")?.getAttribute("style")).toContain("--announcement-bg:#ffffff");
    expect(document.querySelector(".product-detail-content h1")?.textContent).toContain("Corte de cabello");
    expect(document.querySelector(".product-detail-description")?.textContent).toBe("Incluye lavado y peinado");

    document.querySelector<HTMLAnchorElement>(".product-back-link")!.click();
    await vi.waitFor(() => expect(window.location.pathname).toBe("/s/taller-norte"));
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 684));
    expect(document.querySelector(".store-item-name")?.textContent).toContain("Corte de cabello");
    expect(document.querySelector(".store-announcement")?.textContent).toContain("ENVÍOS A TODO EL PAÍS");
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

  it.each([
    { smallStock: 2, startingPrice: "40.00 BOB" },
    { smallStock: 0, startingPrice: "65.00 BOB" },
  ])("keeps legacy product types selectable and prices from available versions (small stock: $smallStock)", async ({ smallStock, startingPrice }) => {
    const productWithGallery = {
      ...baseItem,
      imageUrls: ["/v1/uploads/frente.webp", "/v1/uploads/detalle.webp"],
      imagePositions: ["50% 18%", "72% 84%"],
      variants: [
        { id: "small", name: "Pequeño", amount: 4000, stock: smallStock },
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
    expect(document.querySelector(".product-detail-price")?.textContent).toBe(startingPrice);
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

  it("continues a product page into related collection discovery", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        categories: [{ id: "cat_1", name: "Serie Uno" }, { id: "cat_2", name: "Serie Dos" }],
        items: [
          { ...baseItem, id: "piece_1", name: "Pieza principal", categoryId: "cat_1", imageUrls: ["/principal.webp"] },
          { ...baseItem, id: "piece_2", name: "Otra categoría", categoryId: "cat_2", imageUrls: ["/otra.webp"] },
          { ...baseItem, id: "piece_3", name: "Pieza relacionada", categoryId: "cat_1", imageUrls: ["/relacionada.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/taller-norte/p/piece_1");

    expect(document.querySelector(".product-detail-related-heading h2")?.textContent).toBe("Más de Serie Uno");
    const related = [...document.querySelectorAll<HTMLAnchorElement>(".product-detail-related-item")];
    expect(related.map((link) => link.querySelector("strong")?.textContent)).toEqual(["Pieza relacionada", "Otra categoría"]);
    expect(related[0].querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe("/relacionada.webp");

    related[0].click();
    expect(window.location.pathname).toBe("/s/taller-norte/p/piece_3");
    expect(document.querySelector(".product-detail-content h1")?.textContent).toContain("Pieza relacionada");
  });

  it("inherits the saved site recipe and authored footer across product routes", async () => {
    const section = (id: string, kind: "hero" | "catalog" | "contact") => ({
      id, kind, family: kind === "catalog" ? "product-led" : "editorial", layout: kind === "catalog" ? "rail" : "split",
      width: "wide", align: "left", motion: "none", title: kind, body: "", ctaLabel: "",
      backgroundColor: "#f6f0e4", textColor: "#171717", mediaUrls: [], items: [],
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        items: [{ ...baseItem, id: "piece_1", imageUrls: ["/piece.webp"] }],
        siteDocument: {
          version: 1,
          direction: "Colección de taller",
          artDirection: "editorial-house",
          designGenome: {
            composition: "collection-rail", rhythm: "editorial", geometry: "framed", colorStrategy: "surface-led",
            mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "reveal",
          },
          theme: {
            pageBackground: "#f6f0e4", textColor: "#171717", accentColor: "#8a3f2b", secondaryColor: "#315c49",
            surfaceColor: "#fffaf2", mutedColor: "#5f5a52", borderColor: "#b9b0a3", headingFont: "editorial",
            bodyFont: "humanist", radius: 2, shadow: "none", productLayout: "showcase", displayScale: "dramatic",
            density: "airy", imageTreatment: "editorial",
          },
          navigation: { layout: "split", sticky: true, transparent: false, logoTreatment: "wordmark" },
          motion: { intensity: "restrained" },
          merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "collection", showDescriptions: true },
          experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
          sections: [section("opening", "hero"), section("shop", "catalog"), section("contact", "contact")],
          footer: {
            enabled: true,
            brandDescription: "Objetos hechos en La Paz.",
            columns: [{ id: "visit", title: "Visita", items: [{ id: "catalog", label: "Catálogo", href: "https://example.com/catalogo" }] }],
            copyright: "Taller Norte 2026",
            badge: "Hecho localmente",
          },
        },
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/taller-norte/p/piece_1");

    expect(document.body.dataset.siteComposition).toBe("collection-rail");
    expect(document.body.dataset.siteProducts).toBe("showcase");
    expect(document.body.dataset.siteArtDirection).toBe("editorial-house");
    expect(document.documentElement.style.getPropertyValue("--site-page")).toBe("#f6f0e4");
    expect(document.querySelector(".store-site-footer-brand p")?.textContent).toBe("Objetos hechos en La Paz.");
    expect(document.querySelector(".store-site-footer-bottom")?.textContent).toContain("Hecho localmente");
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
        announcementFont: "editorial",
        announcementEffect: "wave",
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
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-size-large")).toBe(true);
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-font-editorial")).toBe(true);
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-effect-wave")).toBe(true);
    expect(document.querySelectorAll(".store-announcement-letter").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".store-announcement-sequence")).toHaveLength(2);
    expect(document.querySelectorAll(".store-announcement-phrase")).toHaveLength(4);
    expect(document.querySelector(".store-announcement-a11y")?.textContent).toBe("Envío gratis hoy • Compra local");
    const announcement = document.querySelector(".store-announcement.marquee")!;
    const header = document.querySelector(".store-site-header")!;
    expect(header.compareDocumentPosition(announcement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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
            announcementFont: "geometric",
            announcementEffect: "sparkle",
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
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-font-geometric")).toBe(true);
    expect(document.querySelector(".store-announcement.marquee")?.classList.contains("announcement-effect-sparkle")).toBe(true);
    expect(document.querySelector(".promotion-dialog")?.textContent).toContain("Solo hoy");
    expect(document.activeElement).not.toBe(document.querySelector(".promotion-close"));
    expect(document.body.dataset.buttonVariant).toBe("soft");
    expect(document.body.dataset.buttonMotion).toBe("pulse");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Completar pedido");
  });

  it("does not rebuild the storefront for duplicate preview messages", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista estable",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=stable-preview&preview=1&editor=1");
    const message = {
      type: "PAGOSYA_STORE_PREVIEW",
      previewSection: "products",
      previewAction: "scroll",
      patch: { storeName: "Vista estable editada", catalogTitle: "Colección estable" },
    };
    window.dispatchEvent(new MessageEvent("message", { source: window, data: message }));
    const originalHeader = document.querySelector(".merchant-header");
    const originalProducts = document.querySelector(".store-products");

    window.dispatchEvent(new MessageEvent("message", { source: window, data: message }));

    expect(document.querySelector(".merchant-header")).toBe(originalHeader);
    expect(document.querySelector(".store-products")).toBe(originalProducts);
    expect(document.querySelector(".store-catalog-heading")?.textContent).toContain("Colección estable");
  });

  it("keeps the storefront preview at the same position when an edit rebuilds it", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista en contexto",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    await loadCheckout("/?link=context-preview&preview=1&editor=1");
    scrollTo.mockClear();
    vi.spyOn(window, "scrollY", "get").mockReturnValue(684);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_PREVIEW",
        patch: { tagline: "Un cambio sin perder el lugar" },
      },
    }));

    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 684, left: 0, behavior: "auto" }));
    expect(document.querySelector(".store-tagline")?.textContent).toContain("Un cambio sin perder el lugar");
  });

  it("keeps the latest authored heading when a later preview patch changes its color", async () => {
    const section = (id: string, kind: string, title: string) => ({
      id,
      kind,
      layout: "split",
      width: "wide",
      align: "left",
      motion: "none",
      title,
      body: `${kind} body`,
      ctaLabel: "",
      backgroundColor: "#e8f2ef",
      textColor: "#142321",
      mediaUrls: [],
      items: [],
      blocks: [{ id: "heading", kind: "heading", role: "primary", slot: "heading", text: title, mediaUrl: null, children: [] }],
    });
    const siteDocument = {
      version: 1,
      direction: "Compra sin vueltas",
      theme: {
        pageBackground: "#e8f2ef", textColor: "#142321", accentColor: "#7f1d1d", secondaryColor: "#146c73",
        surfaceColor: "#fff2d8", mutedColor: "#516a64", borderColor: "#afd2c5", headingFont: "geometric", bodyFont: "grotesk",
        radius: 2, shadow: "none", productLayout: "gallery",
      },
      navigation: { layout: "split", sticky: true, transparent: false },
      sections: [
        section("opening", "hero", "Honey Peanut Butter with Sea Salt"),
        section("story", "story", "Nuestra historia"),
        section("shop", "catalog", "Encuentra tu favorito"),
        section("information", "contact", "Contacto"),
      ],
    };
    siteDocument.sections[0].blocks.push(
      { id: "heading-1", kind: "heading", role: "primary", slot: "heading", text: "Línea Invierno", mediaUrl: null, style: { textColor: "#225544", textWidthPercent: 58 }, children: [] },
      { id: "heading-2", kind: "heading", role: "primary", slot: "heading", text: "Línea Verano", mediaUrl: null, style: { textColor: "#cc7722", textWidthPercent: 44 }, children: [] },
    );
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "PERRAN",
        tagline: "Honey Peanut Butter with Sea Salt",
        siteDocument,
        items: [baseItem],
      } as unknown as Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=perran&preview=1&editor=1");
    const editedDocument = structuredClone(siteDocument);
    editedDocument.sections[0].title = "HONEY WITH LOL";
    editedDocument.sections[0].blocks[0].text = "HONEY WITH LOL";
    editedDocument.sections[0].blocks[0].style = { textColor: "#7f1d1d" };
    editedDocument.sections[0].blocks[2].style = { textColor: "#3366aa", textWidthPercent: 39 };
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_PREVIEW",
        patch: {
          tagline: "Honey Peanut Butter with Sea Salt",
          siteDocument: editedDocument,
        },
      },
    }));

    const heading = document.querySelector<HTMLElement>('[data-store-editor-section="site-opening"][data-store-editor-item-id="heading"]');
    expect(heading?.textContent).toBe("HONEY WITH LOL");
    expect(heading?.style.getPropertyValue("--canvas-text-color")).toBe("#7f1d1d");
    const winter = document.querySelector<HTMLElement>('[data-site-block="heading-1"]');
    const summer = document.querySelector<HTMLElement>('[data-site-block="heading-2"]');
    expect(winter?.classList.contains("site-free-canvas-text")).toBe(true);
    expect(winter?.dataset.storeEditorField).toBe("siteBlockText");
    expect(winter?.dataset.storeEditorItemId).toBe("heading-1");
    expect(summer?.dataset.storeEditorField).toBe("siteBlockText");
    expect(summer?.dataset.storeEditorItemId).toBe("heading-2");
    expect(winter?.style.getPropertyValue("--canvas-text-color")).toBe("#225544");
    expect(summer?.style.getPropertyValue("--canvas-text-color")).toBe("#3366aa");
    expect(summer?.style.getPropertyValue("--canvas-text-width")).toBe("39%");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "site-opening", field: "siteBlockText", label: "título adicional", itemId: "heading-2" },
      },
    }));
    const freeTextToolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    const summerColor = freeTextToolbar.querySelector<HTMLInputElement>("[data-canvas-color]")!;
    expect(summerColor.value).toBe("#3366aa");
    summerColor.value = "#8844aa";
    summerColor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(summer?.style.getPropertyValue("--canvas-text-color")).toBe("#8844aa");
    expect(winter?.style.getPropertyValue("--canvas-text-color")).toBe("#225544");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_PREVIEW",
        patch: {
          tagline: "Actualizado desde opciones",
          siteDocument: editedDocument,
        },
      },
    }));
    expect(document.querySelector<HTMLElement>('[data-store-editor-section="site-opening"][data-store-editor-item-id="heading"]')?.textContent)
      .toBe("Actualizado desde opciones");
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

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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
    expect(document.querySelector(".product-detail-layout")?.children).toHaveLength(3);
    expect(document.querySelector(".product-detail-information details[open] summary")?.textContent).toContain("El producto");
    expect(document.querySelector(".product-detail-price")?.textContent).toContain("72.50");
    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" }));
  });

  it("targets the matching editorial story while visual motion remains visible", async () => {
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

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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
    const target = document.querySelector<HTMLElement>(".store-editorial-gallery")!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ x: 0, y: 900, top: 900, right: 500, bottom: 1200, left: 0, width: 500, height: 300, toJSON: () => ({}) });

    await vi.waitFor(() => expect(previewScrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) })));
    expect(previewScrollTo.mock.calls.at(-1)?.[0].top).toBeGreaterThan(0);
    expect(document.querySelectorAll(".store-flow-section")).toHaveLength(3);
    expect(document.querySelectorAll(".store-story-panel")[1]?.classList.contains("active")).toBe(true);
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
        contactFormEnabled: true,
        contentOrder: ["site-information", "site-opening", "site-shop"],
        sectionBackgrounds: { "site-shop": "#224466" },
        siteDocument: {
          version: 1,
          direction: "Publicación cultural",
          designGenome: { composition: "gallery-axis", rhythm: "cinematic", geometry: "framed", colorStrategy: "contrast-blocks", mediaStrategy: "collage", typeScale: "poster", motionLanguage: "cinematic" },
          theme: { pageBackground: "#f4efe5", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a", surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk", radius: 8, shadow: "soft", productLayout: "editorial" },
          navigation: { layout: "centered", sticky: true, transparent: false },
          experience: { type: "scroll-expansion", placement: "after-catalog", title: "La ventana se abre", body: "Una transición visual hacia la colección.", mediaUrls: ["/v1/uploads/hero.webp", "/v1/uploads/detail.webp"] },
          sections: [
            { id: "opening", kind: "hero", layout: "full-bleed", width: "full", align: "left", motion: "none", title: "Un matcha con mundo propio", body: "Una portada hecha para esta marca.", ctaLabel: "Ver selección", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls: ["/v1/uploads/hero.webp"], items: [] },
            { id: "reasons", kind: "benefits", layout: "grid", width: "wide", align: "left", motion: "none", title: "Elige con intención", body: "Una lectura breve antes de comprar.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaUrls: [], items: [{ title: "Explora", body: "Mira el catálogo.", mediaUrl: null }] },
            { id: "shop", kind: "catalog", layout: "offset", width: "wide", align: "left", motion: "none", title: "La selección", body: "Productos reales, integrados por pagosYa.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaUrls: [], items: [] },
            { id: "information", kind: "contact", layout: "split", width: "wide", align: "left", motion: "none", title: "Conversemos", body: "Escribe tu pregunta.", ctaLabel: "Enviar", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls: [], items: [] },
          ],
        },
      }),
    });

    await loadCheckout(`/?link=preview-store&preview=1#${hash}`);

    expect(document.querySelector(".store-tagline")?.textContent).toBe("Propuesta sin publicar");
    expect(document.querySelector("#cart-pay")?.textContent).toBe("Probar esta dirección");
    expect(document.documentElement.style.getPropertyValue("--site-accent")).toBe("#315c49");
    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("#3e745c");
    expect(document.body.classList.contains("has-bespoke-site")).toBe(true);
    expect(Array.from(document.querySelectorAll("[data-site-kind]")).map((section) => section.getAttribute("data-site-kind"))).toEqual(["contact", "hero", "catalog"]);
    expect(document.querySelector(".bespoke-benefits")).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-site-section="shop"]')?.style.getPropertyValue("--zone-bg")).toBe("#224466");
    expect(document.querySelector<HTMLElement>('[data-site-section="opening"]')?.style.getPropertyValue("--zone-bg")).toBe("#f4efe5");
    expect(document.querySelector(".bespoke-catalog #store-grid")).not.toBeNull();
    expect(document.querySelector(".bespoke-contact #store-contact-form")).not.toBeNull();
    expect(document.querySelector(".store-scroll-expansion[data-scroll-expansion]")).toBeNull();
    expect(document.querySelector(".store-motion-section[data-motion-experience='scroll-expansion']")).toBeNull();
    expect(document.body.dataset.siteSticky).toBe("true");
    expect(document.body.dataset.siteTransparent).toBe("false");
    expect(document.body.dataset.siteComposition).toBe("gallery-axis");
    expect(document.body.dataset.siteRhythm).toBe("cinematic");
    expect(document.body.dataset.siteGeometry).toBe("framed");
    expect(document.body.dataset.siteMediaStrategy).toBe("collage");
    expect(document.body.dataset.siteTypeScale).toBe("poster");
    expect(document.body.dataset.siteMotionLanguage).toBe("cinematic");
    expect(document.querySelector('.bespoke-hero.has-site-carousel')).toBeNull();
    expect(document.querySelector('.bespoke-hero .bespoke-media img')).not.toBeNull();
    expect(document.querySelector(".bespoke-hero .hero-catalog-cta")?.tagName).toBe("BUTTON");
    expect(document.querySelector<HTMLAnchorElement>(".product-page-link")?.href).toContain("#proposal=");
    expect(document.querySelector<HTMLAnchorElement>('.store-site-nav [data-store-scroll-target="#store-products"]')?.href).toContain("#proposal=");
    expect(document.body.classList.contains("store-preview-editor-enabled")).toBe(false);
    expect(document.querySelector("[data-store-editor-target]")).toBeNull();
  });

  it("renders stable page URLs, an editorial image duo, and a working newsletter form", async () => {
    const section = (overrides: Record<string, unknown>) => ({
      id: "section", kind: "story", layout: "split", width: "wide", align: "left", motion: "none",
      title: "", body: "", ctaLabel: "", backgroundColor: "#f4efe6", textColor: "#152b2f", mediaUrls: [], items: [],
      ...overrides,
    });
    const pageItem = { ...baseItem, id: "link_2", name: "Peine de madera", amount: 3200 };
    const subscribeStoreNewsletter = vi.fn().mockResolvedValue({ subscribed: true });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller Norte",
        contactFormEnabled: true,
        contentOrder: ["site-opening", "site-story", "animation-page-motion", "site-page-products", "site-shop", "site-information"],
        animations: [{ id: "page-motion", pageId: "story-page", name: "Historia en movimiento", type: "clarity-marquee", title: "Hecho para durar", subtitle: "", media: [] }],
        siteDocument: {
          version: 1,
          pages: [{ id: "story-page", label: "Historia", slug: "historia" }],
          theme: {
            pageBackground: "#f4efe6", textColor: "#152b2f", accentColor: "#9b3527", secondaryColor: "#dfb7a8",
            surfaceColor: "#fffaf2", mutedColor: "#66736f", borderColor: "#b9beb3", headingFont: "luxury", bodyFont: "artisan",
            radius: 4, shadow: "none", productLayout: "editorial",
          },
          navigation: {
            layout: "centered", sticky: true, transparent: false, logoTreatment: "wordmark",
            barStyle: "full", brandPosition: "center", navPosition: "right",
            searchPosition: "left", profilePosition: "right", cartPosition: "left",
            items: [
              { id: "home", label: "Inicio", target: "home" },
              { id: "story-nav", label: "Historia", target: "page", pageId: "story-page" },
            ],
          },
          footer: {
            enabled: true,
            brandDescription: "Hecho con paciencia.",
            columns: [],
            copyright: "© Taller Norte",
            badge: "Hecho en Bolivia",
            newsletter: {
              enabled: true,
              title: "Cartas desde el taller",
              body: "Historias y lanzamientos sin ruido.",
              buttonLabel: "Suscribirme",
              successMessage: "Ya estás dentro.",
            },
          },
          sections: [
            section({ id: "opening", kind: "hero", width: "full", motion: "clip", title: "Dos miradas", mediaUrls: ["/v1/uploads/left.webp", "/v1/uploads/right.webp"] }),
            section({ id: "story", pageId: "story-page", title: "Nuestra historia" }),
            section({ id: "page-products", pageId: "story-page", kind: "catalog", title: "Selección de la página", productIds: [pageItem.id, baseItem.id] }),
            section({ id: "shop", kind: "catalog", title: "Colección" }),
            section({ id: "information", kind: "contact", pageId: "story-page", title: "Conversemos" }),
          ],
        },
        items: [baseItem, pageItem],
      } satisfies Store),
      subscribeStoreNewsletter,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/s/taller-norte?page=historia");

    expect([...document.querySelectorAll("[data-site-kind]")].map((node) => node.getAttribute("data-site-kind"))).toEqual(["story", "catalog", "contact"]);
    expect(document.querySelector('[data-animation-id="page-motion"]')).not.toBeNull();
    expect(document.querySelector(`.store-item[data-id="${baseItem.id}"]`)).not.toBeNull();
    expect([...document.querySelectorAll<HTMLElement>(".store-item[data-id]")].map((item) => item.dataset.id)).toEqual([pageItem.id, baseItem.id]);
    expect(document.querySelector<HTMLAnchorElement>('[data-site-navigation-item="story-nav"]')?.getAttribute("href")).toContain("?page=historia");
    expect(document.querySelector('[data-site-navigation-item="story-nav"]')?.getAttribute("aria-current")).toBe("page");
    expect(document.body.dataset.siteHeaderStyle).toBe("full");
    expect(document.querySelector(".store-site-brand")?.closest("[data-header-zone]")?.getAttribute("data-header-zone")).toBe("center");
    expect(document.querySelector(".store-site-nav")?.closest("[data-header-zone]")?.getAttribute("data-header-zone")).toBe("right");
    expect(document.querySelector(".store-header-search")?.closest("[data-header-zone]")?.getAttribute("data-header-zone")).toBe("left");
    expect(document.querySelector(".store-header-cart")?.closest("[data-header-zone]")?.getAttribute("data-header-zone")).toBe("left");
    expect(document.querySelector(".store-directory-back")?.closest("[data-header-zone]")?.getAttribute("data-header-zone")).toBe("right");
    const form = document.querySelector<HTMLFormElement>("#store-newsletter-form")!;
    (form.elements.namedItem("email") as HTMLInputElement).value = "cliente@example.com";
    form.requestSubmit();
    await vi.waitFor(() => expect(subscribeStoreNewsletter).toHaveBeenCalledWith("taller-norte", "cliente@example.com"));
    await vi.waitFor(() => expect(document.querySelector(".store-newsletter-status")?.textContent).toBe("Ya estás dentro."));

    await loadCheckout("/s/taller-norte");
    expect([...document.querySelectorAll("[data-site-kind]")].map((node) => node.getAttribute("data-site-kind"))).toEqual(["hero", "catalog"]);
    expect(document.querySelector('[data-animation-id="page-motion"]')).toBeNull();
    expect(document.querySelector('.bespoke-hero[data-site-layout="split"][data-site-motion="clip"] .bespoke-media[data-count="2"]')).not.toBeNull();
    expect(document.querySelector(".bespoke-hero.has-site-carousel")).toBeNull();

    await loadCheckout("/s/taller-norte?page=historia&preview=1&editor=1");
    const pageInsertionControls = [...document.querySelectorAll<HTMLSelectElement>("[data-store-section-insert-select]")];
    expect(pageInsertionControls.length).toBeGreaterThan(0);
    expect(pageInsertionControls[0].querySelector('option[value="gallery"]')).not.toBeNull();
    expect(pageInsertionControls[0].querySelector('option[value="products"]')?.textContent).toBe("Productos seleccionados");
    expect(pageInsertionControls[0].querySelector('option[value="footer"]')).toBeNull();
    expect(pageInsertionControls[0].querySelector('optgroup[label="Animaciones visuales"]')).not.toBeNull();
    expect(pageInsertionControls[0].querySelector('option[value="animation:story-scroll"]')?.textContent).toBe("Story Scroll");
  });

  it("renders a catalog-first AI topology with authored motion and editable text", async () => {
    const section = (overrides: Record<string, unknown>) => ({
      id: "section",
      kind: "gallery",
      layout: "grid",
      width: "wide",
      align: "left",
      motion: "none",
      title: "",
      body: "",
      ctaLabel: "",
      backgroundColor: "#f4efe6",
      textColor: "#152b2f",
      mediaUrls: [],
      items: [],
      ...overrides,
    });
    const heroMedia = ["/v1/uploads/bikano-hero-1.webp", "/v1/uploads/bikano-hero-2.webp", "/v1/uploads/bikano-hero-3.webp"];
    const storyMedia = ["/v1/uploads/bikano-story-1.webp", "/v1/uploads/bikano-story-2.webp", "/v1/uploads/bikano-story-3.webp"];
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Bikano",
        layoutStyle: "catalog-first",
        contactFormEnabled: true,
        siteDocument: {
          version: 1,
          direction: "Costa gráfica",
          theme: {
            pageBackground: "#f4efe6", textColor: "#152b2f", accentColor: "#cf4f35", secondaryColor: "#e8b9a0",
            surfaceColor: "#fffaf2", mutedColor: "#66736f", borderColor: "#b9beb3", headingFont: "geometric", bodyFont: "humanist",
            radius: 4, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "cinematic",
          },
          navigation: { layout: "centered", sticky: false, transparent: false, logoTreatment: "wordmark" },
          motion: { intensity: "cinematic" },
          merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "lookbook", showDescriptions: true },
          experience: { type: "text-reveal-block", placement: "after-catalog", title: "Bikano en movimiento", body: "Color con intención.", mediaUrls: [] },
          sections: [
            section({ id: "shop", kind: "catalog", layout: "offset", title: "La tienda", body: "Elige tu pieza.", heightPx: 520, mobileHeightPx: 420 }),
            section({
              id: "opening", kind: "hero", layout: "full-bleed", width: "full", title: "Hecho para el verano", body: "Tres escenas, una sola entrada clara.",
              ctaLabel: "Ver la tienda", motion: "scale", mediaUrls: heroMedia,
              titleStyle: { textScale: 120, textAlign: "center", textColor: "#fef4df", fontStyle: "editorial" },
              items: heroMedia.map((mediaUrl, index) => ({
                mediaUrl,
                title: index === 0 ? "Una colección extensa para descubrir piezas, colores y formas con una presentación clara y ordenada" : "",
                body: index === 0 ? "Escena 1" : "",
                ...(index === 0 ? { titleStyle: { textScale: 120, textAlign: "center", textColor: "#fef4df", fontStyle: "editorial" } } : {}),
              })),
            }),
            section({
              id: "brand-story", kind: "story", layout: "stacked", width: "full", motion: "story-scroll", title: "La historia de Bikano",
              body: "Una secuencia breve antes de comprar.", mediaUrls: storyMedia,
              items: storyMedia.map((mediaUrl, index) => ({ mediaUrl, title: index === 0 ? "La forma" : "", body: index === 0 ? "Capítulo 1" : "" })),
            }),
            section({ id: "information", kind: "contact", layout: "split", title: "Conversemos", body: "Escríbenos." }),
          ],
        },
        items: [{ ...baseItem, imageUrls: ["/bikano-product.webp"] }],
      } as Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/s/bikano?preview=1&editor=1");

    expect([...document.querySelectorAll("[data-site-kind]")].map((node) => node.getAttribute("data-site-kind"))).toEqual(["catalog", "hero", "story", "contact"]);
    expect(document.querySelector('.bespoke-catalog.is-site-opening')?.getAttribute("data-site-position")).toBe("0");
    expect(document.querySelector('.bespoke-hero')?.getAttribute("data-site-position")).toBe("1");
    expect(document.querySelectorAll(".bespoke-hero .store-slide")).toHaveLength(3);
    expect(document.querySelector('.bespoke-hero')?.getAttribute("data-site-motion")).toBe("scale");
    expect(document.querySelector('.bespoke-story')?.getAttribute("data-site-motion")).toBe("story-scroll");
    expect(document.querySelector(".bespoke-hero .store-slide img")).not.toBeNull();
    const fixedCatalog = document.querySelector<HTMLElement>('.bespoke-catalog[data-site-section="shop"]')!;
    expect(fixedCatalog.dataset.siteHeightDesktop).toBe("520");
    expect(fixedCatalog.dataset.siteHeightMobile).toBe("420");
    expect(fixedCatalog.style.getPropertyValue("--site-section-height-desktop")).toBe("520px");
    expect(document.querySelectorAll(".store-site-section-resize-handle")).toHaveLength(4);
    const editableHeroTitle = document.querySelector<HTMLElement>(".bespoke-hero h2")!;
    expect(editableHeroTitle.dataset.storeEditorSection).toBe("site-opening");
    expect(["siteTitle", "siteBlockText", "siteItemTitle"]).toContain(editableHeroTitle.dataset.storeEditorField);
    expect(editableHeroTitle.dataset.canvasTextScale).toBe("120");
    expect(editableHeroTitle.dataset.canvasTextAlign).toBe("center");
    expect(editableHeroTitle.dataset.canvasTextColor).toBe("#fef4df");
    const siteSection = editableHeroTitle.closest<HTMLElement>(".bespoke-zone")!;
    const siteBounds = { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) } as DOMRect;
    const titleBounds = { x: 100, y: 100, left: 100, top: 100, right: 400, bottom: 200, width: 300, height: 100, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(siteSection, "getBoundingClientRect").mockReturnValue(siteBounds);
    vi.spyOn(editableHeroTitle, "getBoundingClientRect").mockReturnValue(titleBounds);
    const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, buttons: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      target.dispatchEvent(event);
    };
    pointer(editableHeroTitle, "pointerdown", 41, 200, 150, 1);
    pointer(window, "pointermove", 41, 350, 250, 1);
    pointer(window, "pointerup", 41, 350, 250, 0);
    expect(editableHeroTitle.dataset.canvasTextOffsetX).toBe("50");
    expect(editableHeroTitle.dataset.canvasTextOffsetY).toBe("100");
    expect(editableHeroTitle.style.getPropertyValue("--canvas-text-offset-x")).toBe("50%");
    expect(siteSection.dataset.siteHeightDesktop).toBe("800");
    const resizeHandle = siteSection.querySelector<HTMLElement>(".store-site-section-resize-handle")!;
    pointer(resizeHandle, "pointerdown", 42, 500, 800, 1);
    pointer(window, "pointermove", 42, 500, 700, 1);
    pointer(window, "pointerup", 42, 500, 700, 0);
    expect(siteSection.dataset.siteHeightDesktop).toBe("700");
    expect(siteSection.style.getPropertyValue("--site-section-height-desktop")).toBe("700px");
    expect(document.querySelector<HTMLInputElement>("[data-canvas-section-height]")?.value).toBe("700");
    expect(document.querySelector<HTMLOutputElement>("[data-canvas-section-height-output]")?.value).toBe("700 px");
    expect(document.querySelector<HTMLButtonElement>("[data-canvas-section-height-reset]")?.disabled).toBe(false);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    editableHeroTitle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(editableHeroTitle.getAttribute("contenteditable")).toBe("plaintext-only");
    editableHeroTitle.textContent = "Título que no vuelve atrás";
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "PAGOSYA_STORE_PREVIEW", patch: {} } }));
    expect(editableHeroTitle.textContent).toBe("Título que no vuelve atrás");
    expect(editableHeroTitle.hasAttribute("contenteditable")).toBe(false);
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: { type: "PAGOSYA_STORE_PREVIEW", patch: { textColor: "#334455" } },
    }));
    const redrawnHeroTitle = document.querySelector<HTMLElement>(".bespoke-hero h2")!;
    expect(redrawnHeroTitle).not.toBe(editableHeroTitle);
    expect(redrawnHeroTitle.textContent).toBe("Título que no vuelve atrás");
    const inlineSelection = {
      section: "site-opening",
      field: redrawnHeroTitle.dataset.storeEditorField,
      label: "título de portada",
      itemId: redrawnHeroTitle.dataset.storeEditorItemId,
    };
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_TEXT_UPDATE",
        editorMode: true,
        selection: inlineSelection,
        value: "Título que no vuelve atrás",
      },
    }));
    expect(redrawnHeroTitle.textContent).toBe("Título que no vuelve atrás");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: inlineSelection,
      },
    }));
    const siteToolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    expect(siteToolbar.hidden).toBe(false);
    expect(siteToolbar.querySelector<HTMLInputElement>("[data-canvas-color]")?.value).toBe("#fef4df");
    const textPalette = [...siteToolbar.querySelectorAll<HTMLButtonElement>('[data-canvas-palette="text"]')];
    expect(textPalette).toHaveLength(8);
    expect(textPalette.find((swatch) => swatch.dataset.paletteColor === "#fef4df")?.getAttribute("aria-pressed")).toBe("true");
    const accentSwatch = textPalette.find((swatch) => swatch.dataset.paletteColor === "#cf4f35")!;
    accentSwatch.click();
    expect(siteToolbar.querySelector<HTMLInputElement>("[data-canvas-color]")?.value).toBe("#cf4f35");
    expect(redrawnHeroTitle.style.getPropertyValue("--canvas-text-color")).toBe("#cf4f35");
    expect(accentSwatch.getAttribute("aria-pressed")).toBe("true");
    expect(siteToolbar.querySelector("[data-canvas-site-settings]")?.textContent).toContain("Sección");
    expect(siteToolbar.querySelector("[data-canvas-copy]")).not.toBeNull();
    expect(siteToolbar.querySelector("[data-canvas-paste]")).not.toBeNull();
    expect(siteToolbar.querySelector("[data-canvas-duplicate]")).not.toBeNull();
    siteToolbar.querySelector<HTMLButtonElement>("[data-canvas-site-settings]")!.click();
    expect(siteToolbar.classList.contains("is-animation-popover")).toBe(true);
    expect(siteToolbar.querySelector<HTMLInputElement>('[data-canvas-site-field="title"]')?.value).toBe("Hecho para el verano");
    expect(siteToolbar.querySelector<HTMLSelectElement>('[data-canvas-site-field="motion"]')?.value).toBe("scale");
    expect(siteToolbar.querySelectorAll('[data-canvas-site-field="motion"] option')).toHaveLength(6);
    expect(siteToolbar.querySelector('[data-canvas-site-field="motion"] option[value="story-scroll"]')).toBeNull();
    expect(siteToolbar.querySelector<HTMLSelectElement>('[data-canvas-site-field="layout"]')?.value).toBe("full-bleed");
    expect(siteToolbar.querySelector('[data-canvas-site-field="layout"] option[value="rail"]')).toBeNull();
    expect(siteToolbar.querySelector('[data-canvas-add-text="title"]')?.textContent).toContain("Título");
    expect(siteToolbar.querySelector('[data-canvas-add-text="subtitle"]')?.textContent).toContain("Texto");
    expect(siteToolbar.querySelector('[data-canvas-site-media="0"]')).not.toBeNull();
    expect(siteToolbar.querySelector('[data-canvas-section-lock]')?.textContent).toContain("Conservar");
    expect(siteToolbar.querySelector('[data-canvas-delete-site-animation]')).not.toBeNull();
    expect(siteToolbar.querySelector('[data-canvas-delete-section]')).toBeNull();
    const sectionAccentSwatch = siteToolbar.querySelector<HTMLButtonElement>('[data-canvas-palette="site-background"][data-palette-color="#cf4f35"]')!;
    sectionAccentSwatch.click();
    expect(siteToolbar.querySelector<HTMLInputElement>("[data-canvas-site-background]")?.value).toBe("#cf4f35");
    expect(document.querySelector<HTMLElement>('.bespoke-zone[data-site-section="opening"]')?.style.getPropertyValue("--zone-bg")).toBe("#cf4f35");
    siteToolbar.querySelector<HTMLButtonElement>("[data-canvas-close]")!.click();
    expect(siteToolbar.hidden).toBe(true);
    expect(siteToolbar.classList.contains("is-animation-popover")).toBe(false);
    expect(siteToolbar.childElementCount).toBe(0);
    expect(document.body.dataset.layoutStyle).toBe("cinematic");
    expect(document.querySelector(".bespoke-hero .store-carousel-toggle")).not.toBeNull();
    expect(document.querySelectorAll(".bespoke-story .store-flow-section")).toHaveLength(3);
    const editableStoryTitle = document.querySelector<HTMLElement>(".bespoke-story h3, .bespoke-story h2");
    expect(editableStoryTitle?.dataset.storeEditorSection).toBe("site-brand-story");
    expect(editableStoryTitle?.dataset.storeEditorField).toBe("siteBlockText");
    expect(["heading", "chapter-1-heading"]).toContain(editableStoryTitle?.dataset.storeEditorItemId);
    expect(editableStoryTitle?.dataset.storeEditorItemIndex).toBe("0");
    expect(editableStoryTitle?.dataset.storeEditorInline).toBe("text");
    expect(document.querySelector<HTMLElement>('.bespoke-story[data-store-editor-field="section"]')?.dataset.storeEditorLabel).toBe("La historia de Bikano");
    expect(document.querySelector("[data-text-reveal]")).not.toBeNull();
    expect(document.querySelector<HTMLElement>('[data-animation-id="ai-signature-experience"]')?.style.getPropertyValue("--animation-background")).toBe("#171612");
    expect(document.querySelector<HTMLElement>('[data-animation-id="ai-signature-experience"]')?.style.getPropertyValue("--animation-text-color")).toBe("#f4ead7");
    expect(document.querySelector(".bespoke-hero .store-carousel-arrow.next")).not.toBeNull();
  });

  it("keeps mobile text inside a shortened section without covering its image", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Lienzo móvil",
        contentOrder: ["site-opening", "products", "links"],
        siteDocument: {
          version: 1,
          direction: "Portada móvil",
          theme: {
            pageBackground: "#f4efe5", textColor: "#171717", accentColor: "#8b4513", secondaryColor: "#ffbd59",
            surfaceColor: "#ffffff", mutedColor: "#666666", borderColor: "#c9c9c4", headingFont: "editorial",
            bodyFont: "grotesk", radius: 2, shadow: "none", productLayout: "gallery",
          },
          navigation: { layout: "brand-left", sticky: true, transparent: false },
          motion: { intensity: "subtle" },
          merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "grid", showDescriptions: true },
          experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
          sections: [
            {
              id: "opening",
              kind: "hero",
              layout: "split",
              width: "wide",
              align: "left",
              motion: "none",
              family: "editorial",
              title: "Una portada que cabe",
              body: "El texto conserva el lugar elegido.",
              ctaLabel: "Ver colección",
              backgroundColor: "#f4efe5",
              textColor: "#171717",
              mediaUrls: ["/v1/uploads/mobile-cover.webp"],
              items: [],
              heightPx: 620,
              mobileHeightPx: 420,
            },
            {
              id: "shop", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "none", family: "product-led",
              title: "Colección", body: "Elige una pieza.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaUrls: [], items: [],
            },
            {
              id: "information", kind: "contact", layout: "split", width: "wide", align: "left", motion: "none", family: "minimal",
              title: "Contacto", body: "Escríbenos.", ctaLabel: "", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls: [], items: [],
            },
          ],
        },
        items: [baseItem],
      } as Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=mobile-canvas&preview=1&editor=1");

    const section = document.querySelector<HTMLElement>('.bespoke-hero[data-site-section="opening"]')!;
    const title = section.querySelector<HTMLElement>("h1, h2")!;
    const image = section.querySelector<HTMLImageElement>("img")!;
    const sectionBounds = { x: 0, y: 0, left: 0, top: 0, right: 360, bottom: 420, width: 360, height: 420, toJSON: () => ({}) } as DOMRect;
    const titleBounds = { x: 20, y: 20, left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100, toJSON: () => ({}) } as DOMRect;
    const imageBounds = { x: 0, y: 160, left: 0, top: 160, right: 360, bottom: 400, width: 360, height: 240, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(sectionBounds);
    vi.spyOn(title, "getBoundingClientRect").mockReturnValue(titleBounds);
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(imageBounds);
    const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, buttons: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      target.dispatchEvent(event);
    };

    pointer(title, "pointerdown", 61, 80, 60, 1);
    pointer(window, "pointermove", 61, 80, 280, 1);
    expect(Number(title.dataset.canvasTextOffsetY)).toBeLessThan(20);
    expect(section.classList.contains("store-site-text-collision-guarded")).toBe(true);
    pointer(window, "pointerup", 61, 80, 280, 0);

    expect(section.dataset.siteHeightMobile).toBe("420");
    expect(section.style.getPropertyValue("--site-section-height-mobile")).toBe("420px");
    expect(section.classList.contains("store-site-text-collision-guarded")).toBe(false);
  });

  it("makes every image in an AI-authored gallery directly selectable in editor mode", async () => {
    const section = (id: string, kind: string, mediaUrls: string[] = [], family = "editorial") => ({
      id, kind, layout: "grid", width: "wide", align: "left", motion: "none",
      family,
      title: kind === "gallery" ? "La marca en imágenes" : `${kind} title`,
      body: `${kind} body`, ctaLabel: "", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls, items: [],
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Galería editable",
        contentOrder: ["site-opening", "site-story", "site-shop", "site-visual-world", "site-information"],
        editorialGallery: [],
        siteDocument: {
          version: 1,
          direction: "Galería táctil",
          theme: { pageBackground: "#f4efe5", textColor: "#171717", accentColor: "#8b4513", secondaryColor: "#ffbd59", surfaceColor: "#ffffff", mutedColor: "#666666", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk", radius: 2, shadow: "none", productLayout: "gallery" },
          navigation: { layout: "brand-left", sticky: true, transparent: false },
          sections: [
            section("opening", "hero", ["/v1/uploads/hero.webp"]),
            { ...section("story", "story", ["/v1/uploads/story.webp"], "minimal"), backgroundColor: "#26362f", textColor: "#fff9ec" },
            section("shop", "catalog", [], "product-led"),
            { ...section("visual-world", "gallery", ["/v1/uploads/gallery-one.webp", "/v1/uploads/gallery-two.webp"], "cinematic"), layout: "offset" },
            section("information", "contact", [], "minimal"),
          ],
        },
        items: [baseItem],
      } as Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=editable-gallery&preview=1&editor=1");

    const familySequence = [...document.querySelectorAll<HTMLElement>("[data-site-family]")].map((section) => section.dataset.siteFamily);
    expect(familySequence).toEqual(["editorial", "minimal", "product-led", "cinematic"]);
    expect(document.querySelector(".bespoke-hero > .bespoke-copy > h1")).not.toBeNull();
    expect(document.querySelectorAll(".bespoke-zone > .bespoke-copy > h1")).toHaveLength(1);
    const galleryRail = document.querySelector<HTMLElement>('.bespoke-gallery[data-site-family="cinematic"] > .bespoke-media');
    expect(galleryRail?.getAttribute("role")).toBe("region");
    expect(galleryRail?.getAttribute("aria-label")).toBe("Galería desplazable: La marca en imágenes");
    expect(galleryRail?.tabIndex).toBe(0);
    expect(galleryRail?.hasAttribute("data-store-drag-scroll")).toBe(true);

    const storyTitle = document.querySelector<HTMLElement>(".bespoke-story > .bespoke-copy h2")!;
    const storySection = document.querySelector<HTMLElement>('.bespoke-story[data-site-family="minimal"]')!;
    expect(storySection.style.getPropertyValue("--store-section-background")).toBe("#26362f");
    expect(storySection.style.getPropertyValue("--store-section-text")).toBe("#fff9ec");
    expect(storyTitle.dataset.storeEditorSection).toBe("site-story");
    expect(storyTitle.dataset.storeEditorField).toBe("siteBlockText");
    expect(storyTitle.dataset.storeEditorItemId).toBe("heading");
    const galleryTitle = document.querySelector<HTMLElement>(".bespoke-gallery > .bespoke-copy h2")!;
    expect(galleryTitle.dataset.storeEditorSection).toBe("site-visual-world");
    expect(galleryTitle.dataset.storeEditorField).toBe("siteBlockText");
    expect(galleryTitle.dataset.storeEditorItemId).toBe("heading");
    const targets = [...document.querySelectorAll<HTMLElement>('.bespoke-gallery > .bespoke-media > [data-store-editor-inline="image"]')];
    expect(targets).toHaveLength(2);
    expect(targets.map((target) => ({
      section: target.dataset.storeEditorSection,
      field: target.dataset.storeEditorField,
      itemIndex: target.dataset.storeEditorItemIndex,
      itemId: target.dataset.storeEditorItemId,
      role: target.getAttribute("role"),
      tabIndex: target.tabIndex,
    }))).toEqual([
      { section: "site-visual-world", field: "siteBlockMedia", itemIndex: "0", itemId: "media-1", role: "button", tabIndex: 0 },
      { section: "site-visual-world", field: "siteBlockMedia", itemIndex: "1", itemId: "media-2", role: "button", tabIndex: 0 },
    ]);
    expect(targets[0].getAttribute("aria-label")).toBe("Cambiar imagen 1 de La marca en imágenes");

    Object.defineProperty(galleryRail!, "scrollWidth", { configurable: true, value: 1800 });
    Object.defineProperty(galleryRail!, "clientWidth", { configurable: true, value: 600 });
    const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, buttons: number, pointerType = "mouse") => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      target.dispatchEvent(event);
      return event;
    };

    pointer(targets[0], "pointerdown", 71, 500, 300, 1);
    const dragMove = pointer(galleryRail!, "pointermove", 71, 280, 304, 1);
    expect(dragMove.defaultPrevented).toBe(true);
    expect(galleryRail?.scrollLeft).toBe(220);
    expect(galleryRail?.classList.contains("is-dragging")).toBe(true);
    pointer(galleryRail!, "pointerup", 71, 280, 304, 0);
    expect(galleryRail?.classList.contains("is-dragging")).toBe(false);
    const syntheticClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    targets[0].dispatchEvent(syntheticClick);
    expect(syntheticClick.defaultPrevented).toBe(true);

    galleryRail!.scrollLeft = 0;
    const arrowRight = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    galleryRail!.dispatchEvent(arrowRight);
    expect(arrowRight.defaultPrevented).toBe(true);
    expect(galleryRail?.scrollLeft).toBe(480);
    galleryRail!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    expect(galleryRail?.scrollLeft).toBe(1200);
    galleryRail!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    expect(galleryRail?.scrollLeft).toBe(0);

    pointer(targets[0], "pointerdown", 72, 500, 300, 1, "touch");
    pointer(galleryRail!, "pointermove", 72, 280, 304, 1, "touch");
    expect(galleryRail?.scrollLeft).toBe(0);
    const nativeDrag = new Event("dragstart", { bubbles: true, cancelable: true });
    targets[0].dispatchEvent(nativeDrag);
    expect(nativeDrag.defaultPrevented).toBe(true);
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
      ["Inicio", "#store-top"],
      ["Catálogo", "#store-products"],
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
    expect(location.querySelector("[data-store-location-inline-editor]")).toBeNull();
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

  it("lets the merchant insert, validate, clear, and delete a location directly in editor mode", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller editable",
        locations: [{
          id: "centro",
          name: "Sucursal Centro",
          address: "Av. Arce 123",
          mapEmbedUrl: "https://www.google.com/maps/embed?pb=trusted",
          pickupEnabled: true,
          deliveryEnabled: false,
          openingHours: [],
          inventory: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=taller-editable&preview=1&editor=1");

    const form = document.querySelector<HTMLFormElement>("[data-store-location-inline-editor]")!;
    const input = form.querySelector<HTMLTextAreaElement>("[data-store-location-map-input]")!;
    expect(form).toBeTruthy();
    expect(form.textContent).toContain("Actualizar mapa");
    expect(form.textContent).toContain("Quitar mapa");
    expect(form.textContent).toContain("Eliminar ubicación");

    input.value = "https://tracking.invalid/embed";
    form.requestSubmit();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(form.querySelector(".store-location-inline-status")?.textContent).toContain("Google Maps u OpenStreetMap");

    input.value = '<iframe src="https://www.google.com/maps/embed?pb=normalized&amp;z=16"></iframe>';
    form.requestSubmit();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.value).toContain("https://www.google.com/maps/embed?pb=normalized&z=16");
    form.querySelector<HTMLButtonElement>("[data-store-location-map-clear]")!.click();
    expect(input.value).toBe("");
    expect(form.querySelector(".store-location-inline-status")?.textContent).toContain("Mapa quitado");
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

    const sections = [...document.querySelectorAll<HTMLAnchorElement>(".catalog-section-card")];
    expect(sections.map((section) => section.querySelector("strong")?.textContent)).toEqual(["Servicios", "Otros"]);
    expect(sections.map((section) => section.querySelector("img")?.getAttribute("src"))).toEqual(["/servicios.webp", "/otros.webp"]);
    expect(document.querySelector(".store-toolbar")).toBeFalsy();
    expect(document.querySelectorAll(".store-item")).toHaveLength(0);

    sections[0].click();

    expect(window.location.pathname).toBe("/s/multi-cat/c/cat_1");
    expect(document.querySelector(".store-toolbar")).toBeTruthy();
    expect(document.body.textContent).toContain("Corte de cabello");
    expect(document.body.textContent).not.toContain("Manicure sin categoría");
  });

  it("keeps category entry cards and focused banner pages inside an AI-authored site", async () => {
    const section = (id: string, kind: string) => ({
      id, kind, layout: "split", width: "wide", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f4efe6", textColor: "#152b2f", mediaUrls: [], items: [],
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Bikano",
        contactFormEnabled: true,
        siteDocument: {
          version: 1,
          direction: "Costa gráfica",
          theme: { pageBackground: "#f4efe6", textColor: "#152b2f", accentColor: "#cf4f35", secondaryColor: "#e8b9a0", surfaceColor: "#fffaf2", mutedColor: "#66736f", borderColor: "#b9beb3", headingFont: "geometric", bodyFont: "humanist", radius: 4, shadow: "none", productLayout: "editorial" },
          navigation: { layout: "centered", sticky: true, transparent: false },
          sections: [
            section("opening", "hero"),
            { ...section("shop", "catalog"), productIds: ["bikini_1", "enterizo_1"] },
            section("story", "story"),
            section("information", "contact"),
          ],
        },
        categories: [{ id: "cat_bikini", name: "Bikinis" }, { id: "cat_enterizo", name: "Enterizos" }],
        items: [
          { ...baseItem, id: "bikini_1", name: "Bikini coral", categoryId: "cat_bikini", imageUrls: ["/bikini.webp"] },
          { ...baseItem, id: "enterizo_1", name: "Enterizo azul", categoryId: "cat_enterizo", imageUrls: ["/enterizo.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/bikano?editor=1");

    expect([...document.querySelectorAll(".catalog-section-card strong")].map((node) => node.textContent)).toEqual(["Bikinis", "Enterizos"]);
    expect(document.querySelectorAll(".store-item")).toHaveLength(0);

    document.querySelector<HTMLImageElement>('[data-catalog-section="cat_enterizo"] img')!.click();

    expect(window.location.pathname).toBe("/s/bikano/c/cat_enterizo");
    expect(document.querySelector(".catalog-section-banner h3")?.textContent).toBe("Enterizos");
    expect([...document.querySelectorAll(".store-item-name")].map((node) => node.textContent)).toEqual(["Enterizo azul"]);
    expect(document.querySelector(".catalog-section-back")?.textContent).toContain("Ver secciones");
  });

  it("recovers the complete inventory for an older generated primary catalog saved as empty", async () => {
    const section = (id: string, kind: string) => ({
      id, kind, layout: "grid", width: "wide", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f4efe6", textColor: "#152b2f", mediaUrls: [], items: [],
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Catálogo recuperado",
        siteDocument: {
          version: 1,
          direction: "Dirección generada",
          theme: { pageBackground: "#f4efe6", textColor: "#152b2f", accentColor: "#cf4f35", secondaryColor: "#e8b9a0", surfaceColor: "#fffaf2", mutedColor: "#66736f", borderColor: "#b9beb3", headingFont: "geometric", bodyFont: "humanist", radius: 4, shadow: "none", productLayout: "editorial" },
          navigation: { layout: "centered", sticky: true, transparent: false },
          merchandising: { featuredProductIds: [], productOrderIds: ["pan_1", "postre_1"], spotlightLayout: "collection", showDescriptions: true },
          sections: [
            section("opening", "hero"),
            { ...section("shop", "catalog"), productIds: [] },
            section("information", "contact"),
          ],
        },
        categories: [{ id: "pan", name: "Panadería" }, { id: "postre", name: "Postres" }],
        items: [
          { ...baseItem, id: "pan_1", name: "Croissant", categoryId: "pan", imageUrls: ["/croissant.webp"] },
          { ...baseItem, id: "postre_1", name: "Tiramisú", categoryId: "postre", imageUrls: ["/tiramisu.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/catalogo-recuperado?editor=1");

    expect([...document.querySelectorAll(".catalog-section-card strong")].map((node) => node.textContent)).toEqual(["Panadería", "Postres"]);
    expect([...document.querySelectorAll(".catalog-section-card")].map((node) => node.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("1 producto"),
      expect.stringContaining("1 producto"),
    ]));
  });

  it("shows products directly after the opening for editorial-maker sites", async () => {
    const section = (id: string, kind: string) => ({
      id, kind, layout: "grid", width: "full", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f4efe6", textColor: "#152b2f", mediaUrls: [], items: [],
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Taller editorial",
        siteDocument: {
          version: 1,
          direction: "Diario de taller",
          designGenome: { composition: "editorial-maker" },
          theme: { pageBackground: "#f4efe6", textColor: "#152b2f", accentColor: "#cf4f35", secondaryColor: "#e8b9a0", surfaceColor: "#fffaf2", mutedColor: "#66736f", borderColor: "#b9beb3", headingFont: "geometric", bodyFont: "humanist", radius: 0, shadow: "none", productLayout: "editorial" },
          navigation: { layout: "centered", sticky: true, transparent: false },
          sections: [section("opening", "hero"), section("shop", "catalog"), section("information", "contact")],
        },
        categories: [{ id: "cat_one", name: "Primera serie" }, { id: "cat_two", name: "Segunda serie" }],
        items: [
          { ...baseItem, id: "piece_1", name: "Pieza uno", categoryId: "cat_one", imageUrls: ["/piece-one.webp"] },
          { ...baseItem, id: "piece_2", name: "Pieza dos", categoryId: "cat_two", imageUrls: ["/piece-two.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/taller-editorial");

    expect(document.querySelectorAll(".catalog-section-card")).toHaveLength(0);
    expect([...document.querySelectorAll(".store-item-name")].map((node) => node.textContent)).toEqual(["Pieza uno", "Pieza dos"]);
    expect([...document.querySelectorAll(".category-section-title")].map((node) => node.textContent)).toEqual(["Primera serie", "Segunda serie"]);
  });

  it("lets merchants replace a product-section cover directly from the preview", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Portadas editables",
        categories: [{ id: "cat_front", name: "Colección", bannerUrl: "/front.webp", highlights: [] }],
        items: [{ ...baseItem, categoryId: "cat_front" }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=cover-editor&preview=1&editor=1");
    const cover = document.querySelector<HTMLElement>('[data-catalog-section="cat_front"] .catalog-section-media')!;
    expect(cover.dataset.storeEditorField).toBe("categoryBanner");
    expect(cover.dataset.storeEditorItemId).toBe("cat_front");
    expect(cover.dataset.storeEditorInline).toBe("image");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "products", field: "categoryBanner", label: "portada de Colección", itemId: "cat_front" },
      },
    }));
    expect(document.querySelector("[data-canvas-category-cover]")?.textContent).toContain("Cambiar portada");
  });

  it("opens a category as a focused, directly addressable catalog page", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Casa Nativa",
        aboutText: "Objetos elegidos para vivir mejor.",
        contactFormEnabled: true,
        heroSlides: [{ imageUrl: "/hero.webp", title: "Nueva colección", body: "Hecha en Bolivia", ctaLabel: null, ctaUrl: null }],
        categories: [
          { id: "cat_hogar", name: "Hogar" },
          { id: "cat_mesa", name: "Mesa" },
        ],
        items: [
          { ...baseItem, id: "link_hogar", name: "Manta", categoryId: "cat_hogar", imageUrls: ["/manta.webp"] },
          { ...baseItem, id: "link_mesa", name: "Taza", categoryId: "cat_mesa", imageUrls: ["/taza.webp"] },
        ],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/casa-nativa/c/cat_mesa");

    expect(document.body.classList.contains("category-page")).toBe(true);
    expect(document.querySelector(".catalog-section-banner h3")?.textContent).toBe("Mesa");
    expect([...document.querySelectorAll(".store-item-name")].map((item) => item.textContent)).toEqual(["Taza"]);
    expect(document.body.textContent).not.toContain("Manta");
    expect(document.querySelector(".store-carousel")).toBeNull();
    expect(document.querySelector(".store-about")).toBeNull();
    expect(document.querySelector(".store-contact-section")).toBeNull();
    expect(document.querySelector(".store-site-nav a[aria-current='page']")?.textContent).toContain("Catálogo");
    expect(document.querySelector<HTMLAnchorElement>(".product-page-link")?.href).toContain("category=cat_mesa");
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

  it("switches between many-to-many product collections with the chosen editorial menu", async () => {
    const summerItem = { ...baseItem, id: "link_2", name: "Vestido de verano", amount: 7000 };
    const siteDocument = {
      version: 1,
      direction: "Temporadas",
      theme: {
        pageBackground: "#f5f2ea", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a",
        surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk",
        radius: 8, shadow: "soft", productLayout: "editorial",
      },
      navigation: { layout: "centered", sticky: true, transparent: false },
      merchandising: {
        featuredProductIds: [], productOrderIds: [], spotlightLayout: "collection", showDescriptions: true,
        collectionMenuStyle: "editorial-sidebar",
        collections: [
          { id: "invierno", name: "Línea Invierno", productIds: ["link_1"] },
          { id: "verano", name: "Línea Verano", productIds: ["link_1", "link_2"] },
        ],
      },
      sections: [
        { id: "opening", kind: "hero", layout: "split", width: "wide", align: "left", motion: "none", title: "Temporadas", body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [] },
        { id: "shop", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "none", title: "Colecciones", body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [] },
        { id: "contact", kind: "contact", layout: "split", width: "wide", align: "left", motion: "none", title: "Contacto", body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [] },
      ],
    };
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({ ...baseStoreFields, storeName: "Temporadas", siteDocument, items: [baseItem, summerItem] } as unknown as Store),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?link=temporadas");
    const menu = document.querySelector(".store-collection-menu.is-editorial-sidebar");
    const shopMenu = document.querySelector(".store-site-shop-menu");
    expect(menu).not.toBeNull();
    expect(shopMenu?.textContent).toContain("Comprar por colección");
    expect(shopMenu?.textContent).toContain("Línea Invierno");
    expect(shopMenu?.textContent).toContain("Línea Verano");
    expect(shopMenu?.querySelector<HTMLAnchorElement>('a[href*="collection=invierno"]')?.getAttribute("href")).toContain("#store-products");
    expect(document.querySelectorAll(".store-item")).toHaveLength(2);
    (menu!.querySelector('[data-store-collection="invierno"]') as HTMLButtonElement).click();
    expect(window.location.search).toContain("collection=invierno");
    expect(document.querySelectorAll(".store-item")).toHaveLength(1);
    expect(document.querySelector("#store-grid")?.textContent).toContain("Corte de cabello");
    (menu!.querySelector('[data-store-collection="verano"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll(".store-item")).toHaveLength(2);
    expect(document.querySelector("#store-grid")?.textContent).toContain("Vestido de verano");

    await loadCheckout("/?link=temporadas&collection=invierno");
    expect(document.querySelector('[data-store-collection="invierno"]')?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelectorAll(".store-item")).toHaveLength(1);
    expect(document.querySelector("#store-grid")?.textContent).not.toContain("Vestido de verano");
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
          {
            id: "cat_2",
            name: "Manicure",
            bannerUrl: "/manicure-banner.webp",
            highlights: ["Atención rápida", "Compra segura"],
          },
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
    document.querySelector<HTMLAnchorElement>('[data-catalog-section="cat_2"]')!.click();

    expect(window.location.pathname).toBe("/s/chips/c/cat_2");
    expect(document.querySelector(".store-search")).toBeTruthy();
    expect(document.querySelector(".store-sort")).toBeTruthy();
    expect(document.querySelector(".catalog-section-banner h3")?.textContent).toBe("Manicure");
    expect(document.querySelector<HTMLImageElement>(".catalog-section-banner > img")?.getAttribute("src")).toBe("/manicure-banner.webp");
    expect([...document.querySelectorAll(".catalog-section-highlights li")].map((item) => item.textContent)).toEqual(["Atención rápida", "Compra segura"]);
    expect(document.querySelector(".store-catalog-browser")?.firstElementChild?.classList.contains("catalog-section-banner")).toBe(true);
    const names = [...document.querySelectorAll(".store-item-name")].map((el) => el.textContent);
    expect(names).toEqual(["Manicure básico"]);

    document.querySelector<HTMLAnchorElement>(".catalog-section-back")!.click();
    expect(window.location.pathname).toBe("/s/chips");
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
        motionExperience: "hero-carousel",
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
    ["editorial-grid", ".store-editorial-grid"],
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
    if (experienceStyle === "story-scroller") {
      document.querySelector<HTMLButtonElement>('[data-story-to="1"]')!.click();
      expect(document.querySelector("#store-story-1")?.classList.contains("active")).toBe(true);
    } else {
      expect(document.querySelectorAll(".store-editorial-grid .store-editorial-item")).toHaveLength(2);
    }
  });

  it.each(["coverflow", "diagonal-marquee"] as const)("retires legacy %s galleries into the static editorial grid", async (experienceStyle) => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Galería migrada",
        experienceStyle,
        editorialGallery: [
          { imageUrl: "/v1/uploads/uno.webp", title: "Primera imagen" },
          { imageUrl: "/v1/uploads/dos.webp", title: "Segunda imagen" },
        ],
        items: [baseItem],
      } as unknown as Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout(`/?link=retired-${experienceStyle}`);

    expect(document.querySelectorAll(".store-editorial-grid .store-editorial-item")).toHaveLength(2);
    expect(document.querySelector(".store-coverflow, .store-diagonal-marquee")).toBeNull();
  });

  it("opens a selected product when the shopper taps a linked editorial photo", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Galería comprable",
        experienceStyle: "editorial-grid",
        editorialGallery: [
          { imageUrl: "/v1/uploads/producto.webp", productId: baseItem.id, title: "El favorito" },
          { imageUrl: "/v1/uploads/editorial.webp", productId: "missing_product", title: "Solo inspiración" },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/s/galeria-comprable");

    const productLinks = document.querySelectorAll<HTMLAnchorElement>(".store-editorial-product-link");
    expect(productLinks).toHaveLength(1);
    expect(productLinks[0].getAttribute("href")).toContain(`/p/${baseItem.id}`);
    expect(productLinks[0].textContent).toContain(baseItem.name);
    expect(document.querySelectorAll(".store-editorial-item")[1]?.querySelector("a")).toBeNull();

    productLinks[0].click();
    expect(document.querySelector(".product-detail-content h1")?.textContent).toContain(baseItem.name);
  });

  it("does not invent a visual animation when an older store only opted into motion", async () => {
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

    expect(document.querySelector(".store-motion-section[data-motion-experience='hero-carousel']")).toBeNull();
    expect(document.querySelectorAll("[data-motion-hero-to]")).toHaveLength(0);
  });

  it.each([
    ["story-scroll", "[data-motion-flow]"],
    ["hero-carousel", "[data-motion-hero]"],
    ["image-stream", ".store-image-stream"],
    ["scroll-expansion", "[data-scroll-expansion]"],
    ["hero-gallery-scroll", "[data-gallery-scroll]"],
    ["stagger-testimonials", "[data-testimonials]"],
    ["portfolio-scroller", "[data-portfolio-scroller]"],
    ["circle-reveal", "[data-circle-reveal]"],
    ["clarity-marquee", "[data-clarity-marquee]"],
    ["layered-text", "[data-layered-text]"],
    ["text-rotate", "[data-text-rotate]"],
    ["text-glitch", "[data-text-glitch]"],
    ["text-reveal-block", "[data-text-reveal]"],
    ["text-along-path", "[data-text-along-path]"],
    ["full-screen-chapters", "[data-full-chapters]"],
    ["magnetic-target", "[data-magnetic-target]"],
    ["frame-sequence", "[data-frame-sequence]"],
    ["draggable-cards", "[data-draggable-cards]"],
    ["perspective-carousel", "[data-perspective-carousel]"],
    ["link-preview", "[data-link-preview]"],
    ["gallery-accordion", "[data-gallery-accordion]"],
    ["split-scroll", "[data-split-scroll]"],
    ["sticky-gallery", "[data-sticky-gallery]"],
    ["sticky-story", "[data-sticky-story]"],
    ["text-parallax", "[data-text-parallax]"],
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
    expect(document.querySelector(".store-motion-intro")).toBeNull();
    if (motionExperience === "image-stream") {
      expect(document.querySelectorAll(".store-image-stream-grid")).toHaveLength(1);
      expect(document.querySelectorAll(".store-image-stream-grid figure")).toHaveLength(3);
      expect(document.querySelector<HTMLElement>(".store-image-stream-grid")?.style.getPropertyValue("--image-stream-columns")).toBe("3");
      expect(document.querySelector("[data-image-stream], .store-image-stream-rail")).toBeNull();
    }
  });

  it("ignores retired video-pill animations saved by older stores", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con animación retirada",
        contentOrder: ["animation-video-opening", "products"],
        animations: [{
          id: "video-opening",
          name: "Video de apertura",
          type: "video-pill",
          media: [{ imageUrl: "/v1/uploads/apertura.webp" }],
        }],
        items: [baseItem],
      } as unknown as Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=retired-animation");

    expect(document.querySelector("[data-video-pill]")).toBeNull();
    expect(document.querySelector("[data-animation-id='video-opening']")).toBeNull();
    expect(document.querySelector(".store-products")).not.toBeNull();
  });

  it("marks storefront sections for direct editing only in explicit editor mode", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda editable",
        announcement: "Envíos hoy • Pedidos hasta las 18:00",
        announcementMode: "static",
        contentOrder: ["animation-video-opening", "products"],
        animations: [{
          id: "video-opening",
          name: "Apertura",
          type: "text-reveal-block",
          title: "Texto editable",
          subtitle: "Sin fotografías animadas",
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=editable&preview=1&editor=1");

    expect(document.body.classList.contains("store-preview-editor-enabled")).toBe(true);
    expect(document.querySelector(".store-title")?.getAttribute("data-store-editor-field")).toBe("storeName");
    const announcement = document.querySelector<HTMLElement>(".store-announcement")!;
    expect(announcement.dataset.storeEditorSection).toBe("announcement");
    expect(announcement.dataset.storeEditorField).toBe("announcementText");
    expect(announcement.dataset.storeEditorInline).toBeUndefined();
    expect(announcement.getAttribute("role")).toBe("button");
    expect(announcement.tabIndex).toBe(0);
    expect(announcement.getAttribute("aria-label")).toBe("Configurar marquesina superior");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      },
    }));
    const announcementToolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    expect(announcementToolbar.hidden).toBe(false);
    expect(announcementToolbar.querySelector<HTMLSelectElement>('[data-canvas-announcement="announcementMode"]')?.value).toBe("static");
    expect(announcementToolbar.querySelector<HTMLSelectElement>('[data-canvas-announcement="announcementSize"]')?.value).toBe("medium");
    expect(announcementToolbar.querySelector<HTMLInputElement>('[data-canvas-announcement="announcementColor"]')?.value).toBe("#ffffff");
    const announcementFont = announcementToolbar.querySelector<HTMLSelectElement>('[data-canvas-announcement="announcementFont"]')!;
    expect(announcementFont.options).toHaveLength(9);
    expect(announcementFont.querySelector('option[value="artisan"]')?.textContent).toBe("Artesanal");
    expect(announcementFont.querySelector('option[value="condensed"]')?.textContent).toBe("Condensada");
    expect(announcementFont.querySelector('option[value="luxury"]')?.textContent).toBe("Alta moda");
    announcementFont.value = "luxury";
    announcementFont.dispatchEvent(new Event("change", { bubbles: true }));
    expect(announcement.classList.contains("announcement-font-luxury")).toBe(true);
    expect(announcement.dataset.announcementFont).toBe("luxury");
    expect(announcementToolbar.querySelector<HTMLTextAreaElement>("[data-canvas-announcement-text]")?.value).toBe("Envíos hoy • Pedidos hasta las 18:00");
    expect(announcementToolbar.querySelector("[data-canvas-announcement-remove]")?.textContent).toContain("Quitar marquesina");
    expect(announcementToolbar.classList.contains("is-announcement-popover")).toBe(true);
    expect(document.querySelector(".store-item")?.getAttribute("data-store-editor-item-id")).toBe(baseItem.id);
    expect(document.querySelector("[data-text-reveal]")).not.toBeNull();
    expect(document.querySelector(".store-full-chapter-backgrounds")).toBeNull();
    const sectionInsertionControls = [...document.querySelectorAll<HTMLSelectElement>("[data-store-section-insert-select]")];
    expect(sectionInsertionControls.length).toBeGreaterThan(2);
    expect(sectionInsertionControls[0].closest(".store-section-insert-boundary")?.getAttribute("data-insert-after")).toBe("__start__");
    expect(document.querySelector('[data-insert-after="animation-video-opening"] [data-store-section-insert-select]')).not.toBeNull();
    expect(sectionInsertionControls[0].querySelector('optgroup[label="Animaciones visuales"]')).not.toBeNull();
    expect(sectionInsertionControls[0].querySelector('optgroup[label="Animaciones de texto"]')).not.toBeNull();
    expect(sectionInsertionControls[0].querySelector('option[value="animation:story-scroll"]')?.textContent).toBe("Story Scroll");
    expect(sectionInsertionControls[0].querySelector('option[value="animation:video-background"]')?.textContent).toBe("Video de fondo");
    expect(sectionInsertionControls[0].querySelector('option[value="footer"]')?.textContent).toBe("Pie de página");
    const animationDelete = document.querySelector<HTMLButtonElement>('.store-animation-delete-control[data-animation-id="video-opening"]')!;
    expect(animationDelete).toBeTruthy();
    expect(animationDelete.getAttribute("aria-label")).toContain("Eliminar Apertura");
    expect(animationDelete.textContent).toContain("Eliminar animación");
  });

  it("binds editable header links and footer copy to their dedicated editor sections", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con navegación editable",
        contentOrder: ["site-opening", "site-story", "site-shop"],
        siteDocument: {
          version: 1,
          direction: "Editorial cálida",
          designGenome: { composition: "gallery-axis", rhythm: "cinematic", geometry: "framed", colorStrategy: "contrast-blocks", mediaStrategy: "collage", typeScale: "poster", motionLanguage: "cinematic" },
          theme: { pageBackground: "#f4efe5", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a", surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk", radius: 8, shadow: "soft", productLayout: "editorial" },
          navigation: {
            layout: "split",
            sticky: true,
            transparent: false,
            brandStyle: { textOffsetX: -24, textOffsetY: 8, textOffsetBasis: "element" },
            taglineStyle: { textOffsetX: 6, textOffsetY: 10, textOffsetBasis: "element" },
            items: [
              { id: "home", label: "Inicio", target: "home" },
              { id: "catalog", label: "Catálogo", target: "catalog" },
              { id: "story", label: "Our Story", target: "section", sectionId: "story", style: { textOffsetX: 18, textOffsetY: -6, textOffsetBasis: "element" } },
              { id: "page-one", label: "Página 1", target: "page", pageId: "page-one" },
            ],
          },
          pages: [{ id: "page-one", label: "Página 1", slug: "pagina-1" }],
          footer: {
            enabled: true,
            brandDescription: "Recetas honestas.",
            columns: [{ id: "company", title: "Company", items: [{ id: "story", label: "Our Story", href: "#site-section-story" }] }],
            copyright: "© 2026 Tienda",
            badge: "Hecho en Bolivia",
          },
          motion: { intensity: "restrained" },
          merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "collection", showDescriptions: true, collections: [{ id: "invierno", name: "Invierno", productIds: [baseItem.id] }] },
          experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
          sections: [
            { id: "opening", kind: "hero", layout: "full-bleed", width: "full", align: "left", motion: "none", title: "Portada", body: "Una bienvenida.", ctaLabel: "Ver colección", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls: [], items: [] },
            { id: "story", kind: "story", layout: "split", width: "wide", align: "left", motion: "none", title: "Nuestra historia", body: "El origen de la marca.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaUrls: [], items: [] },
            { id: "shop", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "none", title: "Colección", body: "Nuestros productos.", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#171717", mediaUrls: [], items: [], productIds: [baseItem.id] },
            { id: "contact", kind: "contact", layout: "split", width: "wide", align: "left", motion: "none", title: "Contacto", body: "Conversemos.", ctaLabel: "Enviar", backgroundColor: "#f4efe5", textColor: "#171717", mediaUrls: [], items: [] },
          ],
        },
        items: [baseItem, { ...baseItem, id: "link_2", name: "Plato arena", amount: 3200, tags: ["mesa"] }],
      } as unknown as Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=editable-chrome&preview=1&editor=1");

    const navigation = document.querySelector<HTMLElement>(".store-site-nav")!;
    const storyLink = document.querySelector<HTMLElement>('[data-site-navigation-item="story"]')!;
    const brandName = document.querySelector<HTMLElement>(".store-title")!;
    const footer = document.querySelector<HTMLElement>(".store-site-footer")!;
    const description = footer.querySelector<HTMLElement>(".store-site-footer-brand p")!;
    expect(navigation.dataset.storeEditorSection).toBe("navigation");
    expect(storyLink.dataset.storeEditorField).toBe("navigationLabel");
    expect(storyLink.dataset.storeEditorItemIndex).toBe("2");
    expect(storyLink.dataset.canvasTextOffsetX).toBe("18");
    expect(storyLink.style.getPropertyValue("--canvas-text-offset-y")).toBe("-6%");
    expect(brandName.dataset.canvasTextOffsetX).toBe("-24");
    expect(brandName.dataset.storeEditorField).toBe("storeName");
    expect(brandName.dataset.storeEditorDraggableText).toBe("true");
    expect(storyLink.dataset.storeEditorDraggableText).toBe("true");
    expect(brandName.closest("a")?.draggable).toBe(false);
    expect(storyLink.draggable).toBe(false);
    const nativeDrag = new Event("dragstart", { bubbles: true, cancelable: true });
    brandName.dispatchEvent(nativeDrag);
    expect(nativeDrag.defaultPrevented).toBe(true);

    const header = brandName.closest<HTMLElement>(".store-site-header")!;
    const headerBounds = { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 100, width: 1200, height: 100, toJSON: () => ({}) } as DOMRect;
    const brandBounds = { x: 80, y: 30, left: 80, top: 30, right: 380, bottom: 60, width: 300, height: 30, toJSON: () => ({}) } as DOMRect;
    const storyBounds = { x: 430, y: 35, left: 430, top: 35, right: 530, bottom: 65, width: 100, height: 30, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue(headerBounds);
    vi.spyOn(brandName, "getBoundingClientRect").mockReturnValue(brandBounds);
    vi.spyOn(storyLink, "getBoundingClientRect").mockReturnValue(storyBounds);
    const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, buttons: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      target.dispatchEvent(event);
    };
    pointer(brandName, "pointerdown", 51, 200, 45, 1);
    pointer(window, "pointermove", 51, 260, 55, 1);
    expect(document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")?.hidden).toBe(true);
    pointer(window, "pointerup", 51, 260, 55, 0);
    expect(brandName.dataset.canvasTextOffsetX).toBe("-4");
    expect(brandName.dataset.canvasTextOffsetY).toBe("41");
    expect(brandName.style.getPropertyValue("--canvas-text-offset-x")).toBe("-4%");
    pointer(storyLink, "pointerdown", 52, 480, 50, 1);
    pointer(window, "pointermove", 52, 510, 56, 1);
    pointer(window, "pointerup", 52, 510, 56, 0);
    expect(storyLink.dataset.canvasTextOffsetX).toBe("48");
    expect(storyLink.dataset.canvasTextOffsetY).toBe("14");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    brandName.click();
    expect(brandName.hasAttribute("contenteditable")).toBe(false);
    expect(brandName.classList.contains("store-preview-editor-selected")).toBe(true);
    brandName.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(brandName.getAttribute("contenteditable")).toBe("plaintext-only");
    brandName.blur();
    expect(footer.dataset.storeEditorSection).toBe("footer");
    expect(description.dataset.storeEditorField).toBe("footerBrandDescription");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "navigation", field: "section", label: "navegación superior" },
      },
    }));
    const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    const dragHandle = toolbar.querySelector<HTMLElement>(".store-preview-popover-drag-handle");
    expect(toolbar.hidden).toBe(false);
    expect(dragHandle).not.toBeNull();
    expect(dragHandle?.title).toContain("Arrastra para mover");
    expect(toolbar.querySelectorAll("[data-canvas-navigation-row]")).toHaveLength(4);
    expect(toolbar.querySelector<HTMLSelectElement>('[data-canvas-navigation-target="2"]')?.value).toBe("section:story");
    expect(toolbar.querySelector('[data-canvas-navigation-target="2"] option[value="section:contact"]')?.textContent).toBe("Contacto");
    expect(toolbar.querySelector("[data-canvas-navigation-add]")?.textContent).toContain("Agregar enlace");
    expect(toolbar.querySelector('[data-canvas-navigation-style="barStyle"]')).toBeNull();
    expect(toolbar.querySelector<HTMLSelectElement>('[data-canvas-navigation-style="brandPosition"]')?.value).toBe("left");
    expect(toolbar.querySelector<HTMLSelectElement>('[data-canvas-navigation-style="navPosition"]')?.value).toBe("left");
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-navigation-style="sticky"]')?.checked).toBe(true);
    expect(toolbar.querySelector<HTMLSelectElement>("[data-canvas-navigation-brand-font]")?.value).toBe("modern");
    expect(toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-brand-color]")?.value).toBe("#171717");
    expect(toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-heading-scale]")?.value).toBe("100");
    expect(toolbar.querySelector('[data-canvas-navigation-open][aria-label*="Página 1"]')).not.toBeNull();
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-collection-name="0"]')?.value).toBe("Invierno");
    expect(toolbar.querySelector<HTMLInputElement>(`[data-canvas-collection-product="0"][value="${baseItem.id}"]`)?.checked).toBe(true);
    expect(toolbar.querySelector("[data-canvas-collection-add]")?.textContent).toContain("Crear colección");
    expect(toolbar.classList.contains("is-navigation-popover")).toBe(true);

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "footer", field: "section", label: "pie de página" },
      },
    }));
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.classList.contains("is-animation-popover")).toBe(true);
    expect(toolbar.querySelector<HTMLTextAreaElement>('[data-canvas-footer-field="brandDescription"]')?.value).toBe("Recetas honestas.");
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-footer-field="copyright"]')?.value).toBe("© 2026 Tienda");
    expect(toolbar.querySelector("[data-canvas-hide-footer]")?.textContent).toContain("Quitar pie");
    expect(toolbar.querySelector("[data-canvas-footer-add-column]")?.textContent).toContain("Agregar columna");
    expect(toolbar.querySelector("[data-canvas-footer-add-item=\"0\"]")?.textContent).toContain("Agregar enlace");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "footer", field: "footerItemLabel", label: "Our Story", itemId: "0:0" },
      },
    }));
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-footer-field="itemLabel"]')?.value).toBe("Our Story");
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-footer-field="itemHref"]')?.value).toBe("#site-section-story");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "site-shop", field: "section", label: "Colección" },
      },
    }));
    expect(toolbar.querySelector("#store-preview-catalog-title")?.textContent).toBe("Productos de esta sección");
    expect(toolbar.querySelectorAll("[data-canvas-catalog-product]")).toHaveLength(2);
    expect(toolbar.querySelector<HTMLInputElement>(`[data-canvas-catalog-product][value="${baseItem.id}"]`)?.checked).toBe(true);
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-catalog-product][value="link_2"]')?.checked).toBe(false);
    expect(toolbar.querySelector(".store-preview-catalog-order")?.textContent).toContain(baseItem.name);
    const productSearch = toolbar.querySelector<HTMLInputElement>("[data-canvas-catalog-search]")!;
    productSearch.value = "mesa";
    productSearch.dispatchEvent(new Event("input", { bubbles: true }));
    expect(toolbar.querySelector<HTMLElement>(`[data-product-search*="${baseItem.name.toLocaleLowerCase("es")}"]`)?.hidden).toBe(true);
    expect(toolbar.querySelector<HTMLElement>('[data-product-search*="mesa"]')?.hidden).toBe(false);

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "navigation", field: "section", label: "navegación superior" },
      },
    }));
    const destination = toolbar.querySelector<HTMLSelectElement>('[data-canvas-navigation-target="2"]')!;
    destination.value = "section:contact";
    destination.dispatchEvent(new Event("change", { bubbles: true }));
    // Reopening immediately models an outside touch that lands before the
    // dashboard's zero-delay preview refresh has returned to the iframe.
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "navigation", field: "section", label: "navegación superior" },
      },
    }));
    expect(toolbar.querySelector<HTMLSelectElement>('[data-canvas-navigation-target="2"]')?.value).toBe("section:contact");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "footer", field: "section", label: "pie de página" },
      },
    }));
    const footerHref = toolbar.querySelector<HTMLInputElement>('[data-canvas-footer-item-href="0:0"]')!;
    footerHref.value = "https://example.com/nueva-historia";
    footerHref.dispatchEvent(new Event("input", { bubbles: true }));
    footerHref.dispatchEvent(new Event("change", { bubbles: true }));
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "footer", field: "section", label: "pie de página" },
      },
    }));
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-footer-item-href="0:0"]')?.value).toBe("https://example.com/nueva-historia");

    const catalogTarget = document.querySelector<HTMLElement>(".catalog-section-picker")
      ?? document.querySelector<HTMLElement>("#store-grid")
      ?? document.querySelector<HTMLElement>(".store-products");
    expect(catalogTarget).not.toBeNull();
    const scrollIntoView = vi.fn();
    Object.defineProperty(catalogTarget!, "scrollIntoView", { configurable: true, value: scrollIntoView });
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: false,
        reveal: false,
        editorSelection: null,
      },
    }));
    expect(document.body.classList.contains("store-preview-editor-enabled")).toBe(false);
    const catalogButton = document.querySelector<HTMLButtonElement>(".hero-catalog-cta");
    expect(catalogButton).not.toBeNull();
    catalogButton?.click();
    expect(scrollIntoView).toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_PREVIEW",
        editorMode: true,
        patch: {
          contentOrder: ["animation-page-one-only", "site-opening", "site-story", "site-shop"],
          animations: [{
            id: "page-one-only",
            pageId: "page-one",
            name: "Animación exclusiva de Página 1",
            type: "clarity-marquee",
            title: "Solo en la pestaña nueva · visible",
            subtitle: "",
            media: [],
          }],
        },
      },
    }));
    expect(document.querySelector('[data-animation-id="page-one-only"]')).toBeNull();

  });
  it("keeps incomplete visual animations editable in the merchant preview", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Animación en progreso",
        contentOrder: ["animation-new", "animation-in-progress", "products"],
        animations: [{
          id: "in-progress",
          name: "Hero Gallery incompleta",
          type: "hero-gallery-scroll",
          media: [
            { imageUrl: "/v1/uploads/uno.webp" },
            { imageUrl: "/v1/uploads/dos.webp" },
          ],
        }, {
          id: "new",
          name: "Slider nuevo",
          type: "hero-carousel",
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=incomplete-animation&preview=1&editor=1");

    const inProgress = document.querySelector<HTMLElement>('[data-animation-id="in-progress"]')!;
    expect(inProgress).not.toBeNull();
    expect(inProgress.querySelector("[data-animation-incomplete]")?.textContent).toContain("Agrega 1 archivo");
    expect(document.querySelector('[data-animation-id="new"] [data-animation-incomplete]')?.textContent).toContain("Agrega 2 archivos");
    expect(document.querySelectorAll("[data-gallery-scroll-cell]")).toHaveLength(0);

    inProgress.click();
    const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.classList.contains("is-animation-popover")).toBe(true);
    expect(toolbar.querySelector(".store-preview-animation-incomplete")?.textContent).toContain("Agrega 1 archivo");
    expect(toolbar.querySelectorAll("[data-canvas-media]")).toHaveLength(2);
    expect(toolbar.querySelectorAll("[data-canvas-add-media]")).toHaveLength(1);
  });

  it("renders visual animations sent to the live preview with their canvas settings", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Vista de animaciones",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=visual-animation-preview&preview=1&editor=1");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_PREVIEW",
        editorMode: true,
        patch: {
          contentOrder: ["hero", "animation-story-live", "products", "about", "gallery", "contact", "links"],
          animations: [{
            id: "story-live",
            name: "Historia visual",
            type: "story-scroll",
            title: "Nuestra historia",
            subtitle: "Dos momentos que se revelan al desplazarte.",
            media: [
              { imageUrl: "/v1/uploads/historia-uno.webp", title: "El comienzo", body: "La primera escena." },
              { imageUrl: "/v1/uploads/historia-dos.webp", title: "Hoy", body: "La segunda escena." },
            ],
          }],
        },
      },
    }));

    const section = document.querySelector<HTMLElement>('[data-animation-id="story-live"]')!;
    expect(section).not.toBeNull();
    expect(section.dataset.motionExperience).toBe("story-scroll");
    expect(section.querySelectorAll("[data-motion-flow] .store-flow-section")).toHaveLength(2);

    section.click();
    const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.classList.contains("is-animation-popover")).toBe(true);
    expect(toolbar.querySelector("header")?.textContent).toContain("Historia visual");
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-animation-field="title"]')?.value).toBe("Nuestra historia");
    expect(toolbar.querySelectorAll("[data-canvas-media]")).toHaveLength(2);
    expect(toolbar.querySelector("[data-canvas-delete-animation]")).not.toBeNull();
  });

  it("dismisses the canvas editor when the merchant touches non-editable space", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Lienzo descartable",
        contentOrder: ["animation-copy", "products", "links"],
        animations: [{
          id: "copy",
          name: "Texto principal",
          type: "text-reveal-block",
          title: "Texto editable",
          subtitle: "Toca fuera para terminar",
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=dismiss-editor&preview=1&editor=1");
    const selectText = () => window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "animation-copy", field: "animationStyle", label: "texto principal", animationId: "copy" },
      },
    }));
    const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;

    selectText();
    expect(toolbar.hidden).toBe(false);
    document.getElementById("app")!.click();
    expect(toolbar.hidden).toBe(true);
    expect(document.querySelector(".store-preview-editor-selected")).toBeNull();

    selectText();
    expect(toolbar.hidden).toBe(false);
    document.querySelector<HTMLElement>('[data-animation-id="copy"]')!.click();
    expect(toolbar.hidden).toBe(true);
    expect(document.querySelector(".store-preview-editor-selected")).toBeNull();
  });

  it("lets merchants double-click storefront text and images for inline editing", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda editable",
        logoUrl: "/v1/uploads/logo.webp",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=inline-edit&preview=1&editor=1");

    const title = document.querySelector<HTMLElement>(".store-title")!;
    expect(title.dataset.storeEditorInline).toBe("text");
    title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(title.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(title.classList.contains("store-preview-inline-editing")).toBe(true);
    title.textContent = "Cambio cancelado";
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(title.textContent).toBe("Tienda editable");
    expect(title.hasAttribute("contenteditable")).toBe(false);

    title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    title.textContent = "Tienda";
    const caret = document.createRange();
    caret.selectNodeContents(title);
    caret.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(caret);
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(title.textContent).toBe("Tienda\n\n");
    expect(title.hasAttribute("contenteditable")).toBe(true);
    title.textContent = "Tienda desde la página";
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(title.textContent).toBe("Tienda desde la página");
    expect(title.hasAttribute("contenteditable")).toBe(false);

    title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    title.textContent = "Tienda guardada al salir";
    window.dispatchEvent(new Event("blur"));
    expect(title.textContent).toBe("Tienda guardada al salir");
    expect(title.hasAttribute("contenteditable")).toBe(false);

    const logo = document.querySelector<HTMLElement>(".merchant-header-logo")!;
    expect(logo.dataset.storeEditorInline).toBe("image");
    logo.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    expect(document.querySelector<HTMLInputElement>(".store-preview-inline-file-input")?.accept).toBe("image/png,image/jpeg,image/webp");
  });

  it("keeps animation copy empty when the merchant clears every optional text field", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda visual",
        contentOrder: ["animation-chapters", "animation-frames", "products"],
        animations: [
          {
            id: "chapters",
            name: "Capítulos sin texto",
            type: "full-screen-chapters",
            subtitle: "",
            media: [
              { imageUrl: "/v1/uploads/capitulo-1.webp", title: "", caption: "", body: "" },
              { imageUrl: "/v1/uploads/capitulo-2.webp", title: "", caption: "", body: "" },
            ],
          },
          {
            id: "frames",
            name: "Fotogramas sin texto",
            type: "frame-sequence",
            media: [
              { imageUrl: "/v1/uploads/frame-1.webp" },
              { imageUrl: "/v1/uploads/frame-2.webp" },
            ],
          },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=animations-without-copy");

    expect(document.querySelector("[data-animation-id='chapters'] .store-motion-description")).toBeNull();
    expect(document.querySelectorAll("[data-animation-id='chapters'] .store-full-chapter-copy h3, [data-animation-id='chapters'] .store-full-chapter-copy p")).toHaveLength(0);
    expect(document.querySelector<HTMLElement>("[data-animation-id='frames'] [data-frame-title]")?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>("[data-animation-id='frames'] [data-frame-body]")?.hidden).toBe(true);
    expect(document.querySelector("[data-animation-id='frames']")?.textContent).not.toContain("Escena 1");
    expect(document.body.textContent).not.toContain("Una escena de la marca");
    expect(document.body.textContent).not.toContain("Una mirada más cercana a la historia de la marca.");
  });

  it("renders saved section backgrounds and merchant-editable section headings", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda por secciones",
        contactFormEnabled: true,
        contactTitle: "Conversemos",
        contactSubtitle: "Cuéntanos qué necesitas.",
        linksTitle: "Encuéntranos",
        links: [{ id: "social_1", label: "Instagram", url: "https://instagram.com/tienda" }],
        sectionBackgrounds: { products: "#d62828", contact: "#f4ead7" },
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=sections");

    expect(document.querySelector<HTMLElement>(".store-products")?.style.getPropertyValue("--store-section-background")).toBe("#d62828");
    expect(document.querySelector<HTMLElement>(".store-contact-section")?.style.getPropertyValue("--store-section-background")).toBe("#f4ead7");
    expect(document.querySelector("#store-contact-title")?.textContent).toBe("Conversemos");
    expect(document.querySelector(".store-contact-copy p")?.textContent).toBe("Cuéntanos qué necesitas.");
    expect(document.querySelector("#store-links-title")?.textContent).toBe("Encuéntranos");
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
        items: [{ ...baseItem, name: "Amarillo tropical", imageUrls: ["/amarillo.webp"], tags: ["Frutal", "Temporada"] }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=text-only-product");

    const section = document.querySelector<HTMLElement>("[data-clarity-marquee]");
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll(".store-clarity-rail")).toHaveLength(1);
    expect(section?.querySelector("img, video")).toBeNull();
    expect(section?.textContent).toContain("Amarillo tropical");
    expect(document.querySelector(".store-motion-description h3")?.textContent).toBe("Todo sobre nuestros sabores");
    const productLink = document.querySelector<HTMLAnchorElement>(".store-motion-product-link");
    expect(productLink?.classList.contains("store-motion-product-card")).toBe(true);
    expect(productLink?.querySelector<HTMLImageElement>(".store-motion-product-media img")?.src).toContain("amarillo.webp");
    expect(productLink?.textContent).toContain("Amarillo tropical");
    expect(productLink?.textContent).toContain("50.00 BOB");
    expect(productLink?.textContent).toContain("Ver producto");
    expect(productLink?.getAttribute("href")).toContain(`/p/${baseItem.id}`);
    productLink?.click();
    expect(document.body.classList.contains("product-detail-page")).toBe(true);
    expect(document.querySelector(".product-detail-content h1")?.textContent).toBe("Amarillo tropical");
  });

  it("opens the exact product linked to an animation picture card", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Galería de productos",
        contentOrder: ["animation-cards", "products", "links"],
        animations: [{
          id: "cards",
          name: "Tarjetas de la colección",
          type: "draggable-cards",
          media: [
            { imageUrl: "/linked.webp", title: "El corte favorito", productId: baseItem.id },
            { imageUrl: "/unlinked.webp", title: "Otra historia" },
          ],
        }],
        items: [{ ...baseItem, name: "Corte clásico" }],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=linked-animation-card");

    const section = document.querySelector<HTMLElement>('[data-animation-id="cards"]')!;
    const links = section.querySelectorAll<HTMLAnchorElement>(".store-animation-media-product-link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toContain(`/p/${baseItem.id}`);
    expect(links[0].textContent).toContain("Ver Corte clásico");
    expect(section.querySelectorAll("[data-draggable-card]")).toHaveLength(2);

    links[0].click();
    expect(document.body.classList.contains("product-detail-page")).toBe(true);
    expect(document.querySelector(".product-detail-content h1")?.textContent).toBe("Corte clásico");
  });

  it("keeps internal animation names accessible without showing them as section titles", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Pastelería clara",
        contentOrder: ["hero", "animation-questions", "products", "links"],
        animations: [{
          id: "questions",
          name: "Preguntas en movimiento",
          type: "clarity-marquee",
          title: "Preguntas en movimiento",
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=hidden-technical-title");

    expect(document.querySelector('[data-animation-id="questions"]')?.getAttribute("aria-label")).toBe("Preguntas en movimiento");
    expect(document.querySelector(".store-motion-description h3")).toBeNull();
    expect(document.querySelector('[data-animation-id="questions"]')?.textContent).not.toContain("Preguntas en movimiento");
  });

  it("renders rotating text as an editorial typewriter with an authored prefix", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Pastelería editorial",
        contentOrder: ["hero", "animation-typewriter", "products", "links"],
        animations: [{
          id: "typewriter",
          name: "Frase de marca",
          type: "text-rotate",
          title: "mejor|más feliz",
          subtitle: "disfruta comer 🍰",
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=editorial-typewriter");

    const typewriter = document.querySelector<HTMLElement>("[data-text-rotate]")!;
    expect(typewriter.dataset.textRotateValues?.split("\u001f").slice(0, 2)).toEqual(["mejor", "más feliz"]);
    expect(typewriter.querySelector(".store-text-rotate-prefix")?.textContent).toBe("disfruta comer 🍰");
    expect(typewriter.querySelector("[data-text-rotate-current]")?.textContent).toBe("mejor");
    expect(typewriter.querySelector(".store-text-typewriter-cursor")?.textContent).toBe("_");
  });

  it("renders every selected animation in the merchant's saved order", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda con varias animaciones",
        motionDuoEnabled: true,
        motionExperience: "frame-sequence",
        motionExperiences: ["hero-carousel", "frame-sequence", "stagger-testimonials"],
        contentOrder: ["motion-stagger-testimonials", "hero", "about", "products", "motion-hero-carousel", "gallery", "links", "motion-frame-sequence"],
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
      "frame-sequence",
    ]);
    expect(sections).toHaveLength(3);
    expect(document.querySelector("[data-motion-hero]")).not.toBeNull();
    expect(document.querySelector("[data-frame-sequence]")).not.toBeNull();
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
            type: "hero-carousel",
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
            type: "hero-carousel",
            title: "Últimos detalles",
            subtitle: "Una selección distinta para cerrar la tienda.",
            textPositionX: 72,
            textPositionY: 28,
            textScale: 143,
            textWidthPercent: 74,
            textAlign: "right",
            textSize: "large",
            textWidth: "wide",
            textColor: "#fff4d6",
            backgroundColor: "#26170d",
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
    expect(sections[0].querySelector("h2")).toBeNull();
    expect(sections[1].querySelector("h2")).toBeNull();
    expect(sections[0].querySelector(".store-motion-description")?.textContent).toBe("Últimos detallesUna selección distinta para cerrar la tienda.");
    expect(sections[1].querySelector(".store-motion-description")?.textContent).toBe("Nueva temporadaPiezas para empezar el recorrido.");
    expect(sections[0].querySelector("[data-animation-general-copy] h3")?.textContent).toBe("Últimos detalles");
    expect(sections[0].querySelector<HTMLImageElement>("img")?.src).toContain("end-1.webp");
    expect(sections[1].querySelector<HTMLImageElement>("img")?.src).toContain("open-1.webp");
    expect(sections[0].hasAttribute("data-animation-custom-layout")).toBe(true);
    expect(sections[0].dataset.animationTextAlign).toBe("right");
    expect(sections[0].dataset.animationTextSize).toBe("large");
    expect(sections[0].dataset.animationTextWidth).toBe("wide");
    expect(sections[0].getAttribute("style")).toContain("--animation-text-x:72%");
    expect(sections[0].getAttribute("style")).toContain("--animation-text-y:28%");
    expect(sections[0].dataset.animationTextScale).toBe("143");
    expect(sections[0].dataset.animationTextWidthPercent).toBe("74");
    expect(sections[0].getAttribute("style")).toContain("--animation-copy-width:74%");
    expect(sections[0].getAttribute("style")).toContain("--animation-text-color:#fff4d6");
    expect(sections[0].getAttribute("style")).toContain("--animation-background:#26170d");
    expect(sections[0].querySelector("[data-animation-copy]")).not.toBeNull();
    expect(sections[1].hasAttribute("data-animation-custom-layout")).toBe(false);
    expect(sections[0].textContent).not.toContain("Organizador · cierre");
    expect(sections[1].textContent).not.toContain("Organizador · apertura");
  });

  it("does not repeat the catalog heading as an empty-looking motion preface", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda sin repetición",
        catalogTitle: "La selección",
        catalogSubtitle: "Una colección clara, pensada para explorar sin prisa.",
        contentOrder: ["products", "animation-signature", "links"],
        animations: [{
          id: "signature",
          name: "Capítulos completos",
          type: "full-screen-chapters",
          title: "La selección",
          subtitle: "Una colección clara, pensada para explorar sin prisa.",
          media: [
            { imageUrl: "/v1/uploads/scene-1.webp", title: "Primer detalle" },
            { imageUrl: "/v1/uploads/scene-2.webp", title: "Segundo detalle" },
          ],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=motion-with-catalog-copy");

    const section = document.querySelector<HTMLElement>('[data-animation-id="signature"]')!;
    expect(section).not.toBeNull();
    expect(section.querySelector(".store-motion-description")).toBeNull();
    expect(section.querySelector("[data-full-chapters]")).not.toBeNull();
  });

  it("renders independent text objects and opens typography controls directly on the preview canvas", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Lienzo tipográfico",
        contentOrder: ["hero", "animation-opening", "products", "links"],
        animations: [{
          id: "opening",
          name: "Apertura",
          type: "text-reveal-block",
          title: "Título principal",
          backgroundColor: "#26170d",
          media: [],
          textBlocks: [
            { id: "title-1", role: "title", text: "Segundo título", textPositionX: 18, textPositionY: 30, textScale: 130, textColor: "#fff4d6", fontStyle: "editorial" },
            { id: "subtitle-1", role: "subtitle", text: "Segundo subtítulo", textPositionX: 24, textPositionY: 62, textScale: 82, textColor: "#ffffff", fontStyle: "modern" },
          ],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=canvas-type&preview=1&editor=1");
    expect([...document.querySelectorAll(".store-animation-free-text [data-animation-copy-field='textBlock']")].map((node) => node.textContent?.trim())).toEqual(["Segundo título", "Segundo subtítulo"]);

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "animation-opening", field: "textBlock", label: "título adicional", animationId: "opening", itemId: "title-1" },
      },
    }));
    const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")!;
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.querySelector<HTMLSelectElement>("[data-canvas-font]")?.value).toBe("editorial");
    expect(toolbar.querySelector<HTMLInputElement>("[data-canvas-color]")?.value).toBe("#fff4d6");
    expect(toolbar.querySelector("[data-canvas-delete-text]")).not.toBeNull();
    expect(toolbar.querySelector("[data-canvas-paste]")).not.toBeNull();
    expect(toolbar.querySelector("[data-canvas-animation-settings]")?.textContent).toContain("Animación");
    const directColor = toolbar.querySelector<HTMLInputElement>("[data-canvas-color]")!;
    directColor.value = "#ff3366";
    directColor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector<HTMLElement>('[data-animation-text-block="title-1"]')?.style.getPropertyValue("--animation-scene-text-color")).toBe("#ff3366");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "animation-opening", field: "section", label: "Apertura", animationId: "opening" },
      },
    }));
    expect(toolbar.querySelector('[data-canvas-add-text="title"]')?.textContent).toContain("Título");
    expect(toolbar.querySelector('[data-canvas-add-text="subtitle"]')?.textContent).toContain("Subtítulo");
    expect(toolbar.querySelector<HTMLInputElement>("[data-canvas-background]")?.value).toBe("#26170d");
    expect(toolbar.classList.contains("is-animation-popover")).toBe(true);
    expect(toolbar.querySelector<HTMLInputElement>('[data-canvas-animation-field="title"]')?.value).toBe("Título principal");
    expect(toolbar.querySelector('[data-canvas-media="0"]')).toBeNull();
    expect(toolbar.querySelector(".store-preview-animation-style [data-canvas-color]")).not.toBeNull();
    expect(toolbar.querySelector("[data-canvas-delete-animation]")).not.toBeNull();

    const selectedCopy = document.querySelector<HTMLElement>('[data-animation-text-block="title-1"]')!;
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_STYLE_UPDATE",
        editorMode: true,
        animationId: "opening",
        key: "textColor",
        value: "#ff3366",
        selection: { section: "animation-opening", field: "textBlock", label: "título adicional", animationId: "opening", itemId: "title-1" },
      },
    }));
    expect(selectedCopy.dataset.animationTextColor).toBe("#ff3366");
    expect(selectedCopy.style.getPropertyValue("--animation-scene-text-color")).toBe("#ff3366");
  });

  it("exposes direct text styling targets in every text animation", async () => {
    const textTypes: StoreMotionExperience[] = ["clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"];
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Texto por todas partes",
        contentOrder: [...textTypes.map((_, index) => `animation-text-${index}`), "products", "links"],
        animations: textTypes.map((type, index) => ({
          id: `text-${index}`,
          name: `Texto ${index + 1}`,
          type,
          title: `Título ${index + 1}|Alternativa ${index + 1}`,
          subtitle: `Subtítulo ${index + 1}`,
          media: [],
        })),
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=all-text&preview=1&editor=1");
    const sections = [...document.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]")];
    expect(sections).toHaveLength(textTypes.length);
    sections.forEach((section) => {
      expect(section.querySelector("[data-animation-copy]")).not.toBeNull();
      expect(section.querySelector('[data-store-editor-field="animationTitle"], [data-store-editor-field="animationSubtitle"], [data-store-editor-field="animationStyle"]')).not.toBeNull();
    });

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "animation-text-5", field: "animationStyle", label: "texto de la animación", animationId: "text-5" },
      },
    }));
    expect(document.querySelector<HTMLElement>(".store-preview-canvas-toolbar")?.hidden).toBe(false);
    expect(document.querySelector("[data-canvas-color]")).not.toBeNull();
  });

  it("renders MP4 media as video in every visual animation that accepts uploads", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const animation = (id: string, type: StoreMotionExperience, count: number) => ({
      id,
      name: id,
      type,
      media: Array.from({ length: count }, (_, index) => ({ imageUrl: `/v1/uploads/${id}-${index + 1}.mp4`, title: `${id} ${index + 1}` })),
    });
    const animations = [
      animation("hero-video", "hero-carousel", 2),
      animation("stream-video", "image-stream", 2),
      animation("expansion-video", "scroll-expansion", 2),
      animation("gallery-video", "hero-gallery-scroll", 3),
      animation("reviews-video", "stagger-testimonials", 2),
      animation("magnetic-video", "magnetic-target", 1),
      animation("frames-video", "frame-sequence", 2),
      animation("background-video", "video-background", 1),
      animation("pin-video", "video-pin-reveal", 1),
      animation("drag-video", "draggable-cards", 2),
      animation("perspective-video", "perspective-carousel", 2),
      animation("link-video", "link-preview", 1),
      animation("accordion-video", "gallery-accordion", 3),
      animation("split-video", "split-scroll", 3),
      animation("sticky-gallery-video", "sticky-gallery", 3),
      animation("sticky-story-video", "sticky-story", 2),
      animation("parallax-video", "text-parallax", 2),
    ];
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Videos por animación",
        animations,
        contentOrder: [...animations.map((entry) => `animation-${entry.id}`), "hero", "products", "about", "gallery", "contact", "links"],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=animation-videos");
    expect([...document.querySelectorAll<HTMLElement>("section[data-animation-id]")].map((section) => section.dataset.animationId)).toEqual(animations.map((entry) => entry.id));
    for (const entry of animations) {
      const section = document.querySelector<HTMLElement>(`section[data-animation-id="${entry.id}"]`)!;
      expect(section).not.toBeNull();
      expect(section.querySelectorAll("video").length).toBeGreaterThanOrEqual(entry.media.length);
      expect([...section.querySelectorAll<HTMLImageElement>("img")].some((image) => /\.mp4(?:$|[?#])/.test(image.src))).toBe(false);
    }
    const background = document.querySelector<HTMLElement>('[data-animation-id="background-video"] .store-video-background');
    const twoImageStream = document.querySelector<HTMLElement>('[data-animation-id="stream-video"] .store-image-stream-grid');
    expect(twoImageStream?.style.getPropertyValue("--image-stream-columns")).toBe("2");
    expect(background?.querySelector("video")?.hasAttribute("muted")).toBe(true);
    expect(background?.querySelector("video")?.hasAttribute("loop")).toBe(true);
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it("mounts picture scenes in the merchant preview and keeps scene edits stable", async () => {
    const media = Array.from({ length: 4 }, (_, index) => ({
      imageUrl: `/scene-${index + 1}.webp`,
      title: `Escena ${index + 1}`,
      caption: `Texto ${index + 1}`,
      textPositionX: index === 3 ? 74 : 20,
      textPositionY: index === 3 ? 32 : 70,
      textScale: index === 3 ? 126 : 100,
      textWidthPercent: index === 3 ? 54 : 62,
      textAlign: index === 3 ? "right" as const : "left" as const,
    }));
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Escenas estables",
        contentOrder: ["hero", "animation-scenes", "products", "about", "gallery", "links"],
        animations: [{ id: "scenes", name: "Escenas", type: "hero-carousel", media }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=stable-scenes&preview=1&editor=1");
    const originalSection = document.querySelector<HTMLElement>('[data-animation-id="scenes"]')!;
    const originalHero = originalSection.querySelector<HTMLElement>("[data-motion-hero]")!;
    expect(originalSection).not.toBeNull();
    expect(originalHero).not.toBeNull();

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_SELECTION",
        editorMode: true,
        reveal: false,
        editorSelection: { section: "animation-scenes", field: "title", label: "texto de la escena 4", animationId: "scenes", itemIndex: 3 },
      },
    }));

    expect(document.querySelector('[data-animation-id="scenes"]')).toBe(originalSection);
    expect(document.querySelector("[data-motion-hero]")).toBe(originalHero);
    expect(originalHero.querySelector('[data-motion-hero-background="3"]')?.classList.contains("active")).toBe(true);
    const copy = originalHero.querySelector<HTMLElement>("[data-animation-copy]")!;
    expect(copy.dataset.animationMediaIndex).toBe("3");
    expect(copy.style.getPropertyValue("--animation-text-x")).toBe("74%");
    expect(copy.style.getPropertyValue("--animation-text-y")).toBe("32%");
    expect(copy.querySelector("h3")?.dataset.storeEditorItemIndex).toBe("3");

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_TEXT_UPDATE",
        editorMode: true,
        selection: { section: "animation-scenes", field: "title", label: "título de la escena 1", animationId: "scenes", itemIndex: 0 },
        value: "Escena 1 actualizada",
      },
    }));
    expect(originalHero.querySelector('[data-motion-hero-background="0"]')?.classList.contains("active")).toBe(true);
    expect(originalHero.querySelector("[data-motion-hero-title]")?.textContent).toBe("Escena 1 actualizada");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        type: "PAGOSYA_STORE_EDITOR_STYLE_UPDATE",
        editorMode: true,
        animationId: "scenes",
        key: "textScale",
        value: 132,
      },
    }));
    expect(document.querySelector('[data-animation-id="scenes"]')).toBe(originalSection);
    expect(originalSection.dataset.animationTextScale).toBe("132");
    expect(originalSection.style.getPropertyValue("--animation-heading-size")).toContain("53px");
    originalHero.querySelector<HTMLButtonElement>('[data-motion-hero-to="1"]')!.click();
    expect(originalHero.querySelector('[data-motion-hero-background="1"]')?.classList.contains("active")).toBe(true);
    expect(copy.dataset.animationMediaIndex).toBe("1");
    expect(copy.classList.contains("store-animation-layout-selected")).toBe(true);
    originalHero.querySelector<HTMLButtonElement>('[data-motion-hero-to="0"]')!.click();
    expect(originalHero.querySelector("[data-motion-hero-title]")?.textContent).toBe("Escena 1 actualizada");
  });

  it("exposes independent picture editors for visual animations", async () => {
    const scene = (prefix: string, index: number) => ({
      imageUrl: `/${prefix}-${index}.webp`,
      title: `${prefix} ${index}`,
      caption: `Texto ${index}`,
    });
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Dos animaciones",
        contentOrder: ["hero", "animation-first", "animation-second", "products", "links"],
        animations: [
          { id: "first", name: "Primera", type: "hero-carousel", media: [scene("primera", 1), scene("primera", 2)] },
          { id: "second", name: "Segunda", type: "stagger-testimonials", media: [scene("segunda", 1), scene("segunda", 2)] },
        ],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=two-animations&preview=1&editor=1");
    const firstSection = document.querySelector<HTMLElement>('[data-animation-id="first"]')!;
    const secondSection = document.querySelector<HTMLElement>('[data-animation-id="second"]')!;
    expect(firstSection).not.toBeNull();
    expect(secondSection).not.toBeNull();

    firstSection.querySelector<HTMLButtonElement>('[data-motion-hero-to="1"]')!.click();
    expect(firstSection.querySelector('[data-motion-hero-background="1"]')?.classList.contains("active")).toBe(true);
    expect(firstSection.querySelector('[data-animation-copy]')?.classList.contains("store-animation-layout-selected")).toBe(true);

    secondSection.querySelector<HTMLImageElement>('[data-testimonial-index="0"] img')!.click();
    expect(secondSection.querySelector('[data-testimonial-index="0"] [data-animation-copy]')?.classList.contains("store-animation-layout-selected")).toBe(true);
    expect(firstSection.querySelector('[data-animation-copy]')?.classList.contains("store-animation-layout-selected")).toBe(false);
    expect(secondSection.querySelector('[data-testimonial-index="0"]')?.classList.contains("store-preview-editor-selected")).toBe(true);
  });

  it("lets the store editor move and rewrite animation text with one clean canvas grabber", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Tienda manipulable",
        contentOrder: ["hero", "animation-opening", "products", "about", "gallery", "links"],
        animations: [{
          id: "opening",
          name: "Apertura",
          type: "clarity-marquee",
          title: "Texto que se mueve",
          textPositionX: 20,
          textPositionY: 60,
          textScale: 100,
          textWidthPercent: 60,
          textAlign: "left",
          buttonLabel: "Ver colección",
          buttonPositionX: 18,
          buttonPositionY: 86,
          media: [],
        }],
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=direct-layout&preview=1&editor=1");
    const section = document.querySelector<HTMLElement>('[data-animation-id="opening"]')!;
    const copy = section.querySelector<HTMLElement>("[data-animation-copy]")!;
    expect(copy.querySelector('[data-animation-layout-handle="move"]')).not.toBeNull();
    expect(copy.querySelector('[data-animation-layout-handle="width"]')).toBeNull();
    expect(copy.querySelector('[data-animation-layout-handle="scale"]')).toBeNull();

    const bounds = { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500, toJSON: () => ({}) } as DOMRect;
    const copyBounds = { x: 200, y: 200, left: 200, top: 200, right: 500, bottom: 300, width: 300, height: 100, toJSON: () => ({}) } as DOMRect;
    Object.defineProperty(copy, "offsetParent", { configurable: true, value: section });
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(bounds);
    vi.spyOn(copy, "getBoundingClientRect").mockReturnValue(copyBounds);
    const pointer = (target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number, buttons: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      target.dispatchEvent(event);
    };

    pointer(copy, "pointerdown", 11, 300, 250, 1);
    pointer(window, "pointermove", 11, 650, 200, 1);
    pointer(window, "pointerup", 11, 650, 200, 0);
    expect(copy.style.getPropertyValue("--animation-text-x")).toBe("");
    const moveHandle = copy.querySelector<HTMLElement>('[data-animation-layout-handle="move"]')!;
    pointer(moveHandle, "pointerdown", 12, 300, 250, 1);
    pointer(window, "pointermove", 12, 650, 200, 1);
    pointer(window, "pointerup", 12, 650, 200, 0);
    expect(copy.style.getPropertyValue("--animation-text-x")).toBe("55%");
    expect(copy.style.getPropertyValue("--animation-text-y")).toBe("50%");
    expect(copy.dataset.animationTextX).toBe("55");
    expect(copy.dataset.animationTextY).toBe("50");

    const heading = copy.querySelector<HTMLElement>('[data-store-editor-inline="text"]')!;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
    expect(heading.getAttribute("contenteditable")).toBe("plaintext-only");
    const spaceKey = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
    heading.dispatchEvent(spaceKey);
    expect(spaceKey.defaultPrevented).toBe(false);
    heading.textContent = "Todavía puedo editar";
    heading.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", ctrlKey: true }));
    expect(heading.hasAttribute("contenteditable")).toBe(false);

    const button = section.querySelector<HTMLElement>(".store-animation-cta")!;
    const buttonLabel = button.querySelector<HTMLElement>(".store-animation-cta-label")!;
    expect(button.dataset.storeEditorTarget).toBe("true");
    expect(button.querySelector(".store-animation-button-handle")).not.toBeNull();
    const buttonArrow = button.querySelector<SVGElement>(":scope > svg")!;
    const navigationClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    buttonArrow.dispatchEvent(navigationClick);
    expect(navigationClick.defaultPrevented).toBe(true);
    const buttonHandle = button.querySelector<HTMLElement>(".store-animation-button-handle")!;
    pointer(buttonHandle, "pointerdown", 14, 180, 430, 1);
    pointer(window, "pointermove", 14, 280, 380, 1);
    pointer(window, "pointerup", 14, 280, 380, 0);
    expect(button.dataset.animationButtonX).toBe("28");
    expect(button.dataset.animationButtonY).toBe("76");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    buttonLabel.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
    expect(buttonLabel.getAttribute("contenteditable")).toBe("plaintext-only");
    buttonLabel.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", ctrlKey: true }));
  });

  it("does not render a retired 3D gallery saved by an older store", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Galería retirada",
        contentOrder: ["hero", "animation-space", "products", "about", "gallery", "links"],
        animations: [{
          id: "space",
          name: "Galería tridimensional",
          type: "3d-gallery",
          media: [
            { imageUrl: "/v1/uploads/uno.webp" },
            { imageUrl: "/v1/uploads/dos.webp" },
            { imageUrl: "/v1/uploads/tres.webp" },
          ],
        }],
        items: [baseItem],
      } as unknown as Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=retired-space");

    expect(document.querySelector('[data-animation-id="space"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Galería tridimensional");
    expect(document.querySelector(".store-products")).not.toBeNull();
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

    await loadCheckout("/?link=contrast-boundary&preview=1&editor=1");
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

  it("applies visual editor messages only when the storefront explicitly enables editor mode", async () => {
    vi.doMock("../src/api", () => ({
      fetchStore: vi.fn().mockResolvedValue({
        ...baseStoreFields,
        storeName: "Nombre guardado",
        items: [baseItem],
      } satisfies Store),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?link=preview-store&preview=1&editor=1");
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
