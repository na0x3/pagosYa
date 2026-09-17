import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentMethodType } from "@prisma/client";
import type { DlocalConfig } from "../../../config/configuration";
import {
  PaymentRailAdapter, RailAuthorizeRequest, RailCaptureRequest, RailRefundRequest, RailResult,
} from "../../interfaces/payment-rail-adapter.interface";
import { DlocalClientService } from "./dlocal-client.service";
import { DlocalApiError, DlocalPayment } from "./dlocal.types";

const SMART_FIELDS_PREFIX = "dlsf_";

@Injectable()
export class DlocalAdapter implements PaymentRailAdapter {
  readonly railId = "dlocal" as const;
  readonly explicitOnly = true;
  readonly supportedMethodTypes: PaymentMethodType[] = [PaymentMethodType.CARD, PaymentMethodType.LOCAL_METHOD];
  private readonly logger = new Logger(DlocalAdapter.name);

  constructor(
    private readonly client: DlocalClientService,
    private readonly config: ConfigService,
  ) {}

  toRailResult(payment: DlocalPayment): RailResult {
    const raw = { ...payment } as Record<string, unknown>;
    switch (payment.status) {
      case "PAID":
      case "AUTHORIZED":
        return { status: "succeeded", railReference: payment.id, raw };
      case "PENDING":
        return payment.redirect_url
          ? { status: "requires_action", railReference: payment.id, raw, actionRequired: { type: "redirect", data: { redirectUrl: payment.redirect_url } } }
          : { status: "pending", railReference: payment.id, raw };
      default:
        // failureReason is shown to shoppers, so it's Spanish; dLocal's own
        // status_detail (English, provider wording) stays in raw for ops.
        return {
          status: "failed",
          railReference: payment.id,
          raw,
          failureReason:
            payment.status === "REJECTED" ? "El pago fue rechazado."
            : payment.status === "CANCELLED" ? "El pago fue cancelado o expiró."
            : "No se pudo completar el pago.",
        };
    }
  }

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    const methodId = req.paymentMethod.metadata?.dlocalPaymentMethodId;
    const invalid =
      req.currency !== "USD" ? `dLocal solo cobra en USD, recibió ${req.currency}`
      : !req.country ? "Falta el país del comprador"
      : !/^[A-Z]{2}$/.test(req.country) ? "El país del comprador no es válido"
      : typeof methodId !== "string" || !methodId ? "Falta el método de pago internacional"
      : null;
    if (invalid) return { status: "failed", railReference: req.idempotencyKey, raw: {}, failureReason: invalid };

    const cfg = this.config.get<DlocalConfig>("app.dlocal")!;
    // A Smart Fields token can only come from dLocal's hosted card fields, which need
    // the Smart Fields key. Without it the token is forged or a fixture leftover.
    if (req.paymentMethod.token.startsWith(SMART_FIELDS_PREFIX) && !cfg.smartFieldsKey) {
      return { status: "failed", railReference: req.idempotencyKey, raw: {}, failureReason: "El pago con tarjeta internacional no está disponible." };
    }
    const callbackUrl = new URL(cfg.returnUrl);
    callbackUrl.searchParams.set("intl_return", "1");
    callbackUrl.searchParams.set("pi", req.paymentIntentId);
    const cardToken =
      req.paymentMethod.type === PaymentMethodType.CARD && req.paymentMethod.token.startsWith(SMART_FIELDS_PREFIX)
        ? req.paymentMethod.token.slice(SMART_FIELDS_PREFIX.length)
        : undefined;

    try {
      const payment = await this.client.createPayment({
        orderId: req.paymentIntentId,
        amountCents: req.amount,
        currency: "USD",
        country: req.country!,
        paymentMethodId: methodId as string,
        flow: cardToken ? "DIRECT" : "REDIRECT",
        payer: req.payer ?? { name: "", email: "" },
        cardToken,
        callbackUrl: callbackUrl.toString(),
      });
      return this.toRailResult(payment);
    } catch (error) {
      if (error instanceof DlocalApiError && error.retryable) {
        this.logger.warn(`dLocal outcome unknown for ${req.paymentIntentId}; waiting for webhook`);
        return { status: "pending", railReference: `order:${req.paymentIntentId}`, raw: { error: error.message } };
      }
      return { status: "failed", railReference: req.idempotencyKey, raw: { error: (error as Error).message }, failureReason: (error as Error).message };
    }
  }

  /** dLocal captures on payment; capture only reports the current state. */
  async capture(req: RailCaptureRequest): Promise<RailResult> {
    return this.getStatus(req.railReference);
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    try {
      const refund = await this.client.refund(req.railReference, req.amount, "USD", req.idempotencyKey);
      const status = refund.status === "SUCCESS" ? "succeeded" : refund.status === "REJECTED" ? "failed" : "pending";
      return { status, railReference: refund.id, raw: { ...refund } };
    } catch (error) {
      if (error instanceof DlocalApiError && error.retryable) {
        this.logger.warn(`dLocal refund outcome unknown for ${req.railReference}; waiting for webhook`);
        return { status: "pending", railReference: `refund:${req.railReference}`, raw: { error: error.message } };
      }
      return { status: "failed", railReference: req.idempotencyKey, raw: { error: (error as Error).message }, failureReason: (error as Error).message };
    }
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return this.toRailResult(await this.client.getPayment(railReference));
  }
}
