import { SourceChatJobsService } from './source-chat-jobs.service';
import { AssumedFactCountsController, StoreVoiceController } from './store-voice.controller';
import { StoreVoiceService } from './store-voice.service';
import { SketchStudioController } from './sketch-studio.controller';
import { SketchStudioService } from './sketch-studio.service';
import { SourceChatJobsController } from './source-chat-jobs.controller';
import { SourceFontsController } from './source-fonts.controller';
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RewardsModule } from "../rewards/rewards.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { StoreEmailModule } from "../store-emails/store-email.module";
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
import { SourceTemplatesApplyController, SourceTemplatesListController } from "./source-templates.controller";
import { SourceTemplatesService } from "./source-templates.service";
import { templateManifest } from "@pagosya/store-templates";
import { SourceStorePlanService, StorePlanParts } from "./source-store-plan.service";
import { MASTER_TEMPLATE_ID } from "./source-master";
import { rollVariants } from "./source-master-dice";

/** YAPI plan card (spec 2026-10-22): Esencial's catalogue and the dice the plan falls back to, part by part. */
const esencialSettings = () => templateManifest(MASTER_TEMPLATE_ID)!.master!;
const storePlanParts = new StorePlanParts(
  () => { const master = esencialSettings(); return { variants: master.variants ?? {}, sections: master.sections ?? [], palettes: master.palettes.map(p => p.id), fonts: master.fonts.map(f => f.id) }; },
  storeId => { const { sections: _sections, ...variants } = rollVariants({ seed: storeId, settings: esencialSettings(), character: { tone: "calm", temperature: "neutral", lead: "photo", exclude: [] }, photoCount: 8, sections: [], recent: [] }).variants; return variants as Record<string, string>; },
);

/** AI-generated storefront source projects (Studio): YAPI chat, generation, design jobs,
 * visual review, and publishing. See docs/ARCHITECTURE.md for the pipeline. */
import { ProductPageModule } from '../product-content/product-page.module';
@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, AiUsageModule, BrandModule, StoresModule, RewardsModule, StoreEmailModule, ProductPageModule],
  controllers: [SketchStudioController, SourceChatJobsController, SourceFontsController, SourceDesignJobsController, SourceAssetsController, SourcePublishingController, SourceSiteController, SourceProjectsController, SourceTemplatesListController, SourceTemplatesApplyController, StoreVoiceController, AssumedFactCountsController],
  providers: [SketchStudioService, SourceChatJobsService, MerchantThrottlerGuard, SourceDesignJobsService, SourceDesignJobWorker, SourceDesignEvaluator, SourceVisualReviewService, SourceDesignPlanner, SourcePublishingService, SourceProjectsService, SourceGenerationService, SourceChatService, SourceConversationService, SourceTemplatesService, StoreVoiceService, SourceStorePlanService, { provide: StorePlanParts, useValue: storePlanParts }],
  exports: [SourceProjectsService, SourceTemplatesService, SourceChatService],
})
export class StorefrontSourceModule {}
