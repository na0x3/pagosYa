import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { OpsModule } from "../ops/ops.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { PayoutAccountsService } from "./payout-accounts.service";
import { DashboardPayoutAccountsController } from "./dashboard-payout-accounts.controller";
import { OpsPayoutAccountsController } from "./ops-payout-accounts.controller";

@Module({
  imports: [DashboardModule, OpsModule, AuthModule],
  controllers: [DashboardPayoutAccountsController, OpsPayoutAccountsController],
  providers: [PayoutAccountsService, PrivateFilesService],
  exports: [PayoutAccountsService],
})
export class PayoutAccountsModule {}
