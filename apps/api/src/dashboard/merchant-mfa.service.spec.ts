import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { totpCode, totpStep } from "../auth/totp";
import { MerchantMfaService } from "./merchant-mfa.service";

const applyData = (row: any, data: any) => { for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in (v as any) ? (row[k] ?? 0) + (v as any).increment : v; return row; };
function fakePrisma() {
  const user: any = { id: "u1", email: "ana@tienda.bo", totpSecret: null, totpEnabledAt: null, totpLastStep: null };
  const prisma: any = {
    user,
    merchantUser: {
      findUnique: jest.fn(async () => ({ ...user })),
      update: jest.fn(async ({ data }: any) => ({ ...applyData(user, data) })),
      updateMany: jest.fn(async ({ data }: any) => {
        if (user.totpLastStep !== null && user.totpLastStep >= data.totpLastStep) return { count: 0 };
        applyData(user, data);
        return { count: 1 };
      }),
    },
  };
  return prisma;
}
const config = (on: boolean) => ({ get: (key: string) => (key === "app.merchantMfaForSensitive" ? on : undefined) });
const next = (secret: string, used: number | null) => totpCode(secret, Math.max(totpStep(), (used ?? 0) + 1));

describe("MerchantMfaService (ISO M-09)", () => {
  it("turns codes on with a first code, refuses that code again, and turns off only with a current code", async () => {
    const prisma = fakePrisma();
    const mfa = new MerchantMfaService(prisma, config(false) as any);
    expect(await mfa.status("u1")).toEqual({ enabled: false, requiredForPayoutChange: false });
    const { secret, qrDataUrl } = await mfa.beginSetup("u1");
    expect(qrDataUrl).toMatch(/^data:image\/png/);
    await expect(mfa.confirmSetup("u1", "000000")).rejects.toBeInstanceOf(UnauthorizedException);
    const first = totpCode(secret, totpStep());
    await mfa.confirmSetup("u1", first);
    expect((await mfa.status("u1")).enabled).toBe(true);
    await expect(mfa.beginSetup("u1")).rejects.toBeInstanceOf(ConflictException);
    await expect(mfa.disable("u1", first)).rejects.toBeInstanceOf(UnauthorizedException);
    await mfa.disable("u1", next(secret, prisma.user.totpLastStep));
    expect(prisma.user).toMatchObject({ totpSecret: null, totpEnabledAt: null });
  });

  it("locks code entry for 15 minutes after five wrong codes, whatever the IP", async () => {
    const prisma = fakePrisma();
    const mfa = new MerchantMfaService(prisma, config(false) as any);
    const { secret } = await mfa.beginSetup("u1");
    await mfa.confirmSetup("u1", totpCode(secret, totpStep()));
    for (let i = 0; i < 4; i++) expect((await mfa.spendCode(prisma.user, "000000").catch((e) => e)).getResponse()).toMatchObject({ code: "mfa_invalid" });
    expect((await mfa.spendCode(prisma.user, "000000").catch((e) => e)).getResponse()).toMatchObject({ code: "mfa_locked" });
    expect(prisma.user.totpLockedUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    // Even the right code waits out the lock.
    expect((await mfa.spendCode(prisma.user, next(secret, prisma.user.totpLastStep)).catch((e) => e)).getResponse()).toMatchObject({ code: "mfa_locked" });
  });

  it("asks for a payout-account change: a code with codes on; setup first where it is required; nothing otherwise", async () => {
    const off = new MerchantMfaService(fakePrisma(), config(false) as any);
    await expect(off.assertForPayoutChange("u1", undefined)).resolves.toBeUndefined();

    const required = new MerchantMfaService(fakePrisma(), config(true) as any);
    const refusal = await required.assertForPayoutChange("u1", undefined).catch((e) => e);
    expect(refusal).toBeInstanceOf(ForbiddenException);
    expect(refusal.getResponse()).toMatchObject({ code: "mfa_setup_required" });

    const prisma = fakePrisma();
    const on = new MerchantMfaService(prisma, config(true) as any);
    const { secret } = await on.beginSetup("u1");
    await on.confirmSetup("u1", totpCode(secret, totpStep()));
    const missing = await on.assertForPayoutChange("u1", undefined).catch((e) => e);
    expect(missing.getResponse()).toMatchObject({ code: "mfa_required" });
    await expect(on.assertForPayoutChange("u1", next(secret, prisma.user.totpLastStep))).resolves.toBeUndefined();
  });
});
