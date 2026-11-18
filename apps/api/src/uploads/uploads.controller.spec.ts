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

  // be3da5c7 (2026-10-26): a store page loads dozens of photos at once, so public reads skip the API throttle; production
  // rate-limits them at the edge (docs/security/2026-10-29-audit.md).
  it("public reads skip the API throttle", () => {
    const handler = UploadsController.prototype.getFile;
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", handler)).toBe(true);
    expect(Reflect.getMetadata("THROTTLER:SKIPsustained", handler)).toBe(true);
  });

  it("keeps authenticated upload writes behind the global rate limit", () => {
    expect(Reflect.getMetadata("THROTTLER:SKIPdefault", UploadsController.prototype.uploadFile)).not.toBe(true);
  });

  it("lets go of the file when the browser drops the request (a video seek or a closed tab)", async () => {
    const { EventEmitter } = require("events");
    const stream = Readable.from(["video"]);
    uploads.getStream.mockResolvedValue({ stream, byteSize: 5 });
    const response = Object.assign(new EventEmitter(), res);
    await controller.getFile(filename, response);
    response.emit("close");
    expect(stream.destroyed).toBe(true);
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

  it("owner 2026-11-17 (product videos): answers a ranged MP4 request with the slice it asked for", async () => {
    uploads.getBuffer.mockResolvedValue(Buffer.from("0123456789"));
    res.req = { headers: { range: "bytes=2-5" } };
    const file = await (controller.getFile as any)(filename, res, undefined);
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ "Content-Range": "bytes 2-5/10", "Content-Length": 4, "Accept-Ranges": "bytes" }));
    expect(uploads.getStream).not.toHaveBeenCalled();
    expect(file).toBeDefined();
    res.req = { headers: { range: "bytes=50-" } };
    await (controller.getFile as any)(filename, res, undefined);
    expect(res.status).toHaveBeenCalledWith(416);
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
