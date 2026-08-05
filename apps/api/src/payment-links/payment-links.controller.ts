import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PaymentLinksService } from "./payment-links.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";

/** Dashboard/backend-authenticated management of a merchant's payment links (the
 * no-code entry point — see PaymentLinksPublicController for the customer-facing side). */
@ApiTags("payment_links")
@Controller("v1/payment_links")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreatePaymentLinkDto) {
    return this.paymentLinks.create(merchant.id, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.paymentLinks.listForMerchant(merchant.id);
  }

  @Post(":id/archive")
  archive(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.paymentLinks.archive(merchant.id, id);
  }
}
