import { Module } from "@nestjs/common";
import { PaymentLinksService } from "./payment-links.service";
import { PaymentLinksController } from "./payment-links.controller";
import { PaymentLinksPublicController } from "./payment-links-public.controller";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PaymentIntentsModule, DashboardModule, AuthModule],
  controllers: [PaymentLinksController, PaymentLinksPublicController],
  providers: [PaymentLinksService],
})
export class PaymentLinksModule {}
