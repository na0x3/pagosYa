import { LimitsWarningService } from "./limits-warning.service";

it("emails every verified, active user of the merchant and survives provider errors", async () => {
  const prisma = { merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "a@x.bo" }, { email: "b@x.bo" }]) } };
  const email = { send: jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined) };
  const limits = { usage: jest.fn().mockResolvedValue({ levelName: "Persona", used: 800_000, monthlyLimit: 1_000_000, resetsAt: "2026-10-01T04:00:00.000Z" }) };
  await expect(new LimitsWarningService(prisma as any, email as any, limits as any).notify("m_1")).resolves.toBeUndefined();
  expect(prisma.merchantUser.findMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
  expect(email.send).toHaveBeenCalledTimes(2);
  expect(email.send.mock.calls[1][0]).toMatchObject({ to: "b@x.bo", subject: "Llegaste al 80% de tu límite mensual en pagosYa" });
});
