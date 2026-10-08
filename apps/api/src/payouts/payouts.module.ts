import { Module } from "@nestjs/common";
import { PayoutsService } from "./payouts.service";
import { PayoutScheduleJob } from "./payout-schedule.job";
import { SettlementModule } from "../settlement/settlement.module";
import { PayoutDeliveryWorker } from "./payout-delivery.worker";
import { PayoutsController } from "./payouts.controller";
import { MockBankDisbursementAdapter } from "./adapters/mock-bank-disbursement.adapter";
import { PAYOUT_PROVIDER } from "./tokens";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { LegalModule } from "../legal/legal.module";

@Module({
  imports: [AuthModule, LedgerModule, DashboardModule, LegalModule, SettlementModule],
  controllers: [PayoutsController],
  providers: [
    PayoutsService,
    PayoutDeliveryWorker,
    PayoutScheduleJob,
    { provide: PAYOUT_PROVIDER, useClass: MockBankDisbursementAdapter },
  ],
  exports: [PayoutsService],
})
export class PayoutsModule {}
