import { Global, Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OpsModule } from '../ops/ops.module';
import { DashboardPlanController, OpsPlanController, PublicPlansController } from './plans.controller';
import { PlansService } from './plans.service';

/** Global so YAPI, publishing and the assistant can check the plan without importing this module. */
@Global()
@Module({
  imports: [OpsModule, DashboardModule],
  controllers: [DashboardPlanController, OpsPlanController, PublicPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
