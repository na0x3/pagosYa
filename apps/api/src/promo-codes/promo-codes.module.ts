import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PromoCodesController } from "./promo-codes.controller";
import { PromoCodesService } from "./promo-codes.service";

@Module({
  imports: [DashboardModule, AuthModule],
  controllers: [PromoCodesController],
  providers: [PromoCodesService],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
