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
    this.logger.log(`[mock email] to=${req.to}${req.replyTo ? ` replyTo=${req.replyTo}` : ""} subject="${req.subject}"\n${req.body}`);
  }
}
