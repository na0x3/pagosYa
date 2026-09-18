import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedOrder } from "../src/api";

async function loadTracking(order: TrackedOrder, token = "tok_1") {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = "";
  window.history.pushState({}, "", `/track/${token}`);
  vi.doMock("../src/api", () => ({
    API_BASE_URL: "https://api.example/v1",
    fetchTrackedOrder: vi.fn().mockResolvedValue(order),
    assetUrl: (path: string | null) => path,
  }));
  await import("../src/main");
  await vi.waitFor(() => {
    if (!document.getElementById("tracking-status-region")) throw new Error("not rendered yet");
  });
}

function baseOrder(overrides: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    reference: "ABCD1234",
    storeName: "Tienda Uno",
    items: [],
    amount: 1000,
    currency: "BOB",
    paymentStatus: "SUCCEEDED",
    status: "SHIPPED",
    createdAt: "2026-08-23T10:00:00Z",
    updatedAt: "2026-08-23T10:05:00Z",
    statusEvents: [],
    fulfillment: null,
    store: null,
    delivery: null,
    ...overrides,
  };
}

describe("buyer tracking page shipment rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { __xss?: number }).__xss;
  });

  it("escapes a hostile carrier name and omits a non-https tracking link", async () => {
    const order = baseOrder({
      shipment: {
        carrierName: '<img src=x onerror="globalThis.__xss=1">',
        status: "IN_TRANSIT",
        trackingNumber: "SV-000123",
        trackingUrl: 'javascript:globalThis.__xss=2',
        events: [{ status: "IN_TRANSIT", description: null, occurredAt: "2026-08-23T10:02:00Z" }],
      },
    });

    await loadTracking(order);

    expect((globalThis as typeof globalThis & { __xss?: number }).__xss).toBeUndefined();
    const shipmentSection = document.querySelector(".tracking-shipment");
    expect(shipmentSection).toBeTruthy();
    expect(shipmentSection?.querySelector("img")).toBeNull();
    expect(shipmentSection?.textContent).toContain('<img src=x onerror="globalThis.__xss=1">');
    expect(shipmentSection?.querySelector("a")).toBeNull();
  });

  it("renders an https tracking link and the shipment status/events for a well-formed shipment", async () => {
    const order = baseOrder({
      shipment: {
        carrierName: "Servientrega Bolivia",
        status: "DELIVERED",
        trackingNumber: "SV-000123",
        trackingUrl: "https://servientrega.example/track/SV-000123",
        events: [{ status: "DELIVERED", description: "Entregado al destinatario", occurredAt: "2026-08-23T12:00:00Z" }],
      },
    });

    await loadTracking(order);

    const shipmentSection = document.querySelector(".tracking-shipment")!;
    expect(shipmentSection.textContent).toContain("Servientrega Bolivia");
    expect(shipmentSection.textContent).toContain("SV-000123");
    const link = shipmentSection.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe("https://servientrega.example/track/SV-000123");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(shipmentSection.textContent).toContain("Entregado al destinatario");
  });

  it("renders nothing when there is no shipment", async () => {
    await loadTracking(baseOrder({ shipment: null }));
    expect(document.querySelector(".tracking-shipment")).toBeNull();
  });
});
