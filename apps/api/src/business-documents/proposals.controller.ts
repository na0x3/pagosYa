import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { ProposalsService } from "./proposals.service";
import { CreateCobroFromProposalDto, DraftProposalDto, RegenerateProposalSectionDto } from "./dto/business-document.dto";

/** D2: the merchant's proposal actions beyond D0's draft/send/void. Ownership is checked in the service. */
@ApiTags("business_documents")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId")
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  /** "Crear borrador con IA": one metered AI call (luna), saved as a DRAFT proposal. */
  @Post("proposals/draft")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  draft(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Body() dto: DraftProposalDto) {
    return this.proposals.draft(merchant.id, storeId, dto);
  }

  /** The Propuestas header: counts per tab and values per currency over every proposal. */
  @Get("proposals/summary")
  summary(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string) {
    return this.proposals.summary(merchant.id, storeId);
  }

  /** "Regenerar con IA" on one section; returned, not saved. */
  @Post("documents/:id/regenerate-section")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  regenerate(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: RegenerateProposalSectionDto) {
    return this.proposals.regenerateSection(merchant.id, storeId, id, dto);
  }

  /** "Crear cobro" from an accepted proposal (idempotent). */
  @Post("documents/:id/cobro")
  @HttpCode(200)
  cobro(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: CreateCobroFromProposalDto) {
    return this.proposals.createCobro(merchant.id, storeId, id, dto);
  }
}
