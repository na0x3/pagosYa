import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StoreSeoModule } from '../store-seo/store-seo.module';
import { ExtensionDeliveryService } from './extension-delivery.service';
import { ExtensionDeliveryWorker } from './extension-delivery.worker';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';
import { SecretBox } from './secret-box';

// DashboardModule and AuthModule carry what MerchantAuthGuard needs (see store-import.module.ts).
@Module({ imports: [DashboardModule, AuthModule, StoreSeoModule], controllers: [ExtensionsController], providers: [ExtensionsService, SecretBox, ExtensionDeliveryService, ExtensionDeliveryWorker], exports: [ExtensionsService, SecretBox] })
export class ExtensionsModule {}
