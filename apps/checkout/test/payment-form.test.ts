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

function mockSession(overrides: Partial<CheckoutSession> = {}) {
  vi.doMock("../src/api", () => ({
    fetchSession: vi.fn().mockResolvedValue({
      id: "pi_1",
      amount: 5000,
      currency: "BOB",
      status: "REQUIRES_PAYMENT_METHOD",
      description: "Corte de cabello",
      merchantName: "pagosYa Demo Store",
      metadata: null,
      recipient: null,
      trackingToken: null,
      ...overrides,
    } satisfies CheckoutSession),
    assetUrl: (p: string | null) => p,
  }));
}

describe("payment form (?client_secret=...)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a merchant identity row — regression test: this used to render nothing", async () => {
    mockSession({ merchantName: "pagosYa Demo Store" });
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    const row = document.querySelector(".merchant-row");
    expect(row).toBeTruthy();
    expect(document.querySelector(".merchant-name")?.textContent).toBe("pagosYa Demo Store");
    expect(document.querySelector(".payment-box-field")).toBeNull();
    // "pagosYa Demo Store" -> first letter of first two words -> "PD"
    expect(document.querySelector(".merchant-avatar")?.textContent).toBe("PD");
  });

  it("computes single-word initials from the first two letters of the name", async () => {
    mockSession({ merchantName: "Acme" });
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    expect(document.querySelector(".merchant-avatar")?.textContent).toBe("AC");
  });

  it("escapes a hostile merchant name instead of injecting it as HTML", async () => {
    mockSession({ merchantName: '<img src=x onerror=alert(1)>Evil Corp' });
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    expect(document.querySelector(".merchant-name img")).toBeFalsy();
    expect(document.querySelector(".merchant-name")?.textContent).toContain("Evil Corp");
  });

  it("renders all four payment method tabs and lets you switch between them", async () => {
    mockSession();
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
    expect(tabs.map((t) => t.dataset.type)).toEqual(["CARD", "TIGO_MONEY", "BANK_TRANSFER", "QR"]);
    expect(tabs[0].classList.contains("active")).toBe(true);

    tabs[3].click();
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('.tab[data-type="QR"]')?.classList.contains("active")).toBe(true);
    });
    const tokenOptions = [...document.querySelectorAll<HTMLOptionElement>("#token option")].map((o) => o.value);
    expect(tokenOptions).toContain("tok_qr_demo");
  });

  it("shows the amount and description for a direct payment link", async () => {
    mockSession({ amount: 12345, currency: "BOB", description: "Manicure" });
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    expect(document.querySelector(".amount")?.textContent).toBe("123.45 BOB");
    expect(document.querySelector(".description")?.textContent).toBe("Manicure");
    expect(document.querySelector("#customerName")).toBeNull();
    expect(document.querySelector("#customerEmail")).toBeNull();
    expect(document.querySelector("#customerPhone")).toBeNull();
    expect(document.querySelector("#deliveryRequested")).toBeNull();
    expect(document.querySelector(".direct-charge-context")?.textContent).toContain("Solo elige cómo pagar");
  });

  it("shows a known subscription recipient as read-only", async () => {
    mockSession({
      metadata: { subscription: { subscriptionId: "sub_1" } },
      recipient: { name: "María López", document: null, email: "maria@gmail.com", phone: "+59170000000" },
    });
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    expect(document.querySelector(".direct-charge-context")?.textContent).toContain("María López");
    expect(document.querySelector("#customerEmail")).toBeNull();
  });

  it("asks for delivery details only when selected and captures location after an explicit tap", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) => success({
          coords: { latitude: -17.3935, longitude: -66.157, accuracy: 18.4 },
        })),
      },
    });
    mockSession({ metadata: { cart: [{ paymentLinkId: "item_1", name: "Café", quantity: 1, unitAmount: 5000 }] } });
    await loadCheckout("/?client_secret=pi_1_secret_abc");

    expect(document.querySelector(".delivery-request-fields")?.hasAttribute("hidden")).toBe(true);
    document.querySelector<HTMLInputElement>("#deliveryRequested")!.click();
    await vi.waitFor(() => expect(document.querySelector("#deliveryAddress")).toBeTruthy());
    document.querySelector<HTMLButtonElement>("#captureLocation")!.click();
    await vi.waitFor(() => expect(document.querySelector("#locationStatus")?.textContent).toContain("18 m"));
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledOnce();
  });
});


describe('store checkout fulfillment handoff', () => {
  it('keeps the selected delivery address when switching payment methods', async () => {
    mockSession({ metadata: { cart: [], fulfillment: { method: 'delivery', address: 'Calle 10, puerta azul', locationName: 'Sucursal central' } } });
    await loadCheckout('/?client_secret=pi_1_secret_abc');
    expect(document.body.classList.contains('store-payment-page')).toBe(true);
    expect(document.querySelector('#deliveryRequested')).toBeNull();
    const field = document.querySelector<HTMLTextAreaElement>('#deliveryAddress')!;
    expect(field.value).toBe('Calle 10, puerta azul');
    field.value = 'Calle 10, segundo piso'; field.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('.tab[data-type="QR"]')!.click();
    expect(document.querySelector<HTMLTextAreaElement>('#deliveryAddress')!.value).toBe('Calle 10, segundo piso');
  });
  it('does not ask a pickup customer to request delivery again', async () => {
    mockSession({ metadata: { cart: [], fulfillment: { method: 'pickup', locationName: 'Sucursal central' } } });
    await loadCheckout('/?client_secret=pi_1_secret_abc');
    expect(document.querySelector('#deliveryRequested')).toBeNull();
    expect(document.querySelector<HTMLElement>('.delivery-request-fields')!.hidden).toBe(true);
    expect(document.querySelector('.delivery-request')?.textContent).toContain('Recoger en tienda');
  });
});

describe("confirm refusal (merchant over its payment limit)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the buyer the neutral refusal message and no amounts, with no other text", async () => {
    // Keep the real confirmPaymentIntent/parseOrThrow so the 403 body's
    // `message` really does flow through, exactly as the API sends it —
    // only fetchSession is faked.
    vi.doMock("../src/api", async () => {
      const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
      return {
        ...actual,
        fetchSession: vi.fn().mockResolvedValue({
          id: "pi_1",
          amount: 5000,
          currency: "BOB",
          status: "REQUIRES_PAYMENT_METHOD",
          description: "Corte de cabello",
          merchantName: "pagosYa Demo Store",
          metadata: { cart: [{ paymentLinkId: "item_1", name: "Corte de cabello", quantity: 1, unitAmount: 5000 }] },
          recipient: null,
          trackingToken: null,
        } satisfies CheckoutSession),
        assetUrl: (p: string | null) => p,
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 403,
              code: "limit_exceeded",
              message: "Este comercio no puede recibir pagos en este momento.",
            }),
            { status: 403 },
          ),
        ),
      ),
    );

    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const setValue = (id: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    setValue("#customerName", "Cliente de Prueba");
    setValue("#customerEmail", "cliente@example.com");
    setValue("#customerPhone", "+591 70000000");
    document.querySelector<HTMLButtonElement>("#pay")!.click();

    await vi.waitFor(() => {
      if (!document.querySelector(".status")) throw new Error("not resolved yet");
    });

    const status = document.querySelector(".status")!;
    expect(status.textContent).toBe("Este comercio no puede recibir pagos en este momento.");
    expect(status.textContent).not.toMatch(/Bs|\d/);

    vi.unstubAllGlobals();
  });

  it("keeps the normal failure prefix for a non-limit confirm error", async () => {
    // Locks in the pre-existing behavior: only the merchant-limit codes
    // (limit_exceeded / per_payment_limit_exceeded) get the unwrapped,
    // verbatim message. Any other confirm failure — here a plain 500 —
    // must still show the "Pago fallido: " prefix exactly as before.
    vi.doMock("../src/api", async () => {
      const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
      return {
        ...actual,
        fetchSession: vi.fn().mockResolvedValue({
          id: "pi_1",
          amount: 5000,
          currency: "BOB",
          status: "REQUIRES_PAYMENT_METHOD",
          description: "Corte de cabello",
          merchantName: "pagosYa Demo Store",
          metadata: { cart: [{ paymentLinkId: "item_1", name: "Corte de cabello", quantity: 1, unitAmount: 5000 }] },
          recipient: null,
          trackingToken: null,
        } satisfies CheckoutSession),
        assetUrl: (p: string | null) => p,
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ statusCode: 500, message: "network down" }), { status: 500 }),
        ),
      ),
    );

    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const setValue = (id: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    setValue("#customerName", "Cliente de Prueba");
    setValue("#customerEmail", "cliente@example.com");
    setValue("#customerPhone", "+591 70000000");
    document.querySelector<HTMLButtonElement>("#pay")!.click();

    await vi.waitFor(() => {
      if (!document.querySelector(".status")) throw new Error("not resolved yet");
    });

    const status = document.querySelector(".status")!;
    expect(status.textContent).toBe("Pago fallido: network down");

    vi.unstubAllGlobals();
  });
});
