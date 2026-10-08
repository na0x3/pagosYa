import { ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintReminderJob } from "./complaint-reminder.job";

const NOW = new Date("2026-10-08T12:00:00Z");

function setup() {
  const prisma: any = {
    complaint: { findMany: jest.fn().mockResolvedValue([]) },
    complaintEvent: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const mailer = { send: jest.fn().mockResolvedValue(true), sendOpsDigest: jest.fn() };
  return { prisma, mailer, job: new ComplaintReminderJob(prisma, mailer as any) };
}

describe("ComplaintReminderJob", () => {
  it("digests open complaints due by the end of the next business day, overdue flagged", async () => {
    const { prisma, mailer, job } = setup();
    prisma.complaint.findMany.mockResolvedValue([
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), merchant: null },
      { number: "R-2026-000002", dueAt: new Date("2026-10-10T03:59:59.999Z"), merchant: { name: "Tienda" } },
    ]);
    await job.digest(NOW);
    expect(prisma.complaint.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT] }, dueAt: { lte: new Date("2026-10-10T03:59:59.999Z") } },
    }));
    expect(mailer.sendOpsDigest).toHaveBeenCalledWith([
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), overdue: true, merchantName: null },
      { number: "R-2026-000002", dueAt: new Date("2026-10-10T03:59:59.999Z"), overdue: false, merchantName: "Tienda" },
    ]);
  });

  it("re-sends each failed email kind once, unless a later send of that kind succeeded", async () => {
    const { prisma, mailer, job } = setup();
    prisma.complaintEvent.findMany.mockResolvedValue([
      { complaintId: "c1", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED", to: "ana@example.com" } },
      { complaintId: "c1", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED", to: "ana@example.com" } },
      { complaintId: "c2", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "ANSWERED", to: "beto@example.com" } },
      { complaintId: "c2", type: ComplaintEventType.EMAIL_SENT, meta: { kind: "ANSWERED", to: "beto@example.com" } },
      { complaintId: "c3", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "MERCHANT_ASKED", to: "a@tienda.bo" } },
      { complaintId: "c3", type: ComplaintEventType.EMAIL_SENT, meta: { kind: "MERCHANT_ASKED", to: "b@tienda.bo" } },
    ]);
    await job.retryFailedEmails(NOW);
    expect(mailer.send.mock.calls).toEqual([["RECEIVED", "c1", "ana@example.com"], ["MERCHANT_ASKED", "c3", "a@tienda.bo"]]);
  });

  it("skips the run when another replica holds the lock", async () => {
    const { prisma, mailer, job } = setup();
    prisma.$queryRaw.mockResolvedValue([{ locked: false }]);
    await job.run(NOW);
    expect(mailer.sendOpsDigest).not.toHaveBeenCalled();
  });
});
