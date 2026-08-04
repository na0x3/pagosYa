import { Module } from "@nestjs/common";
import { MockCardRailAdapter } from "./adapters/mock-card.adapter";
import { MockTigoMoneyAdapter } from "./adapters/mock-tigo-money.adapter";
import { MockBankTransferRailAdapter } from "./adapters/mock-bank-transfer.adapter";
import { MockQrRailAdapter } from "./adapters/mock-qr.adapter";
import { RailRegistry } from "./rail-registry.service";
import { RAIL_ADAPTERS } from "./tokens";
import { PaymentRailAdapter } from "./interfaces/payment-rail-adapter.interface";

@Module({
  providers: [
    MockCardRailAdapter,
    MockTigoMoneyAdapter,
    MockBankTransferRailAdapter,
    MockQrRailAdapter,
    {
      provide: RAIL_ADAPTERS,
      useFactory: (
        card: MockCardRailAdapter,
        tigo: MockTigoMoneyAdapter,
        bank: MockBankTransferRailAdapter,
        qr: MockQrRailAdapter,
      ): PaymentRailAdapter[] => [card, tigo, bank, qr],
      inject: [MockCardRailAdapter, MockTigoMoneyAdapter, MockBankTransferRailAdapter, MockQrRailAdapter],
    },
    RailRegistry,
  ],
  exports: [RailRegistry],
})
export class RailsModule {}
