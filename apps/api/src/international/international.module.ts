import { Module } from "@nestjs/common";
import { RailsModule } from "../rails/rails.module";
import { OpsModule } from "../ops/ops.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { InternationalPaymentsService } from "./international-payments.service";
import { InternationalPaymentsController } from "./international-payments.controller";
import { OpsInternationalPaymentsController } from "./ops-international-payments.controller";

@Module({
  imports: [RailsModule, OpsModule, AuthModule, DashboardModule],
  controllers: [InternationalPaymentsController, OpsInternationalPaymentsController],
  providers: [InternationalPaymentsService],
  exports: [InternationalPaymentsService],
})
export class InternationalModule {}
