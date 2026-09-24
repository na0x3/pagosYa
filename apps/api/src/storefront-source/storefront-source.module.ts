import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { BrandModule } from "../brand/brand.module";
import { StoresModule } from "../stores/stores.module";
import { SourceDesignJobsController } from "./source-design-jobs.controller";
import { SourceDesignJobsService } from "./source-design-jobs.service";
import { SourceDesignJobWorker } from "./source-design-job.worker";
import { SourceDesignEvaluator } from "./source-design-evaluator";
import { SourceDesignPlanner } from "./source-design-planner";
import { SourceAssetsController } from "./source-assets.controller";
import { SourceVisualReviewService } from "./source-visual-review.service";
import { SourcePublishingController, SourceSiteController } from "./source-publishing.controller";
import { SourcePublishingService } from "./source-publishing.service";
import { SourceProjectsController } from "./source-projects.controller";
import { SourceProjectsService } from "./source-projects.service";
import { SourceGenerationService } from "./source-generation.service";
import { SourceConversationService } from "./source-conversation.service";
import { SourceChatService } from "./source-chat.service";
import { MerchantThrottlerGuard } from "./source-compile-budget";

/** AI-generated storefront source projects (Studio): YAPI chat, generation, design jobs,
 * visual review, and publishing. See docs/ARCHITECTURE.md for the pipeline. */
@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, AiUsageModule, BrandModule, StoresModule],
  controllers: [SourceDesignJobsController, SourceAssetsController, SourcePublishingController, SourceSiteController, SourceProjectsController],
  providers: [MerchantThrottlerGuard, SourceDesignJobsService, SourceDesignJobWorker, SourceDesignEvaluator, SourceVisualReviewService, SourceDesignPlanner, SourcePublishingService, SourceProjectsService, SourceGenerationService, SourceChatService, SourceConversationService],
})
export class StorefrontSourceModule {}
