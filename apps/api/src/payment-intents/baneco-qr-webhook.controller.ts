import { Body, CanActivate, Controller, ExecutionContext, HttpCode, Injectable, NotFoundException, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
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
/** ISO security test 2026-11-07: the shared secret is checked in a guard, before the body is validated, so a caller without it
 *  gets 401 — not a 400 that lists the expected fields — and costs no validation work. */
@Injectable()
export class BanecoWebhookSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest().headers["x-baneco-webhook-secret"];
    const secret = Array.isArray(header) ? header[0] : header;
    const expected = this.config.get<string>("app.banecoQr.webhookSecret");
    const presentedBuf = Buffer.from(typeof secret === "string" ? secret : "");
    const expectedBuf = Buffer.from(expected ?? "");
    if (!expected || presentedBuf.length !== expectedBuf.length || !timingSafeEqual(presentedBuf, expectedBuf)) {
      throw new UnauthorizedException("Invalid webhook secret");
    }
    return true;
  }
}

@Controller("v1/webhooks/baneco")
@UseGuards(BanecoWebhookSecretGuard)
export class BanecoQrWebhookController {
  constructor(private readonly paymentIntents: PaymentIntentsService) {}

  @Post("qr")
  @HttpCode(200)
  async notifyPaymentQr(@Body() dto: BanecoQrWebhookDto) {
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
