import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";

@Module({
  imports: [LedgerModule],
  providers: [SettlementPolicyService, SettlementHoldService],
  exports: [SettlementPolicyService, SettlementHoldService],
})
export class SettlementModule {}
