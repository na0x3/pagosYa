import { OpsUserService } from "./ops-user.service";

function makeFakePrisma() {
  return {
    opsUser: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe("OpsUserService", () => {
  it("issues a token that verify() later resolves back to the same user", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma as any);

    prisma.opsUser.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "ops_1", name: data.name, email: data.email, hashedToken: data.hashedToken, revokedAt: null }),
    );

    const { user, fullToken } = await service.create("Ana Gutierrez", "ana@pagosya.bo");
    expect(fullToken).toMatch(/^ops_/);
    expect(user).toEqual({ id: "ops_1", name: "Ana Gutierrez", email: "ana@pagosya.bo" });

    // verify() scans active users and argon2-verifies the presented token
    // against each stored hash — hand it back the hash create() actually
    // produced, from the mocked call's arguments.
    const createdData = prisma.opsUser.create.mock.calls[0][0].data;
    prisma.opsUser.findMany.mockResolvedValue([
      { id: "ops_1", name: "Ana Gutierrez", email: "ana@pagosya.bo", hashedToken: createdData.hashedToken, revokedAt: null },
    ]);

    const verified = await service.verify(fullToken);
    expect(verified).toEqual({ id: "ops_1", name: "Ana Gutierrez", email: "ana@pagosya.bo" });
  });

  it("rejects a token that doesn't match any active user's hash", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma as any);
    prisma.opsUser.findMany.mockResolvedValue([]);

    await expect(service.verify("ops_totally_wrong_token")).resolves.toBeNull();
  });

  it("rejects a token without the ops_ prefix without even querying the database", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma as any);

    await expect(service.verify("sk_test_something")).resolves.toBeNull();
    expect(prisma.opsUser.findMany).not.toHaveBeenCalled();
  });

  it("revoke() sets revokedAt", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma as any);
    prisma.opsUser.update.mockResolvedValue({ id: "ops_1", revokedAt: new Date() });

    await service.revoke("ops_1");

    expect(prisma.opsUser.update).toHaveBeenCalledWith({
      where: { id: "ops_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
