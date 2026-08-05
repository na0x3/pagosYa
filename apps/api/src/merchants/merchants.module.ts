import { Module } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { MerchantsController } from "./merchants.controller";
import { AuthModule } from "../auth/auth.module";
import { OpsModule } from "../ops/ops.module";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [AuthModule, OpsModule, DashboardModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, KycService],
  exports: [MerchantsService, KycService],
})
export class MerchantsModule {}
