import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import {
  DebtCollectionsController,
  DebtCollectionsPublicController,
} from "./debt-collections.controller";
import { DebtCollectionsService } from "./debt-collections.service";

@Module({
  imports: [AuthModule, DashboardModule, PaymentIntentsModule],
  controllers: [DebtCollectionsController, DebtCollectionsPublicController],
  providers: [DebtCollectionsService],
  exports: [DebtCollectionsService],
})
export class DebtCollectionsModule {}
