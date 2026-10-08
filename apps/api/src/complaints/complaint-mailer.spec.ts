import { ComplaintActor, ComplaintEventType } from "@prisma/client";
import { ComplaintMailer } from "./complaint-mailer";

const complaint = { id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000123", buyerName: "Ana", buyerEmail: "ana@example.com", dueAt: new Date("2026-10-16T03:59:59.999Z"), extensionReason: null, outcome: null, answer: null, merchantId: null, merchantDueAt: null };
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.merchantDashboardOrigin": "https://comercios.pagosya.bo", "app.orderTrackingSecret": "s" } as Record<string, string>)[key] };

function setup(send: jest.Mock) {
  const prisma: any = {
    complaint: { findUnique: jest.fn().mockResolvedValue(complaint) },
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, mailer: new ComplaintMailer(prisma, { send } as any, config as any) };
}

describe("ComplaintMailer", () => {
  it("sends loudly and records EMAIL_SENT", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { prisma, mailer } = setup(send);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", failLoudly: true, idempotencyKey: `complaint-${complaint.id}-RECEIVED` }));
    expect(send.mock.calls[0][0].body).toContain("https://checkout.pagosya.bo/reclamos/s/");
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind: "RECEIVED", to: "ana@example.com" } }) });
  });

  it("records EMAIL_FAILED and never throws when delivery fails", async () => {
    const { prisma, mailer } = setup(jest.fn().mockRejectedValue(new Error("Resend down")));
    jest.spyOn((mailer as any).logger, "warn").mockImplementation(() => undefined);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(false);
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_FAILED, body: "Resend down" }) });
  });
});
