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
  metadata: { cart: [{ paymentLinkId: "item_1", name: "Corte de cabello", quantity: 1, unitAmount: 5000 }] },
  recipient: null,
  trackingToken: null,
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

async function payAndGet(confirmResult: unknown, path = "/?client_secret=pi_1_secret_abc") {
  vi.doMock("../src/api", () => ({
    fetchSession: vi.fn().mockResolvedValue(session),
    confirmPaymentIntent: vi.fn().mockResolvedValue(confirmResult),
    assetUrl: (p: string | null) => p,
  }));

  await loadCheckout(path);
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
      paymentIntent: { id: "pi_1", status: "SUCCEEDED", railId: "mock_card", amount: 5000, currency: "BOB", metadata: session.metadata },
      railResult: { status: "succeeded" },
    });

    const status = document.querySelector(".status")!;
    expect(status.classList.contains("success")).toBe(true);
    expect(status.textContent).toContain("Pedido recibido");
    expect(document.querySelector(".receipt")?.textContent).toContain("pi_1");
    expect(document.querySelector(".receipt-subtotal")?.textContent).toContain("50.00 BOB");
    const overlay = document.querySelector<HTMLElement>(".payment-success-overlay");
    expect(overlay?.textContent).toContain("Payment Successful!");
    expect(overlay?.getAttribute("role")).toBe("status");
    expect(document.querySelector<HTMLImageElement>(".payment-success-bird-crop img")?.src).toContain("/logo-mark.png");
    expect(document.querySelectorAll(".payment-success-particles i")).toHaveLength(10);
    expect(document.body.classList.contains("payment-success-overlay-open")).toBe(true);

    overlay!.dispatchEvent(new Event("animationend"));
    expect(document.querySelector(".payment-success-overlay")).toBeNull();
    expect(document.body.classList.contains("payment-success-overlay-open")).toBe(false);
  });

  it("offers a way back to the originating store after a completed order", async () => {
    await payAndGet({
      paymentIntent: { id: "pi_1", status: "SUCCEEDED", railId: "mock_card", amount: 5000, currency: "BOB", metadata: null },
      railResult: { status: "succeeded" },
    }, "/?link=burgeria&client_secret=pi_1_secret_abc");

    const backLink = document.querySelector<HTMLAnchorElement>(".back-to-store");
    expect(backLink?.textContent).toContain("Volver a la tienda");
    expect(backLink?.getAttribute("href")).toBe("/s/burgeria");
  });

  it("renders the debt lookup as the light colored ledger surface", async () => {
    vi.doMock("../src/api", () => ({
      fetchDebtCollection: vi.fn().mockResolvedValue({ companyName: "Colegio Demo", collectionName: "Mensualidades de agosto", currency: "BOB" }),
      lookupDebt: vi.fn(),
      checkoutDebt: vi.fn(),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?debt=agosto2026");
    expect(document.body.classList.contains("debt-collection-page")).toBe(true);
    expect(document.querySelector(".payment-box-field")).toBeNull();
    expect(document.querySelector(".debt-collection-heading")?.textContent).toContain("Colegio Demo");
    expect(document.querySelector(".debt-lookup-form")).toBeTruthy();
    expect(document.querySelector(".debt-secure-note")?.textContent).toContain("pagosYa");
  });

  it("shows every debt for the carnet and checks out only the selected ones", async () => {
    const checkoutDebt = vi.fn().mockResolvedValue({
      clientSecret: "pi_debt_secret_abc",
      companyName: "Colegio Demo",
      description: "Pago de deudas",
      contactEmail: "ayuda@colegio.bo",
      contactPhone: null,
    });
    vi.doMock("../src/api", () => ({
      fetchDebtCollection: vi.fn().mockResolvedValue({ companyName: "Colegio Demo", collectionName: "Estado de cuenta", currency: "BOB" }),
      lookupDebt: vi.fn().mockResolvedValue({
        status: "pending",
        customerLabel: "María Q.",
        pendingTotal: 3750,
        currency: "BOB",
        debts: [
          { id: "debt_1", status: "pending", amount: 1500, currency: "BOB", collectionName: "Agosto", description: "Mensualidad", reference: "AGO-1" },
          { id: "debt_2", status: "pending", amount: 2250, currency: "BOB", collectionName: "Materiales", description: "Cuaderno", reference: "MAT-1" },
          { id: "debt_3", status: "paid", amount: 1000, currency: "BOB", collectionName: "Julio", description: "Mensualidad", reference: "JUL-1" },
        ],
      }),
      checkoutDebt,
      fetchSession: vi.fn().mockResolvedValue({
        ...session,
        id: "pi_debt",
        amount: 1500,
        description: "Mensualidad",
        metadata: { debt: { customerName: "María Quispe", customerDocument: "7845123", customerEmail: "maria@gmail.com" } },
      }),
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?debt=portal-colegio");
    const documentInput = document.querySelector<HTMLInputElement>("#debt-document")!;
    documentInput.value = "7845123";
    document.querySelector<HTMLFormElement>("#debt-lookup-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelectorAll(".debt-choice")).toHaveLength(3));

    expect(document.querySelector("#debt-selection-total")?.textContent).toContain("37.50 BOB");
    const choices = document.querySelectorAll<HTMLInputElement>(".debt-choice-input");
    choices[1].checked = false;
    choices[1].dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector("#debt-selection-total")?.textContent).toContain("15.00 BOB");

    document.querySelector<HTMLButtonElement>("#debt-pay")!.click();
    await vi.waitFor(() => expect(checkoutDebt).toHaveBeenCalledWith("portal-colegio", "7845123", ["debt_1"]));
  });

  it("keeps debt identity server-owned and returns to the carnet collection", async () => {
    const debtSession = {
      ...session,
      description: "Mensualidad de agosto",
      metadata: {
        debt: {
          customerName: "María Quispe",
          customerDocument: "7845123",
          customerEmail: "maria@gmail.com",
          reference: "AGO-001",
        },
      },
    };
    const confirmPaymentIntent = vi.fn().mockResolvedValue({
      paymentIntent: { ...debtSession, status: "SUCCEEDED", railId: "mock_card" },
      railResult: { status: "succeeded" },
    });
    vi.doMock("../src/api", () => ({
      fetchSession: vi.fn().mockResolvedValue(debtSession),
      confirmPaymentIntent,
      assetUrl: (path: string | null) => path,
    }));

    await loadCheckout("/?debt=agosto2026&client_secret=pi_1_secret_abc");
    expect(document.querySelector<HTMLInputElement>("#customerName")).toBeNull();
    expect(document.querySelector(".direct-charge-context")?.textContent).toContain("7845123");
    expect(document.querySelector("#customerEmail")).toBeNull();
    document.querySelector<HTMLButtonElement>("#pay")!.click();
    await vi.waitFor(() => {
      if (!document.querySelector(".status.success")) throw new Error("payment not completed");
    });
    expect(confirmPaymentIntent.mock.calls[0][3]).toEqual(expect.objectContaining({
      name: "María Quispe",
      document: "7845123",
      email: "maria@gmail.com",
    }));
    expect(document.querySelector<HTMLAnchorElement>(".back-to-store")?.getAttribute("href")).toBe("/?debt=agosto2026");
  });

  it("uses payment language after a directed charge succeeds", async () => {
    const directSession = { ...session, metadata: null, recipient: null };
    const confirmPaymentIntent = vi.fn().mockResolvedValue({
      paymentIntent: { ...directSession, status: "SUCCEEDED", railId: "mock_card" },
      railResult: { status: "succeeded" },
    });
    vi.doMock("../src/api", () => ({
      fetchSession: vi.fn().mockResolvedValue(directSession),
      confirmPaymentIntent,
      assetUrl: (p: string | null) => p,
    }));

    await loadCheckout("/?client_secret=pi_1_secret_abc");
    document.querySelector<HTMLButtonElement>("#pay")!.click();
    await vi.waitFor(() => expect(document.querySelector(".status.success")?.textContent).toContain("Pago confirmado"));
    expect(document.querySelector(".receipt")?.textContent).toContain("N° de pago");
    expect(document.querySelector(".receipt-subtotal")?.textContent).toContain("Total");
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
