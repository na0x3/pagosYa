import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { FinancesService } from "./finances.service";

@ApiTags("finances")
@Controller("v1/merchants")
export class FinancesController {
  constructor(private readonly finances: FinancesService) {}

  @Get("finances")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  summary(@CurrentMerchant() merchant: { id: string }, @Query("storeId") storeId?: string) {
    return this.finances.summary(merchant.id, storeId);
  }
}
