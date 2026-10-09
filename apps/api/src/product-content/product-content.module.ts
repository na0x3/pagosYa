import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { BrandModule } from "../brand/brand.module";
import { StoresModule } from "../stores/stores.module";
import { ProductScenesController } from "./product-scenes.controller";
import { ProductScenesService } from "./product-scenes.service";
import { ProductHighlightsController } from "./product-highlights.controller";
import { ProductHighlightsService } from "./product-highlights.service";
import { CommerceContentController, CommerceContentPublicController } from "./commerce-content.controller";
import { CommerceContentService } from "./commerce-content.service";
import { ProductPageModule } from "./product-page.module";
import { ProductPageController } from "./product-page.controller";

/** What a store says about its products beyond the catalog: AI scenes and highlights,
 * articles, bundles, and customer reviews. */
@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, AiUsageModule, BrandModule, StoresModule, ProductPageModule],
  controllers: [ProductScenesController, ProductHighlightsController, CommerceContentController, CommerceContentPublicController, ProductPageController],
  providers: [ProductScenesService, ProductHighlightsService, CommerceContentService],
})
export class ProductContentModule {}
