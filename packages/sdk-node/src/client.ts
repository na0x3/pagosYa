import {
  ConfirmPaymentIntentInput,
  CreatePaymentIntentInput,
  CreateRefundInput,
  PaymentIntent,
} from "@pagosya/shared-types";
import { HttpClient } from "./http-client";

export interface PagosYaOptions {
  /** Defaults to the production API. Point this at http://localhost:3000/v1 in dev. */
  baseUrl?: string;
}

export interface WebhookEndpoint {
  id: string;
  merchantId: string;
  url: string;
  enabledEvents: string[];
  status: string;
  createdAt: string;
}

export interface CreatedWebhookEndpoint extends WebhookEndpoint {
  /** Returned only when the endpoint is created. Store it securely. */
  secret: string;
}

export interface ApiKeySummary {
  id: string;
  mode: "TEST" | "LIVE";
  type: "SECRET" | "PUBLISHABLE";
  label: string | null;
  maskedKey: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface IssuedApiKey {
  id: string;
  /** Returned only once; pagosYa stores only a one-way hash. */
  fullKey: string;
  keyPrefix: string;
  mode: "TEST" | "LIVE";
  type: "SECRET" | "PUBLISHABLE";
  label: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  paymentIntentId: string;
  type: string;
  railId: string;
  amount: number;
  status: string;
  railReference: string | null;
  createdAt: string;
}

const DEFAULT_BASE_URL = "https://api.pagosya.bo/v1";

/**
 * Official server-side SDK. This is the whole DX pitch vs. integrating
 * against a PDF manual: `new PagosYa(secretKey)` + typed methods instead of
 * hand-rolled HTTP calls against undocumented endpoints.
 */
export class PagosYa {
  private readonly http: HttpClient;

  constructor(secretKey: string, options: PagosYaOptions = {}) {
    this.http = new HttpClient(options.baseUrl ?? DEFAULT_BASE_URL, secretKey);
  }

  paymentIntents = {
    create: (input: CreatePaymentIntentInput, opts: { idempotencyKey?: string } = {}) =>
      this.http.request<PaymentIntent>("POST", "payment_intents", { body: input, idempotencyKey: opts.idempotencyKey }),

    retrieve: (id: string) => this.http.request<PaymentIntent>("GET", `payment_intents/${id}`),

    cancel: (id: string) => this.http.request<PaymentIntent>("POST", `payment_intents/${id}/cancel`),

    /**
     * Server-side confirmation path (no widget). Authenticates with the
     * PaymentIntent's client_secret, not the merchant's secret key — mirrors
     * what the checkout iframe does, for backends that skip the widget.
     */
    confirm: (id: string, clientSecret: string, input: ConfirmPaymentIntentInput) =>
      this.http.request<{ paymentIntent: PaymentIntent; railResult: unknown }>(
        "POST",
        `payment_intents/${id}/confirm`,
        { body: input, auth: clientSecret },
      ),
  };

  refunds = {
    create: (input: CreateRefundInput, opts: { idempotencyKey: string }) =>
      this.http.request<Transaction>("POST", "refunds", { body: input, idempotencyKey: opts.idempotencyKey }),
  };

  webhookEndpoints = {
    create: (url: string, enabledEvents?: string[]) =>
      this.http.request<CreatedWebhookEndpoint>("POST", "webhook_endpoints", { body: { url, enabledEvents } }),

    list: () => this.http.request<WebhookEndpoint[]>("GET", "webhook_endpoints"),

    remove: (id: string) => this.http.request<void>("DELETE", `webhook_endpoints/${id}`),
  };

  apiKeys = {
    list: () => this.http.request<ApiKeySummary[]>("GET", "api_keys"),

    create: (input: { type: "SECRET" | "PUBLISHABLE"; mode: "TEST" | "LIVE"; label?: string }) =>
      this.http.request<IssuedApiKey>("POST", "api_keys", { body: input }),

    rotate: (id: string) => this.http.request<IssuedApiKey>("POST", `api_keys/${id}/rotate`),

    revoke: (id: string) => this.http.request<void>("DELETE", `api_keys/${id}`),
  };
}
