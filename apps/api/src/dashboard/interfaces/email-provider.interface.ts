/**
 * pagosYa-side contract for sending transactional email — merchant dashboard
 * verification links (MerchantUserService) and customer purchase receipts
 * (PaymentIntentsService) both go through this. Modeled on
 * PaymentRailAdapter/InvoicingProvider/PayoutProvider: swap MockEmailProvider
 * for a real sender (SES, Postmark, etc.) without touching either caller.
 */
export interface SendEmailRequest {
  idempotencyKey?: string;
  to: string;
  subject: string;
  body: string;
  /** Address that should receive a human reply to the delivered message. */
  replyTo?: string;
  /** Interactive flows (such as lead capture) must not report success when delivery was rejected. */
  failLoudly?: boolean;
}

export interface EmailProvider {
  send(req: SendEmailRequest): Promise<void>;
}
