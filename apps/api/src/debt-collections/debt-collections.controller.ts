import { Body, Controller, Get, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { DebtCollectionsService } from "./debt-collections.service";
import { AddDebtRecordsDto } from "./dto/add-debt-records.dto";
import { CreateDebtCollectionLinkDto } from "./dto/create-debt-collection-link.dto";
import { DebtCheckoutDto, DebtLookupDto } from "./dto/debt-lookup.dto";
import { NormalizeDebtCsvDto } from "./dto/normalize-debt-csv.dto";

@ApiTags("debt_collections")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/debt-collection-links")
export class DebtCollectionsController {
  constructor(private readonly debts: DebtCollectionsService) {}

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.debts.list(merchant.id, storeId);
  }

  @Post()
  create(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: CreateDebtCollectionLinkDto,
  ) {
    return this.debts.create(merchant.id, storeId, dto);
  }

  @Post("import/normalize")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  normalizeCsv(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Body() dto: NormalizeDebtCsvDto,
  ) {
    return this.debts.normalizeCsv(merchant.id, storeId, dto.csv);
  }

  @Post(":id/debts")
  addDebts(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
    @Body() dto: AddDebtRecordsDto,
  ) {
    return this.debts.addDebts(merchant.id, storeId, id, dto.debts);
  }

  @Post(":id/archive")
  archive(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.debts.archive(merchant.id, storeId, id);
  }

  @Post(":id/restore")
  restore(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    return this.debts.restore(merchant.id, storeId, id);
  }

  @Get(":id/status.pdf")
  async statusPdf(
    @CurrentMerchant() merchant: { id: string },
    @Param("storeId") storeId: string,
    @Param("id") id: string,
  ) {
    const result = await this.debts.exportStatusPdf(merchant.id, storeId, id);
    return new StreamableFile(result.buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${result.filename}"`,
      length: result.buffer.length,
    });
  }
}

@ApiTags("debt_collections")
@Controller("v1/debt-collections/public")
export class DebtCollectionsPublicController {
  constructor(private readonly debts: DebtCollectionsService) {}

  @Get(":slug")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  info(@Param("slug") slug: string) {
    return this.debts.publicInfo(slug);
  }

  @Post(":slug/lookup")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  lookup(@Param("slug") slug: string, @Body() body: DebtLookupDto) {
    return this.debts.lookup(slug, body.customerDocument);
  }

  @Post(":slug/checkout")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(@Param("slug") slug: string, @Body() body: DebtCheckoutDto) {
    return this.debts.checkout(slug, body.customerDocument, body.debtRecordIds);
  }
}
