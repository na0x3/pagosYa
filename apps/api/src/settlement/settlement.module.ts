import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { OpsModule } from "../ops/ops.module";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";
import { SettlementQueryService } from "./settlement-query.service";
import { DashboardSettlementController } from "./dashboard-settlement.controller";
import { OpsSettlementController } from "./ops-settlement.controller";
import { SettlementAdminService } from "./settlement-admin.service";

@Module({
  imports: [LedgerModule, AuthModule, DashboardModule, OpsModule],
  controllers: [DashboardSettlementController, OpsSettlementController],
  providers: [SettlementPolicyService, SettlementHoldService, SettlementQueryService, SettlementAdminService],
  exports: [SettlementPolicyService, SettlementHoldService, SettlementQueryService],
})
export class SettlementModule {}
