import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockCardRailAdapter } from "./adapters/mock-card.adapter";
import { MockTigoMoneyAdapter } from "./adapters/mock-tigo-money.adapter";
import { MockBankTransferRailAdapter } from "./adapters/mock-bank-transfer.adapter";
import { MockQrRailAdapter } from "./adapters/mock-qr.adapter";
import { BanecoClientService } from "./adapters/baneco/baneco-client.service";
import { BanecoQrAdapter } from "./adapters/baneco/baneco-qr.adapter";
import { RailRegistry } from "./rail-registry.service";
import { RAIL_ADAPTERS } from "./tokens";
import { PaymentRailAdapter } from "./interfaces/payment-rail-adapter.interface";

@Module({
  providers: [
    MockCardRailAdapter,
    MockTigoMoneyAdapter,
    MockBankTransferRailAdapter,
    MockQrRailAdapter,
    BanecoClientService,
    BanecoQrAdapter,
    {
      provide: RAIL_ADAPTERS,
      // BANECO_QR_ENABLED is the single switch between MockQrRailAdapter and
      // BanecoQrAdapter for PaymentMethodType.QR — swapping providers here
      // (rather than in RailRegistry) keeps "which bank is live" a one-line,
      // one-file decision.
      useFactory: (
        card: MockCardRailAdapter,
        tigo: MockTigoMoneyAdapter,
        bank: MockBankTransferRailAdapter,
        mockQr: MockQrRailAdapter,
        banecoQr: BanecoQrAdapter,
        config: ConfigService,
      ): PaymentRailAdapter[] => {
        const qr = config.get<boolean>("app.banecoQr.enabled") ? banecoQr : mockQr;
        return [card, tigo, bank, qr];
      },
      inject: [
        MockCardRailAdapter,
        MockTigoMoneyAdapter,
        MockBankTransferRailAdapter,
        MockQrRailAdapter,
        BanecoQrAdapter,
        ConfigService,
      ],
    },
    RailRegistry,
  ],
  exports: [RailRegistry],
})
export class RailsModule {}
