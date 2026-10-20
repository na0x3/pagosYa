import { describe, expect, it, vi } from "vitest";

// The order confirmation in the one calm checkout (spec 2026-10-20).
describe("confirmation in the calm checkout shell", () => {
  it("shows the check, the order and its lines in the shell", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    const { renderSuccess } = await import("../src/checkout/payment-result");
    renderSuccess({ id: "pi_9", amount: 14400, currency: "BOB", status: "SUCCEEDED", description: null, merchantName: "Tostadero", metadata: { cart: [{ paymentLinkId: "p1", name: "Irupana Honey", quantity: 1, unitAmount: 14400 }] }, recipient: null, trackingToken: null, branding: { name: "Tostadero Yungas", logoUrl: null, photoUrl: null, accent: "#171717", accentForeground: "#ffffff" } } as never, true);
    const root = document.querySelector(".pya-checkout")!;
    expect(root).toBeTruthy();
    expect(root.querySelector(".pya-co__lead h1")?.textContent).toBe("¡Gracias por tu compra!");
    expect(root.querySelector(".pya-co__check")).toBeTruthy();
    expect(root.querySelector(".pya-co__summary .pya-co__line-text")?.textContent).toContain("Irupana Honey");
    expect(root.querySelector(".payment-success-panel .receipt")).toBeTruthy();
  });
});
