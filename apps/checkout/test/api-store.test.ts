import { afterEach, describe, expect, it, vi } from "vitest";

describe("fetchStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("always bypasses browser caches so a saved storefront is visible at its public link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ storeId: "store_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchStore } = await import("../src/api");
    await fetchStore("mi tienda", { preview: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/stores/public/mi%20tienda/store?preview=1");
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });
});
