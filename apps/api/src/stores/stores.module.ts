import { ProductScenesController } from './product-scenes.controller';
import { ProductHighlightsController } from './product-highlights.controller';
import { ProductHighlightsService } from './product-highlights.service';
import { ProductScenesService } from './product-scenes.service';
import { DomainCommerceController } from './domains/domain-commerce.controller';
import { DomainCommerceService } from './domains/domain-commerce.service';
import { NamecomProvider } from './domains/namecom.provider';
import { CloudflareHostingProvider } from './domains/cloudflare-hosting.provider';
import { EmailWorkspaceController } from './email-workspace.controller';
import { EmailWorkspaceService } from './email-workspace.service';
import { SourceDesignJobsController } from './source-design-jobs.controller';
import { SourceDesignJobsService } from './source-design-jobs.service';
import { SourceDesignJobWorker } from './source-design-job.worker';
import { SourceDesignEvaluator } from './source-design-evaluator';
import { SourceAssetsController } from './source-assets.controller';
import { SourceVisualReviewService } from './source-visual-review.service';
import { SourceDesignPlanner } from './source-design-planner';
import { StoreFunnelService } from './store-funnel.service';
import { StoreFunnelController } from './store-funnel.controller';
import { StoreSeoService } from './store-seo.service';
import { StoreSeoController, StoreDiscoveryController } from './store-seo.controller';
import { RetentionService } from './retention.service';
import { RetentionController, RetentionPublicController, RetentionPaymentController } from './retention.controller';
import { CommerceContentService } from './commerce-content.service';
import { CommerceContentController, CommerceContentPublicController } from './commerce-content.controller';
import { ShippingController } from './shipping.controller';
import { BrandProfileController } from './brand-profile.controller';
import { BrandProfileService } from './brand-profile.service';
import { AiUsageService } from './ai-usage.service';
import { SourcePublishingService } from './source-publishing.service';
import { SourcePublishingController, SourceSiteController } from './source-publishing.controller';
import { StoreGrowthController } from "./store-growth.controller";
import { StoreGrowthService } from "./store-growth.service";
import { SourceConversationService } from "./source-conversation.service";
import { SourceChatService } from "./source-chat.service";
import { Module } from "@nestjs/common";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { StoresPublicController } from "./stores-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { VisualStudioService } from "./visual-studio.service";
import { CustomDomainsService } from "./custom-domains.service";
import { PromoCodesController } from "../promo-codes/promo-codes.controller";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { StoreAgentService } from "./store-agent.service";
import { PaymentLinksModule } from "../payment-links/payment-links.module";
import { SourceProjectsController } from "./source-projects.controller";
import { SourceProjectsService } from "./source-projects.service";
import { SourceGenerationService } from "./source-generation.service";

@Module({
  imports: [PaymentIntentsModule, PaymentLinksModule, DashboardModule, AuthModule, UploadsModule],
  controllers: [ProductScenesController, ProductHighlightsController, DomainCommerceController, EmailWorkspaceController, SourceDesignJobsController, SourceAssetsController, StoreFunnelController, StoreSeoController, StoreDiscoveryController, RetentionPaymentController, RetentionController, RetentionPublicController, CommerceContentController, CommerceContentPublicController, ShippingController, BrandProfileController, SourcePublishingController, SourceSiteController, StoreGrowthController, StoresController, StoresPublicController, PromoCodesController, SourceProjectsController],
  providers: [ProductScenesService, ProductHighlightsService, DomainCommerceService, NamecomProvider, CloudflareHostingProvider, EmailWorkspaceService, SourceDesignJobsService, SourceDesignJobWorker, SourceDesignEvaluator, SourceVisualReviewService, SourceDesignPlanner, StoreFunnelService, StoreSeoService, RetentionService, CommerceContentService, BrandProfileService, AiUsageService, SourcePublishingService, StoreGrowthService, StoresService, VisualStudioService, StoreAgentService, CustomDomainsService, PromoCodesService, SourceProjectsService, SourceGenerationService, SourceChatService, SourceConversationService],
  exports: [StoresService],
})
export class StoresModule {}
