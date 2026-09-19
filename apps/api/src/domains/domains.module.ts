import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { CustomDomainsController } from "./custom-domains.controller";
import { CustomDomainsService } from "./custom-domains.service";
import { DomainCommerceController } from "./domain-commerce.controller";
import { DomainCommerceService } from "./domain-commerce.service";
import { NamecomProvider } from "./namecom.provider";
import { CloudflareHostingProvider } from "./cloudflare-hosting.provider";

/** Custom domains: connecting a domain the merchant owns, and buying one through us. */
@Module({
  imports: [DashboardModule, AuthModule, PaymentIntentsModule],
  controllers: [DomainCommerceController, CustomDomainsController],
  providers: [CustomDomainsService, DomainCommerceService, NamecomProvider, CloudflareHostingProvider],
  exports: [CustomDomainsService],
})
export class DomainsModule {}
