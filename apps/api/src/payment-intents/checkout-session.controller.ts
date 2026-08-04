import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
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
    };
  }
}
