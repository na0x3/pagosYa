import { Injectable, Logger } from "@nestjs/common";
import { PaymentMethodType } from "@prisma/client";
import {
  PaymentRailAdapter,
  RailAuthorizeRequest,
  RailCaptureRequest,
  RailRefundRequest,
  RailResult,
} from "../../interfaces/payment-rail-adapter.interface";
import { BanecoClientService } from "./baneco-client.service";

/**
 * Real QR rail against Banco Económico's "API Market" (Especificaciones
 * Técnicas v1.3.0). Money settles directly into `BANECO_CREDIT_ACCOUNT` when
 * the payer scans and pays — there is no separate capture step, and the
 * documented API has no refund endpoint (§7-9 only cover QR generate/cancel/
 * status, account inquiries, and batch *disbursements*), so a QR refund
 * would have to be a manual bank transfer today.
 *
 * `transactionId` sent to Baneco is always our own PaymentIntent id, so the
 * inbound webhook (BanecoQrWebhookController) can map Baneco's payment
 * notification straight back without a side table.
 *
 * This is intentionally the *only* adapter that knows about Baneco specifically
 * — swap banks later by writing a new class next to this one and flipping
 * which adapter RailsModule registers for PaymentMethodType.QR.
 */
@Injectable()
export class BanecoQrAdapter implements PaymentRailAdapter {
  readonly railId = "baneco_qr" as const;
  readonly supportedMethodTypes = [PaymentMethodType.QR];

  private readonly logger = new Logger(BanecoQrAdapter.name);

  constructor(private readonly client: BanecoClientService) {}

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    if (req.currency !== "BOB" && req.currency !== "USD") {
      return {
        status: "failed",
        railReference: req.idempotencyKey,
        raw: {},
        failureReason: `Baneco QR only supports BOB/USD, got ${req.currency}`,
      };
    }

    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const { qrId, qrImage } = await this.client.generateQr({
        transactionId: req.paymentIntentId,
        amount: req.amount,
        currency: req.currency,
        description: `pagosYa ${req.paymentIntentId}`,
        dueDate,
        singleUse: true,
        modifyAmount: false,
      });

      return {
        status: "requires_action",
        railReference: qrId,
        raw: { qrId },
        actionRequired: { type: "qr_display", data: { qrId, qrImageBase64: qrImage } },
      };
    } catch (err) {
      this.logger.error(`Baneco generateQR failed for ${req.paymentIntentId}`, err);
      return {
        status: "failed",
        railReference: req.idempotencyKey,
        raw: {},
        failureReason: (err as Error).message,
      };
    }
  }

  /** No separate capture step — a scanned QR settles immediately; this is unreachable
   * in the current flow (see PaymentIntentsService, which never calls rail.capture()). */
  async capture(req: RailCaptureRequest): Promise<RailResult> {
    return { status: "succeeded", railReference: req.railReference, raw: {} };
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    return {
      status: "failed",
      railReference: req.railReference,
      raw: {},
      failureReason: "Baneco QR Simple has no refund endpoint — issue a manual bank transfer instead",
    };
  }

  async getStatus(railReference: string): Promise<RailResult> {
    const result = await this.client.statusQr(railReference);
    const status = result.statusQRCode === 1 ? "succeeded" : result.statusQRCode === 9 ? "failed" : "requires_action";
    return { status, railReference, raw: { statusQRCode: result.statusQRCode, payment: result.payment } };
  }
}
