import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { StoreFunnelController } from "./store-funnel.controller";
import { StoreFunnelService } from "./store-funnel.service";
import { StoreGrowthController } from "./store-growth.controller";
import { StoreGrowthService } from "./store-growth.service";

/** Storefront visit funnel tracking and the merchant's growth view built on it. */
@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [StoreFunnelController, StoreGrowthController],
  providers: [StoreFunnelService, StoreGrowthService],
})
export class StoreGrowthModule {}
