import { Module } from "@nestjs/common";
import { MerchantUserService } from "./merchant-user.service";
import { MerchantSessionService } from "./merchant-session.service";
import { MerchantAuthGuard } from "./guards/merchant-auth.guard";
import { MerchantSessionGuard } from "./guards/merchant-session.guard";
import { DashboardController } from "./dashboard.controller";
import { MockEmailProvider } from "./adapters/mock-email.provider";
import { EMAIL_PROVIDER } from "./tokens";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    MerchantUserService,
    MerchantSessionService,
    MerchantAuthGuard,
    MerchantSessionGuard,
    { provide: EMAIL_PROVIDER, useClass: MockEmailProvider },
  ],
  exports: [MerchantUserService, MerchantSessionService, MerchantAuthGuard, MerchantSessionGuard],
})
export class DashboardModule {}
