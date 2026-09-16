import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DlocalConfig } from "../../../config/configuration";
import { signDlocal, verifyDlocalSignature } from "./dlocal-signature";
import { DlocalFixtureTransport } from "./dlocal-fixture-transport";
import {
  CreateDlocalPayment, DlocalApiError, DlocalPayment, DlocalPaymentMethod, DlocalRefund, DlocalTransport,
} from "./dlocal.types";

/**
 * Thin client for dLocal's Payins API. Signing and major/minor unit
 * conversion live here so DlocalAdapter only speaks RailResult.
 */
@Injectable()
export class DlocalClientService {
  private readonly logger = new Logger(DlocalClientService.name);
  private readonly fixture = new DlocalFixtureTransport();

  constructor(private readonly config: ConfigService) {}

  private get cfg(): DlocalConfig {
    return this.config.get<DlocalConfig>("app.dlocal")!;
  }

  private get transport(): DlocalTransport {
    return this.cfg.enabled ? { request: (m, p, b) => this.http(m, p, b) } : this.fixture;
  }

  createPayment(p: CreateDlocalPayment): Promise<DlocalPayment> {
    return this.transport.request<DlocalPayment>("POST", "/payments", {
      amount: p.amountCents / 100,
      currency: p.currency,
      country: p.country,
      payment_method_id: p.paymentMethodId,
      payment_method_flow: p.flow,
      payer: p.payer,
      order_id: p.orderId,
      notification_url: this.cfg.notificationUrl,
      callback_url: p.callbackUrl,
      ...(p.cardToken ? { card: { token: p.cardToken } } : {}),
    });
  }

  getPayment(id: string): Promise<DlocalPayment> {
    return this.transport.request<DlocalPayment>("GET", `/payments/${encodeURIComponent(id)}`);
  }

  refund(paymentId: string, amountCents: number, currency: string): Promise<DlocalRefund> {
    return this.transport.request<DlocalRefund>("POST", "/refunds", {
      payment_id: paymentId,
      amount: amountCents / 100,
      currency,
      notification_url: this.cfg.notificationUrl,
    });
  }

  listPaymentMethods(country: string): Promise<DlocalPaymentMethod[]> {
    return this.transport.request<DlocalPaymentMethod[]>("GET", `/payments-methods?country=${encodeURIComponent(country)}`);
  }

  /** In fixture mode there is no secret, so real inbound webhooks are always rejected. */
  verifyWebhook(login: string | undefined, xDate: string | undefined, rawBody: string, authorization: string | undefined): boolean {
    if (!this.cfg.enabled || !login || !xDate || login !== this.cfg.login) return false;
    return verifyDlocalSignature(this.cfg.secretKey, login, xDate, rawBody, authorization);
  }

  private async http<T>(method: "GET" | "POST", requestPath: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const xDate = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const response = await fetch(`${this.cfg.baseUrl}${requestPath}`, {
        method,
        signal: controller.signal,
        headers: {
          "X-Date": xDate,
          "X-Login": this.cfg.login,
          "X-Trans-Key": this.cfg.transKey,
          "X-Version": "2.1",
          "Content-Type": "application/json",
          "User-Agent": "pagosYa/1.0",
          Authorization: `V2-HMAC-SHA256, Signature: ${signDlocal(this.cfg.secretKey, this.cfg.login, xDate, payload)}`,
        },
        ...(method === "POST" ? { body: payload } : {}),
      });
      const text = await response.text();
      const parsed = (text ? JSON.parse(text) : {}) as T & { message?: string };
      if (!response.ok) {
        throw new DlocalApiError(parsed.message ?? `dLocal ${method} ${requestPath} failed: HTTP ${response.status}`, response.status, response.status >= 500);
      }
      return parsed;
    } catch (error) {
      if (error instanceof DlocalApiError) throw error;
      const aborted = (error as Error).name === "AbortError";
      this.logger.warn(`dLocal ${method} ${requestPath} ${aborted ? "timed out" : "network error"}: ${(error as Error).message}`);
      throw new DlocalApiError(aborted ? "dLocal request timed out" : "dLocal network error", 0, true);
    } finally {
      clearTimeout(timer);
    }
  }
}
