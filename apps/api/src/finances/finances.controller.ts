import { Controller, Get, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { FinancesService } from "./finances.service";

@ApiTags("finances")
@Controller("v1/merchants")
export class FinancesController {
  constructor(private readonly finances: FinancesService) {}

  @Get("finances")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  summary(@CurrentMerchant() merchant: { id: string }, @Query("storeId") storeId?: string) {
    return this.finances.summary(merchant.id, storeId);
  }

  @Get("finances.pdf")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  async summaryPdf(
    @CurrentMerchant() merchant: { id: string },
    @Res({ passthrough: true }) response: Response,
    @Query("storeId") storeId?: string,
  ) {
    const pdf = await this.finances.exportFinancesPdf(merchant.id, storeId);
    const filename = `finanzas-${(storeId ? "tienda" : "negocio")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }

  @Get("orders")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  orders(
    @CurrentMerchant() merchant: { id: string },
    @Query("storeId") storeId?: string,
    @Query("search") search?: string,
    @Query("export") exportAll?: string,
    @Query("status") status?: string,
  ) {
    return this.finances.orders(merchant.id, storeId, search, exportAll === "true", status);
  }

  @Get("orders.pdf")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  async ordersPdf(
    @CurrentMerchant() merchant: { id: string },
    @Res({ passthrough: true }) response: Response,
    @Query("storeId") storeId?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ) {
    const pdf = await this.finances.exportOrdersPdf(merchant.id, storeId, search, status);
    const filename = `pedidos-${(storeId ? "tienda" : "negocio")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }
}
