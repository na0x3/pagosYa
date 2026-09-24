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

  async send(req: SendEmailRequest): Promise<void> {
    const headers = req.headers && Object.keys(req.headers).length
      ? ` headers=${Object.entries(req.headers).map(([name, value]) => `${name}: ${value}`).join("; ")}`
      : "";
    this.logger.log(`[mock email] to=${req.to}${req.replyTo ? ` replyTo=${req.replyTo}` : ""}${headers} subject="${req.subject}"\n${req.body}`);
  }
}
