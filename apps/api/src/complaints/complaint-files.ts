import { BadRequestException } from "@nestjs/common";

export const MAX_COMPLAINT_FILES = 3;
export const MAX_COMPLAINT_FILE_BYTES = 5_000_000;

export type UploadedComplaintFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
export type CheckedComplaintFile = UploadedComplaintFile & { contentType: "image/jpeg" | "image/png" | "application/pdf" };

const SIGNATURES: Array<{ type: CheckedComplaintFile["contentType"]; bytes: number[] }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

export function sniffComplaintFileType(buffer: Buffer): CheckedComplaintFile["contentType"] | null {
  return SIGNATURES.find(({ bytes }) => buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte))?.type ?? null;
}

/** The declared mimetype is ignored: only the bytes decide, so a renamed SVG or HTML file never reaches ops. */
export function checkComplaintFiles(files: UploadedComplaintFile[] | undefined): CheckedComplaintFile[] {
  const list = files ?? [];
  if (list.length > MAX_COMPLAINT_FILES) throw new BadRequestException(`Puedes adjuntar hasta ${MAX_COMPLAINT_FILES} archivos.`);
  return list.map((file) => {
    if (file.size > MAX_COMPLAINT_FILE_BYTES) throw new BadRequestException("Cada archivo puede pesar hasta 5 MB.");
    const contentType = sniffComplaintFileType(file.buffer);
    if (!contentType) throw new BadRequestException("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    return { ...file, contentType };
  });
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "archivo";
}
