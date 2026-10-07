import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { SettlementQueryService } from "./settlement-query.service";

@ApiTags("settlement")
@Controller("v1/merchants/settlement")
export class DashboardSettlementController {
  constructor(private readonly query: SettlementQueryService) {}

  @Get("schedule")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  schedule(@CurrentMerchant() merchant: { id: string }) {
    return this.query.schedule(merchant.id);
  }
}
