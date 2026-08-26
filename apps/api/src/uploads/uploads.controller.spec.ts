import "reflect-metadata";
import { UploadsController } from "./uploads.controller";

describe("UploadsController throttling", () => {
  const skipThrottleMetadata = "THROTTLER:SKIPdefault";

  it("does not rate-limit immutable public asset reads", () => {
    expect(Reflect.getMetadata(skipThrottleMetadata, UploadsController.prototype.getFile)).toBe(true);
  });

  it("keeps authenticated upload writes behind the global rate limit", () => {
    expect(Reflect.getMetadata(skipThrottleMetadata, UploadsController.prototype.uploadFile)).not.toBe(true);
  });
});
