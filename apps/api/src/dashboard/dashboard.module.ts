import { Module } from "@nestjs/common";
import { MerchantUserService } from "./merchant-user.service";
import { MerchantSessionService } from "./merchant-session.service";
import { MerchantAuthGuard } from "./guards/merchant-auth.guard";
import { MerchantSessionGuard } from "./guards/merchant-session.guard";
import { DashboardController } from "./dashboard.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [MerchantUserService, MerchantSessionService, MerchantAuthGuard, MerchantSessionGuard],
  exports: [MerchantUserService, MerchantSessionService, MerchantAuthGuard, MerchantSessionGuard],
})
export class DashboardModule {}
