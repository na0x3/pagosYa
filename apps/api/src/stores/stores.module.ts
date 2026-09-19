import { Module } from "@nestjs/common";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { StoresPublicController } from "./stores-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { PaymentLinksModule } from "../payment-links/payment-links.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { RetentionModule } from "../retention/retention.module";
import { DomainsModule } from "../domains/domains.module";
import { PromoCodesModule } from "../promo-codes/promo-codes.module";

/** Store core: creating and configuring stores, the public store API, and store checkout.
 * Features built on a store (source projects, brand, retention, domains, SEO, …) are
 * separate modules; see docs/ARCHITECTURE.md. */
@Module({
  imports: [PaymentIntentsModule, PaymentLinksModule, DashboardModule, AuthModule, UploadsModule, RetentionModule, DomainsModule, PromoCodesModule],
  controllers: [StoresController, StoresPublicController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
