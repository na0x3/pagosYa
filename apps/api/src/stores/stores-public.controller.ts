import { RetentionService } from './retention.service';
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { StoresService } from "./stores.service";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";
import { SubmitStoreLeadDto } from "./dto/submit-store-lead.dto";
import { CustomDomainsService } from "./custom-domains.service";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { QuotePromoCodeDto } from "../promo-codes/dto/quote-promo-code.dto";
import { SubscribeStoreNewsletterDto } from "./dto/subscribe-store-newsletter.dto";

/** No auth by design — this is what a customer's browser hits after tapping a
 * shared store link/QR. Mirrors CheckoutSessionController's "unauthenticated but
 * scoped" shape: the slug is the only credential, and a cart can only ever be
 * built from that same store's own ACTIVE products, never an arbitrary amount. */
@ApiTags("stores")
@Controller("v1/stores/public")
export class StoresPublicController {
  constructor(
    private readonly retention: RetentionService,
    private readonly stores: StoresService,
    private readonly customDomains: CustomDomainsService,
    private readonly promoCodes: PromoCodesService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listPublishedStores(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.stores.listPublishedStores(search, page, pageSize);
  }

  @Get("domain")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  resolveDomain(@Query("hostname") hostname: string) {
    return this.customDomains.resolve(hostname);
  }

  @Get(":slug/store")
  getStore(@Param("slug") slug: string, @Query("preview") preview?: string) {
    return this.stores.getStorePublic(slug, { trackView: preview !== "1" });
  }

  @Post(':slug/shipping/quote')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  shippingQuote(@Param('slug') slug: string, @Body() dto: CartCheckoutDto) { return this.stores.createCartCheckout(slug, dto, true); }

  @Post(":slug/cart-checkout")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async cartCheckout(@Param("slug") slug: string, @Body() dto: CartCheckoutDto) {
    const result = await this.stores.createCartCheckout(slug, dto);
    if (dto.recoveryToken && "id" in result) await this.retention.attachCheckout((await this.stores.findActiveBySlugPublic(slug)).id, dto.recoveryToken, result.id);
    return result;
  }

  @Post(":slug/promo-code/quote")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async quotePromoCode(@Param("slug") slug: string, @Body() dto: QuotePromoCodeDto) {
    const store = await this.stores.findActiveBySlugPublic(slug);
    const promo = await this.promoCodes.resolveActiveForStore(store.id, dto.code);
    return { code: promo.code, discountType: promo.discountType, discountValue: promo.discountValue };
  }

  @Post(":slug/leads")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submitLead(@Param("slug") slug: string, @Body() dto: SubmitStoreLeadDto) {
    return this.stores.submitLead(slug, dto);
  }

  @Post(":slug/newsletter")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async subscribeNewsletter(@Param("slug") slug: string, @Body() dto: SubscribeStoreNewsletterDto) {
    const store = await this.stores.findActiveBySlugPublic(slug);
    if ((await this.retention.settings(store.id)).signupEnabled) return this.retention.subscribe(store, dto.email);
    return this.stores.subscribeNewsletter(slug, dto.email);
  }
}
