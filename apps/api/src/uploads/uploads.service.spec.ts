import {
  MAX_GIF_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  maxUploadBytesForMime,
  detectedMediaMime,
  UPLOAD_FILENAME_PATTERN,
  UploadsService,
} from "./uploads.service";

describe("UploadsService media support", () => {
  const service = new UploadsService({ get: jest.fn().mockReturnValue("/tmp/pagosya-uploads-test") } as any);

  it("serves GIF, MP4, and WEBM with their correct content types", () => {
    expect(service.contentTypeFor("hero.gif")).toBe("image/gif");
    expect(service.contentTypeFor("hero.mp4")).toBe("video/mp4");
    expect(service.contentTypeFor("hero.webm")).toBe("video/webm");
  });

  it("accepts only random upload filenames with supported media extensions", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(UPLOAD_FILENAME_PATTERN.test(`${id}.gif`)).toBe(true);
    expect(UPLOAD_FILENAME_PATTERN.test(`${id}.mp4`)).toBe(true);
    expect(UPLOAD_FILENAME_PATTERN.test(`${id}.webm`)).toBe(true);
    expect(UPLOAD_FILENAME_PATTERN.test(`${id}.mov`)).toBe(false);
  });

  it("uses bounded, format-aware upload limits", () => {
    expect(maxUploadBytesForMime("image/jpeg")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(maxUploadBytesForMime("image/gif")).toBe(MAX_GIF_UPLOAD_BYTES);
    expect(maxUploadBytesForMime("video/mp4")).toBe(MAX_VIDEO_UPLOAD_BYTES);
  });

  it("detects supported formats by magic bytes instead of trusting the multipart MIME claim", () => {
    expect(detectedMediaMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectedMediaMime(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectedMediaMime(Buffer.concat([Buffer.from("0000ftyp", "ascii"), Buffer.alloc(4)]))).toBe("video/mp4");
  });

  it("rejects spoofed uploads whose bytes do not match the declared MIME type", async () => {
    await expect(service.saveBuffer(Buffer.from("<html>not an image</html>"), "image/png")).rejects.toThrow(
      "File contents do not match",
    );
  });
});
