import { Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { PaymentLinksService } from "./payment-links.service";

/** No auth by design — this is what a customer's browser hits after tapping a
 * shared link/QR. Mirrors CheckoutSessionController's "unauthenticated but scoped"
 * shape: the slug is the only credential, and it can only ever create a PaymentIntent
 * for the amount fixed on the link, never an arbitrary one. */
@ApiTags("payment_links")
@Controller("v1/payment_links/public")
export class PaymentLinksPublicController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.paymentLinks.findActiveBySlugPublic(slug).then((link) => ({
      name: link.name,
      description: link.description,
      imageUrl: link.imageUrl,
      amount: link.amount,
      currency: link.currency,
      merchantName: link.merchant.name,
    }));
  }

  @Post(":slug/checkout")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@Param("slug") slug: string) {
    return this.paymentLinks.createCheckoutFromLink(slug);
  }
}
