import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StoreAnalyticsController, StoreAnalyticsPublicController } from './store-analytics.controller';
import { StoreAnalyticsService } from './store-analytics.service';
import { StoreAnalyticsWorker } from './store-analytics.worker';

/** G1 analytics capture: storefront events, daily rollups, retention and the merchant read API. */
@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [StoreAnalyticsPublicController, StoreAnalyticsController],
  providers: [StoreAnalyticsService, StoreAnalyticsWorker],
  exports: [StoreAnalyticsService],
})
export class StoreAnalyticsModule {}
