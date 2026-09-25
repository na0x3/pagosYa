import { Injectable, Logger } from "@nestjs/common";
import { EmailProvider, SendEmailRequest } from "../interfaces/email-provider.interface";

/**
 * Default when RESEND_API_KEY isn't set (see DashboardModule/ResendEmailProvider).
 * Logs instead of sending, so local dev/testing can read the verification
 * link straight out of the API server's console without needing real email.
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);
  /** The last messages "sent", newest last, so local runs and tests can read them back. */
  readonly recent: SendEmailRequest[] = [];

  async send(req: SendEmailRequest): Promise<void> {
    this.recent.push(req);
    if (this.recent.length > 20) this.recent.splice(0, this.recent.length - 20);
    const headers = req.headers && Object.keys(req.headers).length
      ? ` headers=${Object.entries(req.headers).map(([name, value]) => `${name}: ${value}`).join("; ")}`
      : "";
    const html = req.html ? ` html=${req.html.length} chars` : "";
    const attachments = req.attachments?.length
      ? ` attachments=${req.attachments.map((file) => `${file.filename} (${file.contentType}, ${Buffer.from(file.content, "base64").length} bytes)`).join(", ")}`
      : "";
    this.logger.log(`[mock email] to=${req.to}${req.replyTo ? ` replyTo=${req.replyTo}` : ""}${headers}${html}${attachments} subject="${req.subject}"\n${req.body}`);
  }
}
