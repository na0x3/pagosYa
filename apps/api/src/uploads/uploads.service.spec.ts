import {
  MAX_GIF_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_IMAGE_PIXELS,
  detectedImageDimensions,
  maxUploadBytesForMime,
  detectedMediaMime,
  UPLOAD_FILENAME_PATTERN,
  UploadsService,
} from "./uploads.service";

describe("UploadsService media support", () => {
  const service = new UploadsService({ get: jest.fn().mockReturnValue("/tmp/pagosya-uploads-test") } as any);
  const validPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

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

  it("rejects copied PNG magic bytes and executable bytes appended after a complete PNG", async () => {
    const signatureSpoof = Buffer.concat([
      validPng.subarray(0, 8),
      Buffer.from("<script>globalThis.stolen=true</script>"),
    ]);
    const pngWithTrailingScript = Buffer.concat([
      validPng,
      Buffer.from("<script>globalThis.stolen=true</script>"),
    ]);

    await expect(service.saveBuffer(signatureSpoof, "image/png")).rejects.toThrow("Malformed image data");
    await expect(service.saveBuffer(pngWithTrailingScript, "image/png")).rejects.toThrow("Malformed image data");
  });

  it("reads dimensions from headers without decoding attacker-controlled image data", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(4_000, 16);
    png.writeUInt32BE(3_000, 20);

    expect(detectedImageDimensions(png, "image/png")).toEqual({ width: 4_000, height: 3_000 });
    expect(4_000 * 3_000).toBeLessThan(MAX_IMAGE_PIXELS);
  });

  it("rejects a tiny compressed file that declares decompression-bomb dimensions", async () => {
    const bomb = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bomb);
    bomb.write("IHDR", 12, "ascii");
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);

    await expect(service.saveBuffer(bomb, "image/png")).rejects.toThrow("dimensions are too large");
  });

  it("never resolves path traversal or SVG filenames as stored media", async () => {
    await expect(service.getBuffer("../../etc/passwd")).resolves.toBeNull();
    await expect(service.getBuffer("123e4567-e89b-12d3-a456-426614174000.svg")).resolves.toBeNull();
  });
});

describe("UploadsService streaming reads", () => {
  const fs = require("fs") as typeof import("fs");
  const { Readable } = require("stream") as typeof import("stream");
  const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
  const filename = "123e4567-e89b-12d3-a456-426614174000.mp4";
  let dir: string;
  let service: UploadsService;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp("/tmp/pagosya-stream-test-");
    service = new UploadsService({ get: (key: string) => key === "app.uploadsDir" ? dir : undefined } as any);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("streams a 20 MB local file without reading it into a full Buffer", async () => {
    const handle = await fs.promises.open(`${dir}/${filename}`, "w");
    await handle.truncate(MAX_VIDEO_UPLOAD_BYTES);
    await handle.close();
    const readFile = jest.spyOn(fs.promises, "readFile");
    const result = await (service as any).getStream(filename);
    expect(result.byteSize).toBe(MAX_VIDEO_UPLOAD_BYTES);
    expect(result.stream).toBeInstanceOf(Readable);
    let bytes = 0;
    for await (const chunk of result.stream) {
      expect(chunk.length).toBeLessThan(MAX_VIDEO_UPLOAD_BYTES);
      bytes += chunk.length;
    }
    expect(bytes).toBe(MAX_VIDEO_UPLOAD_BYTES);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("passes through the object-storage stream without materializing its bytes", async () => {
    const stream = Object.assign(Readable.from(["video"]), { transformToByteArray: jest.fn() });
    const send = jest.spyOn(S3Client.prototype, "send").mockResolvedValue({ Body: stream, ContentLength: MAX_VIDEO_UPLOAD_BYTES } as never);
    const remote = new UploadsService({ get: (key: string) => ({
      "app.objectStorage.bucket": "uploads",
      "app.objectStorage.endpoint": "https://storage.example",
      "app.objectStorage.accessKeyId": "test",
      "app.objectStorage.secretAccessKey": "test",
    } as Record<string, string>)[key] } as any);
    const result = await (remote as any).getStream(filename);
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    expect(result).toEqual({ stream, byteSize: MAX_VIDEO_UPLOAD_BYTES });
    expect(stream.transformToByteArray).not.toHaveBeenCalled();
    stream.destroy();
    send.mockRejectedValueOnce({ name: "NoSuchKey" } as never);
    await expect((remote as any).getStream(filename)).resolves.toBeNull();
    send.mockRejectedValueOnce(new Error("storage offline") as never);
    await expect((remote as any).getStream(filename)).rejects.toThrow("storage offline");
  });

  it("returns null for missing or invalid files", async () => {
    await expect((service as any).getStream(filename)).resolves.toBeNull();
    await expect((service as any).getStream("../../etc/passwd")).resolves.toBeNull();
  });
});
