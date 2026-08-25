import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { CreateMerchantSupportCaseDto } from "./dto/create-merchant-support-case.dto";
import { SupportService } from "./support.service";

interface MerchantSupportRequest {
  merchant: { id: string };
  merchantUser: { id: string; email: string };
}

@ApiTags("dashboard-support")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/support_cases")
export class MerchantSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@Req() request: MerchantSupportRequest) {
    return this.support.listMerchantCases(request.merchant.id);
  }

  @Post()
  create(@Req() request: MerchantSupportRequest, @Body() dto: CreateMerchantSupportCaseDto) {
    return this.support.createMerchantCase(request.merchant.id, request.merchantUser, dto);
  }
}
