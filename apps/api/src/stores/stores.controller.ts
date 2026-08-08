import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { StoresService } from "./stores.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";

/** Dashboard/backend-authenticated management of a merchant's stores — a merchant
 * can run several independent storefronts (separate slug/branding/catalog each).
 * See StoresPublicController for the customer-facing side, and
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

  @Patch(":id")
  update(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.update(merchant.id, id, dto);
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
