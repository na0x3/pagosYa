import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PaymentLinksService } from "./payment-links.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";
import { ImportInventoryDto } from "./dto/import-inventory.dto";
import { NormalizeInventoryCsvDto } from "./dto/normalize-inventory-csv.dto";
import { ScheduleProductDiscountsDto } from "./dto/schedule-product-discounts.dto";

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

  @Patch("discount")
  scheduleDiscounts(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: ScheduleProductDiscountsDto,
  ) {
    return this.paymentLinks.scheduleDiscounts(merchant.id, storeId, dto);
  }

  @Delete("discount")
  clearDiscounts(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
  ) {
    return this.paymentLinks.clearDiscounts(merchant.id, storeId);
  }

  @Post("import")
  importInventory(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: ImportInventoryDto,
  ) {
    return this.paymentLinks.importInventory(merchant.id, storeId, dto);
  }

  @Post("import/normalize")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  normalizeInventoryCsv(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: NormalizeInventoryCsvDto,
  ) {
    return this.paymentLinks.normalizeInventoryCsv(merchant.id, storeId, dto.csv);
  }

  @Post(":id/archive")
  archive(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.paymentLinks.archive(merchant.id, storeId, id);
  }

  @Post(":id/restore")
  restore(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.paymentLinks.restore(merchant.id, storeId, id);
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
