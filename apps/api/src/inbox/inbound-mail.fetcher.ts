import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

/** What the webhook actually needs out of a received message. */
export interface InboundMail {
  html: string | null;
  text: string | null;
  /** Header names lowercased, because no two mail clients agree on their casing. */
  headers: Record<string, string>;
}

/**
 * Resend's `email.received` webhook carries METADATA ONLY — sender, recipient,
 * subject, the email's id and its attachment filenames. The body and the
 * headers are not in it; they are fetched afterwards with
 * `emails.receiving.get(email_id)`. So this is not an optimisation, it is the
 * only way to see what the shopper wrote and the only place In-Reply-To and
 * References exist.
 *
 * It lives behind its own provider, like ResendEmailProvider and every other
 * outside service in this codebase, so the webhook's tests can hand it a
 * message without reaching the network.
 */
@Injectable()
export class InboundMailFetcher {
  private readonly logger = new Logger(InboundMailFetcher.name);
  private readonly apiKey: string;
  // Constructed lazily for the same reason ResendEmailProvider does it: Nest
  // builds every provider in the module, and an empty key must not throw in
  // an environment where inbound mail simply is not configured.
  private resend: Resend | null = null;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>("app.email.resendApiKey") ?? "";
  }

  /**
   * Returns null when the message could not be retrieved, for any reason. The
   * caller treats that as "acknowledge and move on" rather than writing a
   * message row with an empty body and no headers, which would both show the
   * merchant a blank message and poison correlation for the rest of the thread.
   */
  async fetch(emailId: string): Promise<InboundMail | null> {
    if (!emailId) return null;
    if (!this.apiKey) {
      this.logger.warn(`Inbound mail ${emailId} not fetched: RESEND_API_KEY is not set`);
      return null;
    }
    this.resend ??= new Resend(this.apiKey);
    try {
      const { data, error } = await this.resend.emails.receiving.get(emailId);
      if (error || !data) {
        this.logger.error(`Failed to fetch inbound mail ${emailId}: ${error?.message ?? "empty response"}`);
        return null;
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(data.headers ?? {})) {
        if (typeof value === "string") headers[name.toLowerCase()] = value;
      }
      return { html: data.html ?? null, text: data.text ?? null, headers };
    } catch (error) {
      this.logger.error(`Failed to fetch inbound mail ${emailId}: ${(error as Error).message}`);
      return null;
    }
  }
}
