import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { SiatCatalogService } from "./siat-catalog.service";

@ApiTags("siat_catalogs")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/siat/catalogs")
export class SiatCatalogController {
  constructor(private readonly catalogs: SiatCatalogService) {}

  @Get(":catalog")
  list(
    @CurrentMerchant() merchant: { id: string },
    @Param("catalog") catalog: string,
    @Query("refresh") refresh?: string,
    @Query("activityCode") activityCode?: string,
    @Query("q") query?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.catalogs.list(merchant.id, catalog, {
      refresh: refresh === "true",
      activityCode,
      query,
      limit: parsedLimit !== undefined && Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : undefined,
    });
  }
}
