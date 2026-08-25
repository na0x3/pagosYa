import { beforeEach, describe, expect, it, vi } from "vitest";

describe("published stores directory", () => {
  beforeEach(() => {
    vi.resetModules();
    history.replaceState(null, "", "/stores/");
    document.body.innerHTML = `
      <span id="storeCount"></span>
      <span id="resultsSummary"></span>
      <form id="directorySearch"><input id="storeSearch" name="search"><button>Buscar</button></form>
      <div id="directoryGrid"></div>
      <div id="directoryEmpty" hidden></div>
      <div id="directoryError" hidden></div>
      <button id="loadMoreStores" hidden></button>
      <button id="retryDirectory"></button>
      <button id="clearSearch"></button>
    `;
  });

  it("renders real public store summaries as storefront links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        stores: [{
          id: "store_1",
          slug: "estudio-norte",
          name: "Estudio Norte",
          tagline: "Diseño hecho en Bolivia",
          logoUrl: "/v1/uploads/logo.webp",
          coverUrl: "/v1/uploads/cover.webp",
          accentColor: "#c58b3c",
          backgroundColor: "#171717",
          checkoutMode: "payment",
          categories: ["Hogar"],
          productCount: 4,
          minimumAmount: 12500,
          currency: "BOB",
          featuredProducts: ["Lámpara"],
          publishedAt: "2026-08-01T12:00:00.000Z",
        }],
        pagination: { page: 1, pageSize: 24, total: 1, totalPages: 1, hasMore: false },
      }),
    }));

    await import("../src/stores");
    await vi.waitFor(() => expect(document.querySelector(".store-card")).not.toBeNull());

    expect(document.getElementById("storeCount")?.textContent).toBe("1");
    expect(document.querySelector<HTMLAnchorElement>(".store-card")?.getAttribute("href")).toBe("/s/estudio-norte");
    expect(document.querySelector(".store-card h3")?.textContent).toBe("Estudio Norte");
    expect(document.querySelector(".store-card-price strong")?.textContent).toContain("125");
  });
});
