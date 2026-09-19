import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { maxUploadBytesForMime, RESPONSIVE_WIDTHS, UploadsService, UPLOAD_FILENAME_PATTERN } from "./uploads.service";
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
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async getFile(
    @Param("filename") filename: string,
    @Res({ passthrough: true }) res: Response,
    @Headers("if-none-match") ifNoneMatch?: string,
    @Query("w") widthParam?: string,
  ): Promise<StreamableFile | undefined> {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) throw new NotFoundException("Archivo no encontrado");
    // Storefronts request width-limited WebP copies for srcset; only the fixed widths are served.
    const width = widthParam === undefined ? undefined : Number(widthParam);
    if (width !== undefined && !(RESPONSIVE_WIDTHS as readonly number[]).includes(width)) throw new BadRequestException(`Ancho no disponible. Usa ${RESPONSIVE_WIDTHS.join(", ")}.`);
    const etag = width ? `"${filename}-w${width}"` : `"${filename}"`;
    const headers = {
      "Content-Type": width ? "image/webp" : this.uploads.contentTypeFor(filename),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Filenames are random UUIDs and never reused/overwritten, so a long-lived
      // immutable cache is always safe.
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    };
    // GET uses weak comparison, including validators in a comma-separated list.
    const matches = ifNoneMatch?.split(",").some(value => {
      const tag = value.trim();
      return tag === "*" || tag.replace(/^W\//, "") === etag;
    });
    if (matches) {
      if (!await this.uploads.exists(filename)) throw new NotFoundException("Archivo no encontrado");
      res.set(headers);
      res.status(304);
      return;
    }

    const file = width ? await this.uploads.getResized(filename, width) : await this.uploads.getStream(filename);
    if (!file) throw new NotFoundException(width ? "Esta imagen no tiene versiones de tamaño." : "Archivo no encontrado");
    res.set({ ...headers, "Content-Length": file.byteSize });
    return new StreamableFile(file.stream);
  }
}
