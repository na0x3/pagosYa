import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SellingController } from './selling.controller';
import { SellingJob } from './selling.job';
import { SellingService } from './selling.service';

@Module({ imports: [DashboardModule, AuthModule], controllers: [SellingController], providers: [SellingService, SellingJob], exports: [SellingService] })
export class SellingModule {}
