import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PaymentIntent } from "@prisma/client";
import { ClientSecretGuard } from "../auth/guards/client-secret.guard";
import { PublishableApiKeyGuard } from "../auth/guards/publishable-api-key.guard";
import { PaymentIntentsService } from "./payment-intents.service";
import { CheckoutSessionDto, WidgetSessionDto } from "./dto/checkout-session.dto";

/**
 * Unauthenticated-but-secret-bearing: the checkout iframe has no API key,
 * only the client_secret, which is itself the scoped credential for this
 * one PaymentIntent. Returns only what the checkout UI needs to render.
 */
@ApiTags("checkout")
@Controller("v1/checkout")
export class CheckoutSessionController {
  constructor(private readonly paymentIntents: PaymentIntentsService) {}

  @Post("session")
  @HttpCode(200)
  async getSession(@Body() dto: CheckoutSessionDto) {
    const intent = await this.paymentIntents.findByClientSecret(dto.clientSecret);
    return this.sessionResponse(intent);
  }

  /** Embedded widgets additionally prove their browser-safe key belongs to the same merchant and mode. */
  @Post("widget_session")
  @HttpCode(200)
  @UseGuards(PublishableApiKeyGuard)
  getWidgetSession(
    @Body() _dto: WidgetSessionDto,
    @Req() req: { paymentIntent: PaymentIntent & { merchant: { name: string } } },
  ) {
    return this.sessionResponse(req.paymentIntent);
  }

  private async sessionResponse(intent: PaymentIntent & { merchant: { name: string } }) {
    return {
      id: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      description: intent.description,
      merchantName: intent.merchant.name,
      metadata: intent.metadata,
      recipient: await this.paymentIntents.checkoutRecipient(intent),
      trackingToken: await this.paymentIntents.trackingTokenForPaymentIntent(intent.id),
    };
  }

  /**
   * Lets the customer back out of an in-progress checkout. Guarded by the
   * client_secret rather than a merchant credential — the same scoping the
   * confirm endpoint uses — and only ever moves REQUIRES_PAYMENT_METHOD /
   * REQUIRES_CONFIRMATION to CANCELED (see the state machine); anything
   * already PROCESSING or beyond rejects via IllegalStateTransitionError.
   */
  @Post("session/cancel")
  @UseGuards(ClientSecretGuard)
  async cancelSession(@Req() req: { paymentIntent: PaymentIntent }) {
    const intent = await this.paymentIntents.cancelById(req.paymentIntent.id);
    return { id: intent.id, status: intent.status };
  }
}
