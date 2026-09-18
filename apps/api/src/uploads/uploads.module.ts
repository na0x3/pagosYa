import { BadRequestException, Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UploadsService, ALLOWED_MIME_TO_EXT, MAX_UPLOAD_BYTES } from "./uploads.service";
import { UploadsController } from "./uploads.controller";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AuthModule,
    DashboardModule,
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
          cb(new BadRequestException("Formato no soportado (usa PNG, JPEG, WEBP, GIF, MP4, WEBM o WOFF2)"), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
