import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';
import { SecretBox } from './secret-box';

// DashboardModule and AuthModule carry what MerchantAuthGuard needs (see store-import.module.ts).
@Module({ imports: [DashboardModule, AuthModule], controllers: [ExtensionsController], providers: [ExtensionsService, SecretBox], exports: [ExtensionsService, SecretBox] })
export class ExtensionsModule {}
