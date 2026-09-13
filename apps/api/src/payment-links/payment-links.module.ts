import { Module } from "@nestjs/common";
import { PaymentLinksService } from "./payment-links.service";
import { PaymentLinksController } from "./payment-links.controller";
import { ProductSubscriptionsPublicController } from "./product-subscriptions-public.controller";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { InvoicingModule } from "../invoicing/invoicing.module";

@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, InvoicingModule],
  controllers: [PaymentLinksController, ProductSubscriptionsPublicController],
  providers: [PaymentLinksService],
  exports: [PaymentLinksService],
})
export class PaymentLinksModule {}
