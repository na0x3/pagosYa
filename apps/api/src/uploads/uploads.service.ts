import * as fs from "fs";
import * as path from "path";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

// Matches exactly what the multer diskStorage filename() in uploads.module.ts ever
// writes (randomUUID() + one of the extensions above) — anything else, including any
// ".." or "/", is rejected by the pattern itself rather than by explicit traversal checks.
export const UPLOAD_FILENAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif|mp4|webm)$/;

export const MAX_IMAGE_UPLOAD_BYTES = 3_000_000;
export const MAX_GIF_UPLOAD_BYTES = 8_000_000;
export const MAX_VIDEO_UPLOAD_BYTES = 20_000_000;
export const MAX_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;

export function maxUploadBytesForMime(mime: string): number {
  if (mime === "image/gif") return MAX_GIF_UPLOAD_BYTES;
  if (mime.startsWith("video/")) return MAX_VIDEO_UPLOAD_BYTES;
  return MAX_IMAGE_UPLOAD_BYTES;
}

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    fs.mkdirSync(this.uploadsDir(), { recursive: true });
  }

  uploadsDir(): string {
    return this.config.get<string>("app.uploadsDir")!;
  }

  contentTypeFor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "mp4") return "video/mp4";
    if (ext === "webm") return "video/webm";
    return "image/jpeg";
  }

  resolvePath(filename: string): string {
    return path.join(this.uploadsDir(), filename);
  }

  /**
   * Best-effort disk cleanup for a store/product's photos once the DB rows
   * that reference them are gone (see StoresService.remove(),
   * PaymentLinksService.remove()) — takes whatever mix of "/v1/uploads/..."
   * urls and nulls a caller has lying around (logoUrl, bannerUrl, imageUrls,
   * etc) and silently skips anything that isn't a well-formed upload path or
   * is already gone, so one missing/malformed entry never blocks the rest.
   */
  async deleteFiles(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(
      urls.map(async (url) => {
        if (!url) return;
        const filename = url.split("/").pop();
        if (!filename || !UPLOAD_FILENAME_PATTERN.test(filename)) return;
        try {
          await fs.promises.unlink(this.resolvePath(filename));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            this.logger.warn(`Failed to delete upload ${filename}: ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
