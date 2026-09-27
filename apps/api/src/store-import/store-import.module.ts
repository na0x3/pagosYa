import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StoreImportController } from './store-import.controller';
import { StoreImportService } from './store-import.service';
import { StoreImportWorker } from './store-import.worker';

@Module({ imports: [StoresModule, UploadsModule], controllers: [StoreImportController], providers: [StoreImportService, StoreImportWorker] })
export class StoreImportModule {}
