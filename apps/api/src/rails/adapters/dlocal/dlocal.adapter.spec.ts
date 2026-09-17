import { PaymentMethodType } from "@prisma/client";
import { DlocalAdapter } from "./dlocal.adapter";
import { DlocalApiError } from "./dlocal.types";

function makeAdapter(client: Record<string, jest.Mock> = {}) {
  const config = { get: jest.fn().mockReturnValue({ returnUrl: "https://checkout.test/" }) };
  return new DlocalAdapter(client as any, config as any);
}

const request = {
  paymentIntentId: "pi_1", amount: 10058, currency: "USD", idempotencyKey: "confirm_pi_1", country: "BR",
  payer: { name: "Ana", email: "ana@example.com", document: "12345678909" },
  paymentMethod: { type: PaymentMethodType.LOCAL_METHOD, token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } },
};

describe("DlocalAdapter.toRailResult", () => {
  const adapter = makeAdapter();
  it.each([
    [{ status: "PAID" }, "succeeded"],
    [{ status: "AUTHORIZED" }, "succeeded"],
    [{ status: "PENDING", redirect_url: "https://x" }, "requires_action"],
    [{ status: "PENDING" }, "pending"],
    [{ status: "REJECTED", status_detail: "Insufficient funds" }, "failed"],
    [{ status: "CANCELLED" }, "failed"],
    [{ status: "EXPIRED" }, "failed"],
  ])("maps %o to %s", (partial, expected) => {
    const result = adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", ...partial } as any);
    expect(result.status).toBe(expected);
    expect(result.railReference).toBe("D-1");
  });

  it("carries the redirect URL and the decline reason", () => {
    expect(adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", status: "PENDING", redirect_url: "https://pay" } as any).actionRequired)
      .toEqual({ type: "redirect", data: { redirectUrl: "https://pay" } });
    expect(adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", status: "REJECTED", status_detail: "Insufficient funds" } as any).failureReason)
      .toBe("Insufficient funds");
  });
});

describe("DlocalAdapter.authorize", () => {
  it("creates a REDIRECT payment with the method id, country, payer and a return URL without secrets", async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: "D-1", amount: 100.58, currency: "USD", status: "PENDING", redirect_url: "https://pay" });
    const result = await makeAdapter({ createPayment }).authorize(request);

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "pi_1", amountCents: 10058, currency: "USD", country: "BR", paymentMethodId: "PX", flow: "REDIRECT",
      payer: request.payer, callbackUrl: "https://checkout.test/?intl_return=1&pi=pi_1",
    }));
    expect(result.status).toBe("requires_action");
  });

  it("charges a Smart Fields token with the DIRECT flow", async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: "D-9", amount: 100.58, currency: "USD", status: "PAID" });
    const result = await makeAdapter({ createPayment }).authorize({
      ...request,
      paymentMethod: { type: PaymentMethodType.CARD, token: "dlsf_CV-abc", metadata: { dlocalPaymentMethodId: "CARD" } },
    });
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ flow: "DIRECT", cardToken: "CV-abc" }));
    expect(result.status).toBe("succeeded");
  });

  it("fails without calling dLocal for non-USD, missing country, or missing method id", async () => {
    const createPayment = jest.fn();
    const adapter = makeAdapter({ createPayment });
    await expect(adapter.authorize({ ...request, currency: "BOB" })).resolves.toMatchObject({ status: "failed" });
    await expect(adapter.authorize({ ...request, country: undefined })).resolves.toMatchObject({ status: "failed" });
    await expect(adapter.authorize({ ...request, paymentMethod: { ...request.paymentMethod, metadata: {} } })).resolves.toMatchObject({ status: "failed" });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("returns pending keyed by order when dLocal's outcome is unknown", async () => {
    const createPayment = jest.fn().mockRejectedValue(new DlocalApiError("timed out", 0, true));
    await expect(makeAdapter({ createPayment }).authorize(request)).resolves.toMatchObject({ status: "pending", railReference: "order:pi_1" });
  });

  it("fails on a final dLocal error", async () => {
    const createPayment = jest.fn().mockRejectedValue(new DlocalApiError("Invalid document", 400, false));
    await expect(makeAdapter({ createPayment }).authorize(request)).resolves.toMatchObject({ status: "failed", failureReason: "Invalid document" });
  });
});

describe("DlocalAdapter.refund", () => {
  it("returns pending keyed by refund when dLocal's outcome is unknown", async () => {
    const refund = jest.fn().mockRejectedValue(new DlocalApiError("timed out", 0, true));
    const result = await makeAdapter({ refund }).refund({ railReference: "D-1", amount: 100, idempotencyKey: "refund_1" });
    expect(result).toMatchObject({ status: "pending", railReference: "refund:D-1" });
  });

  it("fails on a final dLocal error", async () => {
    const refund = jest.fn().mockRejectedValue(new DlocalApiError("Refund not allowed", 400, false));
    const result = await makeAdapter({ refund }).refund({ railReference: "D-1", amount: 100, idempotencyKey: "refund_1" });
    expect(result).toMatchObject({ status: "failed", failureReason: "Refund not allowed" });
  });

  it("passes the idempotency key through and maps dLocal's refund statuses", async () => {
    const refund = jest.fn()
      .mockResolvedValueOnce({ id: "R-1", status: "PENDING" })
      .mockResolvedValueOnce({ id: "R-2", status: "SUCCESS" })
      .mockResolvedValueOnce({ id: "R-3", status: "REJECTED" });
    const adapter = makeAdapter({ refund });
    await expect(adapter.refund({ railReference: "D-1", amount: 100, idempotencyKey: "refund_1" })).resolves.toMatchObject({ status: "pending", railReference: "R-1" });
    await expect(adapter.refund({ railReference: "D-1", amount: 100, idempotencyKey: "refund_2" })).resolves.toMatchObject({ status: "succeeded", railReference: "R-2" });
    await expect(adapter.refund({ railReference: "D-1", amount: 100, idempotencyKey: "refund_3" })).resolves.toMatchObject({ status: "failed", railReference: "R-3" });
    expect(refund).toHaveBeenCalledWith("D-1", 100, "USD", "refund_1");
  });
});
