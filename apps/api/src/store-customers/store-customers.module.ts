import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StoreCustomersController } from './store-customers.controller';
import { StoreCustomersService } from './store-customers.service';

/** Per-store shopper accounts: register, confirm email, sign in, recover a password, orders, profile and addresses. */
@Module({
  imports: [DashboardModule],
  controllers: [StoreCustomersController],
  providers: [StoreCustomersService],
  exports: [StoreCustomersService],
})
export class StoreCustomersModule {}
