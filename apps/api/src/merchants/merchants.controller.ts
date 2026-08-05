import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { InternalOpsGuard } from "../auth/guards/internal-ops.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";

@ApiTags("merchants")
@Controller("v1/merchants")
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly kyc: KycService,
  ) {}

  @Post()
  create(@Body() dto: CreateMerchantDto) {
    return this.merchants.create(dto);
  }

  @Post("kyc")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  submitKyc(@CurrentMerchant() merchant: { id: string }, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(merchant.id, dto);
  }

  @Get("kyc")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  getKyc(@CurrentMerchant() merchant: { id: string }) {
    return this.kyc.latest(merchant.id);
  }

  @Post("live_keys")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  issueLiveKeys(@CurrentMerchant() merchant: { id: string }) {
    return this.merchants.issueLiveKeys(merchant.id);
  }

  /** pagosYa ops/compliance queue — not merchant- or public-facing. */
  @Get("kyc/pending")
  @ApiBearerAuth()
  @UseGuards(InternalOpsGuard)
  listPendingKyc() {
    return this.kyc.listPending();
  }

  /** pagosYa ops/compliance review action — not merchant- or public-facing. */
  @Post("kyc/:submissionId/review")
  @ApiBearerAuth()
  @UseGuards(InternalOpsGuard)
  reviewKyc(@Param("submissionId") submissionId: string, @Body() dto: ReviewKycDto) {
    return this.kyc.review(submissionId, dto);
  }
}
