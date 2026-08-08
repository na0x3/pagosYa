import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantUserService } from "./merchant-user.service";
import { MerchantSessionService } from "./merchant-session.service";
import { MerchantAuthGuard } from "./guards/merchant-auth.guard";
import { MerchantSessionGuard } from "./guards/merchant-session.guard";
import { DashboardController } from "./dashboard.controller";
import { MockEmailProvider } from "./adapters/mock-email.provider";
import { ResendEmailProvider } from "./adapters/resend-email.provider";
import { EmailProvider } from "./interfaces/email-provider.interface";
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
    MockEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      // RESEND_API_KEY is the single switch between MockEmailProvider (logs
      // to console) and ResendEmailProvider (real send) — same pattern as
      // BANECO_QR_ENABLED in RailsModule.
      useFactory: (mock: MockEmailProvider, resend: ResendEmailProvider, config: ConfigService): EmailProvider =>
        config.get<string>("app.email.resendApiKey") ? resend : mock,
      inject: [MockEmailProvider, ResendEmailProvider, ConfigService],
    },
  ],
  exports: [MerchantUserService, MerchantSessionService, MerchantAuthGuard, MerchantSessionGuard, EMAIL_PROVIDER],
})
export class DashboardModule {}
