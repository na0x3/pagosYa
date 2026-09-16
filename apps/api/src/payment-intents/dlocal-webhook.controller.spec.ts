import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DlocalWebhookController } from "./dlocal-webhook.controller";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";

const paidBody = JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 100.58, currency: "USD", status: "PAID" });

function setup(verify = true) {
  const client = { verifyWebhook: jest.fn().mockReturnValue(verify) };
  const adapter = {
    toRailResult: jest.fn((p) => ({ status: p.status === "PAID" ? "succeeded" : p.status === "PENDING" ? "pending" : "failed", railReference: p.id, raw: p })),
  };
  const paymentIntents = { applyCallbackResult: jest.fn().mockResolvedValue({}) };
  const controller = new DlocalWebhookController(client as any, adapter as any, paymentIntents as any);
  const req = (body: string) => ({ rawBody: Buffer.from(body) }) as any;
  return { controller, client, paymentIntents, req };
}

describe("DlocalWebhookController", () => {
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
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith(
      "pi_1", expect.objectContaining({ status: "succeeded", railReference: "D-1" }), { railId: "dlocal", amount: 10058, currency: "USD" },
    );
  });

  it("acknowledges pending notifications and notifications without order_id, without a state change", async () => {
    const { controller, paymentIntents, req } = setup();
    await controller.payment(req(JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 1, currency: "USD", status: "PENDING" })), "l", "d", "sig");
    await controller.payment(req(JSON.stringify({ id: "D-1", status: "PAID" })), "l", "d", "sig");
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("defensively rejects a malformed raw body if one ever reaches the handler", async () => {
    const { controller, req } = setup();
    await expect(controller.payment(req("not json"), "l", "d", "sig")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("acknowledges unknown intents and impossible transitions so dLocal stops retrying", async () => {
    const { controller, paymentIntents, req } = setup();
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new NotFoundException());
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new IllegalStateTransitionError("SUCCEEDED" as any, "RAIL_CALLBACK_FAILED" as any));
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
  });
});
