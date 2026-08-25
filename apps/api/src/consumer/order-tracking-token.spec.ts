import { createOrderTrackingToken, readOrderTrackingToken } from "./order-tracking-token";

describe("order tracking tokens", () => {
  const secret = "test-order-tracking-secret-with-at-least-32-characters";
  const orderId = "cmt3sw7rs000h45900a1woug3";

  it("round-trips a signed order id", () => {
    expect(readOrderTrackingToken(createOrderTrackingToken(orderId, secret), secret)).toBe(orderId);
  });

  it("rejects tampered and differently-signed tokens", () => {
    const token = createOrderTrackingToken(orderId, secret);
    expect(readOrderTrackingToken(`${token}x`, secret)).toBeNull();
    expect(readOrderTrackingToken(token, "another-secret-with-at-least-32-characters")).toBeNull();
  });
});
