import { BadRequestException, Controller, Headers, HttpCode, Logger, NotFoundException, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { TransactionStatus } from "@prisma/client";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { PrismaService } from "../prisma/prisma.service";
import { DlocalClientService } from "../rails/adapters/dlocal/dlocal-client.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import type { DlocalPayment, DlocalRefundNotification } from "../rails/adapters/dlocal/dlocal.types";
import { RefundsService } from "../refunds/refunds.service";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";
import { PaymentIntentsService } from "./payment-intents.service";

/**
 * dLocal's payment notifications. The webhook is the source of truth for
 * redirect and voucher payments; the checkout return page only reads status.
 * order_id is always the PaymentIntent id we sent, so no mapping table is needed.
 *
 * A notification is bound to the intent's latest authorization attempt: one for
 * an older attempt must not fail a retry in progress, and a PAID we cannot apply
 * means money moved without a matching record, so it goes to ops instead of
 * being silently dropped.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller("v1/webhooks/dlocal")
export class DlocalWebhookController {
  private readonly logger = new Logger(DlocalWebhookController.name);

  constructor(
    private readonly client: DlocalClientService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
  ) {}

  /**
   * dLocal's refund notifications (sent to the notification_url DlocalClientService.refund
   * derives). Same signature and X-Date checks as payments; matching and settlement live
   * in RefundsService so the ledger posting is shared with synchronous refunds.
   */
  @Post("refunds")
  @HttpCode(200)
  async refund(
    @Req() req: { rawBody?: Buffer },
    @Headers("x-login") login: string | undefined,
    @Headers("x-date") xDate: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const notification = this.verifiedBody<DlocalRefundNotification>(req, login, xDate, authorization);
    await this.refunds.applyDlocalRefundNotification(notification);
    return { received: true };
  }

  @Post("payments")
  @HttpCode(200)
  async payment(
    @Req() req: { rawBody?: Buffer },
    @Headers("x-login") login: string | undefined,
    @Headers("x-date") xDate: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const payment = this.verifiedBody<DlocalPayment>(req, login, xDate, authorization);
    if (!payment.order_id) {
      this.logger.warn(`dLocal notification ${payment.id} has no order_id; ignoring`);
      return { received: true };
    }
    const intentId = payment.order_id;

    const result = this.adapter.toRailResult(payment);
    if (result.status === "pending" || result.status === "requires_action") return { received: true };
    const succeeded = result.status === "succeeded";

    const attempt = await this.paymentIntents.latestAuthorization(intentId);
    if (!attempt) {
      if (succeeded) {
        this.logger.error(`dLocal reports payment ${payment.id} PAID for unknown PaymentIntent ${intentId}; no merchant to open a support case for, needs manual review`);
      } else {
        this.logger.warn(`dLocal notification ${payment.id} for unknown PaymentIntent ${intentId}; ignoring`);
      }
      return { received: true };
    }

    const reference = attempt.railReference;
    const placeholder = !reference || reference === `order:${intentId}`;
    if (!placeholder && reference !== payment.id) {
      if (succeeded) {
        await this.escalatePaid(attempt.merchantId, intentId, payment.id, `no coincide con el intento actual (${reference})`);
      } else {
        this.logger.warn(`dLocal notification ${payment.id} (${payment.status}) for ${intentId} belongs to an older attempt (current ${reference}); ignoring`);
      }
      return { received: true };
    }
    if (!succeeded && attempt.status === TransactionStatus.FAILED) {
      // Already recorded as failed; the intent may have been retried since, and
      // re-applying the failure would fail the new attempt.
      this.logger.warn(`dLocal notification ${payment.id} (${payment.status}) for ${intentId} repeats a recorded failure; ignoring`);
      return { received: true };
    }

    try {
      await this.paymentIntents.applyCallbackResult(intentId, result, {
        railId: "dlocal",
        // amount/currency here are assumed to echo the requested USD values, not the
        // shopper's local currency; this is UNVERIFIED against dLocal's sandbox — see
        // the "Webhook amount/currency echo" entry in ../rails/adapters/dlocal/fixtures/README.md.
        amount: Math.round(Number(payment.amount) * 100),
        currency: payment.currency,
      });
    } catch (error) {
      const known = error instanceof NotFoundException || error instanceof IllegalStateTransitionError || error instanceof BadRequestException;
      if (succeeded && known) {
        await this.escalatePaid(attempt.merchantId, intentId, payment.id, (error as Error).message);
        return { received: true };
      }
      if (error instanceof NotFoundException || error instanceof IllegalStateTransitionError) {
        this.logger.warn(`dLocal notification ${payment.id} for ${intentId} not applied: ${(error as Error).message}`);
        return { received: true };
      }
      // A BadRequestException (amount/currency mismatch) on a failed notification means a
      // tampered or mismatched notification; surface it as a 400. dLocal retrying is fine.
      throw error;
    }
    return { received: true };
  }

  private verifiedBody<T>(req: { rawBody?: Buffer }, login: string | undefined, xDate: string | undefined, authorization: string | undefined): T {
    const raw = req.rawBody?.toString("utf8");
    if (!raw || !this.client.verifyWebhook(login, xDate, raw, authorization)) {
      throw new UnauthorizedException("Invalid dLocal signature");
    }
    // body-parser's json() middleware (see main.ts) already parses this same raw body with
    // safeJsonReviver and rejects malformed JSON with its own 400 before this handler runs.
    // This guard only protects direct callers (e.g. tests) that bypass that middleware.
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new BadRequestException("Malformed dLocal notification");
    }
  }

  /** dLocal gets a 200 either way so it stops retrying; ops owns the follow-up. */
  private async escalatePaid(merchantId: string, intentId: string, dlocalPaymentId: string, reason: string): Promise<void> {
    this.logger.error(`dLocal reports payment ${dlocalPaymentId} PAID for PaymentIntent ${intentId} but it could not be applied: ${reason}`);
    await openOpsCaseOnce(this.prisma, {
      merchantId,
      dedupeKey: dlocalPaymentId,
      summary: `Pago internacional dLocal ${dlocalPaymentId} del cobro ${intentId}: dLocal lo reporta como pagado pero no se pudo aplicar (${reason}). Conciliar con dLocal y reembolsar o registrar el pago.`,
    });
  }
}
