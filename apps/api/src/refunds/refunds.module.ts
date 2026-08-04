import { Module } from "@nestjs/common";
import { RefundsService } from "./refunds.service";
import { RefundsController } from "./refunds.controller";
import { RailsModule } from "../rails/rails.module";
import { LedgerModule } from "../ledger/ledger.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [RailsModule, LedgerModule, WebhooksModule, AuthModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
