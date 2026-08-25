import { ApiKeyMode, ApiKeyType } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";

function prismaMock() {
  return {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    merchant: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

describe("ApiKeyService lifecycle", () => {
  it("lists only masked metadata", async () => {
    const prisma = prismaMock();
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: "key_1",
        mode: ApiKeyMode.TEST,
        type: ApiKeyType.SECRET,
        keyPrefix: "sk_test",
        label: "Backend",
        lastFour: "a1B2",
        createdAt: new Date("2026-08-18T12:00:00Z"),
        revokedAt: null,
      },
    ]);

    const service = new ApiKeyService(prisma as any);
    await expect(service.list("merchant_1")).resolves.toEqual([
      expect.objectContaining({ id: "key_1", maskedKey: "sk_test_••••a1B2" }),
    ]);
    expect(JSON.stringify(await service.list("merchant_1"))).not.toContain("hashedSecret");
  });

  it("revokes only an active key owned by the merchant", async () => {
    const prisma = prismaMock();
    prisma.apiKey.findFirst.mockResolvedValue({ id: "key_1" });
    const service = new ApiKeyService(prisma as any);

    await service.revoke("merchant_1", "key_1");
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not reveal whether another merchant owns a key", async () => {
    const prisma = prismaMock();
    prisma.apiKey.findFirst.mockResolvedValue(null);
    const service = new ApiKeyService(prisma as any);

    await expect(service.revoke("merchant_1", "other_key")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates the replacement and revokes the old key atomically", async () => {
    const prisma = prismaMock();
    prisma.apiKey.findFirst.mockResolvedValue({
      id: "key_old",
      merchantId: "merchant_1",
      type: ApiKeyType.SECRET,
      mode: ApiKeyMode.TEST,
      label: "Backend",
    });
    prisma.apiKey.create.mockResolvedValue({
      id: "key_new",
      type: ApiKeyType.SECRET,
      mode: ApiKeyMode.TEST,
      label: "Backend",
      createdAt: new Date("2026-08-18T12:00:00Z"),
    });
    prisma.apiKey.update.mockResolvedValue({ id: "key_old" });
    const service = new ApiKeyService(prisma as any);

    const replacement = await service.rotate("merchant_1", "key_old");

    expect(replacement).toEqual(expect.objectContaining({ id: "key_new", fullKey: expect.stringMatching(/^sk_test_/) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key_old" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejects malformed keys without querying or running Argon2", async () => {
    const prisma = prismaMock();
    const service = new ApiKeyService(prisma as any);

    await expect(service.verify("sk_test_short", ApiKeyType.SECRET)).resolves.toBeNull();

    expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
  });

  it("narrows valid-shaped lookups by prefix and last four before Argon2", async () => {
    const prisma = prismaMock();
    prisma.apiKey.findMany.mockResolvedValue([]);
    const service = new ApiKeyService(prisma as any);
    const presented = `sk_test_${"a".repeat(28)}Z9xQ`;

    await expect(service.verify(presented, ApiKeyType.SECRET)).resolves.toBeNull();

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ keyPrefix: "sk_test", lastFour: "Z9xQ" }),
      take: 4,
    }));
  });
});
