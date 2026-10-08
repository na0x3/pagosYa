import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { addBusinessDays } from "./complaint-dates";
import { ComplaintMailer } from "./complaint-mailer";
import type { ComplaintEmailKind } from "./complaint-emails";
import { unresolvedEmailFailures } from "./complaint-ops.service";

const RETRY_WINDOW_MS = 14 * 24 * 60 * 60_000;

/** 08:00 La Paz: tell ops what is due by the next business day and retry buyer/merchant emails that failed. */
@Injectable()
export class ComplaintReminderJob {
  private readonly logger = new Logger(ComplaintReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: ComplaintMailer) {}

  /** Same single-runner pattern as PayoutScheduleJob: a transaction-scoped advisory lock held while the work runs. */
  @Cron("0 8 * * *", { name: "complaint-reminders", timeZone: "America/La_Paz" })
  async run(now = new Date()): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('complaint-reminders')) AS locked`;
          if (!lock?.locked) return;
          await this.digest(now).catch((error) => this.logger.error(`Complaint digest failed: ${(error as Error).message}`));
          await this.retryFailedEmails(now).catch((error) => this.logger.error(`Complaint email retry failed: ${(error as Error).message}`));
        },
        { timeout: 10 * 60_000 },
      );
    } catch (error) {
      this.logger.error(`Complaint reminders failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async digest(now: Date): Promise<void> {
    const rows = await this.prisma.complaint.findMany({
      where: { status: { in: [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT] }, dueAt: { lte: addBusinessDays(now, 1) } },
      orderBy: { dueAt: "asc" },
      select: { number: true, dueAt: true, merchant: { select: { name: true } } },
    });
    await this.mailer.sendOpsDigest(rows.map((row) => ({ number: row.number, dueAt: row.dueAt, overdue: row.dueAt.getTime() < now.getTime(), merchantName: row.merchant?.name ?? null })));
  }

  async retryFailedEmails(now: Date): Promise<void> {
    const events = await this.prisma.complaintEvent.findMany({
      where: { type: { in: [ComplaintEventType.EMAIL_FAILED, ComplaintEventType.EMAIL_SENT] }, createdAt: { gte: new Date(now.getTime() - RETRY_WINDOW_MS) } },
      orderBy: { createdAt: "asc" },
      select: { complaintId: true, type: true, meta: true },
    });
    const byComplaint = new Map<string, typeof events>();
    for (const event of events) byComplaint.set(event.complaintId, [...(byComplaint.get(event.complaintId) ?? []), event]);
    for (const [complaintId, list] of byComplaint) {
      for (const { kind, to } of unresolvedEmailFailures(list)) await this.mailer.send(kind as ComplaintEmailKind, complaintId, to || undefined);
    }
  }
}
