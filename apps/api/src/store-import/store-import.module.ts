import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { StorefrontSourceModule } from '../storefront-source/storefront-source.module';
import { StoresModule } from '../stores/stores.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StoreImportController } from './store-import.controller';
import { StoreImportService } from './store-import.service';
import { StoreImportWorker } from './store-import.worker';

// DashboardModule and AuthModule carry what MerchantAuthGuard needs (ApiKeyService, the session service).
@Module({ imports: [DashboardModule, AuthModule, StoresModule, UploadsModule, StorefrontSourceModule], controllers: [StoreImportController], providers: [StoreImportService, StoreImportWorker, MerchantThrottlerGuard] })
export class StoreImportModule {}
