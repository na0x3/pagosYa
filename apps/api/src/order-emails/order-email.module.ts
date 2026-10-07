import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { OrderEmailController } from './order-email.controller';
import { OrderEmailService } from './order-email.service';

/** DashboardModule carries both MerchantAuthGuard and EMAIL_PROVIDER, which the preview routes need. */
@Module({
  imports: [PrismaModule, DashboardModule, AuthModule],
  controllers: [OrderEmailController],
  providers: [OrderEmailService, MerchantThrottlerGuard],
  exports: [OrderEmailService],
})
export class OrderEmailModule {}
