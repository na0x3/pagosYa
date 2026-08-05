import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SecretApiKeyGuard } from "../auth/guards/secret-api-key.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { InvoicingService } from "./invoicing.service";
import { UpsertInvoicingProfileDto } from "./dto/upsert-invoicing-profile.dto";

@ApiTags("invoicing")
@Controller("v1")
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Post("merchants/invoicing_profile")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  upsertProfile(@CurrentMerchant() merchant: { id: string }, @Body() dto: UpsertInvoicingProfileDto) {
    return this.invoicing.upsertProfile(merchant.id, dto);
  }

  @Get("merchants/invoicing_profile")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  getProfile(@CurrentMerchant() merchant: { id: string }) {
    return this.invoicing.getProfile(merchant.id);
  }

  @Get("invoices/:paymentIntentId")
  @ApiBearerAuth()
  @UseGuards(SecretApiKeyGuard)
  getForPaymentIntent(@CurrentMerchant() merchant: { id: string }, @Param("paymentIntentId") paymentIntentId: string) {
    return this.invoicing.getForPaymentIntent(merchant.id, paymentIntentId);
  }
}
