import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PaymentLinksService } from "./payment-links.service";

@ApiTags("payment_links")
@Controller("v1/stores/public/:slug/payment_links")
export class ProductSubscriptionsPublicController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Get(":id/subscriptions")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Param("slug") slug: string, @Param("id") id: string) {
    return this.paymentLinks.listPublicSubscriptions(slug, id);
  }
}
