import { BadRequestException } from "@nestjs/common";
import { MerchantUserService } from "./merchant-user.service";

function makeFakePrisma() {
  return {
    merchantUser: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe("MerchantUserService.signup", () => {
  it("creates a dashboard login with a hashed (not plaintext) password", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    prisma.merchantUser.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "user_1", email: data.email, hashedPassword: data.hashedPassword }),
    );

    const service = new MerchantUserService(prisma as any);
    const result = await service.signup("m_1", "owner@tienda.bo", "a-strong-password");

    expect(result).toEqual({ id: "user_1", email: "owner@tienda.bo" });
    const storedHash = prisma.merchantUser.create.mock.calls[0][0].data.hashedPassword;
    expect(storedHash).not.toBe("a-strong-password");
    expect(storedHash).toMatch(/^\$argon2/);
  });

  it("rejects signup when the email already has a dashboard login", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({ id: "existing" });

    const service = new MerchantUserService(prisma as any);
    await expect(service.signup("m_1", "owner@tienda.bo", "a-strong-password")).rejects.toThrow(BadRequestException);
    expect(prisma.merchantUser.create).not.toHaveBeenCalled();
  });
});
