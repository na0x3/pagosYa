import { Module } from "@nestjs/common";
import { PayoutsService } from "./payouts.service";
import { PayoutDeliveryWorker } from "./payout-delivery.worker";
import { PayoutsController } from "./payouts.controller";
import { MockBankDisbursementAdapter } from "./adapters/mock-bank-disbursement.adapter";
import { PAYOUT_PROVIDER } from "./tokens";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PayoutsController],
  providers: [
    PayoutsService,
    PayoutDeliveryWorker,
    { provide: PAYOUT_PROVIDER, useClass: MockBankDisbursementAdapter },
  ],
  exports: [PayoutsService],
})
export class PayoutsModule {}
