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

@Module({
  imports: [PaymentIntentsModule, DashboardModule, AuthModule, UploadsModule],
  controllers: [StoresController, StoresPublicController, PromoCodesController],
  providers: [StoresService, VisualStudioService, CustomDomainsService, PromoCodesService],
  exports: [StoresService],
})
export class StoresModule {}
