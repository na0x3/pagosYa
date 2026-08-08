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
  });
});
