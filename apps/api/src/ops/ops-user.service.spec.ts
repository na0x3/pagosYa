import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { OpsRole } from "@prisma/client";
import { totpCode, totpStep } from "../auth/totp";
import { OpsUserService } from "./ops-user.service";

/** In-memory stand-in for the two tables the service uses. */
function makeFakePrisma() {
  const users: any[] = [];
  const sessions: any[] = [];
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, cond]: [string, any]) => {
    if (key === "OR") return cond.some((alt: any) => matches(row, alt));
    if (cond && typeof cond === "object" && "lt" in cond) return row[key] !== null && row[key] < cond.lt;
    return row[key] === cond;
  });
  const prisma: any = {
    users,
    sessions,
    opsUser: {
      create: jest.fn(async ({ data }: any) => { const row = { id: `ops_${users.length + 1}`, revokedAt: null, totpSecret: null, totpEnabledAt: null, totpLastStep: null, ...data }; users.push(row); return row; }),
      findMany: jest.fn(async ({ where }: any) => users.filter((u) => matches(u, where))),
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const row = users.find((u) => u.id === where.id);
        for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in (v as any) ? (row[k] ?? 0) + (v as any).increment : v;
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => { const hit = users.filter((u) => matches(u, where)); hit.forEach((u) => Object.assign(u, data)); return { count: hit.length }; }),
    },
    opsSession: {
      create: jest.fn(async ({ data }: any) => { sessions.push({ revokedAt: null, ...data }); return data; }),
      findUnique: jest.fn(async ({ where }: any) => { const s = sessions.find((x) => x.hashedToken === where.hashedToken); return s && { ...s, opsUser: users.find((u) => u.id === s.opsUserId) }; }),
      updateMany: jest.fn(async ({ where, data }: any) => { const hit = sessions.filter((s) => matches(s, where)); hit.forEach((s) => Object.assign(s, data)); return { count: hit.length }; }),
    },
    $transaction: jest.fn(async (work: any) => (typeof work === "function" ? work(prisma) : Promise.all(work))),
  };
  return prisma;
}

const config = (opsMfaRequired: boolean) => ({ get: (key: string) => (key === "app.opsMfaRequired" ? opsMfaRequired : undefined) });
const audit = () => ({ record: jest.fn() });
/** Waits for the code step to move so a fresh code is not the one already spent. */
const freshCode = (secret: string, used: number) => totpCode(secret, Math.max(totpStep(), used + 1));

describe("OpsUserService", () => {
  it("issues a token that verify() resolves back to the same user while codes are not required", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma);
    const { user, fullToken } = await service.create("Ana Gutierrez", "ana@pagosya.bo");
    expect(fullToken).toMatch(/^ops_/);
    expect(user).toEqual({ id: "ops_1", name: "Ana Gutierrez", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_AGENT });
    await expect(service.verify(fullToken)).resolves.toEqual(user);
    await expect(service.verify("ops_totally_wrong_token")).resolves.toBeNull();
  });

  it("rejects a token without the ops_ prefix without even querying the database", async () => {
    const prisma = makeFakePrisma();
    await expect(new OpsUserService(prisma).verify("sk_test_something")).resolves.toBeNull();
    expect(prisma.opsUser.findMany).not.toHaveBeenCalled();
  });

  it("refuses the bare token where codes are required, and asks for setup before a session", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma, config(true) as any, audit() as any);
    const { fullToken } = await service.create("Ana", "ana@pagosya.bo");
    await expect(service.verify(fullToken)).resolves.toBeNull();
    const refusal = await service.startSession(fullToken, undefined).catch((e) => e);
    expect(refusal).toBeInstanceOf(ForbiddenException);
    expect(refusal.getResponse()).toMatchObject({ code: "mfa_setup_required" });
  });

  it("sets codes up, then starts a session only with a fresh code, and the session is what verify() accepts", async () => {
    const prisma = makeFakePrisma();
    const log = audit();
    const service = new OpsUserService(prisma, config(true) as any, log as any);
    const { fullToken, user } = await service.create("Ana", "ana@pagosya.bo", OpsRole.SUPPORT_ADMIN);

    const setup = await service.beginMfaSetup(fullToken);
    expect(setup.uri).toContain("otpauth://totp/");
    await expect(service.confirmMfaSetup(fullToken, "000000")).rejects.toBeInstanceOf(UnauthorizedException);
    await service.confirmMfaSetup(fullToken, totpCode(setup.secret, totpStep()));
    expect(prisma.users[0].totpEnabledAt).toBeInstanceOf(Date);
    await expect(service.beginMfaSetup(fullToken)).rejects.toThrow("ya está configurado");

    // The code that confirmed setup cannot also open a session.
    await expect(service.startSession(fullToken, totpCode(setup.secret, totpStep()))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.startSession(fullToken, undefined)).rejects.toBeInstanceOf(UnauthorizedException);

    const session = await service.startSession(fullToken, freshCode(setup.secret, prisma.users[0].totpLastStep), "10.0.0.5");
    expect(session.sessionToken).toMatch(/^opss_/);
    expect(prisma.sessions[0].hashedToken).not.toContain(session.sessionToken);
    await expect(service.verify(session.sessionToken)).resolves.toEqual(user);
    expect(log.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: "ops.session_started", metadata: { ip: "10.0.0.5", withCode: true } }));

    await service.endSession(session.sessionToken);
    await expect(service.verify(session.sessionToken)).resolves.toBeNull();
  });

  it("refuses an expired session and ends every session on revoke or reset", async () => {
    const prisma = makeFakePrisma();
    const service = new OpsUserService(prisma, config(false) as any, audit() as any);
    const { fullToken } = await service.create("Ana", "ana@pagosya.bo");
    const first = await service.startSession(fullToken, undefined);
    prisma.sessions[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify(first.sessionToken)).resolves.toBeNull();

    const second = await service.startSession(fullToken, undefined);
    await service.resetMfa("ops_1");
    await expect(service.verify(second.sessionToken)).resolves.toBeNull();

    const third = await service.startSession(fullToken, undefined);
    await service.revoke("ops_1");
    await expect(service.verify(third.sessionToken)).resolves.toBeNull();
    expect(prisma.users[0].revokedAt).toBeInstanceOf(Date);
  });
});
