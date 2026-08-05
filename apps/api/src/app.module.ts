import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // Global default: 20 req/min per IP. Auth-adjacent endpoints (merchant
    // signup, dashboard login/signup/password-reset) set a tighter @Throttle
    // override on the route itself — see their controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
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
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
