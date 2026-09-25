/**
 * pagosYa-side contract for sending transactional email — merchant dashboard
 * verification links (MerchantUserService) and customer purchase receipts
 * (PaymentIntentsService) both go through this. Modeled on
 * PaymentRailAdapter/InvoicingProvider/PayoutProvider: swap MockEmailProvider
 * for a real sender (SES, Postmark, etc.) without touching either caller.
 */
/** A file sent with the message, e.g. a cobro's PDF. */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  /** Base64-encoded bytes. */
  content: string;
}

export interface SendEmailRequest {
  /** Internal, verified store sender. Never accept this directly from a customer. */
  from?: string;
  idempotencyKey?: string;
  to: string;
  subject: string;
  /** Plain-text body; always sent, and the fallback for clients without HTML. */
  body: string;
  /** Optional HTML alternative. Callers must escape anything a merchant or customer typed. */
  html?: string;
  attachments?: EmailAttachment[];
  /** Address that should receive a human reply to the delivered message. */
  replyTo?: string;
  /**
   * Extra RFC 5322 headers to set on the outgoing message, e.g.
   * `{ "Message-ID": "<abc@pagosya>" }`. The inbox needs this: without a
   * Message-ID of our own, the shopper's reply carries no In-Reply-To we can
   * recognise and the conversation cannot be correlated back to its thread.
   * Values are passed through verbatim, so only trusted, internally built
   * strings belong here — never anything a customer typed.
   */
  headers?: Record<string, string>;
  /** Interactive flows (such as lead capture) must not report success when delivery was rejected. */
  failLoudly?: boolean;
}

export interface EmailProvider {
  send(req: SendEmailRequest): Promise<void>;
}
