import { beforeEach, describe, expect, it } from "vitest";
import { cartItemKey, parseCartItemKey } from "../cart-state";
import { cart, cartTotal } from "./cart";
import { CADENCE_CONFLICT_MESSAGE, cartCadenceConflict, subscriptionsAvailable, subscriptionChoiceHtml, subscriptionConsentText, subscriptionPriceText, subscriptionRecurringAmount, subscriptionUnitAmount } from "./subscription-choice";

const item = { id: "p1", name: "Café", amount: 8000, currency: "BOB", discountPercent: null, discountStartsAt: null, discountEndsAt: null, variants: [], extras: [],
  subscriptionOptions: [{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }] } as never;

describe("subscription cart keys", () => {
  it("keeps one-time and subscription lines apart", () => {
    expect(cartItemKey("p1")).not.toBe(cartItemKey("p1", undefined, [], "MONTHLY"));
    expect(parseCartItemKey(cartItemKey("p1", undefined, [], "MONTHLY"))).toEqual({ paymentLinkId: "p1", extraIds: [], cadence: "MONTHLY" });
    expect(parseCartItemKey(cartItemKey("p1", "v1", ["b", "a"], "WEEKLY"))).toEqual({ paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"], cadence: "WEEKLY" });
  });
  it("still reads keys saved before this change", () => {
    expect(parseCartItemKey("p1::v1~~a,b")).toEqual({ paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"] });
  });
});

describe("subscription prices", () => {
  it("match the server rule", () => {
    expect(subscriptionUnitAmount(item, undefined, [], "MONTHLY")).toBe(7200);
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(subscriptionUnitAmount({ ...(item as object), discountPercent: 30, discountStartsAt: past, discountEndsAt: future } as never, undefined, [], "MONTHLY")).toBe(5600);
  });
  beforeEach(() => cart.clear());
  it("totals a mixed cart", () => {
    cart.set(cartItemKey("p1"), 1);
    cart.set(cartItemKey("p1", undefined, [], "MONTHLY"), 1);
    expect(cartTotal([item])).toBe(8000 + 7200);
  });
});

describe("subscriptionChoiceHtml", () => {
  it("shows both choices, the best saving, a frequency select and the no-automatic-charge note", () => {
    const html = subscriptionChoiceHtml(item, null);
    expect(html).toContain("Compra única");
    expect(html).toContain("Suscríbete y ahorra hasta 10%");
    expect(html).toContain('name="subscriptionCadence"');
    expect(html).toContain("No se cobra automáticamente");
  });
  it("renders nothing without offers", () => {
    expect(subscriptionChoiceHtml({ ...(item as object), subscriptionOptions: [] } as never, null)).toBe("");
  });
  it("uses the same consent text as the API", () => {
    expect(subscriptionConsentText("MONTHLY")).toBe("Acepto que este pedido se repita cada mes. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.");
  });
  it("shows the conflict message inline when given one", () => {
    expect(subscriptionChoiceHtml(item, "WEEKLY", undefined, [], CADENCE_CONFLICT_MESSAGE)).toContain("Separa las frecuencias en pedidos distintos.");
    expect(subscriptionChoiceHtml(item, "WEEKLY")).not.toContain("Separa las frecuencias");
  });
});

describe("cartCadenceConflict", () => {
  const keys = [cartItemKey("p1"), cartItemKey("p2", undefined, [], "WEEKLY")];
  it("uses the API's message", () => {
    expect(CADENCE_CONFLICT_MESSAGE).toBe("Por ahora solo puedes suscribirte a una frecuencia por pedido. Separa las frecuencias en pedidos distintos.");
  });
  it("flags a different cadence than another subscription line", () => {
    expect(cartCadenceConflict(keys, "MONTHLY")).toBe(CADENCE_CONFLICT_MESSAGE);
  });
  it("allows the same cadence, one-time purchases and carts without subscriptions", () => {
    expect(cartCadenceConflict(keys, "WEEKLY")).toBeNull();
    expect(cartCadenceConflict(keys, null)).toBeNull();
    expect(cartCadenceConflict([cartItemKey("p1")], "MONTHLY")).toBeNull();
  });
});

describe("subscriptionsAvailable", () => {
  it("is true only for an enabled store in payment mode", () => {
    expect(subscriptionsAvailable({ subscriptionsEnabled: true, checkoutMode: "payment" } as never)).toBe(true);
    expect(subscriptionsAvailable({ subscriptionsEnabled: false, checkoutMode: "payment" } as never)).toBe(false);
    expect(subscriptionsAvailable({ checkoutMode: "payment" } as never)).toBe(false);
    for (const checkoutMode of ["whatsapp", "external"]) expect(subscriptionsAvailable({ subscriptionsEnabled: true, checkoutMode } as never)).toBe(false);
  });
});

describe("first-order price versus the locked price (I8)", () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const onSale = { ...(item as object), discountPercent: 30, discountStartsAt: past, discountEndsAt: future } as never;
  it("the locked unit ignores a scheduled sale, the first order does not", () => {
    expect(subscriptionRecurringAmount(onSale, undefined, [], "MONTHLY")).toBe(7200);
    expect(subscriptionUnitAmount(onSale, undefined, [], "MONTHLY")).toBe(5600);
  });
  it("adds extras at full price to both", () => {
    const extras = [{ id: "e1", name: "Molido", amount: 500 }] as never;
    expect(subscriptionRecurringAmount(item, undefined, extras, "MONTHLY")).toBe(7700);
  });
  it("prints today and later only when they differ", () => {
    expect(subscriptionPriceText(5600, 7200, "BOB", "MONTHLY")).toBe("56.00 BOB hoy, luego 72.00 BOB / cada mes");
    expect(subscriptionPriceText(7200, 7200, "BOB", "MONTHLY")).toBe("72.00 BOB / cada mes");
  });
  it("the choice fieldset shows the split during a sale and the plain price otherwise", () => {
    expect(subscriptionChoiceHtml(onSale, "MONTHLY")).toContain("56.00 BOB hoy, luego 72.00 BOB / cada mes");
    expect(subscriptionChoiceHtml(item, "MONTHLY")).not.toContain("hoy, luego");
  });
});
