import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintMerchantService } from "./complaint-merchant.service";

const NOW = new Date("2026-10-12T15:00:00Z");
const row = {
  id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000042", status: ComplaintStatus.WAITING_MERCHANT, category: "NOT_DELIVERED", request: "REFUND",
  description: "Nunca llegó.", buyerName: "Ana", buyerEmail: "ana@example.com", buyerPhone: "70000000", receivedAt: NOW, merchantId: "m_1",
  merchantDueAt: new Date("2026-10-13T03:59:59.999Z"), paymentIntent: { id: "pi_1", amount: 5000, currency: "BOB", createdAt: NOW },
  events: [
    { id: "e1", type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: "Nunca llegó.", createdAt: NOW, meta: null, attachments: [{ id: "a1", fileName: "foto.jpg", contentType: "image/jpeg", sizeBytes: 10, uploadedBy: ComplaintActor.BUYER }] },
    { id: "e2", type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, body: "nota interna", createdAt: NOW, meta: null, attachments: [] },
    { id: "e3", type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, body: "¿Enviaste el pedido?", createdAt: NOW, meta: { merchantId: "m_1" }, attachments: [] },
  ],
};

function setup(found: any) {
  const db: any = {
    complaint: { findFirst: jest.fn().mockResolvedValue(found), findUnique: jest.fn().mockResolvedValue(found), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    complaintEvent: { create: jest.fn(async ({ data }) => ({ id: "e_new", ...data })) },
    complaintAttachment: { create: jest.fn(), findFirst: jest.fn() },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  return { db, service: new ComplaintMerchantService(db, { put: jest.fn(), get: jest.fn() } as any) };
}

describe("ComplaintMerchantService", () => {
  it("only finds complaints linked to this merchant that ops has sent them", async () => {
    const { db, service } = setup(row);
    await service.get("m_1", row.id);
    expect(db.complaint.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: row.id, merchantId: "m_1", merchantDueAt: { not: null } } }));
  });

  it("is a 404 for another merchant's complaint", async () => {
    const { service } = setup(null);
    await expect(service.get("m_2", row.id)).rejects.toThrow("Reclamo no encontrado");
    await expect(service.reply("m_2", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], NOW)).rejects.toThrow("Reclamo no encontrado");
  });

  it("never shows internal notes, the buyer's email or phone", async () => {
    const { service } = setup(row);
    const detail = JSON.stringify(await service.get("m_1", row.id));
    expect(detail).not.toContain("nota interna");
    expect(detail).not.toContain("ana@example.com");
    expect(detail).not.toContain("70000000");
    expect(detail).toContain("¿Enviaste el pedido?");
  });

  it("records a reply, marks it late after the reply-by date, and hands the complaint back to ops", async () => {
    const { db, service } = setup(row);
    await service.reply("m_1", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], new Date("2026-10-13T12:00:00Z"));
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: row.id }, data: { status: ComplaintStatus.IN_REVIEW } });
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, actorId: "mu_1", meta: { late: true, merchantId: "m_1" } }) });
  });

  it("shows a merchant only the questions, replies and files that were theirs, after a relink", async () => {
    const theirs = { ...row, events: [
      row.events[0],
      { id: "q0", type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, body: "pregunta al comercio anterior", createdAt: NOW, meta: { merchantId: "m_0" }, attachments: [] },
      { id: "r0", type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, body: "respuesta del comercio anterior", createdAt: NOW, meta: { late: false, merchantId: "m_0" }, attachments: [{ id: "a0", fileName: "otro.pdf", contentType: "application/pdf", sizeBytes: 9, uploadedBy: ComplaintActor.MERCHANT }] },
      { id: "q1", type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, body: "¿Enviaste el pedido?", createdAt: NOW, meta: { merchantId: "m_1" }, attachments: [] },
    ] };
    const { db, service } = setup(theirs);
    const detail = await service.get("m_1", row.id);
    expect(detail.questions.map((q: any) => q.body)).toEqual(["¿Enviaste el pedido?"]);
    expect(detail.replies).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain("otro.pdf");
    db.complaintAttachment.findFirst.mockResolvedValue({ id: "a0", complaintId: row.id, uploadedBy: ComplaintActor.MERCHANT, storageKey: "k", fileName: "otro.pdf", contentType: "application/pdf", event: { meta: { merchantId: "m_0" } } });
    await expect(service.attachment("m_1", row.id, "a0")).rejects.toThrow("Archivo no encontrado");
  });

  it("refuses a reply that lands after ops answered, even when it passed the first check", async () => {
    const { db, service } = setup(row);
    db.complaint.findUnique.mockResolvedValue({ status: ComplaintStatus.ANSWERED, merchantId: "m_1" });
    await expect(service.reply("m_1", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], NOW)).rejects.toThrow("Este reclamo ya fue respondido.");
    expect(db.complaint.update).not.toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it("refuses a reply nobody asked for", async () => {
    const { service } = setup({ ...row, status: ComplaintStatus.IN_REVIEW });
    await expect(service.reply("m_1", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], NOW)).rejects.toThrow("No hay una consulta pendiente para el comercio.");
  });
});
