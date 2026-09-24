import { beforeAll, beforeEach, expect, it, vi } from "vitest";

type Runtime = { gtag?: unknown; fbq?: unknown; ttq?: unknown };
const runtime = window as unknown as Runtime;
const order = (id: string) => ({ id, amount: 12345, currency: "bob", metadata: { cart: [] } }) as never;
// src/ui/app resolves #app when it is first imported, so the mount point has to exist first.
let renderSuccess: (order: never, preview?: boolean) => void;
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  ({ renderSuccess } = await import("../src/checkout/payment-result"));
});

beforeEach(() => {
  delete runtime.gtag; delete runtime.fbq; delete runtime.ttq;
});

it("reports the sale in major units with an uppercase currency, once per order", () => {
  const gtag = vi.fn(), fbq = vi.fn(), track = vi.fn();
  runtime.gtag = gtag; runtime.fbq = fbq; runtime.ttq = { track };
  renderSuccess(order("pi_once"));
  expect(gtag).toHaveBeenCalledWith("event", "purchase", { transaction_id: "pi_once", value: 123.45, currency: "BOB" });
  expect(fbq).toHaveBeenCalledWith("track", "Purchase", { value: 123.45, currency: "BOB" });
  expect(track).toHaveBeenCalledWith("CompletePayment", { value: 123.45, currency: "BOB" });
  // Re-rendering the same success screen is not a second sale.
  renderSuccess(order("pi_once"));
  expect(gtag).toHaveBeenCalledTimes(1);
});

it("says nothing when the shopper never accepted statistics, and still renders the receipt", () => {
  expect(() => renderSuccess(order("pi_silent"))).not.toThrow();
  expect(document.querySelector(".payment-success-panel")).not.toBeNull();
});

it("does not report a preview run as a real sale", () => {
  const gtag = vi.fn();
  runtime.gtag = gtag;
  renderSuccess(order("pi_preview"), true);
  expect(gtag).not.toHaveBeenCalled();
});
