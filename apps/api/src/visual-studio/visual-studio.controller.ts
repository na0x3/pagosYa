import { Body, Controller, Get, Put, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { WebsiteRevisionDto } from "../stores/dto/save-website-draft.dto";
import { VisualStudioService } from "./visual-studio.service";
import { StoreAgentService } from "./store-agent.service";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { SaveVisualTemplateDto } from "./dto/save-visual-template.dto";
import { SetVisualSectionLocksDto } from "./dto/set-visual-section-locks.dto";
import { SendStoreAgentMessageDto } from "./dto/send-store-agent-message.dto";

/** The dashboard's visual editor: AI layout proposals, saved versions, and the store agent chat. */
@ApiTags("stores")
@Controller("v1/stores")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
export class VisualStudioController {
  constructor(
    private readonly visualStudio: VisualStudioService,
    private readonly storeAgent: StoreAgentService,
  ) {}

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
}
