import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplaintActor, ComplaintEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { buyerEmail, merchantAskedEmail, opsDigestEmail, type ComplaintEmailKind } from "./complaint-emails";
import { createComplaintToken } from "./complaint-token";
import { recordComplaintEvent } from "./complaint-events";

@Injectable()
export class ComplaintMailer {
  private readonly logger = new Logger(ComplaintMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  trackingUrl(complaintId: string): string {
    const origin = (this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "");
    return `${origin}/reclamos/s/${createComplaintToken(complaintId, this.config.get<string>("app.orderTrackingSecret") ?? "")}`;
  }

  /** Builds the email from the complaint as it is now, sends it and records the outcome. Never throws. */
  async send(kind: ComplaintEmailKind, complaintId: string): Promise<boolean> {
    let recipients: string[] = [];
    try {
      const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
      if (!complaint) return false;
      let message: { subject: string; body: string };
      if (kind === "MERCHANT_ASKED") {
        if (!complaint.merchantId || !complaint.merchantDueAt) return false;
        const asked = await this.prisma.complaintEvent.findFirst({ where: { complaintId, type: ComplaintEventType.MERCHANT_ASKED }, orderBy: { createdAt: "desc" } });
        const users = await this.prisma.merchantUser.findMany({ where: { merchantId: complaint.merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
        recipients = users.map((user) => user.email);
        const dashboard = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4323").replace(/\/$/, "");
        message = merchantAskedEmail({ number: complaint.number, question: asked?.body ?? "", merchantDueAt: complaint.merchantDueAt, dashboardUrl: `${dashboard}/#dashboard-complaints` });
      } else {
        recipients = [complaint.buyerEmail];
        message = buyerEmail(kind, { ...complaint, trackingUrl: this.trackingUrl(complaint.id) });
      }
      for (const to of recipients) {
        await this.email.send({ to, ...message, failLoudly: true, idempotencyKey: `complaint-${complaint.id}-${kind}` });
        await recordComplaintEvent(this.prisma, complaintId, { type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind, to } });
      }
      return true;
    } catch (error) {
      this.logger.warn(`Complaint ${complaintId} ${kind} email failed: ${(error as Error).message}`);
      await recordComplaintEvent(this.prisma, complaintId, {
        type: ComplaintEventType.EMAIL_FAILED,
        actor: ComplaintActor.SYSTEM,
        body: (error as Error).message,
        meta: { kind, to: recipients.join(",") },
      }).catch(() => undefined);
      return false;
    }
  }

  async sendOpsDigest(items: Array<{ number: string; dueAt: Date; overdue: boolean; merchantName: string | null }>): Promise<void> {
    if (!items.length) return;
    const message = opsDigestEmail(items);
    const opsUsers = await this.prisma.opsUser.findMany({ where: { revokedAt: null }, select: { email: true } });
    for (const { email } of opsUsers) {
      await this.email.send({ to: email, ...message }).catch((error) => this.logger.warn(`Complaint digest to ${email} failed: ${(error as Error).message}`));
    }
  }
}
