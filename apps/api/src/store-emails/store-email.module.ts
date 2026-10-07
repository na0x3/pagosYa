import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { EmailKitService } from './email-kit.service';
import { EmailKitStore } from './email-kit-store';
import { StoreEmailService } from './store-email.service';

@Module({
  imports: [PrismaModule, AiUsageModule],
  providers: [EmailKitStore, StoreEmailService, EmailKitService],
  exports: [EmailKitStore, StoreEmailService, EmailKitService],
})
export class StoreEmailModule {}
