import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { StoreEmailController } from './store-email.controller';
import { EmailAssetsController } from './email-assets.controller';
import { EmailKitService } from './email-kit.service';
import { EmailContentStore } from './email-content-store';
import { EmailKitStore } from './email-kit-store';
import { StoreEmailService } from './store-email.service';

@Module({
  imports: [PrismaModule, AiUsageModule, DashboardModule, AuthModule],
  controllers: [StoreEmailController, EmailAssetsController],
  providers: [EmailKitStore, EmailContentStore, StoreEmailService, EmailKitService, MerchantThrottlerGuard],
  exports: [EmailKitStore, EmailContentStore, StoreEmailService, EmailKitService],
})
export class StoreEmailModule {}
