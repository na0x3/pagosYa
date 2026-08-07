import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { SubmitKycDto } from "./dto/submit-kyc.dto";
import { ReviewKycDto } from "./dto/review-kyc.dto";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { OpsActor } from "./kyc.service";

@ApiTags("merchants")
@Controller("v1/merchants")
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly kyc: KycService,
  ) {}

  /** Public self-serve signup — tighter limit than the global default since it's the free entry point to everything else (instant TEST keys, dashboard signup). */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchants.create(dto);
  }

  @Post("kyc")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  submitKyc(@CurrentMerchant() merchant: { id: string }, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(merchant.id, dto);
  }

  @Get("kyc")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  getKyc(@CurrentMerchant() merchant: { id: string }) {
    return this.kyc.latest(merchant.id);
  }

  /**
   * Deliberately SecretApiKeyGuard-only, not MerchantAuthGuard: this mints a
   * new, non-expiring sk_live_... credential — a strictly bigger and longer-
   * lived capability than anything else a dashboard session grants, and one
   * that would outlive the session itself (survives logout/expiry). A
   * compromised session token must not be able to escalate into a permanent
   * secret key.
   */
  @Post("live_keys")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  issueLiveKeys(@CurrentMerchant() merchant: { id: string }) {
    return this.merchants.issueLiveKeys(merchant.id);
  }

  /** pagosYa ops/compliance queue — not merchant- or public-facing. */
  @Get("kyc/pending")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  listPendingKyc() {
    return this.kyc.listPending();
  }

  /** pagosYa ops/compliance review action — not merchant- or public-facing. */
  @Post("kyc/:submissionId/review")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  reviewKyc(
    @CurrentOpsUser() opsUser: OpsActor,
    @Param("submissionId") submissionId: string,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kyc.review(submissionId, dto, opsUser);
  }
}
