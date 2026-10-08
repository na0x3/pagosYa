import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
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

  /**
   * Builds the email from the complaint as it is now, sends it to each recipient (or only `onlyTo`, for a retry) and
   * records one EMAIL_SENT or EMAIL_FAILED per recipient. Never throws. Each recipient of each send has its own
   * idempotency key — a merchant's second question, or their second user, is a different email to the provider.
   */
  async send(kind: ComplaintEmailKind, complaintId: string, onlyTo?: string): Promise<boolean> {
    const fail = (body: string, to: string) =>
      recordComplaintEvent(this.prisma, complaintId, { type: ComplaintEventType.EMAIL_FAILED, actor: ComplaintActor.SYSTEM, body, meta: { kind, to } }).catch(() => undefined);
    let recipients: string[];
    let message: { subject: string; body: string };
    let ref = "0";
    try {
      const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
      if (!complaint) return false;
      if (kind === "MERCHANT_ASKED") {
        if (!complaint.merchantId || !complaint.merchantDueAt) return false;
        const asked = await this.prisma.complaintEvent.findFirst({ where: { complaintId, type: ComplaintEventType.MERCHANT_ASKED }, orderBy: { createdAt: "desc" } });
        ref = asked?.id ?? "0";
        const users = await this.prisma.merchantUser.findMany({ where: { merchantId: complaint.merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
        recipients = users.map((user) => user.email);
        const dashboard = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4323").replace(/\/$/, "");
        message = merchantAskedEmail({ number: complaint.number, question: asked?.body ?? "", merchantDueAt: complaint.merchantDueAt, dashboardUrl: `${dashboard}/#dashboard-complaints` });
      } else {
        recipients = [complaint.buyerEmail];
        message = buyerEmail(kind, { ...complaint, trackingUrl: this.trackingUrl(complaint.id) });
      }
    } catch (error) {
      this.logger.warn(`Complaint ${complaintId} ${kind} email could not be built: ${(error as Error).message}`);
      await fail((error as Error).message, onlyTo ?? "");
      return false;
    }
    if (onlyTo) recipients = recipients.filter((to) => to === onlyTo);
    if (!recipients.length) {
      // Ops must see that nobody was told, not a silent success.
      await fail("Sin destinatarios verificados", onlyTo ?? "");
      return false;
    }
    let allSent = true;
    for (const to of recipients) {
      const key = `complaint-${complaintId}-${kind}-${ref}-${createHash("sha256").update(to).digest("hex").slice(0, 12)}`;
      try {
        await this.email.send({ to, ...message, failLoudly: true, idempotencyKey: key });
        await recordComplaintEvent(this.prisma, complaintId, { type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind, to } });
      } catch (error) {
        allSent = false;
        this.logger.warn(`Complaint ${complaintId} ${kind} email to ${to} failed: ${(error as Error).message}`);
        await fail((error as Error).message, to);
      }
    }
    return allSent;
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
