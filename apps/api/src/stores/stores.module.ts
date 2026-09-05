import { Module } from "@nestjs/common";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { StoresPublicController } from "./stores-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { VisualStudioService } from "./visual-studio.service";
import { CustomDomainsService } from "./custom-domains.service";
import { PromoCodesController } from "../promo-codes/promo-codes.controller";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { StoreAgentService } from "./store-agent.service";
import { PaymentLinksModule } from "../payment-links/payment-links.module";
import { SourceProjectsController } from "./source-projects.controller";
import { SourceProjectsService } from "./source-projects.service";

@Module({
  imports: [PaymentIntentsModule, PaymentLinksModule, DashboardModule, AuthModule, UploadsModule],
  controllers: [StoresController, StoresPublicController, PromoCodesController, SourceProjectsController],
  providers: [StoresService, VisualStudioService, StoreAgentService, CustomDomainsService, PromoCodesService, SourceProjectsService],
  exports: [StoresService],
})
export class StoresModule {}
