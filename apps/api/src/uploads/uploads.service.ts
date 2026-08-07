import * as fs from "fs";
import * as path from "path";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Matches exactly what the multer diskStorage filename() in uploads.module.ts ever
// writes (randomUUID() + one of the extensions above) — anything else, including any
// ".." or "/", is rejected by the pattern itself rather than by explicit traversal checks.
export const UPLOAD_FILENAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpe?g|webp)$/;

export const MAX_UPLOAD_BYTES = 3_000_000;

@Injectable()
export class UploadsService implements OnModuleInit {
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
    return "image/jpeg";
  }

  resolvePath(filename: string): string {
    return path.join(this.uploadsDir(), filename);
  }
}
