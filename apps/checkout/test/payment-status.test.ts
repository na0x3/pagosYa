import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutSession } from "../src/api";

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

const session: CheckoutSession = {
  id: "pi_1",
  amount: 5000,
  currency: "BOB",
  status: "REQUIRES_PAYMENT_METHOD",
  description: "Corte de cabello",
  merchantName: "pagosYa Demo Store",
};

function fillContactFields() {
  const setValue = (id: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  setValue("#customerName", "Cliente de Prueba");
  setValue("#customerEmail", "cliente@example.com");
  setValue("#customerPhone", "+591 70000000");
}

async function payAndGet(confirmResult: unknown) {
  vi.doMock("../src/api", () => ({
    fetchSession: vi.fn().mockResolvedValue(session),
    confirmPaymentIntent: vi.fn().mockResolvedValue(confirmResult),
    assetUrl: (p: string | null) => p,
  }));

  await loadCheckout("/?client_secret=pi_1_secret_abc");
  fillContactFields();
  document.querySelector<HTMLButtonElement>("#pay")!.click();
  await vi.waitFor(() => {
    if (!document.querySelector(".status")) throw new Error("not resolved yet");
  });
}

describe("payment outcome rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a success state with an order receipt for SUCCEEDED", async () => {
    await payAndGet({
      paymentIntent: { id: "pi_1", status: "SUCCEEDED", railId: "mock_card", amount: 5000, currency: "BOB", metadata: null },
      railResult: { status: "succeeded" },
    });

    const status = document.querySelector(".status")!;
    expect(status.classList.contains("success")).toBe(true);
    expect(status.textContent).toContain("Pedido recibido");
    expect(document.querySelector(".receipt")?.textContent).toContain("pi_1");
    expect(document.querySelector(".receipt-subtotal")?.textContent).toContain("50.00 BOB");
  });

  it("shows the rail's failure reason for a rejected payment", async () => {
    await payAndGet({
      paymentIntent: { id: "pi_1", status: "FAILED", railId: "mock_card" },
      railResult: { status: "failed", failureReason: "Fondos insuficientes" },
    });

    const status = document.querySelector(".status")!;
    expect(status.classList.contains("failed")).toBe(true);
    expect(status.textContent).toContain("Fondos insuficientes");
  });

  it("renders a scannable QR image for a requires_action qr_display response", async () => {
    await payAndGet({
      paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION", railId: "baneco_qr" },
      railResult: {
        status: "requires_action",
        actionRequired: { type: "qr_display", data: { qrImageBase64: "ZmFrZS1wbmc=" } },
      },
    });

    const img = document.querySelector<HTMLImageElement>(".qr-image");
    expect(img).toBeTruthy();
    expect(img!.src).toContain("data:image/png;base64,ZmFrZS1wbmc=");
    expect(document.querySelector(".status")?.textContent).toContain("Escanee el código QR con su app bancaria");
  });

  it("shows the USSD prompt message for a requires_action ussd_prompt response", async () => {
    await payAndGet({
      paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION", railId: "mock_tigo_money" },
      railResult: {
        status: "requires_action",
        actionRequired: { type: "ussd_prompt", data: { message: "Marque *123# para confirmar" } },
      },
    });

    expect(document.querySelector(".status")?.textContent).toContain("Marque *123# para confirmar");
    expect(document.querySelector(".qr-image")).toBeFalsy();
  });

  it("falls back to a generic failure message when confirmation itself throws", async () => {
    vi.doMock("../src/api", () => ({
      fetchSession: vi.fn().mockResolvedValue(session),
      confirmPaymentIntent: vi.fn().mockRejectedValue(new Error("network down")),
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?client_secret=pi_1_secret_abc");
    fillContactFields();
    document.querySelector<HTMLButtonElement>("#pay")!.click();
    await vi.waitFor(() => {
      if (!document.querySelector(".status")) throw new Error("not resolved yet");
    });

    const status = document.querySelector(".status")!;
    expect(status.classList.contains("failed")).toBe(true);
    expect(status.textContent).toContain("network down");
  });
});
