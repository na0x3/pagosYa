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
  "font/woff2": "woff2",
};

export const UPLOAD_FILENAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif|mp4|webm|woff2)$/;
// Full-bleed storefront backgrounds need enough source pixels for high-density
// displays. Eight megabytes leaves room for a 2880px+ JPEG, WEBP, or PNG while
// keeping the generic image endpoint bounded.
export const MAX_IMAGE_UPLOAD_BYTES = 8_000_000;
export const MAX_GIF_UPLOAD_BYTES = 8_000_000;
export const MAX_VIDEO_UPLOAD_BYTES = 20_000_000;
export const MAX_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_DIMENSION = 20_000;

export function maxUploadBytesForMime(mime: string): number {
  if (mime === "font/woff2") return 2_000_000;
  if (mime === "image/gif") return MAX_GIF_UPLOAD_BYTES;
  if (mime.startsWith("video/")) return MAX_VIDEO_UPLOAD_BYTES;
  return MAX_IMAGE_UPLOAD_BYTES;
}

export function detectedMediaMime(buffer: Buffer): string | null {
  if (buffer.length > 48 && buffer.subarray(0, 4).toString('ascii') === 'wOF2'
    && buffer.readUInt32BE(8) === buffer.length && buffer.readUInt16BE(12) > 0
    && buffer.readUInt16BE(14) === 0 && buffer.readUInt32BE(16) <= 20_000_000
    && buffer.readUInt32BE(20) > 0 && buffer.readUInt32BE(20) < buffer.length) return 'font/woff2';
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

export interface MediaDimensions {
  width: number;
  height: number;
}

function uint24le(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function structurallyValidPng(buffer: Buffer): boolean {
  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const end = dataOffset + length + 4; // data plus CRC
    if (!Number.isSafeInteger(end) || end > buffer.length) return false;
    const type = buffer.subarray(typeOffset, dataOffset).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      return length === 0 && sawImageData && end === buffer.length;
    }
    offset = end;
  }
  return false;
}

function structurallyValidImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") return structurallyValidPng(buffer);
  if (mimeType === "image/jpeg") {
    return buffer.length >= 4 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }
  if (mimeType === "image/gif") return buffer.length >= 14 && buffer[buffer.length - 1] === 0x3b;
  if (mimeType === "image/webp") {
    return buffer.length >= 30 && buffer.readUInt32LE(4) + 8 === buffer.length;
  }
  return false;
}

/** Reads dimensions from image headers without decoding attacker-controlled pixels. */
export function detectedImageDimensions(buffer: Buffer, mimeType: string): MediaDimensions | null {
  if (mimeType === "image/png" && buffer.length >= 24 && buffer.subarray(12, 16).toString("ascii") === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/jpeg" && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > buffer.length) return null;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
      if (startOfFrame.has(marker) && segmentLength >= 7) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
    return null;
  }
  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") return { width: uint24le(buffer, 24) + 1, height: uint24le(buffer, 27) + 1 };
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

function assertSafeImageDimensions(buffer: Buffer, mimeType: string): void {
  if (!mimeType.startsWith("image/")) return;
  const dimensions = detectedImageDimensions(buffer, mimeType);
  if (!dimensions) throw new BadRequestException("Malformed image data");
  const pixels = dimensions.width * dimensions.height;
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    !Number.isSafeInteger(pixels) ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new BadRequestException("Image dimensions are too large to process safely");
  }
  if (!structurallyValidImage(buffer, mimeType)) {
    throw new BadRequestException("Malformed image data");
  }
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
    if (ext === "woff2") return "font/woff2";
    return "image/jpeg";
  }

  resolvePath(filename: string): string {
    return path.join(this.uploadsDir(), filename);
  }

  async saveUpload(file: Express.Multer.File): Promise<StoredUpload> {
    return this.saveBuffer(file.buffer, file.mimetype);
  }

  async saveBuffer(buffer: Buffer, mimeType: string): Promise<StoredUpload> {
    if (buffer.length > maxUploadBytesForMime(mimeType)) throw new BadRequestException('El archivo supera el tamaño permitido.');
    const ext = ALLOWED_MIME_TO_EXT[mimeType];
    if (!ext) throw new BadRequestException("Unsupported upload media type");
    if (detectedMediaMime(buffer) !== mimeType) {
      throw new BadRequestException("File contents do not match the declared media type");
    }
    assertSafeImageDimensions(buffer, mimeType);
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
