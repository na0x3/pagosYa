import { Module } from "@nestjs/common";
import { LimitsService } from "./limits.service";
import { LimitsSweepWorker } from "./limits-sweep.worker";
import { LimitsWarningService } from "./limits-warning.service";
import { LimitsAdminService } from "./limits-admin.service";
import { OpsLimitsController } from "./ops-limits.controller";
import { DashboardLimitsController } from "./dashboard-limits.controller";
import { OpsModule } from "../ops/ops.module";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [OpsModule, DashboardModule],
  controllers: [OpsLimitsController, DashboardLimitsController],
  providers: [LimitsService, LimitsSweepWorker, LimitsWarningService, LimitsAdminService],
  exports: [LimitsService, LimitsWarningService],
})
export class LimitsModule {}
