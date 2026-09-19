import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiUsageModule } from "../ai-usage/ai-usage.module";
import { BrandProfileController } from "./brand-profile.controller";
import { BrandProfileService } from "./brand-profile.service";

/** A store's confirmed brand facts (colors, voice, logo), imported from its website or photos. */
@Module({
  imports: [DashboardModule, AuthModule, UploadsModule, AiUsageModule],
  controllers: [BrandProfileController],
  providers: [BrandProfileService],
  exports: [BrandProfileService],
})
export class BrandModule {}
