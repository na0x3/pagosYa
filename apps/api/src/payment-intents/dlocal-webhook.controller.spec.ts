import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DlocalWebhookController } from "./dlocal-webhook.controller";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";

const paidBody = JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 100.58, currency: "USD", status: "PAID" });
const body = (fields: Record<string, unknown>) => JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 100.58, currency: "USD", status: "PAID", ...fields });

function setup(verify = true, binding: { railReference: string | null; status: string | null } | null = { railReference: "D-1", status: "PENDING" }) {
  const client = { verifyWebhook: jest.fn().mockReturnValue(verify) };
  const adapter = {
    toRailResult: jest.fn((p) => ({ status: p.status === "PAID" ? "succeeded" : p.status === "PENDING" ? "pending" : "failed", railReference: p.id, raw: p })),
  };
  const paymentIntents = {
    applyCallbackResult: jest.fn().mockResolvedValue({}),
    latestAuthorization: jest.fn().mockResolvedValue(binding && { merchantId: "m_1", ...binding }),
  };
  const refunds = { applyDlocalRefundNotification: jest.fn().mockResolvedValue(undefined) };
  const prisma = { supportCase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "case_1" }) } };
  const controller = new DlocalWebhookController(client as any, adapter as any, paymentIntents as any, prisma as any);
  const req = (raw: string) => ({ rawBody: Buffer.from(raw) }) as any;
  const errorLog = jest.spyOn((controller as any).logger, "error").mockImplementation(() => undefined);
  const warnLog = jest.spyOn((controller as any).logger, "warn").mockImplementation(() => undefined);
  return { controller, client, paymentIntents, refunds, prisma, req, errorLog, warnLog };
}

describe("DlocalWebhookController payments", () => {
  it("rejects an invalid signature without touching the payment", async () => {
    const { controller, paymentIntents, req } = setup(false);
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("rejects a request without raw bytes", async () => {
    const { controller } = setup();
    await expect(controller.payment({} as any, "l", "d", "sig")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("applies a paid notification with rail, amount in cents and currency expectations", async () => {
    const { controller, paymentIntents, req, client } = setup();
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(client.verifyWebhook).toHaveBeenCalledWith("l", "d", paidBody, "sig");
    expect(paymentIntents.latestAuthorization).toHaveBeenCalledWith("pi_1");
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith(
      "pi_1", expect.objectContaining({ status: "succeeded", railReference: "D-1" }), { railId: "dlocal", amount: 10058, currency: "USD" },
    );
  });

  it("acknowledges pending notifications and notifications without order_id, without a state change", async () => {
    const { controller, paymentIntents, req } = setup();
    await controller.payment(req(body({ status: "PENDING" })), "l", "d", "sig");
    await controller.payment(req(JSON.stringify({ id: "D-1", status: "PAID" })), "l", "d", "sig");
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("defensively rejects a malformed raw body if one ever reaches the handler", async () => {
    const { controller, req } = setup();
    await expect(controller.payment(req("not json"), "l", "d", "sig")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts any dLocal payment id while the attempt only has an order: placeholder", async () => {
    const { controller, paymentIntents, req } = setup(true, { railReference: "order:pi_1", status: "PENDING" });
    await controller.payment(req(body({ id: "D-9" })), "l", "d", "sig");
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_1", expect.objectContaining({ railReference: "D-9" }), expect.anything());
  });

  it("ignores a stale REJECTED for an older attempt after the shopper retried", async () => {
    const { controller, paymentIntents, prisma, req, warnLog } = setup(true, { railReference: "D-2", status: "PENDING" });
    await expect(controller.payment(req(body({ id: "D-1", status: "REJECTED" })), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalled();
  });

  it("ignores a repeated REJECTED for an attempt that already failed, since a retry may be in flight", async () => {
    const { controller, paymentIntents, req } = setup(true, { railReference: "D-1", status: "FAILED" });
    await expect(controller.payment(req(body({ status: "REJECTED" })), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("opens a support case when PAID arrives for an unknown dLocal payment id", async () => {
    const { controller, paymentIntents, prisma, req, errorLog } = setup(true, { railReference: "D-2", status: "PENDING" });
    await expect(controller.payment(req(body({ id: "D-1" })), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/pi_1[\s\S]*D-1|D-1[\s\S]*pi_1/));
    expect(prisma.supportCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantId: "m_1", category: "PAYMENTS", priority: "HIGH", summary: expect.stringMatching(/pi_1[\s\S]*D-1|D-1[\s\S]*pi_1/) }),
    });
  });

  it("opens a support case when PAID arrives after the intent was canceled, and still returns 200", async () => {
    const { controller, paymentIntents, prisma, req, errorLog } = setup();
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new IllegalStateTransitionError("CANCELED" as any, "RAIL_CALLBACK_SUCCEEDED" as any));
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(errorLog).toHaveBeenCalled();
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });

  it("opens a support case (not a 400) when a PAID notification's amount does not match", async () => {
    const { controller, paymentIntents, prisma, req } = setup();
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new BadRequestException("Callback amount does not match PaymentIntent"));
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });

  it("does not open a second case while one for the same dLocal payment is still open", async () => {
    const { controller, paymentIntents, prisma, req } = setup();
    prisma.supportCase.findFirst.mockResolvedValue({ id: "case_open" });
    paymentIntents.applyCallbackResult.mockRejectedValue(new IllegalStateTransitionError("CANCELED" as any, "RAIL_CALLBACK_SUCCEEDED" as any));
    await controller.payment(req(paidBody), "l", "d", "sig");
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
  });

  it("logs a PAID notification for an unknown intent at error level without a case (no merchant to attach it to)", async () => {
    const { controller, paymentIntents, prisma, req, errorLog } = setup(true, null);
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("D-1"));
  });

  it("keeps acknowledging failed notifications for impossible transitions, and still rejects a mismatched failed one", async () => {
    const { controller, paymentIntents, prisma, req } = setup();
    const rejected = body({ status: "REJECTED" });
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new NotFoundException());
    await expect(controller.payment(req(rejected), "l", "d", "sig")).resolves.toEqual({ received: true });
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new IllegalStateTransitionError("SUCCEEDED" as any, "RAIL_CALLBACK_FAILED" as any));
    await expect(controller.payment(req(rejected), "l", "d", "sig")).resolves.toEqual({ received: true });
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new BadRequestException("Callback amount does not match PaymentIntent"));
    await expect(controller.payment(req(rejected), "l", "d", "sig")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
  });
});
