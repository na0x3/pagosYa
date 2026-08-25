import { ApiKeyMode } from "@prisma/client";
import { UnauthorizedException } from "@nestjs/common";
import { PublishableApiKeyGuard } from "./publishable-api-key.guard";

function context(body: Record<string, string>) {
  const request: Record<string, unknown> = { body };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
  };
}

describe("PublishableApiKeyGuard", () => {
  const paymentIntent = {
    id: "pi_1",
    merchantId: "merchant_1",
    livemode: false,
    merchant: { name: "Example" },
  };

  it("accepts a matching merchant and test-mode publishable key", async () => {
    const apiKeys = {
      verify: jest.fn().mockResolvedValue({ merchantId: "merchant_1", mode: ApiKeyMode.TEST }),
    };
    const prisma = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(paymentIntent) } };
    const guard = new PublishableApiKeyGuard(apiKeys as any, prisma as any);
    const test = context({ publishableKey: "pk_test_valid", clientSecret: "pi_1_secret_valid" });

    await expect(guard.canActivate(test.context)).resolves.toBe(true);
    expect(test.request.paymentIntent).toBe(paymentIntent);
  });

  it("rejects cross-merchant publishable keys", async () => {
    const apiKeys = {
      verify: jest.fn().mockResolvedValue({ merchantId: "merchant_2", mode: ApiKeyMode.TEST }),
    };
    const prisma = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(paymentIntent) } };
    const guard = new PublishableApiKeyGuard(apiKeys as any, prisma as any);

    await expect(
      guard.canActivate(context({ publishableKey: "pk_test_other", clientSecret: "pi_1_secret_valid" }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects test/live mode mismatches", async () => {
    const apiKeys = {
      verify: jest.fn().mockResolvedValue({ merchantId: "merchant_1", mode: ApiKeyMode.LIVE }),
    };
    const prisma = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(paymentIntent) } };
    const guard = new PublishableApiKeyGuard(apiKeys as any, prisma as any);

    await expect(
      guard.canActivate(context({ publishableKey: "pk_live_wrong", clientSecret: "pi_1_secret_valid" }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
