import { BadRequestException, Controller, Headers, HttpCode, Logger, NotFoundException, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { DlocalClientService } from "../rails/adapters/dlocal/dlocal-client.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import type { DlocalPayment } from "../rails/adapters/dlocal/dlocal.types";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";
import { PaymentIntentsService } from "./payment-intents.service";

/**
 * dLocal's payment notifications. The webhook is the source of truth for
 * redirect and voucher payments; the checkout return page only reads status.
 * order_id is always the PaymentIntent id we sent, so no mapping table is needed.
 */
@ApiExcludeController()
@Controller("v1/webhooks/dlocal")
export class DlocalWebhookController {
  private readonly logger = new Logger(DlocalWebhookController.name);

  constructor(
    private readonly client: DlocalClientService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  @Post("payments")
  @HttpCode(200)
  async payment(
    @Req() req: { rawBody?: Buffer },
    @Headers("x-login") login: string | undefined,
    @Headers("x-date") xDate: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const raw = req.rawBody?.toString("utf8");
    if (!raw || !this.client.verifyWebhook(login, xDate, raw, authorization)) {
      throw new UnauthorizedException("Invalid dLocal signature");
    }

    let payment: DlocalPayment;
    try {
      payment = JSON.parse(raw) as DlocalPayment;
    } catch {
      throw new BadRequestException("Malformed dLocal notification");
    }
    if (!payment.order_id) {
      this.logger.warn(`dLocal notification ${payment.id} has no order_id; ignoring`);
      return { received: true };
    }

    const result = this.adapter.toRailResult(payment);
    if (result.status === "pending" || result.status === "requires_action") return { received: true };

    try {
      await this.paymentIntents.applyCallbackResult(payment.order_id, result, {
        railId: "dlocal",
        // amount/currency here are assumed to echo the requested USD values, not the
        // shopper's local currency; this is UNVERIFIED against dLocal's sandbox — see
        // the "Webhook amount/currency echo" entry in ../rails/adapters/dlocal/fixtures/README.md.
        amount: Math.round(Number(payment.amount) * 100),
        currency: payment.currency,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof IllegalStateTransitionError) {
        this.logger.warn(`dLocal notification ${payment.id} for ${payment.order_id} not applied: ${(error as Error).message}`);
        return { received: true };
      }
      // A BadRequestException (amount/currency mismatch) means a tampered or mismatched
      // notification; surface it as a 400 instead of acknowledging it. dLocal retrying is fine.
      throw error;
    }
    return { received: true };
  }
}
