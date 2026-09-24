import { Module } from "@nestjs/common";
import { LimitsService } from "./limits.service";
import { LimitsSweepWorker } from "./limits-sweep.worker";
import { LimitsWarningService } from "./limits-warning.service";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [DashboardModule],
  providers: [LimitsService, LimitsSweepWorker, LimitsWarningService],
  exports: [LimitsService, LimitsWarningService],
})
export class LimitsModule {}
