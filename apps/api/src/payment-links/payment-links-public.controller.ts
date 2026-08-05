import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { PaymentLinksService } from "./payment-links.service";
import { CartCheckoutDto } from "./dto/cart-checkout.dto";

/** No auth by design — this is what a customer's browser hits after tapping a
 * shared link/QR. Mirrors CheckoutSessionController's "unauthenticated but scoped"
 * shape: the slug is the only credential, and a cart can only ever be built from that
 * same merchant's own ACTIVE links, never an arbitrary amount. */
@ApiTags("payment_links")
@Controller("v1/payment_links/public")
export class PaymentLinksPublicController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Get(":slug/store")
  getStore(@Param("slug") slug: string) {
    return this.paymentLinks.getStoreBySlug(slug);
  }

  @Post(":slug/cart-checkout")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cartCheckout(@Param("slug") slug: string, @Body() dto: CartCheckoutDto) {
    return this.paymentLinks.createCartCheckout(slug, dto);
  }
}
