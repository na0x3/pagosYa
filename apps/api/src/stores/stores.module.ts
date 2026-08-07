import { Module } from "@nestjs/common";
import { StoresService } from "./stores.service";
import { StoresController } from "./stores.controller";
import { StoresPublicController } from "./stores-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PaymentIntentsModule, DashboardModule, AuthModule],
  controllers: [StoresController, StoresPublicController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
