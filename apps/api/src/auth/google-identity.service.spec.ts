import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { GoogleIdentityService } from "./google-identity.service";

describe("GoogleIdentityService", () => {
  it("verifies the configured audience and returns Google's stable subject", async () => {
    const config = { get: jest.fn().mockReturnValue("web-client.apps.googleusercontent.com") };
    const service = new GoogleIdentityService(config as any);
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({
        sub: "google_123",
        email: "Owner@Gmail.com",
        email_verified: true,
        name: "Owner",
      }),
    });

    await expect(service.verifyCredential("signed-id-token")).resolves.toEqual({
      subject: "google_123",
      email: "owner@gmail.com",
      name: "Owner",
      emailAuthoritative: true,
    });
    expect((service as any).client.verifyIdToken).toHaveBeenCalledWith({
      idToken: "signed-id-token",
      audience: "web-client.apps.googleusercontent.com",
    });
  });

  it("fails closed when Google login is not configured", async () => {
    const service = new GoogleIdentityService({ get: jest.fn().mockReturnValue("") } as any);
    await expect(service.verifyCredential("token")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects a token without a verified email", async () => {
    const service = new GoogleIdentityService({ get: jest.fn().mockReturnValue("client-id") } as any);
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({ sub: "google_123", email: "owner@gmail.com", email_verified: false }),
    });
    await expect(service.verifyCredential("token")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
