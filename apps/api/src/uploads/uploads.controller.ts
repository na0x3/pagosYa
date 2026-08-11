import * as fs from "fs";
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { maxUploadBytesForMime, UploadsService, UPLOAD_FILENAME_PATTERN } from "./uploads.service";
import { UploadResponseDto } from "./dto/upload-response.dto";

/**
 * Local-disk image storage for Payment Links product photos and merchant store
 * branding (logo) — replaces the earlier base64-in-DB approach. One generic
 * endpoint serves both use cases since they're both merchant-owned images with
 * identical validation; the caller decides what to do with the returned url
 * (imageUrl on a PaymentLink, logoUrl on merchant branding, etc). The actual
 * multer disk-storage config (destination, filename, mime allowlist, size limit)
 * lives in UploadsModule, registered via MulterModule.registerAsync so it can
 * read UPLOADS_DIR through ConfigService like the rest of the app's config.
 */
@ApiTags("uploads")
@Controller("v1/uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @ApiOkResponse({ type: UploadResponseDto })
  @UseGuards(MerchantAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  uploadFile(@UploadedFile() file: Express.Multer.File): UploadResponseDto {
    const limit = maxUploadBytesForMime(file.mimetype);
    if (file.size > limit) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // The validation error is still the useful response if cleanup races.
      }
      const limitMb = Math.floor(limit / 1_000_000);
      throw new BadRequestException(`El archivo supera el máximo de ${limitMb} MB para este formato`);
    }
    return { url: `/v1/uploads/${file.filename}` };
  }

  /** Public — buyers on a checkout/storefront page must be able to load product photos and the merchant logo without any credential. */
  @Get(":filename")
  getFile(@Param("filename") filename: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) throw new NotFoundException("Not found");
    const filePath = this.uploads.resolvePath(filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException("Not found");

    res.set({
      "Content-Type": this.uploads.contentTypeFor(filename),
      // Filenames are random UUIDs and never reused/overwritten, so a long-lived
      // immutable cache is always safe.
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }
}
