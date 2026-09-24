import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { StoresService } from "./stores.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { Throttle } from "@nestjs/throttler";
import { SaveWebsiteDraftDto, WebsiteRevisionDto } from "./dto/save-website-draft.dto";

/** Dashboard/backend-authenticated management of the merchant account's stores.
 * See StoresPublicController for the customer-facing side,
 * CustomDomainsController and VisualStudioController for the domain and
 * visual-editor routes under the same prefix, and
 * PaymentLinksController (nested under /v1/stores/:storeId/payment_links) for
 * managing a store's products. */
@ApiTags("stores")
@Controller("v1/stores")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateStoreDto) {
    return this.stores.create(merchant.id, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.stores.listForMerchant(merchant.id);
  }

  @Post(":id/quick-qr-payments")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createQuickQrPayment(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: CreateQuickQrPaymentDto,
  ) {
    return this.stores.createQuickQrPayment(merchant.id, id, dto);
  }

  @Patch(":id")
  update(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.update(merchant.id, id, dto);
  }

  @Put(":id/settings")
  saveSettings(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: SaveWebsiteDraftDto) {
    return this.stores.saveWebsiteDraft(merchant.id, id, dto);
  }

  @Post(":id/website-draft/publish")
  publishWebsiteDraft(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: WebsiteRevisionDto) {
    return this.stores.publishWebsiteDraft(merchant.id, id, dto.revision);
  }

  @Post(":id/website-draft/discard")
  discardWebsiteDraft(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: WebsiteRevisionDto) {
    return this.stores.discardWebsiteDraft(merchant.id, id, dto.revision);
  }

  @Put(":id/links")
  setLinks(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: SetStoreLinksDto) {
    return this.stores.setLinks(merchant.id, id, dto);
  }

  @Post(":id/archive")
  archive(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.stores.archive(merchant.id, id);
  }

  @Delete(":id")
  remove(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.stores.remove(merchant.id, id);
  }
}
