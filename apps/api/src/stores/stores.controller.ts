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
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { Throttle } from "@nestjs/throttler";
import { CustomDomainsService } from "./custom-domains.service";
import { CreateCustomDomainDto } from "./dto/create-custom-domain.dto";
import { SaveVisualTemplateDto } from "./dto/save-visual-template.dto";
import { SetVisualSectionLocksDto } from "./dto/set-visual-section-locks.dto";
import { StoreAgentService } from "./store-agent.service";
import { SendStoreAgentMessageDto } from "./dto/send-store-agent-message.dto";
import { SaveWebsiteDraftDto, WebsiteRevisionDto } from "./dto/save-website-draft.dto";

/** Dashboard/backend-authenticated management of the merchant account's single store.
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
    private readonly storeAgent: StoreAgentService,
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
  saveSettings(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: SaveWebsiteDraftDto) {
    return this.stores.saveWebsiteDraft(merchant.id, id, dto);
  }

  @Post(":id/website-draft/publish")
  publishWebsiteDraft(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: WebsiteRevisionDto) {
    return this.stores.publishWebsiteDraft(merchant.id, id, dto.revision);
  }

  @Post(":id/website-draft/discard")
  discardWebsiteDraft(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Body() dto: WebsiteRevisionDto) {
    return this.stores.discardWebsiteDraft(merchant.id, id, dto.revision);
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

  @Get(":id/agent-conversation")
  agentConversation(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) {
    return this.storeAgent.conversation(merchant.id, id);
  }

  @Post(":id/agent-conversation/messages")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  sendAgentMessage(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: SendStoreAgentMessageDto,
  ) {
    return this.storeAgent.send(merchant.id, id, dto);
  }

  @Put(":id/visual-section-locks")
  setVisualSectionLocks(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: SetVisualSectionLocksDto,
  ) {
    return this.visualStudio.setSectionLocks(merchant.id, id, dto.sectionIds);
  }

  @Post(":id/visual-proposals/:proposalId/apply")
  applyVisualProposal(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("proposalId") proposalId: string, @Body() dto: WebsiteRevisionDto) {
    return this.visualStudio.apply(merchant.id, id, proposalId, dto.revision);
  }

  @Post(":id/visual-proposals/:proposalId/template")
  saveVisualTemplate(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Param("proposalId") proposalId: string,
    @Body() dto: SaveVisualTemplateDto,
  ) {
    return this.visualStudio.saveTemplate(merchant.id, id, proposalId, dto.name);
  }

  @Post(":id/visual-proposals/:proposalId/dismiss")
  dismissVisualProposal(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("proposalId") proposalId: string) {
    return this.visualStudio.dismiss(merchant.id, id, proposalId);
  }

  @Post(":id/visual-versions/:versionId/restore")
  restoreVisualVersion(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("versionId") versionId: string, @Body() dto: WebsiteRevisionDto) {
    return this.visualStudio.restore(merchant.id, id, versionId, dto.revision);
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
