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
  accentColor: null,
  buttonStyle: "rounded",
  announcement: null,
  links: [],
  categories: [],
};

describe("storefront (?link=...)", () => {
  beforeEach(() => {
    localStorage.clear();
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

    const paragraphs = [...document.querySelectorAll(".store-about p")].map((p) => p.textContent);
    expect(paragraphs).toEqual(["Empezamos en 2020.", "Hoy enviamos a todo el país."]);
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
    expect(document.documentElement.style.getPropertyValue("--pg-accent")).toBe("");
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
