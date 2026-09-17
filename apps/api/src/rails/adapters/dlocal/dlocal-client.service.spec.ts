import { DlocalClientService, refundNotificationUrl } from "./dlocal-client.service";
import { signDlocal } from "./dlocal-signature";
import { DlocalApiError } from "./dlocal.types";

function makeClient(overrides: Record<string, unknown> = {}) {
  const cfg = {
    enabled: false, baseUrl: "https://sandbox.dlocal.com", login: "l", transKey: "t", secretKey: "s",
    smartFieldsKey: "", notificationUrl: "https://api.test/v1/webhooks/dlocal/payments", returnUrl: "https://checkout.test/",
    bobPerUsd: 6.96, intlFeeBps: 590, costBps: 0, timeoutMs: 50, ...overrides,
  };
  const config = { get: jest.fn().mockReturnValue(cfg) };
  return new DlocalClientService(config as any);
}

const basePayment = {
  orderId: "pi_1", amountCents: 10058, currency: "USD" as const, country: "BR", flow: "REDIRECT" as const,
  payer: { name: "Ana", email: "ana@example.com", document: "12345678909" }, callbackUrl: "https://checkout.test/?intl_return=1&pi=pi_1",
};

describe("DlocalClientService (fixture mode)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns a pending redirect for local methods, echoing order and amount", async () => {
    const payment = await makeClient().createPayment({ ...basePayment, paymentMethodId: "PX" });
    expect(payment).toMatchObject({ status: "PENDING", order_id: "pi_1", amount: 100.58, currency: "USD" });
    expect(payment.redirect_url).toContain("intl_return=1");
  });

  it("returns fixture methods for a country", async () => {
    const methods = await makeClient().listPaymentMethods("BR");
    expect(methods.map((m) => m.id)).toEqual(["CARD", "PX"]);
  });

  it("never verifies webhooks in fixture mode", () => {
    expect(makeClient().verifyWebhook("l", "d", "{}", "V2-HMAC-SHA256, Signature: 00")).toBe(false);
  });
});

describe("DlocalClientService (http mode)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends signed headers and a decimal amount", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "D-1", status: "PENDING", amount: 100.58, currency: "USD" }), { status: 200 }),
    );
    await makeClient({ enabled: true }).createPayment({ ...basePayment, paymentMethodId: "PX" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.dlocal.com/payments");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Login"]).toBe("l");
    expect(headers["X-Trans-Key"]).toBe("t");
    expect(headers.Authorization).toMatch(/^V2-HMAC-SHA256, Signature: [0-9a-f]{64}$/);
    expect(headers["User-Agent"]).toBe("pagosYa/1.0");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      amount: 100.58, currency: "USD", country: "BR", payment_method_id: "PX", payment_method_flow: "REDIRECT",
      order_id: "pi_1", notification_url: "https://api.test/v1/webhooks/dlocal/payments",
    });
  });

  it("sends refunds with an idempotency id and the refunds notification URL", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "R-1", status: "PENDING" }), { status: 200 }),
    );
    await makeClient({ enabled: true }).refund("D-1", 5000, "USD", "refund_abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.dlocal.com/refunds");
    expect(JSON.parse(init.body as string)).toEqual({
      payment_id: "D-1", amount: 50, currency: "USD", order_refund_id: "refund_abc",
      notification_url: "https://api.test/v1/webhooks/dlocal/refunds",
    });
  });

  it("derives the refunds notification URL from the payments one", () => {
    expect(refundNotificationUrl("https://api.pagosya.bo/v1/webhooks/dlocal/payments")).toBe("https://api.pagosya.bo/v1/webhooks/dlocal/refunds");
    expect(refundNotificationUrl("https://api.pagosya.bo/v1/webhooks/dlocal/payments/")).toBe("https://api.pagosya.bo/v1/webhooks/dlocal/refunds");
    expect(refundNotificationUrl("https://api.pagosya.bo/hooks/dlocal")).toBe("https://api.pagosya.bo/hooks/dlocal/refunds");
  });

  it("marks 5xx as retryable and 4xx as final", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: true, httpStatus: 503 });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid country" }), { status: 400 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: false, httpStatus: 400, message: "Invalid country" });
  });

  it("keeps the real HTTP status when an error response isn't JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: true, httpStatus: 502 });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("<html>403 Forbidden</html>", { status: 403 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: false, httpStatus: 403 });
  });

  it("treats a timeout as retryable", async () => {
    jest.spyOn(global, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const error = await makeClient({ enabled: true, timeoutMs: 10 }).getPayment("D-1").catch((e) => e);
    expect(error).toBeInstanceOf(DlocalApiError);
    expect(error.retryable).toBe(true);
  });

  it("rejects a webhook whose signature matches a different login than the config's", () => {
    const xDate = "2026-09-17T12:00:00.000Z";
    const body = "{}";
    const client = makeClient({ enabled: true });

    const signedAsOther = `V2-HMAC-SHA256, Signature: ${signDlocal("s", "other", xDate, body)}`;
    expect(client.verifyWebhook("other", xDate, body, signedAsOther, new Date("2026-09-17T12:01:00.000Z"))).toBe(false);

    const signedAsConfigLogin = `V2-HMAC-SHA256, Signature: ${signDlocal("s", "l", xDate, body)}`;
    expect(client.verifyWebhook("l", xDate, body, signedAsConfigLogin, new Date("2026-09-17T12:01:00.000Z"))).toBe(true);
  });

  it("rejects a correctly signed webhook whose X-Date is outside the 5-minute replay window", () => {
    const body = "{}";
    const client = makeClient({ enabled: true });
    const now = new Date("2026-09-17T12:00:00.000Z");
    const signed = (xDate: string) => `V2-HMAC-SHA256, Signature: ${signDlocal("s", "l", xDate, body)}`;

    expect(client.verifyWebhook("l", "2026-09-17T11:55:00.000Z", body, signed("2026-09-17T11:55:00.000Z"), now)).toBe(true);
    expect(client.verifyWebhook("l", "2026-09-17T12:05:00.000Z", body, signed("2026-09-17T12:05:00.000Z"), now)).toBe(true);
    expect(client.verifyWebhook("l", "2026-09-17T11:54:59.000Z", body, signed("2026-09-17T11:54:59.000Z"), now)).toBe(false);
    expect(client.verifyWebhook("l", "2026-09-17T12:05:01.000Z", body, signed("2026-09-17T12:05:01.000Z"), now)).toBe(false);
    expect(client.verifyWebhook("l", "yesterday", body, signed("yesterday"), now)).toBe(false);
  });
});
