import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

/** Dashboard/backend-authenticated management of a single store's product
 * categories — nested under the store they belong to, same shape as
 * PaymentLinksController. */
@ApiTags("categories")
@Controller("v1/stores/:storeId/categories")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.create(merchant.id, storeId, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.categories.listForStore(merchant.id, storeId);
  }

  @Patch(":id")
  update(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(merchant.id, storeId, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.categories.remove(merchant.id, storeId, id);
  }
}
