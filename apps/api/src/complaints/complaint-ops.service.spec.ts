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
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    paymentIntent: { findUnique: jest.fn().mockResolvedValue({ id: "pi_9", merchantId: "m_9" }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ id: "m_9" }) },
    complaintAttachment: { findFirst: jest.fn() },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  const audit = { record: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(true) };
  const files = { get: jest.fn() };
  const refunds = { create: jest.fn().mockResolvedValue({ id: "re_1", amount: 5000 }) };
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

  it("link takes the merchant from the payment when a payment is given", async () => {
    const { db, service } = setup(base({ merchantId: null, paymentIntentId: null }));
    await service.link(ID, { paymentIntentId: "pi_9" }, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { paymentIntentId: "pi_9", merchantId: "m_9" } });
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
