import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { createSubscriptionManageToken, readSubscriptionManageToken, subscriptionManageUrl } from "./subscription-manage-token";

describe("subscription manage token", () => {
  const id = "cm1abcdefghijklmnopqrstu";
  it("round-trips", () => {
    expect(readSubscriptionManageToken(createSubscriptionManageToken(id, "s"), "s")).toBe(id);
  });
  it("rejects another secret, tampering, garbage and an order-tracking token for the same id", () => {
    const token = createSubscriptionManageToken(id, "s");
    expect(readSubscriptionManageToken(token, "other")).toBeNull();
    expect(readSubscriptionManageToken(`${token.split(".")[0]}.AAAA`, "s")).toBeNull();
    expect(readSubscriptionManageToken(createOrderTrackingToken(id, "s"), "s")).toBeNull();
    expect(readSubscriptionManageToken("garbage", "s")).toBeNull();
  });
  it("builds the public URL", () => {
    expect(subscriptionManageUrl("https://pagar.pagosya.bo/", id, "s")).toMatch(/^https:\/\/pagar\.pagosya\.bo\/suscripcion\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
