import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { StoresService } from "./stores.service";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";

/** No auth by design — this is what a customer's browser hits after tapping a
 * shared store link/QR. Mirrors CheckoutSessionController's "unauthenticated but
 * scoped" shape: the slug is the only credential, and a cart can only ever be
 * built from that same store's own ACTIVE products, never an arbitrary amount. */
@ApiTags("stores")
@Controller("v1/stores/public")
export class StoresPublicController {
  constructor(private readonly stores: StoresService) {}

  @Get(":slug/store")
  getStore(@Param("slug") slug: string, @Query("preview") preview?: string) {
    return this.stores.getStorePublic(slug, { trackView: preview !== "1" });
  }

  @Post(":slug/cart-checkout")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cartCheckout(@Param("slug") slug: string, @Body() dto: CartCheckoutDto) {
    return this.stores.createCartCheckout(slug, dto);
  }
}
