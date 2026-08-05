import { Module } from "@nestjs/common";
import { PaymentIntentsService } from "./payment-intents.service";
import { PaymentIntentsController } from "./payment-intents.controller";
import { CheckoutSessionController } from "./checkout-session.controller";
import { RailCallbackController } from "./rail-callback.controller";
import { RailsModule } from "../rails/rails.module";
import { PaymentMethodsModule } from "../payment-methods/payment-methods.module";
import { LedgerModule } from "../ledger/ledger.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { InvoicingModule } from "../invoicing/invoicing.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [RailsModule, PaymentMethodsModule, LedgerModule, WebhooksModule, InvoicingModule, AuthModule, DashboardModule],
  controllers: [PaymentIntentsController, CheckoutSessionController, RailCallbackController],
  providers: [PaymentIntentsService],
  exports: [PaymentIntentsService],
})
export class PaymentIntentsModule {}
