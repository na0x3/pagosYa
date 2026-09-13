import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { EmailProvider, SendEmailRequest } from "../interfaces/email-provider.interface";

/**
 * Real sender, used in place of MockEmailProvider once RESEND_API_KEY is set
 * (see DashboardModule). Note: a Resend account without a verified sending
 * domain is restricted to sandbox mode, which only delivers to the account's
 * own verified address — arbitrary merchant emails will fail to send until a
 * domain (e.g. pagosya.bo) is verified at resend.com/domains.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey: string;
  private readonly fromAddress: string;
  // Nest instantiates every provider in the module regardless of which one
  // DashboardModule's factory ends up selecting — constructing the Resend
  // client eagerly here would throw on an empty key even when this provider
  // is never actually used (i.e. whenever MockEmailProvider is selected).
  private resend: Resend | null = null;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>("app.email.resendApiKey") ?? "";
    this.fromAddress = config.get<string>("app.email.fromAddress")!;
  }

  async send(req: SendEmailRequest): Promise<void> {
    this.resend ??= new Resend(this.apiKey);
    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: req.to,
      subject: req.subject,
      text: req.body,
      ...(req.replyTo ? { replyTo: req.replyTo } : {}),
    }, req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : undefined);
    if (error) {
      // Matches the rest of the app's outbox/worker pattern: log and let the
      // caller's retry path (email verification can just be re-triggered by
      // a fresh signup call) handle it, rather than throwing mid-request.
      this.logger.error(`Failed to send email to=${req.to} subject="${req.subject}": ${error.message}`);
      if (req.failLoudly) throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}
