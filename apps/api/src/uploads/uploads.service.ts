import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const UPLOAD_FILENAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif|mp4|webm)$/;
// Full-bleed storefront backgrounds need enough source pixels for high-density
// displays. Eight megabytes leaves room for a 2880px+ JPEG, WEBP, or PNG while
// keeping the generic image endpoint bounded.
export const MAX_IMAGE_UPLOAD_BYTES = 8_000_000;
export const MAX_GIF_UPLOAD_BYTES = 8_000_000;
export const MAX_VIDEO_UPLOAD_BYTES = 20_000_000;
export const MAX_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;

export function maxUploadBytesForMime(mime: string): number {
  if (mime === "image/gif") return MAX_GIF_UPLOAD_BYTES;
  if (mime.startsWith("video/")) return MAX_VIDEO_UPLOAD_BYTES;
  return MAX_IMAGE_UPLOAD_BYTES;
}

export function detectedMediaMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const firstSix = buffer.subarray(0, 6).toString("ascii");
  if (firstSix === "GIF87a" || firstSix === "GIF89a") return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

export interface StoredUpload {
  filename: string;
  url: string;
  mimeType: string;
  byteSize: number;
}

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>("app.objectStorage.bucket") ?? "";
    const endpoint = config.get<string>("app.objectStorage.endpoint") ?? "";
    const accessKeyId = config.get<string>("app.objectStorage.accessKeyId") ?? "";
    const secretAccessKey = config.get<string>("app.objectStorage.secretAccessKey") ?? "";
    this.s3 = this.bucket && endpoint && accessKeyId && secretAccessKey
      ? new S3Client({
          endpoint,
          region: config.get<string>("app.objectStorage.region") ?? "us-east-1",
          forcePathStyle: config.get<boolean>("app.objectStorage.forcePathStyle") ?? true,
          credentials: { accessKeyId, secretAccessKey },
        })
      : null;
  }

  onModuleInit() {
    if (!this.s3) fs.mkdirSync(this.uploadsDir(), { recursive: true });
    this.logger.log(this.s3 ? `Uploads using object storage bucket ${this.bucket}` : `Uploads using ${this.uploadsDir()}`);
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

  async saveUpload(file: Express.Multer.File): Promise<StoredUpload> {
    return this.saveBuffer(file.buffer, file.mimetype);
  }

  async saveBuffer(buffer: Buffer, mimeType: string): Promise<StoredUpload> {
    const ext = ALLOWED_MIME_TO_EXT[mimeType];
    if (!ext) throw new BadRequestException("Unsupported upload media type");
    if (detectedMediaMime(buffer) !== mimeType) {
      throw new BadRequestException("File contents do not match the declared media type");
    }
    const filename = `${randomUUID()}.${ext}`;
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: filename, Body: buffer, ContentType: mimeType }));
    } else {
      await fs.promises.writeFile(this.resolvePath(filename), buffer, { flag: "wx" });
    }
    return { filename, url: `/v1/uploads/${filename}`, mimeType, byteSize: buffer.byteLength };
  }

  async getBuffer(filename: string): Promise<Buffer | null> {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) return null;
    if (this.s3) {
      try {
        const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: filename }));
        if (!object.Body) return null;
        return Buffer.from(await object.Body.transformToByteArray());
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey" || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    }
    try {
      return await fs.promises.readFile(this.resolvePath(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async exists(filename: string): Promise<boolean> {
    if (!UPLOAD_FILENAME_PATTERN.test(filename)) return false;
    if (this.s3) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: filename }));
        return true;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
        throw error;
      }
    }
    return fs.existsSync(this.resolvePath(filename));
  }

  async deleteFiles(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(urls.map(async (url) => {
      if (!url) return;
      const filename = url.split("/").pop();
      if (!filename || !UPLOAD_FILENAME_PATTERN.test(filename)) return;
      try {
        if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: filename }));
        else await fs.promises.unlink(this.resolvePath(filename));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.logger.warn(`Failed to delete upload ${filename}: ${(error as Error).message}`);
      }
    }));
  }
}
