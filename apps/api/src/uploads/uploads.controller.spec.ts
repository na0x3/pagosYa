import "reflect-metadata";
import { Readable } from "stream";
import { UploadsController } from "./uploads.controller";

describe("UploadsController public assets", () => {
  const filename = "123e4567-e89b-12d3-a456-426614174000.mp4";
  const etag = `"${filename}"`;
  let uploads: any, res: any, controller: UploadsController;

  beforeEach(() => {
    uploads = {
      getStream: jest.fn().mockResolvedValue({ stream: Readable.from(["video"]), byteSize: 20_000_000 }),
      getBuffer: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      contentTypeFor: jest.fn().mockReturnValue("video/mp4"),
    };
    res = { set: jest.fn(), status: jest.fn().mockReturnThis() };
    controller = new UploadsController(uploads, {} as any);
  });

  it("applies a dedicated 600/minute throttle to public reads", () => {
    const handler = UploadsController.prototype.getFile;
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", handler)).not.toBe(true);
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(600);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60_000);
  });

  it("keeps authenticated upload writes behind the global rate limit", () => {
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", UploadsController.prototype.uploadFile)).not.toBe(true);
  });

  it("passes the storage stream through with its length and immutable headers", async () => {
    const file = await controller.getFile(filename, res);
    expect(file!.getStream()).toBe((await uploads.getStream.mock.results[0].value).stream);
    expect(uploads.getBuffer).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
      "Content-Type": "video/mp4",
      "Content-Length": 20_000_000,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    }));
  });

  it.each([etag, `W/${etag}`, `"another", W/${etag}`, "*"])(
    "returns 304 without opening a body for If-None-Match %s",
    async (header) => {
      const result = await (controller.getFile as any)(filename, res, header);
      expect(result).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(304);
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ ETag: etag }));
      expect(uploads.getStream).not.toHaveBeenCalled();
      expect(uploads.getBuffer).not.toHaveBeenCalled();
    },
  );

  it("streams normally when the ETag differs", async () => {
    await (controller.getFile as any)(filename, res, '"another"');
    expect(uploads.getStream).toHaveBeenCalledWith(filename);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing file even when the ETag matches", async () => {
    uploads.exists.mockResolvedValue(false);
    await expect((controller.getFile as any)(filename, res, etag)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invalid and missing filenames", async () => {
    await expect(controller.getFile("../secret", res)).rejects.toMatchObject({ status: 404 });
    expect(uploads.getStream).not.toHaveBeenCalled();
    uploads.getStream.mockResolvedValue(null);
    await expect(controller.getFile(filename, res)).rejects.toMatchObject({ status: 404 });
  });
});
