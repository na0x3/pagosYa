import { Module } from "@nestjs/common";
import { PaymentIntentsService } from "./payment-intents.service";
import { PaymentIntentsController } from "./payment-intents.controller";
import { CheckoutSessionController } from "./checkout-session.controller";
import { RailCallbackController } from "./rail-callback.controller";
import { BanecoQrWebhookController } from "./baneco-qr-webhook.controller";
import { DlocalWebhookController } from "./dlocal-webhook.controller";
import { DlocalReconciliationWorker } from "./dlocal-reconciliation.worker";
import { RailsModule } from "../rails/rails.module";
import { PaymentMethodsModule } from "../payment-methods/payment-methods.module";
import { LedgerModule } from "../ledger/ledger.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { InvoicingModule } from "../invoicing/invoicing.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { InternationalModule } from "../international/international.module";
import { RefundsModule } from "../refunds/refunds.module";

@Module({
  imports: [RailsModule, PaymentMethodsModule, LedgerModule, WebhooksModule, InvoicingModule, AuthModule, DashboardModule, InternationalModule, RefundsModule],
  controllers: [PaymentIntentsController, CheckoutSessionController, RailCallbackController, BanecoQrWebhookController, DlocalWebhookController],
  providers: [PaymentIntentsService, DlocalReconciliationWorker],
  exports: [PaymentIntentsService],
})
export class PaymentIntentsModule {}
