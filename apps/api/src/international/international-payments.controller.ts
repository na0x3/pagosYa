import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentIntent } from "@prisma/client";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { ClientSecretGuard } from "../auth/guards/client-secret.guard";
import { InternationalPaymentsService } from "./international-payments.service";
import { InternationalMethodsDto } from "./dto/international-methods.dto";

@ApiTags("international")
@Controller("v1")
export class InternationalPaymentsController {
  constructor(private readonly international: InternationalPaymentsService) {}

  @Get("merchants/international_payments")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  status(@CurrentMerchant() merchant: { id: string }) {
    return this.international.statusFor(merchant.id);
  }

  @Post("merchants/international_payments/request")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  request(@CurrentMerchant() merchant: { id: string }) {
    return this.international.request(merchant.id);
  }

  @Post("checkout/international_methods")
  @HttpCode(200)
  @UseGuards(ClientSecretGuard)
  methods(@Req() req: { paymentIntent: PaymentIntent }, @Body() dto: InternationalMethodsDto) {
    return this.international.methodsForIntent(req.paymentIntent, dto.country);
  }
}
