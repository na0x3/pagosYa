import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { StoreAnalyticsModule } from "../store-analytics/store-analytics.module";
import { StoreFunnelController } from "./store-funnel.controller";
import { StoreFunnelService } from "./store-funnel.service";
import { StoreGrowthController } from "./store-growth.controller";
import { StoreGrowthService } from "./store-growth.service";
import { AbandonedCartsController } from "./abandoned-carts.controller";
import { AbandonedCartsService } from "./abandoned-carts.service";

/** Storefront visit funnel tracking, the merchant's growth view built on it, and the abandoned-carts list. */
@Module({
  imports: [DashboardModule, AuthModule, StoreAnalyticsModule],
  controllers: [StoreFunnelController, StoreGrowthController, AbandonedCartsController],
  providers: [StoreFunnelService, StoreGrowthService, AbandonedCartsService],
})
export class StoreGrowthModule {}
