import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { StoresService } from "./stores.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { VisualStudioService } from "./visual-studio.service";
import { SaveStoreSettingsDto } from "./dto/save-store-settings.dto";
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { Throttle } from "@nestjs/throttler";
import { CustomDomainsService } from "./custom-domains.service";
import { CreateCustomDomainDto } from "./dto/create-custom-domain.dto";

/** Dashboard/backend-authenticated management of a merchant's stores — a merchant
 * can run several independent storefronts (separate slug/branding/catalog each).
 * See StoresPublicController for the customer-facing side, and
 * PaymentLinksController (nested under /v1/stores/:storeId/payment_links) for
 * managing a store's products. */
@ApiTags("stores")
@Controller("v1/stores")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly visualStudio: VisualStudioService,
    private readonly customDomains: CustomDomainsService,
  ) {}

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreateStoreDto) {
    return this.stores.create(merchant.id, dto);
  }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }) {
    return this.stores.listForMerchant(merchant.id);
  }

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

  @Post(":id/quick-qr-payments")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createQuickQrPayment(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: CreateQuickQrPaymentDto,
  ) {
    return this.stores.createQuickQrPayment(merchant.id, id, dto);
  }

  @Patch(":id")
  update(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.update(merchant.id, id, dto);
  }

  @Put(":id/settings")
  saveSettings(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: SaveStoreSettingsDto) {
    return this.stores.saveSettings(merchant.id, id, dto);
  }

  @Put(":id/links")
  setLinks(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: SetStoreLinksDto) {
    return this.stores.setLinks(merchant.id, id, dto);
  }

  @Get(":id/visual-studio")
  visualStudioState(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.visualStudio.list(merchant.id, id);
  }

  @Post(":id/visual-proposals")
  generateVisualProposals(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: GenerateVisualProposalsDto) {
    return this.visualStudio.generate(merchant.id, id, dto);
  }

  @Post(":id/visual-proposals/:proposalId/apply")
  applyVisualProposal(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("proposalId") proposalId: string) {
    return this.visualStudio.apply(merchant.id, id, proposalId);
  }

  @Post(":id/visual-proposals/:proposalId/dismiss")
  dismissVisualProposal(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("proposalId") proposalId: string) {
    return this.visualStudio.dismiss(merchant.id, id, proposalId);
  }

  @Post(":id/visual-versions/:versionId/restore")
  restoreVisualVersion(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("versionId") versionId: string) {
    return this.visualStudio.restore(merchant.id, id, versionId);
  }

  @Post(":id/archive")
  archive(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.stores.archive(merchant.id, id);
  }

  @Delete(":id")
  remove(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.stores.remove(merchant.id, id);
  }
}
