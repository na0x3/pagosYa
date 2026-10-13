import { BadRequestException } from "@nestjs/common";
import { PaymentIntentsController } from "./payment-intents.controller";

function setup(documents: unknown = null, retention?: unknown) {
  const paymentIntents = { confirm: jest.fn().mockResolvedValue({ paymentIntent: {}, railResult: {} }) };
  const terms = { resolveBuyerDocuments: jest.fn().mockResolvedValue(documents) };
  return { paymentIntents, terms, controller: new PaymentIntentsController(paymentIntents as any, terms as any, retention as any) };
}

const dto = { paymentMethod: { type: "QR", token: "tok_qr" } };

describe("PaymentIntentsController.confirm", () => {
  it("resolves the buyer terms and hands them to the service with the request's ip and user agent", async () => {
    const { controller, paymentIntents, terms } = setup({ termsDocumentId: "t1", privacyDocumentId: null });
    const body = { ...dto, buyerTermsVersion: "v1" };

    await controller.confirm("pi_1", body as any, { ip: "2.2.2.2", headers: { "user-agent": "UA" } });

    expect(terms.resolveBuyerDocuments).toHaveBeenCalledWith({ terms: "v1", privacy: undefined });
    expect(paymentIntents.confirm).toHaveBeenCalledWith("pi_1", body, {
      termsDocumentId: "t1",
      privacyDocumentId: null,
      ipAddress: "2.2.2.2",
      userAgent: "UA",
    });
  });

  it("confirms without a record when no version was sent", async () => {
    const { controller, paymentIntents } = setup(null);

    await controller.confirm("pi_1", dto as any, { headers: {} });

    expect(paymentIntents.confirm).toHaveBeenCalledWith("pi_1", dto, undefined);
  });

  it("never reaches the service with a stale version", async () => {
    const { controller, paymentIntents, terms } = setup();
    terms.resolveBuyerDocuments.mockRejectedValue(new BadRequestException("stale"));

    await expect(controller.confirm("pi_1", { ...dto, buyerTermsVersion: "old" } as any, { headers: {} })).rejects.toThrow(BadRequestException);
    expect(paymentIntents.confirm).not.toHaveBeenCalled();
  });
});

describe("PaymentIntentsController.confirm with «Avísame»", () => {
  const ticked = { ...dto, reminderConsent: true };

  it("saves the reminder cart after a confirm that did not pay, and only when the shopper ticked it", async () => {
    const retention = { saveCartFromPayment: jest.fn().mockResolvedValue({ saved: true }) };
    const { controller, paymentIntents } = setup(null, retention);
    paymentIntents.confirm.mockResolvedValue({ paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION" }, railResult: {} });
    await controller.confirm("pi_1", dto as any, { headers: {} });
    expect(retention.saveCartFromPayment).not.toHaveBeenCalled();
    await controller.confirm("pi_1", ticked as any, { headers: {} });
    expect(retention.saveCartFromPayment).toHaveBeenCalledWith("pi_1");
    paymentIntents.confirm.mockResolvedValue({ paymentIntent: { id: "pi_1", status: "SUCCEEDED" }, railResult: {} });
    await controller.confirm("pi_1", ticked as any, { headers: {} });
    expect(retention.saveCartFromPayment).toHaveBeenCalledTimes(1);
  });

  it("answers with the payment even when saving the reminder fails", async () => {
    const retention = { saveCartFromPayment: jest.fn().mockRejectedValue(new Error("db down")) };
    const { controller, paymentIntents } = setup(null, retention);
    const outcome = { paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION" }, railResult: { status: "requires_action" } };
    paymentIntents.confirm.mockResolvedValue(outcome);
    await expect(controller.confirm("pi_1", ticked as any, { headers: {} })).resolves.toBe(outcome);
  });
});
