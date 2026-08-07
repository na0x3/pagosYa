import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PaymentLinksService } from "./payment-links.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";

/** Dashboard/backend-authenticated management of a single store's products (Payment
 * Links) — nested under the store they belong to, since a merchant can run several
 * stores. See StoresPublicController for the customer-facing side. */
@ApiTags("payment_links")
@Controller("v1/stores/:storeId/payment_links")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: CreatePaymentLinkDto,
  ) {
    return this.paymentLinks.create(merchant.id, storeId, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.paymentLinks.listForStore(merchant.id, storeId);
  }

  @Post(":id/archive")
  archive(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.paymentLinks.archive(merchant.id, storeId, id);
  }

  @Patch(":id")
  update(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: UpdatePaymentLinkDto,
  ) {
    return this.paymentLinks.update(merchant.id, storeId, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.paymentLinks.remove(merchant.id, storeId, id);
  }
}
