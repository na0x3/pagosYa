import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { ClientSecretGuard } from "../auth/guards/client-secret.guard";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PaymentIntentsService } from "./payment-intents.service";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { ConfirmPaymentIntentDto } from "./dto/confirm-payment-intent.dto";
import { ApiKeyMode } from "@prisma/client";
import { TermsAcceptanceService } from "../legal/terms-acceptance.service";
import { RequestWithContext, requestContext } from "../legal/request-context";

@ApiTags("payment_intents")
@Controller("v1/payment_intents")
export class PaymentIntentsController {
  constructor(
    private readonly paymentIntents: PaymentIntentsService,
    private readonly terms: TermsAcceptanceService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  create(
    @CurrentMerchant() merchant: { id: string },
    @Req() req: { apiKeyMode: ApiKeyMode },
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentIntents.create(merchant.id, req.apiKeyMode === ApiKeyMode.LIVE, dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  list(@CurrentMerchant() merchant: { id: string }, @Query("storeId") storeId?: string) {
    return this.paymentIntents.listForMerchant(merchant.id, storeId);
  }

  @Get(":id")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  get(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.paymentIntents.findByIdForMerchant(merchant.id, id);
  }

  @Post(":id/confirm")
  @ApiBearerAuth()
  @UseGuards(ClientSecretGuard)
  async confirm(@Param("id") id: string, @Body() dto: ConfirmPaymentIntentDto, @Req() req: RequestWithContext) {
    const documents = await this.terms.resolveBuyerDocuments({ terms: dto.buyerTermsVersion, privacy: dto.buyerPrivacyVersion });
    const context = requestContext(req);
    return this.paymentIntents.confirm(
      id,
      dto,
      documents ? { ...documents, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null } : undefined,
    );
  }

  @Post(":id/cancel")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  cancel(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.paymentIntents.cancel(merchant.id, id);
  }
}
