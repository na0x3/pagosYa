import { CommercePlatformModule } from './commerce-platform/commerce-platform.module';
import { Module } from "@nestjs/common";
import * as path from "path";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
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
import { PaymentLinksModule } from "./payment-links/payment-links.module";
import { StoresModule } from "./stores/stores.module";
import { CategoriesModule } from "./categories/categories.module";
import { FinancesModule } from "./finances/finances.module";
import { UploadsModule } from "./uploads/uploads.module";
import { DebtCollectionsModule } from "./debt-collections/debt-collections.module";
import { ConsumerModule } from "./consumer/consumer.module";
// Store-level CRM, inventory, appointments, delivery, POS, and integrations.
import { OperationsModule } from "./operations/operations.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [
        path.join(path.basename(process.cwd()) === "api" ? process.cwd() : path.join(process.cwd(), "apps", "api"), ".env.local"),
        path.join(path.basename(process.cwd()) === "api" ? process.cwd() : path.join(process.cwd(), "apps", "api"), ".env"),
      ],
    }),
    // A dashboard refresh intentionally fans out across finances, stores,
    // products, payments, compliance, and visual-studio state. Keep enough
    // headroom for normal navigation and store switching while auth-adjacent
    // endpoints retain their tighter 5–10 req/min route overrides below.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>("app.redisUrl");
        return {
          throttlers: [{ ttl: 60_000, limit: 120 }],
          ...(redisUrl ? { storage: new ThrottlerStorageRedisService(redisUrl) } : {}),
        };
      },
    }),
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
    StoresModule,
    PaymentLinksModule,
    CategoriesModule,
    FinancesModule,
    UploadsModule,
    DebtCollectionsModule,
    ConsumerModule,
    OperationsModule,
    CommercePlatformModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
