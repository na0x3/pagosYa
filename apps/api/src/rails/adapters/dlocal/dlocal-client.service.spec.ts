import { DlocalClientService } from "./dlocal-client.service";
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

  it("marks 5xx as retryable and 4xx as final", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: true, httpStatus: 503 });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid country" }), { status: 400 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: false, httpStatus: 400, message: "Invalid country" });
  });

  it("treats a timeout as retryable", async () => {
    jest.spyOn(global, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const error = await makeClient({ enabled: true, timeoutMs: 10 }).getPayment("D-1").catch((e) => e);
    expect(error).toBeInstanceOf(DlocalApiError);
    expect(error.retryable).toBe(true);
  });
});
