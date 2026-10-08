import { OpsRole, PayoutAccountOwner, PayoutAccountStatus } from "@prisma/client";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { DashboardPayoutAccountsController } from "./dashboard-payout-accounts.controller";
import { PayoutAccountsService } from "./payout-accounts.service";

const NOW = new Date("2026-10-08T19:00:00Z");
const png = { originalname: "cert.png", mimetype: "image/png", size: 9, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]) };
const dto = { bankCode: "BNB", accountNumber: "401-234-5678", holderName: "Ana Pérez" };
const admin = { id: "ops_a", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_b", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

function setup(state: { approved?: any; pending?: any; account?: any; merchantLevel?: number } = {}) {
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    payoutAccount: {
      findFirst: jest.fn(async ({ where }) => (where.status === PayoutAccountStatus.PENDING_REVIEW ? state.pending ?? null : where.status === PayoutAccountStatus.APPROVED ? state.approved ?? null : null)),
      findUnique: jest.fn(async () => state.account ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }) => ({ id: "pa_new", createdAt: NOW, status: PayoutAccountStatus.PENDING_REVIEW, payableFrom: null, reviewNote: null, ...data })),
      update: jest.fn(async ({ data }) => ({ ...state.account, ...data })),
      updateMany: jest.fn(async ({ where, data }: any) => { if (where.id === "pa_new") Object.assign(state.account ?? {}, data); return { count: 1 }; }),
    },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", level: state.merchantLevel ?? 1 }) },
    merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue({ legalName: "Ana Pérez", legalRepName: "Ana Pérez", targetLevel: 1 }) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "ana@tienda.bo" }, { email: "socio@tienda.bo" }]) },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  const files = { put: jest.fn().mockResolvedValue("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn().mockResolvedValue(Buffer.from("x")) };
  const audit = { record: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  return { db, files, audit, email, service: new PayoutAccountsService(db, files as any, audit as any, email as any) };
}

describe("PayoutAccountsService.create", () => {
  it("stores a first account as waiting, with no warning email", async () => {
    const { db, email, service } = setup();
    const view = await service.create("m_1", dto, png as any);
    expect(db.payoutAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_1", bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez", isChange: false, proofContentType: "image/png" }) });
    expect(view).toEqual(expect.objectContaining({ accountLast4: "5678", bankName: "Banco Nacional de Bolivia" }));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("marks a change and warns every verified user, showing only the last 4 digits", async () => {
    const { db, email, service } = setup({ approved: { id: "pa_old" } });
    await service.create("m_1", dto, png as any);
    expect(db.payoutAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isChange: true }) });
    expect(email.send).toHaveBeenCalledTimes(2);
    const body = email.send.mock.calls[0][0].body as string;
    expect(body).toContain("Si no fuiste tú");
    expect(body).toContain("5678");
    expect(body).not.toContain("4012345678");
  });

  it("allows one waiting account at a time, checked under the merchant's lock", async () => {
    const { db, service } = setup({ pending: { id: "pa_wait" } });
    await expect(service.create("m_1", dto, png as any)).rejects.toThrow("Ya tienes una cuenta en revisión");
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.payoutAccount.findFirst.mock.invocationCallOrder[0]);
  });

  it("refuses a missing or wrong proof and a bad number", async () => {
    const { service } = setup();
    await expect(service.create("m_1", dto, undefined)).rejects.toThrow("Sube el certificado o la captura de tu banco.");
    await expect(service.create("m_1", dto, { ...png, buffer: Buffer.from("GIF89a") } as any)).rejects.toThrow("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    await expect(service.create("m_1", { ...dto, accountNumber: "12" }, png as any)).rejects.toThrow("entre 6 y 20 dígitos");
  });

  it("is reachable only from a dashboard session, never an API key", () => {
    expect(Reflect.getMetadata("__guards__", DashboardPayoutAccountsController)).toEqual([MerchantSessionGuard]);
  });
});

const setupWith = (db: any, account: any) => {
  db.payoutAccount.findUnique.mockResolvedValue(account);
  return new PayoutAccountsService(db, { put: jest.fn(), get: jest.fn() } as any, { record: jest.fn() } as any, { send: jest.fn().mockResolvedValue(undefined) } as any);
};

describe("PayoutAccountsService review", () => {
  const waiting = (over = {}) => ({ id: "pa_new", merchantId: "m_1", currency: "BOB", status: PayoutAccountStatus.PENDING_REVIEW, isChange: false, kycSubmissionId: null, accountNumber: "4012345678", bankCode: "BNB", holderName: "Ana Pérez", ...over });
  const approveDto = { checks: { nameMatches: true, numberMatches: true, bankMatches: true }, ownerType: PayoutAccountOwner.PERSON };

  it("approves a first account payable at once", async () => {
    const { db, audit, service } = setup({ account: waiting() });
    await service.approve("pa_new", approveDto, agent, NOW);
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { id: "pa_new", status: PayoutAccountStatus.PENDING_REVIEW }, data: expect.objectContaining({ status: PayoutAccountStatus.APPROVED, payableFrom: NOW, ownerType: PayoutAccountOwner.PERSON, reviewedByOpsUserId: "ops_b" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "payout_account.approved" }));
  });

  it("approves a change only for an admin, 72 hours out, replacing the old account in the same transaction", async () => {
    await expect(setup({ account: waiting({ isChange: true }) }).service.approve("pa_new", approveDto, agent, NOW)).rejects.toThrow("Solo un administrador");
    const { db, email, service } = setup({ account: waiting({ isChange: true }) });
    await service.approve("pa_new", approveDto, admin, NOW);
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { id: "pa_new", status: PayoutAccountStatus.PENDING_REVIEW }, data: expect.objectContaining({ payableFrom: new Date("2026-10-11T19:00:00.000Z") }) });
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", currency: "BOB", status: PayoutAccountStatus.APPROVED, id: { not: "pa_new" } }, data: { status: PayoutAccountStatus.REPLACED } });
    expect(email.send.mock.calls[0][0].body).toContain("11/10/2026");
  });

  it("uses the identity submission's level for a first account", async () => {
    const { db, service } = setup({ account: waiting({ kycSubmissionId: "kyc_1" }), merchantLevel: 0 });
    db.merchantKycSubmission.findFirst.mockResolvedValue({ legalName: "Tienda SRL", legalRepName: "Ana Pérez", targetLevel: 2 });
    await expect(service.approve("pa_new", approveDto, agent, NOW)).rejects.toThrow("Una cuenta de empresa");
  });

  it("refuses to decide an account that is not waiting", async () => {
    const { service } = setup({ account: waiting({ status: PayoutAccountStatus.APPROVED }) });
    await expect(service.approve("pa_new", approveDto, admin, NOW)).rejects.toThrow("Esta cuenta ya fue revisada.");
    await expect(service.reject("pa_new", "No coincide el titular", admin)).rejects.toThrow("Esta cuenta ya fue revisada.");
  });

  it("rejects with a reason, audited and emailed", async () => {
    const { db, audit, email, service } = setup({ account: waiting({ isChange: true }) });
    await service.reject("pa_new", "El titular del certificado es otra persona", agent);
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { id: "pa_new", status: PayoutAccountStatus.PENDING_REVIEW }, data: expect.objectContaining({ status: PayoutAccountStatus.REJECTED, reviewNote: "El titular del certificado es otra persona" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "payout_account.rejected" }));
    expect(email.send.mock.calls[0][0].body).toContain("El titular del certificado es otra persona");
  });

  it("rejects the first account of a rejected identity, waiting or already approved, under the lock and audited", async () => {
    const { db, audit, service } = setup();
    db.payoutAccount.findMany.mockResolvedValue([{ id: "pa_1" }]);
    await service.rejectLinkedToSubmission(db, { submissionId: "kyc_1", merchantId: "m_1", note: "Documentos ilegibles", actor: agent });
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({
      where: { kycSubmissionId: "kyc_1", isChange: false, status: { in: [PayoutAccountStatus.PENDING_REVIEW, PayoutAccountStatus.APPROVED] } },
      data: expect.objectContaining({ status: PayoutAccountStatus.REJECTED, reviewNote: "Documentos ilegibles", reviewedByOpsUserId: "ops_b" }),
    });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "payout_account.rejected", targetId: "pa_1", metadata: expect.objectContaining({ reason: "Documentos ilegibles", becauseIdentityRejected: true }) }));
  });

  it("refuses to approve an account with no identity to compare it against", async () => {
    const { db, service } = setup({ account: waiting() });
    db.merchantKycSubmission.findFirst.mockResolvedValue(null);
    await expect(service.approve("pa_new", approveDto, admin, NOW)).rejects.toThrow("Esta cuenta no tiene una verificación de identidad para comparar.");
    db.merchantKycSubmission.findFirst.mockResolvedValue({ legalName: "Ana Pérez", targetLevel: 1, status: "REJECTED" });
    await expect(setupWith(db, waiting({ kycSubmissionId: "kyc_1" })).approve("pa_new", approveDto, admin, NOW)).rejects.toThrow("Esta cuenta no tiene una verificación de identidad para comparar.");
  });

  it("never lets an approval overwrite a decision that landed first", async () => {
    const { db, service } = setup({ account: waiting() });
    db.payoutAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve("pa_new", approveDto, agent, NOW)).rejects.toThrow("Esta cuenta ya fue revisada.");
  });
});

describe("OpsPayoutAccountsController", () => {
  it("never lets a browser cache or sniff a bank proof", () => {
    const { OpsPayoutAccountsController } = jest.requireActual("./ops-payout-accounts.controller");
    const headers = Reflect.getMetadata("__headers__", OpsPayoutAccountsController.prototype.proof) as Array<{ name: string; value: string }>;
    expect(headers).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "no-store" }, { name: "X-Content-Type-Options", value: "nosniff" }]));
  });
});
