import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AiUsageModule } from '../ai-usage/ai-usage.module';
import { ProductPageWriterService } from './product-page-writer.service';

/** The long product page writer, shared by product create, YAPI store builds and the Studio regenerate button. */
@Module({ imports: [UploadsModule, AiUsageModule], providers: [ProductPageWriterService], exports: [ProductPageWriterService] })
export class ProductPageModule {}
