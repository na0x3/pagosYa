import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { CustomDomainsService } from "./custom-domains.service";
import { CreateCustomDomainDto } from "./dto/create-custom-domain.dto";

/** Custom domains a merchant connects to one of their stores. */
@ApiTags("stores")
@Controller("v1/stores")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class CustomDomainsController {
  constructor(private readonly customDomains: CustomDomainsService) {}

  @Get(":id/domains")
  listDomains(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.customDomains.list(merchant.id, id);
  }

  @Post(":id/domains")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  connectDomain(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: CreateCustomDomainDto,
  ) {
    return this.customDomains.create(merchant.id, id, dto.hostname);
  }

  @Post(":id/domains/:domainId/verify")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyDomain(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Param("domainId") domainId: string,
  ) {
    return this.customDomains.verify(merchant.id, id, domainId);
  }

  @Delete(":id/domains/:domainId")
  removeDomain(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Param("domainId") domainId: string,
  ) {
    return this.customDomains.remove(merchant.id, id, domainId);
  }
}
