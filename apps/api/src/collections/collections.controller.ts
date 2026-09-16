import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { CollectionsService } from "./collections.service";
import { CreateCollectionDto } from "./dto/create-collection.dto";
import { UpdateCollectionDto } from "./dto/update-collection.dto";
import { ReorderCollectionsDto } from "./dto/reorder-collections.dto";
import { SetCollectionProductsDto } from "./dto/set-collection-products.dto";

/** Dashboard/backend-authenticated management of a single store's product
 * collections — nested under the store they belong to, same shape as
 * CategoriesController. */
@ApiTags("collections")
@Controller("v1/stores/:storeId/collections")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.collections.create(merchant.id, storeId, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.collections.listForStore(merchant.id, storeId);
  }

  @Put("order")
  reorder(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: ReorderCollectionsDto,
  ) {
    return this.collections.reorder(merchant.id, storeId, dto.collectionIds);
  }

  @Patch(":id")
  update(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collections.update(merchant.id, storeId, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.collections.remove(merchant.id, storeId, id);
  }

  @Put(":id/products")
  setProducts(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: SetCollectionProductsDto,
  ) {
    return this.collections.setProducts(merchant.id, storeId, id, dto.paymentLinkIds);
  }
}
