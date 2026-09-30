import { afterEach, describe, expect, it, vi } from "vitest";
import { manageViewHtml } from "./manage-page";

const view = {
  storeName: "Café Norte", itemName: "Café 500 g", cadence: "MONTHLY", cadenceLabel: "cada mes", amount: 15900, currency: "BOB",
  nextBillingAt: "2026-11-01T15:00:00.000Z", status: "ACTIVE",
  openPayment: { checkoutUrl: "https://pagar.test/#client_secret=x", amount: 15900, dueAt: "2026-11-01T15:00:00.000Z" },
  history: [{ periodStart: "2026-10-01T15:00:00.000Z", status: "PAID", amount: 15900 }],
  cadenceOptions: [{ cadence: "MONTHLY", label: "cada mes", discountPercent: 10, amount: 7200 }, { cadence: "WEEKLY", label: "cada semana", discountPercent: 5, amount: 7600 }],
};

describe("manageViewHtml", () => {
  it("shows product, frequency, pay button and actions for an active subscription", () => {
    const html = manageViewHtml(view as never);
    expect(html).toContain("Café 500 g");
    expect(html).toContain("cada mes");
    expect(html).toContain('href="https://pagar.test/#client_secret=x"');
    for (const action of ["skip", "pause", "cancel", "change_cadence"]) expect(html).toContain(`data-action="${action}"`);
    expect(html).not.toContain('data-action="resume"');
    expect(html).toContain("Pagado");
    expect(html).toContain("No se cobra nada automáticamente.");
  });
  it("shows the per-delivery price in each frequency option", () => {
    const html = manageViewHtml(view as never);
    expect(html).toContain("cada mes · 72.00 BOB");
    expect(html).toContain("cada semana · 76.00 BOB");
  });
  it("still renders an option whose price could not be computed", () => {
    const html = manageViewHtml({ ...view, cadenceOptions: [{ cadence: "MONTHLY", label: "cada mes", discountPercent: 0, amount: null }] } as never);
    expect(html).toContain(">cada mes<");
  });
  it("offers resume for a paused one and nothing for a canceled one", () => {
    expect(manageViewHtml({ ...view, status: "PAUSED", openPayment: null } as never)).toContain('data-action="resume"');
    expect(manageViewHtml({ ...view, status: "CANCELED", openPayment: null } as never)).not.toContain("data-action=");
  });
  it("escapes store-provided text", () => {
    expect(manageViewHtml({ ...view, itemName: "<img src=x onerror=alert(1)>" } as never)).not.toContain("<img src=x");
    expect(manageViewHtml({ ...view, storeName: "<script>x</script>", cadenceLabel: "<b>y</b>" } as never)).not.toMatch(/<script>|<b>y/);
  });
  it("asks for confirmation before canceling", () => {
    const html = manageViewHtml(view as never, true);
    expect(html).toContain('data-confirmed="1"');
    expect(html).toContain("data-keep");
  });
});

describe("renderSubscriptionManage", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
  it("shows the in-flight payment message inline when skip is refused with 409", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const message = "Tu pago está en proceso; espera a que termine";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => view })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ statusCode: 409, message }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const mod = await import("./manage-page");
    await mod.renderSubscriptionManage("tok_1");
    document.querySelector<HTMLButtonElement>('[data-action="skip"]')!.click();
    await vi.waitFor(() => expect(document.querySelector("[data-manage-status]")!.textContent).toBe(message));
    expect(document.querySelector('[data-action="skip"]')).not.toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/subscriptions/public/tok_1/actions");
  });
  it("shows the invalid-link message for a 404", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    vi.resetModules();
    const mod = await import("./manage-page");
    await mod.renderSubscriptionManage("bad");
    expect(document.getElementById("app")!.textContent).toContain("Este enlace no es válido");
  });
});
