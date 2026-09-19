import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RetentionService } from "./retention.service";
import { RetentionController, RetentionPaymentController, RetentionPublicController } from "./retention.controller";

/** Newsletter sign-ups, comeback cards, abandoned-cart recovery, and review requests. */
@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [RetentionPaymentController, RetentionController, RetentionPublicController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
