import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { BanecoQrConfig } from "../../../config/configuration";

export interface GenerateQrParams {
  transactionId: string;
  amount: number;
  currency: "BOB" | "USD";
  description?: string;
  dueDate: string; // yyyy-MM-dd
  singleUse: boolean;
  modifyAmount: boolean;
  branchCode?: string;
}

export interface GenerateQrResult {
  qrId: string;
  qrImage: string; // base64 PNG
}

export interface PaymentQr {
  qrId: string;
  transactionId: string;
  paymentDate: string;
  paymentTime: string;
  currency: "BOB" | "USD";
  amount: number;
  senderBankCode: string;
  senderName: string;
  senderAccount: string;
  description?: string;
  branchCode?: string;
}

export interface StatusQrResult {
  statusQRCode: 0 | 1 | 9; // 0 pending, 1 paid, 9 canceled
  payment?: PaymentQr[];
}

class BanecoApiError extends Error {
  constructor(
    message: string,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = "BanecoApiError";
  }
}

/**
 * Thin client for Banco Económico's "API Market" QR Simple product
 * (Especificaciones Técnicas v1.3.0, §5-7). Kept separate from
 * BanecoQrAdapter so the HTTP/auth/encryption plumbing can be reused if
 * other Baneco products (account inquiries, batch payouts — §8-9) get
 * wired in later, without touching the PaymentRailAdapter surface.
 */
@Injectable()
export class BanecoClientService {
  private readonly logger = new Logger(BanecoClientService.name);
  private tokenCache: { token: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get cfg(): BanecoQrConfig {
    return this.config.get<BanecoQrConfig>("app.banecoQr")!;
  }

  /** Baneco exposes its own AES-256 encrypt/decrypt as an HTTP service (§5) — calling it
   * out avoids having to guess the bank's exact cipher mode/padding locally. */
  async encrypt(text: string): Promise<string> {
    const url = new URL(`${this.cfg.baseUrl}/api/authentication/encrypt`);
    url.searchParams.set("text", text);
    url.searchParams.set("aesKey", this.cfg.aesKey);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new BanecoApiError(`Baneco encrypt failed: HTTP ${response.status}`);
    return (await response.text()).replace(/^"|"$/g, "");
  }

  private async authenticate(): Promise<string> {
    const encryptedPassword = await this.encrypt(this.cfg.password);
    const response = await fetch(`${this.cfg.baseUrl}/api/authentication/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: this.cfg.username, password: encryptedPassword }),
    });
    const body = (await response.json()) as { token?: string; responseCode?: number; message?: string };
    if (!response.ok || !body.token || body.responseCode) {
      throw new BanecoApiError(body.message ?? `Baneco authenticate failed: HTTP ${response.status}`, body.responseCode);
    }

    this.tokenCache = { token: body.token, expiresAtMs: Date.now() + this.jwtTtlMs(body.token) };
    return body.token;
  }

  /** JWT `exp` claim, minus a safety margin; falls back to a short TTL if the token can't be parsed. */
  private jwtTtlMs(token: string): number {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
      if (payload.exp) return Math.max(payload.exp * 1000 - Date.now() - 30_000, 10_000);
    } catch {
      this.logger.warn("Could not parse Baneco JWT exp claim, using default TTL");
    }
    return 5 * 60_000;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAtMs > Date.now()) return this.tokenCache.token;
    return this.authenticate();
  }

  private async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (response.status === 401 && !isRetry) {
      this.tokenCache = null;
      return this.request<T>(path, init, true);
    }

    const body = (await response.json()) as { responseCode?: number; message?: string } & Record<string, unknown>;
    if (!response.ok || body.responseCode) {
      throw new BanecoApiError(body.message ?? `Baneco request to ${path} failed: HTTP ${response.status}`, body.responseCode);
    }
    return body as T;
  }

  async generateQr(params: GenerateQrParams): Promise<GenerateQrResult> {
    const encryptedAccount = await this.encrypt(this.cfg.creditAccount);
    return this.request<GenerateQrResult>("/api/qrsimple/generateQR", {
      method: "POST",
      body: JSON.stringify({
        transactionId: params.transactionId,
        accountCredit: encryptedAccount,
        currency: params.currency,
        amount: params.amount,
        description: params.description,
        dueDate: params.dueDate,
        singleUse: params.singleUse,
        modifyAmount: params.modifyAmount,
        branchCode: params.branchCode,
      }),
    });
  }

  async cancelQr(qrId: string): Promise<void> {
    await this.request("/api/qrsimple/cancelQR", { method: "DELETE", body: JSON.stringify({ qrId }) });
  }

  async statusQr(qrId: string): Promise<StatusQrResult> {
    return this.request<StatusQrResult>(`/api/qrsimple/v2/statusQR/${qrId}`, { method: "GET" });
  }
}

export { BanecoApiError };
