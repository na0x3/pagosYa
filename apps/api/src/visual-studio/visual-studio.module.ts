import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { UploadsModule } from "../uploads/uploads.module";
import { PaymentLinksModule } from "../payment-links/payment-links.module";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { BrandModule } from "../brand/brand.module";
import { VisualStudioController } from "./visual-studio.controller";
import { VisualStudioService } from "./visual-studio.service";
import { VisualAiService } from "./visual-ai.service";
import { VisualProposalsService } from "./visual-proposals.service";
import { VisualRevisionService } from "./visual-revision.service";
import { StoreAgentService } from "./store-agent.service";

/** The dashboard's visual editor for settings-based stores: AI layout proposals,
 * versions, section locks, and the store agent chat that edits the site document. */
@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, PaymentLinksModule, AiUsageModule, BrandModule],
  controllers: [VisualStudioController],
  providers: [VisualStudioService, VisualAiService, VisualProposalsService, VisualRevisionService, StoreAgentService],
})
export class VisualStudioModule {}
