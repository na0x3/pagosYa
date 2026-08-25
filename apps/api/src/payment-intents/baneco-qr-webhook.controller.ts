import { Body, Controller, Headers, HttpCode, NotFoundException, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { PaymentIntentsService } from "./payment-intents.service";
import { BanecoQrWebhookDto } from "./dto/baneco-qr-webhook.dto";

/**
 * Inbound notifyPaymentQR (§7.5) from Banco Económico — this is *them*
 * calling *us*, so it can't use InternalSecretGuard (Baneco doesn't have
 * that secret). The manual doesn't document a signature scheme for this
 * endpoint, so a dedicated header secret (BANECO_WEBHOOK_SECRET) is the
 * interim defense until Baneco confirms one (IP allowlist, HMAC, etc.).
 *
 * `payment.transactionId` is always the PaymentIntent id we sent as
 * `transactionId` in generateQR, so no side table is needed to map back.
 */
@Controller("v1/webhooks/baneco")
export class BanecoQrWebhookController {
  constructor(
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  @Post("qr")
  @HttpCode(200)
  async notifyPaymentQr(@Headers("x-baneco-webhook-secret") secret: string | undefined, @Body() dto: BanecoQrWebhookDto) {
    const expected = this.config.get<string>("app.banecoQr.webhookSecret");
    const presentedBuf = Buffer.from(secret ?? "");
    const expectedBuf = Buffer.from(expected ?? "");
    if (!expected || presentedBuf.length !== expectedBuf.length || !timingSafeEqual(presentedBuf, expectedBuf)) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    const { payment } = dto;
    try {
      await this.paymentIntents.applyCallbackResult(payment.transactionId, {
        status: "succeeded",
        railReference: payment.qrId,
        raw: { ...payment },
      }, {
        railId: "baneco_qr",
        amount: Math.round(payment.amount * 100),
        currency: payment.currency,
      });
    } catch (err) {
      if (err instanceof NotFoundException) {
        // Baneco retries notifications; a PaymentIntent we don't recognize (wrong env,
        // stale data) shouldn't come back as a 5xx and trigger endless retries.
        return { responseCode: 0, message: "" };
      }
      throw err;
    }
    return { responseCode: 0, message: "" };
  }
}
