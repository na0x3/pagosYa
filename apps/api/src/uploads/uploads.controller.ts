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
import { SkipThrottle } from "@nestjs/throttler";
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

  /** Public — buyers on a checkout/storefront page must be able to load product photos and the merchant logo without any credential.
   *  Not rate limited: the files are immutable and cached for a year, and a merchant's «Tus tiendas» page alone (one live preview
   *  per store, every product photo and its sizes) used the hourly 7,200 in a few visits, after which photos «disappeared»
   *  (owner 2026-10-26). Uploads stay limited. */
  @Get(":filename")
  @SkipThrottle({ default: true, sustained: true })
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

    // Owner 2026-11-17 (product videos): Safari plays a video only from byte ranges, so a ranged request for an MP4 gets
    // the slice it asked for (uploads are at most 20 MB).
    const range = !width && /\.mp4$/i.test(filename) ? /^bytes=(\d*)-(\d*)$/.exec(String(res.req?.headers?.range ?? "").trim()) : null;
    if (range) {
      const whole = await this.uploads.getBuffer(filename);
      if (!whole) throw new NotFoundException("Archivo no encontrado");
      const size = whole.length;
      const start = range[1] === "" ? Math.max(0, size - Number(range[2] || 0)) : Number(range[1]);
      const end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
      if (start >= size || start > end) { res.set({ ...headers, "Content-Range": `bytes */${size}` }); res.status(416); return; }
      res.set({ ...headers, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
      res.status(206);
      return new StreamableFile(whole.subarray(start, end + 1));
    }
    const file = width ? await this.uploads.getResized(filename, width) : await this.uploads.getStream(filename);
    if (!file) throw new NotFoundException(width ? "Esta imagen no tiene versiones de tamaño." : "Archivo no encontrado");
    res.set({ ...headers, "Content-Length": file.byteSize, ...(/\.mp4$/i.test(filename) && !width ? { "Accept-Ranges": "bytes" } : {}) });
    // A request the browser drops (a video seek, a closed tab) lets go of the file at once.
    if (typeof (res as { once?: unknown }).once === "function") res.once("close", () => file.stream.destroy());
    return new StreamableFile(file.stream);
  }
}
