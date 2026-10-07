import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";
import { SettlementQueryService } from "./settlement-query.service";
import { DashboardSettlementController } from "./dashboard-settlement.controller";

@Module({
  imports: [LedgerModule, AuthModule, DashboardModule],
  controllers: [DashboardSettlementController],
  providers: [SettlementPolicyService, SettlementHoldService, SettlementQueryService],
  exports: [SettlementPolicyService, SettlementHoldService, SettlementQueryService],
})
export class SettlementModule {}
