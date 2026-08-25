import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { DebtCollectionsModule } from "../debt-collections/debt-collections.module";
import { AuthModule } from "../auth/auth.module";
import { ConsumerController } from "./consumer.controller";
import { MerchantOrdersController } from "./merchant-orders.controller";
import { ConsumerService } from "./consumer.service";
import { ConsumerSessionService } from "./consumer-session.service";
import { ConsumerAuthGuard } from "./consumer-auth.guard";
import { OrderTrackingController } from "./order-tracking.controller";

@Module({
  imports: [AuthModule, DashboardModule, DebtCollectionsModule],
  controllers: [ConsumerController, MerchantOrdersController, OrderTrackingController],
  providers: [ConsumerService, ConsumerSessionService, ConsumerAuthGuard],
  exports: [ConsumerService, ConsumerSessionService, ConsumerAuthGuard],
})
export class ConsumerModule {}
