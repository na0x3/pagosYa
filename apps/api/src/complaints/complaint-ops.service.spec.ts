import { ComplaintActor, ComplaintEventType, ComplaintOutcome, ComplaintStatus, OpsRole } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { ComplaintOpsService } from "./complaint-ops.service";

const NOW = new Date("2026-10-08T19:00:00Z");
const admin = { id: "ops_admin", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_agent", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };
const ID = "cmg1abcdefghijklmnopqrstu";

function base(over = {}) {
  return { id: ID, number: "R-2026-000042", status: ComplaintStatus.IN_REVIEW, merchantId: "m_1", paymentIntentId: "pi_1", buyerEmail: "ana@example.com", extendedAt: null, dueAt: new Date("2026-10-16T03:59:59.999Z"), receivedAt: NOW, ...over };
}

function setup(complaint: any) {
  const db: any = {
    complaint: {
      findUnique: jest.fn().mockResolvedValue(complaint),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(async ({ data }) => ({ ...complaint, ...data })),
    },
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    paymentIntent: { findUnique: jest.fn().mockResolvedValue({ id: "pi_9", merchantId: "m_9" }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ id: "m_9" }) },
    complaintAttachment: { findFirst: jest.fn() },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  const audit = { record: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(true) };
  const files = { get: jest.fn() };
  const refunds = { create: jest.fn().mockResolvedValue({ id: "re_1", amount: 5000, status: "SUCCEEDED" }) };
  const settlementAdmin = { placeHold: jest.fn().mockResolvedValue({ held: true }) };
  const service = new ComplaintOpsService(db, audit as any, mailer as any, files as any, refunds as any, settlementAdmin as any);
  jest.spyOn(service, "get").mockResolvedValue({ id: complaint?.id } as any);
  return { db, audit, mailer, refunds, settlementAdmin, service };
}

describe("ComplaintOpsService", () => {
  it("take assigns the complaint and moves RECEIVED to IN_REVIEW, with history and audit", async () => {
    const { db, audit, service } = setup(base({ status: ComplaintStatus.RECEIVED }));
    await service.take(ID, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { assignedOpsUserId: "ops_agent", status: ComplaintStatus.IN_REVIEW } });
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.TAKEN, actor: ComplaintActor.OPS, actorId: "ops_agent" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "complaint.taken", targetType: "Complaint" }));
  });

  it("locks the complaint row before reading its status, so two ops actions can't both pass the check", async () => {
    const { db, service } = setup(base({ status: ComplaintStatus.RECEIVED }));
    await service.take(ID, agent);
    const sql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("FOR UPDATE");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.complaint.findUnique.mock.invocationCallOrder[0]);
  });

  it("askMerchant needs a linked merchant, sets the 2-business-day reply date and emails the merchant", async () => {
    const unlinked = setup(base({ merchantId: null }));
    await expect(unlinked.service.askMerchant(ID, "¿Enviaste el pedido?", agent, NOW)).rejects.toThrow("Vincula el reclamo a un comercio primero.");
    const { db, mailer, service } = setup(base());
    await service.askMerchant(ID, "¿Enviaste el pedido?", agent, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { status: ComplaintStatus.WAITING_MERCHANT, merchantDueAt: new Date("2026-10-13T03:59:59.999Z") } });
    expect(mailer.send).toHaveBeenCalledWith("MERCHANT_ASKED", ID);
  });

  it("only an admin extends, only once, by 5 business days from the current due date", async () => {
    await expect(setup(base()).service.extend(ID, "Esperamos al banco.", agent, NOW)).rejects.toThrow(ForbiddenException);
    await expect(setup(base({ extendedAt: NOW })).service.extend(ID, "Esperamos al banco.", admin, NOW)).rejects.toThrow("El plazo ya se extendió una vez.");
    const { db, mailer, service } = setup(base());
    await service.extend(ID, "Esperamos al banco.", admin, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { dueAt: new Date("2026-10-23T03:59:59.999Z"), extendedAt: NOW, extensionReason: "Esperamos al banco." } });
    expect(mailer.send).toHaveBeenCalledWith("EXTENDED", ID);
  });

  it("only an admin answers; the answer is final and emailed", async () => {
    await expect(setup(base()).service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, agent, NOW)).rejects.toThrow(ForbiddenException);
    const { db, mailer, service } = setup(base());
    await service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, admin, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { status: ComplaintStatus.ANSWERED, outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo.", answeredAt: NOW } });
    expect(mailer.send).toHaveBeenCalledWith("ANSWERED", ID);
    await expect(setup(base({ status: ComplaintStatus.ANSWERED })).service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "otra vez otra respuesta" }, admin, NOW)).rejects.toThrow("Este reclamo ya fue respondido.");
  });

  it("relinking to another merchant takes the question back, so the new merchant isn't shown it", async () => {
    const { db, service } = setup(base({ status: ComplaintStatus.WAITING_MERCHANT, merchantDueAt: new Date("2026-10-13T03:59:59.999Z") }));
    await service.link(ID, { paymentIntentId: "pi_9" }, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { paymentIntentId: "pi_9", merchantId: "m_9", merchantDueAt: null, status: ComplaintStatus.IN_REVIEW } });
  });

  it("refuses a merchant who doesn't own the payment already linked", async () => {
    const { service } = setup(base());
    await expect(service.link(ID, { merchantId: "m_2" }, agent)).rejects.toThrow("El pago vinculado es de otro comercio.");
  });

  it("stamps the merchant asked on the question", async () => {
    const { db, service } = setup(base());
    await service.askMerchant(ID, "¿Enviaste el pedido?", agent, NOW);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.MERCHANT_ASKED, meta: expect.objectContaining({ merchantId: "m_1" }) }) });
  });

  it("link takes the merchant from the payment when a payment is given", async () => {
    const { db, service } = setup(base({ merchantId: null, paymentIntentId: null }));
    await service.link(ID, { paymentIntentId: "pi_9" }, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { paymentIntentId: "pi_9", merchantId: "m_9" } });
  });

  it("exports a CSV that Spanish Excel opens in columns with its accents intact", async () => {
    const { db, service } = setup(null);
    db.complaint.findMany.mockResolvedValue([{ ...base(), category: "NOT_DELIVERED", request: "REFUND", outcome: null, extendedAt: null, answeredAt: null, storeNameGiven: "Panadería Ñandú", merchant: null }]);
    const csv = await service.exportCsv("2026-10-01", "2026-10-31");
    expect(csv.startsWith("\uFEFFnumero;recibido;vence;")).toBe(true);
    expect(csv).toContain(";Panadería Ñandú;");
  });

  it("marks overdue, due-soon, test and failed-email rows in the queue", async () => {
    const { db, service } = setup(null);
    db.complaint.findMany.mockResolvedValue([
      { ...base({ dueAt: new Date("2026-10-08T03:59:59.999Z") }), merchant: null, assignedOpsUser: null, paymentIntent: { livemode: false }, events: [] },
      { ...base({ id: "c2", dueAt: new Date("2026-10-10T03:59:59.999Z") }), merchant: null, assignedOpsUser: null, paymentIntent: null, events: [{ type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED" } }] },
    ]);
    const rows = await service.list({}, NOW);
    expect(rows[0]).toEqual(expect.objectContaining({ overdue: true, dueSoon: false, test: true }));
    expect(rows[1]).toEqual(expect.objectContaining({ overdue: false, dueSoon: true, emailFailed: true, test: false }));
  });
});

describe("ComplaintOpsService money actions", () => {
  const request = { amount: 2500, requestId: "req_12345678" };

  it("records a refund the rail made as REFUNDED, keyed by the console's request id", async () => {
    const { db, refunds, audit, service } = setup(base());
    refunds.create.mockResolvedValue({ id: "re_1", amount: 2500, status: "SUCCEEDED" });
    await service.refund(ID, request, admin);
    expect(refunds.create).toHaveBeenCalledWith("m_1", { paymentIntentId: "pi_1", amount: 2500, reason: "Reclamo R-2026-000042" }, `complaint-${ID}-req_12345678`);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.REFUND_REQUESTED, meta: { requestId: "req_12345678", amount: 2500 } }) });
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.REFUNDED, meta: { refundId: "re_1", amount: 2500, status: "SUCCEEDED", requestId: "req_12345678" } }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "complaint.refunded" }));
  });

  it("records a refund the rail is still processing as pending, not as done", async () => {
    const { db, refunds, service } = setup(base());
    refunds.create.mockResolvedValue({ id: "re_1", amount: 2500, status: "PENDING" });
    await service.refund(ID, request, admin);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.REFUNDED, meta: expect.objectContaining({ status: "PENDING" }) }) });
  });

  it("never records a declined refund as made, and tells ops to pay the buyer another way", async () => {
    const { db, refunds, audit, service } = setup(base());
    refunds.create.mockResolvedValue({ id: "re_1", amount: 2500, status: "FAILED", rawResponse: { error: "has no refund endpoint" } });
    await expect(service.refund(ID, request, admin)).rejects.toThrow(/transferencia manual/);
    const types = db.complaintEvent.create.mock.calls.map((call: any[]) => call[0].data.type);
    expect(types).not.toContain(ComplaintEventType.REFUNDED);
    expect(types).toContain(ComplaintEventType.REFUND_FAILED);
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "complaint.refund_failed" }));
  });

  it("never refunds twice for the same request id (a double click, or a retry after a timeout)", async () => {
    const { db, refunds, service } = setup(base());
    db.complaintEvent.findFirst.mockResolvedValue({ id: "ev_prev" });
    await expect(service.refund(ID, request, admin)).rejects.toThrow("Este reembolso ya se pidió.");
    expect(refunds.create).not.toHaveBeenCalled();
    expect(db.complaintEvent.findFirst).toHaveBeenCalledWith({ where: { complaintId: ID, type: ComplaintEventType.REFUND_REQUESTED, meta: { path: ["requestId"], equals: "req_12345678" } } });
  });

  it("locks the complaint before it checks the request id", async () => {
    const { db, service } = setup(base());
    await service.refund(ID, request, admin);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.complaintEvent.findFirst.mock.invocationCallOrder[0]);
  });

  it("refuses a refund from an agent or without a linked payment", async () => {
    await expect(setup(base()).service.refund(ID, request, agent)).rejects.toThrow(ForbiddenException);
    await expect(setup(base({ paymentIntentId: null })).service.refund(ID, request, admin)).rejects.toThrow("Vincula el reclamo a un pago primero.");
  });

  it("pauses the merchant's payouts with the case number in the reason", async () => {
    const { settlementAdmin, db, service } = setup(base());
    await service.pausePayouts(ID, "Varios reclamos de entrega", agent);
    expect(settlementAdmin.placeHold).toHaveBeenCalledWith("m_1", "Reclamo R-2026-000042: Varios reclamos de entrega", agent);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.PAYOUTS_PAUSED }) });
  });
});
