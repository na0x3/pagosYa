import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CreatePromoCodeDto } from "./dto/create-promo-code.dto";
import { UpdatePromoCodeDto } from "./dto/update-promo-code.dto";
import { PromoCodesService } from "./promo-codes.service";

@ApiTags("promo_codes")
@Controller("v1/stores/:storeId/promo-codes")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class PromoCodesController {
  constructor(private readonly promoCodes: PromoCodesService) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() dto: CreatePromoCodeDto) {
    return this.promoCodes.create(merchant.id, storeId, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.promoCodes.list(merchant.id, storeId);
  }

  @Patch(":id")
  update(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.promoCodes.setActive(merchant.id, storeId, id, dto.isActive);
  }
}
