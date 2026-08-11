import { randomUUID } from "crypto";
import { BadRequestException, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { UploadsService, ALLOWED_MIME_TO_EXT, MAX_UPLOAD_BYTES } from "./uploads.service";
import { UploadsController } from "./uploads.controller";
import { DashboardModule } from "../dashboard/dashboard.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AuthModule,
    DashboardModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: config.get<string>("app.uploadsDir")!,
          filename: (_req, file, cb) => {
            const ext = ALLOWED_MIME_TO_EXT[file.mimetype];
            if (!ext) {
              cb(new BadRequestException("Formato no soportado (usa PNG, JPEG, WEBP, GIF, MP4 o WEBM)"), "");
              return;
            }
            cb(null, `${randomUUID()}.${ext}`);
          },
        }),
        fileFilter: (_req, file, cb) => {
          if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
            cb(new BadRequestException("Formato no soportado (usa PNG, JPEG, WEBP, GIF, MP4 o WEBM)"), false);
            return;
          }
          cb(null, true);
        },
        limits: { fileSize: MAX_UPLOAD_BYTES },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
