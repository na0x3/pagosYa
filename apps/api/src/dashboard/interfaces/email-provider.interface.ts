/**
 * pagosYa-side contract for sending transactional email (just verification
 * links today). Modeled on PaymentRailAdapter/InvoicingProvider/PayoutProvider:
 * swap MockEmailProvider for a real sender (SES, Postmark, etc.) once one
 * exists, without touching MerchantUserService.
 */
export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  send(req: SendEmailRequest): Promise<void>;
}
