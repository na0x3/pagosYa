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
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PrismaService } from "../prisma/prisma.service";
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
  constructor(private readonly uploads: UploadsService, private readonly prisma: PrismaService) {}

  @Post()
  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @ApiOkResponse({ type: UploadResponseDto })
  @UseGuards(MerchantAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(@CurrentMerchant() merchant: { id: string }, @UploadedFile() file: Express.Multer.File): Promise<UploadResponseDto> {
    if (!file) throw new BadRequestException("Selecciona un archivo");
    const limit = maxUploadBytesForMime(file.mimetype);
    if (file.size > limit) {
      const limitMb = Math.floor(limit / 1_000_000);
      throw new BadRequestException(`El archivo supera el máximo de ${limitMb} MB para este formato`);
    }
    const stored = await this.uploads.saveUpload(file);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        merchantId: merchant.id,
        url: stored.url,
        storageKey: stored.filename,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
      },
    });
    return { url: stored.url, assetId: asset.id };
  }

  /** Public — buyers on a checkout/storefront page must be able to load product photos and the merchant logo without any credential. */
  @Get(":filename")
  async getFile(@Param("filename") filename: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) throw new NotFoundException("Not found");
    const body = await this.uploads.getBuffer(filename);
    if (!body) throw new NotFoundException("Not found");

    res.set({
      "Content-Type": this.uploads.contentTypeFor(filename),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Filenames are random UUIDs and never reused/overwritten, so a long-lived
      // immutable cache is always safe.
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    return new StreamableFile(body);
  }
}
