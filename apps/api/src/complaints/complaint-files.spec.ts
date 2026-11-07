import { BadRequestException } from "@nestjs/common";
import { checkComplaintFiles, safeFileName, sniffComplaintFileType } from "./complaint-files";

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const pdf = Buffer.from("%PDF-1.7\n");
const file = (buffer: Buffer, over = {}) => ({ originalname: "foto.jpg", mimetype: "image/jpeg", size: buffer.length, buffer, ...over });

describe("complaint files", () => {
  it("recognises JPG, PNG and PDF by their bytes, whatever the declared type", () => {
    expect(sniffComplaintFileType(jpg)).toBe("image/jpeg");
    expect(sniffComplaintFileType(png)).toBe("image/png");
    expect(sniffComplaintFileType(pdf)).toBe("application/pdf");
    expect(sniffComplaintFileType(Buffer.from("<svg/>"))).toBeNull();
  });

  it("returns the sniffed type, not the declared one", () => {
    expect(checkComplaintFiles([file(pdf, { mimetype: "image/jpeg" })])[0].contentType).toBe("application/pdf");
  });

  it("accepts none", () => {
    expect(checkComplaintFiles(undefined)).toEqual([]);
  });

  it("refuses more than 3 files, a file over 5 MB and any other type", () => {
    expect(() => checkComplaintFiles([file(jpg), file(jpg), file(jpg), file(jpg)])).toThrow("Puedes adjuntar hasta 3 archivos.");
    expect(() => checkComplaintFiles([file(jpg, { size: 5_000_001 })])).toThrow("Cada archivo puede pesar hasta 5 MB.");
    expect(() => checkComplaintFiles([file(Buffer.from("GIF89a"))])).toThrow(BadRequestException);
  });

  it("keeps file names printable and short", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFileName("recibo <script>.pdf")).toBe("recibo _script_.pdf");
    expect(safeFileName("")).toBe("archivo");
    expect(safeFileName("a".repeat(300)).length).toBe(120);
  });
});
