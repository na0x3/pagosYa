export type DlocalPaymentStatus = "PENDING" | "PAID" | "AUTHORIZED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "VERIFIED";

export interface DlocalPayment {
  id: string;
  amount: number;
  currency: string;
  country?: string;
  payment_method_id?: string;
  status: DlocalPaymentStatus;
  status_detail?: string;
  status_code?: string;
  redirect_url?: string;
  order_id?: string;
}

export interface DlocalPaymentMethod {
  id: string;
  type: string;
  name: string;
  logo?: string;
  allowed_flows?: string[];
}

export interface CreateDlocalPayment {
  orderId: string;
  amountCents: number;
  currency: "USD";
  country: string;
  paymentMethodId: string;
  flow: "DIRECT" | "REDIRECT";
  payer: { name: string; email: string; document?: string };
  cardToken?: string;
  callbackUrl: string;
}

export interface DlocalRefund {
  id: string;
  status: string;
}

/** Body dLocal POSTs to the refunds notification_url. Refund statuses are their own enum. */
export interface DlocalRefundNotification {
  id?: string;
  payment_id?: string;
  status?: "SUCCESS" | "PENDING" | "REJECTED" | string;
  status_code?: string | number;
  status_detail?: string;
  amount?: number;
  currency?: string;
}

export interface DlocalTransport {
  request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T>;
}

/** retryable = the outcome is unknown (timeout/5xx), so a payment must not be marked failed. */
export class DlocalApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DlocalApiError";
  }
}
