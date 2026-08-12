import { Module } from "@nestjs/common";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { StoresPublicController } from "./stores-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { VisualStudioService } from "./visual-studio.service";

@Module({
  imports: [PaymentIntentsModule, DashboardModule, AuthModule, UploadsModule],
  controllers: [StoresController, StoresPublicController],
  providers: [StoresService, VisualStudioService],
  exports: [StoresService],
})
export class StoresModule {}
