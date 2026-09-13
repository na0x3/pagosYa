import { StorePagesService } from './store-pages.service';
import { StorePagesController, StoreRedirectsController } from './store-pages.controller';
import { CreditExpiryService } from './credit-expiry.service';
import { PaymentIntentsModule } from '../payment-intents/payment-intents.module';
import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AuthModule } from '../auth/auth.module';
import { CommercePlatformService } from './commerce-platform.service';
import { PrivateFilesService } from './private-files.service';
import { CommercePlatformController, CommerceDownloadsController } from './commerce-platform.controller';
@Module({ imports: [DashboardModule, AuthModule, PaymentIntentsModule], controllers: [CommercePlatformController, CommerceDownloadsController, StorePagesController, StoreRedirectsController], providers: [CommercePlatformService, PrivateFilesService, CreditExpiryService, StorePagesService] })
export class CommercePlatformModule {}
