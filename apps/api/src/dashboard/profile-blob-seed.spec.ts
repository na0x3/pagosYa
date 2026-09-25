import { MAX_PROFILE_VARIATION, profileBlobSeed } from "./profile-blob-seed";

describe("profileBlobSeed", () => {
  it("is stable per user, differs between users and never contains the user id", () => {
    expect(profileBlobSeed("user_1")).toBe(profileBlobSeed("user_1"));
    expect(profileBlobSeed("user_1")).not.toBe(profileBlobSeed("user_2"));
    expect(profileBlobSeed("user_1")).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(profileBlobSeed("cm1abcdefghijklmnop")).not.toContain("cm1abc");
    expect(MAX_PROFILE_VARIATION).toBe(999);
  });
});
