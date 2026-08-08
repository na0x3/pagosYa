import { Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PaymentIntent } from "@prisma/client";
import { ClientSecretGuard } from "../auth/guards/client-secret.guard";
import { PaymentIntentsService } from "./payment-intents.service";

/**
 * Unauthenticated-but-secret-bearing: the checkout iframe has no API key,
 * only the client_secret, which is itself the scoped credential for this
 * one PaymentIntent. Returns only what the checkout UI needs to render.
 */
@ApiTags("checkout")
@Controller("v1/checkout")
export class CheckoutSessionController {
  constructor(private readonly paymentIntents: PaymentIntentsService) {}

  @Get("session")
  async getSession(@Query("client_secret") clientSecret: string) {
    const intent = await this.paymentIntents.findByClientSecret(clientSecret);
    return {
      id: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      description: intent.description,
      merchantName: intent.merchant.name,
      metadata: intent.metadata,
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
