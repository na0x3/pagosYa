import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailKitStore } from './email-kit-store';
import { StoreEmailService } from './store-email.service';

@Module({
  imports: [PrismaModule],
  providers: [EmailKitStore, StoreEmailService],
  exports: [EmailKitStore, StoreEmailService],
})
export class StoreEmailModule {}
