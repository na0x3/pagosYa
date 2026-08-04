import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { RefundsService } from "./refunds.service";
import { CreateRefundDto } from "./dto/create-refund.dto";

@ApiTags("refunds")
@ApiBearerAuth()
@UseGuards(SecretApiKeyGuard)
@Controller("v1/refunds")
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateRefundDto) {
    return this.refunds.create(merchant.id, dto);
  }
}
