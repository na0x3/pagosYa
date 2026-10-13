// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cartItemKey, reminderItemKey, restoreCart } from "./cart-state";

const item = { id: "p1", name: "Café", amount: 8000, currency: "BOB", variants: [], extras: [], subscriptionOptions: [{ cadence: "MONTHLY", discountPercent: 10 }] };
const storeFor = (checkoutMode: string) => ({ storeId: "s1", checkoutMode, subscriptionsEnabled: true, items: [item] }) as never;
const restore = (checkoutMode: string) => restoreCart(storeFor(checkoutMode), () => null, () => null).cart;

describe("restoreCart subscription lines", () => {
  beforeEach(() => {
    localStorage.setItem("pagosya_cart_s1", JSON.stringify({ [cartItemKey("p1")]: 1, [cartItemKey("p1", undefined, [], "MONTHLY")]: 2 }));
  });
  it("keeps them in payment mode", () => {
    expect([...restore("payment").keys()]).toEqual([cartItemKey("p1"), cartItemKey("p1", undefined, [], "MONTHLY")]);
  });
  it.each(["whatsapp", "external"])("drops them in %s mode and keeps one-time lines", (mode) => {
    expect([...restore(mode).entries()]).toEqual([[cartItemKey("p1"), 1]]);
  });
});

describe("restoreCart memberships", () => {
  it("drops a membership product from a restored cart", () => {
    const club = { id: "club", name: "Club", amount: 5000, currency: "BOB", variants: [], extras: [], fulfillmentType: "MEMBERSHIP" };
    const store = { storeId: "s1", checkoutMode: "payment", items: [item, club] } as never;
    localStorage.setItem("pagosya_cart_s1", JSON.stringify({ [cartItemKey("club")]: 1, [cartItemKey("p1")]: 1 }));
    const cart = restoreCart(store, () => null, () => null).cart;
    expect([...cart.keys()].some(key => key.includes("club"))).toBe(false);
    expect([...cart.keys()]).toEqual([cartItemKey("p1")]);
  });
});

// A reminder link restores the cart it saved, a subscription as a subscription (owner, 2026-10-13).
describe("reminderItemKey", () => {
  it("keeps the cadence the store still offers", () => {
    expect(reminderItemKey(storeFor("payment"), { paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" })).toBe(cartItemKey("p1", undefined, [], "MONTHLY"));
  });
  it("brings the product back as a one-time line when the cadence is no longer offered", () => {
    expect(reminderItemKey(storeFor("payment"), { paymentLinkId: "p1", quantity: 1, subscriptionCadence: "WEEKLY" })).toBe(cartItemKey("p1"));
    expect(reminderItemKey(storeFor("whatsapp"), { paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" })).toBe(cartItemKey("p1"));
  });
  it("skips a product or option that is gone", () => {
    expect(reminderItemKey(storeFor("payment"), { paymentLinkId: "gone", quantity: 1 })).toBeNull();
    expect(reminderItemKey(storeFor("payment"), { paymentLinkId: "p1", variantId: "v-gone", quantity: 1 })).toBeNull();
  });
});
