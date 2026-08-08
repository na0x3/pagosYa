import { Module } from "@nestjs/common";
import { PaymentLinksService } from "./payment-links.service";
import { PaymentLinksController } from "./payment-links.controller";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";

@Module({
  imports: [DashboardModule, AuthModule, UploadsModule],
  controllers: [PaymentLinksController],
  providers: [PaymentLinksService],
})
export class PaymentLinksModule {}
