import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderEmailService } from './order-email.service';

@Module({
  imports: [PrismaModule],
  providers: [OrderEmailService],
  exports: [OrderEmailService],
})
export class OrderEmailModule {}
