import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { MerchantsModule } from "./merchants/merchants.module";
import { PaymentIntentsModule } from "./payment-intents/payment-intents.module";
import { RefundsModule } from "./refunds/refunds.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { RailsModule } from "./rails/rails.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";
import { InvoicingModule } from "./invoicing/invoicing.module";
import { PayoutsModule } from "./payouts/payouts.module";
import { OpsModule } from "./ops/ops.module";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    MerchantsModule,
    RailsModule,
    PaymentIntentsModule,
    RefundsModule,
    WebhooksModule,
    IdempotencyModule,
    InvoicingModule,
    PayoutsModule,
    OpsModule,
    DashboardModule,
  ],
})
export class AppModule {}
